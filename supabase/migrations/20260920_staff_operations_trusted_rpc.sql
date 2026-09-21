-- ============================================================================
-- Migration: 20260920_staff_operations_trusted_rpc.sql
-- Description: Trusted Staff Authorization and Operations RPCs for TV7 (PR #9).
-- Author: TV8 (Database / Backend Data)
-- Approved Direction: Tech Lead (TV1) Re-review #4
-- Architecture Reference: docs/PROJECT_GUIDE.md, docs/ARCHITECTURE.md
--
-- Security & Access Control:
-- 1. Eliminates insecure authorization via client/user_metadata.
-- 2. Authoritative role check against database table public.staff_roles via is_staff().
-- 3. Provides SECURITY DEFINER trusted write RPCs:
--    - public.update_room_cleaning_status (updates room_operations)
--    - public.update_ticket_status (updates tickets / support_tickets)
-- 4. Provides SECURITY DEFINER trusted read RPC for TV7:
--    - public.get_staff_dashboard_data() (returns room_operations, support_tickets, today_bookings)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Schema Adjustments (Support Columns & Tables)
-- ----------------------------------------------------------------------------

-- Ensure public.tickets has resolution_notes and resolved_at
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS resolution_notes TEXT NULL,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ NULL;

-- Support support_tickets table if referenced directly
CREATE TABLE IF NOT EXISTS public.support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NULL REFERENCES auth.users(id),
    booking_id UUID NULL REFERENCES public.bookings(id),
    room_id UUID NULL REFERENCES public.rooms(id),
    category TEXT NULL,
    description TEXT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    resolution_notes TEXT NULL,
    resolved_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.support_tickets TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 1. Staff Roles Table & RLS Policy
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.staff_roles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('staff', 'admin', 'manager')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.staff_roles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'staff_roles' 
          AND policyname = 'Staff can view own staff_roles'
    ) THEN
        CREATE POLICY "Staff can view own staff_roles" 
            ON public.staff_roles 
            FOR SELECT 
            TO authenticated 
            USING (auth.uid() = user_id);
    END IF;
END
$$;

GRANT SELECT ON public.staff_roles TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. FUNCTION public.is_staff
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_staff(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.staff_roles WHERE user_id = p_user_id
    );
$$;

-- ----------------------------------------------------------------------------
-- 3. FUNCTION public.update_room_cleaning_status
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_room_cleaning_status(
    p_room_id UUID,
    p_cleaning_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
BEGIN
    IF v_user_id IS NULL OR NOT public.is_staff(v_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN_STAFF_ONLY');
    END IF;

    -- Cập nhật room_operations (nguồn chân lý vận hành phòng)
    INSERT INTO public.room_operations (room_id, operational_status, updated_at, updated_by)
    VALUES (p_room_id, p_cleaning_status, NOW(), v_user_id)
    ON CONFLICT (room_id) DO UPDATE
    SET operational_status = EXCLUDED.operational_status,
        updated_at = EXCLUDED.updated_at,
        updated_by = EXCLUDED.updated_by;

    RETURN jsonb_build_object(
        'success', true,
        'room_id', p_room_id,
        'cleaning_status', p_cleaning_status
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. FUNCTION public.update_ticket_status
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_ticket_status(
    p_ticket_id UUID,
    p_status TEXT,
    p_resolution_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_resolved_at TIMESTAMPTZ := CASE WHEN p_status IN ('resolved', 'closed') THEN NOW() ELSE NULL END;
BEGIN
    IF v_user_id IS NULL OR NOT public.is_staff(v_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN_STAFF_ONLY');
    END IF;

    -- Cập nhật bảng tickets
    UPDATE public.tickets
    SET status = p_status,
        resolution_notes = COALESCE(p_resolution_notes, resolution_notes),
        resolved_at = v_resolved_at,
        updated_at = NOW()
    WHERE id = p_ticket_id;

    -- Cập nhật đồng bộ bảng support_tickets nếu có
    UPDATE public.support_tickets
    SET status = p_status,
        resolution_notes = COALESCE(p_resolution_notes, resolution_notes),
        resolved_at = v_resolved_at,
        updated_at = NOW()
    WHERE id = p_ticket_id;

    RETURN jsonb_build_object(
        'success', true,
        'ticket_id', p_ticket_id,
        'status', p_status
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. FUNCTION public.get_staff_dashboard_data (Trusted Read RPC for TV7)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_staff_dashboard_data()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_room_ops JSONB;
    v_tickets JSONB;
    v_today_bookings JSONB;
    v_today DATE := (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE;
BEGIN
    IF v_user_id IS NULL OR NOT public.is_staff(v_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN_STAFF_ONLY');
    END IF;

    -- 1. Danh sách room_operations (trạng thái dọn phòng) kèm thông tin phòng
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

    -- 2. Danh sách support_tickets
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', t.id,
        'booking_id', t.booking_id,
        'room_id', t.room_id,
        'room_name', r.name,
        'user_id', t.user_id,
        'guest_name', p.display_name,
        'category', t.category,
        'description', t.description,
        'status', t.status,
        'resolution_notes', t.resolution_notes,
        'created_at', t.created_at,
        'updated_at', t.updated_at
    ) ORDER BY t.created_at DESC), '[]'::jsonb)
    INTO v_tickets
    FROM public.tickets t
    LEFT JOIN public.rooms r ON t.room_id = r.id
    LEFT JOIN public.profiles p ON t.user_id = p.id;

    -- 3. Các booking check-in hoặc check-out trong ngày hôm nay (timezone Asia/Ho_Chi_Minh)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', b.id,
        'room_id', b.room_id,
        'room_name', r.name,
        'user_id', b.user_id,
        'guest_name', p.display_name,
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
    WHERE (b.check_in = v_today OR b.check_out = v_today OR (b.check_in <= v_today AND b.check_out >= v_today))
      AND LOWER(b.booking_status) NOT IN ('cancelled', 'refunded');

    RETURN jsonb_build_object(
        'success', true,
        'today', v_today,
        'room_operations', v_room_ops,
        'support_tickets', v_tickets,
        'today_bookings', v_today_bookings
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. Cấp quyền least privilege
-- ----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.is_staff(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_room_cleaning_status(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_ticket_status(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_staff_dashboard_data() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_staff(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_room_cleaning_status(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_ticket_status(UUID, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_staff_dashboard_data() TO authenticated, service_role;
