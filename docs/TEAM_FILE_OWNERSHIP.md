# Hướng Dẫn Phân Quyền File & Quy Chuẩn Làm Việc Nhóm
## Kapi Stay Concierge — Team File Ownership Guide

Tài liệu này xác định ranh giới trách nhiệm, quyền hạn chỉnh sửa file/folder, quy chuẩn phân nhánh (branching), quy trình Pull Request (PR) và các biện pháp tránh xung đột mã nguồn (merge conflict) cho tất cả kỹ sư và AI coding agents tham gia phát triển dự án **Kapi Stay Concierge**.

---

## 1. Nguyên Tắc Cốt Lõi (Core Team Rules)

Mọi thành viên trong team và mọi AI coding agent bắt buộc tuân thủ 8 nguyên tắc bất di bất dịch sau:

1. **Không bao giờ code trực tiếp trên nhánh `main`:** Nhánh `main` luôn ở trạng thái sẵn sàng deploy (production-ready). Mọi commit trực tiếp vào `main` đều bị cấm.
2. **Một feature / bugfix = Một branch riêng:** Luôn checkout branch mới từ bản `main` mới nhất trước khi bắt đầu công việc.
3. **Phạm vi code khép kín (Strict Scope):** Chỉ tạo mới hoặc chỉnh sửa các file thuộc phạm vi chức năng (feature) mình được phân công. Tuyệt đối không "tiện tay" refactor, format lại hoặc đổi tên file của module khác.
4. **Báo trước khi chạm vào Shared Foundation:** Nếu công việc yêu cầu sửa đổi component dùng chung, layout tổng hoặc utils, bắt buộc phải thông báo và phối hợp với team.
5. **Cấm tự ý sửa Protected Area:** Các file thuộc nhóm Protected (Auth, Supabase client/proxy, Database migrations, Database types, Package/Build config, Architecture docs) bắt buộc phải có sự phê duyệt của Tech Lead / Main Maintainer.
6. **Mọi thay đổi vào `main` phải qua Pull Request (PR):** Phải có ít nhất 1 thành viên review và phê duyệt (Approve) trước khi merge. Không tự ý merge PR của chính mình khi chưa có review.
7. **Bảo mật tuyệt đối (Zero Secrets in Git):** Không bao giờ commit file `.env.local`, API keys, `service_role` key, hoặc Google Client Secret lên repository.
8. **Không xóa / đổi tên file tùy tiện:** Việc đổi tên hoặc xóa bất kỳ file nào có thể làm gãy các import hoặc route của thành viên khác đang làm việc song song.

---

## 2. Quy Định Bắt Buộc Đối Với AI Coding Agents

Các công cụ hỗ trợ lập trình bằng trí tuệ nhân tạo (AI Coding Agents như Antigravity, Codex, Claude Code, GitHub Copilot, v.v.) khi làm việc trong repository **bắt buộc tuân thủ đúng các ranh giới phân quyền như kỹ sư con người**:

* **Kiểm tra phạm vi task trước khi sửa:** AI agent phải đọc kỹ yêu cầu của task và đối chiếu với tài liệu này (`docs/TEAM_FILE_OWNERSHIP.md`).
* **Không "tiện tay" sửa file Protected:** Tuyệt đối KHÔNG được tự ý chỉnh sửa các file thuộc nhóm 🔴 **PROTECTED** chỉ vì làm như vậy sẽ tiện hơn hoặc nhanh hơn cho việc hoàn thành prompt.
* **Dừng lại và báo cáo khi gặp rào cản:** Nếu việc giải quyết task bắt buộc phải thay đổi một file 🔴 **PROTECTED** (ví dụ: cần thêm bảng trong DB, cần sửa logic auth proxy, cần cài package mới), AI agent phải **DỪNG LẠI (STOP)** và tạo báo cáo/đề xuất giải pháp để Tech Lead hoặc Maintainer con người phê duyệt trước.

---

