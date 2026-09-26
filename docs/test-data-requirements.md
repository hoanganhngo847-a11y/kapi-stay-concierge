# Đặc Tả Yêu Cầu Dữ Liệu Kiểm Thử (Test Data Requirements)
## Kapi Stay Concierge — Test Fixtures Handover from QA (TV9) to Database Foundation (TV8)

- **Người lập tài liệu:** TV9 (Tuấn Anh — Assets / Content / QA Testing)
- **Người tiếp nhận triển khai:** TV8 (Quỳnh — Database / Backend Data / Supabase Foundation)
- **Người phê duyệt kiến trúc:** TV1 (Hoàng Anh — Main Maintainer / Tech Lead)
- **Tài liệu tham chiếu:** [./TEST_CASES.md](./TEST_CASES.md), [./PROJECT_GUIDE.md](./PROJECT_GUIDE.md), [./TEAM_FILE_OWNERSHIP.md](./TEAM_FILE_OWNERSHIP.md), [./FEATURE_OWNERS.md](./FEATURE_OWNERS.md), `supabase/seed.sql`

---

## 1. Mục Đích & Bối Cảnh Bàn Giao (Purpose & Context)

Tài liệu này đặc tả danh mục dữ liệu mẫu (**Test Fixtures**) đồng bộ chuẩn xác theo **Option A (Khớp 100% với `supabase/seed.sql` trên `main`)** nhằm phục vụ QA/TV9 và các kỹ sư phát triển giao diện (TV2 đến TV7) thực thi độc lập 10 kịch bản kiểm thử trong [./TEST_CASES.md](./TEST_CASES.md) mà không bị phụ thuộc vào luồng thanh toán thật hay dữ liệu khách hàng thực tế.

Theo đúng quy định phân quyền tại [./TEAM_FILE_OWNERSHIP.md](./TEAM_FILE_OWNERSHIP.md):
- **TV9 (QA / Content)** chịu trách nhiệm đặc tả yêu cầu nghiệp vụ và cấu trúc dữ liệu kiểm thử dưới dạng văn bản tài liệu; **không lưu trữ hoặc thực thi trực tiếp các file script SQL** trong repository nhằm bảo vệ khu vực Protected Foundation.
- **TV8 (Database Foundation)** đã triển khai toàn bộ catalog cơ sở và phòng nghỉ thực tế vào `supabase/seed.sql` trên nhánh `main`. Tài liệu này chuẩn hóa toàn bộ các fixture ID, tên phòng, giá phòng và sức chứa khớp 100% với dữ liệu seed có sẵn của TV8.

---

## 2. Nguyên Tắc Bảo Mật & Ràng Buộc Kiến Trúc (Security & Architecture Principles)

Khi sử dụng và chuẩn bị dữ liệu mẫu trong cơ sở dữ liệu Supabase, các bên cần đảm bảo tuân thủ các nguyên tắc cốt lõi sau:

1. **Tuyệt đối không lưu mã cửa (Door PIN / Passcode) trong `room_private_details`:**
   - Cột `private_instructions` trong bảng `room_private_details` chỉ được chứa thông tin Wi-Fi tĩnh và các chỉ dẫn nội bộ phòng (cách dùng rèm, máy giặt, vị trí phích cắm, v.v.).
   - Passcode cửa không phải là thuộc tính tĩnh của phòng.
2. **Mã số mở cửa (Digital Key) bắt buộc sinh động, có thời hạn và gắn theo đơn phòng:**
   - Toàn bộ thông tin mở cửa thực tế phải được lưu trong bảng `booking_access_credentials`.
   - Mỗi bản ghi Digital Key bắt buộc phải gắn chặt với một `booking_id` cụ thể, có phạm vi hiệu lực chuẩn xác theo khung giờ lưu trú (bắt đầu đúng 14:00 ngày nhận phòng và kết thúc đúng 12:00 ngày trả phòng) và trạng thái `active`.
   - **Precondition cho QA (Deterministic Testing):** Khi chạy test case kiểm tra mã mở cửa (TC-06), thời điểm kiểm thử (`now()`) phải nằm trong khung giờ lưu trú (14:00 - 12:00) hoặc QA thiết lập fixture môi trường có khung giờ bao hàm thời điểm thực thi để đảm bảo test reproducible mà không phá vỡ rule time-bounded (không trừ lùi 2 giờ tùy tiện).
