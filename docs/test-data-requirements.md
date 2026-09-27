# Đặc Tả Yêu Cầu Dữ Liệu Kiểm Thử (Test Data Requirements)
## Kapi Stay Concierge — Test Fixtures Handover from QA (TV9) to Database Foundation (TV8)

- **Người lập tài liệu:** TV9 (Tuấn Anh — Assets / Content / QA Testing)
- **Người tiếp nhận triển khai:** TV8 (Quỳnh — Database / Backend Data / Supabase Foundation)
- **Người phê duyệt kiến trúc:** TV1 (Hoàng Anh — Main Maintainer / Tech Lead)
- **Tài liệu tham chiếu:** [./TEST_CASES.md](./TEST_CASES.md), [./PROJECT_GUIDE.md](./PROJECT_GUIDE.md), [./TEAM_FILE_OWNERSHIP.md](./TEAM_FILE_OWNERSHIP.md), [./FEATURE_OWNERS.md](./FEATURE_OWNERS.md), `supabase/seed.sql`

---

## 1. Mục Đích & Bối Cảnh Bàn Giao (Purpose & Context)

Tài liệu này đặc tả danh mục dữ liệu mẫu (**Test Fixtures**) phục vụ QA/TV9 và các kỹ sư phát triển giao diện (TV2 đến TV7) thực thi 10 kịch bản kiểm thử trong [./TEST_CASES.md](./TEST_CASES.md).

> **NGUYÊN TẮC SOURCE OF TRUTH VỀ SEED DATA:**
> - **Catalog fixtures are aligned with `supabase/seed.sql`:** Dữ liệu thực sự có sẵn sau khi chạy `npx supabase db reset` chỉ bao gồm danh mục công khai: `properties`, `rooms`, `room_operations`, `room_private_details`, và 01 voucher định nghĩa trong `vouchers`.
> - **Transactional/authenticated QA fixtures are requirements only and are NOT provisioned by stock `seed.sql`:** Toàn bộ các bảng giao dịch, vai trò và bảo mật động (`auth.users`, `profiles`, `staff_roles`, `voucher_redemptions`, `checkout_sessions`, `bookings`, `booking_access_credentials`, `tickets`) **không tồn tại trong stock seed**.
> - Các dữ liệu này được định danh dưới trạng thái rõ ràng: `REQUIRED EXTERNAL FIXTURE`, `REQUIRES AUTH PROVISIONING`, `NOT PRESENT IN STOCK SEED`, hoặc `BLOCKED UNTIL FIXTURE IS PROVISIONED`.

Theo đúng quy định phân quyền tại [./TEAM_FILE_OWNERSHIP.md](./TEAM_FILE_OWNERSHIP.md):
- **TV9 (QA / Content)** chịu trách nhiệm đặc tả yêu cầu nghiệp vụ và cấu trúc dữ liệu kiểm thử dưới dạng văn bản tài liệu; **không lưu trữ hoặc thực thi trực tiếp các file script SQL** trong repository nhằm bảo vệ khu vực Protected Foundation.
- **TV8 (Database Foundation)** quản lý `supabase/seed.sql` trên nhánh `main`.

---

## 2. Nguyên Tắc Bảo Mật & Ràng Buộc Kiến Trúc (Security & Architecture Principles)

Khi sử dụng và chuẩn bị dữ liệu mẫu trong cơ sở dữ liệu Supabase, các bên cần đảm bảo tuân thủ các nguyên tắc cốt lõi sau:

1. **Tuyệt đối không lưu mã cửa (Door PIN / Passcode) trong `room_private_details`:**
   - Cột `private_instructions` trong bảng `room_private_details` chỉ được chứa thông tin Wi-Fi tĩnh và các chỉ dẫn nội bộ phòng (cách dùng rèm, máy giặt, vị trí phích cắm, v.v.).
   - Passcode cửa không phải là thuộc tính tĩnh của phòng.
