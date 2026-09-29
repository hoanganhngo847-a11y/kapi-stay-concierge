-- ============================================================================
-- Migration: 20260929140000_rewards_streak_program.sql
-- Module: Kapi Rewards & Streak Milestone Program
-- Target: Supabase PostgreSQL
-- Rules:
--   - STRICT Least Privilege: SECURITY DEFINER, SET search_path = ''
--   - All database tables fully qualified: public.*
--   - Revoke PUBLIC and anon, grant authenticated and service_role appropriately
--   - Asia/Ho_Chi_Minh timezone calendar day for daily check-in streak
--   - Atomic check-in with streak progression and milestone auto-issuance
--   - Physical & Food reward entitlements (SNACK_X1, SNACK_X2, SNACK_COMBO, MEAL_CHOICE)
--   - Streak Discount vouchers (DISCOUNT_30 at 150 days, DISCOUNT_40 at 365 days)
--   - Server-backed food menu catalog (public.reward_menu_items)
--   - Checkout integration: max 1 discount voucher, physical reward coexisting
--   - Booking finalization atomic with idempotent reward usage
--   - Operations visibility: rewards attached to bookings
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Table: public.streak_reward_definitions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.streak_reward_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_day INT NOT NULL UNIQUE,
  reward_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  expiry_days INT NOT NULL DEFAULT 7,
  discount_percentage NUMERIC(5, 2) NULL,
  max_eligible_base_vnd BIGINT NULL,
  max_discount_vnd BIGINT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.streak_reward_definitions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.streak_reward_definitions FROM public, anon, authenticated;
GRANT SELECT ON public.streak_reward_definitions TO authenticated, anon;
GRANT ALL ON public.streak_reward_definitions TO service_role;

DROP POLICY IF EXISTS "allow_read_streak_reward_definitions" ON public.streak_reward_definitions;
CREATE POLICY "allow_read_streak_reward_definitions"
  ON public.streak_reward_definitions FOR SELECT
  TO authenticated, anon
  USING (true);

-- Seed canonical 6 streak milestone definitions
INSERT INTO public.streak_reward_definitions (
  milestone_day,
  reward_type,
  title,
  description,
  expiry_days,
  discount_percentage,
  max_eligible_base_vnd,
  max_discount_vnd,
  is_active
) VALUES
  (10, 'SNACK_X1', '1 gói bim bim bất kỳ', 'Phần thưởng chuỗi điểm danh 10 ngày. Nhận tại quầy hoặc trong phòng khi nhận phòng.', 7, NULL, NULL, NULL, true),
  (20, 'SNACK_X2', '2 gói bim bim bất kỳ', 'Phần thưởng chuỗi điểm danh 20 ngày. Nhận tại quầy hoặc trong phòng khi nhận phòng.', 7, NULL, NULL, NULL, true),
  (40, 'SNACK_COMBO', 'Combo 1 nước + 2 gói bim bim', 'Phần thưởng chuỗi điểm danh 40 ngày. Combo giải khát trọn vẹn cho kỳ lưu trú.', 7, NULL, NULL, NULL, true),
  (80, 'MEAL_CHOICE', '1 món ăn bất kỳ', 'Phần thưởng chuỗi điểm danh 80 ngày. Tự chọn 1 món ăn từ thực đơn Kapi Concierge.', 7, NULL, NULL, NULL, true),
  (150, 'DISCOUNT_30', 'Voucher giảm 30%', 'Phần thưởng chuỗi điểm danh 150 ngày. Giảm 30% tối đa 300.000đ khi đặt phòng.', 7, 30.00, 1000000, 300000, true),
  (365, 'DISCOUNT_40', 'Voucher giảm 40%', 'Phần thưởng chuỗi điểm danh 365 ngày. Giảm 40% tối đa 400.000đ khi đặt phòng.', 7, 40.00, 1000000, 400000, true)
ON CONFLICT (milestone_day) DO UPDATE SET
  reward_type = EXCLUDED.reward_type,
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  expiry_days = EXCLUDED.expiry_days,
  discount_percentage = EXCLUDED.discount_percentage,
  max_eligible_base_vnd = EXCLUDED.max_eligible_base_vnd,
  max_discount_vnd = EXCLUDED.max_discount_vnd,
  is_active = EXCLUDED.is_active;

-- ----------------------------------------------------------------------------
-- 2. Table: public.reward_menu_items (Food catalog for DAY 80 MEAL_CHOICE)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reward_menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'meal',
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.reward_menu_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reward_menu_items FROM public, anon, authenticated;
GRANT SELECT ON public.reward_menu_items TO authenticated, anon;
GRANT ALL ON public.reward_menu_items TO service_role;

DROP POLICY IF EXISTS "allow_read_reward_menu_items" ON public.reward_menu_items;
CREATE POLICY "allow_read_reward_menu_items"
  ON public.reward_menu_items FOR SELECT
  TO authenticated, anon
  USING (true);