## 3. Quy Tắc Ưu Tiên Phân Quyền (Ownership Priority Rule)

Khi xác định quyền hạn của một file hoặc thư mục, áp dụng thứ tự ưu tiên nghiêm ngặt sau:

$$\mathbf{🔴\ PROTECTED\ >\ 🟡\ SHARED\ >\ 🟢\ FEATURE\ OWNED}$$

> **Nguyên tắc vàng:** Nếu một file hoặc thư mục khớp với bất kỳ tiêu chí nào của 🔴 **PROTECTED**, thì trạng thái **PROTECTED luôn luôn thắng**. File đó không bao giờ được coi là Feature-Owned hay Shared thông thường.

---

## 4. Chi Tiết Ba Cấp Độ Phân Quyền

```
┌──────────────────────────────────────────────────────────────────┐
│  🔴 PROTECTED — APPROVAL REQUIRED (Bảo vệ nghiêm ngặt)           │
│  Auth, Supabase clients, proxy.ts, database.types.ts,            │
│  supabase/migrations/, package.json, configs, architecture docs  │
├──────────────────────────────────────────────────────────────────┤
│  🟡 SHARED — COORDINATE (Nền tảng dùng chung — Cần phối hợp)    │
│  components/ui/, app/layout.tsx, app/page.tsx, app/globals.css, │
│  lib/utils/, public/                                             │
├──────────────────────────────────────────────────────────────────┤
│  🟢 FEATURE-OWNED (Toàn quyền trong phạm vi tính năng)          │
│  app/rooms/, components/rooms/, lib/data/rooms.ts,               │
│  app/my-stay/, feature-specific docs                             │
└──────────────────────────────────────────────────────────────────┘
```

---

### 🔴 CẤP ĐỘ 1: PROTECTED — APPROVAL REQUIRED (Bắt buộc Tech Lead phê duyệt)

Đây là các thành phần rủi ro cao, liên quan đến an ninh, cơ sở dữ liệu, kiến trúc cốt lõi hoặc phiên làm việc của toàn bộ hệ thống. **Thành viên bình thường và AI agent không được tự ý sửa đổi**.

#### 1. Nền Tảng Xác Thực & Phiên Làm Việc (Auth Foundation)
* **Đường dẫn:**
  - `app/login/**` (Trang đăng nhập Google)
  - `app/auth/**` (`callback/route.ts`, `error/page.tsx`, `signout/route.ts`)
  - `components/auth/**` (`GoogleSignInButton.tsx`, `AuthNav.tsx`)
  - `lib/auth/**` (`redirect.ts`, `booking-gate.ts`)
* **Lý do bảo vệ:** Kapi Stay Concierge đã hoàn tất kiểm thử và vận hành ổn định hệ thống đăng nhập Google OAuth + SSR session cookies + đồng bộ profiles. Việc sửa đổi tùy tiện sẽ làm tê liệt quy trình đăng nhập và bảo vệ route toàn ứng dụng.
* **Quy tắc cho Feature Devs:** Chỉ **tái sử dụng** các helper có sẵn (ví dụ: `requireBookingAuth()`, `AuthNav`, session cookies). Tuyệt đối **KHÔNG** tự tạo flow đăng nhập riêng, không sửa logic callback hay signout.

#### 2. Supabase Client Factories & Session Proxy
* **Đường dẫn:**
  - `lib/supabase/**` (`client.ts`, `server.ts`, `proxy.ts`)
  - `proxy.ts` (Next.js 16 Proxy router)
* **Lý do bảo vệ:** Điều khiển trực tiếp cách client và server khởi tạo kết nối Supabase, xử lý cookies, làm mới phiên (token refresh), và kiểm tra quyền truy cập route bằng `getClaims()`. Sửa lỗi tại đây có thể dẫn đến vòng lặp chuyển hướng (redirect loop) hoặc mất phiên người dùng trên diện rộng.