2. **Authority của Digital Key & Wi-Fi tại My Stay:**
   - **Security authority canonical:** Quyền truy cập Digital Key và Wi-Fi được xác định duy nhất bởi bản ghi trong bảng `booking_access_credentials` thông qua cặp giá trị thời gian `valid_from` và `valid_until` (kèm trạng thái `status = 'active'`).
   - **Backend trusted RPC source of truth:** Hàm RPC bảo mật `public.get_my_stay_credentials(p_booking_id UUID)` là nguồn thẩm quyền duy nhất quyết định credential có đang hoạt động hay không (`is_active: boolean`). Frontend tuyệt đối **không được tự suy luận quyền lộ secret từ giờ check-in/check-out**.
   - Mốc thời gian `14:00` (ngày nhận phòng) và `12:00` (ngày trả phòng) chỉ là **example fixture timing** minh họa cho kịch bản kiểm thử, không phải là security source of truth.
   - Khi chạy test case TC-06, Digital Key và Wi-Fi chỉ được hiển thị khi `get_my_stay_credentials` trả về `is_active = true` kèm thông tin credential hợp lệ.
3. **Tuân thủ nghiêm ngặt công thức Loyalty & Voucher:**
   - Voucher định nghĩa trong `supabase/seed.sql` tuân thủ đúng quy định tại [./PROJECT_GUIDE.md](./PROJECT_GUIDE.md): chi phí đổi 500 điểm, giảm 40% trên giá phòng đủ điều kiện, mức chiết khấu tối đa 400.000 VND (base cap 1.000.000 VND). ID voucher có sẵn: `99999999-9999-9999-9999-999999999999`.
   - **Lưu ý:** Bảng `voucher_redemptions` cho tài khoản test **không có trong stock seed** và thuộc nhóm `REQUIRED EXTERNAL FIXTURE`.
4. **Authority và Luồng Tạo Ticket Sự Cố (Guest Tickets):**
   - Luồng tạo ticket chính thức là: `My Stay → TicketModal → createGuestTicketAction → public.create_guest_ticket RPC → persisted ticket`.
   - Direct `INSERT` của authenticated guest/client vào bảng `tickets` đã bị **REVOKE** (chỉ `service_role` giữ quyền toàn diện phía backend); flow của khách lưu trú bắt buộc phải đi qua trusted RPC:
     ```sql
     public.create_guest_ticket(
       p_booking_id UUID,
       p_category TEXT,
       p_description TEXT,
       p_media_paths TEXT[] DEFAULT '{}'
     )
     ```
   - RPC thực thi kiểm tra bảo mật phía máy chủ: yêu cầu authentication, kiểm tra quyền sở hữu booking, kiểm tra trạng thái booking (`confirmed` hoặc `completed`), tự động derive `room_id` từ booking trên server (không tin cậy input từ client), và bắt buộc phải có active stay credential (`booking_access_credentials`) trong khung giờ lưu trú.
   - Danh mục sự cố phải thuộc whitelist 5 mục đã chuẩn hóa: `"Khóa kẹt"`, `"Thiết bị hỏng"`, `"Vệ sinh chưa sạch"`, `"Tiếng ồn"`, `"Yêu cầu khác"`.
   - Ticket mới được tạo luôn có `status = 'pending'`.
   - **Giao diện khách:** Giao diện My Stay hiện tại **không có danh sách ticket guest tự cập nhật**. Khi gửi thành công, `TicketModal` hiển thị thông báo thành công và mã yêu cầu (Ticket ID) vừa tạo mà không reload trang (No Page Reload). Phiếu sự cố sẽ hiển thị trên `/operations` khi nhân viên reload hoặc refetch dữ liệu.
5. **Định dạng UUID chuẩn Hex:**
   - Toàn bộ ID khóa chính và khóa ngoại mẫu phải là chuỗi UUID hợp lệ tuân thủ bảng chữ số Hex (`[0-9a-fA-F]`). Tuyệt đối không dùng ký tự ngoài quy chuẩn (như ký tự `t` hay tiền tố chuỗi `CK-...`).
