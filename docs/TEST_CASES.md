# Kế Hoạch Kiểm Thử Tính Năng & Kịch Bản Test (Test Cases)
## Dự án: Kapi Stay Concierge — Trợ Lý Kỳ Nghỉ Tự Phục Vụ Thông Minh
**Người lập kế hoạch / Quản lý QA:** TV9 (Tuấn Anh — Assets / Content / QA Testing)  
**Tài liệu tham chiếu:** [./PROJECT_GUIDE.md](./PROJECT_GUIDE.md), [./TEAM_FILE_OWNERSHIP.md](./TEAM_FILE_OWNERSHIP.md), [./FEATURE_OWNERS.md](./FEATURE_OWNERS.md)

> **LƯU Ý VỀ CHỈ SỐ PHI CHỨC NĂNG (QA Benchmark / Internal Quality Target):**  
> Các chỉ số về kích thước vùng chạm touch-target ($\ge$ 44x44px trong TC-09) và tốc độ tải ảnh dưới 2 giây (trong TC-10) là mục tiêu chất lượng nội bộ của QA nhằm định hướng tối ưu hóa trải nghiệm người dùng, **không phải Acceptance Criteria bắt buộc để chặn release**. Riêng phần kiểm thử video hiện ở trạng thái **PENDING / TBD** chờ asset chính thức.

---

## 1. Bảng Ca Kiểm Thử Thực Tế (Test Execution Matrix)