-- Seed demo menu items
INSERT INTO public.reward_menu_items (id, name, category, is_active, sort_order)
VALUES
  ('11111111-1111-1111-1111-111111111101', 'Cơm sườn nướng', 'meal', true, 1),
  ('11111111-1111-1111-1111-111111111102', 'Phở bò Hà Nội', 'meal', true, 2),
  ('11111111-1111-1111-1111-111111111103', 'Bún trộn Nam Bộ', 'meal', true, 3),
  ('11111111-1111-1111-1111-111111111104', 'Bánh tráng nướng Đà Lạt', 'meal', true, 4),
  ('11111111-1111-1111-1111-111111111105', 'Bánh xèo miền Tây', 'meal', true, 5)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order;

-- ----------------------------------------------------------------------------
-- 3. Table: public.user_reward_streaks (Tracks streak and cycles)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_reward_streaks (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_streak INT NOT NULL DEFAULT 0,
  longest_streak INT NOT NULL DEFAULT 0,
  last_checkin_date DATE NULL,
  streak_cycle_id INT NOT NULL DEFAULT 1,
  streak_cycle_started_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.user_reward_streaks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_reward_streaks FROM public, anon, authenticated;
GRANT SELECT ON public.user_reward_streaks TO authenticated;
GRANT ALL ON public.user_reward_streaks TO service_role;

DROP POLICY IF EXISTS "users_read_own_streaks" ON public.user_reward_streaks;
CREATE POLICY "users_read_own_streaks"
  ON public.user_reward_streaks FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 4. Table: public.user_reward_entitlements (Physical, Food, and Streak Vouchers)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_reward_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reward_definition_id UUID NOT NULL REFERENCES public.streak_reward_definitions(id),
  milestone_day INT NOT NULL,
  streak_cycle_id INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'AVAILABLE'
    CHECK (status IN ('AVAILABLE', 'RESERVED', 'USED', 'EXPIRED', 'REVOKED')),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL,
  checkout_session_id UUID REFERENCES public.checkout_sessions(id) ON DELETE SET NULL,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  selection_data JSONB NULL,
  used_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_user_streak_cycle_milestone UNIQUE (user_id, streak_cycle_id, milestone_day)
);

CREATE INDEX IF NOT EXISTS idx_entitlements_user_status ON public.user_reward_entitlements(user_id, status);
CREATE INDEX IF NOT EXISTS idx_entitlements_session ON public.user_reward_entitlements(checkout_session_id);
CREATE INDEX IF NOT EXISTS idx_entitlements_booking ON public.user_reward_entitlements(booking_id);

ALTER TABLE public.user_reward_entitlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_reward_entitlements FROM public, anon, authenticated;
GRANT SELECT ON public.user_reward_entitlements TO authenticated;
GRANT ALL ON public.user_reward_entitlements TO service_role;