#### 3. Database Generated Types
* **Đường dẫn:** `lib/database.types.ts`
* **Quy tắc:** Đây là file sinh tự động phản ánh schema PostgreSQL từ CLI (`npx supabase gen types typescript --local > lib/database.types.ts`). **CẤM SỬA TAY**. Chỉ sinh lại sau khi một migration mới đã được Tech Lead phê duyệt và chạy thành công trên DB local.

#### 4. Cơ Sở Dữ Liệu & Migrations
* **Đường dẫn:**
  - `supabase/migrations/**`
  - `supabase/config.toml`
  - `supabase/seed.sql`
* **Quy tắc bất di bất dịch:**
  - **CẤM SỬA** các file migration cũ đã tồn tại (`20260917045810_initial_kapi_schema.sql`, `20260917045919_add_missing_fk_indexes.sql`).
  - **CẤM TỰ Ý TẠO** migration mới mà chưa được duyệt schema trong `docs/SUPABASE_SCHEMA_DESIGN.md`.
  - **CẤM CHẠY** `supabase db push` hoặc can thiệp trực tiếp vào Supabase Cloud database.
  - **CẤM SEED** dữ liệu phát triển lên Supabase Cloud.
  - **CẤM TỰ Ý SỬA** chính sách Row Level Security (RLS) hoặc phân quyền GRANT.

#### 5. Tài Liệu Hợp Đồng Kiến Trúc (Architecture & DB Contracts)
* **Đường dẫn:**
  - `docs/PROJECT_GUIDE.md` (Nguồn chân lý nghiệp vụ - Single Source of Truth)
  - `docs/ARCHITECTURE.md` (Kiến trúc kỹ thuật CURRENT vs TARGET)
  - `docs/SUPABASE_SCHEMA_DESIGN.md` (Thiết kế schema database)
  - `docs/SUPABASE_IMPLEMENTATION.md` (Trạng thái triển khai thực tế)
  - `AGENTS.md`, `CLAUDE.md`
* **Quy tắc:** Chỉ cập nhật khi có quyết định kiến trúc chính thức từ Stakeholder / Tech Lead.

#### 6. Cấu Hình Build & Quản Lý Thư Viện (Dependencies & Config)
* **Đường dẫn:**
  - `package.json`, `package-lock.json`
  - `next.config.ts`, `tsconfig.json`
  - `eslint.config.mjs`, `postcss.config.mjs`
  - `.env.example`, `.gitignore`
* **Quy tắc:** Cấm tự ý `npm install` hoặc nâng cấp thư viện. Bất kỳ thay đổi dependency nào phải được nêu rõ lý do và tách thành PR riêng có phê duyệt.

---

### 🟡 CẤP ĐỘ 2: SHARED — COORDINATE (Nền tảng dùng chung — Cần phối hợp)

Các file này phục vụ nhiều tính năng cùng lúc. Mọi thành viên đều có thể sử dụng (import). Khi cần chỉnh sửa, phải đảm bảo **tương thích ngược 100% (Backward Compatibility)** và trao đổi trước với team.

#### Danh sách & Quy tắc Level B:
| Đường dẫn | Mô tả | Quy tắc chỉnh sửa |
|---|---|---|
| `components/ui/**` | Shared UI primitives: `Button.tsx`, `Input.tsx`, `Modal.tsx`, `Badge.tsx`, `index.ts` | **Chỉ mở rộng, không phá vỡ:** Thêm prop/variant mới nếu cần, tuyệt đối không xóa hoặc đổi kiểu dữ liệu của prop cũ đang có màn hình khác dùng. |
| `app/layout.tsx` | Root layout, font, metadata, Header & Footer chung | Báo trước cho team khi cần thêm link trên thanh điều hướng hoặc chèn global provider. |
| `app/page.tsx` | Trang chủ (Homepage) | Chứa các khối giới thiệu chung. Thay đổi CTA hoặc nội dung cần thống nhất với team. |
| `app/globals.css` | Design tokens, biến màu, CSS toàn cục | Không ghi đè các class cơ sở làm vỡ layout của các feature khác. |
| `lib/utils/**`, `lib/utils.ts` | Utilities dùng chung: `cn()`, `formatVND()`... | Viết unit test hoặc kiểm tra kỹ; hàm utils phải là pure function, không gây side-effect. |
| `public/**` | File tĩnh, vector icon dùng chung | Đặt tên file rõ ràng, không chứa ký tự lạ; không đưa ảnh rác không dùng vào repo. |

