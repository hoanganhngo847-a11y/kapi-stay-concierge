-- ============================================================================
-- Migration: 20260928120000_hourly_booking_model.sql
-- Description: Transition from nightly to hourly booking model, additive schema
--              extensions, availability blocks table, hourly availability RPC,
--              and hourly trusted checkout flow with idempotency.
-- Architecture Reference: docs/PROJECT_GUIDE.md, docs/ARCHITECTURE.md
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Schema Extensions on public.rooms (Additive: hourly_price_vnd)
-- ----------------------------------------------------------------------------

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS hourly_price_vnd BIGINT NULL;

-- Backfill hourly_price_vnd for any existing legacy rooms (e.g. nightly_price / 5)
UPDATE public.rooms
SET hourly_price_vnd = GREATEST(90000, ROUND(nightly_price_vnd / 5))
WHERE hourly_price_vnd IS NULL;

ALTER TABLE public.rooms
  ALTER COLUMN hourly_price_vnd SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rooms_hourly_price_vnd_check'
  ) THEN
    ALTER TABLE public.rooms
      ADD CONSTRAINT rooms_hourly_price_vnd_check CHECK (hourly_price_vnd > 0);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. New Table: public.room_availability_blocks
-- Clean design for operational & demo blockages without fake auth users.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.room_availability_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('BOOKED', 'MAINTENANCE', 'HOUSEKEEPING', 'OWNER_BLOCK')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT room_availability_blocks_time_order CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_room_availability_blocks_room_dates
  ON public.room_availability_blocks (room_id, starts_at, ends_at);

ALTER TABLE public.room_availability_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public availability blocks are viewable by everyone"
  ON public.room_availability_blocks;

CREATE POLICY "Public availability blocks are viewable by everyone"
  ON public.room_availability_blocks FOR SELECT
  TO anon, authenticated
  USING (true);

REVOKE ALL ON TABLE public.room_availability_blocks FROM PUBLIC;
GRANT SELECT ON TABLE public.room_availability_blocks TO anon, authenticated;
GRANT ALL ON TABLE public.room_availability_blocks TO service_role;

-- ----------------------------------------------------------------------------
-- 3. Schema Extensions on public.checkout_sessions (Additive: check_in_at, check_out_at)
-- ----------------------------------------------------------------------------

ALTER TABLE public.checkout_sessions
  ADD COLUMN IF NOT EXISTS check_in_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS check_out_at TIMESTAMPTZ NULL;

-- Allow legacy date columns to be nullable for hourly-only flows
ALTER TABLE public.checkout_sessions
  ALTER COLUMN check_in DROP NOT NULL,
  ALTER COLUMN check_out DROP NOT NULL;

-- Drop legacy date strict inequality constraint to permit same-day hourly bookings
ALTER TABLE public.checkout_sessions
  DROP CONSTRAINT IF EXISTS checkout_sessions_date_order;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'checkout_sessions_datetime_order'
  ) THEN
    ALTER TABLE public.checkout_sessions
      ADD CONSTRAINT checkout_sessions_datetime_order
      CHECK (check_out_at IS NULL OR check_in_at IS NULL OR check_out_at > check_in_at);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_checkout_sessions_room_dates
  ON public.checkout_sessions (room_id, check_in_at, check_out_at);

-- ----------------------------------------------------------------------------
-- 4. Schema Extensions on public.bookings (Additive: check_in_at, check_out_at)
-- ----------------------------------------------------------------------------

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS check_in_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS check_out_at TIMESTAMPTZ NULL;

-- Allow legacy date columns to be nullable for hourly-only flows
ALTER TABLE public.bookings
  ALTER COLUMN check_in DROP NOT NULL,
  ALTER COLUMN check_out DROP NOT NULL;

-- Drop legacy date strict inequality constraint to permit same-day hourly bookings
ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_date_order;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_datetime_order'
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_datetime_order
      CHECK (check_out_at IS NULL OR check_in_at IS NULL OR check_out_at > check_in_at);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bookings_room_dates
  ON public.bookings (room_id, check_in_at, check_out_at);

-- Backfill legacy records if any
UPDATE public.checkout_sessions
SET check_in_at = (check_in::text || ' 14:00:00+07')::timestamptz,
    check_out_at = (check_out::text || ' 12:00:00+07')::timestamptz
WHERE check_in_at IS NULL AND check_in IS NOT NULL AND check_out IS NOT NULL;

UPDATE public.bookings
SET check_in_at = (check_in::text || ' 14:00:00+07')::timestamptz,
    check_out_at = (check_out::text || ' 12:00:00+07')::timestamptz