DROP POLICY IF EXISTS "users_read_own_entitlements" ON public.user_reward_entitlements;
CREATE POLICY "users_read_own_entitlements"
  ON public.user_reward_entitlements FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 5. RPC: claim_daily_reward() (Upgraded with Streaks, Cycles, and Milestones)
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
  v_streak_rec RECORD;
  v_current_streak INT;
  v_longest_streak INT;
  v_streak_cycle_id INT;
  v_cycle_started_at TIMESTAMPTZ;
  v_def RECORD;
  v_milestone_reached INT := NULL;
  v_reward_issued JSONB := NULL;
  v_new_entitlement_id UUID;
  v_issued_at TIMESTAMPTZ;
  v_expires_at TIMESTAMPTZ;
  v_next_milestone_day INT := NULL;
  v_next_milestone_title TEXT := NULL;
  v_next_milestone JSONB := NULL;
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

    SELECT current_streak, longest_streak INTO v_streak_rec
    FROM public.user_reward_streaks
    WHERE user_id = v_user_id;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'ALREADY_CLAIMED_TODAY',
      'already_claimed', true,
      'points_balance', v_balance,
      'current_streak', COALESCE(v_streak_rec.current_streak, 1),
      'longest_streak', COALESCE(v_streak_rec.longest_streak, 1),
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

  -- 6. Lock and update/insert user streak state
  SELECT * INTO v_streak_rec
  FROM public.user_reward_streaks
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_streak_rec.user_id IS NULL THEN
    -- First ever check-in for this user
    v_current_streak := 1;
    v_longest_streak := 1;
    v_streak_cycle_id := 1;
    v_cycle_started_at := clock_timestamp();

    INSERT INTO public.user_reward_streaks (
      user_id,
      current_streak,
      longest_streak,
      last_checkin_date,
      streak_cycle_id,
      streak_cycle_started_at,
      updated_at
    ) VALUES (
      v_user_id,
      1,
      1,
      v_today,
      1,
      v_cycle_started_at,
      clock_timestamp()
    );
  ELSE
    -- User has previous streak record
    IF v_streak_rec.last_checkin_date = (v_today - 1) THEN
      -- Consecutive day check-in: increase streak
      v_current_streak := v_streak_rec.current_streak + 1;
      v_streak_cycle_id := v_streak_rec.streak_cycle_id;
      v_cycle_started_at := v_streak_rec.streak_cycle_started_at;
    ELSE
      -- Missed 1 or more days: reset streak to 1, start new streak cycle!
      v_current_streak := 1;
      v_streak_cycle_id := v_streak_rec.streak_cycle_id + 1;
      v_cycle_started_at := clock_timestamp();
    END IF;

    v_longest_streak := GREATEST(v_streak_rec.longest_streak, v_current_streak);

    UPDATE public.user_reward_streaks
    SET current_streak = v_current_streak,
        longest_streak = v_longest_streak,
        last_checkin_date = v_today,
        streak_cycle_id = v_streak_cycle_id,
        streak_cycle_started_at = v_cycle_started_at,
        updated_at = clock_timestamp()
    WHERE user_id = v_user_id;
  END IF;

  -- 7. Automatic Milestone Issue (10, 20, 40, 80, 150, 365)
  SELECT * INTO v_def
  FROM public.streak_reward_definitions
  WHERE milestone_day = v_current_streak AND is_active = true;

  IF v_def.id IS NOT NULL THEN
    -- Check idempotency: milestone must be issued at most once per streak cycle
    IF NOT EXISTS (
      SELECT 1 FROM public.user_reward_entitlements
      WHERE user_id = v_user_id
        AND streak_cycle_id = v_streak_cycle_id
        AND milestone_day = v_current_streak
    ) THEN
      v_issued_at := clock_timestamp();
      v_expires_at := v_issued_at + (v_def.expiry_days || ' days')::INTERVAL;
      v_new_entitlement_id := gen_random_uuid();

      INSERT INTO public.user_reward_entitlements (
        id,
        user_id,
        reward_definition_id,
        milestone_day,
        streak_cycle_id,
        status,
        issued_at,
        expires_at
      ) VALUES (
        v_new_entitlement_id,
        v_user_id,
        v_def.id,
        v_current_streak,
        v_streak_cycle_id,
        'AVAILABLE',
        v_issued_at,
        v_expires_at
      );

      v_milestone_reached := v_current_streak;
      v_reward_issued := jsonb_build_object(
        'id', v_new_entitlement_id,
        'reward_type', v_def.reward_type,
        'title', v_def.title,
        'description', v_def.description,
        'expires_at', v_expires_at
      );
    END IF;
  END IF;

  -- 8. Calculate next milestone
  SELECT milestone_day, title INTO v_next_milestone_day, v_next_milestone_title
  FROM public.streak_reward_definitions
  WHERE milestone_day > v_current_streak AND is_active = true
  ORDER BY milestone_day ASC
  LIMIT 1;

  IF v_next_milestone_day IS NOT NULL THEN
    v_next_milestone := jsonb_build_object(
      'day', v_next_milestone_day,
      'days_left', (v_next_milestone_day - v_current_streak),
      'title', v_next_milestone_title
    );
  END IF;

  -- 9. Ledger points balance
  SELECT COALESCE(SUM(points_delta), 0) INTO v_balance
  FROM public.loyalty_transactions
  WHERE user_id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'points_added', 5,
    'points_balance', v_balance,
    'current_streak', v_current_streak,
    'longest_streak', v_longest_streak,
    'milestone_reached', v_milestone_reached,
    'reward_issued', v_reward_issued,
    'next_milestone', v_next_milestone,
    'checkin_date', v_today
  );

EXCEPTION
  WHEN unique_violation THEN
    SELECT COALESCE(SUM(points_delta), 0) INTO v_balance
    FROM public.loyalty_transactions
    WHERE user_id = v_user_id;

    SELECT current_streak, longest_streak INTO v_streak_rec
    FROM public.user_reward_streaks
    WHERE user_id = v_user_id;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'ALREADY_CLAIMED_TODAY',
      'already_claimed', true,
      'points_balance', v_balance,
      'current_streak', COALESCE(v_streak_rec.current_streak, 1),
      'longest_streak', COALESCE(v_streak_rec.longest_streak, 1),
      'checkin_date', v_today
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. RPC: get_my_rewards_summary() (Comprehensive Summary with Streak Roadmap)
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
  v_available_vouchers_count INT;
  v_points_needed NUMERIC(20, 5);
  v_redeemable_vouchers_count INT;
  v_vouchers JSONB;
  v_recent_transactions JSONB;
  v_streak_rec RECORD;
  v_active_streak INT := 0;
  v_longest_streak INT := 0;
  v_next_milestone_day INT := NULL;
  v_next_milestone_title TEXT := NULL;
  v_next_milestone JSONB := NULL;
  v_streak_roadmap JSONB;
  v_entitlements JSONB;
  v_available_entitlements_count INT := 0;
