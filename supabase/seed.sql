-- LOCAL / DEMO FIXTURE ONLY - DO NOT RUN IN PRODUCTION OR SHARED ENVIRONMENTS
-- ============================================================================
-- Supabase Seed Data: seed.sql
-- Dự án: Kapi Stay Concierge (TV8 - Database & Backend Data)
-- Mục đích: Nạp dữ liệu demo/local fixture cho 4 cơ sở và 8 phòng nghỉ Kapi Stay
-- (Hà Nội, Đà Nẵng, Đà Lạt, TP. Hồ Chí Minh)
--
-- QUY TẮC DỮ LIỆU FIXTURE:
-- 1. Đây hoàn toàn là dữ liệu demo / local fixture phục vụ phát triển cục bộ và kiểm thử UI/dev.
--    Tuyệt đối không phải dữ liệu thực tế đã xác minh của Kapi Stay / Kapi House trong môi trường production.
--    Không tự suy diễn địa chỉ, Wi-Fi, phòng nghỉ, hình ảnh là thông tin thực tế đã xác minh.
-- 2. Tuyệt đối không chứa secret production, không chứa thông tin khách hàng thật, không seed auth.users.
-- 3. Tuyệt đối không chứa mã PIN cửa / static Digital Key (Digital Key phải booking-scoped và tạo động theo stay window).
-- 4. Thông tin Wi-Fi (SSID/mật khẩu) và hình ảnh (Unsplash) chỉ là placeholder minh họa cho local demo fixture.
-- 5. Tuân thủ kiến trúc phân tách bảng: properties, rooms, room_operations, room_private_details, vouchers.
-- 6. An toàn & idempotent: Dùng ON CONFLICT (...) DO UPDATE, tuyệt đối không dùng TRUNCATE hay DELETE.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. DANH MỤC 4 CƠ SỞ (PROPERTIES / BRANCHES)
-- ----------------------------------------------------------------------------
insert into public.properties (id, name, slug, address, maps_url, is_active)
values
  (
    '11111111-1111-1111-1111-111111111111',
    'Kapi Stay Hà Nội - Phố Cổ Hoàn Kiếm',
    'kapi-stay-ha-noi',
    '18 Hàng Gai, Phường Hàng Gai, Quận Hoàn Kiếm, Hà Nội',
    'https://maps.google.com/?q=18+Hang+Gai+Hoan+Kiem+Ha+Noi',
    true
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'Kapi Stay Đà Nẵng - Biển Mỹ Khê',
    'kapi-stay-da-nang',
    '36 Võ Nguyên Giáp, Phường Phước Mỹ, Quận Sơn Trà, TP. Đà Nẵng',
    'https://maps.google.com/?q=36+Vo+Nguyen+Giap+Son+Tra+Da+Nang',
    true
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    'Kapi Stay Đà Lạt - Thung Lũng Mây',
    'kapi-stay-da-lat',
    '45 Đặng Thái Thân, Phường 3, TP. Đà Lạt, Lâm Đồng',
    'https://maps.google.com/?q=45+Dang+Thai+Than+Da+Lat',
    true
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    'Kapi Stay TP.HCM - Sài Gòn Riverside',
    'kapi-stay-tp-hcm',
    '15 Bến Vân Đồn, Phường 13, Quận 4, TP. Hồ Chí Minh',
    'https://maps.google.com/?q=15+Ben+Van+Don+Quan+4+TP+Ho+Chi+Minh',
    true
  )
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  address = excluded.address,
  maps_url = excluded.maps_url,
  is_active = excluded.is_active;

