-- ============================================================================
-- Migration: 20260919_check_room_availability.sql
-- Description: RPC function check_room_availability to bypass RLS blocker safely
-- for anonymous and authenticated room availability inquiries.
-- Reviewed and approved by TV1 (Tech Lead).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_room_availability(
    p_room_id UUID,
    p_check_in DATE,
    p_check_out DATE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Kiểm tra tính hợp lệ của ngày
    IF p_check_out <= p_check_in THEN
        RETURN FALSE;
    END IF;

    -- Kiểm tra xem có booking nào trùng lịch không
    -- Canonical blocking statuses: booking_status IN ('confirmed', 'paid', 'completed')
    -- Hoặc payment_status IN ('paid', 'confirmed')
    RETURN NOT EXISTS (
        SELECT 1
        FROM public.bookings
        WHERE room_id = p_room_id
          AND (
              LOWER(booking_status) IN ('confirmed', 'paid', 'completed')
              OR LOWER(payment_status) IN ('paid', 'confirmed')
          )
          AND (check_in < p_check_out AND check_out > p_check_in)
    );
END;
$$;

-- Cấp quyền EXECUTE cho cả anon và authenticated để khách chưa login vẫn kiểm tra được phòng trống
GRANT EXECUTE ON FUNCTION public.check_room_availability(UUID, DATE, DATE) TO anon, authenticated, service_role;
