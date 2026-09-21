# Đặc Tả Yêu Cầu Dữ Liệu Kiểm Thử (Test Data Requirements)
## Kapi Stay Concierge — Test Fixtures Handover from QA (TV9) to Database Foundation (TV8)

- **Người lập tài liệu:** TV9 (Tuấn Anh — Assets / Content / QA Testing)
- **Người tiếp nhận triển khai:** TV8 (Quỳnh — Database / Backend Data / Supabase Foundation)
- **Người phê duyệt kiến trúc:** TV1 (Hoàng Anh — Main Maintainer / Tech Lead)
- **Tài liệu tham chiếu:** [./TEST_CASES.md](./TEST_CASES.md), [./PROJECT_GUIDE.md](./PROJECT_GUIDE.md), [./TEAM_FILE_OWNERSHIP.md](./TEAM_FILE_OWNERSHIP.md), [./FEATURE_OWNERS.md](./FEATURE_OWNERS.md)

---

## 1. Mục Đích & Bối Cảnh Bàn Giao (Purpose & Context)

Tài liệu này đặc tả danh mục dữ liệu mẫu (**Test Fixtures**) chuẩn xác cần thiết để QA/TV9 và các kỹ sư phát triển giao diện (TV2 đến TV7) thực thi độc lập 10 kịch bản kiểm thử trong [./TEST_CASES.md](./TEST_CASES.md) mà không bị phụ thuộc vào luồng thanh toán thật hay dữ liệu khách hàng thực tế.

Theo đúng quy định phân quyền tại [./TEAM_FILE_OWNERSHIP.md](./TEAM_FILE_OWNERSHIP.md):
- **TV9 (QA / Content)** chịu trách nhiệm đặc tả yêu cầu nghiệp vụ và cấu trúc dữ liệu kiểm thử dưới dạng văn bản tài liệu; **không lưu trữ hoặc thực thi trực tiếp các file script SQL** trong repository nhằm bảo vệ khu vực Protected Foundation.
- **TV8 (Database Foundation)** là đầu mối duy nhất tiếp nhận tài liệu này để hiện thực hóa vào kịch bản seed phát triển chính thức (`supabase/seed.sql` hoặc test migration local) sau khi được **TV1 (Tech Lead)** phê duyệt.

---

## 2. Nguyên Tắc Bảo Mật & Ràng Buộc Kiến Trúc (Security & Architecture Principles)

Khi chuẩn bị dữ liệu mẫu trong cơ sở dữ liệu Supabase, TV8 cần đảm bảo tuân thủ 5 nguyên tắc cốt lõi:

1. **Tuyệt đối không lưu mã cửa (Door PIN / Passcode) trong `room_private_details`:**
   - Cột `private_instructions` trong bảng `room_private_details` chỉ được chứa thông tin Wi-Fi tĩnh và các chỉ dẫn nội bộ phòng (cách dùng rèm, máy giặt, vị trí phích cắm, v.v.).
   - Passcode cửa không phải là thuộc tính tĩnh của phòng.
2. **Mã số mở cửa (Digital Key) bắt buộc sinh động, có thời hạn và gắn theo đơn phòng:**
   - Toàn bộ thông tin mở cửa thực tế phải được lưu trong bảng `booking_access_credentials`.
   - Mỗi bản ghi Digital Key bắt buộc phải gắn chặt với một `booking_id` cụ thể, có phạm vi hiệu lực chuẩn xác theo khung giờ lưu trú (bắt đầu đúng 14:00 ngày nhận phòng và kết thúc đúng 12:00 ngày trả phòng) và trạng thái `active`.
   - **Precondition cho QA (Deterministic Testing):** Khi chạy test case kiểm tra mã mở cửa (TC-06), thời điểm kiểm thử (`now()`) phải nằm trong khung giờ lưu trú (14:00 - 12:00) hoặc QA thiết lập fixture môi trường có khung giờ bao hàm thời điểm thực thi để đảm bảo test reproducible mà không phá vỡ rule time-bounded (không trừ lùi 2 giờ tùy tiện).
3. **Tuân thủ nghiêm ngặt công thức Loyalty & Voucher:**
   - Voucher đổi điểm phải tuân thủ đúng quy định trong [./PROJECT_GUIDE.md](./PROJECT_GUIDE.md): chi phí đổi 500 điểm, giảm 40% trên giá phòng đủ điều kiện, mức chiết khấu tối đa 400.000 VND (base cap 1.000.000 VND).
   - Thời hạn hiệu lực của voucher là đúng 24 giờ kể từ thời điểm phát hành (`expires_at = current_timestamp + interval '24 hours'`).
