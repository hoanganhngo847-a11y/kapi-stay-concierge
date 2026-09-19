-- ============================================================================
-- File: docs/mock-seed.sql
-- Mục đích: Dữ liệu giả lập (Mock Seed Data) phục vụ kiểm thử độc lập các màn hình
--          (TV2 -> TV7: Catalog, Room Detail, Checkout, My Stay, Tickets, Admin Dashboard)
--          trên Supabase Local / Staging mà không bị phụ thuộc luồng thật.
-- Thực hiện bởi: TV9 (Tuấn Anh — Assets / Content / QA Testing)
-- ============================================================================

/* HƯỚNG DẪN: Nếu muốn hiển thị đơn đặt phòng trên giao diện /my-stay sau khi đăng nhập Google, 
   hãy thay chuỗi '00000000-0000-0000-0000-000000000001' bằng User UID thật lấy trong Authentication -> Users của Supabase */

begin;

-- ============================================================================
-- 0. TẠO USER TEST MẪU (auth.users & public.profiles)
-- Cần thiết để liên kết khóa ngoại (Foreign Key) cho bookings, tickets, vouchers
-- ============================================================================

-- 0.1 Tạo user test trong auth.users nếu chưa tồn tại
insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'testguest@kapistay.local',
  '$2a$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNO',
  now(),
  '{"provider":"google","providers":["google"]}',
  '{"full_name":"Khách Lưu Trú Mẫu (QA Test)","avatar_url":"/images/avatars/default.png"}',
  now(),
  now()
)
on conflict (id) do nothing;

-- 0.2 Đồng bộ hồ sơ vào public.profiles
insert into public.profiles (
  id,
  display_name,
  avatar_url,
  phone,
  created_at,
  updated_at
)
values (
  '00000000-0000-0000-0000-000000000001',
  'Khách Lưu Trú Mẫu (QA Test)',
  '/images/avatars/default.png',
  '0901234567',
  now(),
  now()
)
on conflict (id) do nothing;

-- ============================================================================
-- 1. TẠO 2 CƠ SỞ & 2 PHÒNG MẪU (properties, rooms, room_private_details)
-- - 1 phòng tại cơ sở Đặng Văn Ngữ
-- - 1 phòng tại cơ sở Tây Hồ
-- - Đầy đủ giá tiền, wifi_pass, passcode cửa và link ảnh: /images/rooms/room-1.webp
-- ============================================================================

-- 1.1 Cơ sở (properties)
insert into public.properties (
  id,
  name,
  slug,
  address,
  maps_url,
  is_active
)
values
  (
    'd1111111-1111-1111-1111-111111111111',
    'Kapi House — Đặng Văn Ngữ',
    'kapi-house-dang-van-ngu',
    'Số 12 Ngõ 4C Đặng Văn Ngữ, Phường Trung Tự, Quận Đống Đa, Hà Nội',
    'https://maps.google.com/?q=Dang+Van+Ngu+Ha+Noi',
    true
  ),
  (
    'd2222222-2222-2222-2222-222222222222',
    'Kapi House — Tây Hồ',
    'kapi-house-tay-ho',
    'Số 28 Ngõ 52 Tô Ngọc Vân, Phường Quảng An, Quận Tây Hồ, Hà Nội',
    'https://maps.google.com/?q=To+Ngoc+Van+Tay+Ho+Ha+Noi',
    true
  )
on conflict (id) do nothing;

-- 1.2 Danh mục phòng (rooms)
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
    'e1111111-1111-1111-1111-111111111111',
    'd1111111-1111-1111-1111-111111111111',
    'Phòng Studio Hoa Nắng — Đặng Văn Ngữ',
    'Phòng studio khép kín ấm cúng với đầy đủ tiện nghi bếp từ đôi, bình nước nóng và khóa số tự động.',
    650000,
    2,
    array['Wifi tốc độ cao', 'Điều hòa 2 chiều', 'Khóa số thông minh', 'Bếp từ đôi', 'Bình nóng lạnh'],
    array['/images/rooms/room-1.webp'],
    true
  ),
  (
    'e2222222-2222-2222-2222-222222222222',
    'd2222222-2222-2222-2222-222222222222',
    'Phòng Ban Công View Hồ — Tây Hồ',
    'Phòng đôi cao cấp sở hữu ban công thoáng đãng ngắm trọn cảnh hồ Tây lộng gió, trang bị bồn tắm thư giãn.',
    850000,
    2,
    array['Wifi tốc độ cao', 'Điều hòa 2 chiều', 'Ban công view hồ', 'Bồn tắm ngâm', 'Khóa số thông minh'],
    array['/images/rooms/room-1.webp'],
    true
  )
on conflict (id) do nothing;

