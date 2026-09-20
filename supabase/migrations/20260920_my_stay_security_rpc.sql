-- ============================================================================
-- Migration: 20260920_my_stay_security_rpc.sql
-- Description: Trusted RPC function public.get_my_stay_credentials for My Stay (PR #8).
-- Security & Access Control:
-- 1. Strictly authenticates caller via auth.uid()
-- 2. Enforces booking ownership (b.user_id = auth.uid())
-- 3. Restricts Digital Key (door PIN) and Wi-Fi credentials to active stay window
--    (14:00 check-in date to 12:00 check-out date)
-- 4. Returns NULL if outside stay window or unseeded - absolutely NO fake data
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Schema Adjustments (Support Columns & Safe Fallbacks)
-- ----------------------------------------------------------------------------
-- Ensure public.rooms has supporting columns for title, wifi, and door_pin
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS title TEXT NULL,
  ADD COLUMN IF NOT EXISTS wifi_ssid TEXT NULL,
  ADD COLUMN IF NOT EXISTS wifi_password TEXT NULL,
  ADD COLUMN IF NOT EXISTS door_pin TEXT NULL;

-- Backfill title from name if title is null
UPDATE public.rooms SET title = name WHERE title IS NULL;

-- Backfill wifi credentials from room_private_details if available
UPDATE public.rooms r
SET wifi_ssid = COALESCE(r.wifi_ssid, rpd.wifi_ssid),
    wifi_password = COALESCE(r.wifi_password, rpd.wifi_password)
FROM public.room_private_details rpd
WHERE r.id = rpd.room_id;

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
    v_now TIMESTAMP WITH TIME ZONE := NOW();
    v_stay_start TIMESTAMP WITH TIME ZONE;
    v_stay_end TIMESTAMP WITH TIME ZONE;
    v_is_active_window BOOLEAN := FALSE;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
    END IF;

    -- Kiểm tra booking và quyền sở hữu của user
    -- Hỗ trợ đọc cả từ rooms lẫn các bảng chuyên biệt room_private_details / booking_access_credentials
    SELECT 
        b.*, 
        COALESCE(r.title, r.name) AS room_title, 
        COALESCE(r.wifi_ssid, rpd.wifi_ssid) AS wifi_ssid, 
        COALESCE(r.wifi_password, rpd.wifi_password) AS wifi_password, 
        COALESCE(r.door_pin, bac.credential_value) AS door_pin
    INTO v_booking
    FROM public.bookings b
    JOIN public.rooms r ON b.room_id = r.id
    LEFT JOIN public.room_private_details rpd ON r.id = rpd.room_id
    LEFT JOIN public.booking_access_credentials bac ON b.id = bac.booking_id AND bac.status = 'active'
    WHERE b.id = p_booking_id AND b.user_id = v_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'BOOKING_NOT_FOUND_OR_FORBIDDEN');
    END IF;

    -- Xác định cửa sổ lưu trú (Check-in từ 14:00 ngày check_in, Check-out đến 12:00 ngày check_out)
    v_stay_start := (v_booking.check_in || ' 14:00:00')::TIMESTAMP WITH TIME ZONE;
    v_stay_end := (v_booking.check_out || ' 12:00:00')::TIMESTAMP WITH TIME ZONE;

    IF v_now >= v_stay_start AND v_now <= v_stay_end AND LOWER(v_booking.booking_status) IN ('confirmed', 'completed') THEN
        v_is_active_window := TRUE;
    END IF;

    -- Trả về dữ liệu: Nếu chưa đến hoặc đã qua stay window, trả về null, tuyệt đối không trả dữ liệu giả
    RETURN jsonb_build_object(
        'success', true,
        'booking_id', v_booking.id,
        'room_title', v_booking.room_title,
        'is_active_window', v_is_active_window,
        'digital_key', CASE WHEN v_is_active_window THEN v_booking.door_pin ELSE NULL END,
        'wifi_ssid', CASE WHEN v_is_active_window THEN v_booking.wifi_ssid ELSE NULL END,
        'wifi_password', CASE WHEN v_is_active_window THEN v_booking.wifi_password ELSE NULL END,
        'status_message', CASE 
            WHEN v_is_active_window THEN 'ACTIVE'
            WHEN v_now < v_stay_start THEN 'KEY_AVAILABLE_AT_CHECKIN'
            ELSE 'STAY_EXPIRED'
        END
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. Quyền least privilege
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.get_my_stay_credentials(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_stay_credentials(UUID) TO authenticated, service_role;
