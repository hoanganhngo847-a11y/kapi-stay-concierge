-- ============================================================================
-- Migration: 20260929080000_kapi_rewards_actions.sql
-- Module: Kapi Rewards & Loyalty Actions
-- Target: Supabase PostgreSQL
-- Rules:
--   - STRICT Least Privilege: SECURITY DEFINER, SET search_path = ''
--   - All database tables fully qualified: public.*
--   - Revoke PUBLIC and anon, grant authenticated and service_role
--   - Asia/Ho_Chi_Minh timezone calendar day for daily check-in
--   - Points ledger is the single source of truth: SUM(points_delta)
--   - Row locks on public.profiles to serialize concurrent user loyalty requests
--   - 500 points = 1 voucher 40% (max eligible base 1,000,000 VND, max 400,000 VND)
--   - 24-hour expiration from issuance
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Ensure canonical 40% Loyalty Voucher definition exists
-- ----------------------------------------------------------------------------
INSERT INTO public.vouchers (
  id,
  name,
  voucher_type,
  points_cost,
  discount_percentage,
  max_eligible_base_vnd,
  is_active
) VALUES (
  '99999999-9999-9999-9999-999999999999',
  'Voucher Giảm 40% (Tối đa 400.000đ)',
  'percentage_discount',
  500.0000,
  40.00,
  1000000,
  true
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  voucher_type = EXCLUDED.voucher_type,
  points_cost = EXCLUDED.points_cost,
  discount_percentage = EXCLUDED.discount_percentage,
  max_eligible_base_vnd = EXCLUDED.max_eligible_base_vnd,
  is_active = EXCLUDED.is_active;

-- ----------------------------------------------------------------------------
-- 2. Authenticated RPC: claim_daily_reward()
-- Rewards +5 points once per Asia/Ho_Chi_Minh calendar day per authenticated user.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_daily_reward()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_today DATE;
  v_checkin_id UUID;
  v_existing_checkin_id UUID;
  v_balance NUMERIC(20, 5);
BEGIN
  -- 1. Authenticated user validation
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

  -- 2. Serialize user loyalty writes using profile row lock
  PERFORM 1 FROM public.profiles WHERE id = v_user_id FOR UPDATE;

  -- 3. Determine calendar day in Vietnam time (Asia/Ho_Chi_Minh)
  v_today := (clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE;

  -- 4. Check if user already claimed reward today
  SELECT id INTO v_existing_checkin_id
  FROM public.daily_checkins
  WHERE user_id = v_user_id AND checkin_date = v_today;

  IF v_existing_checkin_id IS NOT NULL THEN
    SELECT COALESCE(SUM(points_delta), 0) INTO v_balance
    FROM public.loyalty_transactions
    WHERE user_id = v_user_id;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'ALREADY_CLAIMED_TODAY',
      'already_claimed', true,
      'points_balance', v_balance,
      'checkin_date', v_today
    );
  END IF;

  -- 5. Record daily check-in and append to loyalty ledger atomically
  v_checkin_id := gen_random_uuid();

  INSERT INTO public.daily_checkins (
    id,
    user_id,
    checkin_date,
    reward_points,
    created_at
  ) VALUES (
    v_checkin_id,
    v_user_id,
    v_today,
    5.0000,
    clock_timestamp()
  );

  INSERT INTO public.loyalty_transactions (
    user_id,
    type,
    points_delta,
    daily_checkin_id,
    description,
    created_at
  ) VALUES (
    v_user_id,
    'daily_checkin_earn',
    5.00000,
    v_checkin_id,
    'Điểm danh hằng ngày +5 điểm (' || to_char(v_today, 'DD/MM/YYYY') || ')',
    clock_timestamp()
  );

  -- 6. Return updated point balance
  SELECT COALESCE(SUM(points_delta), 0) INTO v_balance
  FROM public.loyalty_transactions
  WHERE user_id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'points_added', 5,
    'points_balance', v_balance,
    'checkin_date', v_today
  );