| Mã Test | Hạng mục | Thao tác thực hiện | Dữ liệu đầu vào | Kết quả mong đợi | Phụ trách sửa khi lỗi | Trạng thái |
|:---:|---|---|---|---|:---:|:---:|
| **TC-01** | Danh mục phòng (Room Catalog) | 1. Mở trang `/rooms`.<br>2. Chọn bộ lọc Cơ sở: "Đặng Văn Ngữ" (Property ID: `00000000-0000-0000-0000-000000000071`).<br>3. Chọn bộ lọc Số khách: 4 khách.<br>4. Quan sát danh sách phòng hiển thị. | • Cơ sở: `00000000-0000-0000-0000-000000000071`<br>• Số khách: 4 | Danh sách trả về đúng phòng 'Kapi Family Suite DVN' (room_id: `00000000-0000-0000-0000-000000000014`) thỏa mãn đồng thời cả 2 tiêu chí; các phòng khác cơ sở hoặc không đủ sức chứa bị loại trừ. | TV2 - Thảo | Chờ test |
| **TC-02** | Chi tiết phòng & Chọn ngày (Room Detail) | 1. Truy cập trang `/rooms/[id]`.<br>2. Tại bộ chọn ngày, chọn ngày Check-in: 25/10/2026.<br>3. Chọn ngày Check-out: 23/10/2026 (trước Check-in).<br>4. Quan sát thông báo lỗi và trạng thái nút bấm. | • Check-in: 25/10/2026<br>• Check-out: 23/10/2026 | Khoảng ngày không hợp lệ (check-out trước hoặc cùng ngày check-in) bị hệ thống chặn tiếp tục (thông qua native browser constraint hoặc validation feedback phù hợp) và nút Tiếp tục/CTA bị vô hiệu hóa (disabled). | TV3 - Mai | Chờ test |
| **TC-03** | Kiểm tra phòng trống (Availability Check) | 1. Chọn phòng Studio Hoa Nắng (cơ sở Đặng Văn Ngữ).<br>2. Chọn khoảng ngày lưu trú trùng với đơn đặt phòng mẫu trong database (từ `current_date` đến `current_date + 1`).<br>3. Quan sát phản hồi của hệ thống và nút CTA đặt phòng. | • Phòng: Studio Hoa Nắng (`00000000-0000-0000-0000-000000000011`)<br>• Ngày: `current_date` đến `current_date + 1` (trùng mock booking `confirmed`) | Hàm `checkRoomAvailability()` trả về boolean `false` đối với khoảng ngày trùng lịch; UI RoomBookingWidget tiếp nhận và chuyển sang trạng thái `UNAVAILABLE`, hiển thị thông báo phòng đã kín và vô hiệu hóa nút Đặt phòng (CTA). | TV3 (Mai) & TV8 (Quỳnh) | Chờ test |
| **TC-04** | Thanh toán VietQR (Booking & Checkout) | 1. Đi tới màn hình `/checkout` với session ID `00000000-0000-0000-0000-000000000051` (trạng thái `ACTIVE`).<br>2. Chọn phương thức thanh toán VietQR.<br>3. Kiểm tra mã QR code và thông tin thanh toán. | • Session ID: `00000000-0000-0000-0000-000000000051`<br>• Trạng thái session: `ACTIVE`<br>• Tổng tiền: 1.300.000 VND (2 đêm $\times$ 650k)<br>• Voucher: `KAPI40` (-400.000đ)<br>• Thực trả: 900.000 VND<br>• Nội dung CK: `KAPI51PAY` | • **Scope Demo:** Render mã VietQR chuẩn xác theo thông tin tài khoản, đúng số tiền thực trả 900.000đ (derive từ 1.300.000đ trừ 400.000đ voucher) và nội dung chuyển khoản chứa mã tham chiếu `KAPI51PAY` cho phiên checkout `ACTIVE` còn hiệu lực.<br>• **Scope Production:** Xác minh giao dịch tự động (TBD - đang chờ chốt OD04). | TV4 - Linh | Chờ test |
| **TC-05** | Xác thực trước đặt phòng (Auth Guard) | 1. Mở cửa sổ ẩn danh (chưa đăng nhập).<br>2. Chọn phòng và nhấn nút "Đặt phòng ngay" từ Room Detail hoặc truy cập trực tiếp `/checkout`.<br>3. Quan sát luồng điều hướng của hệ thống. | • Trạng thái: Khách vãng lai (Chưa đăng nhập)<br>• Thao tác: Bấm đặt phòng hoặc truy cập checkout | Khách chưa đăng nhập bấm Đặt phòng từ Room Detail -> hệ thống bảo toàn các tham số đặt phòng (`roomId`, `checkIn`, `checkOut`, `guests`) và chuyển hướng đến `/login?next=<encoded checkout URL>` (ví dụ: `/login?next=%2Fcheckout%3FroomId%3D...`). Khi truy cập trực tiếp `/checkout` thì chuyển hướng đến `/login?next=/checkout`. | TV4 (Linh) & TV8 (Quỳnh) | Chờ test |
| **TC-06** | Trải nghiệm lưu trú (My Stay Concierge) | 1. Đăng nhập tài khoản có booking đang hiệu lực.<br>2. Vào trang `/my-stay`.<br>3. Kiểm tra thông tin mã cửa (Digital Key).<br>4. Nhấn nút "Sao chép mật khẩu Wi-Fi" và dán thử. | • **Precondition:** Thời điểm thực thi kiểm thử (`now()`) phải nằm trong khung giờ lưu trú hợp lệ (từ 14:00 ngày check-in đến 12:00 ngày check-out) hoặc sử dụng fixture môi trường khớp khung giờ test.<br>• Booking: Trạng thái `confirmed` (`00000000-0000-0000-0000-000000000021`)<br>• Wi-Fi SSID: `Kapi_DangVanNgu_5G`<br>• Pass: `kapi@dvn2026` | Hệ thống hiển thị mã số mở cửa (Digital Key PIN) tương ứng với credential còn hiệu lực; bấm nút copy Wi-Fi hiển thị thông báo "Đã sao chép" và clipboard lưu đúng mật khẩu Wi-Fi. | TV5 - Chi | Chờ test |
| **TC-07** | Báo sự cố & Tickets (Guest Tickets) | 1. Tại `/my-stay`, mở form "Báo sự cố thiết bị".<br>2. Chọn mục Điều hòa, nhập mô tả lỗi.<br>3. Đính kèm 1 file ảnh (JPG/PNG, dung lượng 2MB).<br>4. Bấm "Gửi yêu cầu". | • Thiết bị: Điều hòa<br>• Mô tả: "Điều hòa không mát"<br>• File: `dieu-hoa-loi.jpg` | Gửi dữ liệu bất đồng bộ không reload trang (No Page Reload); hiển thị toast thông báo gửi thành công; danh sách ticket tự cập nhật ticket mới ở trạng thái "Chờ xử lý". | TV6 - Phương | Chờ test |
| **TC-08** | Vận hành & Quản trị (Operations Dashboard) | 1. Khách lưu trú gửi ticket sự cố từ trang `/my-stay` (TC-07).<br>2. Mở Operations Dashboard theo route nội bộ (ví dụ: route tạm `/operations` hoặc route canonical do TV1/TV7 chốt) và tải lại trang hoặc kiểm tra danh sách ticket. | • Sự kiện: Ticket mới vừa tạo từ khách lưu trú | Operations Dashboard tải dữ liệu thành công, hiển thị đúng ticket vừa tạo khi reload/refetch. | TV7 - T Mai | Chờ test |
| **TC-09** | [QA Benchmark] Co giãn giao diện di động (Responsive QA) | 1. Dùng DevTools hoặc thiết bị thật kiểm tra độ phân giải 360px, 390px, 414px.<br>2. Duyệt qua: Trang chủ, Danh mục phòng, Chi tiết phòng, Checkout, My Stay. | • Màn hình: 360px - 414px<br>(iPhone 12/14, Galaxy S20) | Giao diện hiển thị liền mạch, không vỡ layout, không tràn viền ngang (no horizontal overflow); kích thước nút bấm $\ge$ 44x44px thuận tiện thao tác một tay. | TV9 (Tuấn Anh) | Chờ test |
| **TC-10** | [QA Benchmark] Hiệu năng tải trang (Performance & Assets) | 1. Bật Network tab ở mức mạng mô phỏng Regular 4G / Fast 3G.<br>2. Tải trang chi tiết phòng có gallery ảnh WebP và cẩm nang lưu trú.<br>3. Đo thời gian tải tài nguyên hình ảnh. | • Mạng: 4G thường<br>• URL: `/rooms/[id]` (gallery ảnh WebP) | • **Hiệu năng ảnh & cẩm nang [QA Benchmark]:** Hình ảnh WebP (~9.5KB) tải hoàn tất dưới 1.5 - 2 giây, hiển thị sắc nét, không vỡ layout.<br>• **Kiểm thử video:** [PENDING / TBD - Chờ asset video chính thức và UI tích hợp], hiện không áp đặt tiêu chí benchmark video khi chưa có file media vật lý. | TV9 (Tuấn Anh) | Chờ test |

