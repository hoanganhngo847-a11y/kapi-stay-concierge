-- ============================================================================
-- Migration: 20260930150000_my_stay_owned_booking_read_path.sql
-- Description: Trusted RPC function public.get_my_stay_booking_details and
--              safe RLS read policies for booked rooms/properties.
--
-- Security & Business Rules:
-- 1. Preserves public room catalog security: Public visitors (anon/unauthorized)
--    CANNOT view unlisted rooms or inactive properties.
-- 2. Trusted RPC public.get_my_stay_booking_details(p_booking_id UUID):
--    - Enforces auth.uid() = bookings.user_id.
--    - Distinguishes UNAUTHENTICATED, FORBIDDEN, BOOKING_NOT_FOUND, and BOOKING_DATA_INCOMPLETE.
--    - Safely returns room and property metadata for confirmed/completed bookings
--      even if the room is later unlisted or property becomes inactive.
-- 3. Supplementary RLS on rooms & properties for authenticated booking owners:
--    - Allows authenticated users to view only the rooms/properties they have booked.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. FUNCTION public.get_my_stay_booking_details
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_stay_booking_details(p_booking_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_booking RECORD;
    v_room RECORD;
    v_property RECORD;
    v_exists_booking_id UUID;
    v_owner_user_id UUID;
BEGIN
    -- 1. Check authentication
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'UNAUTHENTICATED',
            'message', 'Vui lòng đăng nhập để xem thông tin kỳ nghỉ.'
        );
    END IF;

    -- 2. Check if booking exists and verify ownership
    SELECT id, user_id
    INTO v_exists_booking_id, v_owner_user_id
    FROM public.bookings
    WHERE id = p_booking_id;

    IF v_exists_booking_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'BOOKING_NOT_FOUND',
            'message', 'Không tìm thấy đơn đặt phòng.'
        );
    END IF;

    IF v_owner_user_id <> v_user_id THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'FORBIDDEN',
            'message', 'Bạn không có quyền truy cập vào đơn đặt phòng này.'
        );
    END IF;

    -- 3. Retrieve booking record
    SELECT *
    INTO v_booking
    FROM public.bookings
    WHERE id = p_booking_id;

    -- 4. Retrieve room metadata (safe read path for booked room, even if later unlisted)
    SELECT id, property_id, name, description, capacity, image_paths, amenities
    INTO v_room
    FROM public.rooms
    WHERE id = v_booking.room_id;

    -- 5. Retrieve property metadata (safe read path for booked property, even if later deactivated)
    IF v_room.property_id IS NOT NULL THEN
        SELECT id, name, slug, address, maps_url
        INTO v_property
        FROM public.properties
        WHERE id = v_room.property_id;
    END IF;

    IF v_room.id IS NULL OR v_property.id IS NULL OR v_room.name IS NULL OR v_property.name IS NULL OR v_property.address IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'BOOKING_DATA_INCOMPLETE',
            'message', 'Dữ liệu thông tin phòng hoặc cơ sở không đầy đủ trong hệ thống.'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'booking', jsonb_build_object(
            'id', v_booking.id,
            'user_id', v_booking.user_id,
            'room_id', v_booking.room_id,
            'check_in', v_booking.check_in,
            'check_out', v_booking.check_out,
            'check_in_at', v_booking.check_in_at,
            'check_out_at', v_booking.check_out_at,
            'guest_count', v_booking.guest_count,
            'gross_amount_vnd', v_booking.gross_amount_vnd,
            'discount_amount_vnd', v_booking.discount_amount_vnd,
            'final_paid_amount_vnd', v_booking.final_paid_amount_vnd,
            'payment_status', v_booking.payment_status,
            'booking_status', v_booking.booking_status,
            'created_at', v_booking.created_at,
            'updated_at', v_booking.updated_at
        ),
        'room', jsonb_build_object(
            'id', v_room.id,
            'name', v_room.name,
            'description', v_room.description,
            'capacity', v_room.capacity,
            'image_paths', to_jsonb(COALESCE(v_room.image_paths, ARRAY[]::text[])),
            'amenities', to_jsonb(COALESCE(v_room.amenities, ARRAY[]::text[]))
        ),
        'property', jsonb_build_object(
            'id', v_property.id,
            'name', v_property.name,
            'slug', v_property.slug,
            'address', v_property.address,
            'maps_url', v_property.maps_url
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_stay_booking_details(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_stay_booking_details(UUID) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. RLS POLICIES FOR OWNED BOOKINGS (ROOMS & PROPERTIES)
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'rooms'
      AND policyname = 'Users can view rooms for own bookings'
  ) THEN
    CREATE POLICY "Users can view rooms for own bookings"
    ON public.rooms
    FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.room_id = rooms.id
          AND b.user_id = (SELECT auth.uid())
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'properties'
      AND policyname = 'Users can view properties for own bookings'
  ) THEN
    CREATE POLICY "Users can view properties for own bookings"
    ON public.properties
    FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.rooms r
        JOIN public.bookings b ON b.room_id = r.id
        WHERE r.property_id = properties.id
          AND b.user_id = (SELECT auth.uid())
      )
    );
  END IF;
END $$;
