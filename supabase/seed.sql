-- ============================================================================
-- Supabase Seed Data: seed.sql
-- Development and catalog seed data only.
-- NO real customer data, NO real passwords, NO real door PINs, NO auth.users rows.
-- ============================================================================

-- 1. Seed Properties
insert into public.properties (id, name, slug, address, maps_url, is_active)
values
  (
    '11111111-1111-1111-1111-111111111111',
    'Kapi House — Biệt Thự Hoa Hồng',
    'kapi-house-hoa-hong',
    '12 Đường Hoa Hồng, Phường 4, TP. Đà Lạt',
    'https://maps.google.com/?q=12+Hoa+Hong+Da+Lat',
    true
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'Kapi House — Thung Lũng Mây',
    'kapi-house-thung-lung',
    '45 Đặng Thái Thân, Phường 3, TP. Đà Lạt',
    'https://maps.google.com/?q=45+Dang+Thai+Than+Da+Lat',
    true
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    'Kapi House — Ven Hồ Tuyền Lâm',
    'kapi-house-ho-tuyen-lam',
    'Khu Du Lịch Hồ Tuyền Lâm, Phường 4, TP. Đà Lạt',
    'https://maps.google.com/?q=Ho+Tuyen+Lam+Da+Lat',
    true
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    'Kapi House — Phố Cổ Trung Tâm',
    'kapi-house-pho-co',
    '88 Phan Đình Phùng, Phường 2, TP. Đà Lạt',
    'https://maps.google.com/?q=88+Phan+Dinh+Phung+Da+Lat',
    true
  )
on conflict (id) do nothing;

-- 2. Seed Rooms (Public Catalog)
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
  (
    'a1111111-1111-1111-1111-111111111111',
    '11111111-1111-1111-1111-111111111111',
    'Phòng Deluxe Ban Công Hoa Nắng',
    'Studio 1 giường đôi với ban công thoáng mát hướng vườn hoa.',
    650000,
    2,
    array['Wifi tốc độ cao', 'Điều hòa 2 chiều', 'Tự check-in khóa số', 'Ban công thoáng mát'],
    array['/rooms/deluxe-terrace.jpg'],
    true
  ),
  (
    'b2222222-2222-2222-2222-222222222222',
    '11111111-1111-1111-1111-111111111111',
    'Phòng Cozy Nest Ấm Cúng',
    'Phòng tiêu chuẩn 1 giường lớn, trang bị máy chiếu phim và góc làm việc ấm cúng.',
    480000,
    2,
    array['Khóa thông minh', 'Nước nóng 24/7', 'Máy chiếu phim', 'Bàn làm việc'],
    array['/rooms/cozy-nest.jpg'],
    true
  ),
  (
    'c3333333-3333-3333-3333-333333333333',
    '22222222-2222-2222-2222-222222222222',
    'Phòng Family Suite Gia Đình',
    'Căn hộ 2 phòng ngủ tiện nghi với bếp nấu đầy đủ cho gia đình.',
    1150000,
    4,
    array['Bếp nấu đầy đủ', 'Tủ lạnh lớn', 'Máy giặt sấy', 'Smart TV 55 inch'],
    array['/rooms/family-suite.jpg'],
    true
  ),
  (
    'd4444444-4444-4444-4444-444444444444',
    '22222222-2222-2222-2222-222222222222',
    'Phòng Studio Mây Ngàn',
    'Studio cao cấp ngắm trọn thung lũng mây bồng bềnh, bồn tắm ngâm thư giãn.',
    850000,
    2,
    array['View thung lũng', 'Bồn tắm ngâm', 'Máy sấy tóc cao cấp', 'Loa Bluetooth'],
    array['/rooms/studio-may-ngan.jpg'],
    true
  )
on conflict (id) do nothing;

-- 3. Seed Room Operations (Internal Development States)
insert into public.room_operations (room_id, operational_status)
values
  ('a1111111-1111-1111-1111-111111111111', 'ready'),
  ('b2222222-2222-2222-2222-222222222222', 'ready'),
  ('c3333333-3333-3333-3333-333333333333', 'ready'),
  ('d4444444-4444-4444-4444-444444444444', 'ready')
on conflict (room_id) do nothing;

-- 4. Seed Room Private Details (Development Placeholders Only)
insert into public.room_private_details (
  room_id,
  wifi_ssid,
  wifi_password,
  private_instructions
)
values
  (
    'a1111111-1111-1111-1111-111111111111',
    'Kapi_HoaHong_Guest',
    'dev_placeholder_wifi_pass',
    'Development placeholder: Chạm thẻ từ hoặc nhập mã PIN số trên bàn phím khóa điện tử.'
  ),
  (
    'b2222222-2222-2222-2222-222222222222',
    'Kapi_HoaHong_Guest',
    'dev_placeholder_wifi_pass',
    'Development placeholder: Khóa cửa tự động kích hoạt mã PIN theo thời gian lưu trú.'
  ),
  (
    'c3333333-3333-3333-3333-333333333333',
    'Kapi_ThungLung_Guest',
    'dev_placeholder_wifi_pass',
    'Development placeholder: Vui lòng xem hướng dẫn sử dụng bếp gas và máy giặt trong tủ bếp.'
  ),
  (
    'd4444444-4444-4444-4444-444444444444',
    'Kapi_ThungLung_Guest',
    'dev_placeholder_wifi_pass',
    'Development placeholder: Rèm cửa tự động điều khiển bằng remote cạnh đầu giường.'
  )
on conflict (room_id) do nothing;

-- 5. Seed Approved Loyalty Voucher Definition
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
on conflict (id) do nothing;