-- ----------------------------------------------------------------------------
-- 2. DANH MỤC 8 PHÒNG NGHỈ TRẢI ĐỀU 4 CƠ SỞ (PUBLIC ROOM CATALOG)
-- Giá phòng demo: 450.000đ - 1.450.000đ/đêm.
-- Ảnh Unsplash chỉ là ảnh placeholder minh họa cho local demo fixture, không phải ảnh chụp thực tế của Kapi Stay.
-- ----------------------------------------------------------------------------
insert into public.rooms (
  id,
  property_id,
  name,
  description,
  nightly_price_vnd,
  capacity,
  amenities,
  image_paths,
  is_listed
)
values
  -- [Cơ sở 1: Hà Nội]
  (
    'a1111111-1111-1111-1111-111111111111',
    '11111111-1111-1111-1111-111111111111',
    'Kapi Deluxe Studio - Ban Công Phố Cổ',
    'Studio sang trọng ngập tràn ánh sáng tự nhiên với ban công ngắm trọn nhịp sống phố cổ Hà Nội, đầy đủ bếp nấu và tiện nghi thư giãn.',
    750000,
    2,
    array['Điều hòa 2 chiều', 'Smart TV', 'Máy sấy tóc', 'Tủ lạnh mini', 'Bếp nấu', 'Ban công', 'Bình nóng lạnh'],
    array[
      'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1200&q=80'
    ],
    true
  ),
  (
    'a2222222-2222-2222-2222-222222222222',
    '11111111-1111-1111-1111-111111111111',
    'Kapi Cozy Attic - Gác Mái Hoàn Kiếm',
    'Không gian gác mái ấm cúng mang phong cách Indochine hoài niệm giữa lòng Hà Nội, trang bị máy chiếu phim và góc làm việc thanh bình.',
    550000,
    2,
    array['Điều hòa', 'Smart TV', 'Máy sấy tóc', 'Tủ lạnh mini', 'Máy chiếu phim', 'Bàn làm việc'],
    array[
      'https://images.unsplash.com/photo-1566665797739-1674de7a421a?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1618773928121-c32242e63f39?auto=format&fit=crop&w=1200&q=80'
    ],
    true
  ),

  -- [Cơ sở 2: Đà Nẵng]
  (
    'b1111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    'Kapi Ocean Breeze Studio - View Biển Mỹ Khê',
    'Căn hộ studio hiện đại đón trọn gió biển Mỹ Khê trong lành, ban công ngắm hoàng hôn rực rỡ cùng nội thất gỗ ấm áp.',
    950000,
    2,
    array['Điều hòa', 'Smart TV', 'Máy sấy tóc', 'Tủ lạnh mini', 'Ban công', 'Bình siêu tốc'],
    array[
      'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1200&q=80'
    ],
    true
  ),
  (
    'b2222222-2222-2222-2222-222222222222',
    '22222222-2222-2222-2222-222222222222',
    'Kapi Coastal Family Suite - Sơn Trà',
    'Căn hộ 2 phòng ngủ cao cấp tiện nghi với gian bếp nấu đầy đủ cho cả gia đình, chỉ cách bờ biển Mỹ Khê 2 phút tản bộ.',
    1450000,
    4,
    array['Điều hòa', 'Smart TV', 'Máy sấy tóc', 'Tủ lạnh mini', 'Bếp nấu', 'Máy giặt', 'Ban công'],
    array[
      'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80'
    ],
    true
  ),

  -- [Cơ sở 3: Đà Lạt]
  (
    'c1111111-1111-1111-1111-111111111111',
    '33333333-3333-3333-3333-333333333333',
    'Kapi Cozy Attic - View Đồi Thông',
    'Phòng áp mái lãng mạn ngắm trọn đồi thông bạt ngàn của Đà Lạt, trang bị lò sưởi ấm cúng và bồn tắm ngâm thảo mộc thư giãn.',
    680000,
    2,
    array['Lò sưởi ấm', 'Bồn tắm ngâm', 'Smart TV', 'Máy sấy tóc', 'Tủ lạnh mini', 'Ban công', 'Trà & Cà phê'],
    array[
      'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=1200&q=80'
    ],
    true
  ),
  (
    'c2222222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333333',
    'Kapi Valley Studio - Săn Mây Ban Mai',
    'Studio cao cấp lưng chừng đồi mây, ban công săn mây bồng bềnh mỗi sáng sớm cùng khu bếp nấu ấm áp cho kỳ nghỉ đáng nhớ.',
    890000,
    2,
    array['Điều hòa 2 chiều', 'Smart TV', 'Máy sấy tóc', 'Tủ lạnh mini', 'Bếp nấu', 'Ban công', 'Nước nóng 24/7'],
    array[
      'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1200&q=80'
    ],
    true
  ),

  -- [Cơ sở 4: TP. Hồ Chí Minh]
  (
    'd1111111-1111-1111-1111-111111111111',
    '44444444-4444-4444-4444-444444444444',
    'Kapi Modern Studio - Bến Vân Đồn',
    'Studio phong cách tối giản thanh lịch kề bên sông Sài Gòn, giao thông thuận tiện di chuyển sang Quận 1 trong tích tắc.',
    490000,
    2,
    array['Điều hòa', 'Smart TV', 'Máy sấy tóc', 'Tủ lạnh mini', 'Bàn làm việc', 'Ban công'],
    array[
      'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1591088398332-8a7791972843?auto=format&fit=crop&w=1200&q=80'
    ],
    true
  ),
  (
    'd2222222-2222-2222-2222-222222222222',
    '44444444-4444-4444-4444-444444444444',
    'Kapi Executive Suite - View Sông Sài Gòn',
    'Suite hạng sang tầng cao ngắm trọn cảnh sông Sài Gòn lung linh về đêm, ban công thoáng mát và máy giặt sấy riêng biệt.',
    1190000,
    3,
    array['Điều hòa', 'Smart TV', 'Máy sấy tóc', 'Tủ lạnh mini', 'Bếp nấu', 'Ban công', 'Máy giặt sấy'],
    array[
      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80'
    ],
    true
  )