BEGIN
  -- 1. Authenticated user validation
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

  -- 2. Opportunistically mark expired AVAILABLE vouchers and entitlements
  UPDATE public.voucher_redemptions
  SET status = 'EXPIRED'
  WHERE user_id = v_user_id
    AND status = 'AVAILABLE'
    AND expires_at <= clock_timestamp();

  UPDATE public.user_reward_entitlements
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

  -- 5. Read streak data and compute active streak
  SELECT * INTO v_streak_rec
  FROM public.user_reward_streaks
  WHERE user_id = v_user_id;

  IF v_streak_rec.user_id IS NOT NULL THEN
    v_longest_streak := v_streak_rec.longest_streak;
    IF v_streak_rec.last_checkin_date = v_today OR v_streak_rec.last_checkin_date = (v_today - 1) THEN
      v_active_streak := v_streak_rec.current_streak;
    ELSE
      -- Missed more than 1 day: streak has broken (will reset to 1 upon next check-in)
      v_active_streak := 0;
    END IF;
  ELSE
    v_active_streak := 0;
    v_longest_streak := 0;
  END IF;

  -- 6. Calculate voucher readiness (500 pts)
  IF v_balance >= 500 THEN
    v_points_needed := 0;
  ELSE
    v_points_needed := 500 - v_balance;
  END IF;

  v_redeemable_vouchers_count := FLOOR(v_balance / 500)::INT;

  -- 7. Count available active vouchers (500-pt + streak discount vouchers)
  SELECT (
    (SELECT COUNT(*) FROM public.voucher_redemptions WHERE user_id = v_user_id AND status = 'AVAILABLE' AND expires_at > clock_timestamp())
    +
    (SELECT COUNT(*) FROM public.user_reward_entitlements ue
     JOIN public.streak_reward_definitions sd ON ue.reward_definition_id = sd.id
     WHERE ue.user_id = v_user_id AND ue.status = 'AVAILABLE' AND ue.expires_at > clock_timestamp() AND sd.reward_type IN ('DISCOUNT_30', 'DISCOUNT_40'))
  ) INTO v_available_vouchers_count;

  -- 8. Query caller's all vouchers (both 500-pt loyalty and streak vouchers)
  WITH combined_vouchers AS (
    -- 500-pt loyalty vouchers
    SELECT
      vr.id AS id,
      vr.voucher_id AS voucher_id,
      vr.status AS status,
      vr.issued_at AS issued_at,
      vr.expires_at AS expires_at,
      vr.used_at AS used_at,
      v.name AS name,
      v.voucher_type AS voucher_type,
      v.discount_percentage AS discount_percentage,
      v.max_eligible_base_vnd AS max_eligible_base_vnd,
      400000::bigint AS max_discount_vnd,
      '500_POINTS' AS source,
      'Đổi từ 500 Points' AS source_title
    FROM public.voucher_redemptions vr
    JOIN public.vouchers v ON v.id = vr.voucher_id
    WHERE vr.user_id = v_user_id

    UNION ALL

    -- Streak discount vouchers (Day 150 & Day 365)
    SELECT
      ue.id AS id,
      sd.id AS voucher_id,
      ue.status AS status,
      ue.issued_at AS issued_at,
      ue.expires_at AS expires_at,
      ue.used_at AS used_at,
      sd.title AS name,
      'percentage_discount' AS voucher_type,
      sd.discount_percentage AS discount_percentage,
      sd.max_eligible_base_vnd AS max_eligible_base_vnd,
      sd.max_discount_vnd AS max_discount_vnd,
      CASE
        WHEN sd.milestone_day = 150 THEN '150_DAY_STREAK'
        ELSE '365_DAY_STREAK'
      END AS source,
      'Phần thưởng chuỗi ' || sd.milestone_day || ' ngày' AS source_title
    FROM public.user_reward_entitlements ue
    JOIN public.streak_reward_definitions sd ON ue.reward_definition_id = sd.id
    WHERE ue.user_id = v_user_id
      AND sd.reward_type IN ('DISCOUNT_30', 'DISCOUNT_40')
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', cv.id,
        'voucher_id', cv.voucher_id,
        'status', cv.status,
        'issued_at', cv.issued_at,
        'expires_at', cv.expires_at,
        'used_at', cv.used_at,
        'name', cv.name,
        'voucher_type', cv.voucher_type,
        'discount_percentage', cv.discount_percentage,
        'max_eligible_base_vnd', cv.max_eligible_base_vnd,
        'max_discount_vnd', cv.max_discount_vnd,
        'source', cv.source,
        'source_title', cv.source_title
      ) ORDER BY
        CASE
          WHEN cv.status = 'AVAILABLE' THEN 1
          WHEN cv.status = 'RESERVED' THEN 2
          WHEN cv.status = 'USED' THEN 3
          ELSE 4
        END,
        cv.issued_at DESC
    ),
    '[]'::jsonb
  ) INTO v_vouchers
  FROM combined_vouchers cv;

  -- 9. Query caller's physical / food entitlements
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', ue.id,
        'reward_definition_id', sd.id,
        'milestone_day', ue.milestone_day,
        'reward_type', sd.reward_type,
        'title', sd.title,
        'description', sd.description,
        'status', ue.status,
        'issued_at', ue.issued_at,
        'expires_at', ue.expires_at,
        'used_at', ue.used_at,
        'selection_data', ue.selection_data
      ) ORDER BY
        CASE
          WHEN ue.status = 'AVAILABLE' THEN 1
          WHEN ue.status = 'RESERVED' THEN 2
          WHEN ue.status = 'USED' THEN 3
          ELSE 4
        END,
        ue.issued_at DESC
    ),
    '[]'::jsonb
  ) INTO v_entitlements
  FROM public.user_reward_entitlements ue
  JOIN public.streak_reward_definitions sd ON ue.reward_definition_id = sd.id
  WHERE ue.user_id = v_user_id
    AND sd.reward_type NOT IN ('DISCOUNT_30', 'DISCOUNT_40');

  SELECT COUNT(*) INTO v_available_entitlements_count
  FROM public.user_reward_entitlements ue
  JOIN public.streak_reward_definitions sd ON ue.reward_definition_id = sd.id
  WHERE ue.user_id = v_user_id
    AND ue.status = 'AVAILABLE'
    AND ue.expires_at > clock_timestamp()
    AND sd.reward_type NOT IN ('DISCOUNT_30', 'DISCOUNT_40');

  -- 10. Next milestone calculation
  SELECT milestone_day, title INTO v_next_milestone_day, v_next_milestone_title
  FROM public.streak_reward_definitions
  WHERE milestone_day > v_active_streak AND is_active = true
  ORDER BY milestone_day ASC
  LIMIT 1;

  IF v_next_milestone_day IS NOT NULL THEN
    v_next_milestone := jsonb_build_object(
      'day', v_next_milestone_day,
      'days_left', (v_next_milestone_day - v_active_streak),
      'title', v_next_milestone_title
    );
  END IF;

  -- 11. Streak Roadmap (all 6 milestones)
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'milestone_day', sd.milestone_day,
        'reward_type', sd.reward_type,
        'title', sd.title,
        'description', sd.description,
        'expiry_days', sd.expiry_days,
        'discount_percentage', sd.discount_percentage,
        'max_discount_vnd', sd.max_discount_vnd,
        'status', CASE
          WHEN v_active_streak >= sd.milestone_day THEN 'ACHIEVED'
          WHEN sd.milestone_day = v_next_milestone_day THEN 'TARGET'
          ELSE 'LOCKED'
        END
      ) ORDER BY sd.milestone_day ASC
    ),
    '[]'::jsonb
  ) INTO v_streak_roadmap
  FROM public.streak_reward_definitions sd
  WHERE sd.is_active = true;

  -- 12. Query recent loyalty transactions (up to 10)
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
    LIMIT 10
  ) lt;

  -- 13. Return comprehensive summary
  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'points_balance', v_balance,
    'has_checked_in_today', v_has_checked_in,
    'checkin_date', v_today,
    'current_streak', v_active_streak,
    'longest_streak', v_longest_streak,
    'next_milestone', v_next_milestone,
    'points_needed_for_next_voucher', v_points_needed,
    'available_vouchers_count', v_available_vouchers_count,
    'available_entitlements_count', v_available_entitlements_count,
    'redeemable_vouchers_count', v_redeemable_vouchers_count,
    'streak_roadmap', v_streak_roadmap,
    'vouchers', v_vouchers,
    'entitlements', v_entitlements,
    'recent_transactions', v_recent_transactions
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. RPC: get_active_reward_menu_items()
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_active_reward_menu_items()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_items JSONB;
BEGIN
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'name', name,
        'category', category,
        'sort_order', sort_order
      ) ORDER BY sort_order ASC, name ASC
    ),
    '[]'::jsonb
  ) INTO v_items
  FROM public.reward_menu_items
  WHERE is_active = true;

  RETURN jsonb_build_object('success', true, 'items', v_items);
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. RPC: reserve_checkout_reward_entitlement_atomic
-- Attaches a user's AVAILABLE entitlement (discount or physical/food) to an ACTIVE session.
-- Rule: at most 1 discount voucher/entitlement, at most 1 physical reward per booking.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_checkout_reward_entitlement_atomic(
  p_checkout_session_id UUID,
  p_entitlement_id UUID,
  p_menu_item_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_session RECORD;
  v_entitlement RECORD;
  v_def RECORD;
  v_menu_item RECORD;
  v_eligible_base BIGINT;
  v_discount BIGINT;
  v_final_payable BIGINT;
  v_selection_data JSONB := NULL;
  v_rate NUMERIC;
  v_cap BIGINT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

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

  -- Lock entitlement FOR UPDATE
  SELECT ue.*, sd.reward_type, sd.discount_percentage, sd.max_eligible_base_vnd, sd.max_discount_vnd, sd.is_active AS def_is_active, sd.title
  INTO v_entitlement
  FROM public.user_reward_entitlements ue
  JOIN public.streak_reward_definitions sd ON ue.reward_definition_id = sd.id
  WHERE ue.id = p_entitlement_id
  FOR UPDATE OF ue;

  IF v_entitlement.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'ENTITLEMENT_NOT_FOUND');
  END IF;

  IF v_entitlement.user_id <> v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  IF v_entitlement.status <> 'AVAILABLE' THEN
    RETURN jsonb_build_object('success', false, 'error', 'ENTITLEMENT_NOT_AVAILABLE');
  END IF;

  IF v_entitlement.expires_at <= clock_timestamp() THEN
    UPDATE public.user_reward_entitlements
    SET status = 'EXPIRED'
    WHERE id = v_entitlement.id;

    RETURN jsonb_build_object('success', false, 'error', 'ENTITLEMENT_EXPIRED');
  END IF;

  IF v_entitlement.def_is_active IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'ENTITLEMENT_DEFINITION_INACTIVE');
  END IF;

  -- Case A: Discount Reward (DISCOUNT_30 or DISCOUNT_40)
  IF v_entitlement.reward_type IN ('DISCOUNT_30', 'DISCOUNT_40') THEN
    -- Check if session already has a discount applied
    IF v_session.discount_amount_vnd > 0
       OR EXISTS (SELECT 1 FROM public.voucher_redemptions WHERE checkout_session_id = p_checkout_session_id AND status = 'RESERVED')
       OR EXISTS (
         SELECT 1 FROM public.user_reward_entitlements ue2
         JOIN public.streak_reward_definitions sd2 ON ue2.reward_definition_id = sd2.id
         WHERE ue2.checkout_session_id = p_checkout_session_id
           AND ue2.status = 'RESERVED'
           AND sd2.reward_type IN ('DISCOUNT_30', 'DISCOUNT_40')
       ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'DISCOUNT_ALREADY_RESERVED');
    END IF;

    -- Calculate discount
    IF v_entitlement.reward_type = 'DISCOUNT_30' THEN
      v_rate := 0.30;
      v_cap := 300000;
    ELSE
      v_rate := 0.40;
      v_cap := 400000;
    END IF;

    v_eligible_base := LEAST(v_session.gross_amount_vnd, 1000000::bigint);
    v_discount := LEAST(ROUND(v_eligible_base::numeric * v_rate)::bigint, v_cap, v_session.gross_amount_vnd);
    v_final_payable := v_session.gross_amount_vnd - v_discount;

    UPDATE public.user_reward_entitlements
    SET status = 'RESERVED',
        checkout_session_id = p_checkout_session_id,
        updated_at = clock_timestamp()
    WHERE id = p_entitlement_id;

    UPDATE public.checkout_sessions
    SET discount_amount_vnd = v_discount,
        final_payable_amount_vnd = v_final_payable
    WHERE id = p_checkout_session_id;

  -- Case B: Physical / Food Reward (SNACK_X1, SNACK_X2, SNACK_COMBO, MEAL_CHOICE)
  ELSE
    -- Check if session already has a physical reward reserved
    IF EXISTS (
      SELECT 1 FROM public.user_reward_entitlements ue2
      JOIN public.streak_reward_definitions sd2 ON ue2.reward_definition_id = sd2.id
      WHERE ue2.checkout_session_id = p_checkout_session_id
        AND ue2.status = 'RESERVED'
        AND sd2.reward_type NOT IN ('DISCOUNT_30', 'DISCOUNT_40')
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'PHYSICAL_REWARD_ALREADY_RESERVED');
    END IF;

    -- If MEAL_CHOICE: validate chosen menu item is active
    IF v_entitlement.reward_type = 'MEAL_CHOICE' THEN
      IF p_menu_item_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'MEAL_SELECTION_REQUIRED');
      END IF;

      SELECT id, name INTO v_menu_item
      FROM public.reward_menu_items
      WHERE id = p_menu_item_id AND is_active = true;

      IF v_menu_item.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_OR_INACTIVE_MEAL_ITEM');
      END IF;

      v_selection_data := jsonb_build_object(
        'menu_item_id', v_menu_item.id,
        'menu_item_name', v_menu_item.name
      );
    ELSE
      v_selection_data := jsonb_build_object('reward_type', v_entitlement.reward_type);
    END IF;

    UPDATE public.user_reward_entitlements
    SET status = 'RESERVED',
        checkout_session_id = p_checkout_session_id,
        selection_data = v_selection_data,
        updated_at = clock_timestamp()
    WHERE id = p_entitlement_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'entitlement_id', p_entitlement_id,
    'reward_type', v_entitlement.reward_type,
    'selection_data', v_selection_data,
    'checkout_session', jsonb_build_object(
      'id', v_session.id,
      'gross_amount_vnd', v_session.gross_amount_vnd,
      'discount_amount_vnd', COALESCE(v_discount, v_session.discount_amount_vnd),
      'final_payable_amount_vnd', COALESCE(v_final_payable, v_session.final_payable_amount_vnd)
    )
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 9. RPC: release_checkout_reward_entitlement_atomic
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_checkout_reward_entitlement_atomic(
  p_checkout_session_id UUID,
  p_entitlement_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_session RECORD;
  v_ent RECORD;
  v_has_discount_released BOOLEAN := false;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

  SELECT * INTO v_session
  FROM public.checkout_sessions
  WHERE id = p_checkout_session_id;

  IF v_session.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'CHECKOUT_SESSION_NOT_FOUND');
  END IF;

  IF v_session.user_id <> v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  FOR v_ent IN
    SELECT ue.*, sd.reward_type
    FROM public.user_reward_entitlements ue
    JOIN public.streak_reward_definitions sd ON ue.reward_definition_id = sd.id
    WHERE ue.checkout_session_id = p_checkout_session_id
      AND ue.status = 'RESERVED'
      AND (p_entitlement_id IS NULL OR ue.id = p_entitlement_id)
    FOR UPDATE OF ue
  LOOP
    IF v_ent.reward_type IN ('DISCOUNT_30', 'DISCOUNT_40') THEN
      v_has_discount_released := true;
    END IF;

    UPDATE public.user_reward_entitlements
    SET status = CASE WHEN expires_at > clock_timestamp() THEN 'AVAILABLE' ELSE 'EXPIRED' END,
        checkout_session_id = NULL,
        selection_data = NULL,
        updated_at = clock_timestamp()
    WHERE id = v_ent.id;
  END LOOP;

  IF v_has_discount_released THEN
    UPDATE public.checkout_sessions
    SET discount_amount_vnd = 0,
        final_payable_amount_vnd = gross_amount_vnd
    WHERE id = p_checkout_session_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ----------------------------------------------------------------------------