---

## 2. Mẫu Báo Cáo Lỗi (Bug Report Template)

Khi phát hiện lỗi trong quá trình kiểm thử (test execution), QA Tester (TV9) hoặc thành viên nhóm lập báo cáo theo mẫu chuẩn dưới đây để gửi đến Feature Owner tương ứng:

```markdown
### [BUG] - [Tóm tắt ngắn gọn lỗi phát sinh]

- **Mã lỗi (Bug ID):** BUG-XXXX (ví dụ: BUG-001)
- **Ca kiểm thử liên quan (Test Case ID):** TC-XX (ví dụ: TC-02)
- **Mức độ nghiêm trọng (Severity):** 
  - [ ] Block (Chặn hoàn toàn luồng người dùng / không thể tiếp tục)
  - [ ] Critical (Lỗi nghiêm trọng logic / sai lệch dữ liệu / thanh toán)
  - [ ] Major (Lỗi chức năng quan trọng nhưng có giải pháp thay thế tạm thời)
  - [ ] Minor (Lỗi giao diện, chính tả, lệch pixel, trải nghiệm phụ)

#### 1. Môi trường kiểm thử (Environment)
- Thiết bị: [ví dụ: iPhone 14 Pro / Laptop Dell XPS 15]
- Hệ điều hành: [ví dụ: iOS 17.5 / macOS Sonoma 14.5 / Windows 11]
- Trình duyệt: [ví dụ: Safari Mobile / Google Chrome 128 / Firefox 130]
- Kích thước màn hình (Viewport): [ví dụ: 393 x 852px / 1920 x 1080px]
- Tài khoản thử nghiệm: [ví dụ: testuser@gmail.com / Khách vãng lai]

#### 2. Các bước tái hiện lỗi (Steps to Reproduce)
1. Bước 1: ...
2. Bước 2: ...
3. Bước 3: ...

#### 3. Kết quả thực tế (Actual Result)
- [Mô tả chi tiết những gì thực tế đã xảy ra trên hệ thống]

#### 4. Kết quả mong đợi (Expected Result)
- [Mô tả chi tiết những gì hệ thống nên xử lý theo đúng tài liệu thiết kế]

#### 5. Bằng chứng đính kèm (Evidence)
- [Đính kèm ảnh chụp màn hình (Screenshot), video quay màn hình hoặc console log lỗi]

#### 6. Phân công khắc phục (Assignment)
- **Người báo cáo (Reporter):** TV9 - Tuấn Anh
- **Người phụ trách sửa (Assignee):** [Điền tên TV phụ trách feature]
- **Thời hạn khắc phục dự kiến:** [DD/MM/YYYY]
```