on conflict (id) do update set
  property_id = excluded.property_id,
  name = excluded.name,
  description = excluded.description,
  nightly_price_vnd = excluded.nightly_price_vnd,
  capacity = excluded.capacity,
  amenities = excluded.amenities,
  image_paths = excluded.image_paths,
  is_listed = excluded.is_listed;

-- ----------------------------------------------------------------------------
-- 3. TRẠNG THÁI VẬN HÀNH NỘI BỘ (ROOM OPERATIONS)
-- Trạng thái mặc định: 'ready' (Sẵn sàng đón khách)
-- ----------------------------------------------------------------------------
insert into public.room_operations (room_id, operational_status)
values
  ('a1111111-1111-1111-1111-111111111111', 'ready'),
  ('a2222222-2222-2222-2222-222222222222', 'ready'),
  ('b1111111-1111-1111-1111-111111111111', 'ready'),
  ('b2222222-2222-2222-2222-222222222222', 'ready'),
  ('c1111111-1111-1111-1111-111111111111', 'ready'),
  ('c2222222-2222-2222-2222-222222222222', 'ready'),
  ('d1111111-1111-1111-1111-111111111111', 'ready'),
  ('d2222222-2222-2222-2222-222222222222', 'ready')
on conflict (room_id) do update set
  operational_status = excluded.operational_status;

