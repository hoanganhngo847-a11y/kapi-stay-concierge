# Bảng Phân Công Feature & Quy Chuẩn Phân Nhánh Git
## Kapi Stay Concierge — Official Team Ownership & Branch Assignment Guide

Tài liệu này xác định phân công nhân sự chính thức, quyền hạn và trách nhiệm cho từng thành viên trong nhóm phát triển dự án **Kapi Stay Concierge**:
- **Danh sách thành viên chính thức (TV1 – TV9)** và vai trò tương ứng;
- **Branch chuẩn** cho từng feature;
- **Phạm vi file/folder (Scope)** của từng thành viên, phân biệt rạch ròi giữa **CURRENT PATH** (đã tồn tại trong repo) và **FUTURE / RECOMMENDED PATH** (quy ước tương lai khi triển khai);
- **Cơ chế phối hợp & xin phê duyệt (Approval)** khi chạm vào các vùng Shared hoặc Protected Foundation;
- **Tách bạch sở hữu giữa TV2 (Room Catalog) và TV3 (Room Detail)** nhằm loại bỏ hoàn toàn nguy cơ merge conflict.

> ⚠️ **Quy tắc phân quyền file chung xem tại:** [docs/TEAM_FILE_OWNERSHIP.md](file:///Users/hoangthuy/kapi-stay-concierge-main/docs/TEAM_FILE_OWNERSHIP.md)

---

## 1. Nguyên Tắc Phân Quyền Bắt Buộc (Important Ownership Rule)

> **QUY TẮC BẤT DI BẤT DỊCH:**
> Tài liệu `docs/FEATURE_OWNERS.md` chỉ định ownership ở cấp độ **Feature (Tính năng nghiệp vụ)** và gán cho từng cá nhân cụ thể.
> Nếu phát sinh bất kỳ xung đột nào với `docs/TEAM_FILE_OWNERSHIP.md`, thứ tự ưu tiên tuyệt đối luôn là:
>
> $$\mathbf{🔴\ PROTECTED\ >\ 🟡\ SHARED\ >\ 🟢\ FEATURE\ OWNED}$$
>
> **Feature Owner KHÔNG có quyền tự ý chỉnh sửa Protected files chỉ vì feature của họ có nhu cầu.** Mọi thay đổi chạm vào vùng Protected bắt buộc phải qua quy trình RFC / Issue đề xuất và được Main Maintainer / Tech Lead phê duyệt trước khi thực hiện.

---

## 2. Quy Chuẩn Đặt Tên Nhánh Git (Branch Naming Convention)

Tất cả thành viên trong team và AI coding agents bắt buộc tuân theo quy chuẩn đặt tên nhánh:

| Loại nhánh | Cú pháp quy chuẩn | Mục đích | Ví dụ |
|---|---|---|---|
| **Feature mới** | `feat/<feature-name>` | Triển khai một tính năng hoặc module mới | `feat/room-catalog`<br>`feat/room-detail`<br>`feat/booking-checkout`<br>`feat/my-stay`<br>`feat/tickets`<br>`feat/operations-dashboard`<br>`feat/assets-content` |
| **Sửa lỗi** | `fix/<feature-name>-<short-description>` | Khắc phục lỗi thuộc phạm vi một feature cụ thể | `fix/room-catalog-filter`<br>`fix/room-detail-calendar`<br>`fix/my-stay-wifi-copy` |
| **Công việc phụ trợ / Bảo trì** | `chore/<short-description>` | Nâng cấp tooling, migration đã duyệt, clean docs | `chore/add-checkout-schema`<br>`chore/update-readme` |

*Lưu ý: Không tự ý tạo branch hoặc commit trực tiếp trên `main`. Luôn rẽ nhánh từ bản `main` mới nhất.*

---

## 3. Bảng Phân Công Chính Thức Của Nhóm (Official Team Matrix)

### Thuật ngữ trạng thái (Status Vocabulary):
- **`EXISTING`**: Đã có mã nguồn thực tế trong repo và đang chạy ổn định.
- **`PARTIAL`**: Đã có nền tảng ban đầu (route/client component), đang tiếp tục hoàn thiện.
- **`PLANNED`**: Đang trong kế hoạch kiến trúc, chưa có code triển khai (các path là quy ước tương lai).
- **`FOUNDATION`**: Hạ tầng cốt lõi dùng chung (Auth, Database) phục vụ toàn bộ ứng dụng.
- **`PROTECTED`**: Khu vực bảo vệ nghiêm ngặt, chỉ Tech Lead / Main Maintainer kiểm soát và phê duyệt.

### Bảng phân công tổng hợp 9 thành viên (TV1 – TV9):

| TV | Thành viên | Feature / Khu vực phụ trách | Branch | Phạm vi file / Scope | Trạng thái |
|:---:|---|---|:---:|---|:---:|
| **TV1** | **Hoàng Anh** | **Main Maintainer / Tech Lead**<br>Quản lý toàn bộ `main`, review PR, Auth & Shared UI | `NOT A NORMAL FEATURE BRANCH`<br>*(Quản lý nhánh `main`)* | • **Current:** `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `components/ui/**`, `package.json`, `package-lock.json`, `next.config.ts`, `tsconfig.json`<br>• **Protected Auth:** `app/login/**`, `app/auth/**`, `components/auth/**`, `lib/auth/**`, `lib/supabase/**`, `proxy.ts` | `FOUNDATION` / `PROTECTED` |
| **TV2** | **Thảo** | **Room Catalog**<br>Danh sách phòng, bộ lọc tìm kiếm | `feat/room-catalog` | • **Current:** `app/rooms/page.tsx`, `components/rooms/RoomCard.tsx`<br>• **Future:** `components/rooms/FilterBar.tsx`, `components/rooms/RoomFilters.tsx` | `EXISTING` / `PARTIAL` |
| **TV3** | **Mai** | **Room Detail**<br>Chi tiết phòng, chọn ngày, giá, kiểm tra phòng trống | `feat/room-detail` | • **Current:** `app/rooms/[id]/**`, `components/rooms/RoomBookingWidget.tsx`<br>• **Future:** `components/rooms/Gallery.tsx`, `components/rooms/RoomAmenities.tsx` | `EXISTING` / `PARTIAL` |
| **TV4** | **linh** | **Booking / Checkout / Payment**<br>Xác nhận đơn, áp voucher, thanh toán VietQR | `feat/booking-checkout` | • **Future:** `app/checkout/**`, `components/checkout/**`, `lib/data/checkout.ts` | `PLANNED` |
| **TV5** | **Chi** | **My Stay**<br>Kỳ nghỉ hiện tại, nhận phòng, Wi-Fi, Digital Key UI | `feat/my-stay` | • **Current:** `app/my-stay/**`<br>• **Future:** `components/my-stay/**`, `lib/data/my-stay.ts` | `EXISTING` / `PARTIAL` |
| **TV6** | **Phương** | **Guest Guide / Tickets**<br>Hướng dẫn phòng, gửi yêu cầu hỗ trợ / báo lỗi | `feat/tickets` | • **Future:** `components/tickets/**`, `components/my-stay/GuestGuide.tsx`, `components/my-stay/TicketModal.tsx`, `lib/data/tickets.ts` | `PLANNED` |
| **TV7** | **T Mai** | **Operations Dashboard**<br>Quản lý vận hành phòng, check-in/out, xử lý tickets | `feat/operations-dashboard` | • **Future:** `app/admin/**`, `components/admin/**`, `lib/data/admin.ts` | `PLANNED` |
| **TV8** | **Quỳnh** | **Database / Backend Data / Supabase Foundation**<br>Thiết kế data, migrations, RLS, queries, RPC | `NOT A NORMAL FEATURE BRANCH`<br>*(Tạo `chore/...` hoặc `fix/...` sau khi duyệt)* | • **Current:** `supabase/migrations/**`, `supabase/config.toml`, `supabase/seed.sql`, `lib/database.types.ts` | `FOUNDATION` / `PROTECTED` |
| **TV9** | **Tuấn Anh** | **Assets / Content / QA Testing**<br>Ảnh phòng, video hướng dẫn, nội dung, test UI/UX | `feat/assets-content` | • **Current:** `public/**`<br>• **Future:** `public/images/**`, `public/videos/**`, `content/**`, `docs/test-cases.*` | `PLANNED` |

---

## 4. Trách Nhiệm Chi Tiết & Ranh Giới Từng Thành Viên

### 4.1. TV1 — Hoàng Anh: Main Maintainer / Tech Lead
- **Vai trò:** Trưởng nhóm kỹ thuật & Quản trị mã nguồn chính (Main Maintainer / Tech Lead).
- **Quy ước nhánh:** Không phụ trách một feature branch cố định; điều phối và bảo vệ nhánh `main`.
- **Trách nhiệm trọng tâm:**
  - Giữ nhánh `main` luôn ổn định và sẵn sàng triển khai (production-ready).
  - Review mọi Pull Request từ các thành viên TV2 – TV9.
  - Kiểm tra xung đột mã nguồn (code conflict) và phát hiện các trường hợp sửa file ngoài phạm vi phân công.
  - Đảm bảo kiểm tra tự động `npm run lint` và `npm run build` vượt qua 100% trước khi merge.
  - Phê duyệt mọi thay đổi đối với file dùng chung (Shared UI, Root Layout, Global CSS).
  - Phê duyệt mọi thay đổi đối với hạ tầng Xác thực (Auth), Cơ sở dữ liệu (Database migrations), và Row Level Security (RLS).
  - Phê duyệt việc bổ sung thư viện mới (`package.json`) hoặc cấu hình build (`next.config.ts`, `tsconfig.json`).
  - Trực tiếp thực hiện merge PR sau khi hoàn thành review; cấu hình hạ tầng deployment khi dự án bước vào giai đoạn production.
- **Khu vực Shared do Hoàng Anh quản lý và điều phối:**
  - `app/layout.tsx` (Root layout, metadata, navigation tổng thể) — *CURRENT PATH*
  - `app/page.tsx` (Trang chủ) — *CURRENT PATH*
  - `app/globals.css` (Design tokens, biến màu toàn cục) — *CURRENT PATH*
  - `components/ui/**` (`Button.tsx`, `Input.tsx`, `Modal.tsx`, `Badge.tsx`, `index.ts`) — *CURRENT PATH*
  - `package.json`, `package-lock.json`, `next.config.ts`, `tsconfig.json` — *CURRENT PATH*
- **Lưu ý quan trọng:** Các file trên thuộc trạng thái **SHARED / MAINTAINER CONTROLLED**. Các thành viên khác có nhu cầu mở rộng hoặc chỉnh sửa bắt buộc phải thông báo và phối hợp với Hoàng Anh.

---

### 4.2. Shared Auth Foundation (Nền Tảng Xác Thực Dùng Chung)
- **Maintainer phụ trách:** **Hoàng Anh**
- **Trạng thái an ninh:** 🔴 **PROTECTED — REUSE ONLY**
- **Đã hoàn thiện & kiểm thử thực tế:**
  - Đăng nhập Google OAuth qua Supabase Auth: **DONE**
  - Đăng xuất an toàn & xóa cookie: **DONE**
  - Quản lý phiên làm việc SSR cookies & proxy route: **DONE**
  - Đồng bộ tự động hồ sơ người dùng (`profiles` sync): **DONE**
  - Bảo vệ route `/my-stay` bằng Auth Guard: **DONE**
- **Đường dẫn bảo vệ hiện tại (Current Protected Paths):**
  - `app/login/**` (`page.tsx`)
  - `app/auth/**` (`callback/route.ts`, `error/page.tsx`, `signout/route.ts`)
  - `components/auth/**` (`AuthNav.tsx`, `GoogleSignInButton.tsx`)
  - `lib/auth/**` (`booking-gate.ts`, `redirect.ts`)
  - `lib/supabase/**` (`client.ts`, `server.ts`, `proxy.ts`)
  - `proxy.ts`
- **Quy tắc cho tất cả thành viên (TV2 – TV9):** Chỉ **tái sử dụng** (REUSE ONLY) các helper và component xác thực có sẵn (ví dụ: `requireBookingAuth()`, `AuthNav`, session cookies). Tuyệt đối **KHÔNG** tự tạo flow auth riêng, không khởi tạo client Supabase độc lập trong component, và không tự viết lại logic session/login.

---

### 4.3. TV2 — Thảo: Room Catalog (Danh Sách & Bộ Lọc Phòng)
- **Branch chuẩn:** `feat/room-catalog`
- **Owner:** **Thảo**
- **Trạng thái:** `EXISTING / PARTIAL` (Đã có giao diện danh sách phòng `/rooms` kết nối Supabase Cloud).
- **Phụ trách chi tiết:**
  - Màn hình danh sách phòng công khai (`/rooms`);
  - Hiển thị danh sách thẻ phòng (Room Cards);
  - Bộ lọc phòng theo cơ sở (property), theo số lượng khách, tiện ích tóm tắt;
  - Hiển thị thumbnail ảnh, giá cơ bản, sức chứa tối đa;
  - Trạng thái tải dữ liệu (loading skeleton), trạng thái không tìm thấy phòng (empty state);
  - Giao diện responsive trên mobile, tablet, và desktop.
- **Phạm vi sở hữu độc quyền (Primary Ownership):**
  - `app/rooms/page.tsx` — *CURRENT PATH*
  - `components/rooms/RoomCard.tsx` — *CURRENT PATH*
- **Quy ước component tương lai (Future / Recommended Paths):**
  - `components/rooms/FilterBar.tsx` — *FUTURE / RECOMMENDED PATH*
  - `components/rooms/RoomFilters.tsx` — *FUTURE / RECOMMENDED PATH*
- **Giới hạn trách nhiệm (TV2 KHÔNG sở hữu):**
  - Tuyệt đối **KHÔNG** chỉnh sửa `app/rooms/[id]/**` (thuộc quyền TV3 Mai).
  - Không sở hữu `components/rooms/RoomBookingWidget.tsx` (thuộc quyền TV3 Mai).
  - Không can thiệp logic Checkout, Payment, Auth foundation, hoặc Database foundation.

---

### 4.4. TV3 — Mai: Room Detail (Chi Tiết Phòng & Chọn Ngày)
- **Branch chuẩn:** `feat/room-detail`
- **Owner:** **Mai**
- **Trạng thái:** `EXISTING / PARTIAL` (Đã có trang chi tiết `/rooms/[id]` với UI widget chọn ngày lưu trú).
- **Phụ trách chi tiết:**
  - Trang chi tiết từng phòng (`/rooms/[id]`);
  - Bộ sưu tập ảnh phòng (Gallery & Lightbox);
  - Mô tả đầy đủ tiện nghi, thông số kỹ thuật, quy định phòng;
  - Widget chọn ngày nhận phòng (check-in) và ngày trả phòng (check-out);
  - Validation ngày hợp lệ (ngày tương lai, check-out > check-in);
  - Chuẩn bị logic kiểm tra phòng trống theo khoảng ngày;
  - Tính toán và hiển thị giá tạm tính theo số đêm lưu trú;
  - Chuyển tiếp dữ liệu phòng và ngày hợp lệ sang bước đặt phòng / checkout.
- **Phạm vi sở hữu độc quyền (Primary Ownership):**
  - `app/rooms/[id]/**` (`page.tsx`, `loading.tsx`, `not-found.tsx`) — *CURRENT PATH*
  - `components/rooms/RoomBookingWidget.tsx` — *CURRENT PATH*
- **Quy ước component tương lai (Future / Recommended Paths):**
  - `components/rooms/Gallery.tsx` — *FUTURE / RECOMMENDED PATH*
  - `components/rooms/RoomAmenities.tsx` — *FUTURE / RECOMMENDED PATH*
- **Giới hạn trách nhiệm (TV3 KHÔNG sở hữu):**
  - Tuyệt đối **KHÔNG** chỉnh sửa `app/rooms/page.tsx` hay `RoomCard.tsx` (thuộc quyền TV2 Thảo).
  - Không can thiệp màn hình Checkout, Payment, Auth foundation, hoặc Database migrations.

---

### 4.5. Phân Định Ranh Giới Độc Lập Giữa TV2 (Thảo) và TV3 (Mai)

Nhằm triệt tiêu 100% rủi ro xung đột mã nguồn (merge conflict) trong thư mục `rooms`, phân chia quyền hạn cụ thể cho từng file như sau:

```text
┌──────────────────────────────────────────────────────────────────────────────────┐
│ TV2 — Thảo (feat/room-catalog)        │ TV3 — Mai (feat/room-detail)             │
├───────────────────────────────────────┼──────────────────────────────────────────┤
│ • app/rooms/page.tsx (Danh sách)      │ • app/rooms/[id]/** (Chi tiết phòng)     │
│ • components/rooms/RoomCard.tsx       │ • components/rooms/RoomBookingWidget.tsx │
│ • components/rooms/FilterBar.tsx*     │ • components/rooms/Gallery.tsx*          │
│ • components/rooms/RoomFilters.tsx*   │ • components/rooms/RoomAmenities.tsx*    │
└──────────────────────────────────────────────────────────────────────────────────┘
(*: Thư mục / file theo quy ước tương lai)
```

> **Nguyên tắc:** Cấm dùng gán quyền sở hữu chung chung kiểu `app/rooms/**` hay `components/rooms/**` cho cả hai người. Mỗi file component đều có đúng một người sở hữu chính duy nhất.

---

### 4.6. TV4 — linh: Booking / Checkout / Payment (Đặt Phòng & Thanh Toán)
- **Branch chuẩn:** `feat/booking-checkout`
- **Owner:** **linh**
- **Trạng thái:** `PLANNED` (Chưa triển khai mã nguồn; các đường dẫn dưới đây là quy ước tương lai).
- **Phạm vi tương lai khuyến nghị (Future / Recommended Paths):**
  - `app/checkout/**` (`page.tsx`, `loading.tsx`) — *FUTURE / RECOMMENDED PATH*
  - `components/checkout/**` (`CheckoutSummary.tsx`, `VoucherPicker.tsx`, `VietQRModal.tsx`) — *FUTURE / RECOMMENDED PATH*
  - `lib/data/checkout.ts` — *FUTURE / RECOMMENDED PATH*
- **Phụ trách chi tiết:**
  - Giao diện xác nhận thông tin đặt phòng (tóm tắt phòng, ngày nhận/trả, số đêm, tổng chi phí);
  - Thu thập thông tin khách lưu trú (họ tên, số điện thoại, email liên hệ);
  - Giao diện chọn và áp dụng Voucher loyalty (tối đa 1 voucher / booking, trừ 40% tối đa 400.000 VND);
  - Giao diện thanh toán chuyển khoản ngân hàng qua mã VietQR động;
  - Hiển thị trạng thái giao dịch thanh toán (chờ thanh toán, thành công, thất bại);
  - Trang xác nhận đặt phòng thành công kèm mã Booking Code và điều hướng sang My Stay.
- **Luồng nghiệp vụ mục tiêu:**
  ```text
  Khách chọn phòng (TV2/TV3) ──> Chọn ngày & số khách (TV3) ──> Đăng nhập Google (Auth)
    └──> Màn hình Checkout (TV4) ──> Áp Voucher loyalty (TV4) ──> Thanh toán 100% VietQR (TV4)
          └──> Xác nhận thanh toán & Tạo Booking thành công ──> Điều hướng sang My Stay (TV5)
  ```
- **Ranh giới an ninh bắt buộc (TV4 KHÔNG tự ý sửa):**
  - Schema các bảng: `checkout_sessions`, `bookings`, `vouchers`, `voucher_redemptions`.
  - Database Row Level Security (RLS) policies và Stored Procedures / RPCs.
  - Backend webhook hoặc cơ chế xác thực bảo mật thanh toán.
  - *Nếu phát sinh nhu cầu dữ liệu:* TV4 phối hợp với TV8 (Quỳnh) tạo đề xuất ➔ Hoàng Anh phê duyệt ➔ TV8 tạo migration.

---

### 4.7. TV5 — Chi: My Stay (Kỳ Nghỉ Của Tôi)
- **Branch chuẩn:** `feat/my-stay`
- **Owner:** **Chi**
- **Trạng thái:** `EXISTING / PARTIAL` (Đã có route SSR bảo vệ bằng Auth Guard và placeholder `MyStayClient.tsx`).
- **Phạm vi hiện tại (Current Paths):**
  - `app/my-stay/**` (`page.tsx`, `MyStayClient.tsx`) — *CURRENT PATH*
- **Phạm vi tương lai khuyến nghị (Future / Recommended Paths):**
  - `components/my-stay/**` (`StayCard.tsx`, `WifiCard.tsx`, `DigitalKeyCard.tsx`) — *FUTURE / RECOMMENDED PATH*
  - `lib/data/my-stay.ts` — *FUTURE / RECOMMENDED PATH*
- **Phụ trách chi tiết:**
  - Hiển thị kỳ nghỉ hiện tại của người dùng đang đăng nhập;
  - Tra cứu booking đang có hiệu lực theo tài khoản;
  - Hướng dẫn nhận phòng, địa chỉ homestay, tích hợp bản đồ Google Maps chỉ đường;
  - Hiển thị tên mạng và mật khẩu Wi-Fi của phòng;
  - Giao diện hiển thị mã mở cửa thông minh / Digital Key UI (hiển thị theo thời hạn kỳ nghỉ);
  - Thời gian lưu trú, đồng hồ đếm ngược giờ check-out;
  - Nút bấm trả phòng nhanh 1-click (chuyển trạng thái phòng sang chờ dọn dẹp);
  - Điều hướng sang hướng dẫn phòng (Guest Guide) và gửi yêu cầu hỗ trợ (Tickets).
- **Ranh giới an ninh bắt buộc (TV5 KHÔNG tự ý sửa):**
  - Hạ tầng Auth foundation (`app/auth/**`, `lib/supabase/**`, `proxy.ts`).
  - Cơ chế backend cấp phát chứng chỉ Digital Key.
  - Schema bảng `bookings`, `digital_keys`, hoặc các bảng dữ liệu nội bộ.

---

### 4.8. TV6 — Phương: Guest Guide & Tickets (Hướng Dẫn & Yêu Cầu Hỗ Trợ)
- **Branch chuẩn:** `feat/tickets`
- **Owner:** **Phương**
- **Trạng thái:** `PLANNED` (Chưa triển khai mã nguồn).
- **Phạm vi tương lai khuyến nghị (Future / Recommended Paths):**
  - `components/tickets/**` (`TicketList.tsx`, `TicketDetail.tsx`, `CreateTicketForm.tsx`) — *FUTURE / RECOMMENDED PATH*
  - `components/my-stay/GuestGuide.tsx` — *FUTURE / RECOMMENDED PATH*
  - `components/my-stay/TicketModal.tsx` — *FUTURE / RECOMMENDED PATH*
  - `lib/data/tickets.ts` — *FUTURE / RECOMMENDED PATH*
- **Phụ trách chi tiết:**
  - Cẩm nang hướng dẫn sử dụng thiết bị trong phòng (máy lạnh, máy nước nóng, khóa cửa, v.v.);
  - Giao diện Guest Guide với cẩm nang tiện ích xung quanh;
  - Giao diện gửi báo lỗi / phản ánh sự cố phòng;
  - Giao diện gửi yêu cầu hỗ trợ (thêm khăn tắm, nước uống, đổi giờ dọn phòng);
  - Màn hình theo dõi tiến độ xử lý ticket của khách hàng;
  - Hiển thị trạng thái ticket rõ ràng, thân thiện với khách hàng:
    $$\text{Chờ xử lý} \longrightarrow \text{Đang xử lý} \longrightarrow \text{Đã xong}$$
- **Quy tắc phối hợp:** Khi cần nhúng nút bấm hoặc component vào màn hình `app/my-stay/**`, Phương bắt buộc phải trao đổi và thống nhất với **Chi (TV5)**.

---

### 4.9. TV7 — T Mai: Operations Dashboard (Quản Lý Vận Hành Homestay)
- **Branch chuẩn:** `feat/operations-dashboard`
- **Owner:** **T Mai**
- **Trạng thái:** `PLANNED` (Chưa triển khai mã nguồn; thư mục `app/admin` hiện chưa tồn tại).
- **Phạm vi tương lai khuyến nghị (Future / Recommended Paths):**
  - `app/admin/**` (`page.tsx`, `rooms/page.tsx`, `tickets/page.tsx`) — *FUTURE / RECOMMENDED PATH*
  - `components/admin/**` (`RoomStatusGrid.tsx`, `ArrivalDepartureList.tsx`, `TicketManager.tsx`) — *FUTURE / RECOMMENDED PATH*
  - `lib/data/admin.ts` — *FUTURE / RECOMMENDED PATH*
- **Phụ trách chi tiết:**
  - Giao diện dành riêng cho nhân viên vận hành homestay;
  - Bảng tổng quan trạng thái vận hành các phòng: Có khách, Chờ dọn dẹp, Đang dọn, Sẵn sàng đón khách;
  - Danh sách khách check-in và check-out trong ngày;
  - Bảng tiếp nhận, phân công và xử lý các yêu cầu hỗ trợ / sự cố (Tickets) từ khách;
  - Quy trình cập nhật trạng thái phòng sau khi nhân viên hoàn tất dọn dẹp (Cleaning / Readiness flow).
- **Ranh giới an ninh bắt buộc (TV7 KHÔNG tự ý sửa):**
  - Cơ chế phân quyền Staff / Admin roles, custom claims, hoặc middleware bảo vệ admin route.
  - Chính sách RLS cho nhân viên nội bộ.
  - Schema bảng `room_operations` (được tách rời khỏi bảng `rooms` công khai).
  - Mọi thay đổi bảo mật cần phối hợp với **Quỳnh (TV8)** và được **Hoàng Anh (TV1)** phê duyệt.

---

### 4.10. TV8 — Quỳnh: Database / Backend Data / Supabase Foundation
- **Branch chuẩn:** `NOT A NORMAL FEATURE BRANCH` *(Chỉ tạo branch `chore/...` hoặc `fix/...` theo từng task migration sau khi được duyệt)*.
- **Owner kỹ thuật:** **Quỳnh**
- **Phê duyệt kiến trúc (Approval):** **Hoàng Anh (TV1)**
- **Trạng thái:** 🔴 **FOUNDATION / PROTECTED**
- **Phạm vi bảo vệ hiện tại (Current Protected Paths):**
  - `supabase/migrations/**` — *CURRENT PATH*
  - `supabase/config.toml` — *CURRENT PATH*
  - `supabase/seed.sql` — *CURRENT PATH*
  - `lib/database.types.ts` — *CURRENT PATH*
- **Trách nhiệm kỹ thuật:**
  - Chịu trách nhiệm về thiết kế kiến trúc dữ liệu, tối ưu hóa câu truy vấn, chỉ mục (indexes), và an toàn phân quyền (RLS policies, Data API grants).
  - Hỗ trợ các Feature Owners về mặt dữ liệu:
    - Logic kiểm tra phòng trống và chống đặt trùng phòng (concurrency control);
    - Cơ chế giữ chỗ tạm thời (`checkout_sessions`) và tạo booking nguyên tử;
    - Hạch toán điểm thưởng loyalty và vòng đời sử dụng voucher;
    - Quản lý trạng thái vòng đời ticket và dữ liệu vận hành phòng (`room_operations`);
    - Quản lý an toàn chứng chỉ Digital Key và các dữ liệu nhạy cảm phía máy chủ.
- **Nguyên tắc vận hành:** Quỳnh **KHÔNG** được tự ý thay đổi cơ sở dữ liệu trên Supabase Cloud.
- **Quy trình thay đổi schema bắt buộc:**
  ```text
  Feature Owner phát hiện nhu cầu dữ liệu
    └──> Tạo đề xuất qua Issue / PR Description / RFC (Không sửa trực tiếp docs)
          └──> Quỳnh (TV8) đánh giá kỹ thuật, thiết kế SQL & RLS
                └──> Hoàng Anh (TV1) phê duyệt thiết kế
                      └──> Tạo branch riêng dạng chore/... hoặc fix/...
                            └──> Tạo migration mới có timestamp trên Supabase Local
                                  └──> Kiểm thử kỹ thuật RLS & Grants local
                                        └──> Sinh lại lib/database.types.ts
                                              └──> Review độc lập & Merge vào main
  ```

---

### 4.11. TV9 — Tuấn Anh: Assets / Content / QA Testing
- **Branch chuẩn:** `feat/assets-content`
- **Owner:** **Tuấn Anh** *(Lưu ý: TV9 chính thức là Tuấn Anh, không phải HANH)*
- **Trạng thái:** `PLANNED` (Sẵn sàng tiếp nhận tài nguyên và kiểm thử).
- **Phạm vi hiện tại (Current Paths):**
  - `public/**` (`file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`) — *CURRENT PATH*
- **Phạm vi tương lai khuyến nghị (Future / Recommended Paths):**
  - `public/images/**` (ảnh chụp thật của từng phòng, ảnh thumbnail, ảnh tiện ích) — *FUTURE / RECOMMENDED PATH*
  - `public/videos/**` (video hướng dẫn check-in, hướng dẫn sử dụng thiết bị) — *FUTURE / RECOMMENDED PATH*
  - `content/**` (nội dung tĩnh, cẩm nang hướng dẫn khách) — *FUTURE / RECOMMENDED PATH*
  - `docs/test-cases.*` (kịch bản kiểm thử tính năng) — *FUTURE / RECOMMENDED PATH*
- **Phụ trách chi tiết:**
  - Thu thập, phân loại và chuẩn hóa hình ảnh thực tế của các phòng và homestay;
  - Tối ưu hóa kích thước và định dạng hình ảnh/video nhằm đạt tốc độ tải tối đa;
  - Chuẩn bị nội dung chữ cho Guest Guide, mô tả phòng, hướng dẫn khách;
  - Kiểm thử toàn diện giao diện trên các thiết bị di động thực tế (Mobile Responsive QA);
  - Kiểm thử trải nghiệm và các luồng người dùng (User Journey Testing);
  - Ghi nhận lỗi (bug reports), tạo issue rõ ràng cho các Feature Owners xử lý;
  - Nghiên cứu và hỗ trợ đóng gói ứng dụng PWA sau khi các tính năng cốt lõi ổn định.
- **Ranh giới trách nhiệm (Tuấn Anh KHÔNG can thiệp):** Tuyệt đối không chỉnh sửa mã nguồn nghiệp vụ (business logic), luồng xác thực (Auth), hạ tầng cơ sở dữ liệu (Supabase migrations), hoặc logic thanh toán (Payment).

---

## 5. Ma Trận Phối Hợp Giữa Các Thành Viên (Team Coordination Matrix)

Sự phối hợp giữa các thành viên diễn ra theo các giao diện nghiệp vụ cụ thể sau:

```text
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ 1. TV2 (Thảo) ◄──────────► TV3 (Mai)                                                      │
│    Danh sách phòng ──> Khách chọn phòng ──> Mở trang chi tiết phòng                       │
├───────────────────────────────────────────────────────────────────────────────────────────┤
│ 2. TV3 (Mai) ◄───────────► TV8 (Quỳnh)                                                    │
│    Chọn khoảng ngày ──> Kiểm tra tình trạng phòng trống từ Database                       │
├───────────────────────────────────────────────────────────────────────────────────────────┤
│ 3. TV3 (Mai) ◄───────────► TV4 (linh)                                                     │
│    Phòng và khoảng ngày hợp lệ ──> Chuyển tiếp dữ liệu sang màn hình Checkout             │
├───────────────────────────────────────────────────────────────────────────────────────────┤
│ 4. TV4 (linh) ◄──────────► TV8 (Quỳnh)                                                    │
│    Tạo checkout session, áp voucher, đối soát dữ liệu thanh toán VietQR & tạo Booking     │
├───────────────────────────────────────────────────────────────────────────────────────────┤
│ 5. TV4 (linh) ◄──────────► TV5 (Chi)                                                      │
│    Đặt phòng thành công ──> Điều hướng sang My Stay hiển thị thông tin kỳ nghỉ            │
├───────────────────────────────────────────────────────────────────────────────────────────┤
│ 6. TV5 (Chi) ◄───────────► TV6 (Phương)                                                   │
│    Màn hình My Stay ──> Điểm chạm mở Guest Guide và tạo yêu cầu dịch vụ / báo lỗi         │
├───────────────────────────────────────────────────────────────────────────────────────────┤
│ 7. TV6 (Phương) ◄────────► TV7 (T Mai)                                                    │
│    Khách gửi yêu cầu / báo lỗi ──> Nhân viên tiếp nhận và cập nhật tiến độ trên Dashboard │
├───────────────────────────────────────────────────────────────────────────────────────────┤
│ 8. TV2, TV3, TV5, TV6 ◄──► TV9 (Tuấn Anh)                                                 │
│    Cung cấp và tích hợp hình ảnh tối ưu, video hướng dẫn, nội dung văn bản chuẩn mực      │
├───────────────────────────────────────────────────────────────────────────────────────────┤
│ 9. TV3, TV4, TV5, TV6, TV7 ◄► TV8 (Quỳnh)                                                 │
│    Đề xuất nhu cầu dữ liệu, truy vấn backend, bảo mật RLS và tối ưu bảng cơ sở dữ liệu    │
├───────────────────────────────────────────────────────────────────────────────────────────┤
│ 10. TẤT CẢ THÀNH VIÊN ◄──► TV1 (Hoàng Anh)                                                │
│     Phối hợp sửa shared files, bảo vệ protected files, review PR, lint, build & merge    │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Quy Tắc Xử Lý Phụ Thuộc Chéo Giữa Các Feature (Cross-Feature Dependency Rules)

Khi thành viên A cần một thay đổi nằm trong file thuộc sở hữu của thành viên B, bắt buộc tuân theo quy trình 6 bước:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ 1. DỪNG LẠI (Không tự ý sửa file của thành viên khác)                  │
│    Tuyệt đối không sửa chui trong branch của mình.                     │
├────────────────────────────────────────────────────────────────────────┤
│ 2. THÔNG BÁO CHO FEATURE OWNER PHỤ TRÁCH                              │
│    Trao đổi rõ nhu cầu: cần prop gì, entry point ở đâu, dữ liệu gì.    │
├────────────────────────────────────────────────────────────────────────┤
│ 3. THỐNG NHẤT PHƯƠNG ÁN & PHÂN CÔNG                                    │
│    Thống nhất ai là người thực hiện: Owner B tự mở rộng interface,    │
│    hay Owner A tạo PR nhắm vào branch của Owner B để review.           │
├────────────────────────────────────────────────────────────────────────┤
│ 4. TẠO ĐỀ XUẤT NẾU THAY ĐỔI SHARED / DB CONTRACT                       │
│    Nếu đụng đến schema dữ liệu chung, tạo đề xuất RFC/Issue trước.     │
├────────────────────────────────────────────────────────────────────────┤
│ 5. GIỮ PULL REQUEST NHỎ & TẬP TRUNG                                   │
│    Tách phần mở rộng dùng chung thành 1 PR riêng biệt nhỏ gọn.         │
├────────────────────────────────────────────────────────────────────────┤
│ 6. NÊU RÕ CROSS-FEATURE DEPENDENCY TRONG MÔ TẢ PR                      │
│    Tag thành viên liên quan vào PR và yêu cầu cùng tham gia duyệt code.│
└────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Mô Hình Luồng Phân Nhánh Nhóm (Example Team Workflow)

Mỗi feature branch hoạt động hoàn toàn độc lập tách ra từ bản `main` mới nhất:

```text
                     [ feat/room-catalog ] ──── (TV2 Thảo) ─────────┐
                    /                                                │
                   /─── [ feat/room-detail ] ───── (TV3 Mai) ────────┤
                  /                                                  │
                 /───── [ feat/booking-checkout ]  (TV4 linh) ───────┤
                /                                                    │
main (v1.0.0) ─┼─────── [ feat/my-stay ] ───────── (TV5 Chi) ────────┼──> [ PR Review (TV1) ] ──> main
                \                                                    │
                 \───── [ feat/tickets ] ───────── (TV6 Phương) ─────┤
                  \                                                  │
                   \─── [ feat/operations-dashboard ] (TV7 T Mai) ───┤
                    \                                                │
                     \─ [ feat/assets-content ] ── (TV9 Tuấn Anh) ───┘
```

### Cách đồng bộ mã nguồn mới nhất từ `main`:
Khi nhánh `main` có cập nhật mới từ đồng đội đã được TV1 merge, các thành viên cập nhật branch của mình như sau:

```bash
# Bước 1: Kéo commit mới nhất về local main
git checkout main
git pull origin main

# Bước 2: Chuyển về nhánh tính năng cá nhân
git checkout feat/<your-feature-name>

# Bước 3: Đồng bộ mã nguồn (chọn 1 cách theo thống nhất của nhóm)
git rebase main    # Cách 1: Tuyến tính, sạch lịch sử commit (khuyến nghị)
# HOẶC
git merge main     # Cách 2: Lưu lại merge commit
```

---

## 8. Bảng Kiểm Tra Bắt Đầu Một Feature (Starting a Feature Checklist)

Trước khi viết bất kỳ dòng code nào, mỗi thành viên phải tự kiểm tra:

- [ ] **Pull latest `main`:** Đã kéo commit mới nhất của nhánh `main` về máy local chưa?
- [ ] **Đọc `AGENTS.md`:** Đã nắm rõ các giới hạn sản phẩm (Không AI room recommendation, Google Login mandatory, v.v.)?
- [ ] **Đọc `docs/TEAM_FILE_OWNERSHIP.md`:** Đã xác định rõ mức độ phân quyền của các file dự kiến chạm vào?
- [ ] **Đọc `docs/FEATURE_OWNERS.md`:** Đã xác định đúng tên branch chuẩn và phạm vi sở hữu của mình?
- [ ] **Tạo đúng branch:** Nhánh đã được tạo đúng tiền tố `feat/<feature-name>` chưa?
- [ ] **Xác nhận phạm vi feature:** Các file định tạo mới hoặc sửa có nằm trong đúng thư mục được phân công không?
- [ ] **Kiểm tra file Protected:** Có file nào thuộc Auth / Supabase / DB Migrations / Config không? (Nếu có: **DỪNG LẠI**, xin phê duyệt từ TV1/TV8).
- [ ] **Kiểm tra phụ thuộc chéo:** Có chạm vào file của thành viên khác không? (Nếu có: liên hệ Feature Owner liên quan trước).

---

## 9. Bảng Kiểm Tra Hoàn Thành & Tạo PR (Finishing a Feature Checklist)

Trước khi mở Pull Request để TV1 (Hoàng Anh) review:

- [ ] **Mã nguồn đúng phạm vi:** 100% file thay đổi nằm đúng trong thư mục Feature-Owned của thành viên phụ trách.
- [ ] **Shared files được ghi chú rõ:** Mọi thay đổi trong `components/ui/`, `app/layout.tsx`, `globals.css` được giải trình chi tiết trong PR.
- [ ] **Không xâm phạm Protected files:** Không có bất kỳ thay đổi trái phép nào trong `lib/supabase/`, `proxy.ts`, `app/auth/`, `supabase/migrations/`, `package.json`.
- [ ] **Lint kiểm tra thành công:** Đã chạy `npm run lint` và vượt qua không có lỗi (`PASS`).
- [ ] **Build kiểm tra thành công:** Đã chạy `npm run build` và biên dịch ứng dụng thành công (`PASS`).
- [ ] **Đồng bộ `main` mới nhất:** Đã rebase hoặc merge bản mới nhất của `main` và giải quyết dứt điểm các xung đột phát sinh.
- [ ] **Mở PR đầy đủ thông tin:** Tạo PR với tiêu đề rõ ràng, mô tả mục đích, ảnh chụp màn hình UI (nếu có), và checklist kiểm thử.
- [ ] **Chờ TV1 (Hoàng Anh) Review:** Chờ TV1 kiểm tra và phê duyệt.
- [ ] **Không tự ý merge (No self-merge):** Tuyệt đối không tự bấm merge PR của chính mình.