3. **Tuân thủ nghiêm ngặt công thức Loyalty & Voucher:**
   - Voucher đổi điểm phải tuân thủ đúng quy định trong [./PROJECT_GUIDE.md](./PROJECT_GUIDE.md): chi phí đổi 500 điểm, giảm 40% trên giá phòng đủ điều kiện, mức chiết khấu tối đa 400.000 VND (base cap 1.000.000 VND).
   - Voucher hợp lệ trong `supabase/seed.sql` có ID: `99999999-9999-9999-9999-999999999999`.
   - Thời hạn hiệu lực của voucher là đúng 24 giờ kể từ thời điểm phát hành (`expires_at = current_timestamp + interval '24 hours'`).
4. **Định dạng UUID chuẩn Hex:**
   - Toàn bộ ID khóa chính và khóa ngoại mẫu phải là chuỗi UUID hợp lệ tuân thủ bảng chữ số Hex (`[0-9a-fA-F]`). Tuyệt đối không dùng ký tự ngoài quy chuẩn (như ký tự `t` hay tiền tố chuỗi `CK-...`).
5. **Chuẩn hóa giá trị Canonical Statuses theo Backend Schema:**
   - Toàn bộ các trường trạng thái trong fixtures phải tuân thủ chính xác 1 giá trị canonical enum/text duy nhất theo schema migrations trên main (chuẩn xác từng ký tự hoa/thường):
     - `checkout_sessions.status`: `'ACTIVE'`
     - `bookings.booking_status`: `'confirmed'`
     - `bookings.payment_status`: `'paid'`
     - `tickets.status`: `'pending'` (phiếu mới tạo) và `'in_progress'` (phiếu đang xử lý)
     - `booking_access_credentials.status`: `'active'`
     - `voucher_redemptions.status`: `'AVAILABLE'` (chưa dùng), `'EXPIRED'` (hết hạn), `'USED'` (đã dùng)
     - `room_operations.operational_status`: `'ready'`
   - Tuyệt đối không sử dụng cách viết tùy chọn (A/B, hoặc, ví dụ) để đảm bảo tính deterministic cho kịch bản kiểm thử.
6. **Tách bạch Auth Fixture Strategy khỏi Database Seed:**
   - File `supabase/seed.sql` chỉ chứa dữ liệu public catalog (properties, rooms, room_operations, room_private_details, vouchers), tuyệt đối **không seed vào `auth.users`** nhằm bảo vệ schema Auth nội bộ của Supabase.
   - Tài khoản kiểm thử QA (Khách lưu trú & Vận hành viên) được provision độc lập qua Supabase Auth Dashboard / CLI hoặc script setup Auth riêng do TV8/TV1 phê duyệt.
   - Bảng `public.profiles` chỉ liên kết với `id` của `auth.users` thực tế đã được tạo từ trước.
7. **Ghi chú Kiến Trúc Về Mapping `content/guest-guide.json` (TV6 / TV1):**
   - Các `branchId` (`dvn`, `tay-ho`, `cau-giay`, `hoan-kiem`) trong `content/guest-guide.json` hiện vẫn giữ cờ `productionReady = false` / `verified = false` và chưa được wire trực tiếp vào production catalog UI.
   - Việc ánh xạ (mapping) từ các `branchId` tĩnh này sang các `property_id` canonical UUID của catalog (`11111111-...`, `22222222-...`, v.v.) sẽ do TV1 và TV6 thực hiện trong nhiệm vụ tích hợp chính thức.
8. **Chuẩn hóa Trusted RPC cho Finalize Checkout:**
   - Luồng xác thực thanh toán atomic và finalize checkout được xử lý bởi trusted backend RPC `finalize_verified_checkout_atomic(UUID, BIGINT, TEXT)`.
   - Đây là internal backend / payment-verifier execution path (chỉ `service_role` có quyền thực thi), browser / authenticated client tuyệt đối KHÔNG được phép gọi trực tiếp.

---

