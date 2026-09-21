-- ============================================================================
-- Migration: 20260920_my_stay_security_rpc.sql
-- Description: Trusted RPC function public.get_my_stay_credentials for My Stay (PR #8).
-- Author: TV8 (Database / Backend Data)
-- Approved Direction: Tech Lead (TV1) Re-review #4
--
-- Security & Architectural Guarantees:
-- 1. TUYỆT ĐỐI KHÔNG ALTER TABLE public.rooms (giữ rooms làm public catalog).
-- 2. Nguồn dữ liệu Digital Key duy nhất: public.booking_access_credentials.
-- 3. Nguồn dữ liệu Wi-Fi duy nhất: public.room_private_details.
-- 4. Strictly authenticates caller via auth.uid().
-- 5. Enforces booking ownership (b.user_id = auth.uid()) & active booking status.
-- 6. Strictly time-bounded: valid_from <= NOW() <= valid_until.
-- 7. Returns NULL when outside stay window or unseeded - absolutely NO fake data.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Schema Support for room_private_details (Wi-Fi)
-- ----------------------------------------------------------------------------

-- Ensure public.room_private_details supports both wifi_network_name and wifi_ssid
ALTER TABLE public.room_private_details
  ADD COLUMN IF NOT EXISTS wifi_network_name TEXT NULL;

-- Backfill wifi_network_name from wifi_ssid if null
UPDATE public.room_private_details
SET wifi_network_name = wifi_ssid
WHERE wifi_network_name IS NULL AND wifi_ssid IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 1. FUNCTION public.get_my_stay_credentials
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_stay_credentials(p_booking_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_booking RECORD;
    v_cred RECORD;
    v_room_pvt RECORD;
    v_now TIMESTAMP WITH TIME ZONE := NOW();
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
    END IF;

    -- Kiểm tra quyền sở hữu booking và trạng thái booking hợp lệ
    SELECT b.id, b.room_id, b.booking_status
    INTO v_booking
    FROM public.bookings b
    WHERE b.id = p_booking_id AND b.user_id = v_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'BOOKING_NOT_FOUND_OR_FORBIDDEN');
    END IF;

    IF LOWER(v_booking.booking_status) NOT IN ('confirmed', 'completed') THEN
        RETURN jsonb_build_object('success', false, 'error', 'BOOKING_NOT_ACTIVE');
    END IF;

    -- Lấy Digital Key: Bắt buộc đúng booking, đúng phòng, status active và strictly time-bounded (valid_from <= now <= valid_until)
    SELECT credential_type, credential_value, valid_from, valid_until
    INTO v_cred
    FROM public.booking_access_credentials
    WHERE booking_id = v_booking.id
      AND room_id = v_booking.room_id
      AND status = 'active'
      AND v_now >= valid_from
      AND v_now <= valid_until
    ORDER BY created_at DESC
    LIMIT 1;

    -- Lấy Wi-Fi từ room_private_details nếu đang trong thời gian lưu trú hợp lệ
    IF FOUND THEN
        SELECT COALESCE(wifi_network_name, wifi_ssid) AS wifi_network_name, wifi_password
        INTO v_room_pvt
        FROM public.room_private_details
        WHERE room_id = v_booking.room_id;
    END IF;

    -- Trả về dữ liệu: nếu không có credential hợp lệ hoặc ngoài giờ thì trả NULL, tuyệt đối không fake
    RETURN jsonb_build_object(
        'success', true,
        'booking_id', v_booking.id,
        'is_active', (v_cred.credential_value IS NOT NULL),
        'digital_key', v_cred.credential_value,
        'credential_type', v_cred.credential_type,
        'valid_from', v_cred.valid_from,
        'valid_until', v_cred.valid_until,
        'wifi_ssid', v_room_pvt.wifi_network_name,
        'wifi_password', v_room_pvt.wifi_password
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. Quyền least privilege
-- ----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.get_my_stay_credentials(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_stay_credentials(UUID) TO authenticated, service_role;