6. **Giá Trị Trạng Thái Canonical Được Sử Dụng Cho Fixtures Kiểm Thử (Canonical Status Values Used by These QA Fixtures):**
   - `checkout_sessions.status`: `'ACTIVE'` (hợp lệ theo CHECK constraint: `'ACTIVE'`, `'PAYMENT_PROCESSING'`, `'COMPLETED'`, `'EXPIRED'`, `'FAILED'`)
   - `bookings.booking_status`: `'confirmed'` (các giá trị backend lifecycle: `'confirmed'`, `'completed'`, `'cancelled'`)
   - `bookings.payment_status`: `'paid'` (các giá trị backend: `'paid'`, `'unpaid'`, `'refunded'`)
   - `tickets.status`: `'pending'` (phiếu mới tạo), `'in_progress'` (phiếu đang xử lý), `'resolved'` (phiếu đã hoàn tất) — *Tuyệt đối không có trạng thái `'cancelled'` vì backend schema chỉ cho phép `pending`, `in_progress`, `resolved`*
   - `booking_access_credentials.status`: `'active'` (hợp lệ theo CHECK constraint: `'active'`, `'expired'`, `'revoked'`)
   - `voucher_redemptions.status`: `'AVAILABLE'` (chưa dùng), `'EXPIRED'` (hết hạn), `'USED'` (đã dùng) (hợp lệ theo CHECK constraint: `'AVAILABLE'`, `'RESERVED'`, `'USED'`, `'EXPIRED'`, `'REVOKED'`)
   - `room_operations.operational_status`: `'ready'` (danh mục trạng thái vận hành: `'ready'`, `'occupied'`, `'cleaning'`, `'maintenance'`)
   - `staff_roles.role`: `'staff'`, `'admin'` (hợp lệ theo CHECK constraint: `'staff'`, `'admin'`)
7. **Tách bạch Auth Fixture Strategy khỏi Database Seed:**
   - Stock `seed.sql` tuyệt đối **không seed vào `auth.users`**.
   - Tài khoản kiểm thử QA (Khách lưu trú & Vận hành viên) là **externally provisioned test accounts**, được khởi tạo độc lập qua Supabase Auth CLI / Dashboard.
   - Tuyệt đối **không đưa mật khẩu hoặc credentials bí mật** vào tài liệu tài nguyên chung.
8. **Trạng thái Dữ liệu Cẩm Nang Khách Lưu Trú (`content/guest-guide.json`):**
   - File `content/guest-guide.json` giữ nguyên các cờ demo: `"isDemoData": true`, `"productionReady": false`, `"verified": false`.
   - File này hiện **chưa được wire vào giao diện production My Stay** (My Stay hiện dùng `DEFAULT_DEVICE_INSTRUCTIONS` và `localSpots=[]`).
   - Mọi thông tin địa chỉ, hotline, quán ăn, y tế, nội quy là fixture/content draft only, tuyệt đối không được mô tả hay hiển thị như dữ liệu vận hành đã xác minh.
   - Đối với `deviceGuides`, cờ `modelVerified === false` được bảo toàn; các chỉ dẫn không được mô tả là hướng dẫn model-specific chính thức.
9. **Trạng thái Tài nguyên Hình ảnh WebP & Room Gallery:**
   - Bảng `public.rooms` trong `supabase/seed.sql` hiện đang lưu trữ `image_paths` dưới dạng URL Unsplash minh họa; **chưa consume** các file ảnh local tại `/images/rooms/room-1.webp`, `room-2.webp`, `room-3.webp`.
   - Do đó, các file ảnh WebP local chỉ phục vụ mục đích **Local asset QA benchmark** (kiểm tra dung lượng, khả năng decode, tính nguyên vẹn), không dùng để đánh giá performance thực tế của gallery phòng đang chạy URL Unsplash (`PENDING production integration`).
10. **Trạng thái PWA Manifest & Icons:**
    - File `public/manifest.json` và các icon `public/images/icon-192.png`, `public/images/icon-512.png` đã tồn tại đầy đủ, đúng định dạng và kích thước.
    - *Ghi chú tích hợp:* Manifest assets đã sẵn sàng nhưng việc liên kết manifest ở cấp ứng dụng (`app/layout.tsx`) nằm ngoài phạm vi nhiệm vụ của TV9.
11. **Trusted RPC cho Finalize Checkout:**
    - Luồng xác thực thanh toán atomic và finalize checkout được xử lý bởi trusted backend RPC `finalize_verified_checkout_atomic(UUID, BIGINT, TEXT)`.
    - Đây là internal backend / payment-verifier execution path (chỉ `service_role` có quyền thực thi), browser / authenticated client tuyệt đối KHÔNG được phép gọi trực tiếp. TC-04B ở trạng thái `PENDING / BLOCKED`.

---

## 3. Danh Sách Fixtures Chi Tiết

### Nhóm 1 — Available after stock db reset
*(Dữ liệu thực tế được nạp tự động vào database khi chạy `npx supabase db reset` từ `supabase/seed.sql`)*

