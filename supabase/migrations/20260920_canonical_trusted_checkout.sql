-- ============================================================================
-- Migration: 20260920_canonical_trusted_checkout.sql
-- Description: Canonical trusted RPC public.create_checkout_booking_atomic
-- Author: TV8 (Database / Backend Data)
-- Approved Direction: Tech Lead (TV1) Re-review #4
-- Architecture Reference: docs/PROJECT_GUIDE.md, docs/ARCHITECTURE.md
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Schema Support: Bookings, Vouchers & Loyalty Transactions
-- ----------------------------------------------------------------------------

-- Ensure public.bookings has columns required by canonical checkout flow
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS guest_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS guest_email TEXT NULL,
  ADD COLUMN IF NOT EXISTS guest_phone TEXT NULL,
  ADD COLUMN IF NOT EXISTS payment_reference TEXT NULL;

-- Default guest_count to 1 if omitted
ALTER TABLE public.bookings
  ALTER COLUMN guest_count SET DEFAULT 1;

-- Support voucher code lookup directly on voucher_redemptions
ALTER TABLE public.voucher_redemptions
  ADD COLUMN IF NOT EXISTS voucher_code TEXT NULL;

-- Support points and transaction_type columns on loyalty_transactions
ALTER TABLE public.loyalty_transactions
  ADD COLUMN IF NOT EXISTS points NUMERIC(20,4) NULL,
  ADD COLUMN IF NOT EXISTS transaction_type TEXT NULL;

-- Relax NOT NULL on points_delta and type to allow loyalty_transactions insertion with points/transaction_type
DO $$
BEGIN
  ALTER TABLE public.loyalty_transactions ALTER COLUMN points_delta DROP NOT NULL;
  ALTER TABLE public.loyalty_transactions ALTER COLUMN type DROP NOT NULL;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Synchronize legacy/canonical columns on loyalty_transactions bidirectionally
CREATE OR REPLACE FUNCTION public.sync_loyalty_transaction_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.points IS NOT NULL AND NEW.points_delta IS NULL THEN
    NEW.points_delta := NEW.points;
  ELSIF NEW.points_delta IS NOT NULL AND NEW.points IS NULL THEN
    NEW.points := NEW.points_delta;
  END IF;

  IF NEW.transaction_type IS NOT NULL AND NEW.type IS NULL THEN
    NEW.type := LOWER(NEW.transaction_type);
  ELSIF NEW.type IS NOT NULL AND NEW.transaction_type IS NULL THEN
    NEW.transaction_type := UPPER(NEW.type);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_sync_loyalty_transaction_columns ON public.loyalty_transactions;
CREATE TRIGGER tr_sync_loyalty_transaction_columns
  BEFORE INSERT OR UPDATE ON public.loyalty_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_loyalty_transaction_columns();

-- ----------------------------------------------------------------------------
-- 2. FUNCTION public.create_checkout_booking_atomic
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_checkout_booking_atomic(
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
    v_room RECORD;
    v_nights INTEGER;
    v_gross_amount NUMERIC;
    v_discount NUMERIC := 0;
    v_final_amount NUMERIC;
    v_redemption RECORD;
    v_booking_id UUID;
    v_points_earned NUMERIC;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
    END IF;

    -- Concurrency Protection: Khóa hàng của phòng trong public.rooms bằng FOR UPDATE để serialize các transaction cùng đặt 1 phòng
    SELECT * INTO v_room FROM public.rooms 
    WHERE id = p_room_id AND is_listed = true 
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'ROOM_NOT_FOUND_OR_UNLISTED');
    END IF;

    v_nights := p_check_out - p_check_in;
    IF v_nights <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_DATE_RANGE');
    END IF;

    -- Kiểm tra availability tức thời sau khi đã có lock phòng
    IF EXISTS (
        SELECT 1 FROM public.bookings
        WHERE room_id = p_room_id
          AND LOWER(booking_status) IN ('confirmed', 'completed')
          AND LOWER(booking_status) NOT IN ('cancelled', 'refunded')
          AND (check_in < p_check_out AND check_out > p_check_in)
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'ROOM_NOT_AVAILABLE');
    END IF;

    -- Server-derived price: Không tin client, tự tính từ rooms.nightly_price_vnd
    v_gross_amount := v_room.nightly_price_vnd * v_nights;

    -- Kiểm tra Voucher: Source of truth là voucher_redemptions (không auto-issue)
    IF p_voucher_code IS NOT NULL AND TRIM(p_voucher_code) <> '' THEN
        SELECT * INTO v_redemption FROM public.voucher_redemptions
        WHERE voucher_code = p_voucher_code 
          AND user_id = v_user_id 
          AND status = 'AVAILABLE'
          AND (expires_at IS NULL OR expires_at >= NOW())
        FOR UPDATE;

        IF FOUND THEN
            -- Discount formula chốt: 40% * min(gross, 1.000.000), max 400.000 VND
            v_discount := LEAST(ROUND(LEAST(v_gross_amount, 1000000) * 0.40), 400000);
            UPDATE public.voucher_redemptions
            SET status = 'USED', used_at = NOW()
            WHERE id = v_redemption.id;
        ELSE
            RETURN jsonb_build_object('success', false, 'error', 'INVALID_OR_EXPIRED_VOUCHER');
        END IF;
    END IF;

    v_final_amount := v_gross_amount - v_discount;

    -- Ghi nhận booking
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

    -- Ghi loyalty transactions: Dùng bảng loyalty_transactions hiện có, exact numeric không dùng FLOOR
    v_points_earned := v_final_amount * 0.00025;
    IF v_points_earned > 0 THEN
        INSERT INTO public.loyalty_transactions (
            user_id,
            booking_id,
            points,
            transaction_type,
            description,
            created_at
        ) VALUES (
            v_user_id,
            v_booking_id,
            v_points_earned,
            'BOOKING_EARN',
            'Tích điểm từ booking ' || v_booking_id::TEXT,
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
-- 3. Access Permissions (Least Privilege)
-- ----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.create_checkout_booking_atomic FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_checkout_booking_atomic TO authenticated, service_role;