-- 1.3 Trạng thái vận hành phòng (room_operations)
insert into public.room_operations (
  room_id,
  operational_status
)
values
  ('e1111111-1111-1111-1111-111111111111', 'ready'),
  ('e2222222-2222-2222-2222-222222222222', 'ready')
on conflict (room_id) do nothing;

-- 1.4 Thông tin bảo mật riêng phòng: Wi-Fi Password & Passcode hướng dẫn (room_private_details)
insert into public.room_private_details (
  room_id,
  wifi_ssid,
  wifi_password,
  private_instructions
)
values
  (
    'e1111111-1111-1111-1111-111111111111',
    'Kapi_DangVanNgu_5G',
    'kapi@dvn2026',
    'Passcode khóa cửa điện tử: 123456#. Chạm mu bàn tay cho sáng màn hình cảm ứng, nhập mã số và kết thúc bằng phím #.'
  ),
  (
    'e2222222-2222-2222-2222-222222222222',
    'Kapi_TayHo_HighSpeed',
    'kapi@tayho2026',
    'Passcode khóa cửa điện tử: 654321#. Chốt tự động khóa sau 3 giây khi đóng cửa.'
  )
on conflict (room_id) do nothing;

-- ============================================================================
-- 2. TẠO 2 VOUCHER MẪU (vouchers & voucher_redemptions)
-- - Mã hợp lệ: "KAPI50" (giảm 50k, is_active = true)
-- - Mã hết hạn: "HETTIEN" (hết hạn / không khả dụng để test luồng checkout)
-- ============================================================================

-- 2.1 Định nghĩa voucher (vouchers)
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
    'f1111111-1111-1111-1111-111111111111',
    'KAPI50',
    'percentage_discount',
    500.0000,
    10.00,
    500000,
    true
  ),
  (
    'f2222222-2222-2222-2222-222222222222',
    'HETTIEN',
    'percentage_discount',
    500.0000,
    10.00,
    500000,
    false
  )
on conflict (id) do nothing;

-- 2.2 Bản ghi đổi voucher của user test (voucher_redemptions)
-- Hỗ trợ test checkout cả bằng mã voucher và bằng danh sách voucher đang sở hữu
insert into public.voucher_redemptions (
  id,
  voucher_id,
  user_id,
  status,
  issued_at,
  expires_at,
  discount_amount_vnd
)
values
  (
    'fd111111-1111-1111-1111-111111111111',
    'f1111111-1111-1111-1111-111111111111',
    '00000000-0000-0000-0000-000000000001',
    'AVAILABLE',
    now(),
    now() + interval '24 hours',
    50000
  ),
  (
    'fd222222-2222-2222-2222-222222222222',
    'f2222222-2222-2222-2222-222222222222',
    '00000000-0000-0000-0000-000000000001',
    'EXPIRED',
    now() - interval '2 days',
    now() - interval '1 day',
    null
  )
on conflict (id) do nothing;

-- ============================================================================
-- 3. TẠO 1 ĐƠN ĐẶT PHÒNG MẪU (bookings & booking_access_credentials)
-- - Trạng thái: 'confirmed'
-- - Check-in: hôm nay (current_date)
-- - Check-out: ngày mai (current_date + 1)
-- - Kèm khóa số điện tử (Digital Key) hiển thị trực tiếp trên trang /my-stay
-- ============================================================================

-- 3.1 Đơn đặt phòng (bookings)
insert into public.bookings (
  id,
  user_id,
  room_id,
  check_in,
  check_out,
  guest_count,
  gross_amount_vnd,
  discount_amount_vnd,
  final_paid_amount_vnd,
  payment_status,
  booking_status,
  created_at,
  updated_at
)
values (
  '00000000-0000-0000-0000-000000000021',
  '00000000-0000-0000-0000-000000000001',
  'e1111111-1111-1111-1111-111111111111',
  current_date,
  current_date + 1,
  2,
  650000,
  50000,
  600000,
  'verified',
  'confirmed',
  now(),
  now()
)
on conflict (id) do nothing;

-- 3.2 Digital Key cửa phòng đang kích hoạt (booking_access_credentials)
insert into public.booking_access_credentials (
  id,
  booking_id,
  room_id,
  credential_type,
  credential_value,
  instructions,
  valid_from,
  valid_until,
  status
)
values (
  'ba111111-1111-1111-1111-111111111111',
  '00000000-0000-0000-0000-000000000021',
  'e1111111-1111-1111-1111-111111111111',
  'pin',
  '123456#',
  'Chạm mu bàn tay cho sáng màn hình LED, nhập 123456 rồi nhấn phím # để mở khóa.',
  (current_date + time '14:00:00') at time zone 'Asia/Ho_Chi_Minh' - interval '2 hours',
  ((current_date + 1) + time '12:00:00') at time zone 'Asia/Ho_Chi_Minh',
  'active'
)
on conflict (id) do nothing;

