-- Migration: 20260929230000_temporary_room_holds_and_public_availability.sql
-- Description:
--   1. Real-time temporary room hold architecture using checkout_sessions (ACTIVE/PAYMENT_PROCESSING, 30m expiry).
--   2. Advisory locking in create_hourly_checkout_session_atomic to strictly serialize concurrent hold attempts on the same room.
--   3. check_room_availability_hourly upgrade: respects active unexpired holds.
--   4. Public sanitized availability timeline RPC: get_public_room_availability_timeline(room_id, range_start, range_end).
--   5. Explicit hold release RPC: release_checkout_hold_atomic(checkout_session_id).
--   6. Upgrade finalize_verified_checkout_atomic: allows ACTIVE/PAYMENT_PROCESSING, prevents conflicting bookings/holds, sets COMPLETED.
--   7. Upgrade get_admin_property_room_schedule: exposes live temporary holds on Admin unified property schedule board.
--   8. Supporting performance index on checkout_sessions active holds.

-- ----------------------------------------------------------------------------
-- 1. Index: checkout_sessions active holds
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_active_hold
  ON public.checkout_sessions (room_id, status, expires_at, check_in_at, check_out_at);

-- ----------------------------------------------------------------------------
-- 2. RPC: check_room_availability_hourly
-- Upgraded to respect active unexpired holds in checkout_sessions.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_room_availability_hourly(
  p_room_id UUID,
  p_check_in_at TIMESTAMPTZ,
  p_check_out_at TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_duration_minutes NUMERIC;
BEGIN
  -- Validate basic inputs
  IF p_room_id IS NULL OR p_check_in_at IS NULL OR p_check_out_at IS NULL THEN
    RETURN FALSE;
  END IF;

  IF p_check_out_at <= p_check_in_at THEN
    RETURN FALSE;
  END IF;

  -- Minimum booking duration: 2 hours (120 minutes)
  v_duration_minutes := EXTRACT(EPOCH FROM (p_check_out_at - p_check_in_at)) / 60.0;
  IF v_duration_minutes < 120.0 THEN
    RETURN FALSE;
  END IF;

  -- Disallow bookings starting in the past (with 5-minute clock skew leeway)
  IF p_check_in_at < (clock_timestamp() - INTERVAL '5 minutes') THEN
    RETURN FALSE;
  END IF;

  -- Check room is listed and parent property is active
  IF NOT EXISTS (
    SELECT 1
    FROM public.rooms r
    JOIN public.properties p ON p.id = r.property_id
    WHERE r.id = p_room_id
      AND r.is_listed = true
      AND p.is_active = true
  ) THEN
    RETURN FALSE;
  END IF;

  -- 1. Check confirmed / completed bookings overlap
  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.room_id = p_room_id
      AND LOWER(b.booking_status) IN ('confirmed', 'completed')
      AND (
        (b.check_in_at IS NOT NULL AND b.check_out_at IS NOT NULL
         AND b.check_in_at < p_check_out_at AND b.check_out_at > p_check_in_at)
        OR
        (b.check_in_at IS NULL
         AND b.check_in < (p_check_out_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
         AND b.check_out > (p_check_in_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
      )
  ) THEN
    RETURN FALSE;
  END IF;

  -- 2. Check room availability blocks overlap
  IF EXISTS (
    SELECT 1
    FROM public.room_availability_blocks rab
    WHERE rab.room_id = p_room_id
      AND rab.starts_at < p_check_out_at
      AND rab.ends_at > p_check_in_at
  ) THEN
    RETURN FALSE;
  END IF;

  -- 3. Check active temporary room holds in checkout_sessions
  IF EXISTS (
    SELECT 1
    FROM public.checkout_sessions cs
    WHERE cs.room_id = p_room_id
      AND cs.status IN ('ACTIVE', 'PAYMENT_PROCESSING')
      AND cs.expires_at > clock_timestamp()
      AND cs.check_in_at < p_check_out_at
      AND cs.check_out_at > p_check_in_at
  ) THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.check_room_availability_hourly(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_room_availability_hourly(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. RPC: create_hourly_checkout_session_atomic
-- Upgraded with PostgreSQL advisory locking to serialize competing hold attempts.
-- Re-checks active holds, bookings, and blocks while lock is held.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_hourly_checkout_session_atomic(
  p_room_id UUID,
  p_check_in_at TIMESTAMPTZ,
  p_check_out_at TIMESTAMPTZ,
  p_guest_count INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_hourly_price BIGINT;
  v_is_listed BOOLEAN;
  v_capacity INTEGER;
  v_duration_minutes NUMERIC;
  v_booking_hours INTEGER;
  v_gross_amount BIGINT;
  v_session_id UUID;
  v_expires_at TIMESTAMPTZ;
  v_payment_ref TEXT;
  v_expired_rec RECORD;
  v_check_in_date DATE;
  v_check_out_date DATE;
BEGIN
  -- Caller must be authenticated
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

  -- Validate timestamp parameters
  IF p_check_in_at IS NULL OR p_check_out_at IS NULL OR p_check_out_at <= p_check_in_at THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_DATE_RANGE');
  END IF;

  -- Validate duration: Minimum 2 hours (120 minutes)
  v_duration_minutes := EXTRACT(EPOCH FROM (p_check_out_at - p_check_in_at)) / 60.0;
  IF v_duration_minutes < 120.0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'MINIMUM_BOOKING_DURATION_2_HOURS');
  END IF;

  -- Maximum duration per session: 24 hours (1440 minutes)
  IF v_duration_minutes > 1440.0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'MAXIMUM_BOOKING_DURATION_24_HOURS');
  END IF;

  -- Disallow bookings starting in the past (with 5-minute clock skew leeway)
  IF p_check_in_at < (clock_timestamp() - INTERVAL '5 minutes') THEN
    RETURN jsonb_build_object('success', false, 'error', 'CANNOT_BOOK_IN_PAST');
  END IF;

  -- Validate guest count
  IF p_guest_count IS NULL OR p_guest_count <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_GUEST_COUNT');
  END IF;

  -- Validate room existence, active parent property, and listing status
  SELECT r.hourly_price_vnd, r.is_listed, r.capacity
  INTO v_hourly_price, v_is_listed, v_capacity
  FROM public.rooms r
  JOIN public.properties p ON p.id = r.property_id
  WHERE r.id = p_room_id AND p.is_active = true;

  IF v_hourly_price IS NULL OR v_is_listed IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'ROOM_NOT_FOUND_OR_UNLISTED');
  END IF;

  -- Enforce room capacity server-side
  IF p_guest_count > v_capacity THEN
    RETURN jsonb_build_object('success', false, 'error', 'GUEST_COUNT_EXCEEDS_CAPACITY');
  END IF;

  -- -------------------------------------------------------------------------
  -- CRITICAL CONCURRENCY LOCK:
  -- Serialize competing hold attempts for the same room using transaction advisory lock.
  -- -------------------------------------------------------------------------
  PERFORM pg_advisory_xact_lock(hashtext(p_room_id::text));

  -- Re-check confirmed / completed bookings overlap
  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.room_id = p_room_id
      AND LOWER(b.booking_status) IN ('confirmed', 'completed')
      AND (
        (b.check_in_at IS NOT NULL AND b.check_out_at IS NOT NULL
         AND b.check_in_at < p_check_out_at AND b.check_out_at > p_check_in_at)
        OR
        (b.check_in_at IS NULL
         AND b.check_in < (p_check_out_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
         AND b.check_out > (p_check_in_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
      )
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'ROOM_NOT_AVAILABLE');
  END IF;

  -- Re-check room availability blocks overlap
  IF EXISTS (
    SELECT 1
    FROM public.room_availability_blocks rab
    WHERE rab.room_id = p_room_id
      AND rab.starts_at < p_check_out_at
      AND rab.ends_at > p_check_in_at
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'ROOM_NOT_AVAILABLE');
  END IF;

  -- Re-check active temporary holds in checkout_sessions
  IF EXISTS (
    SELECT 1
    FROM public.checkout_sessions cs
    WHERE cs.room_id = p_room_id
      AND cs.status IN ('ACTIVE', 'PAYMENT_PROCESSING')
      AND cs.expires_at > clock_timestamp()
      AND cs.check_in_at < p_check_out_at
      AND cs.check_out_at > p_check_in_at
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Khung giờ này vừa được một khách khác chọn. Vui lòng chọn khung giờ khác.',
      'code', 'ROOM_TEMPORARILY_HELD'
    );
  END IF;

  -- Opportunistic cleanup of expired sessions owned by caller (ACTIVE only)
  FOR v_expired_rec IN
    SELECT cs.id AS session_id
    FROM public.checkout_sessions cs
    WHERE cs.user_id = v_user_id
      AND cs.status = 'ACTIVE'
      AND cs.expires_at <= clock_timestamp()
    FOR UPDATE OF cs
  LOOP
    UPDATE public.voucher_redemptions vr
    SET status = CASE WHEN vr.expires_at > clock_timestamp() THEN 'AVAILABLE' ELSE 'EXPIRED' END,
        checkout_session_id = NULL,
        discount_amount_vnd = NULL
    WHERE vr.checkout_session_id = v_expired_rec.session_id
      AND vr.status = 'RESERVED';

    UPDATE public.checkout_sessions cs
    SET status = 'EXPIRED'
    WHERE cs.id = v_expired_rec.session_id;
  END LOOP;

  -- Server-derive price: booking_hours = CEIL(duration_minutes / 60)
  v_booking_hours := CEIL(v_duration_minutes / 60.0)::integer;
  v_gross_amount := v_hourly_price * v_booking_hours;
  v_session_id := gen_random_uuid();

  -- 30-minute checkout temporary hold expiry convention
  v_expires_at := clock_timestamp() + INTERVAL '30 minutes';

  -- Canonical payment reference: KAPI-XXXXXXXXXXXX
  v_payment_ref := 'KAPI-' || upper(substr(replace(v_session_id::text, '-', ''), 1, 12));

  -- Derive date values for backward compatibility
  v_check_in_date := (p_check_in_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_check_out_date := (p_check_out_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;

  INSERT INTO public.checkout_sessions (
    id,
    user_id,
    room_id,
    check_in_at,
    check_out_at,
    check_in,
    check_out,
    guest_count,
    gross_amount_vnd,
    discount_amount_vnd,
    final_payable_amount_vnd,
    status,
    expires_at,
    payment_reference
  ) VALUES (
    v_session_id,
    v_user_id,
    p_room_id,
    p_check_in_at,
    p_check_out_at,
    v_check_in_date,
    v_check_out_date,
    p_guest_count,
    v_gross_amount,
    0,
    v_gross_amount,
    'ACTIVE',
    v_expires_at,
    v_payment_ref
  );

  RETURN jsonb_build_object(
    'success', true,
    'checkout_session', jsonb_build_object(
      'id', v_session_id,
      'room_id', p_room_id,
      'check_in_at', p_check_in_at,
      'check_out_at', p_check_out_at,
      'check_in', v_check_in_date,
      'check_out', v_check_out_date,
      'guest_count', p_guest_count,
      'booking_hours', v_booking_hours,
      'gross_amount_vnd', v_gross_amount,
      'discount_amount_vnd', 0,
      'final_payable_amount_vnd', v_gross_amount,
      'payment_reference', v_payment_ref,
      'status', 'ACTIVE',
      'expires_at', v_expires_at
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_hourly_checkout_session_atomic(UUID, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_hourly_checkout_session_atomic(UUID, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. RPC: get_public_room_availability_timeline
-- Publicly accessible, strictly sanitized timeline of room intervals in a date range.
-- Returns BOOKED, HELD, and BLOCKED intervals.
-- Excludes all user_id, booking_id, checkout_session_id, guest names, phones, emails.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_room_availability_timeline(
  p_room_id UUID,
  p_range_start TIMESTAMPTZ,
  p_range_end TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_intervals JSONB;
BEGIN
  -- Validate inputs
  IF p_room_id IS NULL OR p_range_start IS NULL OR p_range_end IS NULL OR p_range_start >= p_range_end THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_PARAMETERS');
  END IF;

  -- Limit max query window to 14 days
  IF (p_range_end - p_range_start) > INTERVAL '14 days' THEN
    RETURN jsonb_build_object('success', false, 'error', 'RANGE_TOO_LARGE');
  END IF;

  -- Ensure room exists, is listed, and belongs to an active property
  IF NOT EXISTS (
    SELECT 1
    FROM public.rooms r
    JOIN public.properties p ON p.id = r.property_id
    WHERE r.id = p_room_id AND r.is_listed = true AND p.is_active = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'ROOM_NOT_FOUND');
  END IF;

  WITH raw_intervals AS (
    -- 1. Confirmed / completed bookings -> BOOKED
    SELECT
      COALESCE(b.check_in_at, (b.check_in::text || ' 14:00:00+07')::timestamptz) AS start_at,
      COALESCE(b.check_out_at, (b.check_out::text || ' 12:00:00+07')::timestamptz) AS end_at,
      'BOOKED' AS state
    FROM public.bookings b
    WHERE b.room_id = p_room_id
      AND LOWER(b.booking_status) IN ('confirmed', 'completed')
      AND COALESCE(b.check_in_at, (b.check_in::text || ' 14:00:00+07')::timestamptz) < p_range_end
      AND COALESCE(b.check_out_at, (b.check_out::text || ' 12:00:00+07')::timestamptz) > p_range_start

    UNION ALL

    -- 2. Active temporary holds in checkout_sessions -> HELD
    SELECT
      cs.check_in_at AS start_at,
      cs.check_out_at AS end_at,
      'HELD' AS state
    FROM public.checkout_sessions cs
    WHERE cs.room_id = p_room_id
      AND cs.status IN ('ACTIVE', 'PAYMENT_PROCESSING')
      AND cs.expires_at > clock_timestamp()
      AND cs.check_in_at < p_range_end
      AND cs.check_out_at > p_range_start

    UNION ALL

    -- 3. Room availability blocks (maintenance, housekeeping, owner_block) -> BLOCKED
    -- If reason = 'BOOKED', classify as BOOKED
    SELECT
      rab.starts_at AS start_at,
      rab.ends_at AS end_at,
      CASE
        WHEN rab.reason = 'BOOKED' THEN 'BOOKED'
        ELSE 'BLOCKED'
      END AS state
    FROM public.room_availability_blocks rab
    WHERE rab.room_id = p_room_id
      AND rab.starts_at < p_range_end
      AND rab.ends_at > p_range_start
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'start_at', i.start_at,
        'end_at', i.end_at,
        'state', i.state
      ) ORDER BY i.start_at ASC
    ),
    '[]'::jsonb
  ) INTO v_intervals
  FROM raw_intervals i;

  RETURN jsonb_build_object(
    'success', true,
    'room_id', p_room_id,
    'range_start', p_range_start,
    'range_end', p_range_end,
    'intervals', v_intervals
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_room_availability_timeline(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_room_availability_timeline(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. RPC: release_checkout_hold_atomic
-- Allows holding user to release their active hold immediately on checkout cancel.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_checkout_hold_atomic(
  p_checkout_session_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_session RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

  SELECT * INTO v_session
  FROM public.checkout_sessions
  WHERE id = p_checkout_session_id AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESSION_NOT_FOUND');
  END IF;

  IF v_session.status NOT IN ('ACTIVE', 'PAYMENT_PROCESSING') THEN
    RETURN jsonb_build_object('success', true, 'message', 'SESSION_ALREADY_INACTIVE');
  END IF;

  -- Release any reserved voucher
  UPDATE public.voucher_redemptions
  SET status = CASE WHEN expires_at > clock_timestamp() THEN 'AVAILABLE' ELSE 'EXPIRED' END,
      checkout_session_id = NULL,
      discount_amount_vnd = NULL
  WHERE checkout_session_id = p_checkout_session_id
    AND status = 'RESERVED';

  -- Release checkout session hold
  UPDATE public.checkout_sessions
  SET status = 'EXPIRED'
  WHERE id = p_checkout_session_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.release_checkout_hold_atomic(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_checkout_hold_atomic(UUID) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6. RPC: finalize_verified_checkout_atomic
-- Upgrade to verify session status, exclude conflicting holds, and set COMPLETED.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_verified_checkout_atomic(
  p_checkout_session_id UUID,
  p_verified_paid_amount_vnd BIGINT,
  p_verified_payment_reference TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session RECORD;
  v_booking_id UUID;
  v_existing_booking_id UUID;
  v_points_earned NUMERIC := 0;
  v_redemption_id UUID;
  v_redemption_expires_at TIMESTAMPTZ;
  v_redemption_discount BIGINT;
  v_voucher_is_active BOOLEAN;
  v_voucher_type TEXT;
  v_discount_percentage NUMERIC;
  v_max_eligible_base_vnd BIGINT;
  v_ent_discount_rec RECORD;
  v_expected_final_payable BIGINT;
  v_door_code TEXT;
  v_private_instructions TEXT;
  v_stay_start TIMESTAMPTZ;
  v_stay_end TIMESTAMPTZ;
BEGIN
  -- 1. Lock and retrieve checkout session
  SELECT *
  INTO v_session
  FROM public.checkout_sessions
  WHERE id = p_checkout_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'CHECKOUT_SESSION_NOT_FOUND');
  END IF;

  -- 2. Idempotency: if already completed, return existing booking
  IF v_session.status = 'COMPLETED' THEN
    SELECT id INTO v_existing_booking_id
    FROM public.bookings
    WHERE checkout_session_id = v_session.id;

    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'booking_id', v_existing_booking_id
    );
  END IF;

  -- 3. Verify status allows finalization (ACTIVE or PAYMENT_PROCESSING)
  IF v_session.status NOT IN ('ACTIVE', 'PAYMENT_PROCESSING', 'CONFIRMED') THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_CHECKOUT_STATUS');
  END IF;

  -- 4. Verify payment reference matches canonical reference exactly
  IF v_session.payment_reference <> p_verified_payment_reference THEN
    RETURN jsonb_build_object('success', false, 'error', 'PAYMENT_REFERENCE_MISMATCH');
  END IF;

  -- 5. Check session expiration
  IF v_session.expires_at <= clock_timestamp() THEN
    RETURN jsonb_build_object('success', false, 'error', 'CHECKOUT_SESSION_EXPIRED');
  END IF;

  -- 6. Total Price Rule check
  v_expected_final_payable := (v_session.gross_amount_vnd - v_session.discount_amount_vnd) + COALESCE(v_session.menu_amount_vnd, 0);
  IF p_verified_paid_amount_vnd <> v_expected_final_payable
     OR v_session.final_payable_amount_vnd <> v_expected_final_payable THEN
    RETURN jsonb_build_object('success', false, 'error', 'AMOUNT_MISMATCH');
  END IF;

  -- 7. Double booking prevention lock
  IF v_session.check_in_at IS NOT NULL AND v_session.check_out_at IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.room_id = v_session.room_id
        AND LOWER(b.booking_status) IN ('confirmed', 'completed')
        AND (
          (b.check_in_at IS NOT NULL AND b.check_out_at IS NOT NULL
           AND b.check_in_at < v_session.check_out_at AND b.check_out_at > v_session.check_in_at)
          OR
          (b.check_in_at IS NULL
           AND b.check_in < (v_session.check_out_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
           AND b.check_out > (v_session.check_in_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
        )
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'ROOM_NOT_AVAILABLE');
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.room_availability_blocks rab
      WHERE rab.room_id = v_session.room_id
        AND rab.starts_at < v_session.check_out_at
        AND rab.ends_at > v_session.check_in_at
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'ROOM_NOT_AVAILABLE');
    END IF;

    -- Ensure no other conflicting live holds except its own session
    IF EXISTS (
      SELECT 1 FROM public.checkout_sessions cs
      WHERE cs.room_id = v_session.room_id
        AND cs.id <> v_session.id
        AND cs.status IN ('ACTIVE', 'PAYMENT_PROCESSING')
        AND cs.expires_at > clock_timestamp()
        AND cs.check_in_at < v_session.check_out_at
        AND cs.check_out_at > v_session.check_in_at
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'ROOM_NOT_AVAILABLE');
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.room_id = v_session.room_id
        AND LOWER(b.booking_status) IN ('confirmed', 'completed')
        AND b.check_in < v_session.check_out
        AND b.check_out > v_session.check_in
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'ROOM_NOT_AVAILABLE');
    END IF;
  END IF;

  -- 8. Validate Discount Voucher / Entitlement state
  IF v_session.discount_amount_vnd > 0 THEN
    SELECT vr.id, vr.expires_at, vr.discount_amount_vnd, v.is_active, v.voucher_type, v.discount_percentage, v.max_eligible_base_vnd
    INTO v_redemption_id, v_redemption_expires_at, v_redemption_discount, v_voucher_is_active, v_voucher_type, v_discount_percentage, v_max_eligible_base_vnd
    FROM public.voucher_redemptions vr
    JOIN public.vouchers v ON v.id = vr.voucher_id
    WHERE vr.checkout_session_id = v_session.id
      AND vr.status = 'RESERVED'
      AND vr.user_id = v_session.user_id
    FOR UPDATE OF vr;

    IF v_redemption_id IS NOT NULL THEN
      IF v_redemption_expires_at <= clock_timestamp()
         OR v_redemption_discount <> v_session.discount_amount_vnd
         OR v_voucher_is_active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'VOUCHER_INVALID_AT_PAYMENT');
      END IF;

      -- Mark voucher USED
      UPDATE public.voucher_redemptions
      SET status = 'USED'
      WHERE id = v_redemption_id;
    END IF;

    -- Validate streak reward entitlement if applied
    FOR v_ent_discount_rec IN
      SELECT sre.id, sre.expires_at, sre.status, sre.reward_type
      FROM public.streak_reward_entitlements sre
      WHERE sre.checkout_session_id = v_session.id
        AND sre.user_id = v_session.user_id
        AND sre.status = 'RESERVED'
      FOR UPDATE OF sre
    LOOP
      IF v_ent_discount_rec.expires_at <= clock_timestamp() THEN
        RETURN jsonb_build_object('success', false, 'error', 'STREAK_REWARD_EXPIRED');
      END IF;

      UPDATE public.streak_reward_entitlements
      SET status = 'USED',
          used_at = clock_timestamp()
      WHERE id = v_ent_discount_rec.id;
    END LOOP;
  END IF;

  -- 9. Create Confirmed Booking
  v_booking_id := gen_random_uuid();
  v_points_earned := FLOOR(p_verified_paid_amount_vnd * 0.00025);

  INSERT INTO public.bookings (
    id,
    checkout_session_id,
    user_id,
    room_id,
    check_in,
    check_out,
    check_in_at,
    check_out_at,
    guest_count,
    gross_amount_vnd,
    discount_amount_vnd,
    final_paid_amount_vnd,
    points_earned,
    payment_reference,
    payment_status,
    booking_status
  ) VALUES (
    v_booking_id,
    v_session.id,
    v_session.user_id,
    v_session.room_id,
    v_session.check_in,
    v_session.check_out,
    v_session.check_in_at,
    v_session.check_out_at,
    v_session.guest_count,
    v_session.gross_amount_vnd,
    v_session.discount_amount_vnd,
    p_verified_paid_amount_vnd,
    v_points_earned,
    p_verified_payment_reference,
    'PAID',
    'CONFIRMED'
  );

  -- 10. Persist F&B itemized snapshots
  IF COALESCE(v_session.menu_amount_vnd, 0) > 0 OR EXISTS (
    SELECT 1 FROM public.checkout_session_menu_items WHERE checkout_session_id = v_session.id
  ) THEN
    INSERT INTO public.booking_menu_items (
      id,
      booking_id,
      menu_item_id,
      product_name_snapshot,
      source_type,
      unit_price_vnd,
      quantity,
      total_price_vnd
    )
    SELECT
      gen_random_uuid(),
      v_booking_id,
      csmi.menu_item_id,
      csmi.product_name_snapshot,
      csmi.source_type,
      csmi.unit_price_vnd,
      csmi.quantity,
      csmi.total_price_vnd
    FROM public.checkout_session_menu_items csmi
    WHERE csmi.checkout_session_id = v_session.id;

    -- Mark meal entitlements USED
    UPDATE public.streak_reward_entitlements
    SET status = 'USED',
        used_at = clock_timestamp()
    WHERE checkout_session_id = v_session.id
      AND status = 'RESERVED'
      AND reward_type = 'MEAL_CHOICE';
  END IF;

  -- 11. Create Booking Access Credential (Digital Key)
  v_door_code := LPAD((FLOOR(RANDOM() * 900000) + 100000)::text, 6, '0');
  v_private_instructions := 'Vui lòng chạm sáng bàn phím khóa điện tử, nhập mã PIN 6 số rồi nhấn phím # để mở cửa. Hỗ trợ 24/7 qua hotline Kapi.';

  IF v_session.check_in_at IS NOT NULL THEN
    v_stay_start := v_session.check_in_at - INTERVAL '15 minutes';
    v_stay_end := v_session.check_out_at;
  ELSE
    v_stay_start := (v_session.check_in::text || ' 13:45:00+07')::timestamptz;
    v_stay_end := (v_session.check_out::text || ' 12:00:00+07')::timestamptz;
  END IF;

  INSERT INTO public.booking_access_credentials (
    booking_id,
    credential_type,
    credential_value,
    private_instructions,
    valid_from,
    valid_until
  ) VALUES (
    v_booking_id,
    'PIN_CODE',
    v_door_code,
    v_private_instructions,
    v_stay_start,
    v_stay_end
  );

  -- 12. Record loyalty points ledger
  IF v_points_earned > 0 THEN
    INSERT INTO public.loyalty_points_ledger (
      user_id,
      booking_id,
      points_delta,
      reason
    ) VALUES (
      v_session.user_id,
      v_booking_id,
      v_points_earned,
      'BOOKING_EARNED'
    );
  END IF;

  -- 13. Mark checkout session COMPLETED
  UPDATE public.checkout_sessions
  SET status = 'COMPLETED'
  WHERE id = v_session.id;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', v_booking_id,
    'points_earned', v_points_earned
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_verified_checkout_atomic(UUID, BIGINT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_verified_checkout_atomic(UUID, BIGINT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.finalize_verified_checkout_atomic(UUID, BIGINT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_verified_checkout_atomic(UUID, BIGINT, TEXT) TO service_role;

-- ----------------------------------------------------------------------------
-- 7. RPC: get_admin_property_room_schedule
-- Upgrade to include live temporary holds on the Admin property schedule board.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_property_room_schedule(
  p_property_id UUID,
  p_range_start TIMESTAMPTZ,
  p_range_end TIMESTAMPTZ
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_property_json JSONB;
  v_rooms_json JSONB;
  v_tickets_json JSONB;
BEGIN
  -- 1. Enforce admin role
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.staff_roles WHERE user_id = v_user_id AND role = 'admin'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN_ADMIN_ONLY');
  END IF;

  -- 2. Parameter validation
  IF p_property_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_PROPERTY_ID');
  END IF;

  IF p_range_start IS NULL OR p_range_end IS NULL OR p_range_start >= p_range_end THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_RANGE');
  END IF;

  -- Max 14 days per query range for high performance
  IF (p_range_end - p_range_start) > interval '14 days' THEN
    RETURN jsonb_build_object('success', false, 'error', 'RANGE_TOO_LARGE');
  END IF;

  -- 3. Verify property existence
  SELECT jsonb_build_object(
    'id', id,
    'name', name,
    'address', address
  ) INTO v_property_json
  FROM public.properties
  WHERE id = p_property_id;

  IF v_property_json IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'PROPERTY_NOT_FOUND');
  END IF;

  -- 4. Query rooms, nested bookings, and live temporary holds in the selected range
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'room_id', r.id,
        'room_name', r.name,
        'room_number', r.room_number,
        'floor_number', r.floor_number,
        'operational_status', COALESCE(ro.operational_status, 'ready'),
        'is_listed', r.is_listed,
        'hourly_price_vnd', r.hourly_price_vnd,
        'nightly_price_vnd', r.nightly_price_vnd,
        'capacity', r.capacity,
        'bookings', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'booking_id', b.id,
              'room_id', b.room_id,
              'check_in_at', COALESCE(b.check_in_at, (b.check_in::text || ' 14:00:00+07')::timestamptz),
              'check_out_at', COALESCE(b.check_out_at, (b.check_out::text || ' 12:00:00+07')::timestamptz),
              'booking_status', b.booking_status,
              'payment_status', b.payment_status,
              'guest_name', COALESCE(prof.display_name, 'Khách lưu trú'),
              'guest_count', b.guest_count,
              'menu_item_count', COALESCE((
                SELECT sum(bmi.quantity)
                FROM public.booking_menu_items bmi
                WHERE bmi.booking_id = b.id
              ), 0)
            ) ORDER BY COALESCE(b.check_in_at, (b.check_in::text || ' 14:00:00+07')::timestamptz) ASC
          )
          FROM public.bookings b
          LEFT JOIN public.profiles prof ON prof.id = b.user_id
          WHERE b.room_id = r.id
            AND LOWER(b.booking_status) IN ('confirmed', 'completed')
            AND COALESCE(b.check_in_at, (b.check_in::text || ' 14:00:00+07')::timestamptz) < p_range_end
            AND COALESCE(b.check_out_at, (b.check_out::text || ' 12:00:00+07')::timestamptz) > p_range_start
        ), '[]'::jsonb),
        'holds', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'session_id', cs.id,
              'check_in_at', cs.check_in_at,
              'check_out_at', cs.check_out_at,
              'expires_at', cs.expires_at,
              'status', cs.status
            ) ORDER BY cs.check_in_at ASC
          )
          FROM public.checkout_sessions cs
          WHERE cs.room_id = r.id
            AND cs.status IN ('ACTIVE', 'PAYMENT_PROCESSING')
            AND cs.expires_at > clock_timestamp()
            AND cs.check_in_at < p_range_end
            AND cs.check_out_at > p_range_start
        ), '[]'::jsonb)
      ) ORDER BY r.floor_number ASC NULLS LAST, r.room_number ASC NULLS LAST, r.name ASC
    ),
    '[]'::jsonb
  ) INTO v_rooms_json
  FROM public.rooms r
  LEFT JOIN public.room_operations ro ON ro.room_id = r.id
  WHERE r.property_id = p_property_id;

  -- 5. Query property tickets for secondary operational tab
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'ticket_id', t.id,
        'room_number', r.room_number,
        'category', t.category,
        'description', t.description,
        'status', t.status,
        'created_at', t.created_at,
        'media_paths', t.media_paths
      ) ORDER BY t.created_at DESC
    ),
    '[]'::jsonb
  ) INTO v_tickets_json
  FROM public.tickets t
  JOIN public.rooms r ON r.id = t.room_id
  WHERE r.property_id = p_property_id;

  RETURN jsonb_build_object(
    'success', true,
    'property', v_property_json,
    'rooms', v_rooms_json,
    'tickets', v_tickets_json
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_property_room_schedule(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_property_room_schedule(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;