EXCEPTION
  WHEN unique_violation THEN
    SELECT COALESCE(SUM(points_delta), 0) INTO v_balance
    FROM public.loyalty_transactions
    WHERE user_id = v_user_id;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'ALREADY_CLAIMED_TODAY',
      'already_claimed', true,
      'points_balance', v_balance,
      'checkin_date', v_today
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Authenticated RPC: redeem_loyalty_voucher()
-- Deducts 500 points from ledger and issues 1 Voucher 40% valid for 24 hours.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.redeem_loyalty_voucher()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_balance NUMERIC(20, 5);
  v_voucher RECORD;
  v_redemption_id UUID;
  v_issued_at TIMESTAMPTZ;
  v_expires_at TIMESTAMPTZ;
  v_new_balance NUMERIC(20, 5);
BEGIN
  -- 1. Authenticated user validation
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

  -- 2. Serialize user loyalty writes using profile row lock
  PERFORM 1 FROM public.profiles WHERE id = v_user_id FOR UPDATE;

  -- 3. Calculate current point balance strictly from ledger
  SELECT COALESCE(SUM(points_delta), 0) INTO v_balance
  FROM public.loyalty_transactions
  WHERE user_id = v_user_id;

  -- 4. Validate sufficient points
  IF v_balance < 500 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INSUFFICIENT_POINTS',
      'points_balance', v_balance,
      'points_needed', (500 - v_balance)
    );
  END IF;

  -- 5. Find active canonical loyalty voucher definition
  SELECT id, points_cost, discount_percentage, max_eligible_base_vnd
  INTO v_voucher
  FROM public.vouchers
  WHERE is_active = true
    AND voucher_type = 'percentage_discount'
    AND points_cost = 500.0000
    AND discount_percentage = 40.00
    AND max_eligible_base_vnd = 1000000
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_voucher.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'VOUCHER_TEMPLATE_NOT_FOUND');
  END IF;

  -- 6. Issue voucher redemption valid for exactly 24 hours
  v_redemption_id := gen_random_uuid();
  v_issued_at := clock_timestamp();
  v_expires_at := v_issued_at + INTERVAL '24 hours';

  INSERT INTO public.voucher_redemptions (
    id,
    voucher_id,
    user_id,
    checkout_session_id,
    status,
    issued_at,
    expires_at
  ) VALUES (
    v_redemption_id,
    v_voucher.id,
    v_user_id,
    NULL,
    'AVAILABLE',
    v_issued_at,
    v_expires_at
  );

  -- 7. Deduct 500 points in append-only loyalty ledger
  INSERT INTO public.loyalty_transactions (
    user_id,
    type,
    points_delta,
    voucher_redemption_id,
    description,
    created_at
  ) VALUES (
    v_user_id,
    'voucher_redeem',
    -500.00000,
    v_redemption_id,
    'Đổi 500 điểm lấy Voucher giảm giá 40% (Tối đa 400.000đ)',
    v_issued_at
  );

  v_new_balance := v_balance - 500;

  RETURN jsonb_build_object(
    'success', true,
    'redemption_id', v_redemption_id,
    'points_deducted', 500,
    'points_balance', v_new_balance,
    'expires_at', v_expires_at
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Authenticated RPC: get_my_rewards_summary()
-- Aggregates point balance, check-in status, and active vouchers for caller.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_rewards_summary()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_balance NUMERIC(20, 5);
  v_today DATE;
  v_has_checked_in BOOLEAN;
  v_available_count INT;
  v_points_needed NUMERIC(20, 5);
  v_redeemable_vouchers_count INT;
  v_vouchers JSONB;
  v_recent_transactions JSONB;
BEGIN
  -- 1. Authenticated user validation
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

  -- 2. Opportunistically mark expired AVAILABLE vouchers for this user
  UPDATE public.voucher_redemptions
  SET status = 'EXPIRED'
  WHERE user_id = v_user_id
    AND status = 'AVAILABLE'
    AND expires_at <= clock_timestamp();

  -- 3. Calculate current point balance
  SELECT COALESCE(SUM(points_delta), 0) INTO v_balance
  FROM public.loyalty_transactions
  WHERE user_id = v_user_id;

  -- 4. Check if checked in today in Vietnam time
  v_today := (clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE;
  SELECT EXISTS(
    SELECT 1 FROM public.daily_checkins
    WHERE user_id = v_user_id AND checkin_date = v_today
  ) INTO v_has_checked_in;

  -- 5. Calculate voucher readiness
  IF v_balance >= 500 THEN
    v_points_needed := 0;
  ELSE
    v_points_needed := 500 - v_balance;
  END IF;

  v_redeemable_vouchers_count := FLOOR(v_balance / 500)::INT;

  -- 6. Count available active vouchers
  SELECT COUNT(*) INTO v_available_count
  FROM public.voucher_redemptions
  WHERE user_id = v_user_id
    AND status = 'AVAILABLE'
    AND expires_at > clock_timestamp();

  -- 7. Query caller vouchers
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', vr.id,
        'voucher_id', vr.voucher_id,
        'status', vr.status,
        'issued_at', vr.issued_at,
        'expires_at', vr.expires_at,
        'used_at', vr.used_at,
        'name', v.name,
        'voucher_type', v.voucher_type,
        'discount_percentage', v.discount_percentage,
        'max_eligible_base_vnd', v.max_eligible_base_vnd,
        'max_discount_vnd', 400000
      ) ORDER BY
        CASE
          WHEN vr.status = 'AVAILABLE' THEN 1
          WHEN vr.status = 'RESERVED' THEN 2
          WHEN vr.status = 'USED' THEN 3
          ELSE 4
        END,
        vr.issued_at DESC
    ),
    '[]'::jsonb
  ) INTO v_vouchers
  FROM public.voucher_redemptions vr
  JOIN public.vouchers v ON v.id = vr.voucher_id
  WHERE vr.user_id = v_user_id;

  -- 8. Query recent loyalty transactions (up to 5)
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', lt.id,
        'type', lt.type,
        'points_delta', lt.points_delta,
        'description', lt.description,
        'created_at', lt.created_at
      ) ORDER BY lt.created_at DESC
    ),
    '[]'::jsonb
  ) INTO v_recent_transactions
  FROM (
    SELECT id, type, points_delta, description, created_at
    FROM public.loyalty_transactions
    WHERE user_id = v_user_id
    ORDER BY created_at DESC
    LIMIT 5
  ) lt;

  -- 9. Return summary
  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'points_balance', v_balance,
    'has_checked_in_today', v_has_checked_in,
    'checkin_date', v_today,
    'points_needed_for_next_voucher', v_points_needed,
    'available_vouchers_count', v_available_count,
    'redeemable_vouchers_count', v_redeemable_vouchers_count,
    'vouchers', v_vouchers,
    'recent_transactions', v_recent_transactions
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Revoke and Grant Permissions (Strict Least Privilege)
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.claim_daily_reward() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_daily_reward() FROM anon;
REVOKE ALL ON FUNCTION public.claim_daily_reward() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_daily_reward() TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_daily_reward() TO service_role;

REVOKE ALL ON FUNCTION public.redeem_loyalty_voucher() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redeem_loyalty_voucher() FROM anon;
REVOKE ALL ON FUNCTION public.redeem_loyalty_voucher() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_loyalty_voucher() TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_loyalty_voucher() TO service_role;

REVOKE ALL ON FUNCTION public.get_my_rewards_summary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_rewards_summary() FROM anon;
REVOKE ALL ON FUNCTION public.get_my_rewards_summary() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_rewards_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_rewards_summary() TO service_role;