-- ----------------------------------------------------------------------------
-- 4. THÔNG TIN BẢO MẬT PHÒNG NGHỈ (ROOM PRIVATE DETAILS)
-- Bao gồm Tên Wi-Fi (wifi_ssid), Mật khẩu Wi-Fi (wifi_password) - chỉ là placeholder/demo credentials,
-- tuyệt đối không phải production secrets.
-- Hướng dẫn bảo mật / sử dụng Digital Key ở mức demo (Digital Key được cấp động theo từng booking, không lưu mã tĩnh).
-- ----------------------------------------------------------------------------
insert into public.room_private_details (
  room_id,
  wifi_ssid,
  wifi_password,
  private_instructions
)
values
  (
    'a1111111-1111-1111-1111-111111111111',
    'KapiStay_HaNoi_5G',
    'kapistay2026',
    'Sử dụng Digital Key được cấp trong mục Chuyến đi của tôi trên ứng dụng Kapi Stay để mở cửa. Chạm sáng màn hình khóa điện tử trước khi nhập mã.'
  ),
  (
    'a2222222-2222-2222-2222-222222222222',
    'KapiStay_HaNoi_5G',
    'kapistay2026',
    'Sử dụng Digital Key được cấp trong mục Chuyến đi của tôi trên ứng dụng Kapi Stay để mở cửa. Chạm sáng màn hình khóa điện tử trước khi nhập mã.'
  ),
  (
    'b1111111-1111-1111-1111-111111111111',
    'KapiStay_DaNang_5G',
    'kapistay2026',
    'Sử dụng Digital Key được cấp trong mục Chuyến đi của tôi trên ứng dụng Kapi Stay để mở cửa. Chạm sáng màn hình khóa điện tử trước khi nhập mã.'
  ),
  (
    'b2222222-2222-2222-2222-222222222222',
    'KapiStay_DaNang_5G',
    'kapistay2026',
    'Sử dụng Digital Key được cấp trong mục Chuyến đi của tôi trên ứng dụng Kapi Stay để mở cửa. Chạm sáng màn hình khóa điện tử trước khi nhập mã.'
  ),
  (
    'c1111111-1111-1111-1111-111111111111',
    'KapiStay_DaLat_5G',
    'kapistay2026',
    'Sử dụng Digital Key được cấp trong mục Chuyến đi của tôi trên ứng dụng Kapi Stay để mở cửa. Chạm sáng màn hình khóa điện tử trước khi nhập mã.'
  ),
  (
    'c2222222-2222-2222-2222-222222222222',
    'KapiStay_DaLat_5G',
    'kapistay2026',
    'Sử dụng Digital Key được cấp trong mục Chuyến đi của tôi trên ứng dụng Kapi Stay để mở cửa. Chạm sáng màn hình khóa điện tử trước khi nhập mã.'
  ),
  (
    'd1111111-1111-1111-1111-111111111111',
    'KapiStay_TPHCM_5G',
    'kapistay2026',
    'Sử dụng Digital Key được cấp trong mục Chuyến đi của tôi trên ứng dụng Kapi Stay để mở cửa. Chạm sáng màn hình khóa điện tử trước khi nhập mã.'
  ),
  (
    'd2222222-2222-2222-2222-222222222222',
    'KapiStay_TPHCM_5G',
    'kapistay2026',
    'Sử dụng Digital Key được cấp trong mục Chuyến đi của tôi trên ứng dụng Kapi Stay để mở cửa. Chạm sáng màn hình khóa điện tử trước khi nhập mã.'
  )
on conflict (room_id) do update set
  wifi_ssid = excluded.wifi_ssid,
  wifi_password = excluded.wifi_password,
  private_instructions = excluded.private_instructions;

-- ----------------------------------------------------------------------------
-- 5. VOUCHER MẪU CHO HỆ THỐNG LOYALTY (LOYALTY VOUCHER DEFINITION)
-- Khớp quy tắc nghiệp vụ loyalty: 500 điểm đổi voucher 40%, giới hạn tối đa trên giá gốc 1.000.000đ
-- (mức giảm tối đa suy ra là 400.000đ). Không tạo thêm bảng hay quy tắc ngoài thiết kế.
-- ----------------------------------------------------------------------------
insert into public.vouchers (
  id,
  name,
  voucher_type,
  points_cost,
  discount_percentage,
  max_eligible_base_vnd,
  is_active
)
values
  (
    '99999999-9999-9999-9999-999999999999',
    'Voucher Giảm 40% (Tối đa 400.000đ)',
    'percentage_discount',
    500.0000,
    40.00,
    1000000,
    true
  )
on conflict (id) do update set
  name = excluded.name,
  voucher_type = excluded.voucher_type,
  points_cost = excluded.points_cost,
  discount_percentage = excluded.discount_percentage,
  max_eligible_base_vnd = excluded.max_eligible_base_vnd,
  is_active = excluded.is_active;