-- 10. Upgrade: finalize_verified_checkout_atomic (Supports Vouchers + Entitlements)
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
  v_ent_discount_rec RECORD;
  v_ent_physical_rec RECORD;
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

  -- Re-validate room capacity
  IF v_session.guest_count > v_room.capacity THEN
    RETURN jsonb_build_object('success', false, 'error', 'GUEST_COUNT_EXCEEDS_CAPACITY');
  END IF;

  -- Re-check inventory availability for confirmed / completed stays
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
    -- Check if discount is from voucher_redemptions (500 pts 40%)
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
         OR v_voucher_is_active IS NOT TRUE
         OR v_voucher_type <> 'percentage_discount'
         OR v_discount_percentage <> 40.00
         OR v_max_eligible_base_vnd <> 1000000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'VOUCHER_STATE_INVALID');
      END IF;
    ELSE
      -- Check if discount is from user_reward_entitlements (DISCOUNT_30 or DISCOUNT_40)
      SELECT ue.id, ue.expires_at, sd.reward_type, sd.discount_percentage, sd.max_discount_vnd, sd.is_active
      INTO v_ent_discount_rec
      FROM public.user_reward_entitlements ue
      JOIN public.streak_reward_definitions sd ON ue.reward_definition_id = sd.id
      WHERE ue.checkout_session_id = v_session.id
        AND ue.status = 'RESERVED'
        AND ue.user_id = v_session.user_id
        AND sd.reward_type IN ('DISCOUNT_30', 'DISCOUNT_40')
      FOR UPDATE OF ue;

      IF v_ent_discount_rec.id IS NULL
         OR v_ent_discount_rec.expires_at <= clock_timestamp()
         OR v_ent_discount_rec.is_active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'VOUCHER_STATE_INVALID');
      END IF;
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.voucher_redemptions vr
      WHERE vr.checkout_session_id = v_session.id
        AND vr.status = 'RESERVED'
    ) OR EXISTS (
      SELECT 1 FROM public.user_reward_entitlements ue
      JOIN public.streak_reward_definitions sd ON ue.reward_definition_id = sd.id
      WHERE ue.checkout_session_id = v_session.id
        AND ue.status = 'RESERVED'
        AND sd.reward_type IN ('DISCOUNT_30', 'DISCOUNT_40')
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'VOUCHER_STATE_INVALID');
    END IF;
  END IF;

  -- Check any reserved physical/food reward entitlements for update
  SELECT ue.id INTO v_ent_physical_rec
  FROM public.user_reward_entitlements ue
  JOIN public.streak_reward_definitions sd ON ue.reward_definition_id = sd.id
  WHERE ue.checkout_session_id = v_session.id
    AND ue.status = 'RESERVED'
    AND sd.reward_type NOT IN ('DISCOUNT_30', 'DISCOUNT_40')
  FOR UPDATE OF ue;

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

  -- 10. Transition reserved voucher / entitlements to USED
  IF v_redemption_id IS NOT NULL THEN
    UPDATE public.voucher_redemptions
    SET status = 'USED',
        booking_id = v_booking_id,
        used_at = clock_timestamp()
    WHERE id = v_redemption_id;
  END IF;

  -- Update all reserved entitlements for this session to USED
  UPDATE public.user_reward_entitlements
  SET status = 'USED',
      booking_id = v_booking_id,
      used_at = clock_timestamp(),
      updated_at = clock_timestamp()
  WHERE checkout_session_id = v_session.id
    AND status = 'RESERVED';

  -- 11. Append booking_earn to loyalty_transactions ledger
  -- Points base: actual final paid amount after voucher discount (1 VND = 0.00025 point)
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