---

### 🟢 CẤP ĐỘ 3: FEATURE-OWNED (Toàn quyền trong phạm vi tính năng)

Thành viên được giao phụ trách module nào có toàn quyền tạo mới, chỉnh sửa logic, cập nhật UI và tái cấu trúc nội bộ trong phạm vi module đó.

#### Các module hiện có và quy ước mở rộng:
1. **Room Catalog (Danh mục & Chi tiết phòng):**
   - `app/rooms/**` (`page.tsx`, `loading.tsx`, `[id]/page.tsx`, `[id]/loading.tsx`, `[id]/not-found.tsx`)
   - `components/rooms/**` (`RoomCard.tsx`, `RoomBookingWidget.tsx`)
   - `lib/data/rooms.ts` (Data access layer của Room Catalog)
   - `docs/ROOM_CATALOG_DATA_REVIEW.md` (Tài liệu chuyên biệt của feature Room Catalog)

2. **My Stay (Kỳ nghỉ của tôi):**
   - `app/my-stay/**` (`page.tsx`, `MyStayClient.tsx`)
   - `components/my-stay/**` *(Đường dẫn tính năng tương lai / quy ước khuyến nghị)*
   - `lib/data/my-stay.ts` *(Đường dẫn tính năng tương lai / quy ước khuyến nghị)*

3. **Checkout / Booking Flow (Đặt phòng — Giai đoạn tiếp theo):**
   - `app/checkout/**` *(Đường dẫn tính năng tương lai / quy ước khuyến nghị)*
   - `components/checkout/**` *(Đường dẫn tính năng tương lai / quy ước khuyến nghị)*
   - `lib/data/checkout.ts` *(Đường dẫn tính năng tương lai / quy ước khuyến nghị)*

4. **Operations / Admin Dashboard (Quản trị vận hành — Giai đoạn tiếp theo):**
   - `app/admin/**` *(Đường dẫn tính năng tương lai / quy ước khuyến nghị)*
   - `components/admin/**` *(Đường dẫn tính năng tương lai / quy ước khuyến nghị)*
   - `lib/data/admin.ts` *(Đường dẫn tính năng tương lai / quy ước khuyến nghị)*

> **Lưu ý:** Các đường dẫn được ghi chú *"Đường dẫn tính năng tương lai / quy ước khuyến nghị"* hiện chưa được tạo trong repository. Khi triển khai tính năng mới, thành viên phụ trách phải tuân thủ đúng cấu trúc thư mục quy chuẩn này.

---

## 5. Bảng Ma Trận Phân Quyền Tổng Hợp (Ownership Table)

Bảng tra cứu nhanh bắt buộc áp dụng cho toàn bộ dự án:

