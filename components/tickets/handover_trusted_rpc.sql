-- ============================================================================
-- Handover Script: Trusted RPC public.create_guest_ticket
-- Module: TV6 (Guest Guide / Tickets) -> Handover to TV8 (Database) & TV1 (Tech Lead)
-- Scope: Defects C.1 & C.5 (Enforce atomic server-side ticket creation & fail-closed stay security)
--
-- Security Guarantees:
-- 1. SECURITY DEFINER with search_path = '' prevents search_path poisoning.
-- 2. Authenticates caller strictly via auth.uid().
-- 3. Enforces booking ownership (user_id = auth.uid()) & active booking status ('confirmed', 'completed').
-- 4. Derives user_id and room_id server-side directly from bookings (prevents client spoofing).
-- 5. Enforces category whitelist: ('Khóa kẹt', 'Thiết bị hỏng', 'Vệ sinh chưa sạch', 'Tiếng ồn', 'Yêu cầu khác').
-- 6. Enforces description minimum length (>= 5 characters).
-- 7. Strictly Fail-Closed: Verifies active credential in booking_access_credentials within (valid_from <= NOW() <= valid_until). Zero fallback.
-- 8. Enforces Least Privilege: Revokes direct INSERT on public.tickets from authenticated role, routing all creation through this trusted RPC.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_guest_ticket(
    p_booking_id UUID,
    p_category TEXT,
    p_description TEXT,
    p_media_paths TEXT[] DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_booking RECORD;
    v_has_active_cred BOOLEAN := FALSE;
    v_now TIMESTAMPTZ := NOW();
    v_new_ticket public.tickets%ROWTYPE;
BEGIN
    -- 1. Authentication Check
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
    END IF;

    -- 2. Input Validation (Category Whitelist Check)
    IF p_category IS NULL OR p_category NOT IN (
        'Khóa kẹt',
        'Thiết bị hỏng',
        'Vệ sinh chưa sạch',
        'Tiếng ồn',
        'Yêu cầu khác'
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_CATEGORY');
    END IF;

    -- 3. Description Length Check (Min 5 chars trimmed)
    IF p_description IS NULL OR LENGTH(TRIM(p_description)) < 5 THEN
        RETURN jsonb_build_object('success', false, 'error', 'DESCRIPTION_TOO_SHORT');
    END IF;

    -- 4. Booking Ownership & Confirmed Status Check
    SELECT id, user_id, room_id, booking_status
    INTO v_booking
    FROM public.bookings
    WHERE id = p_booking_id AND user_id = v_user_id;

    IF v_booking.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'BOOKING_NOT_FOUND_OR_FORBIDDEN');
    END IF;

    IF LOWER(v_booking.booking_status) NOT IN ('confirmed', 'completed') THEN
        RETURN jsonb_build_object('success', false, 'error', 'BOOKING_NOT_ACTIVE');
    END IF;

    -- 5. Active Stay Credential Check (Fail-Closed, Zero Fallback)
    SELECT EXISTS (
        SELECT 1
        FROM public.booking_access_credentials
        WHERE booking_id = v_booking.id
          AND room_id = v_booking.room_id
          AND status = 'active'
          AND v_now >= valid_from
          AND v_now <= valid_until
    ) INTO v_has_active_cred;

    IF NOT v_has_active_cred THEN
        RETURN jsonb_build_object('success', false, 'error', 'OUTSIDE_STAY_WINDOW');
    END IF;

    -- 6. Atomic INSERT into public.tickets
    INSERT INTO public.tickets (
        user_id,
        booking_id,
        room_id,
        category,
        description,
        media_paths,
        status
    ) VALUES (
        v_user_id,
        v_booking.id,
        v_booking.room_id,
        p_category,
        TRIM(p_description),
        COALESCE(p_media_paths, '{}'),
        'pending'
    )
    RETURNING * INTO v_new_ticket;

    -- 7. Return Result
    RETURN jsonb_build_object(
        'success', true,
        'ticket', to_jsonb(v_new_ticket)
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- Permissions & Direct Access Lockdown (Least Privilege)
-- ----------------------------------------------------------------------------

-- Revoke all function permissions from public
REVOKE ALL ON FUNCTION public.create_guest_ticket(UUID, TEXT, TEXT, TEXT[]) FROM PUBLIC;

-- Grant execution to authenticated users and service_role
GRANT EXECUTE ON FUNCTION public.create_guest_ticket(UUID, TEXT, TEXT, TEXT[]) TO authenticated, service_role;

-- Enforce global security invariant: prevent direct REST API bypass on public.tickets
-- All ticket creation MUST go through the trusted RPC public.create_guest_ticket
REVOKE INSERT ON public.tickets FROM authenticated;

COMMENT ON FUNCTION public.create_guest_ticket(UUID, TEXT, TEXT, TEXT[]) IS 
'Trusted RPC for guests to create incident/service tickets during an active stay window. Enforces fail-closed credential checks, category whitelist, and atomic insertion.';
