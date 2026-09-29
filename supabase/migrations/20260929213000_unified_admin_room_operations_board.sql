-- ============================================================================
-- Migration: 20260929213000_unified_admin_room_operations_board.sql
-- Description: Unified Admin Property / Room Operations Board
--   1. get_admin_property_overview()
--   2. get_admin_property_room_schedule(p_property_id, p_range_start, p_range_end)
--   3. get_admin_booking_detail(p_booking_id)
-- Security: SECURITY DEFINER, SET search_path = '', strict role enforcement (role = 'admin')
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. get_admin_property_overview
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_property_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_now TIMESTAMPTZ;
  v_today_start TIMESTAMPTZ;
  v_today_end TIMESTAMPTZ;
  v_properties_json JSONB;
BEGIN
  -- 1. Enforce admin role
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.staff_roles WHERE user_id = v_user_id AND role = 'admin'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN_ADMIN_ONLY');
  END IF;

  -- 2. Timezone Asia/Ho_Chi_Minh
  v_now := clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_today_start := (date_trunc('day', v_now)) AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_today_end := v_today_start + interval '1 day';

  -- 3. Query all active properties with segregated operational room and booking counts
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'property_id', p.id,
        'property_name', p.name,
        'property_address', p.address,
        'room_count', COALESCE(rc.total_rooms, 0),
        'ready_count', COALESCE(rc.ready_rooms, 0),
        'occupied_count', COALESCE(rc.occupied_rooms, 0),
        'cleaning_count', COALESCE(rc.cleaning_rooms, 0),
        'maintenance_count', COALESCE(rc.maintenance_rooms, 0),
        'today_checkins', COALESCE(bc.today_checkins, 0),
        'today_checkouts', COALESCE(bc.today_checkouts, 0),
        'today_booking_count', COALESCE(bc.today_bookings, 0)
      ) ORDER BY p.name ASC
    ),
    '[]'::jsonb
  ) INTO v_properties_json
  FROM public.properties p
  -- Room counts
  LEFT JOIN LATERAL (
    SELECT
      count(r.id) as total_rooms,
      count(*) FILTER (WHERE COALESCE(ro.operational_status, 'ready') = 'ready') as ready_rooms,
      count(*) FILTER (WHERE COALESCE(ro.operational_status, 'ready') = 'occupied') as occupied_rooms,
      count(*) FILTER (WHERE COALESCE(ro.operational_status, 'ready') = 'cleaning') as cleaning_rooms,
      count(*) FILTER (WHERE COALESCE(ro.operational_status, 'ready') = 'maintenance') as maintenance_rooms
    FROM public.rooms r
    LEFT JOIN public.room_operations ro ON ro.room_id = r.id
    WHERE r.property_id = p.id
  ) rc ON true
  -- Booking counts
  LEFT JOIN LATERAL (
    SELECT
      count(*) FILTER (
        WHERE COALESCE(b.check_in_at, (b.check_in::text || ' 14:00:00+07')::timestamptz) >= v_today_start
          AND COALESCE(b.check_in_at, (b.check_in::text || ' 14:00:00+07')::timestamptz) < v_today_end
      ) as today_checkins,
      count(*) FILTER (
        WHERE COALESCE(b.check_out_at, (b.check_out::text || ' 12:00:00+07')::timestamptz) >= v_today_start
          AND COALESCE(b.check_out_at, (b.check_out::text || ' 12:00:00+07')::timestamptz) < v_today_end
      ) as today_checkouts,
      count(*) FILTER (
        WHERE COALESCE(b.check_in_at, (b.check_in::text || ' 14:00:00+07')::timestamptz) < v_today_end
          AND COALESCE(b.check_out_at, (b.check_out::text || ' 12:00:00+07')::timestamptz) > v_today_start
      ) as today_bookings
    FROM public.bookings b
    JOIN public.rooms br ON br.id = b.room_id
    WHERE br.property_id = p.id
      AND LOWER(b.booking_status) NOT IN ('cancelled', 'refunded')
  ) bc ON true
  WHERE p.is_active = true;

  RETURN jsonb_build_object(
    'success', true,
    'properties', v_properties_json
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. get_admin_property_room_schedule
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_property_room_schedule(
  p_property_id UUID,
  p_range_start TIMESTAMPTZ,
  p_range_end TIMESTAMPTZ
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_property_json JSONB;
  v_rooms_json JSONB;
  v_tickets_json JSONB;
BEGIN
  -- 1. Enforce admin role
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.staff_roles WHERE user_id = v_user_id AND role = 'admin'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN_ADMIN_ONLY');
  END IF;

  -- 2. Parameter validation
  IF p_property_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_PROPERTY_ID');
  END IF;

  IF p_range_start IS NULL OR p_range_end IS NULL OR p_range_start >= p_range_end THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_RANGE');
  END IF;

  -- Max 14 days per query range for high performance
  IF (p_range_end - p_range_start) > interval '14 days' THEN
    RETURN jsonb_build_object('success', false, 'error', 'RANGE_TOO_LARGE');
  END IF;

  -- 3. Verify property existence
  SELECT jsonb_build_object(
    'id', id,
    'name', name,
    'address', address
  ) INTO v_property_json
  FROM public.properties
  WHERE id = p_property_id;

  IF v_property_json IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'PROPERTY_NOT_FOUND');
  END IF;

  -- 4. Query rooms and nested bookings in the selected range
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'room_id', r.id,
        'room_name', r.name,
        'room_number', r.room_number,
        'floor_number', r.floor_number,
        'operational_status', COALESCE(ro.operational_status, 'ready'),
        'is_listed', r.is_listed,
        'hourly_price_vnd', r.hourly_price_vnd,
        'nightly_price_vnd', r.nightly_price_vnd,
        'capacity', r.capacity,
        'bookings', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'booking_id', b.id,
              'room_id', b.room_id,
              'check_in_at', COALESCE(b.check_in_at, (b.check_in::text || ' 14:00:00+07')::timestamptz),
              'check_out_at', COALESCE(b.check_out_at, (b.check_out::text || ' 12:00:00+07')::timestamptz),
              'booking_status', b.booking_status,
              'payment_status', b.payment_status,
              'guest_name', COALESCE(prof.display_name, 'Khách lưu trú'),
              'guest_count', b.guest_count,
              'menu_item_count', COALESCE((
                SELECT sum(bmi.quantity)
                FROM public.booking_menu_items bmi
                WHERE bmi.booking_id = b.id
              ), 0)
            ) ORDER BY COALESCE(b.check_in_at, (b.check_in::text || ' 14:00:00+07')::timestamptz) ASC
          )
          FROM public.bookings b
          LEFT JOIN public.profiles prof ON prof.id = b.user_id
          WHERE b.room_id = r.id
            AND LOWER(b.booking_status) IN ('confirmed', 'completed')
            AND COALESCE(b.check_in_at, (b.check_in::text || ' 14:00:00+07')::timestamptz) < p_range_end
            AND COALESCE(b.check_out_at, (b.check_out::text || ' 12:00:00+07')::timestamptz) > p_range_start
        ), '[]'::jsonb)
      ) ORDER BY r.floor_number ASC NULLS LAST, r.room_number ASC NULLS LAST, r.name ASC
    ),
    '[]'::jsonb
  ) INTO v_rooms_json
  FROM public.rooms r
  LEFT JOIN public.room_operations ro ON ro.room_id = r.id
  WHERE r.property_id = p_property_id;

  -- 5. Query property tickets for secondary operational tab
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'room_id', t.room_id,
        'room_number', r.room_number,
        'room_name', r.name,
        'category', t.category,
        'description', t.description,
        'status', t.status,
        'media_paths', t.media_paths,
        'created_at', t.created_at,
        'updated_at', t.updated_at
      ) ORDER BY t.created_at DESC
    ),
    '[]'::jsonb
  ) INTO v_tickets_json
  FROM public.tickets t
  JOIN public.rooms r ON r.id = t.room_id
  WHERE r.property_id = p_property_id;

  RETURN jsonb_build_object(
    'success', true,
    'property', v_property_json,
    'rooms', v_rooms_json,
    'tickets', v_tickets_json
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. get_admin_booking_detail
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_booking_detail(
  p_booking_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_booking_json JSONB;
  v_menu_items_json JSONB;
  v_menu_amount BIGINT := 0;
BEGIN
  -- 1. Enforce admin role
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.staff_roles WHERE user_id = v_user_id AND role = 'admin'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN_ADMIN_ONLY');
  END IF;

  IF p_booking_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_BOOKING_ID');
  END IF;

  -- 2. Query booking, room, property, guest
  -- Strictly EXCLUDES door_access_code, wifi_password, and booking_access_credentials
  SELECT
    jsonb_build_object(
      'id', b.id,
      'room_id', b.room_id,
      'room_name', r.name,
      'room_number', r.room_number,
      'floor_number', r.floor_number,
      'property_id', p.id,
      'property_name', p.name,
      'property_address', p.address,
      'guest_name', COALESCE(prof.display_name, 'Khách lưu trú'),
      'guest_phone', prof.phone,
      'guest_email', u.email,
      'guest_count', b.guest_count,
      'check_in_at', COALESCE(b.check_in_at, (b.check_in::text || ' 14:00:00+07')::timestamptz),
      'check_out_at', COALESCE(b.check_out_at, (b.check_out::text || ' 12:00:00+07')::timestamptz),
      'booking_status', b.booking_status,
      'payment_status', b.payment_status,
      'gross_amount_vnd', b.gross_amount_vnd,
      'discount_amount_vnd', b.discount_amount_vnd,
      'final_paid_amount_vnd', b.final_paid_amount_vnd,
      'created_at', b.created_at
    ) INTO v_booking_json
  FROM public.bookings b
  JOIN public.rooms r ON r.id = b.room_id
  JOIN public.properties p ON p.id = r.property_id
  LEFT JOIN public.profiles prof ON prof.id = b.user_id
  LEFT JOIN auth.users u ON u.id = b.user_id
  WHERE b.id = p_booking_id;

  IF v_booking_json IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'BOOKING_NOT_FOUND');
  END IF;

  -- 3. Query historical menu items with snapshots preserved
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', bmi.id,
        'menu_product_id', bmi.menu_product_id,
        'product_name_snapshot', bmi.product_name_snapshot,
        'current_image_url', mp.image_url,
        'category', mp.category,
        'quantity', bmi.quantity,
        'source_type', bmi.source_type,
        'unit_price_vnd', bmi.unit_price_vnd,
        'total_price_vnd', bmi.total_price_vnd,
        'normal_price_vnd', bmi.normal_price_vnd,
        'reward_source', bmi.reward_source
      ) ORDER BY bmi.created_at ASC
    ),
    '[]'::jsonb
  ) INTO v_menu_items_json
  FROM public.booking_menu_items bmi
  LEFT JOIN public.menu_products mp ON mp.id = bmi.menu_product_id
  WHERE bmi.booking_id = p_booking_id;

  -- 4. Calculate total menu amount
  SELECT COALESCE(SUM(total_price_vnd), 0) INTO v_menu_amount
  FROM public.booking_menu_items
  WHERE booking_id = p_booking_id;

  v_booking_json := v_booking_json || jsonb_build_object('menu_amount_vnd', v_menu_amount);

  RETURN jsonb_build_object(
    'success', true,
    'booking', v_booking_json,
    'menu_items', v_menu_items_json
  );
END;
$$;

-- Permissions
REVOKE ALL ON FUNCTION public.get_admin_property_overview() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_property_overview() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_admin_property_room_schedule(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_property_room_schedule(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_admin_booking_detail(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_booking_detail(UUID) TO authenticated, service_role;