| Khu vực / Area | Đường dẫn cụ thể / Paths | Trạng thái / Status | Quy định thao tác / Rule |
|---|---|---|---|
| **Room Catalog** | `app/rooms/**`<br>`components/rooms/**`<br>`lib/data/rooms.ts`<br>`docs/ROOM_CATALOG_DATA_REVIEW.md` | 🟢 **FEATURE OWNED** | Toàn quyền chỉnh sửa trong phạm vi Room Catalog. Tái sử dụng `components/ui/` và `lib/supabase/server.ts`. |
| **My Stay** | `app/my-stay/**`<br>`components/my-stay/**` *(future)*<br>`lib/data/my-stay.ts` *(future)* | 🟢 **FEATURE OWNED** | Toàn quyền chỉnh sửa trong phạm vi My Stay. Giữ nguyên server auth guard đã được thiết lập. |
| **Future Features**<br>*(Checkout, Admin)* | `app/checkout/**` *(future)*<br>`app/admin/**` *(future)*<br>`lib/data/{feature}.ts` *(future)* | 🟢 **FEATURE OWNED**<br>*(Future convention)* | Tuân thủ quy chuẩn cấu trúc khi tạo mới. Không can thiệp sang feature khác. |
| **Shared UI Primitives** | `components/ui/**` (`Button`, `Input`, `Modal`, `Badge`, `index.ts`) | 🟡 **SHARED — COORDINATE** | Tái sử dụng tối đa. Chỉ mở rộng prop mới khi thật sự cần. Bảo đảm tương thích ngược 100%. |
| **Root Layout & Home** | `app/layout.tsx`<br>`app/page.tsx`<br>`app/globals.css` | 🟡 **SHARED — COORDINATE** | Trao đổi trước khi chỉnh sửa Header, Footer hoặc biến CSS toàn cục. Nêu rõ trong mô tả PR. |
| **Shared Utilities** | `lib/utils/**`<br>`lib/utils.ts` | 🟡 **SHARED — COORDINATE** | Các hàm định dạng (`formatVND`), hàm gộp class (`cn`). Viết hàm thuần túy (pure), không side-effect. |
| **Public Assets** | `public/**` | 🟡 **SHARED — COORDINATE** | Chỉ thêm asset ảnh/vector chuẩn. Không đẩy ảnh rác hoặc file nhạy cảm vào. |
| **Xác thực (Auth Foundation)** | `app/login/**`<br>`app/auth/**`<br>`components/auth/**`<br>`lib/auth/**` | 🔴 **PROTECTED — APPROVAL REQUIRED** | **CẤM TỰ Ý SỬA**. Đã hoàn thiện và kiểm thử. Chỉ tái sử dụng `requireBookingAuth`, `AuthNav`, session cookies. |
| **Supabase Core & Session** | `lib/supabase/**`<br>`proxy.ts` | 🔴 **PROTECTED — APPROVAL REQUIRED** | **CẤM TỰ Ý SỬA**. Điều khiển kết nối DB, cookies, session refresh và an ninh router toàn site. |
| **Database Migrations & Config** | `supabase/migrations/**`<br>`supabase/config.toml`<br>`supabase/seed.sql` | 🔴 **PROTECTED — APPROVAL REQUIRED** | **CẤM TỰ Ý SỬA/TẠO**. Cấm sửa migration cũ, cấm `db push` cloud, cấm sửa RLS nếu chưa duyệt RFC schema. |
| **Generated DB Types** | `lib/database.types.ts` | 🔴 **PROTECTED / GENERATED FILE** | **CẤM SỬA TAY**. Chỉ sinh tự động từ CLI Supabase sau khi migration mới được duyệt và chạy local pass. |
| **Tài liệu Kiến trúc Chuẩn** | `docs/PROJECT_GUIDE.md`<br>`docs/ARCHITECTURE.md`<br>`docs/SUPABASE_SCHEMA_DESIGN.md`<br>`docs/SUPABASE_IMPLEMENTATION.md`<br>`AGENTS.md`, `CLAUDE.md` | 🔴 **PROTECTED — APPROVAL REQUIRED** | **CẤM TỰ Ý SỬA**. Đây là các hợp đồng kiến trúc chuẩn (Single Source of Truth) của toàn bộ dự án. |
| **Build & Dependency Config** | `package.json`, `package-lock.json`<br>`next.config.ts`, `tsconfig.json`<br>`eslint.config.mjs`, `postcss.config.mjs`<br>`.env.example`, `.gitignore` | 🔴 **PROTECTED — APPROVAL REQUIRED** | **CẤM TỰ Ý CÀI PACKAGE HOẶC ĐỔI RULES BUILD**. Mọi thay đổi dependency phải có phê duyệt của Tech Lead. |

---

