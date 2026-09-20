-- ============================================================================
-- Migration: 20260920_staff_operations_trusted_rpc.sql
-- Description: Trusted Staff Authorization and Operations RPCs for TV7 (PR #9).
-- Security & Access Control:
-- 1. Eliminates insecure authorization via client/user_metadata
-- 2. Authoritative role check against database table public.staff_roles via is_staff()
-- 3. Provides SECURITY DEFINER trusted write RPCs:
--    - public.update_room_cleaning_status
--    - public.update_ticket_status
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Schema Adjustments (Support Columns & Tables)
-- ----------------------------------------------------------------------------
-- Ensure public.rooms has cleaning_status column
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS cleaning_status TEXT NULL DEFAULT 'ready';

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
    role TEXT NOT NULL CHECK (role IN ('staff', 'admin', 'manager')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bật RLS
ALTER TABLE public.staff_roles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'staff_roles' 
          AND policyname = 'Staff can view staff_roles'
    ) THEN
        CREATE POLICY "Staff can view staff_roles" 
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

    UPDATE public.rooms
    SET cleaning_status = p_cleaning_status,
        updated_at = NOW()
    WHERE id = p_room_id;

    -- Đồng bộ vào room_operations để bảo đảm tính toàn vẹn dữ liệu vận hành
    INSERT INTO public.room_operations (room_id, operational_status, updated_at, updated_by)
    VALUES (p_room_id, p_cleaning_status, NOW(), v_user_id)
    ON CONFLICT (room_id) DO UPDATE
    SET operational_status = EXCLUDED.operational_status,
        updated_at = EXCLUDED.updated_at,
        updated_by = EXCLUDED.updated_by;

    RETURN jsonb_build_object('success', true, 'room_id', p_room_id, 'cleaning_status', p_cleaning_status);
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
BEGIN
    IF v_user_id IS NULL OR NOT public.is_staff(v_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN_STAFF_ONLY');
    END IF;

    -- Cập nhật bảng support_tickets
    UPDATE public.support_tickets
    SET status = p_status,
        resolution_notes = COALESCE(p_resolution_notes, resolution_notes),
        resolved_at = CASE WHEN p_status IN ('resolved', 'closed') THEN NOW() ELSE NULL END,
        updated_at = NOW()
    WHERE id = p_ticket_id;

    -- Cập nhật đồng bộ bảng tickets
    UPDATE public.tickets
    SET status = p_status,
        resolution_notes = COALESCE(p_resolution_notes, resolution_notes),
        resolved_at = CASE WHEN p_status IN ('resolved', 'closed') THEN NOW() ELSE NULL END,
        updated_at = NOW()
    WHERE id = p_ticket_id;

    RETURN jsonb_build_object('success', true, 'ticket_id', p_ticket_id, 'status', p_status);
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Cấp quyền least privilege
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.is_staff(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_room_cleaning_status(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_ticket_status(UUID, TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_staff(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_room_cleaning_status(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_ticket_status(UUID, TEXT, TEXT) TO authenticated, service_role;
