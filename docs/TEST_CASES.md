# Kế Hoạch Kiểm Thử Tính Năng & Kịch Bản Test (Test Cases)
## Dự án: Kapi Stay Concierge — Trợ Lý Kỳ Nghỉ Tự Phục Vụ Thông Minh
**Người lập kế hoạch / Quản lý QA:** TV9 (Tuấn Anh — Assets / Content / QA Testing)  
**Tài liệu tham chiếu:** [docs/PROJECT_GUIDE.md](file:///Users/mac/Downloads/kapi-stay-concierge/docs/PROJECT_GUIDE.md), [docs/TEAM_FILE_OWNERSHIP.md](file:///Users/mac/Downloads/kapi-stay-concierge/docs/TEAM_FILE_OWNERSHIP.md), [docs/FEATURE_OWNERS.md](file:///Users/mac/Downloads/kapi-stay-concierge/docs/FEATURE_OWNERS.md)

---

## 1. Bảng Ca Kiểm Thử Thực Tế (Test Execution Matrix)

| Mã Test | Hạng mục | Thao tác thực hiện | Dữ liệu đầu vào | Kết quả mong đợi | Phụ trách sửa khi lỗi | Trạng thái |
|:---:|---|---|---|---|:---:|:---:|
| **TC-01** | Danh mục phòng (Room Catalog) | 1. Mở trang `/rooms`.<br>2. Chọn bộ lọc Cơ sở: "Đặng Văn Ngữ" (`dvn`).<br>3. Chọn bộ lọc Số khách: 4 khách.<br>4. Quan sát danh sách phòng hiển thị. | • Cơ sở: `dvn`<br>• Số khách: 4 | Chỉ hiển thị các phòng thuộc cơ sở Đặng Văn Ngữ có sức chứa $\ge$ 4 khách; các phòng khác cơ sở hoặc không đủ sức chứa bị ẩn; số lượng kết quả hiển thị chính xác. | TV2 - Thảo | Chờ test |
| **TC-02** | Chi tiết phòng & Chọn ngày (Room Detail) | 1. Truy cập trang `/rooms/[id]`.<br>2. Tại bộ chọn ngày, chọn ngày Check-in: 25/10/2026.<br>3. Chọn ngày Check-out: 23/10/2026 (trước Check-in).<br>4. Quan sát thông báo lỗi và trạng thái nút bấm. | • Check-in: 25/10/2026<br>• Check-out: 23/10/2026 | Hệ thống hiển thị viền đỏ cảnh báo: "Ngày trả phòng phải sau ngày nhận phòng ít nhất 1 đêm"; vô hiệu hóa (disabled) nút "Tiến hành đặt phòng". | TV3 - Mai | Chờ test |
| **TC-03** | Kiểm tra phòng trống (Availability Check) | 1. Chọn phòng Deluxe cơ sở Đặng Văn Ngữ.<br>2. Chọn khoảng ngày đã có khách đặt trước trong cơ sở dữ liệu (ví dụ: 20/10 - 22/10).<br>3. Quan sát giao diện lịch và nút đặt phòng. | • Phòng: Deluxe Ban Công<br>• Ngày: 20/10/2026 - 22/10/2026 (trùng booking `CONFIRMED`) | Các ngày đã kín phòng bị gạch chéo hoặc làm mờ trên lịch; hiển thị thông báo "Phòng đã kín trong thời gian này"; nút "Đặt phòng" bị khóa, không cho sang checkout. | TV3 (Mai) & TV8 (Quỳnh) | Chờ test |
| **TC-04** | Thanh toán VietQR (Booking & Checkout) | 1. Đi tới màn hình `/checkout` với đơn phòng có số tiền 1.250.000đ sau giảm giá.<br>2. Chọn phương thức thanh toán VietQR.<br>3. Quét kiểm tra mã QR code được sinh ra. | • Số tiền: 1.250.000 VND<br>• Session ID: `CK-98234` | Mã VietQR động hiển thị rõ ràng; quét mã bằng app ngân hàng cho đúng STK homestay, đúng số tiền 1.250.000đ và nội dung chuyển khoản chứa mã đơn chuẩn xác. | TV4 - Linh | Chờ test |
| **TC-05** | Xác thực trước đặt phòng (Auth Guard) | 1. Mở cửa sổ ẩn danh (chưa đăng nhập).<br>2. Chọn phòng và nhấn nút "Đặt phòng ngay" hoặc truy cập trực tiếp `/checkout`.<br>3. Quan sát luồng điều hướng của hệ thống. | • Trạng thái: Khách vãng lai (Chưa đăng nhập)<br>• Thao tác: Bấm đặt phòng | Hệ thống kích hoạt Auth Guard, chuyển hướng ngay về `/login?returnTo=...`; bắt buộc đăng nhập tài khoản Google thành công mới cho phép tạo đơn và thanh toán. | TV4 (Linh) & TV8 (Quỳnh) | Chờ test |
| **TC-06** | Trải nghiệm lưu trú (My Stay Concierge) | 1. Đăng nhập tài khoản có booking đang hiệu lực.<br>2. Vào trang `/my-stay`.<br>3. Kiểm tra thông tin mã cửa (Digital Key).<br>4. Nhấn nút "Sao chép mật khẩu Wi-Fi" và dán thử. | • Booking: Trạng thái `CONFIRMED`<br>• Wi-Fi SSID: `Kapi_House_5G`<br>• Pass: `kapiwelcome2026` | Hiển thị chính xác mã PIN khóa số phòng trong thời gian lưu trú; bấm nút copy Wi-Fi hiển thị thông báo "Đã sao chép" và clipboard lưu đúng mật khẩu Wi-Fi. | TV5 - Chi | Chờ test |
| **TC-07** | Báo sự cố & Tickets (Guest Tickets) | 1. Tại `/my-stay`, mở form "Báo sự cố thiết bị".<br>2. Chọn mục Điều hòa, nhập mô tả lỗi.<br>3. Đính kèm 1 file ảnh (JPG/PNG, dung lượng 2MB).<br>4. Bấm "Gửi yêu cầu". | • Thiết bị: Điều hòa<br>• Mô tả: "Điều hòa không mát"<br>• File: `dieu-hoa-loi.jpg` | Gửi dữ liệu bất đồng bộ không reload trang (No Page Reload); hiển thị toast thông báo gửi thành công; danh sách ticket tự cập nhật ticket mới ở trạng thái "Chờ xử lý". | TV6 - Phương | Chờ test |
| **TC-08** | Vận hành thời gian thực (Admin Operations) | 1. Mở đồng thời 2 màn hình: Khách gửi ticket (TC-07) và Admin Dashboard (`/admin`).<br>2. Khách bấm gửi ticket sự cố.<br>3. Quan sát màn hình Admin mà không nhấn F5. | • Sự kiện: Ticket mới vừa tạo từ khách lưu trú | Màn hình Admin nhận ticket mới tức thì qua Supabase Realtime trong vòng dưới 1 giây; danh sách ticket tự động đẩy lên đầu kèm chuông/badge thông báo. | TV7 - T Mai | Chờ test |
| **TC-09** | Co giãn giao diện di động (Responsive QA) | 1. Dùng DevTools hoặc thiết bị thật kiểm tra độ phân giải 360px, 390px, 414px.<br>2. Duyệt qua: Trang chủ, Danh mục phòng, Chi tiết phòng, Checkout, My Stay. | • Màn hình: 360px - 414px<br>(iPhone 12/14, Galaxy S20) | Giao diện hiển thị liền mạch, không vỡ layout, không tràn viền ngang (no horizontal overflow); kích thước nút bấm $\ge$ 44x44px thuận tiện thao tác một tay. | TV9 (Tuấn Anh) | Chờ test |
| **TC-10** | Hiệu năng tải trang (Performance & Assets) | 1. Bật Network tab ở mức mạng mô phỏng Regular 4G / Fast 3G.<br>2. Tải trang chi tiết phòng có gallery ảnh và video hướng dẫn thiết bị.<br>3. Đo thời gian tải. | • Mạng: 4G thường<br>• URL: `/rooms/[id]` (kèm ảnh và video) | Hình ảnh tối ưu định dạng hiện đại (WebP) tải hoàn tất dưới 1.5 giây; video hướng dẫn thiết bị bắt đầu phát mượt mà dưới 2 giây, không bị giật lag. | TV9 (Tuấn Anh) | Chờ test |

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
