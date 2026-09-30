-- ============================================================================
-- Migration: 20260930140000_ensure_auth_user_profiles.sql
-- Description: Ensure 1:1 synchronization between auth.users and public.profiles.
--
-- Root Cause:
-- Non-OAuth users (e.g., email/password, admin invites, staff accounts) did not
-- pass through app/auth/callback/route.ts. When an authenticated user without a
-- row in public.profiles attempted to create a hold or booking, PostgreSQL threw
-- foreign key constraint violation: "checkout_sessions_user_id_fkey".
--
-- Solution:
-- 1. Database trigger on auth.users: Automatically creates a public.profiles row
--    whenever any new auth.users record is created (OAuth, email/pass, admin, etc.).
-- 2. Safe Backfill: Inserts missing public.profiles rows for existing auth.users
--    without overwriting phone numbers or touching staff/admin roles.
-- 3. Defense-in-Depth in create_hourly_checkout_session_atomic: Ensures profile
--    row exists for auth.uid() prior to inserting checkout_sessions.
-- ============================================================================

-- 1. Database trigger function for new auth users
CREATE OR REPLACE FUNCTION public.handle_new_auth_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    display_name,
    avatar_url
  )
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data ->> 'full_name'), ''),
      NULLIF(TRIM(NEW.raw_user_meta_data ->> 'name'), '')
    ),
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data ->> 'avatar_url'), ''),
      NULLIF(TRIM(NEW.raw_user_meta_data ->> 'picture'), '')
    )
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_create_profile
ON auth.users;

CREATE TRIGGER on_auth_user_created_create_profile
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_auth_user_profile();

-- 2. Backfill existing auth users missing profiles safely
INSERT INTO public.profiles (
  id,
  display_name,
  avatar_url
)
SELECT
  u.id,
  COALESCE(
    NULLIF(TRIM(u.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(TRIM(u.raw_user_meta_data ->> 'name'), '')
  ),
  COALESCE(
    NULLIF(TRIM(u.raw_user_meta_data ->> 'avatar_url'), ''),
    NULLIF(TRIM(u.raw_user_meta_data ->> 'picture'), '')
  )
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- 3. Defense-in-depth in create_hourly_checkout_session_atomic
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

  -- Ensure profile row exists for authenticated caller (defense in depth)
  INSERT INTO public.profiles (id)
  VALUES (v_user_id)
  ON CONFLICT (id) DO NOTHING;

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
