-- ============================================================================
-- Migration: 20260926173000_backend_integration_hardening.sql
-- Description: Backend integration hardening for Tickets (TV6) & Operations (TV7).
-- Architecture Reference: docs/PROJECT_GUIDE.md, docs/ARCHITECTURE.md
--
-- Scope:
-- Task 1: Trusted SECURITY DEFINER RPC public.create_guest_ticket
--   - Moves guest ticket creation from client direct INSERT to trusted RPC.
--   - Synchronizes stay authority invariants with get_my_stay_credentials:
--       * auth.uid() must be authenticated
--       * Booking ownership: booking.user_id = auth.uid()
--       * Booking status: confirmed or completed
--       * Active stay authority: public.booking_access_credentials status = 'active'
--         and strictly time-bounded (valid_from <= now <= valid_until)
--   - Enforces canonical category whitelist with BTRIM normalization:
--       'Khóa kẹt', 'Thiết bị hỏng', 'Vệ sinh chưa sạch', 'Tiếng ồn', 'Yêu cầu khác'
--   - Enforces normalized description with minimum length of 5 characters.
--   - Server-enforced pending status, user_id from auth.uid(), room_id from booking.
--   - Row locking (FOR UPDATE) to prevent TOCTOU between validation and insertion.
--   - Revokes direct INSERT on public.tickets from authenticated.
--   - Drops direct insert policy 'Users can create tickets for own bookings'.
--   - Grants EXECUTE to authenticated and service_role; revokes from PUBLIC/anon.
--
-- Task 2: Hardened SECURITY DEFINER RPC public.update_room_operational_status
--   - Restricts staff UI mutation targets to: ('ready', 'cleaning', 'maintenance').
--   - Strictly forbids setting target operational status to 'occupied' (lifecycle-owned state).
--   - Forbids overwriting operational status when current room status is 'occupied' (ROOM_OCCUPIED_READ_ONLY).
--   - Pre-checks room status and locks canonical public.rooms row for fail-early validation.
--   - Enforces atomic conditional UPSERT (WHERE ro.operational_status <> 'occupied')
--     at database write boundary with ROW_COUNT verification to eliminate TOCTOU races.
--   - Maintains full backward-compatible response JSON contract.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TASK 1: Trusted create_guest_ticket RPC & Tickets Permission Hardening
-- ----------------------------------------------------------------------------

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
    v_category TEXT := BTRIM(COALESCE(p_category, ''));
    v_description TEXT := BTRIM(COALESCE(p_description, ''));
    v_booking_id UUID := NULL;
    v_room_id UUID := NULL;
    v_booking_status TEXT := NULL;
    v_credential_id UUID := NULL;
    v_now TIMESTAMPTZ := NOW();
    v_ticket public.tickets%ROWTYPE;
BEGIN
    -- 1. Verify caller is authenticated
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
    END IF;

    -- 2. Validate input parameters
    IF p_booking_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_BOOKING_ID');
    END IF;

    IF v_category NOT IN (
        'Khóa kẹt',
        'Thiết bị hỏng',
        'Vệ sinh chưa sạch',
        'Tiếng ồn',
        'Yêu cầu khác'
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_CATEGORY');
    END IF;

    IF p_description IS NULL OR LENGTH(TRIM(p_description)) < 5 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'DESCRIPTION_TOO_SHORT'
        );
    END IF;

    -- 3. Verify booking ownership and state; lock row FOR UPDATE to prevent TOCTOU
    SELECT b.id, b.room_id, b.booking_status
    INTO v_booking_id, v_room_id, v_booking_status
    FROM public.bookings b
    WHERE b.id = p_booking_id AND b.user_id = v_user_id
    FOR UPDATE;

    IF v_booking_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'BOOKING_NOT_FOUND_OR_FORBIDDEN');
    END IF;

    IF LOWER(v_booking_status) NOT IN ('confirmed', 'completed') THEN
        RETURN jsonb_build_object('success', false, 'error', 'BOOKING_NOT_ACTIVE');
    END IF;

    -- 4. Verify active stay authority via booking_access_credentials (fail-closed)
    SELECT bac.id
    INTO v_credential_id
    FROM public.booking_access_credentials bac
    WHERE bac.booking_id = v_booking_id
      AND bac.room_id = v_room_id
      AND bac.status = 'active'
      AND v_now >= bac.valid_from
      AND v_now <= bac.valid_until
    ORDER BY bac.created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'NO_ACTIVE_STAY_CREDENTIAL');
    END IF;

    -- 5. Insert ticket atomically with server-enforced attributes
    INSERT INTO public.tickets (
        user_id,
        booking_id,
        room_id,
        category,
        description,
        media_paths,
        status
    )
    VALUES (
        v_user_id,
        v_booking_id,
        v_room_id,
        v_category,
        v_description,
        COALESCE(p_media_paths, '{}'::TEXT[]),
        'pending'
    )
    RETURNING * INTO v_ticket;

    -- 6. Return canonical ticket object
    RETURN jsonb_build_object(
        'success', true,
        'ticket_id', v_ticket.id,
        'ticket', jsonb_build_object(
            'id', v_ticket.id,
            'booking_id', v_ticket.booking_id,
            'room_id', v_ticket.room_id,
            'user_id', v_ticket.user_id,
            'category', v_ticket.category,
            'description', v_ticket.description,
            'media_paths', to_jsonb(v_ticket.media_paths),
            'status', v_ticket.status,
            'created_at', v_ticket.created_at,
            'updated_at', v_ticket.updated_at
        )
    );
