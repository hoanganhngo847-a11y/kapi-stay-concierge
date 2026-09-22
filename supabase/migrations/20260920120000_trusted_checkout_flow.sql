-- ============================================================================
-- Migration: 20260920120000_trusted_checkout_flow.sql
-- Description: Canonical trusted checkout boundary, loyalty precision upgrade,
--              booking idempotency link, and security definer RPCs.
-- Architecture Reference: docs/PROJECT_GUIDE.md, docs/ARCHITECTURE.md
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Schema Upgrades: Loyalty Precision & Booking Idempotency Link
-- ----------------------------------------------------------------------------

-- Upgrade points_delta precision from NUMERIC(20,4) to NUMERIC(20,5)
-- to exactly represent booking earn rate 0.00025 without rounding or truncation.
-- Retains existing NOT NULL and CHECK (points_delta <> 0) constraints.
ALTER TABLE public.loyalty_transactions
  ALTER COLUMN points_delta TYPE NUMERIC(20, 5);

-- Durable 1-to-1 link between confirmed booking and originating checkout session.
-- Ensures payment webhook / trusted callback retries cannot create duplicate bookings.
-- NULL is permitted for legacy or mock bookings that lack a checkout session.
ALTER TABLE public.bookings
  ADD COLUMN checkout_session_id UUID NULL
  REFERENCES public.checkout_sessions(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX bookings_checkout_session_id_unique_idx
  ON public.bookings (checkout_session_id)
  WHERE checkout_session_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. Authenticated RPC: create_checkout_session_atomic
-- Preliminary checkout intent creation. Inventory is NOT blocked here.
-- All amounts are strictly server-derived.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_checkout_session_atomic(
  p_room_id UUID,
  p_check_in DATE,
  p_check_out DATE,
  p_guest_count INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_nightly_price BIGINT;
  v_is_listed BOOLEAN;
  v_capacity INTEGER;
  v_nights INTEGER;
  v_gross_amount BIGINT;
  v_session_id UUID;
  v_expires_at TIMESTAMPTZ;
  v_payment_ref TEXT;
  v_expired_rec RECORD;
BEGIN
  -- Caller must be authenticated
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

  -- Validate dates
  IF p_check_in IS NULL OR p_check_out IS NULL OR p_check_out <= p_check_in THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_DATE_RANGE');
  END IF;

  -- Validate guest count
  IF p_guest_count IS NULL OR p_guest_count <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_GUEST_COUNT');
  END IF;

  -- Validate room existence and listing status
  SELECT r.nightly_price_vnd, r.is_listed, r.capacity
  INTO v_nightly_price, v_is_listed, v_capacity
  FROM public.rooms r
  WHERE r.id = p_room_id;

  IF v_nightly_price IS NULL OR v_is_listed IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'ROOM_NOT_FOUND_OR_UNLISTED');
  END IF;

  -- Enforce room capacity server-side
  IF p_guest_count > v_capacity THEN
    RETURN jsonb_build_object('success', false, 'error', 'GUEST_COUNT_EXCEEDS_CAPACITY');
  END IF;

  -- Preliminary availability check (PR #5 alignment)
  -- Note: This is an unreserved preliminary check; finalizer still performs row-lock & re-check.
  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.room_id = p_room_id
      AND LOWER(b.booking_status) IN ('confirmed', 'completed')
      AND b.check_in < p_check_out
      AND b.check_out > p_check_in
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'ROOM_NOT_AVAILABLE');
  END IF;

  -- Opportunistic cleanup of expired sessions owned by caller (ACTIVE only, never touch PAYMENT_PROCESSING)
  FOR v_expired_rec IN
    SELECT cs.id AS session_id
    FROM public.checkout_sessions cs
    WHERE cs.user_id = v_user_id
      AND cs.status = 'ACTIVE'
      AND cs.expires_at <= clock_timestamp()
    FOR UPDATE OF cs
  LOOP
    -- Release attached reserved vouchers
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

  -- Server-derive price
  v_nights := (p_check_out - p_check_in);
  v_gross_amount := v_nightly_price * v_nights;
  v_session_id := gen_random_uuid();

  -- CURRENT IMPLEMENTATION CONVENTION: 30-minute checkout expiry.
  -- Note: This is an implementation convention for checkout flow, not a canonical product rule.
  v_expires_at := clock_timestamp() + INTERVAL '30 minutes';

  -- Deterministic opaque server-derived payment reference from session id
  v_payment_ref := 'KAPI-' || upper(substr(replace(v_session_id::text, '-', ''), 1, 12));

  INSERT INTO public.checkout_sessions (
    id,
    user_id,
    room_id,
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
    p_check_in,
    p_check_out,
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
      'check_in', p_check_in,
      'check_out', p_check_out,
      'guest_count', p_guest_count,
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

-- ----------------------------------------------------------------------------
-- 3. Authenticated RPC: reserve_checkout_voucher_atomic
-- Attaches a user's AVAILABLE voucher to an ACTIVE checkout session.
-- Discount is strictly server-derived and capped at 400,000 VND.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reserve_checkout_voucher_atomic(
  p_checkout_session_id UUID,
  p_voucher_redemption_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_session RECORD;
  v_redemption RECORD;
  v_eligible_base BIGINT;
  v_discount BIGINT;
  v_final_payable BIGINT;
  v_expired_rec RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

  -- Opportunistic cleanup of expired sessions owned by caller (ACTIVE only, never touch PAYMENT_PROCESSING)
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

  -- Lock checkout session FOR UPDATE
  SELECT * INTO v_session
  FROM public.checkout_sessions
  WHERE id = p_checkout_session_id
  FOR UPDATE;

  IF v_session.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'CHECKOUT_SESSION_NOT_FOUND');
  END IF;

  IF v_session.user_id <> v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  IF v_session.status <> 'ACTIVE' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_CHECKOUT_SESSION_STATUS');
  END IF;

  IF v_session.expires_at <= clock_timestamp() THEN
    RETURN jsonb_build_object('success', false, 'error', 'CHECKOUT_SESSION_EXPIRED');
  END IF;

  -- Enforce at most one voucher per checkout session
  IF v_session.discount_amount_vnd > 0 OR EXISTS (
    SELECT 1 FROM public.voucher_redemptions vr
    WHERE vr.checkout_session_id = p_checkout_session_id
      AND vr.status = 'RESERVED'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'VOUCHER_ALREADY_RESERVED');
  END IF;

  -- Lock voucher redemption FOR UPDATE
  SELECT vr.*, v.is_active AS def_is_active, v.voucher_type, v.discount_percentage, v.max_eligible_base_vnd
  INTO v_redemption
  FROM public.voucher_redemptions vr
  JOIN public.vouchers v ON v.id = vr.voucher_id
  WHERE vr.id = p_voucher_redemption_id
  FOR UPDATE OF vr;

  IF v_redemption.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'VOUCHER_NOT_FOUND');
  END IF;

  IF v_redemption.user_id <> v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  IF v_redemption.status <> 'AVAILABLE' THEN
    RETURN jsonb_build_object('success', false, 'error', 'VOUCHER_NOT_AVAILABLE');
  END IF;

  IF v_redemption.expires_at <= clock_timestamp() THEN
    UPDATE public.voucher_redemptions
    SET status = 'EXPIRED'
    WHERE id = v_redemption.id;

    RETURN jsonb_build_object('success', false, 'error', 'VOUCHER_EXPIRED');
  END IF;

  -- Validate canonical voucher definition
  IF v_redemption.def_is_active IS NOT TRUE
     OR v_redemption.voucher_type <> 'percentage_discount'
     OR v_redemption.discount_percentage <> 40.00
     OR v_redemption.max_eligible_base_vnd <> 1000000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'VOUCHER_DEFINITION_INVALID');
  END IF;

  -- Server-derive discount using canonical constants:
  -- Canonical voucher rule: 40% * min(gross, 1,000,000 VND), max 400,000 VND.
  -- Rounding to whole VND is current implementation convention.
  v_eligible_base := LEAST(v_session.gross_amount_vnd, 1000000::bigint);
  v_discount := LEAST(
    ROUND(v_eligible_base::numeric * 0.40)::bigint,
    400000::bigint,
    v_session.gross_amount_vnd
  );
  v_final_payable := v_session.gross_amount_vnd - v_discount;

  -- Single source of truth for reservation: voucher_redemptions.checkout_session_id
  UPDATE public.voucher_redemptions
  SET status = 'RESERVED',
      checkout_session_id = p_checkout_session_id,
      discount_amount_vnd = v_discount
  WHERE id = p_voucher_redemption_id;

  UPDATE public.checkout_sessions
  SET discount_amount_vnd = v_discount,
      final_payable_amount_vnd = v_final_payable
  WHERE id = p_checkout_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'voucher_redemption_id', p_voucher_redemption_id,
    'checkout_session', jsonb_build_object(
      'id', v_session.id,
      'gross_amount_vnd', v_session.gross_amount_vnd,
      'discount_amount_vnd', v_discount,
      'final_payable_amount_vnd', v_final_payable,
      'status', v_session.status,
      'expires_at', v_session.expires_at,
      'payment_reference', v_session.payment_reference
    )
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Authenticated RPC: release_checkout_voucher_atomic
-- Explicitly releases an attached RESERVED voucher back to AVAILABLE (or EXPIRED)
-- without refunding redemption points.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.release_checkout_voucher_atomic(
  p_checkout_session_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_session RECORD;
  v_redemption RECORD;
  v_target_status TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

  SELECT * INTO v_session
  FROM public.checkout_sessions
  WHERE id = p_checkout_session_id
  FOR UPDATE;

  IF v_session.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'CHECKOUT_SESSION_NOT_FOUND');
  END IF;

  IF v_session.user_id <> v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  IF v_session.status <> 'ACTIVE' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_CHECKOUT_SESSION_STATUS');
  END IF;

  SELECT * INTO v_redemption
  FROM public.voucher_redemptions
  WHERE checkout_session_id = p_checkout_session_id
    AND status = 'RESERVED'
    AND user_id = v_user_id
  FOR UPDATE;

  IF v_redemption.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_RESERVED_VOUCHER_ATTACHED');
  END IF;

  IF v_redemption.expires_at > clock_timestamp() THEN
    v_target_status := 'AVAILABLE';
  ELSE
    v_target_status := 'EXPIRED';
  END IF;

  UPDATE public.voucher_redemptions
  SET status = v_target_status,
      checkout_session_id = NULL,
      discount_amount_vnd = NULL
  WHERE id = v_redemption.id;

  UPDATE public.checkout_sessions
  SET discount_amount_vnd = 0,
      final_payable_amount_vnd = gross_amount_vnd
  WHERE id = p_checkout_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'released_voucher_id', v_redemption.id,
    'voucher_status', v_target_status,
    'checkout_session', jsonb_build_object(
      'id', v_session.id,
      'gross_amount_vnd', v_session.gross_amount_vnd,
      'discount_amount_vnd', 0,
      'final_payable_amount_vnd', v_session.gross_amount_vnd
    )
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Trusted Service RPC: finalize_verified_checkout_atomic
-- TRUSTED PAYMENT BACKEND RPC (service_role ONLY).
-- Called strictly after external payment layer has verified 100% full payment.
-- Atomically validates payment facts, serializes room inventory, confirms booking,
-- marks voucher USED, records booking_earn loyalty transaction, and marks session COMPLETED.
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
  WHERE r.id = v_session.room_id
  FOR UPDATE;

  IF v_room.id IS NULL OR v_room.is_listed IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'ROOM_NOT_AVAILABLE');
  END IF;

  -- Re-validate room capacity at finalization time
  IF v_session.guest_count > v_room.capacity THEN
    RETURN jsonb_build_object('success', false, 'error', 'GUEST_COUNT_EXCEEDS_CAPACITY');
  END IF;

  -- Re-check inventory availability for confirmed / completed stays (case-insensitive booking_status)
  -- Overlap condition: existing.check_in < requested.check_out AND existing.check_out > requested.check_in
  IF EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.room_id = v_session.room_id
      AND LOWER(b.booking_status) IN ('confirmed', 'completed')
      AND b.check_in < v_session.check_out
      AND b.check_out > v_session.check_in
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'ROOM_NOT_AVAILABLE');
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
    v_session.check_in,
    v_session.check_out,
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
  -- Rate: 1 VND = 0.00025 point (exact numeric calculation)
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
      'check_in', v_session.check_in,
      'check_out', v_session.check_out,
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