## 3. Danh Sách Fixtures Chi Tiết (Khớp 100% với `supabase/seed.sql`)

### 3.1. Auth & Profiles (Chiến lược tài khoản thử nghiệm)
Tài khoản kiểm thử được provision riêng biệt qua Supabase Auth CLI / Dashboard và liên kết sang `public.profiles`:

| Vai trò | ID Tham Chiếu (UUID chuẩn Hex) | Email / Display Name | Phương thức khởi tạo | Mục đích sử dụng |
|---|---|---|---|---|
| **Khách lưu trú (Guest)** | `00000000-0000-0000-0000-000000000001` | `testguest@kapistay.local`<br>Khách Lưu Trú Mẫu (QA Test) | Provision qua Auth Dashboard/CLI (không seed vào DB) | Dùng để đăng nhập test luồng đặt phòng (TC-05), trang My Stay (TC-06) và gửi ticket (TC-07). |
| **Vận hành viên (Admin/Operator)** | `00000000-0000-0000-0000-000000000002` | `operator@kapistay.local`<br>Quản Trị Vận Hành (QA Admin) | Provision qua Auth Dashboard/CLI (không seed vào DB) | Dùng để đăng nhập test màn hình Operations Dashboard tại `/operations` (TC-08) và tiếp nhận ticket. |

---

### 3.2. Properties & Rooms (Đồng bộ trực tiếp từ `supabase/seed.sql`)
Toàn bộ danh mục 4 cơ sở và các phòng mẫu trọng tâm được lấy trực tiếp từ `supabase/seed.sql` trên `main`:

#### Danh mục 4 Cơ sở (`public.properties`):
1. **Cơ sở Hà Nội (`kapi-stay-ha-noi`):** `id = '11111111-1111-1111-1111-111111111111'` — *Kapi Stay Hà Nội - Phố Cổ Hoàn Kiếm*
2. **Cơ sở Đà Nẵng (`kapi-stay-da-nang`):** `id = '22222222-2222-2222-2222-222222222222'` — *Kapi Stay Đà Nẵng - Biển Mỹ Khê*
3. **Cơ sở Đà Lạt (`kapi-stay-da-lat`):** `id = '33333333-3333-3333-3333-333333333333'` — *Kapi Stay Đà Lạt - Thung Lũng Mây*
4. **Cơ sở TP.HCM (`kapi-stay-tp-hcm`):** `id = '44444444-4444-4444-4444-444444444444'` — *Kapi Stay TP.HCM - Sài Gòn Riverside*

#### Danh mục 4 Phòng mẫu trọng tâm phục vụ kiểm thử:

| Thuộc tính | Phòng 1 (Hà Nội - 2K) | Phòng 2 (Hà Nội - Gác Mái) | Phòng 3 (Đà Nẵng - 2K) | Phòng 4 (Đà Nẵng - 4K) *(Positive TC-01)* |
|---|---|---|---|---|
| **Room ID** | `a1111111-1111-1111-1111-111111111111` | `a2222222-2222-2222-2222-222222222222` | `b1111111-1111-1111-1111-111111111111` | `b2222222-2222-2222-2222-222222222222` |
| **Property ID** | `11111111-1111-1111-1111-111111111111` | `11111111-1111-1111-1111-111111111111` | `22222222-2222-2222-2222-222222222222` | `22222222-2222-2222-2222-222222222222` |
| **Tên phòng** | Kapi Deluxe Studio - Ban Công Phố Cổ | Kapi Cozy Attic - Gác Mái Hoàn Kiếm | Kapi Ocean Breeze Studio - View Biển Mỹ Khê | Kapi Coastal Family Suite - Sơn Trà |
| **Giá niêm yết** | 750.000 VND / đêm | 550.000 VND / đêm | 950.000 VND / đêm | 1.450.000 VND / đêm |
| **Sức chứa** | **2 khách** | **2 khách** | **2 khách** | **4 khách** *(Khớp Positive Case TC-01)* |
| **Trạng thái catalog** | `is_listed = true` | `is_listed = true` | `is_listed = true` | `is_listed = true` |
| **Vận hành (`room_operations`)** | `operational_status = 'ready'` | `operational_status = 'ready'` | `operational_status = 'ready'` | `operational_status = 'ready'` |
| **Bảo mật Wi-Fi (`room_private_details`)** | SSID: `KapiStay_HaNoi_5G`<br>Pass: `kapistay2026`<br>*(Không chứa door PIN)* | SSID: `KapiStay_HaNoi_5G`<br>Pass: `kapistay2026`<br>*(Không chứa door PIN)* | SSID: `KapiStay_DaNang_5G`<br>Pass: `kapistay2026`<br>*(Không chứa door PIN)* | SSID: `KapiStay_DaNang_5G`<br>Pass: `kapistay2026`<br>*(Không chứa door PIN)* |