-- ----------------------------------------------------------------------------
-- 11. Upgrade: get_staff_dashboard_data() (With Fulfillment & Rewards Visibility)
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

    -- 4. Today arrivals & departures with attached rewards visibility
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
        ),
        'rewards', (
            SELECT COALESCE(jsonb_agg(reward_desc), '[]'::jsonb)
            FROM (
                -- Financial discount from vouchers
                SELECT 'Voucher 40% (500 pts)' AS reward_desc
                FROM public.voucher_redemptions vr
                WHERE vr.booking_id = b.id AND vr.status = 'USED'

                UNION ALL

                -- Rewards from streak entitlements
                SELECT
                    CASE
                        WHEN sd.reward_type = 'MEAL_CHOICE' AND ue.selection_data ? 'menu_item_name' THEN
                            'Món ăn: ' || (ue.selection_data->>'menu_item_name')
                        WHEN sd.reward_type = 'DISCOUNT_30' THEN
                            'Voucher 30% applied'
                        WHEN sd.reward_type = 'DISCOUNT_40' THEN
                            'Voucher 40% applied'
                        ELSE
                            sd.title
                    END AS reward_desc
                FROM public.user_reward_entitlements ue
                JOIN public.streak_reward_definitions sd ON ue.reward_definition_id = sd.id
                WHERE ue.booking_id = b.id AND ue.status = 'USED'
            ) sub
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

-- ----------------------------------------------------------------------------
-- 12. Permissions and Security Grants
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.claim_daily_reward() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_daily_reward() FROM anon;
REVOKE ALL ON FUNCTION public.claim_daily_reward() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_daily_reward() TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_daily_reward() TO service_role;

REVOKE ALL ON FUNCTION public.get_my_rewards_summary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_rewards_summary() FROM anon;
REVOKE ALL ON FUNCTION public.get_my_rewards_summary() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_rewards_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_rewards_summary() TO service_role;

REVOKE ALL ON FUNCTION public.get_active_reward_menu_items() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_active_reward_menu_items() FROM anon;
REVOKE ALL ON FUNCTION public.get_active_reward_menu_items() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_reward_menu_items() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_active_reward_menu_items() TO service_role;

REVOKE ALL ON FUNCTION public.reserve_checkout_reward_entitlement_atomic(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_checkout_reward_entitlement_atomic(UUID, UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.reserve_checkout_reward_entitlement_atomic(UUID, UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_checkout_reward_entitlement_atomic(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_checkout_reward_entitlement_atomic(UUID, UUID, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.release_checkout_reward_entitlement_atomic(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_checkout_reward_entitlement_atomic(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.release_checkout_reward_entitlement_atomic(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.release_checkout_reward_entitlement_atomic(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_checkout_reward_entitlement_atomic(UUID, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.finalize_verified_checkout_atomic(UUID, BIGINT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_verified_checkout_atomic(UUID, BIGINT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.finalize_verified_checkout_atomic(UUID, BIGINT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_verified_checkout_atomic(UUID, BIGINT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.get_staff_dashboard_data() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_staff_dashboard_data() FROM anon;
REVOKE ALL ON FUNCTION public.get_staff_dashboard_data() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_staff_dashboard_data() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_staff_dashboard_data() TO service_role;