4. **Định dạng UUID chuẩn Hex:**
   - Toàn bộ ID khóa chính và khóa ngoại mẫu phải là chuỗi UUID hợp lệ tuân thủ bảng chữ số Hex (`[0-9a-fA-F]`). Tuyệt đối không dùng ký tự ngoài quy chuẩn (như ký tự `t` hay tiền tố chuỗi `CK-...`).
5. **Không tự chốt Enum / Status cứng nhắc:**
   - Tại các cột trạng thái (`payment_status`, `booking_status`, `status` của checkout session hay ticket), tài liệu này đưa ra giá trị khuyến nghị và quy định rõ: **Sử dụng canonical status do TV1/TV8 thống nhất trong backend schema** (ví dụ: `payment_status = 'verified'/'paid'`, `booking_status = 'confirmed'`, session status = `'ACTIVE'/'PENDING'`).

---

## 3. Danh Sách Fixtures Yêu Cầu TV8 Hỗ Trợ Seed

### 3.1. Auth & Profiles (Tài khoản thử nghiệm)
Yêu cầu TV8 khởi tạo 02 tài khoản mẫu trong `auth.users` và đồng bộ sang `public.profiles`:

| Vai trò | ID (UUID chuẩn Hex) | Email / Display Name | Mục đích sử dụng |
|---|---|---|---|
| **Khách lưu trú (Guest)** | `00000000-0000-0000-0000-000000000001` | `testguest@kapistay.local`<br>Khách Lưu Trú Mẫu (QA Test) | Dùng để đăng nhập test luồng đặt phòng (TC-05), trang My Stay (TC-06) và gửi ticket (TC-07). |
| **Vận hành viên (Admin/Operator)** | `00000000-0000-0000-0000-000000000002` | `operator@kapistay.local`<br>Quản Trị Vận Hành (QA Admin) | Dùng để đăng nhập test màn hình Operations Dashboard (TC-08) và tiếp nhận ticket. |

---

### 3.2. Properties & Rooms (Chuẩn hóa Property ID & 4 Phòng mẫu)
Yêu cầu định danh 3 cơ sở chính bằng UUID chuẩn hex và tạo 4 phòng mẫu (bao gồm phòng sức chứa 4 tại Đặng Văn Ngữ phục vụ Positive Test Case cho TC-01):

#### Danh mục Cơ sở (`public.properties`):
- **Cơ sở Đặng Văn Ngữ (`dvn`):** `id = '00000000-0000-0000-0000-000000000071'`
- **Cơ sở Tây Hồ (`tay-ho`):** `id = '00000000-0000-0000-0000-000000000072'`
- **Cơ sở Cầu Giấy (`cau-giay`):** `id = '00000000-0000-0000-0000-000000000073'`

#### Danh mục Phòng mẫu (`public.rooms`, `room_operations`, `room_private_details`):

| Thuộc tính | Phòng 1 (Đặng Văn Ngữ - 2K) | Phòng 2 (Tây Hồ - 2K) | Phòng 3 (Cầu Giấy - 4K) | Phòng 4 (Đặng Văn Ngữ - 4K) *(Positive TC-01)* |
|---|---|---|---|---|
| **Room ID** | `00000000-0000-0000-0000-000000000011` | `00000000-0000-0000-0000-000000000012` | `00000000-0000-0000-0000-000000000013` | `00000000-0000-0000-0000-000000000014` |
| **Property ID** | `...00000071` (`dvn`) | `...00000072` (`tay-ho`) | `...00000073` (`cau-giay`) | `...00000071` (`dvn`) |
| **Tên phòng** | Phòng Studio Hoa Nắng | Phòng Ban Công View Hồ | Phòng Family Suite Cầu Giấy | Kapi Family Suite DVN |
| **Giá niêm yết** | 650.000 VND / đêm | 850.000 VND / đêm | 1.150.000 VND / đêm | 1.200.000 VND / đêm |
| **Sức chứa** | **2 khách** | **2 khách** | **4 khách** | **4 khách** *(Khớp bộ lọc TC-01)* |
| **Ảnh đại diện** | `/images/rooms/room-1.webp` | `/images/rooms/room-2.webp` | `/images/rooms/room-3.webp` | `/images/rooms/room-1.webp` |
| **Trạng thái catalog** | `is_listed = true` | `is_listed = true` | `is_listed = true` | `is_listed = true` |
| **Vận hành (`room_operations`)** | `operational_status = 'ready'` | `operational_status = 'ready'` | `operational_status = 'ready'` | `operational_status = 'ready'` |
| **Bảo mật Wi-Fi (`room_private_details`)** | SSID: `Kapi_DangVanNgu_5G`<br>Pass: `kapi@dvn2026`<br>*(Không chứa door PIN)* | SSID: `Kapi_TayHo_HighSpeed`<br>Pass: `kapi@tayho2026`<br>*(Không chứa door PIN)* | SSID: `Kapi_CauGiay_Guest`<br>Pass: `kapi@cg2026`<br>*(Không chứa door PIN)* | SSID: `Kapi_DVN_Family_5G`<br>Pass: `kapi@dvn2026`<br>*(Không chứa door PIN)* |