*(Lưu ý: 4 phòng còn lại tại Đà Lạt `c1111111-...`, `c2222222-...` và TP.HCM `d1111111-...`, `d2222222-...` đều đã sẵn sàng trong `supabase/seed.sql`).*

---

### 3.3. Loyalty Vouchers (Đồng bộ voucher `supabase/seed.sql`)
1. **Voucher hợp lệ (`seed.sql`):**
   - `id`: `99999999-9999-9999-9999-999999999999` (UUID chuẩn hex trong `seed.sql`)
   - `name`: `Voucher Giảm 40% (Tối đa 400.000đ)`
   - `voucher_type`: `'percentage_discount'`
   - `points_cost`: `500.0000`
   - `discount_percentage`: `40.00`
   - `max_eligible_base_vnd`: `1000000` (giảm tối đa 400.000đ)
   - `is_active`: `true`
   - Bản ghi redemption thuộc user test `00000000-0000-0000-0000-000000000001` với `status = 'AVAILABLE'`, `expires_at = current_timestamp + interval '24 hours'`.
2. **Voucher không hợp lệ / Hết hạn (`HETTIEN`):**
   - `id`: `f2222222-2222-2222-2222-222222222222` (UUID chuẩn hex)
   - `name`: `HETTIEN`
   - `voucher_type`: `'percentage_discount'`
   - `is_active`: `false`
   - Bản ghi redemption tương ứng có `status = 'EXPIRED'`, `expires_at = current_timestamp - interval '1 day'` để phục vụ ca kiểm thử bắt lỗi checkout.

---

### 3.4. Checkout Session Mẫu (Phục vụ TC-04A & Luồng Thanh toán VietQR)
Yêu cầu 01 bản ghi phiên checkout trong bảng `public.checkout_sessions` có số tiền được derive chuẩn xác từ công thức giảm giá voucher và đơn giá phòng trong `seed.sql`:

- **Bản ghi Checkout Session (`checkout_sessions`):**
  - `id`: `00000000-0000-0000-0000-000000000051` (UUID chuẩn hex, không dùng mã string `CK-...`)
  - `user_id`: `00000000-0000-0000-0000-000000000001` (Guest test)
  - `room_id`: `a1111111-1111-1111-1111-111111111111` (Kapi Deluxe Studio - Ban Công Phố Cổ - đơn giá 750.000đ/đêm)
  - `check_in`: `current_date + interval '2 days'`
  - `check_out`: `current_date + interval '4 days'` (2 đêm lưu trú)
  - `guest_count`: `2`
  - `gross_amount_vnd`: `1500000` (750.000đ $\times$ 2 đêm)
  - `discount_amount_vnd`: `400000` (áp voucher `99999999-9999-9999-9999-999999999999` giảm 40% trên base cap 1.000.000đ = tối đa 400.000đ)
  - `final_payable_amount_vnd`: `1100000` ($1.500.000đ - 400.000đ = 1.100.000đ$, đúng check constraint tính toán)
  - `status`: `'ACTIVE'` (tuân thủ canonical `checkout_sessions.status` CHECK constraint trên main)
  - `expires_at`: `current_timestamp + interval '30 minutes'`
  - `payment_reference`: `KAPI51PAY` (nội dung chuyển khoản đồng bộ cho VietQR)

---

### 3.5. Confirmed Booking & Dynamic Digital Key (Đơn phòng mẫu thời gian thực)
Yêu cầu 01 đơn đặt phòng trong `public.bookings` kèm Digital Key tương ứng trong `public.booking_access_credentials`:

- **Đơn đặt phòng (`bookings`):**
  - `id`: `00000000-0000-0000-0000-000000000021` (UUID chuẩn hex)
  - `user_id`: `00000000-0000-0000-0000-000000000001`
  - `room_id`: `a1111111-1111-1111-1111-111111111111` (Kapi Deluxe Studio - Ban Công Phố Cổ)
  - `check_in`: `current_date` (ngày hôm nay)
  - `check_out`: `current_date + 1` (ngày mai - 1 đêm)
  - `guest_count`: `2`
  - `gross_amount_vnd`: `750000`
  - `discount_amount_vnd`: `300000` (giảm 40% của 750.000đ)
  - `final_paid_amount_vnd`: `450000` ($750.000đ - 300.000đ = 450.000đ$)
  - `payment_status`: `'paid'`
  - `booking_status`: `'confirmed'`
- **Mã số mở cửa Digital Key (`booking_access_credentials`):**
  - `id`: `ba111111-1111-1111-1111-111111111111` (UUID chuẩn hex)
  - `booking_id`: `00000000-0000-0000-0000-000000000021`
  - `room_id`: `a1111111-1111-1111-1111-111111111111`
  - `credential_type`: `'pin'`
  - `credential_value`: `'123456#'`
  - `instructions`: `'Chạm mu bàn tay cho sáng màn hình cảm ứng, nhập 123456 kèm phím #.'`
  - `valid_from`: `(current_date + time '14:00:00') at time zone 'Asia/Ho_Chi_Minh'` *(Bắt đầu đúng 14:00 ngày nhận phòng)*
  - `valid_until`: `((current_date + 1) + time '12:00:00') at time zone 'Asia/Ho_Chi_Minh'` *(Kết thúc đúng 12:00 ngày trả phòng)*
  - `status`: `'active'`

---

### 3.6. Support Tickets (Đồng bộ Whitelist Category TV6)
Yêu cầu 02 tickets trong `public.tickets` có UUID hex chuẩn để kiểm thử màn hình khách và Dashboard vận hành. Toàn bộ category bắt buộc thuộc whitelist đã thống nhất của TV6 (`"Khóa kẹt"`, `"Thiết bị hỏng"`, `"Vệ sinh chưa sạch"`, `"Tiếng ồn"`, `"Yêu cầu khác"`):

1. **Ticket 1 (Chờ xử lý):**
   - `id`: `00000000-0000-0000-0000-000000000031` (UUID chuẩn hex)
   - `user_id`: `00000000-0000-0000-0000-000000000001`
   - `booking_id`: `00000000-0000-0000-0000-000000000021`
   - `room_id`: `a1111111-1111-1111-1111-111111111111`
   - `category`: `'Thiết bị hỏng'` *(Khớp TV6 Whitelist)*
   - `description`: `'Điều hòa chảy nước xuống góc sàn gỗ gần giường, cần thợ kiểm tra kỹ thuật.'`
   - `media_paths`: `array[]::text[]` *(Acceptance path dùng mảng rỗng; media upload đánh dấu PENDING/TBD)*
   - `status`: `'pending'`
2. **Ticket 2 (Đang xử lý):**
   - `id`: `00000000-0000-0000-0000-000000000032` (UUID chuẩn hex)
   - `user_id`: `00000000-0000-0000-0000-000000000001`
   - `booking_id`: `00000000-0000-0000-0000-000000000021`
   - `room_id`: `a1111111-1111-1111-1111-111111111111`
   - `category`: `'Yêu cầu khác'` *(Khớp TV6 Whitelist)*
   - `description`: `'Xin thêm gối ngủ êm và 01 chăn mỏng phục vụ thêm người lớn.'`
   - `media_paths`: `array[]::text[]`
   - `status`: `'in_progress'`

---

## 4. Ma Trận Ánh Xạ Test Cases & Dữ Liệu Yêu Cầu