-- ----------------------------------------------------------------------------
-- 6. Strict Least-Privilege Permissions
-- ----------------------------------------------------------------------------

-- create_checkout_session_atomic
REVOKE ALL ON FUNCTION public.create_checkout_session_atomic(UUID, DATE, DATE, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_checkout_session_atomic(UUID, DATE, DATE, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_checkout_session_atomic(UUID, DATE, DATE, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_checkout_session_atomic(UUID, DATE, DATE, INTEGER) TO service_role;

-- reserve_checkout_voucher_atomic
REVOKE ALL ON FUNCTION public.reserve_checkout_voucher_atomic(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_checkout_voucher_atomic(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.reserve_checkout_voucher_atomic(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_checkout_voucher_atomic(UUID, UUID) TO service_role;

-- release_checkout_voucher_atomic
REVOKE ALL ON FUNCTION public.release_checkout_voucher_atomic(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_checkout_voucher_atomic(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.release_checkout_voucher_atomic(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_checkout_voucher_atomic(UUID) TO service_role;

-- finalize_verified_checkout_atomic: Strictly service_role ONLY
REVOKE ALL ON FUNCTION public.finalize_verified_checkout_atomic(UUID, BIGINT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_verified_checkout_atomic(UUID, BIGINT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.finalize_verified_checkout_atomic(UUID, BIGINT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_verified_checkout_atomic(UUID, BIGINT, TEXT) TO service_role;