---

### 3.3. Loyalty Vouchers (2 Voucher kiểm thử luồng Checkout)
Yêu cầu 02 voucher trong bảng `public.vouchers` và bản ghi tương ứng trong `public.voucher_redemptions`:

1. **Voucher hợp lệ (`KAPI40`):**
   - `id`: `f1111111-1111-1111-1111-111111111111` (UUID chuẩn hex)
   - `name`: `KAPI40`
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

### 3.4. Checkout Session Mẫu (Phục vụ TC-04 & Luồng Thanh toán VietQR)
Yêu cầu 01 bản ghi phiên checkout trong bảng `public.checkout_sessions` có số tiền được derive chuẩn xác từ công thức giảm giá voucher:

- **Bản ghi Checkout Session (`checkout_sessions`):**
  - `id`: `00000000-0000-0000-0000-000000000051` (UUID chuẩn hex, không dùng mã string `CK-...`)
  - `user_id`: `00000000-0000-0000-0000-000000000001` (Guest test)
  - `room_id`: `00000000-0000-0000-0000-000000000011` (Phòng Studio Hoa Nắng - 650.000đ/đêm)
  - `check_in`: `current_date + interval '2 days'`
  - `check_out`: `current_date + interval '4 days'` (2 đêm lưu trú)
  - `guest_count`: `2`
  - `gross_amount_vnd`: `1300000` (650.000đ $\times$ 2 đêm)
  - `discount_amount_vnd`: `400000` (áp voucher `KAPI40` giảm 40% trên base cap 1.000.000đ = tối đa 400.000đ)
  - `final_payable_amount_vnd`: `900000` ($1.300.000đ - 400.000đ = 900.000đ$, đúng check constraint tính toán)
  - `status`: `'pending'` (hoặc canonical status do TV1/TV8 thống nhất trong backend schema)
  - `expires_at`: `current_timestamp + interval '30 minutes'`
  - `payment_reference`: `KAPI51PAY` (nội dung chuyển khoản đồng bộ cho VietQR)

---

### 3.5. Confirmed Booking & Dynamic Digital Key (Đơn phòng mẫu thời gian thực)
Yêu cầu 01 đơn đặt phòng trong `public.bookings` kèm Digital Key tương ứng trong `public.booking_access_credentials`:

- **Đơn đặt phòng (`bookings`):**
  - `id`: `00000000-0000-0000-0000-000000000021` (UUID chuẩn hex)
  - `user_id`: `00000000-0000-0000-0000-000000000001`
  - `room_id`: `00000000-0000-0000-0000-000000000011` (Phòng Studio Hoa Nắng)
  - `check_in`: `current_date` (ngày hôm nay)
  - `check_out`: `current_date + 1` (ngày mai)
  - `guest_count`: `2`
  - `gross_amount_vnd`: `650000`
  - `discount_amount_vnd`: `260000` (giảm 40% voucher)
  - `final_paid_amount_vnd`: `390000`
  - `payment_status`: Sử dụng canonical status do TV1/TV8 thống nhất trong backend schema (ví dụ: `payment_status = 'verified'/'paid'`)
  - `booking_status`: Sử dụng canonical status do TV1/TV8 thống nhất trong backend schema (ví dụ: `booking_status = 'confirmed'`)
- **Mã số mở cửa Digital Key (`booking_access_credentials`):**
  - `id`: `ba111111-1111-1111-1111-111111111111` (UUID chuẩn hex)
  - `booking_id`: `00000000-0000-0000-0000-000000000021`
  - `room_id`: `00000000-0000-0000-0000-000000000011`
  - `credential_type`: `'pin'`
  - `credential_value`: `'123456#'`
  - `instructions`: `'Chạm mu bàn tay cho sáng màn hình cảm ứng, nhập 123456 kèm phím #.'`
  - `valid_from`: `(current_date + time '14:00:00') at time zone 'Asia/Ho_Chi_Minh'` *(Bắt đầu đúng 14:00 ngày nhận phòng)*
  - `valid_until`: `((current_date + 1) + time '12:00:00') at time zone 'Asia/Ho_Chi_Minh'` *(Kết thúc đúng 12:00 ngày trả phòng)*
  - `status`: Sử dụng canonical status do TV1/TV8 thống nhất trong backend schema (ví dụ: `status = 'active'`)

---

