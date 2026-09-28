-- ============================================================================
-- FIXTURE: Hourly Demo Seed (8 Properties × 20 Rooms = 160 Rooms)
-- BANNER: DEMO / DEVELOPMENT FIXTURE ONLY
-- LƯU Ý: Đây là DEMO DATA. Không được mô tả địa chỉ/phòng/hình ảnh là dữ liệu
-- thực tế đã xác minh của Kapi Stay.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. 8 CHI NHÁNH / PROPERTIES (DEMO)
-- ----------------------------------------------------------------------------

INSERT INTO public.properties (id, name, slug, address, maps_url, is_active)
VALUES
  (
    'b1000000-0000-0000-0000-000000000001',
    'Kapi Stay Hà Nội - Hoàn Kiếm',
    'kapi-stay-ha-noi-hoan-kiem',
    '12 Hàng Bè, P. Hàng Bạc, Q. Hoàn Kiếm, Hà Nội (Demo)',
    'https://maps.google.com/?q=Hoan+Kiem+Hanoi',
    true
  ),
  (
    'b1000000-0000-0000-0000-000000000002',
    'Kapi Stay Hà Nội - Cầu Giấy',
    'kapi-stay-ha-noi-cau-giay',
    '36 Duy Tân, P. Dịch Vọng Hậu, Q. Cầu Giấy, Hà Nội (Demo)',
    'https://maps.google.com/?q=Cau+Giay+Hanoi',
    true
  ),
  (
    'b1000000-0000-0000-0000-000000000003',
    'Kapi Stay TP.HCM - Quận 1',
    'kapi-stay-tphcm-quan-1',
    '45 Bùi Viện, P. Phạm Ngũ Lão, Quận 1, TP.HCM (Demo)',
    'https://maps.google.com/?q=District+1+HCMC',
    true
  ),
  (
    'b1000000-0000-0000-0000-000000000004',
    'Kapi Stay TP.HCM - Bình Thạnh',
    'kapi-stay-tphcm-binh-thanh',
    '88 Nguyễn Cửu Vân, P. 17, Q. Bình Thạnh, TP.HCM (Demo)',
    'https://maps.google.com/?q=Binh+Thanh+HCMC',
    true
  ),
  (
    'b1000000-0000-0000-0000-000000000005',
    'Kapi Stay Đà Nẵng - Mỹ Khê',
    'kapi-stay-da-nang-my-khe',
    '18 Võ Văn Kiệt, P. Phước Mỹ, Q. Sơn Trà, Đà Nẵng (Demo)',
    'https://maps.google.com/?q=My+Khe+Da+Nang',
    true
  ),
  (
    'b1000000-0000-0000-0000-000000000006',
    'Kapi Stay Đà Lạt - Trung Tâm',
    'kapi-stay-da-lat-trung-tam',
    '22 Trương Công Định, Phường 1, TP. Đà Lạt (Demo)',
    'https://maps.google.com/?q=Da+Lat+Center',
    true
  ),
  (
    'b1000000-0000-0000-0000-000000000007',
    'Kapi Stay Nha Trang - Trần Phú',
    'kapi-stay-nha-trang-tran-phu',
    '96 Trần Phú, P. Lộc Thọ, TP. Nha Trang (Demo)',
    'https://maps.google.com/?q=Tran+Phu+Nha+Trang',
    true
  ),
  (
    'b1000000-0000-0000-0000-000000000008',
    'Kapi Stay Hạ Long - Bãi Cháy',
    'kapi-stay-ha-long-bai-chay',
    '5 Hạ Long, P. Bãi Cháy, TP. Hạ Long (Demo)',
    'https://maps.google.com/?q=Bai+Chay+Ha+Long',
    true
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  address = EXCLUDED.address,
  maps_url = EXCLUDED.maps_url,
  is_active = EXCLUDED.is_active;

-- ----------------------------------------------------------------------------
-- 2. 160 PHÒNG NGHỈ (8 CHI NHÁNH × 20 PHÒNG)
-- Phân loại: Standard (101-105), Superior (106-110), Deluxe (111-115),
--            Premium (116-118), Suite (119-120).
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_props RECORD;
  v_i INTEGER;
  v_room_num INTEGER;
  v_room_id UUID;
  v_code TEXT;
  v_tier TEXT;
  v_name TEXT;
  v_desc TEXT;
  v_hourly_price BIGINT;
  v_nightly_price BIGINT;
  v_capacity INTEGER;
  v_amenities TEXT[];
  v_images TEXT[];
  v_branch_offset INTEGER;
BEGIN
  v_branch_offset := 0;

  FOR v_props IN (
    SELECT id, name, slug,
      CASE
        WHEN slug = 'kapi-stay-ha-noi-hoan-kiem' THEN 'HK'
        WHEN slug = 'kapi-stay-ha-noi-cau-giay' THEN 'CG'
        WHEN slug = 'kapi-stay-tphcm-quan-1' THEN 'Q1'
        WHEN slug = 'kapi-stay-tphcm-binh-thanh' THEN 'BT'
        WHEN slug = 'kapi-stay-da-nang-my-khe' THEN 'DN'
        WHEN slug = 'kapi-stay-da-lat-trung-tam' THEN 'DL'
        WHEN slug = 'kapi-stay-nha-trang-tran-phu' THEN 'NT'
        WHEN slug = 'kapi-stay-ha-long-bai-chay' THEN 'HL'
        ELSE 'KP'
      END AS code_prefix,
      CASE
        WHEN slug IN ('kapi-stay-ha-noi-hoan-kiem', 'kapi-stay-tphcm-quan-1') THEN 20000
        WHEN slug IN ('kapi-stay-da-nang-my-khe', 'kapi-stay-nha-trang-tran-phu') THEN 10000
        WHEN slug IN ('kapi-stay-da-lat-trung-tam', 'kapi-stay-ha-long-bai-chay') THEN 15000
        ELSE 0
      END AS price_premium
    FROM public.properties
    WHERE is_active = true
    ORDER BY id
  )
  LOOP
    v_branch_offset := v_branch_offset + 1;

    FOR v_i IN 1..20 LOOP
      v_room_num := 100 + v_i;
      -- Deterministic UUID for each room: c0000000-<branch_index 4 digits>-0000-0000-<room_num 12 digits>
      v_room_id := ('c0000000-' || lpad(v_branch_offset::text, 4, '0') || '-0000-0000-' || lpad(v_room_num::text, 12, '0'))::uuid;
      v_code := v_props.code_prefix || '-' || v_room_num::text;

      -- Determine Tier, Price, Capacity, and Amenities
      IF v_i <= 5 THEN
        v_tier := 'Standard';
        v_name := 'Kapi Standard ' || v_code;
        v_desc := 'Phòng Standard tiện nghi, ấm cúng và đầy đủ dịch vụ thiết yếu cho kỳ lưu trú ngắn giờ tự check-in.';
        v_hourly_price := 90000 + v_props.price_premium + ((v_i - 1) * 5000);
        v_capacity := 2;
        v_amenities := ARRAY['Điều hòa', 'Smart TV', 'Wi-Fi', 'Máy sấy tóc', 'Tủ lạnh mini', 'Bình nóng lạnh', 'Bàn làm việc'];
        v_images := ARRAY[
          'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1200&q=80',
          'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1200&q=80'
        ];
      ELSIF v_i <= 10 THEN
        v_tier := 'Superior';
        v_name := 'Kapi Superior ' || v_code;
        v_desc := 'Phòng Superior thoáng mát với cửa sổ lớn, sofa thư giãn và không gian nghỉ ngơi thư thái theo giờ.';
        v_hourly_price := 125000 + v_props.price_premium + ((v_i - 6) * 5000);
        v_capacity := 2;
        v_amenities := ARRAY['Điều hòa', 'Smart TV', 'Wi-Fi', 'Máy sấy tóc', 'Tủ lạnh mini', 'Bình nóng lạnh', 'Bàn làm việc', 'Ghế sofa'];
        v_images := ARRAY[
          'https://images.unsplash.com/photo-1566665797739-1674de7a421a?auto=format&fit=crop&w=1200&q=80',
          'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1200&q=80'
        ];
      ELSIF v_i <= 15 THEN
        v_tier := 'Deluxe';
        v_name := 'Kapi Deluxe ' || v_code;
        v_desc := 'Phòng Deluxe sang trọng trang bị bồn tắm nằm thư giãn, nội thất gỗ ấm áp và dịch vụ tự phục vụ 24/7.';
        v_hourly_price := 160000 + v_props.price_premium + ((v_i - 11) * 6000);
        v_capacity := 3;
        v_amenities := ARRAY['Điều hòa', 'Smart TV', 'Wi-Fi', 'Máy sấy tóc', 'Tủ lạnh mini', 'Bình nóng lạnh', 'Bàn làm việc', 'Ghế sofa', 'Bồn tắm'];
        v_images := ARRAY[
          'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1200&q=80',
          'https://images.unsplash.com/photo-1591088398332-8a7791972843?auto=format&fit=crop&w=1200&q=80'
        ];
      ELSIF v_i <= 18 THEN
        v_tier := 'Premium';
        v_name := 'Kapi Premium ' || v_code;
        v_desc := 'Phòng Premium có ban công thoáng đãng đón ánh sáng tự nhiên, góc làm việc và bồn tắm phong cách boutique.';
        v_hourly_price := 205000 + v_props.price_premium + ((v_i - 16) * 10000);
        v_capacity := 3;
        v_amenities := ARRAY['Điều hòa', 'Smart TV', 'Wi-Fi', 'Máy sấy tóc', 'Tủ lạnh mini', 'Bình nóng lạnh', 'Bàn làm việc', 'Ghế sofa', 'Bồn tắm', 'Ban công'];
        v_images := ARRAY[
          'https://images.unsplash.com/photo-1591088398332-8a7791972843?auto=format&fit=crop&w=1200&q=80',
          'https://images.unsplash.com/photo-1566665797739-1674de7a421a?auto=format&fit=crop&w=1200&q=80'
        ];
      ELSE
        v_tier := 'Suite';
        v_name := 'Kapi Suite ' || v_code;
        v_desc := 'Suite cao cấp diện tích lớn với ban công ngắm cảnh, bồn tắm đôi, máy pha cà phê và sofa bed rộng rãi.';
        v_hourly_price := 260000 + v_props.price_premium + ((v_i - 19) * 20000);
        v_capacity := 4;
        v_amenities := ARRAY['Điều hòa', 'Smart TV', 'Wi-Fi', 'Máy sấy tóc', 'Tủ lạnh mini', 'Bình nóng lạnh', 'Bàn làm việc', 'Ghế sofa', 'Bồn tắm', 'Ban công', 'Máy pha cà phê'];
        v_images := ARRAY[
          'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1200&q=80',
          'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1200&q=80'
        ];
      END IF;

      -- Backward-compatible nightly price approximation (e.g. 5.5 hours)
      v_nightly_price := v_hourly_price * 6;

      INSERT INTO public.rooms (
        id,
        property_id,
        name,
        description,
        hourly_price_vnd,
        nightly_price_vnd,
        capacity,
        amenities,
        image_paths,
        is_listed
      ) VALUES (
        v_room_id,
        v_props.id,
        v_name,
        v_desc,
        v_hourly_price,
        v_nightly_price,
        v_capacity,
        v_amenities,
        v_images,
        true
      )
      ON CONFLICT (id) DO UPDATE SET
        property_id = EXCLUDED.property_id,
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        hourly_price_vnd = EXCLUDED.hourly_price_vnd,
        nightly_price_vnd = EXCLUDED.nightly_price_vnd,
        capacity = EXCLUDED.capacity,
        amenities = EXCLUDED.amenities,
        image_paths = EXCLUDED.image_paths,
        is_listed = EXCLUDED.is_listed;

      -- Room operations default
      INSERT INTO public.room_operations (room_id, operational_status)
      VALUES (v_room_id, 'ready')
      ON CONFLICT (room_id) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 3. DEMO AVAILABILITY BLOCKS (OCCUPANCY VÍ DỤ THỰC TẾ)
-- Tạo availability blocks cho một số phòng ở các khung giờ điển hình
-- trong ngày hôm nay, ngày mai và ngày kia (Asia/Ho_Chi_Minh timezone).
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_today_start TIMESTAMPTZ;
  v_day_offset INTEGER;
  v_target_day TIMESTAMPTZ;
  v_room_101 UUID;
  v_room_102 UUID;
  v_room_103 UUID;
  v_room_104 UUID;
BEGIN
  -- Lấy mốc 00:00:00 hôm nay theo giờ Việt Nam
  v_today_start := date_trunc('day', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh';

  -- Khối demo cho 3 ngày: hôm nay (0), ngày mai (1), ngày kia (2)
  FOR v_day_offset IN 0..2 LOOP
    v_target_day := v_today_start + (v_day_offset || ' days')::INTERVAL;

    -- Lấy 4 phòng mẫu từ Chi nhánh 1 (Hoàn Kiếm) và Chi nhánh 3 (Quận 1)
    v_room_101 := ('c0000000-0001-0000-0000-000000000101')::uuid; -- HK-101
    v_room_102 := ('c0000000-0001-0000-0000-000000000102')::uuid; -- HK-102
    v_room_103 := ('c0000000-0003-0000-0000-000000000103')::uuid; -- Q1-103
    v_room_104 := ('c0000000-0003-0000-0000-000000000104')::uuid; -- Q1-104

    -- Slot 1: 08:00 - 10:00 (BOOKED) trên phòng 101
    INSERT INTO public.room_availability_blocks (id, room_id, starts_at, ends_at, reason)
    VALUES (
      ('e0000001-' || lpad(v_day_offset::text, 4, '0') || '-0000-0000-000000000101')::uuid,
      v_room_101,
      v_target_day + INTERVAL '8 hours',
      v_target_day + INTERVAL '10 hours',
      'BOOKED'
    )
    ON CONFLICT (id) DO UPDATE SET
      starts_at = EXCLUDED.starts_at,
      ends_at = EXCLUDED.ends_at,
      reason = EXCLUDED.reason;

    -- Slot 2: 10:30 - 13:00 (MAINTENANCE) trên phòng 102
    INSERT INTO public.room_availability_blocks (id, room_id, starts_at, ends_at, reason)
    VALUES (
      ('e0000002-' || lpad(v_day_offset::text, 4, '0') || '-0000-0000-000000000102')::uuid,
      v_room_102,
      v_target_day + INTERVAL '10 hours 30 minutes',
      v_target_day + INTERVAL '13 hours',
      'MAINTENANCE'
    )
    ON CONFLICT (id) DO UPDATE SET
      starts_at = EXCLUDED.starts_at,
      ends_at = EXCLUDED.ends_at,
      reason = EXCLUDED.reason;

    -- Slot 3: 14:00 - 17:00 (BOOKED) trên phòng 103
    INSERT INTO public.room_availability_blocks (id, room_id, starts_at, ends_at, reason)
    VALUES (
      ('e0000003-' || lpad(v_day_offset::text, 4, '0') || '-0000-0000-000000000103')::uuid,
      v_room_103,
      v_target_day + INTERVAL '14 hours',
      v_target_day + INTERVAL '17 hours',
      'BOOKED'
    )
    ON CONFLICT (id) DO UPDATE SET
      starts_at = EXCLUDED.starts_at,
      ends_at = EXCLUDED.ends_at,
      reason = EXCLUDED.reason;

    -- Slot 4: 18:00 - 22:00 (HOUSEKEEPING) trên phòng 104
    INSERT INTO public.room_availability_blocks (id, room_id, starts_at, ends_at, reason)
    VALUES (
      ('e0000004-' || lpad(v_day_offset::text, 4, '0') || '-0000-0000-000000000104')::uuid,
      v_room_104,
      v_target_day + INTERVAL '18 hours',
      v_target_day + INTERVAL '22 hours',
      'HOUSEKEEPING'
    )
    ON CONFLICT (id) DO UPDATE SET
      starts_at = EXCLUDED.starts_at,
      ends_at = EXCLUDED.ends_at,
      reason = EXCLUDED.reason;
  END LOOP;
END $$;
