-- ============================================================================
-- Migration: 20260920110000_staff_operations_trusted_rpc.sql
-- Description: Trusted Staff Authorization and Operations RPCs for TV7 (PR #9).
-- Architecture Reference: docs/PROJECT_GUIDE.md, docs/ARCHITECTURE.md
--
-- Security & Access Control:
-- 1. Eliminates insecure authorization via client/user_metadata.
-- 2. Authoritative role check against database table public.staff_roles (role IN ('staff', 'admin')).
-- 3. Provides SECURITY DEFINER trusted write RPCs:
--    - public.update_room_operational_status (validates and updates public.room_operations)
--    - public.update_ticket_status (validates and updates public.tickets)
-- 4. Provides SECURITY DEFINER trusted read RPC:
--    - public.get_staff_dashboard_data() (returns room_operations, tickets, today_bookings)
-- 5. Strict least privilege: no GRANT ALL to authenticated; guest users cannot direct-write.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Cleanup Legacy / Deprecated Functions or Parallel Tables
-- ----------------------------------------------------------------------------

-- Ensure parallel support_tickets table is removed if created previously
DROP TABLE IF EXISTS public.support_tickets CASCADE;

-- Drop legacy / replaced functions if they exist
DROP FUNCTION IF EXISTS public.is_staff(UUID);
DROP FUNCTION IF EXISTS public.update_room_cleaning_status(UUID, TEXT);
DROP FUNCTION IF EXISTS public.update_ticket_status(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.update_ticket_status(UUID, TEXT);
DROP FUNCTION IF EXISTS public.get_staff_dashboard_data();

-- ----------------------------------------------------------------------------
-- 1. Staff Roles Table & RLS Policy (Minimal Role Model: staff | admin)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.staff_roles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('staff', 'admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.staff_roles ENABLE ROW LEVEL SECURITY;

-- Explicit least privilege: revoke all from public / anon / authenticated
REVOKE ALL ON TABLE public.staff_roles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.staff_roles TO authenticated;
GRANT ALL ON TABLE public.staff_roles TO service_role;

DROP POLICY IF EXISTS "Staff can view own staff_roles" ON public.staff_roles;
CREATE POLICY "Staff can view own staff_roles"
    ON public.staff_roles
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 2. FUNCTION public.update_room_operational_status
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_room_operational_status(
    p_room_id UUID,
    p_operational_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_room_name TEXT;
    v_updated_at TIMESTAMPTZ;
BEGIN
    -- 1. Verify caller is staff or admin
    IF v_user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.staff_roles
        WHERE user_id = v_user_id AND role IN ('staff', 'admin')
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN_STAFF_ONLY');
    END IF;

    -- 2. Validate operational status against current UI contract ('ready', 'occupied', 'cleaning', 'maintenance')
    IF p_operational_status IS NULL OR p_operational_status NOT IN ('ready', 'occupied', 'cleaning', 'maintenance') THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_OPERATIONAL_STATUS');
    END IF;

    -- 3. Verify room exists in public.rooms
    SELECT r.name INTO v_room_name
    FROM public.rooms r
    WHERE r.id = p_room_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'ROOM_NOT_FOUND');
    END IF;

    -- 4. Upsert room_operations
    INSERT INTO public.room_operations (room_id, operational_status, updated_at, updated_by)
    VALUES (p_room_id, p_operational_status, NOW(), v_user_id)
    ON CONFLICT (room_id) DO UPDATE
    SET operational_status = EXCLUDED.operational_status,
        updated_at = EXCLUDED.updated_at,
        updated_by = EXCLUDED.updated_by
    RETURNING room_operations.updated_at INTO v_updated_at;

    -- 5. Return canonical updated record directly
    RETURN jsonb_build_object(
        'success', true,
        'room_id', p_room_id,
        'room_name', v_room_name,
        'operational_status', p_operational_status,
        'updated_at', v_updated_at,
        'updated_by', v_user_id
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. FUNCTION public.update_ticket_status
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_ticket_status(
    p_ticket_id UUID,
    p_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_ticket_record JSONB;
BEGIN
    -- 1. Verify caller is staff or admin
    IF v_user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.staff_roles
        WHERE user_id = v_user_id AND role IN ('staff', 'admin')
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN_STAFF_ONLY');
    END IF;

    -- 2. Validate ticket status ('pending', 'in_progress', 'resolved')
    IF p_status IS NULL OR p_status NOT IN ('pending', 'in_progress', 'resolved') THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_TICKET_STATUS');
    END IF;

    -- 3. Verify ticket exists in public.tickets
    IF NOT EXISTS (SELECT 1 FROM public.tickets WHERE id = p_ticket_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'TICKET_NOT_FOUND');
    END IF;

    -- 4. Update ticket status in public.tickets
    UPDATE public.tickets
    SET status = p_status,
        updated_at = NOW()
    WHERE id = p_ticket_id;

    -- 5. Build full canonical ticket record for return
    SELECT jsonb_build_object(
        'id', t.id,
        'booking_id', t.booking_id,
        'room_id', t.room_id,
        'user_id', t.user_id,
        'category', t.category,
        'description', t.description,
        'media_paths', to_jsonb(t.media_paths),
        'status', t.status,
        'created_at', t.created_at,
        'updated_at', t.updated_at,
        'rooms', CASE WHEN r.id IS NOT NULL THEN jsonb_build_object(
            'id', r.id,
            'name', r.name
        ) ELSE NULL END,
        'profiles', CASE WHEN p.id IS NOT NULL THEN jsonb_build_object(
            'id', p.id,
            'display_name', p.display_name,
            'phone', p.phone
        ) ELSE NULL END
    ) INTO v_ticket_record
    FROM public.tickets t
    LEFT JOIN public.rooms r ON t.room_id = r.id
    LEFT JOIN public.profiles p ON t.user_id = p.id
    WHERE t.id = p_ticket_id;

    RETURN jsonb_build_object(
        'success', true,
        'ticket', v_ticket_record
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. FUNCTION public.get_staff_dashboard_data (Trusted Read RPC)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_staff_dashboard_data()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_room_ops JSONB;
    v_tickets JSONB;
    v_today_bookings JSONB;
    v_today DATE := (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE;
BEGIN
    -- 1. Verify caller is staff or admin
    IF v_user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.staff_roles
        WHERE user_id = v_user_id AND role IN ('staff', 'admin')
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN_STAFF_ONLY');
    END IF;

    -- 2. Room operations with room information
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'room_id', r.id,
        'room_name', r.name,
        'operational_status', COALESCE(ro.operational_status, 'ready'),
        'updated_at', ro.updated_at,
        'updated_by', ro.updated_by
    ) ORDER BY r.name ASC), '[]'::jsonb)
    INTO v_room_ops
    FROM public.rooms r
    LEFT JOIN public.room_operations ro ON r.id = ro.room_id
    WHERE r.is_listed = true;

    -- 3. Incident / support tickets from canonical public.tickets
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', t.id,
        'booking_id', t.booking_id,
        'room_id', t.room_id,
        'room_name', r.name,
        'user_id', t.user_id,
        'guest_name', p.display_name,
        'guest_phone', p.phone,
        'category', t.category,
        'description', t.description,
        'media_paths', to_jsonb(t.media_paths),
        'status', t.status,
        'created_at', t.created_at,
        'updated_at', t.updated_at
    ) ORDER BY t.created_at DESC), '[]'::jsonb)
    INTO v_tickets
    FROM public.tickets t
    LEFT JOIN public.rooms r ON t.room_id = r.id
    LEFT JOIN public.profiles p ON t.user_id = p.id;

    -- 4. Today arrivals & departures (check-in or check-out today in Asia/Ho_Chi_Minh)
    -- Current implementation filter: excludes cancelled or refunded bookings.
    -- (Note: this status filter is a current implementation convention, not a canonical rule defined in PROJECT_GUIDE)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', b.id,
        'room_id', b.room_id,
        'room_name', r.name,
        'user_id', b.user_id,
        'guest_name', p.display_name,
        'guest_phone', p.phone,
        'check_in', b.check_in,
        'check_out', b.check_out,
        'guest_count', b.guest_count,
        'booking_status', b.booking_status,
        'payment_status', b.payment_status,
        'is_checkin_today', (b.check_in = v_today),
        'is_checkout_today', (b.check_out = v_today)
    ) ORDER BY b.check_in ASC), '[]'::jsonb)
    INTO v_today_bookings
    FROM public.bookings b
    LEFT JOIN public.rooms r ON b.room_id = r.id
    LEFT JOIN public.profiles p ON b.user_id = p.id
    WHERE (b.check_in = v_today OR b.check_out = v_today)
      AND LOWER(b.booking_status) NOT IN ('cancelled', 'refunded');

    -- 5. Canonical dashboard response
    RETURN jsonb_build_object(
        'success', true,
        'today', v_today,
        'room_operations', v_room_ops,
        'tickets', v_tickets,
        'today_bookings', v_today_bookings
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Grant Permissions (Explicit Least Privilege)
-- ----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.update_room_operational_status(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_ticket_status(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_staff_dashboard_data() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.update_room_operational_status(UUID, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_ticket_status(UUID, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_staff_dashboard_data() TO anon, authenticated, service_role;