#### 3.1. Danh mục 4 Cơ sở (`public.properties`):
1. **Cơ sở Hà Nội (`kapi-stay-ha-noi`):** `id = '11111111-1111-1111-1111-111111111111'` — *Kapi Stay Hà Nội - Phố Cổ Hoàn Kiếm*
2. **Cơ sở Đà Nẵng (`kapi-stay-da-nang`):** `id = '22222222-2222-2222-2222-222222222222'` — *Kapi Stay Đà Nẵng - Biển Mỹ Khê*
3. **Cơ sở Đà Lạt (`kapi-stay-da-lat`):** `id = '33333333-3333-3333-3333-333333333333'` — *Kapi Stay Đà Lạt - Thung Lũng Mây*
4. **Cơ sở TP.HCM (`kapi-stay-tp-hcm`):** `id = '44444444-4444-4444-4444-444444444444'` — *Kapi Stay TP.HCM - Sài Gòn Riverside*

#### 3.2. Danh mục 8 Phòng nghỉ (`public.rooms`) và 4 Phòng mẫu trọng tâm:
Toàn bộ 8 phòng nghỉ trong `supabase/seed.sql` đều ở trạng thái `is_listed = true`. Dưới đây là 4 phòng tiêu biểu phục vụ kịch bản kiểm thử:

| Thuộc tính | Phòng 1 (Hà Nội - 2K) | Phòng 2 (Hà Nội - Gác Mái) | Phòng 3 (Đà Nẵng - 2K) | Phòng 4 (Đà Nẵng - 4K) *(Positive TC-01)* |
|---|---|---|---|---|
| **Room ID** | `a1111111-1111-1111-1111-111111111111` | `a2222222-2222-2222-2222-222222222222` | `b1111111-1111-1111-1111-111111111111` | `b2222222-2222-2222-2222-222222222222` |
| **Property ID** | `11111111-1111-1111-1111-111111111111` | `11111111-1111-1111-1111-111111111111` | `22222222-2222-2222-2222-222222222222` | `22222222-2222-2222-2222-222222222222` |
| **Tên phòng** | Kapi Deluxe Studio - Ban Công Phố Cổ | Kapi Cozy Attic - Gác Mái Hoàn Kiếm | Kapi Ocean Breeze Studio - View Biển Mỹ Khê | Kapi Coastal Family Suite - Sơn Trà |
| **Giá niêm yết** | 750.000 VND / đêm | 550.000 VND / đêm | 950.000 VND / đêm | 1.450.000 VND / đêm |
| **Sức chứa** | **2 khách** | **2 khách** | **2 khách** | **4 khách** *(Khớp Positive Case TC-01)* |
| **Trạng thái catalog** | `is_listed = true` | `is_listed = true` | `is_listed = true` | `is_listed = true` |
| **Hình ảnh catalog** | 2 URL Unsplash | 2 URL Unsplash | 2 URL Unsplash | 2 URL Unsplash |

*(4 phòng còn lại trong seed: Đà Lạt `c1111111-...`, `c2222222-...` và TP.HCM `d1111111-...`, `d2222222-...`).*

#### 3.3. Trạng thái vận hành buồng phòng (`public.room_operations`):
Cả 8 phòng trong `supabase/seed.sql` đều có bản ghi với `operational_status = 'ready'`.

#### 3.4. Thông tin bảo mật phòng & Wi-Fi tĩnh (`public.room_private_details`):
Cả 8 phòng đều có bản ghi thông tin Wi-Fi tĩnh (SSID, mật khẩu demo `kapistay2026`) và chỉ dẫn cơ bản, **tuyệt đối không chứa mã PIN cửa**.

#### 3.5. Voucher định nghĩa mẫu (`public.vouchers`):
- `id`: `99999999-9999-9999-9999-999999999999`
- `name`: `Voucher Giảm 40% (Tối đa 400.000đ)`
- `voucher_type`: `'percentage_discount'`
- `points_cost`: `500.0000`
- `discount_percentage`: `40.00`
- `max_eligible_base_vnd`: `1000000`
- `is_active`: `true`

---

### Nhóm 2 — Required QA fixtures but NOT present in stock seed
*(Các fixture bắt buộc để chạy test cases nhưng **KHÔNG có sẵn** sau db reset; phải được provision độc lập hoặc tạo qua kịch bản tương ứng)*