| Mã Test | Hạng mục kiểm thử | Fixtures cần thiết tương ứng |
|:---:|---|---|
| **TC-01** | Lọc phòng theo cơ sở và số khách | Sử dụng **Cơ sở Đà Nẵng (`22222222-2222-2222-2222-222222222222`)** và số khách = 4; Positive Case trả về đúng **Phòng 4 (Kapi Coastal Family Suite - Sơn Trà, `b2222222-2222-2222-2222-222222222222`, capacity = 4)** có sẵn trong `supabase/seed.sql` trên `main` (Mục 3.2). |
| **TC-02** | Validation chọn ngày Check-out trước Check-in | Không phụ thuộc dữ liệu database, kiểm tra logic form frontend. |
| **TC-03** | Khóa nút đặt khi phòng đã kín ngày | Đơn booking mẫu `...00000021` (`booking_status = 'confirmed'`) chiếm khoảng ngày `current_date` đến `current_date + 1` của phòng `Kapi Deluxe Studio - Ban Công Phố Cổ` (`a1111111-1111-1111-1111-111111111111`) (Mục 3.5). |
| **TC-04A** | Render mã VietQR thanh toán | Sử dụng Checkout Session `00000000-0000-0000-0000-000000000051` (trạng thái `status = 'ACTIVE'`) với số tiền 1.100.000đ và `payment_reference = 'KAPI51PAY'` gắn với phòng `a1111111-1111-1111-1111-111111111111` (Mục 3.4). |
| **TC-04B** | Xác thực thanh toán & Chốt đơn atomic | [PENDING / BLOCKED] Yêu cầu webhook/verifier ngân hàng thật và internal backend trusted RPC `finalize_verified_checkout_atomic(UUID, BIGINT, TEXT)` (chỉ `service_role` thực thi, cấm browser/authenticated client gọi) để chuyển session sang `'COMPLETED'`, tạo đơn booking (`'confirmed'`) và thanh toán (`'paid'`). |
| **TC-05** | Chặn khách vãng lai (Auth Guard) | Cần tài khoản khách mẫu `testguest@kapistay.local` (Mục 3.1) để hoàn tất đăng nhập chuyển hướng về `/login?next=<encoded checkout URL>`. |
| **TC-06** | Hiển thị mã Digital Key & Copy Wi-Fi tại My Stay | Cần đơn booking `...00000021` (`booking_status = 'confirmed'`) tại phòng `a1111111-1111-1111-1111-111111111111` và bản ghi mã PIN hợp lệ trong `booking_access_credentials` (trạng thái `'active'`) (Mục 3.5). Wi-Fi SSID `KapiStay_HaNoi_5G`, Pass `kapistay2026`. *QA đảm bảo thời điểm test nằm trong khung 14:00 - 12:00.* |
| **TC-07** | Gửi ticket báo sự cố hỗ trợ | Cần đơn booking đang diễn ra (`booking_status = 'confirmed'`) để gửi ticket không reload trang với danh mục thuộc whitelist (`'Thiết bị hỏng'`), lưu DB với `status = 'pending'`; [PENDING / TBD — Media upload chưa có trusted upload/persistence flow, hiện dùng `media_paths = []`]. |
| **TC-08** | Operations Dashboard tải dữ liệu tickets | Mở Operations Dashboard tại `/operations`; cần 2 tickets mẫu `...00000031` (`status = 'pending'`) và `...00000032` (`status = 'in_progress'`) (Mục 3.6). |
| **TC-09** | Co giãn giao diện di động (Responsive QA) | Sử dụng toàn bộ giao diện đã có dữ liệu danh mục phòng và chi tiết phòng. |
| **TC-10** | Tốc độ tải ảnh WebP [QA Benchmark] | Sử dụng các ảnh WebP nhẹ (~9.5KB) tại `/images/rooms/room-*.webp`. |

---

## 5. Kế Hoạch Phối Hợp & Tiếp Nhận Bàn Giao

1. **Đồng bộ catalog:** TV9 và toàn bộ thành viên frontend sử dụng trực tiếp các ID và tên phòng trong `supabase/seed.sql` đã được TV8 triển khai trên `main`.
2. **Triển khai Auth kiểm thử:** TV8 hỗ trợ script / hướng dẫn provision tài khoản test cục bộ mà không chạm vào file seed catalog.
3. **Phê duyệt:** TV1 (Tech Lead) kiểm tra tính tương thích giữa tài liệu QA và schema/seed trên `main`.