### 3.6. Support Tickets (2 Phiếu sự cố kiểm thử vận hành)
Yêu cầu 02 tickets trong `public.tickets` có UUID hex chuẩn để kiểm thử màn hình khách và Dashboard vận hành:

1. **Ticket 1 (Chờ xử lý):**
   - `id`: `00000000-0000-0000-0000-000000000031` (UUID chuẩn hex)
   - `user_id`: `00000000-0000-0000-0000-000000000001`
   - `booking_id`: `00000000-0000-0000-0000-000000000021`
   - `room_id`: `00000000-0000-0000-0000-000000000011`
   - `category`: `'Thiết bị điện lạnh'`
   - `description`: `'Điều hòa chảy nước xuống góc sàn gỗ gần giường, cần thợ kiểm tra kỹ thuật.'`
   - `media_paths`: `array['/images/rooms/room-1.webp']`
   - `status`: Sử dụng canonical status do TV1/TV8 thống nhất trong backend schema (ví dụ: `'pending'` hoặc `'open'`)
2. **Ticket 2 (Đang xử lý):**
   - `id`: `00000000-0000-0000-0000-000000000032` (UUID chuẩn hex)
   - `user_id`: `00000000-0000-0000-0000-000000000001`
   - `booking_id`: `00000000-0000-0000-0000-000000000021`
   - `room_id`: `00000000-0000-0000-0000-000000000011`
   - `category`: `'Tiện ích phòng'`
   - `description`: `'Xin thêm gối ngủ êm và 01 chăn mỏng phục vụ thêm người lớn.'`
   - `media_paths`: `array[]::text[]`
   - `status`: Sử dụng canonical status do TV1/TV8 thống nhất trong backend schema (ví dụ: `'in_progress'`)

---

## 4. Ma Trận Ánh Xạ Test Cases & Dữ Liệu Yêu Cầu

| Mã Test | Hạng mục kiểm thử | Fixtures cần thiết tương ứng |
|:---:|---|---|
| **TC-01** | Lọc phòng theo cơ sở và số khách | Sử dụng **Phòng 4 (Kapi Family Suite DVN, capacity = 4)** tại Cơ sở Đặng Văn Ngữ (`...00000071`) làm Positive Case; các phòng còn lại kiểm thử lọc loại trừ (Mục 3.2). |
| **TC-02** | Validation chọn ngày Check-out trước Check-in | Không phụ thuộc dữ liệu database, kiểm tra logic form frontend. |
| **TC-03** | Khóa nút đặt khi phòng đã kín ngày | Đơn booking mẫu `...00000021` chiếm khoảng ngày `current_date` đến `current_date + 1` của phòng Studio Hoa Nắng (Mục 3.5). |
| **TC-04** | Render mã VietQR thanh toán | Sử dụng Checkout Session `00000000-0000-0000-0000-000000000051` với số tiền 900.000đ và `payment_reference = 'KAPI51PAY'` (Mục 3.4). |
| **TC-05** | Chặn khách vãng lai (Auth Guard) | Cần tài khoản khách mẫu `testguest@kapistay.local` (Mục 3.1) để hoàn tất đăng nhập chuyển hướng về `/login?next=/checkout`. |
| **TC-06** | Hiển thị mã Digital Key & Copy Wi-Fi tại My Stay | Cần đơn booking `...00000021` (`confirmed`) và bản ghi mã PIN hợp lệ trong `booking_access_credentials` (Mục 3.5). *QA đảm bảo thời điểm test nằm trong khung 14:00 - 12:00.* |
| **TC-07** | Gửi ticket báo sự cố đính kèm ảnh | Cần đơn booking đang diễn ra để gửi ticket không reload trang. |
| **TC-08** | Operations Dashboard tải dữ liệu tickets | Cần 2 tickets mẫu `...00000031` và `...00000032` (Mục 3.6). |
| **TC-09** | Co giãn giao diện di động (Responsive QA) | Sử dụng toàn bộ giao diện đã có dữ liệu danh mục phòng và chi tiết phòng. |
| **TC-10** | Tốc độ tải ảnh WebP [QA Benchmark] | Sử dụng các ảnh WebP nhẹ (~9.5KB) tại `/images/rooms/room-*.webp`. |

---

## 5. Kế Hoạch Phối Hợp & Tiếp Nhận Bàn Giao

1. **Bàn giao đặc tả:** TV9 gửi tài liệu này cho TV8 thông qua Pull Request hoặc trao đổi kỹ thuật nội bộ.
2. **Triển khai Database:** TV8 hiện thực hóa các fixtures trên vào môi trường Supabase Local (hoặc bổ sung vào file seed chính thống có kiểm soát).
3. **Phê duyệt:** TV1 (Tech Lead) kiểm tra tính tương thích với schema và chấp thuận đưa vào quy trình phát triển chung.