#### 3.6. Tài khoản Auth, Profiles & Vai Trò Quản Trị (`public.staff_roles`) [REQUIRES AUTH & ROLE PROVISIONING / NOT PRESENT IN STOCK SEED]:
Tài khoản kiểm thử bắt buộc phải được tạo trước trong Supabase Auth (Auth Dashboard hoặc CLI) trước khi thực hiện các bài test có yêu cầu đăng nhập.

| Vai trò | Proposed UUID (Hex) | Proposed Email / Display Name | Trạng thái stock seed | Mục đích sử dụng |
|---|---|---|:---:|---|
| **Khách lưu trú (Guest)** | `00000000-0000-0000-0000-000000000001` | `testguest@kapistay.local`<br>Khách Lưu Trú Mẫu (QA Test) | **NOT PRESENT** (Cần provision qua Auth) | Đăng nhập test luồng đặt phòng (TC-05), My Stay (TC-06) và gửi ticket (TC-07). |
| **Vận hành viên (Operator)** | `00000000-0000-0000-0000-000000000002` | `operator@kapistay.local`<br>Quản Trị Vận Hành (QA Admin) | **NOT PRESENT** (Cần provision qua Auth & gán vai trò `staff_roles`) | Đăng nhập test Operations Dashboard tại `/operations` (TC-08) và tiếp nhận/xử lý ticket. |

- **Yêu cầu bảng `public.staff_roles` cho Operator (TC-08):**
  - Bảng `public.staff_roles` được khởi tạo bởi migration `20260920110000_staff_operations_trusted_rpc.sql` (bật RLS, chỉ cho phép authenticated đọc role của chính mình, `service_role` có toàn quyền), nhưng file `supabase/seed.sql` **tuyệt đối không seed bất kỳ bản ghi staff role nào**.
  - Để tài khoản Operator (`operator@kapistay.local`) có thể truy cập hợp lệ vào `/operations` trong TC-08, cần:
    1. Tạo tài khoản trong `auth.users` với `id = '00000000-0000-0000-0000-000000000002'`.
    2. Tạo bản ghi `public.profiles` tương ứng nếu cần.
    3. Tạo bản ghi vai trò trong bảng `public.staff_roles` (`user_id = '00000000-0000-0000-0000-000000000002'`, `role = 'staff'` hoặc `'admin'`).
  - Nếu thiếu bản ghi `staff_roles`, hàm server-side `verifyStaffRole()` sẽ chặn truy cập với lỗi `StaffAuthError("FORBIDDEN")` và giao diện `/operations` sẽ hiển thị màn hình `403 - Cấm truy cập`.
*(Lưu ý: Không lưu mật khẩu hoặc token bí mật trong tài liệu).*

#### 3.7. Bản ghi Đổi Voucher (`public.voucher_redemptions`) [REQUIRED EXTERNAL FIXTURE / NOT PRESENT IN STOCK SEED]:
1. **Redemption voucher hợp lệ (Proposed QA Fixture):**
   - `id`: `00000000-0000-0000-0000-000000000041` (Proposed UUID)
   - `voucher_id`: `99999999-9999-9999-9999-999999999999` (đã có trong `public.vouchers`)
   - `user_id`: `00000000-0000-0000-0000-000000000001`
   - `status`: `'AVAILABLE'`
   - `expires_at`: `current_timestamp + interval '24 hours'`
2. **Voucher & Redemption không hợp lệ / Hết hạn (`HETTIEN`):**
   - Voucher `f2222222-2222-2222-2222-222222222222` và redemption tương ứng (`status = 'EXPIRED'`, `expires_at = current_timestamp - interval '1 day'`) **không có trong seed**, chỉ dùng khi cần test bắt lỗi voucher hết hạn.