WHERE check_in_at IS NULL AND check_in IS NOT NULL AND check_out IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 5. RPC: check_room_availability_hourly
-- Canonical timestamp availability check respecting bookings & availability blocks.
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

  -- Check confirmed / completed bookings overlap
  -- Overlap standard: existing.start < requested.end AND existing.end > requested.start
  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.room_id = p_room_id
      AND LOWER(b.booking_status) IN ('confirmed', 'completed')
      AND (
        -- Modern hourly bookings with check_in_at and check_out_at
        (b.check_in_at IS NOT NULL AND b.check_out_at IS NOT NULL
         AND b.check_in_at < p_check_out_at AND b.check_out_at > p_check_in_at)
        OR
        -- Legacy date bookings
        (b.check_in_at IS NULL
         AND b.check_in < (p_check_out_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
         AND b.check_out > (p_check_in_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
      )
  ) THEN
    RETURN FALSE;
  END IF;

  -- Check room availability blocks overlap
  IF EXISTS (
    SELECT 1
    FROM public.room_availability_blocks rab
    WHERE rab.room_id = p_room_id
      AND rab.starts_at < p_check_out_at
      AND rab.ends_at > p_check_in_at
  ) THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.check_room_availability_hourly(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_room_availability_hourly(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6. RPC: create_hourly_checkout_session_atomic
-- Preliminary checkout intent creation for hourly bookings.
-- All amounts derived strictly server-side from rooms.hourly_price_vnd.
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

  -- Disallow bookings starting in the past
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

  -- Preliminary availability check (bookings & availability blocks)
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
  ) OR EXISTS (
    SELECT 1
    FROM public.room_availability_blocks rab
    WHERE rab.room_id = p_room_id
      AND rab.starts_at < p_check_out_at
      AND rab.ends_at > p_check_in_at
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'ROOM_NOT_AVAILABLE');
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

  -- 30-minute checkout expiry convention
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
      'status', 'ACTIVE',
      'expires_at', v_expires_at,
      'payment_reference', v_payment_ref
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_hourly_checkout_session_atomic(UUID, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_hourly_checkout_session_atomic(UUID, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_hourly_checkout_session_atomic(UUID, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_hourly_checkout_session_atomic(UUID, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) TO service_role;

-- ----------------------------------------------------------------------------
-- 7. Upgrade finalize_verified_checkout_atomic
-- Supports hourly interval verification, row locking, idempotency,
-- and availability blocks checking.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.finalize_verified_checkout_atomic(
  p_checkout_session_id UUID,
  p_verified_paid_amount_vnd BIGINT,
  p_verified_payment_reference TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session RECORD;
  v_existing_booking RECORD;
  v_room RECORD;
  v_redemption_id UUID := NULL;
  v_redemption_expires_at TIMESTAMPTZ;
  v_redemption_discount BIGINT;
  v_voucher_is_active BOOLEAN;
  v_voucher_type TEXT;
  v_discount_percentage NUMERIC(5, 2);
  v_max_eligible_base_vnd BIGINT;
  v_booking_id UUID;
  v_points_earned NUMERIC(20, 5);
BEGIN
  -- 1. Lock checkout session FOR UPDATE
  SELECT * INTO v_session
  FROM public.checkout_sessions
  WHERE id = p_checkout_session_id
  FOR UPDATE;

  IF v_session.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'CHECKOUT_SESSION_NOT_FOUND');
  END IF;

  -- 2. Idempotency Check: if session is already COMPLETED
  IF v_session.status = 'COMPLETED' THEN
    SELECT * INTO v_existing_booking
    FROM public.bookings
    WHERE checkout_session_id = p_checkout_session_id;

    IF v_existing_booking.id IS NOT NULL THEN
      IF v_existing_booking.final_paid_amount_vnd = p_verified_paid_amount_vnd
         AND v_session.payment_reference = p_verified_payment_reference THEN
        RETURN jsonb_build_object(
          'success', true,
          'idempotent', true,
          'booking', jsonb_build_object(
            'id', v_existing_booking.id,
            'checkout_session_id', v_existing_booking.checkout_session_id,
            'user_id', v_existing_booking.user_id,
            'room_id', v_existing_booking.room_id,
            'check_in_at', v_existing_booking.check_in_at,
            'check_out_at', v_existing_booking.check_out_at,
            'check_in', v_existing_booking.check_in,
            'check_out', v_existing_booking.check_out,
            'guest_count', v_existing_booking.guest_count,
            'gross_amount_vnd', v_existing_booking.gross_amount_vnd,
            'discount_amount_vnd', v_existing_booking.discount_amount_vnd,
            'final_paid_amount_vnd', v_existing_booking.final_paid_amount_vnd,
            'payment_status', v_existing_booking.payment_status,
            'booking_status', v_existing_booking.booking_status
          )
        );
      ELSE
        RETURN jsonb_build_object('success', false, 'error', 'VERIFIED_AMOUNT_OR_REFERENCE_MISMATCH_ON_COMPLETED');
      END IF;
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'COMPLETED_SESSION_WITHOUT_BOOKING');
    END IF;
  END IF;

  -- 3. Validate checkout session status
  IF v_session.status NOT IN ('ACTIVE', 'PAYMENT_PROCESSING') THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_CHECKOUT_SESSION_STATUS');
  END IF;

  -- 4. Validate expiration
  IF v_session.expires_at <= clock_timestamp() THEN
    RETURN jsonb_build_object('success', false, 'error', 'CHECKOUT_SESSION_EXPIRED');
  END IF;

  -- 5. Validate payment reference
  IF p_verified_payment_reference IS NULL
     OR trim(p_verified_payment_reference) = ''
     OR p_verified_payment_reference <> v_session.payment_reference THEN
    RETURN jsonb_build_object('success', false, 'error', 'PAYMENT_REFERENCE_MISMATCH');
  END IF;

  -- 6. Validate payment amount (must match final payable amount exactly)
  IF p_verified_paid_amount_vnd IS NULL
     OR p_verified_paid_amount_vnd <> v_session.final_payable_amount_vnd THEN
    RETURN jsonb_build_object('success', false, 'error', 'VERIFIED_AMOUNT_MISMATCH');
  END IF;

  -- 7. Lock Room row FOR UPDATE to serialize concurrent finalizations for the same room
  SELECT r.id, r.is_listed, r.capacity INTO v_room
  FROM public.rooms r
  JOIN public.properties p ON p.id = r.property_id
  WHERE r.id = v_session.room_id AND p.is_active = true
  FOR UPDATE OF r;

  IF v_room.id IS NULL OR v_room.is_listed IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'ROOM_NOT_AVAILABLE');
  END IF;

  -- Re-validate room capacity at finalization time
  IF v_session.guest_count > v_room.capacity THEN
    RETURN jsonb_build_object('success', false, 'error', 'GUEST_COUNT_EXCEEDS_CAPACITY');
  END IF;

  -- Re-check inventory availability for confirmed / completed stays
  -- Supports both hourly timestamps and legacy date sessions
  IF v_session.check_in_at IS NOT NULL AND v_session.check_out_at IS NOT NULL THEN
    -- Check bookings overlap
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

    -- Check availability blocks overlap
    IF EXISTS (
      SELECT 1 FROM public.room_availability_blocks rab
      WHERE rab.room_id = v_session.room_id
        AND rab.starts_at < v_session.check_out_at
        AND rab.ends_at > v_session.check_in_at
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'ROOM_NOT_AVAILABLE');
    END IF;
  ELSE
    -- Legacy date check
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

  -- 8. Validate Voucher state
  IF v_session.discount_amount_vnd > 0 THEN
    SELECT vr.id, vr.expires_at, vr.discount_amount_vnd, v.is_active, v.voucher_type, v.discount_percentage, v.max_eligible_base_vnd
    INTO v_redemption_id, v_redemption_expires_at, v_redemption_discount, v_voucher_is_active, v_voucher_type, v_discount_percentage, v_max_eligible_base_vnd
    FROM public.voucher_redemptions vr
    JOIN public.vouchers v ON v.id = vr.voucher_id
    WHERE vr.checkout_session_id = v_session.id
      AND vr.status = 'RESERVED'
      AND vr.user_id = v_session.user_id
    FOR UPDATE OF vr;

    IF v_redemption_id IS NULL
       OR v_redemption_expires_at <= clock_timestamp()
       OR v_redemption_discount <> v_session.discount_amount_vnd
       OR v_voucher_is_active IS NOT TRUE
       OR v_voucher_type <> 'percentage_discount'
       OR v_discount_percentage <> 40.00
       OR v_max_eligible_base_vnd <> 1000000 THEN
      RETURN jsonb_build_object('success', false, 'error', 'VOUCHER_STATE_INVALID');
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.voucher_redemptions vr
      WHERE vr.checkout_session_id = v_session.id
        AND vr.status = 'RESERVED'
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'VOUCHER_STATE_INVALID');
    END IF;
  END IF;

  -- 9. Create confirmed Booking using canonical columns
  v_booking_id := gen_random_uuid();

  INSERT INTO public.bookings (
    id,
    checkout_session_id,
    user_id,
    room_id,
    check_in_at,
    check_out_at,
    check_in,
    check_out,
    guest_count,
    gross_amount_vnd,
    discount_amount_vnd,
    final_paid_amount_vnd,
    payment_status,
    booking_status
  ) VALUES (
    v_booking_id,
    v_session.id,
    v_session.user_id,
    v_session.room_id,
    v_session.check_in_at,
    v_session.check_out_at,
    COALESCE(v_session.check_in, (v_session.check_in_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date),
    COALESCE(v_session.check_out, (v_session.check_out_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date),
    v_session.guest_count,
    v_session.gross_amount_vnd,
    v_session.discount_amount_vnd,
    p_verified_paid_amount_vnd,
    'paid',
    'confirmed'
  );

  -- 10. Transition reserved voucher to USED
  IF v_session.discount_amount_vnd > 0 AND v_redemption_id IS NOT NULL THEN
    UPDATE public.voucher_redemptions
    SET status = 'USED',
        booking_id = v_booking_id,
        used_at = clock_timestamp()
    WHERE id = v_redemption_id;
  END IF;

  -- 11. Append booking_earn to loyalty_transactions ledger
  -- Points base: actual final paid amount after voucher discount
  -- Rate: 1 VND = 0.00025 point
  v_points_earned := (p_verified_paid_amount_vnd::NUMERIC * 0.00025::NUMERIC);

  IF v_points_earned > 0 THEN
    INSERT INTO public.loyalty_transactions (
      user_id,
      type,
      points_delta,
      booking_id,
      description
    ) VALUES (
      v_session.user_id,
      'booking_earn',
      v_points_earned,
      v_booking_id,
      'Booking earn for confirmed booking ' || v_booking_id::TEXT
    );
  END IF;

  -- 12. Complete checkout session
  UPDATE public.checkout_sessions
  SET status = 'COMPLETED'
  WHERE id = v_session.id;

  RETURN jsonb_build_object(
    'success', true,
    'booking', jsonb_build_object(
      'id', v_booking_id,
      'checkout_session_id', v_session.id,
      'user_id', v_session.user_id,
      'room_id', v_session.room_id,
      'check_in_at', v_session.check_in_at,
      'check_out_at', v_session.check_out_at,
      'check_in', COALESCE(v_session.check_in, (v_session.check_in_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date),
      'check_out', COALESCE(v_session.check_out, (v_session.check_out_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date),
      'guest_count', v_session.guest_count,
      'gross_amount_vnd', v_session.gross_amount_vnd,
      'discount_amount_vnd', v_session.discount_amount_vnd,
      'final_paid_amount_vnd', p_verified_paid_amount_vnd,
      'payment_status', 'paid',
      'booking_status', 'confirmed'
    ),
    'voucher_redemption_id', v_redemption_id,
    'points_earned', v_points_earned
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_verified_checkout_atomic(UUID, BIGINT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_verified_checkout_atomic(UUID, BIGINT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.finalize_verified_checkout_atomic(UUID, BIGINT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_verified_checkout_atomic(UUID, BIGINT, TEXT) TO service_role;

-- ----------------------------------------------------------------------------
-- 5. FUNCTION public.get_staff_dashboard_data (Hourly Upgrade)
-- Includes check_in_at, check_out_at, exact hourly arrival/departure info
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
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', b.id,
        'room_id', b.room_id,
        'room_name', r.name,
        'user_id', b.user_id,
        'guest_name', p.display_name,
        'guest_phone', p.phone,
        'check_in', b.check_in,
        'check_out', b.check_out,
        'check_in_at', b.check_in_at,
        'check_out_at', b.check_out_at,
        'guest_count', b.guest_count,
        'booking_status', b.booking_status,
        'payment_status', b.payment_status,
        'is_checkin_today', (
            CASE
                WHEN b.check_in_at IS NOT NULL THEN (b.check_in_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE = v_today
                ELSE (b.check_in = v_today)
            END
        ),
        'is_checkout_today', (
            CASE
                WHEN b.check_out_at IS NOT NULL THEN (b.check_out_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE = v_today
                ELSE (b.check_out = v_today)
            END
        )
    ) ORDER BY COALESCE(b.check_in_at, (b.check_in::text || ' 14:00:00+07')::timestamptz) ASC), '[]'::jsonb)
    INTO v_today_bookings
    FROM public.bookings b
    LEFT JOIN public.rooms r ON b.room_id = r.id
    LEFT JOIN public.profiles p ON b.user_id = p.id
    WHERE (
        (b.check_in_at IS NOT NULL AND (
            (b.check_in_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE = v_today
            OR (b.check_out_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE = v_today
        ))
        OR (b.check_in_at IS NULL AND (b.check_in = v_today OR b.check_out = v_today))
    )
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

REVOKE ALL ON FUNCTION public.get_staff_dashboard_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_staff_dashboard_data() TO authenticated, service_role;

