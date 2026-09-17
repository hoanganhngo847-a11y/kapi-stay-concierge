# Supabase Database & SSR Authentication Implementation

This document describes the physical Supabase database schema (Phase 1), Next.js SSR + Google Authentication integration (Phase 2), and Public Room Catalog Integration (Phase 3) for **Kapi Stay Concierge**.

---

## 1. Authoritative Migration and Project Structure

Database schema versioning is managed strictly via Supabase migrations. The local migration history matches the verified Supabase Cloud project history:

```text
supabase/
├── config.toml
├── migrations/
│   ├── 20260917045810_initial_kapi_schema.sql
│   └── 20260917045919_add_missing_fk_indexes.sql
└── seed.sql
```

- **Initial Migration:** [`supabase/migrations/20260917045810_initial_kapi_schema.sql`](file:///Users/hoangthuy/kapi-stay-concierge-main/supabase/migrations/20260917045810_initial_kapi_schema.sql)
- **Foreign Key Indexes Migration:** [`supabase/migrations/20260917045919_add_missing_fk_indexes.sql`](file:///Users/hoangthuy/kapi-stay-concierge-main/supabase/migrations/20260917045919_add_missing_fk_indexes.sql)
- **Local Seed Data:** [`supabase/seed.sql`](file:///Users/hoangthuy/kapi-stay-concierge-main/supabase/seed.sql)
- **Generated Types:** [`lib/database.types.ts`](file:///Users/hoangthuy/kapi-stay-concierge-main/lib/database.types.ts) (generated directly from the local PostgreSQL schema)
- **Environment Template:** [`.env.example`](file:///Users/hoangthuy/kapi-stay-concierge-main/.env.example)

---

## 2. Implemented Tables (13 Application Tables)

All 13 tables approved in `docs/SUPABASE_SCHEMA_DESIGN.md` are implemented in `public`:

1. **`profiles`**: Application profile 1-to-1 with `auth.users(id)`. Uses `ON DELETE RESTRICT` to protect audit and financial history.
2. **`properties`**: Kapi House locations (Da Lat branches) with unique slugs and active flags.
3. **`rooms`**: Safe public room catalog. Strictly contains public attributes (pricing, capacity, amenities, images). Operational readiness and access credentials are kept out of this table.
4. **`room_operations`**: Staff-facing housekeeping and readiness tracking (`ready`, `occupied`, etc.). Separated from public catalog; public/guest access is denied by default.
5. **`room_private_details`**: Sensitive property infrastructure (Wi-Fi SSID, Wi-Fi password, private room instructions). 1-to-1 with `rooms`. Public access denied; stay-window access enforced.
6. **`checkout_sessions`**: Ephemeral checkout and payment intent state prior to confirmed booking. Stores snapshot amounts. Does NOT store circular voucher references.
7. **`bookings`**: Durable, confirmed reservations created strictly upon verified 100% full payment. No deposits or partial payments. Enforces non-overlapping room stays via GiST exclusion constraint (`btree_gist`).
8. **`booking_access_credentials`**: Booking-scoped Digital Key / door access credentials bounded to stay window `[valid_from, valid_until]`.
9. **`tickets`**: Incident and service requests tied to an authenticated guest's confirmed booking and room.
10. **`daily_checkins`**: Daily check-in rewards (+5 points) with unique constraint on `(user_id, checkin_date)` governed by `Asia/Ho_Chi_Minh` calendar days.
11. **`vouchers`**: Immutable definition template table for vouchers (500 points, 40% discount, 1,000,000 VND maximum base).
12. **`voucher_redemptions`**: User-owned voucher instances. Single source of truth for temporary checkout hold is `checkout_session_id`. Supports 5 lifecycle states: `AVAILABLE`, `RESERVED`, `USED`, `EXPIRED`, `REVOKED`.
13. **`loyalty_transactions`**: Append-only ledger for all point adjustments. Prevents balance tampering and enforces idempotent event rewards.

---

## 3. Key Invariants & Database Constraints

- **Monetary Values (`bigint` whole VND):** All monetary fields use `bigint` with `CHECK (amount >= 0)`.
- **Points Arithmetic (`numeric(20,4)`):** Exact decimal calculations for rewards (e.g. 5, 62.5, 150, -500, +500).
- **Checkout & Booking Financial Balancing:**
  - `gross_amount_vnd >= discount_amount_vnd`
  - `final_payable_amount_vnd = gross_amount_vnd - discount_amount_vnd`
  - `final_paid_amount_vnd = gross_amount_vnd - discount_amount_vnd`
- **Stay Dates Order:** `CHECK (check_out > check_in)`.
- **Inventory Overlap Protection Status:** The unconditional GiST exclusion constraint was removed from the initial migration. Inventory overlap exclusion must be added in a later migration after inventory-blocking booking statuses are finalized, ensuring cancelled/non-blocking historical bookings do not hold inventory. Preliminary availability validation is enforced in application/checkout logic.
- **Normalized Loyalty Ledger Types:** The ledger strictly allows only lowercase snake_case transaction types: `daily_checkin_earn`, `booking_earn`, `booking_reversal`, `voucher_redeem`, `voucher_redemption_reversal`, and `adjustment`. No uppercase aliases are permitted.
- **Voucher Constraints:**
  - `expires_at > issued_at`
  - At most one `USED` voucher per booking (`partial unique index on (booking_id) where status = 'USED'`).
  - At most one `RESERVED` voucher per checkout session (`partial unique index on (checkout_session_id) where status = 'RESERVED'`).
  - Single source of truth: `checkout_sessions` has no circular FK back to `voucher_redemptions`.
  - Atomically set to `REVOKED` when compensated via `voucher_redemption_reversal` (+500).
- **Daily Check-In:** `UNIQUE (user_id, checkin_date)`.
- **Ledger Idempotency:** Unique partial indexes for `daily_checkin_id` (`daily_checkin_earn`), `booking_id` (`booking_earn`), and `voucher_redemption_id` (`voucher_redeem`).
- **Automatic `updated_at` Maintenance:** PostgreSQL trigger executing `public.set_updated_at()` (`SECURITY INVOKER`, fixed `search_path = ''`). Direct RPC execution revoked from `public`, `anon`, and `authenticated` for least-privilege.

---

## 4. Baseline Row Level Security (RLS) & Explicit Data API Grants

RLS is enabled on all 13 application tables. Explicit table-level privileges are granted to prevent reliance on default project privileges:

| Table | `anon` Grants & RLS | `authenticated` Grants & RLS | `service_role` Grants |
|---|---|---|---|
| `properties` | SELECT active (`to anon, authenticated`) | SELECT active (`to anon, authenticated`) | ALL |
| `rooms` | SELECT listed (`to anon, authenticated`) | SELECT listed (`to anon, authenticated`) | ALL |
| `profiles` | Denied (no grant) | SELECT, INSERT, UPDATE own (`auth.uid() = id`) | ALL |
| `checkout_sessions` | Denied (no grant) | SELECT own (`user_id = auth.uid()`). Direct write denied. | ALL |
| `bookings` | Denied (no grant) | SELECT own (`user_id = auth.uid()`). Direct insert denied. | ALL |
| `tickets` | Denied (no grant) | SELECT own, INSERT own for own booking | ALL |
| `daily_checkins` | Denied (no grant) | SELECT own (`user_id = auth.uid()`). Direct write denied. | ALL |
| `vouchers` | Denied (no grant) | SELECT active (`is_active = true`). Direct write denied. | ALL |
| `voucher_redemptions` | Denied (no grant) | SELECT own (`user_id = auth.uid()`). Direct write denied. | ALL |
| `loyalty_transactions` | Denied (no grant) | SELECT own (`user_id = auth.uid()`). Direct write denied. | ALL |
| `room_operations` | Denied (no grant) | Denied (no grant; strict deny-by-default) | ALL |
| `room_private_details` | Denied (no grant) | Denied (no grant; strict deny-by-default in Phase 1) | ALL |
| `booking_access_credentials`| Denied (no grant) | Denied (no grant; strict deny-by-default in Phase 1) | ALL |

---

## 5. Seed Data Summary

`supabase/seed.sql` populates development catalog data:
- **4 Properties:** Kapi House Hoa Hồng, Thung Lũng Mây, Hồ Tuyền Lâm, Phố Cổ Trung Tâm.
- **4 Listed Rooms:** Deluxe Terrace, Cozy Nest, Family Suite, Studio Mây Ngàn.
- **4 Operational Records:** Housekeeping status set to `ready`.
- **4 Private Details Placeholders:** Development Wi-Fi and private check-in notes.
- **1 Approved Loyalty Voucher Definition:** 500 points, 40% discount, max base 1,000,000 VND.
- **Zero fake customers, zero real secrets, zero manual `auth.users` rows.**

---

## 6. Local Development Guide

### Prerequisites
- Docker Desktop running.
- Supabase CLI (`npx supabase`).

### Local Ports Configuration
To avoid port conflicts with other local projects on the same machine, `supabase/config.toml` uses the `5433x` port range:
- API / Kong: `http://127.0.0.1:54331`
- PostgreSQL: `postgresql://postgres:postgres@127.0.0.1:54332/postgres`
- Studio: `http://127.0.0.1:54333`
- Inbucket / Mailpit: `http://127.0.0.1:54334`

### Running Local Database
```bash
# Start local containers
npx supabase start

# Reset local database (re-applies all migrations and seeds from scratch)
npx supabase db reset

# Regenerate TypeScript types from running DB
npx supabase gen types typescript --local > lib/database.types.ts

# Run database security and performance advisors
npx supabase db advisors --local

# Stop local containers
npx supabase stop
```

---

## 7. Phase 2 — Supabase SSR + Google Auth Integration

### Infrastructure & Configuration
- **Supabase Cloud Project Ref:** `uwbvwuscazlywhsonooy`
- **Supabase Cloud URL:** `https://uwbvwuscazlywhsonooy.supabase.co`
- **Publishable Key:** `sb_publishable_ykXTWSw0St5SjLV9PAVSzw_FhWLZAwP`
- **Site URL:** `http://localhost:3000`
- **Allowed Redirect Callback URL:** `http://localhost:3000/auth/callback`
- **Cloud Auth Provider:** Google OAuth (ENABLED)

### IMPLEMENTED in Phase 2
- [x] **Local Migration Reconciliation:** Synchronized local migration filenames with remote history (`20260917045810_initial_kapi_schema.sql` and `20260917045919_add_missing_fk_indexes.sql`). Local reset verified.
- [x] **Typed Supabase Browser Client:** [`lib/supabase/client.ts`](file:///Users/hoangthuy/kapi-stay-concierge-main/lib/supabase/client.ts) created using `createBrowserClient<Database>` from `@supabase/ssr`.
- [x] **Typed Supabase Server Client:** [`lib/supabase/server.ts`](file:///Users/hoangthuy/kapi-stay-concierge-main/lib/supabase/server.ts) created using `createServerClient<Database>` with `await cookies()` from `next/headers`.
- [x] **Next.js 16 Session Refresh Proxy:** [`proxy.ts`](file:///Users/hoangthuy/kapi-stay-concierge-main/proxy.ts) and [`lib/supabase/proxy.ts`](file:///Users/hoangthuy/kapi-stay-concierge-main/lib/supabase/proxy.ts) using `updateSession()` with `supabase.auth.getClaims()` for secure token refresh and authorization.
- [x] **Open Redirect Defense:** [`lib/auth/redirect.ts`](file:///Users/hoangthuy/kapi-stay-concierge-main/lib/auth/redirect.ts) strictly validates redirect targets (must start with `/`, cannot start with `//` or `/\\`, no external schemes).
- [x] **Google OAuth Login UI:** [`app/login/page.tsx`](file:///Users/hoangthuy/kapi-stay-concierge-main/app/login/page.tsx) and [`components/auth/GoogleSignInButton.tsx`](file:///Users/hoangthuy/kapi-stay-concierge-main/components/auth/GoogleSignInButton.tsx).
- [x] **OAuth Callback Route:** [`app/auth/callback/route.ts`](file:///Users/hoangthuy/kapi-stay-concierge-main/app/auth/callback/route.ts) exchanges authorization codes for session cookies, obtains trusted user via `getUser()`, and synchronizes metadata into `public.profiles`.
- [x] **Profile Synchronization Strategy:**
  - Idempotently upserts `public.profiles` using owner-scoped RLS (`auth.uid() = id`).
  - Name priority: `user.user_metadata.full_name` → `user.user_metadata.name` → `null`.
  - Avatar priority: `user.user_metadata.avatar_url` → `user.user_metadata.picture` → `null`.
  - Preserves existing user-managed `phone` number without overwriting.
  - On failure, redirects to `/auth/error?reason=profile_sync` without exposing database internals.
- [x] **Safe Auth Error Page:** [`app/auth/error/page.tsx`](file:///Users/hoangthuy/kapi-stay-concierge-main/app/auth/error/page.tsx) with retry and home links. Zero token or error trace exposure.
- [x] **Server-Side Logout:** [`app/auth/signout/route.ts`](file:///Users/hoangthuy/kapi-stay-concierge-main/app/auth/signout/route.ts) (POST only) terminates session and invalidates cache.
- [x] **Global Header Auth State:** [`components/auth/AuthNav.tsx`](file:///Users/hoangthuy/kapi-stay-concierge-main/components/auth/AuthNav.tsx) in [`app/layout.tsx`](file:///Users/hoangthuy/kapi-stay-concierge-main/app/layout.tsx) shows "Đăng nhập" when unauthenticated, and user display name + "Đăng xuất" button when authenticated.
- [x] **Route Protection:**
  - Public routes remain public: `/` and `/rooms`.
  - Protected route: `/my-stay` redirects unauthenticated requests with 307 to `/login?next=/my-stay` (preserving query params). Enforced at both Proxy layer and Route Server Component layer.
- [x] **Booking Auth Gate Integration:** [`lib/auth/booking-gate.ts`](file:///Users/hoangthuy/kapi-stay-concierge-main/lib/auth/booking-gate.ts) prepared for future booking implementation.
- [x] **Zero Secret Leakage:** No `service_role` key, secret key, or Google Client Secret in code, environment variables, or documentation. `getSession()` is never used for server authorization.

---

## 8. Phase 3 — Supabase Room Catalog + Room Detail

### IMPLEMENTED in Phase 3
- [x] **Hardcoded Room Mock Removal:** Completely removed hardcoded room arrays from `/rooms`. The database (`public.properties` + `public.rooms`) is now the runtime source of truth.
- [x] **Typed Server Data Layer:** [`lib/data/rooms.ts`](file:///Users/hoangthuy/kapi-stay-concierge-main/lib/data/rooms.ts) provides `getPublicRooms()` and `getPublicRoomById(id)`.
  - Uses Server Component client (`lib/supabase/server.ts`) with generated `Database` types.
  - Strictly queries public columns with RLS (`is_listed = true` on rooms and active properties).
  - Defensively parses amenities and image paths.
  - Zero exposure of internal `room_operations`, `room_private_details`, or `booking_access_credentials`.
- [x] **Currency Formatter:** [`lib/utils/format.ts`](file:///Users/hoangthuy/kapi-stay-concierge-main/lib/utils/format.ts) formats integer VND into Vietnamese locale (e.g., `650.000đ`).
- [x] **Dynamic Public Catalog Page:** [`app/rooms/page.tsx`](file:///Users/hoangthuy/kapi-stay-concierge-main/app/rooms/page.tsx)
  - Renders dynamic cards via [`components/rooms/RoomCard.tsx`](file:///Users/hoangthuy/kapi-stay-concierge-main/components/rooms/RoomCard.tsx).
  - Displays property branch name, room title, capacity, amenity pills, nightly rate, and "Xem chi tiết" CTA linking to `/rooms/[id]`.
  - Renders graceful empty state ("Hiện chưa có phòng được mở bán") when the cloud database has 0 rows.
  - Renders safe error state when network or database failures occur without leaking internal errors.
- [x] **Dynamic Public Room Detail Page:** [`app/rooms/[id]/page.tsx`](file:///Users/hoangthuy/kapi-stay-concierge-main/app/rooms/%5Bid%5D/page.tsx)
  - Route parameterized by room UUID.
  - Validates UUID and returns `notFound()` if invalid or unlisted.
  - Displays room name, property address, Google Maps link, full description, capacity badge, and complete amenities grid.
  - Graceful image fallback to branded neutral placeholder when photography is pending.
- [x] **Stay Date Selection Shell:** [`components/rooms/RoomBookingWidget.tsx`](file:///Users/hoangthuy/kapi-stay-concierge-main/components/rooms/RoomBookingWidget.tsx)
  - Client component for stay dates (`checkIn`, `checkOut`).
  - Client validation: past dates disabled, `check_out > check_in` enforced.
  - Informative price estimation preview (`nights × price = estimated total`).
  - Future booking CTA ("Tiếp tục đặt phòng") with clear informational notice that checkout is activated in the next phase.
  - Zero writes to `checkout_sessions` or `bookings`.
- [x] **Loading Skeletons & 404:**
  - [`app/rooms/loading.tsx`](file:///Users/hoangthuy/kapi-stay-concierge-main/app/rooms/loading.tsx)
  - [`app/rooms/[id]/loading.tsx`](file:///Users/hoangthuy/kapi-stay-concierge-main/app/rooms/%5Bid%5D/loading.tsx)
  - [`app/rooms/[id]/not-found.tsx`](file:///Users/hoangthuy/kapi-stay-concierge-main/app/rooms/%5Bid%5D/not-found.tsx)
- [x] **Homepage CTA Alignment:** Adjusted hero button in [`app/page.tsx`](file:///Users/hoangthuy/kapi-stay-concierge-main/app/page.tsx) to "Khám phá phòng" linking to `/rooms`.
- [x] **Catalog Data Review Document:** Created [`docs/ROOM_CATALOG_DATA_REVIEW.md`](file:///Users/hoangthuy/kapi-stay-concierge-main/docs/ROOM_CATALOG_DATA_REVIEW.md) classifying all discovered data as development demo fixtures.

### NOT YET IMPLEMENTED (Deferred to Future Phases)
- Live inventory overlap availability calculation.
- Checkout session creation.
- Booking confirmation and payment processing.
- Staff housekeeping operations and maintenance dashboards.
- Digital Key / IoT door code issuance.