#### 3.8. Phiên Checkout Session Mẫu (`public.checkout_sessions`) [REQUIRED EXTERNAL FIXTURE / NOT PRESENT IN STOCK SEED]:
Phục vụ ca kiểm thử TC-04A (Render mã VietQR thanh toán):
- `id`: `00000000-0000-0000-0000-000000000051` (Proposed QA UUID)
- `user_id`: `00000000-0000-0000-0000-000000000001` (Guest test)
- `room_id`: `a1111111-1111-1111-1111-111111111111` (Kapi Deluxe Studio - 750.000đ/đêm)
- `check_in`: `current_date + interval '2 days'`
- `check_out`: `current_date + interval '4 days'` (2 đêm)
- `guest_count`: `2`
- `gross_amount_vnd`: `1500000` (750.000đ $\times$ 2)
- `discount_amount_vnd`: `400000` (voucher `99999999-...` giảm tối đa 400.000đ)
- `final_payable_amount_vnd`: `1100000` (1.500.000đ - 400.000đ = 1.100.000đ)
- `status`: `'ACTIVE'`
- `expires_at`: `current_timestamp + interval '30 minutes'`
- `payment_reference`: `KAPI51PAY`

#### 3.9. Confirmed Booking & Dynamic Digital Key [REQUIRED EXTERNAL FIXTURE / NOT PRESENT IN STOCK SEED]:
Phục vụ TC-03, TC-06 và TC-07. Yêu cầu 01 đơn đặt phòng đã thanh toán và mã khóa động còn hạn:
- **Đơn đặt phòng (`public.bookings`):**
  - `id`: `00000000-0000-0000-0000-000000000021` (Proposed QA UUID)
  - `user_id`: `00000000-0000-0000-0000-000000000001`
  - `room_id`: `a1111111-1111-1111-1111-111111111111`
  - `check_in`: `current_date` (ngày test)
  - `check_out`: `current_date + 1` (ngày tiếp theo)
  - `guest_count`: `2`
  - `gross_amount_vnd`: `750000`
  - `discount_amount_vnd`: `300000`
  - `final_paid_amount_vnd`: `450000`
  - `payment_status`: `'paid'`
  - `booking_status`: `'confirmed'`
- **Mã số mở cửa Digital Key (`public.booking_access_credentials`):**
  - `id`: `ba111111-1111-1111-1111-111111111111` (Proposed QA UUID)
  - `booking_id`: `00000000-0000-0000-0000-000000000021`
  - `room_id`: `a1111111-1111-1111-1111-111111111111`
  - `credential_type`: `'pin'`
  - `credential_value`: `'123456#'`
  - `instructions`: `'Chạm mu bàn tay cho sáng màn hình cảm ứng, nhập 123456 kèm phím #.'`
  - `valid_from`: `(current_date + time '14:00:00') at time zone 'Asia/Ho_Chi_Minh'` *(Example fixture timing)*
  - `valid_until`: `((current_date + 1) + time '12:00:00') at time zone 'Asia/Ho_Chi_Minh'` *(Example fixture timing)*
  - `status`: `'active'`
  - *Ràng buộc kiểm thử:* Thời điểm chạy TC-06 phải nằm trong khoảng `valid_from` đến `valid_until` để hàm RPC `get_my_stay_credentials` trả về `is_active = true`.

#### 3.10. Phiếu Hỗ Trợ Kỹ Thuật (`public.tickets`) [REQUIRED EXTERNAL FIXTURE / NOT PRESENT IN STOCK SEED]:
Phục vụ TC-08 (Operations Dashboard tải danh sách tickets). Có 2 phương án kiểm thử hợp lệ:
1. **Khởi tạo thông qua TC-07:** Khách lưu trú gửi ticket thật từ `/my-stay` thông qua RPC `create_guest_ticket`, sau đó nhân viên reload/refetch `/operations` để kiểm tra.
2. **Provision explicit QA fixtures ngoài stock seed:**
   - **Ticket 1 (Chờ xử lý):** `id = '00000000-0000-0000-0000-000000000031'`, `category = 'Thiết bị hỏng'`, `status = 'pending'`, `description = 'Điều hòa chảy nước xuống góc sàn gỗ gần giường, cần thợ kiểm tra kỹ thuật.'`, `media_paths = array[]::text[]`.
   - **Ticket 2 (Đang xử lý):** `id = '00000000-0000-0000-0000-000000000032'`, `category = 'Yêu cầu khác'`, `status = 'in_progress'`, `description = 'Xin thêm gối ngủ êm và 01 chăn mỏng phục vụ thêm người lớn.'`, `media_paths = array[]::text[]`.

---

## 4. Ma Trận Ánh Xạ Test Cases & Dữ Liệu Yêu Cầu