-- Hoặc chạy nhanh lệnh này sau khi đã đăng nhập Google:
-- UPDATE bookings SET user_id = 'DÁN_USER_UID_GOOGLE_VÀO_ĐÂY' WHERE id = '00000000-0000-0000-0000-000000000021';
-- UPDATE tickets SET user_id = 'DÁN_USER_UID_GOOGLE_VÀO_ĐÂY' WHERE booking_id = '00000000-0000-0000-0000-000000000021';

-- ============================================================================
-- 4. TẠO 2 PHIẾU BÁO SỰ CỐ MẪU (tickets)
-- - Vé 1: "Điều hòa chảy nước" trạng thái 'pending'
-- - Vé 2: "Xin thêm gối" trạng thái 'in_progress'
-- Phục vụ kiểm thử trang /my-stay của khách và /admin của vận hành viên
-- ============================================================================
insert into public.tickets (
  id,
  user_id,
  booking_id,
  room_id,
  category,
  description,
  media_paths,
  status,
  created_at,
  updated_at
)
values
  (
    't1111111-1111-1111-1111-111111111111',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000021',
    'e1111111-1111-1111-1111-111111111111',
    'Thiết bị điện lạnh',
    'Điều hòa chảy nước xuống góc sàn gỗ gần giường, cần thợ kiểm tra kỹ thuật gấp.',
    array['/images/rooms/room-1.webp'],
    'pending',
    now() - interval '30 minutes',
    now() - interval '30 minutes'
  ),
  (
    't2222222-2222-2222-2222-222222222222',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000021',
    'e1111111-1111-1111-1111-111111111111',
    'Tiện ích phòng',
    'Xin thêm gối ngủ êm và 01 chăn mỏng phục vụ thêm người lớn.',
    array[]::text[],
    'in_progress',
    now() - interval '2 hours',
    now() - interval '1 hour'
  )
on conflict (id) do nothing;

-- Hoàn tất nạp dữ liệu
commit;


-- ============================================================================
-- PHẦN DỌN DẸP / XÓA TOÀN BỘ DỮ LIỆU GIẢ (CLEANUP SCRIPT)
-- Hướng dẫn: Khi kết thúc kiểm thử hoặc muốn hoàn tác dữ liệu giả,
--           bỏ dấu chú thích (comment) và chạy các dòng lệnh dưới đây.
-- Thứ tự xóa tuân thủ nghiêm ngặt ràng buộc khóa ngoại (Foreign Key Constraints).
-- ============================================================================

/*
begin;

-- 1. Xóa tickets giả lập
delete from public.tickets
where id in (
  't1111111-1111-1111-1111-111111111111',
  't2222222-2222-2222-2222-222222222222'
);

-- 2. Xóa mã khóa số (digital keys) của đơn đặt phòng mẫu
delete from public.booking_access_credentials
where booking_id = '00000000-0000-0000-0000-000000000021';

-- 3. Xóa lượt đổi voucher của user test
delete from public.voucher_redemptions
where id in (
  'fd111111-1111-1111-1111-111111111111',
  'fd222222-2222-2222-2222-222222222222'
);

-- 4. Xóa đơn đặt phòng mẫu
delete from public.bookings
where id = '00000000-0000-0000-0000-000000000021';

-- 5. Xóa 2 voucher mẫu
delete from public.vouchers
where id in (
  'f1111111-1111-1111-1111-111111111111',
  'f2222222-2222-2222-2222-222222222222'
);

-- 6. Xóa chi tiết bảo mật & trạng thái vận hành của 2 phòng mẫu
delete from public.room_private_details
where room_id in (
  'e1111111-1111-1111-1111-111111111111',
  'e2222222-2222-2222-2222-222222222222'
);

delete from public.room_operations
where room_id in (
  'e1111111-1111-1111-1111-111111111111',
  'e2222222-2222-2222-2222-222222222222'
);

-- 7. Xóa 2 phòng mẫu
delete from public.rooms
where id in (
  'e1111111-1111-1111-1111-111111111111',
  'e2222222-2222-2222-2222-222222222222'
);

-- 8. Xóa 2 cơ sở mẫu
delete from public.properties
where id in (
  'd1111111-1111-1111-1111-111111111111',
  'd2222222-2222-2222-2222-222222222222'
);

-- 9. (Tùy chọn) Xóa hồ sơ user test
delete from public.profiles
where id = '00000000-0000-0000-0000-000000000001';

delete from auth.users
where id = '00000000-0000-0000-0000-000000000001';

commit;
*/
