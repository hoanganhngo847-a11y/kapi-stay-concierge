-- ============================================================================
-- Migration: RPC check_room_availability for public booking inquiries
-- Description: RPC function check_room_availability to bypass RLS blocker safely
-- for anonymous and authenticated room availability inquiries.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_room_availability(
    p_room_id UUID,
    p_check_in DATE,
    p_check_out DATE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Kiểm tra tính hợp lệ của tham số đầu vào
    IF p_room_id IS NULL OR p_check_in IS NULL OR p_check_out IS NULL OR p_check_out <= p_check_in THEN
        RETURN FALSE;
    END IF;

    -- Kiểm tra phòng tồn tại và đang mở bán trong public.rooms
    IF NOT EXISTS (
        SELECT 1 FROM public.rooms 
        WHERE id = p_room_id AND is_listed = true
    ) THEN
        RETURN FALSE;
    END IF;

    -- Kiểm tra xem có booking nào trùng lịch không
    -- Booking statuses that currently block availability: confirmed, completed
    -- Half-open interval: existing.check_in < requested.check_out AND existing.check_out > requested.check_in
    RETURN NOT EXISTS (
        SELECT 1
        FROM public.bookings
        WHERE room_id = p_room_id
          AND LOWER(booking_status) IN ('confirmed', 'completed')
          AND check_in < p_check_out
          AND check_out > p_check_in
    );
END;
$$;

-- Harden quyền least privilege
REVOKE ALL ON FUNCTION public.check_room_availability(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_room_availability(UUID, DATE, DATE) TO anon, authenticated;