END;
$$;

-- Revoke direct table-level INSERT on public.tickets from authenticated
REVOKE INSERT ON public.tickets FROM authenticated;

-- Drop legacy direct INSERT policy on public.tickets
DROP POLICY IF EXISTS "Users can create tickets for own bookings" ON public.tickets;

-- Restrict execution permissions on public.create_guest_ticket
REVOKE ALL ON FUNCTION public.create_guest_ticket(UUID, TEXT, TEXT, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_guest_ticket(UUID, TEXT, TEXT, TEXT[]) TO authenticated, service_role;


-- ----------------------------------------------------------------------------
-- TASK 2: Hardened update_room_operational_status RPC
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
    v_current_status TEXT;
    v_updated_at TIMESTAMPTZ;
    v_rows_affected INTEGER;
BEGIN
    -- 1. Authoritative role check: verify caller is staff or admin
    IF v_user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.staff_roles
        WHERE user_id = v_user_id AND role IN ('staff', 'admin')
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN_STAFF_ONLY');
    END IF;

    -- 2. Validate target operational status against allowed staff UI mutations:
    -- Staff can only set ('ready', 'cleaning', 'maintenance').
    -- Setting 'occupied' is strictly forbidden (lifecycle-owned state).
    IF p_operational_status IS NULL OR p_operational_status NOT IN ('ready', 'cleaning', 'maintenance') THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_OPERATIONAL_STATUS');
    END IF;

    -- 3. Verify room exists and lock canonical public.rooms row for early check
    SELECT r.name INTO v_room_name
    FROM public.rooms r
    WHERE r.id = p_room_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'ROOM_NOT_FOUND');
    END IF;

    -- 4. Check room_operations to fail early if already occupied
    SELECT ro.operational_status INTO v_current_status
    FROM public.room_operations ro
    WHERE ro.room_id = p_room_id
    FOR UPDATE;

    -- If room_operations has no row yet, canonical default operational status is 'ready'
    IF NOT FOUND THEN
        v_current_status := 'ready';
    END IF;

    -- If current status is occupied, staff cannot overwrite it
    IF v_current_status = 'occupied' THEN
        RETURN jsonb_build_object('success', false, 'error', 'ROOM_OCCUPIED_READ_ONLY');
    END IF;

    -- 5. Atomic conditional UPSERT at database write boundary:
    -- Target table alias 'ro' is used in the WHERE clause of DO UPDATE.
    -- On conflict, UPDATE executes ONLY IF ro.operational_status <> 'occupied'.
    -- If a concurrent transaction set or inserted 'occupied', the UPDATE is skipped.
    INSERT INTO public.room_operations AS ro (room_id, operational_status, updated_at, updated_by)
    VALUES (p_room_id, p_operational_status, NOW(), v_user_id)
    ON CONFLICT (room_id) DO UPDATE
    SET operational_status = EXCLUDED.operational_status,
        updated_at = EXCLUDED.updated_at,
        updated_by = EXCLUDED.updated_by
    WHERE ro.operational_status <> 'occupied'
    RETURNING ro.updated_at INTO v_updated_at;

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

    IF v_rows_affected = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'ROOM_OCCUPIED_READ_ONLY');
    END IF;

    -- 6. Return canonical payload
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

-- Restrict execution permissions on public.update_room_operational_status
REVOKE ALL ON FUNCTION public.update_room_operational_status(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_room_operational_status(UUID, TEXT) TO authenticated, service_role;