## 6. Quy Trình Phân Nhánh Git & Pull Request (Git Workflow)

### 6.1. Quy ước đặt tên nhánh (Branch Naming)
Mọi branch đều phải có tiền tố rõ ràng phản ánh mục đích:

* `feat/<tên-ngắn-gọn>`: Tính năng mới. (Ví dụ: `feat/room-filter`, `feat/voucher-card`)
* `fix/<tên-lỗi>`: Sửa lỗi. (Ví dụ: `fix/login-redirect-loop`, `fix/price-display`)
* `docs/<nội-dung>`: Bổ sung tài liệu. (Ví dụ: `docs/api-specs`, `docs/setup-guide`)
* `refactor/<tên-module>`: Tối ưu cấu trúc code trong phạm vi cho phép. (Ví dụ: `refactor/room-card`)

> **Quy tắc:** Dùng chữ thường, cách nhau bằng dấu gạch ngang `-`. Không đặt tên cá nhân chung chung như `feat/nam`, `fix/tuan`.

---

### 6.2. Vòng đời của một Task (Step-by-Step)

#### Bước 1: Cập nhật `main` mới nhất
```bash
git checkout main
git pull origin main
```

#### Bước 2: Tạo branch tính năng
```bash
git checkout -b feat/room-detail-gallery
```

#### Bước 3: Viết mã trong vùng Level A của mình
- Tái sử dụng các primitive ở `components/ui/` và data fetcher ở `lib/data/`.
- Nếu phát hiện thiếu một tiện ích dùng chung ở Level B, trao đổi với đồng đội trước khi thêm.

#### Bước 4: Kiểm tra nghiêm ngặt tại local
Trước khi tạo commit, bắt buộc chạy:
```bash
# 1. Kiểm tra linter (bắt buộc 0 error, 0 warning)
npm run lint

# 2. Kiểm tra biên dịch TypeScript và Next.js build
npm run build
```
Nếu có lỗi linter hoặc build gãy, **phải sửa hết trước khi commit**.

#### Bước 5: Soát lại diff trước khi commit
```bash
# Xem danh sách file đã chạm vào:
git status --short

# Xem chi tiết từng dòng code đã sửa:
git diff
```
*Tự kiểm tra:* "Mình có vô tình sửa file nào ngoài phạm vi tính năng này không? Có để lọt file Level C không? Có lọt secret hay file rác không?"

#### Bước 6: Commit và Push
```bash
git add <các-file-thuộc-scope>
git commit -m "feat(rooms): add responsive image gallery for room detail"
git push origin feat/room-detail-gallery
```

#### Bước 7: Tạo Pull Request (PR)
- Tiêu đề PR rõ ràng theo định dạng Conventional Commits: `feat(rooms): ...`, `fix(auth): ...`.
- Điền đầy đủ mô tả:
  - Mục tiêu của PR là gì?
  - Các màn hình/file đã thay đổi?
  - Hướng dẫn test thực tế?
- Gắn nhãn (Label) và chỉ định ít nhất 1 Reviewer.

---

## 7. Cách Tránh Đụng Code & Xử Lý Merge Conflict

### 7.1. Phòng ngừa xung đột (Conflict Prevention)

1. **Giao tiếp chủ động (Communication First):**
   Nếu bạn chuẩn bị sửa `app/layout.tsx` hay `components/ui/Button.tsx`, hãy nhắn thông báo trên kênh trao đổi của team:
   > *"Mọi người ơi, mình chuẩn bị thêm prop `iconPosition` vào `Button.tsx`, dự kiến mở PR trong chiều nay nhé."*

2. **Chia nhỏ PR (Small & Atomic PRs):**
   - PR lý tưởng có dung lượng dưới **300 dòng code**.
   - Đừng gộp nhiều tính năng khác nhau vào một PR khổng lồ 2000 dòng. PR lớn vừa khó review vừa có tỷ lệ conflict cao.

