-- ============================================================================
-- Migration: 20260920100000_my_stay_security_rpc.sql
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
    v_booking_id UUID := NULL;
    v_room_id UUID := NULL;
    v_booking_status TEXT := NULL;
    v_credential_value TEXT := NULL;
    v_credential_type TEXT := NULL;
    v_valid_from TIMESTAMPTZ := NULL;
    v_valid_until TIMESTAMPTZ := NULL;
    v_wifi_ssid TEXT := NULL;
    v_wifi_password TEXT := NULL;
    v_now TIMESTAMPTZ := NOW();
    v_has_active_credential BOOLEAN := FALSE;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
    END IF;

    -- Kiểm tra quyền sở hữu booking và trạng thái booking (behavior hiện tại chỉ áp dụng cho confirmed/completed)
    SELECT b.id, b.room_id, b.booking_status
    INTO v_booking_id, v_room_id, v_booking_status
    FROM public.bookings b
    WHERE b.id = p_booking_id AND b.user_id = v_user_id;

    IF v_booking_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'BOOKING_NOT_FOUND_OR_FORBIDDEN');
    END IF;

    IF LOWER(v_booking_status) NOT IN ('confirmed', 'completed') THEN
        RETURN jsonb_build_object('success', false, 'error', 'BOOKING_NOT_ACTIVE');
    END IF;

    -- Lấy Digital Key: Bắt buộc đúng booking, đúng phòng, status active và strictly time-bounded (valid_from <= now <= valid_until)
    SELECT credential_type, credential_value, valid_from, valid_until
    INTO v_credential_type, v_credential_value, v_valid_from, v_valid_until
    FROM public.booking_access_credentials
    WHERE booking_id = v_booking_id
      AND room_id = v_room_id
      AND status = 'active'
      AND v_now >= valid_from
      AND v_now <= valid_until
    ORDER BY created_at DESC
    LIMIT 1;

    v_has_active_credential := FOUND;

    -- Chỉ query room_private_details sau khi tìm thấy active credential trong thời gian lưu trú hợp lệ
    IF v_has_active_credential THEN
        SELECT wifi_ssid, wifi_password
        INTO v_wifi_ssid, v_wifi_password
        FROM public.room_private_details
        WHERE room_id = v_room_id;
    END IF;

    -- Trả về dữ liệu: nếu không có active credential hợp lệ hoặc ngoài window thì is_active = false và secrets là null, tuyệt đối không fake
    RETURN jsonb_build_object(
        'success', true,
        'booking_id', v_booking_id,
        'is_active', v_has_active_credential,
        'digital_key', v_credential_value,
        'credential_type', v_credential_type,
        'valid_from', v_valid_from,
        'valid_until', v_valid_until,
        'wifi_ssid', v_wifi_ssid,
        'wifi_password', v_wifi_password
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. Quyền least privilege
-- ----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.get_my_stay_credentials(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_stay_credentials(UUID) TO authenticated, service_role;