| Mã Test | Hạng mục kiểm thử | Fixtures tương ứng | Trạng thái thực thi |
|:---:|---|---|:---:|
| **TC-01** | Lọc phòng theo cơ sở và số khách | Cơ sở Đà Nẵng (`22222222-...`) và Phòng 4 (`b2222222-...`, capacity = 4) **có sẵn trong stock seed** (Mục 3.1, 3.2). | **READY** |
| **TC-02** | Validation chọn ngày Check-out trước Check-in | Không phụ thuộc dữ liệu database, kiểm tra logic form frontend. | **READY** |
| **TC-03** | Khóa nút đặt khi phòng đã kín ngày | Cần đơn booking overlap fixture ngoài stock seed (`a1111111-...` trạng thái `confirmed` hoặc `completed`) (Mục 3.9). | **REQUIRES BOOKING FIXTURE** |
| **TC-04A** | Render mã VietQR thanh toán | Cần Checkout Session `00000000-...0051` (trạng thái `ACTIVE`) (Mục 3.8). | **REQUIRES CHECKOUT SESSION FIXTURE** |
| **TC-04B** | Xác thực thanh toán & Chốt đơn atomic | Internal backend trusted RPC `finalize_verified_checkout_atomic` (chỉ `service_role` thực thi; cấm browser client gọi trực tiếp). | **PENDING / BLOCKED** |
| **TC-05** | Chặn khách vãng lai (Auth Guard) | Cần tài khoản khách mẫu `testguest@kapistay.local` được provision độc lập qua Supabase Auth (Mục 3.6). | **REQUIRES AUTH ACCOUNT** |
| **TC-06** | Hiển thị mã Digital Key & Copy Wi-Fi tại My Stay | Cần tài khoản đăng nhập, đơn booking mẫu `...0021` và credential còn hạn trong `booking_access_credentials` (Mục 3.9). RPC `get_my_stay_credentials` trả `is_active = true`. | **REQUIRES AUTH + BOOKING + ACTIVE CREDENTIAL FIXTURE** |
| **TC-07** | Gửi ticket báo sự cố hỗ trợ | Cần active stay fixture hợp lệ để gọi RPC `create_guest_ticket` với category thuộc whitelist; modal hiển thị thành công và mã yêu cầu (Mục 2.4, 3.9). | **REQUIRES ACTIVE STAY FIXTURE** |
| **TC-08** | Operations Dashboard tải dữ liệu tickets | Mở `/operations`; yêu cầu tài khoản Operator có vai trò `staff` hoặc `admin` trong `public.staff_roles` (Mục 3.6); phụ thuộc vào việc tạo ticket từ TC-07 hoặc provision 2 tickets mẫu `...0031`, `...0032` (Mục 3.10). | **REQUIRES STAFF ROLE & TICKET FIXTURE** |
| **TC-09** | Co giãn giao diện di động (Responsive QA) | Các route công khai (`/`, `/rooms`, `/rooms/[id]`) dùng catalog có sẵn từ stock seed (READY). Các route bảo vệ (`/checkout`, `/my-stay`, `/operations`) yêu cầu người dùng xác thực và cần fixture/role tương ứng để render full state UI. | **PARTIAL READY / REQUIRES AUTH FOR PROTECTED ROUTES** |
| **TC-10** | Tốc độ tải ảnh WebP [QA Benchmark] | Kiểm tra chất lượng và dung lượng các file ảnh local tại `/images/rooms/room-*.webp`. Lưu ý: Room catalog hiện dùng URL Unsplash, chưa wire các WebP local vào production gallery. | **READY (Local Asset Benchmark Only) / PENDING (Production Gallery Integration)** |

---

## 5. Kế Hoạch Phối Hợp & Tiếp Nhận Bàn Giao

1. **Đồng bộ catalog:** TV9 và toàn bộ thành viên frontend sử dụng trực tiếp các ID, cơ sở và phòng trong `supabase/seed.sql` đã được TV8 triển khai trên `main`.
2. **Triển khai Auth & Transactional Fixtures:** TV8 hỗ trợ script / hướng dẫn provision tài khoản test, vai trò vận hành (`public.staff_roles`) và transaction fixtures cục bộ khi cần kiểm thử tích hợp sâu mà không can thiệp trực tiếp vào file seed catalog.
3. **Phê duyệt:** TV1 (Tech Lead) kiểm tra tính tương thích giữa tài liệu QA và schema/seed trên `main`.
