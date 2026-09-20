-- ============================================================================
-- Migration: 20260920_trusted_checkout_transaction.sql
-- Description: Trusted RPC function public.create_booking_safe for TV4 Checkout
-- Addressing TV1 PR #11 blocker feedback:
-- 1. Requires authenticated session (auth.uid())
-- 2. Derives pricing securely on backend (room.nightly_price_vnd * nights)
-- 3. Atomic concurrency protection (SELECT ... FOR UPDATE on bookings overlap)
-- 4. Trusted voucher discount computation and redemption update
-- 5. Atomic insert into public.bookings
-- 6. Direct loyalty points accrual (final_paid_amount_vnd * 0.00025)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Schema Adjustments (Support Columns & Tables for Trusted Booking)
-- ----------------------------------------------------------------------------
-- Ensure public.bookings has columns required by trusted checkout flow
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS guest_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS guest_email TEXT NULL,
  ADD COLUMN IF NOT EXISTS guest_phone TEXT NULL,
  ADD COLUMN IF NOT EXISTS payment_reference TEXT NULL;

-- Default guest_count to 1 if omitted
ALTER TABLE public.bookings
  ALTER COLUMN guest_count SET DEFAULT 1;

-- Support voucher columns if queried directly by code on vouchers table
ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS code TEXT NULL,
  ADD COLUMN IF NOT EXISTS user_id UUID NULL REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS is_used BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ NULL;

-- Support loyalty_points_ledger audit table
CREATE TABLE IF NOT EXISTS public.loyalty_points_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    booking_id UUID NULL REFERENCES public.bookings(id),
    points_change NUMERIC NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on loyalty_points_ledger
ALTER TABLE public.loyalty_points_ledger ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'loyalty_points_ledger' 
          AND policyname = 'Users can view own loyalty points ledger'
    ) THEN
        CREATE POLICY "Users can view own loyalty points ledger"
            ON public.loyalty_points_ledger
            FOR SELECT
            TO authenticated
            USING (auth.uid() = user_id);
    END IF;
END
$$;

GRANT SELECT ON public.loyalty_points_ledger TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 1. FUNCTION public.create_booking_safe
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_booking_safe(
    p_room_id UUID,
    p_check_in DATE,
    p_check_out DATE,
    p_guest_name TEXT,
    p_guest_email TEXT,
    p_guest_phone TEXT,
    p_voucher_code TEXT DEFAULT NULL,
    p_payment_reference TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_room_record RECORD;
    v_nights INTEGER;
    v_gross_amount NUMERIC;
    v_discount NUMERIC := 0;
    v_final_amount NUMERIC;
    v_voucher_id UUID;
    v_booking_id UUID;
    v_points_earned INTEGER;
BEGIN
    -- 1. Yêu cầu xác thực auth.uid()
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
    END IF;

    -- Đảm bảo user profile tồn tại để thỏa mãn FK bookings.user_id -> profiles.id
    INSERT INTO public.profiles (id)
    VALUES (v_user_id)
    ON CONFLICT (id) DO NOTHING;

    -- 2. Không tin gross_amount do client truyền; derive giá từ room.nightly_price_vnd * số đêm
    SELECT * INTO v_room_record FROM public.rooms WHERE id = p_room_id AND is_listed = true FOR SHARE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'ROOM_NOT_FOUND_OR_INACTIVE');
    END IF;

    v_nights := p_check_out - p_check_in;
    IF v_nights <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_DATES');
    END IF;
    v_gross_amount := v_room_record.nightly_price_vnd * v_nights;

    -- 3. Concurrency protection: Khóa và re-check availability trong cùng transaction
    IF EXISTS (
        SELECT 1 FROM public.bookings
        WHERE room_id = p_room_id
          AND LOWER(booking_status) IN ('confirmed', 'completed')
          AND LOWER(booking_status) NOT IN ('cancelled', 'refunded')
          AND (check_in < p_check_out AND check_out > p_check_in)
        FOR UPDATE
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'ROOM_ALREADY_BOOKED');
    END IF;

    -- 4. Voucher rule: 40% * min(gross, 1.000.000), tối đa 400.000 VND
    -- Source of truth là bảng vouchers / voucher_redemptions
    IF p_voucher_code IS NOT NULL AND TRIM(p_voucher_code) <> '' THEN
        SELECT id INTO v_voucher_id FROM public.vouchers 
        WHERE code = p_voucher_code AND user_id = v_user_id AND is_used = false AND valid_until >= NOW();
        
        IF FOUND THEN
            v_discount := LEAST(ROUND(LEAST(v_gross_amount, 1000000) * 0.40), 400000);
        END IF;
    END IF;

    v_final_amount := v_gross_amount - v_discount;

    -- 5. Insert booking an toàn
    INSERT INTO public.bookings (
        user_id,
        room_id,
        check_in,
        check_out,
        guest_name,
        guest_email,
        guest_phone,
        gross_amount_vnd,
        discount_amount_vnd,
        final_paid_amount_vnd,
        booking_status,
        payment_status,
        payment_reference
    ) VALUES (
        v_user_id,
        p_room_id,
        p_check_in,
        p_check_out,
        p_guest_name,
        p_guest_email,
        p_guest_phone,
        v_gross_amount,
        v_discount,
        v_final_amount,
        'confirmed',
        'paid',
        p_payment_reference
    ) RETURNING id INTO v_booking_id;

    -- Đánh dấu voucher đã sử dụng
    IF v_voucher_id IS NOT NULL THEN
        UPDATE public.vouchers SET is_used = true, used_at = NOW() WHERE id = v_voucher_id;
    END IF;

    -- 6. Ghi booking_earn = final_paid_amount_vnd * 0.00025 vào loyalty points ledger
    v_points_earned := FLOOR(v_final_amount * 0.00025);
    IF v_points_earned > 0 THEN
        INSERT INTO public.loyalty_points_ledger (
            user_id,
            booking_id,
            points_change,
            reason,
            created_at
        ) VALUES (
            v_user_id,
            v_booking_id,
            v_points_earned,
            'BOOKING_EARN',
            NOW()
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'booking_id', v_booking_id,
        'gross_amount', v_gross_amount,
        'discount', v_discount,
        'final_amount', v_final_amount,
        'points_earned', v_points_earned
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. Quyền least privilege
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.create_booking_safe(UUID, DATE, DATE, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_booking_safe(UUID, DATE, DATE, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;