3. **Rebase thường xuyên:**
   Trong lúc đang code, nếu `main` đã có PR của đồng đội merge vào, hãy rebase ngay vào branch của mình:
   ```bash
   git fetch origin
   git rebase origin/main
   ```
   Xử lý xung đột nhỏ ngay khi nó mới phát sinh dễ hơn rất nhiều so với dồn lại sau một thời gian dài.

### 7.2. Nguyên tắc khi giải quyết xung đột (Resolving Conflicts)

Khi xảy ra merge conflict:
- **KHÔNG ĐOÁN:** Nếu conflict rơi vào file Level B/C hoặc code của đồng nghiệp, hãy gọi người đó cùng ngồi xem xét (Pairing).
- **Tuyệt đối không dùng cờ `--force` hoặc xóa code của người khác:** Việc xóa code của đồng đội để PR của mình pass là điều tối kỵ.
- Sau khi giải quyết xong conflict, bắt buộc chạy lại `npm run lint` và `npm run build` để chắc chắn mã nguồn không bị lỗi cú pháp.

---

## 8. Bảng Tóm Tắt Tình Huống Thường Gặp (Cheat Sheet)

| Tình huống bạn gặp | Hành động đúng quy chuẩn |
|---|---|
| **Cần thêm một nút bấm có style mới lạ** | Xem `components/ui/Button.tsx`. Nếu prop variant sẵn có đáp ứng được thì dùng ngay. Nếu cần thêm variant, hỏi team rồi mở rộng `buttonVariants`. |
| **Cần cài thêm icon pack hoặc thư viện ngày tháng** | **DỪNG LẠI**. Xem icon pack hiện tại (`lucide-react`) và hàm `Intl` có sẵn của JavaScript. Không chạy `npm install` nếu chưa được Tech Lead phê duyệt. |
| **Phát hiện bug ở module của người khác** | Tạo issue hoặc nhắn cho người phụ trách module đó. Tránh tự ý sửa đè vào branch của họ. |
| **Cần trường mới trong Database (ví dụ `rooms.bed_type`)** | **DỪNG LẠI**. Đề xuất thảo luận tại `docs/SUPABASE_SCHEMA_DESIGN.md`. Không tự ý tạo file `.sql` trong `supabase/migrations/`. |
| **Cần kiểm tra trạng thái đăng nhập cho trang mới** | Tái sử dụng `requireBookingAuth()` từ `@/lib/auth/booking-gate` hoặc `createClient()` từ `@/lib/supabase/server`. **CẤM** tự viết lại logic session/proxy. |
| **Chạy dev bị lỗi font hoặc thiếu biến môi trường** | Kiểm tra file `.env.local` của mình đã copy đủ từ `.env.example` chưa. Không commit file `.env.local` lên Git. |

---

## 9. Checklist Kiểm Tra Trước Khi Mở PR (Pre-PR Checklist)

Hãy tự đánh dấu kiểm tra danh sách này trước khi nhấn nút "Create Pull Request":

- [ ] Branch được tạo từ `main` mới nhất (`git checkout -b feat/...`).
- [ ] Chỉ sửa các file thuộc phạm vi tính năng được giao (Level A).
- [ ] Nếu có sửa Level B (Shared), đã thông báo cho team và bảo đảm không làm gãy code cũ (backward-compatible).
- [ ] Tuyệt đối **không chạm vào file Level C (Protected)**: không sửa Auth core, Supabase factories, proxy, migrations, types, package.json, configs, architecture docs.
- [ ] Đã chạy `npm run lint` tại local và kết quả **0 error, 0 warning**.
- [ ] Đã chạy `npm run build` tại local và ứng dụng build thành công với Turbopack.
- [ ] Đã kiểm tra `git status --short` và `git diff` để đảm bảo không có file rác (`.DS_Store`, `.tsbuildinfo`, `.env.local`).
- [ ] Không có secret, token, service role key hay mật khẩu xuất hiện trong code.
- [ ] Đã viết mô tả PR rõ ràng, dễ hiểu cho người review.
