-- ============================================================================
-- Migration: 20260930130000_remove_guest_count_booking_requirement.sql
-- Description: Remove guest count requirement and capacity constraints from public booking flow.
--
-- Details:
--   1. Make guest_count NULLABLE on public.checkout_sessions and public.bookings.
--   2. Update CHECK constraint to allow NULL (guest_count IS NULL OR guest_count > 0).
--   3. Historical bookings and sessions preserve their existing guest_count values.
--   4. Update create_hourly_checkout_session_atomic:
--      - p_guest_count defaults to NULL.
--      - Remove INVALID_GUEST_COUNT validation.
--      - Remove GUEST_COUNT_EXCEEDS_CAPACITY validation (room capacity no longer blocks bookings).
--      - Store NULL for guest_count in new checkout sessions.
--   5. Maintain all advisory locks, 30m hold expiry, multi-day support, and sanitized semantics.
-- ============================================================================

-- 1. Make guest_count nullable and update check constraints
ALTER TABLE public.checkout_sessions
  ALTER COLUMN guest_count DROP NOT NULL;

ALTER TABLE public.checkout_sessions
  DROP CONSTRAINT IF EXISTS checkout_sessions_guest_count_check,
  ADD CONSTRAINT checkout_sessions_guest_count_check CHECK (guest_count IS NULL OR guest_count > 0);

ALTER TABLE public.bookings
  ALTER COLUMN guest_count DROP NOT NULL;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_guest_count_check,
  ADD CONSTRAINT bookings_guest_count_check CHECK (guest_count IS NULL OR guest_count > 0);

-- 2. Update create_hourly_checkout_session_atomic RPC
CREATE OR REPLACE FUNCTION public.create_hourly_checkout_session_atomic(
  p_room_id UUID,
  p_check_in_at TIMESTAMPTZ,
  p_check_out_at TIMESTAMPTZ,
  p_guest_count INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_hourly_price BIGINT;
  v_is_listed BOOLEAN;
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

  -- Multi-day hourly stays beyond 24 hours are permitted (capped only by public 14-day booking horizon).

  -- Disallow bookings starting in the past (with 5-minute clock skew leeway)
  IF p_check_in_at < (clock_timestamp() - INTERVAL '5 minutes') THEN
    RETURN jsonb_build_object('success', false, 'error', 'CANNOT_BOOK_IN_PAST');
  END IF;

  -- Validate room existence, active parent property, and listing status
  -- Note: room.capacity is no longer queried for customer booking validation
  SELECT r.hourly_price_vnd, r.is_listed
  INTO v_hourly_price, v_is_listed
  FROM public.rooms r
  JOIN public.properties p ON p.id = r.property_id
  WHERE r.id = p_room_id AND p.is_active = true;

  IF v_hourly_price IS NULL OR v_is_listed IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'ROOM_NOT_FOUND_OR_UNLISTED');
  END IF;

  -- -------------------------------------------------------------------------
  -- CRITICAL CONCURRENCY LOCK:
  -- Serialize competing hold attempts for the same room using transaction advisory lock.
  -- -------------------------------------------------------------------------
  PERFORM pg_advisory_xact_lock(hashtext(p_room_id::text));

  -- Re-check confirmed / completed bookings overlap across entire multi-day interval
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

  -- Re-check room availability blocks overlap across entire multi-day interval
  IF EXISTS (
    SELECT 1
    FROM public.room_availability_blocks rab
    WHERE rab.room_id = p_room_id
      AND rab.starts_at < p_check_out_at
      AND rab.ends_at > p_check_in_at
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'ROOM_NOT_AVAILABLE');
  END IF;

  -- Re-check active temporary holds in checkout_sessions across entire multi-day interval
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
    NULL, -- Guest count is no longer collected; stores NULL for new bookings
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
      'guest_count', NULL,
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
