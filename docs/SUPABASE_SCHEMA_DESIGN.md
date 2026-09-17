# Kapi Stay Concierge — Supabase Schema Design

> **SCHEMA DESIGN — NOT IMPLEMENTATION**  
> This document describes the proposed Supabase physical schema.  
> It is not evidence that the schema has been implemented.  
> SQL/migrations require a separate implementation task and review.

No SQL, migration, function, trigger, bucket, or RLS policy is created by this
document.

## 1. Confirmed Business Constraints

This design treats the following product rules as **DECIDED**:

- **Authentication:** Google Login through Supabase Auth and Google OAuth is
  required before booking and before My Stay. Guest and anonymous booking are
  not supported. Every booking created through Kapi Stay Concierge belongs to an
  authenticated user, and loyalty belongs only to authenticated users (OD06, decided).
- **Daily check-in timezone:** Daily reward day boundaries are governed by the
  **`Asia/Ho_Chi_Minh`** timezone. A new daily check-in day begins at 00:00
  `Asia/Ho_Chi_Minh`. UTC calendar days must not be used for daily rewards.
  One daily check-in per account per calendar day earns **5 points**.
- **Booking requires successful full payment:** The product does not support creating a
  booking first and paying later. Deposits, partial payments, and paying the remaining
  balance later are strictly **not supported**. A user must complete 100% of the
  required payment (`final_paid_amount_vnd`) successfully before the room is
  confirmed and created as a valid reservation.
- **Checkout sessions precede confirmed bookings:** Temporary checkout and payment
  intent state is isolated in `checkout_sessions`. A row in `bookings` represents
  a durable, successfully paid reservation and is created only after verified payment.
- **Booking points qualification event:** Booking loyalty points are earned only
  after **successful verified payment and booking confirmation**. Initiating
  checkout or temporary payment intents does not earn points.
- **Booking points base & formula:** Booking points are calculated strictly from the
  **actual final amount paid by the guest after voucher discounts**
  (`final_paid_amount_vnd`). Points are not calculated from the pre-discount gross
  amount. The exact formula is `final_paid_amount_vnd × 0.00025`.
- **Voucher conversion & limit:** 500 points redeems one 40% discount voucher
  (`VOUCHER_REDEEM` -500). The eligible discount base is capped at 1,000,000 VND,
  producing a maximum discount of 400,000 VND.
- **Voucher expiry:** A redeemed voucher expires **24 hours** after issuance
  (`expires_at = issued_at + 24 hours`). This is an elapsed 24-hour duration,
  not end-of-calendar-day. Expired vouchers cannot be used, and points are not
  refunded on expiry.
- **One voucher per booking:** Each booking may use at most **one** loyalty voucher.
  Stacking multiple loyalty vouchers on one booking is prohibited.
- **Voucher reservation & single source of truth:** `voucher_redemptions.checkout_session_id`
  is the single source of truth for the temporary voucher-to-checkout reservation
  relationship (`checkout_session ← voucher_redemptions.checkout_session_id`).
  The proposed schema does not maintain a redundant circular `voucher_redemption_id` on
  `checkout_sessions`. A checkout session may have at most one reserved loyalty voucher.
- **Voucher lifecycle states:** The voucher lifecycle supports exactly five states:
  `AVAILABLE`, `RESERVED`, `USED`, `EXPIRED`, and `REVOKED`.
- **Three distinct voucher cancellation & failure scenarios:**
  1. **Abandoned checkout:** voucher returns from `RESERVED` to **`AVAILABLE`** (provided
     `now() < expires_at`), 500 points are not refunded because the voucher still exists
     and remains usable until its original 24-hour expiration time.
  2. **Customer voluntary cancellation:** voucher remains **`USED`**; 500 points are not
     refunded; previously awarded booking points (`BOOKING_EARN`) are reversed via an
     append-only `BOOKING_REVERSAL` ledger entry.
  3. **System failure compensation:** 500 points are compensated back via an append-only
     `VOUCHER_REDEMPTION_REVERSAL` ledger transaction (+500) strictly for unrecoverable
     system errors, and the voucher status is atomically set to **`REVOKED`** (permanently
     invalidated). A user must **never** receive +500 points compensation and retain a
     usable voucher. The voucher record is retained for audit history (never deleted).
- **Room operational state separated from public catalog:** `rooms` contains public
  catalog data only (`operational_status` is removed). `room_operations` holds
  internal operational states (ready, occupied, cleaning, maintenance) for the
  Operations Dashboard.
- **Digital Key is booking-scoped:** Digital Key / door access credentials belong to
  a specific **booking**, not permanently to a room. Each booking receives its own
  access credential, valid strictly during the approved stay access window.
- **Wi-Fi is room/property-scoped:** Wi-Fi credentials are sensitive property/room
  attributes and must remain separate from booking-scoped Digital Keys.
- **Ticket lifecycle:** Ticket status supports at least Pending → In Progress → Resolved.

OD01, OD02, OD04, and OD05 remain open as documented in `docs/PROJECT_GUIDE.md`.
The schema must not silently settle those decisions.

## 2. Design Goals

- Preserve an auditable history for points, voucher issuance, and voucher use.
- Enforce important invariants in the database as well as the trusted
  application layer.
- Keep public room catalog data separate from stay-sensitive credentials.
- Isolate temporary checkout intents (`checkout_sessions`) from durable confirmed
  reservations (`bookings`).
- Isolate internal room operational status (`room_operations`) from the public room
  catalog (`rooms`).
- Make ownership explicit so RLS rules are understandable and testable.
- Use exact arithmetic for VND and loyalty values.
- Keep the first schema small; do not introduce a generic campaign, rule, or
  workflow engine.
- Separate booking availability from room operational readiness.

## 3. Data Conventions

### Identifiers and timestamps

- Use UUID primary keys for application-owned entities.
- Use `timestamptz` for event/audit timestamps and store them in UTC.
- Use `date` for `check_in`, `check_out`, and `checkin_date` where the business
  meaning is a local calendar date rather than an instant.
- Include `created_at` and `updated_at` on mutable business entities. Append-only
  ledger rows need `created_at` and should not be updated.

### Money

Store VND amounts as non-negative `bigint` values in whole VND. This avoids
floating-point errors and matches the currency's product usage. Examples include
room price, booking gross amount, eligible booking value, discount base,
discount amount, and final paid amount.

### Points

Use exact `numeric(20,4)` values for point amounts, including
`loyalty_transactions.points_delta` and `daily_checkins.reward_points`.

Rationale:

- `250000 × 0.00025 = 62.5`, so integer points are invalid.
- `numeric`/`decimal` arithmetic is exact in PostgreSQL; `real` and `double
  precision` are inexact and are inappropriate for auditable money/loyalty
  calculations.
- The approved rate has four decimal places, so a scale of four represents every
  whole-VND calculation exactly while leaving a clear fixed precision.

The precision ceiling should be confirmed against expected lifetime balances
before migration review. It must not be silently changed to floating-point.

### Status values

Use constrained status values, but finalize exact database identifiers during
migration review. Business-facing labels can remain localized in the UI. Avoid
an extensible workflow engine until the product requires one.

## 4. Proposed Model at a Glance

```text
auth.users
    │
    ▼
profiles
    │
    ├── checkout_sessions (temporary checkout / payment state)
    │       ▲
    │       └── (referenced by voucher_redemptions.checkout_session_id; max 1)
    │
    ├── bookings (confirmed durable paid reservations)
    │       ├── booking_access_credentials (booking-scoped Digital Key)
    │       └── tickets
    │
    ├── daily_checkins
    ├── loyalty_transactions
    └── voucher_redemptions
              │
              └── vouchers

properties
    │
    ▼
rooms (public room catalog)
    ├── room_private_details (Wi-Fi and private instructions)
    └── room_operations (internal operational state)
```

Recommended application tables:

1. `profiles`
2. `properties`
3. `rooms`
4. `room_private_details`
5. `room_operations`
6. `checkout_sessions`
7. `bookings`
8. `booking_access_credentials`
9. `tickets`
10. `daily_checkins`
11. `loyalty_transactions`
12. `vouchers`
13. `voucher_redemptions`

Rationale for table boundaries:

- `properties` is justified because the product must filter and operate across
  four or more properties.
- `rooms` contains public catalog data (names, prices, amenities, photos, listing flag).
- `room_operations` is justified because internal operational state (cleaning,
  maintenance, room readiness) is internal staff data that must never be exposed
  through the public catalog.
- `checkout_sessions` is justified because temporary checkout and payment intent
  attempts must be isolated from durable, confirmed bookings. This prevents unpaid
  or abandoned checkout attempts from creating ghost booking rows. Voucher attachment
  is captured solely via `voucher_redemptions.checkout_session_id`, avoiding circular
  foreign keys between checkout sessions and voucher redemptions.
- `bookings` is justified as the immutable, durable record of confirmed reservations
  created strictly upon verified full payment.
- `booking_access_credentials` is justified because Digital Key / door access
  credentials belong to a specific **booking** and are time-bounded to the
  approved stay window. They must never be static room attributes.
- `room_private_details` is justified because Wi-Fi network/password and private
  room instructions are sensitive property/room attributes that remain separate
  from the public catalog, but do not rotate per booking.

## 5. Table Design

The field lists below are proposals for review, not implemented definitions.
“Required” describes the target invariant, not the current repository.

### 5.1 `profiles`

Purpose: application-facing profile associated one-to-one with a Supabase Auth
user.

| Field | Suggested type | Nullability | Purpose |
| --- | --- | --- | --- |
| `id` | `uuid` | Required | Primary key and foreign key to `auth.users.id` |
| `display_name` | `text` | Nullable | Guest-facing/account display name |
| `avatar_url` | `text` | Nullable | Google or user profile image reference |
| `phone` | `text` | Nullable | Optional contact number; do not treat as numeric |
| `created_at` | `timestamptz` | Required | Profile creation audit |
| `updated_at` | `timestamptz` | Required | Last profile update |

Recommendation:

- Use `profiles.id = auth.users.id` rather than creating a second user identity.
- Reference only the stable primary key of the Supabase-managed Auth table.
- Supabase's standard profile pattern cascades deletion from `auth.users` to the
  profile row. For this product, do not adopt that delete behavior blindly:
  bookings and audit ledgers may require retention, so account deletion and
  anonymization rules must be approved first.
- Keep Google provider identities, email verification, tokens, and OAuth secrets
  in Supabase Auth; do not duplicate them into `profiles` without a specific
  application need.
- Never store a Google password, OAuth access token, refresh token, client
  secret, or Supabase service role key in this table.
- Creating the profile after sign-up must be reliable and idempotent. The
  implementation mechanism requires separate review.
- Do not cascade-delete bookings, loyalty history, or voucher audit data merely
  because a profile or Auth identity is deleted. Account deletion and legal
  retention policy are open decisions.

### 5.2 `properties`

Purpose: represent Kapi House locations/branches shared by multiple rooms.

| Field | Suggested type | Nullability | Purpose |
| --- | --- | --- | --- |
| `id` | `uuid` | Required | Primary key |
| `name` | `text` | Required | Public property name |
| `slug` | `text` | Required | Stable public lookup value; unique |
| `address` | `text` | Required | Property address |
| `maps_url` | `text` | Nullable | Google Maps destination link |
| `is_active` | `boolean` | Required | Controls catalog/booking availability |
| `created_at` | `timestamptz` | Required | Audit timestamp |
| `updated_at` | `timestamptz` | Required | Audit timestamp |

Why a separate table: with four or more properties, repeating property names,
addresses, and maps links on rooms would create update anomalies and make the
property filter unreliable.

### 5.3 `rooms`

Purpose: public room catalog and property mapping.

| Field | Suggested type | Nullability | Purpose |
| --- | --- | --- | --- |
| `id` | `uuid` | Required | Primary key |
| `property_id` | `uuid` | Required | Foreign key to `properties.id` |
| `name` | `text` | Required | Public room name |
| `description` | `text` | Nullable | Public room description |
| `nightly_price_vnd` | `bigint` | Required | Public base price in whole VND |
| `capacity` | `integer` | Required | Maximum guest count; positive |
| `amenities` | `text[]` | Required/default empty | Small catalog list without a separate taxonomy engine |
| `image_paths` | `text[]` | Required/default empty | Ordered references to approved room images |
| `is_listed` | `boolean` | Required | Whether the room appears in public discovery |
| `created_at` | `timestamptz` | Required | Audit timestamp |
| `updated_at` | `timestamptz` | Required | Audit timestamp |

Constraints and architectural direction:

- Price and capacity must be positive.
- A room belongs to exactly one property in the initial model.
- **Architectural separation:** Internal operational states (such as cleaning,
  readiness, and maintenance) are explicitly **removed** from `rooms` and isolated
  in `room_operations`. This ensures that public catalog queries on `rooms` (filtered
  by `is_listed = true`) are safe by design and can never leak sensitive internal
  hotel operations data.
- Public room availability for selected dates is computed dynamically against
  active bookings in `bookings` (and temporary holds in `checkout_sessions`), not
  from room catalog fields.

### 5.4 `room_operations`

Purpose: internal room readiness, cleaning, and maintenance state for the
Operations Dashboard.

| Field | Suggested type | Nullability | Purpose |
| --- | --- | --- | --- |
| `room_id` | `uuid` | Required | Primary key and foreign key to `rooms.id`; one-to-one with room |
| `operational_status` | constrained `text` | Required | Internal state: `ready`, `occupied`, `waiting_for_cleaning`, `maintenance` |
| `updated_at` | `timestamptz` | Required | Audit timestamp of last state transition |
| `updated_by` | `uuid` | Nullable | Optional staff profile ID for operational audit trail |

Security and access rules:

- **Strictly internal:** Accessible only to authenticated operations and admin
  staff. Public and regular guest roles have zero read or write access.
- **Independent from booking availability:** `room_operations.operational_status`
  tracks housekeeping and maintenance readiness. A room marked `ready` is not
  necessarily available for future dates if existing bookings overlap.
- Exact database status identifiers remain an open technical review item until
  operational workflows are finalized.

### 5.5 `room_private_details`

Purpose: restricted stay-sensitive room and property details (Wi-Fi and private
room instructions).

| Field | Suggested type | Nullability | Purpose |
| --- | --- | --- | --- |
| `room_id` | `uuid` | Required | Primary key and foreign key to `rooms.id`; one row per room |
| `wifi_ssid` | `text` | Nullable | Wi-Fi network name |
| `wifi_password` | protected `text` | Nullable | Wi-Fi credential |
| `private_instructions` | `text` | Nullable | Private room access/usage instructions |
| `updated_at` | `timestamptz` | Required | Credential update audit |

Security direction:

- Never expose this table to the public/anonymous role.
- An authenticated user may read it only through ownership of an eligible,
  confirmed booking for that room during an approved stay access window.
- Operations access depends on the future staff role model.
- Do not expose secrets through public views, broad `select *` calls, logs, or
  Realtime payloads.
- **Architectural separation:** This table contains static room-level infrastructure
  (Wi-Fi). Door access credentials (Digital Keys) are explicitly separated into
  `booking_access_credentials` because door credentials rotate and belong to a
  specific booking.

### 5.6 `checkout_sessions`

Purpose: temporary checkout and payment intent state prior to verified payment
and booking confirmation.

| Field | Suggested type | Nullability | Purpose |
| --- | --- | --- | --- |
| `id` | `uuid` | Required | Primary key |
| `user_id` | `uuid` | Required | Foreign key to `profiles.id`; authenticated checkout owner |
| `room_id` | `uuid` | Required | Foreign key to `rooms.id` |
| `check_in` | `date` | Required | Requested inclusive arrival date |
| `check_out` | `date` | Required | Requested exclusive departure date; later than `check_in` |
| `guest_count` | `integer` | Required | Requested guest count |
| `gross_amount_vnd` | `bigint` | Required | Pre-discount gross price snapshot in whole VND |
| `discount_amount_vnd` | `bigint` | Required | Applied voucher discount in whole VND (default 0) |
| `final_payable_amount_vnd` | `bigint` | Required | Trusted amount required for payment (`gross - discount`) |
| `status` | constrained `text` | Required | `ACTIVE`, `PAYMENT_PROCESSING`, `COMPLETED`, `EXPIRED`, `FAILED` |
| `expires_at` | `timestamptz` | Required | Session expiration timestamp |
| `payment_reference` | `text` | Nullable | Gateway transaction / intent reference or idempotency key |
| `created_at` | `timestamptz` | Required | Session creation timestamp |
| `updated_at` | `timestamptz` | Required | Last state transition timestamp |

Lifecycle and business rules:

- **Decided Architecture — Temporary Checkout Precedes Booking:**
  Checkout sessions isolate ephemeral checkout and payment attempts from confirmed
  reservations. A user selecting a room or initiating payment does **not** create a row
  in `bookings`.
- **Full Payment Required (No Deposits):** The guest must pay 100% of
  `final_payable_amount_vnd`. Deposits and partial payments are not supported.
- **Voucher Reservation (Single Source of Truth):** `checkout_sessions` does NOT store a
  circular `voucher_redemption_id`. Attachment is tracked exclusively via
  `voucher_redemptions.checkout_session_id`. When attached, the voucher enters `RESERVED`
  status. A checkout session may have at most one reserved loyalty voucher.
- **Abandoned Checkout Voucher Release:** If the checkout session expires, is
  cancelled, or payment fails without completing:
  - The session status transitions to `EXPIRED` or `FAILED`.
  - The reserved voucher returns to **`AVAILABLE`** (provided `now() < voucher.expires_at`),
    and `checkout_session_id` is cleared to `NULL`.
  - The 500 points are **not refunded** because the voucher still exists and can be
    used again until its original 24-hour expiration.
  - If the voucher reaches its 24-hour expiration while reserved, it transitions to `EXPIRED`.
- **Trusted Financial Calculation:** The client must never submit financial amounts.
  The server derives `gross_amount_vnd`, verifies the voucher, and calculates
  `final_payable_amount_vnd`.
- **Expiration Duration:** Session expiry duration remains a configurable
  implementation decision (e.g. 15 minutes), during which an inventory hold may be
  enforced.

### 5.7 `bookings`

Purpose: durable confirmed room reservations and their financial snapshot state,
created strictly upon verified full payment.

| Field | Suggested type | Nullability | Purpose |
| --- | --- | --- | --- |
| `id` | `uuid` | Required | Primary key |
| `user_id` | `uuid` | **Required** | Foreign key to `profiles.id`; never nullable (no guest bookings) |
| `room_id` | `uuid` | Required | Foreign key to `rooms.id` |
| `check_in` | `date` | Required | Inclusive arrival date |
| `check_out` | `date` | Required | Exclusive departure date; later than `check_in` |
| `guest_count` | `integer` | Required | Positive and no greater than room capacity |
| `gross_amount_vnd` | `bigint` | Required | Pre-discount gross booking amount in whole VND |
| `discount_amount_vnd` | `bigint` | Required | Applied voucher discount in whole VND (default 0) |
| `final_paid_amount_vnd` | `bigint` | Required | Actual final amount paid; source value for loyalty formula |
| `payment_status` | constrained `text` | Required | Payment lifecycle (verified, completed, refunded) |
| `booking_status` | constrained `text` | Required | Reservation/stay lifecycle (confirmed, completed, cancelled) |
| `created_at` | `timestamptz` | Required | Booking confirmation timestamp |
| `updated_at` | `timestamptz` | Required | Last state update timestamp |

Required invariants:

- **Confirmed Bookings Only:** No booking row is ever created with `pending_payment`.
  A row in `bookings` exists only after external payment is successfully verified.
- **No Deposits / Partial Payments:** `deposit_amount_vnd` is entirely excluded. Full
  payment of `final_paid_amount_vnd` is mandatory.
- `user_id` is mandatory because OD06 is decided. Guest and anonymous bookings
  are not supported.
- `check_out` must be strictly later than `check_in`.
- Monetary values must be non-negative: `gross_amount_vnd >= discount_amount_vnd`,
  and `final_paid_amount_vnd = gross_amount_vnd - discount_amount_vnd`.
- Financial fields are immutable snapshots frozen at booking confirmation.
  The loyalty points formula strictly uses `final_paid_amount_vnd` as its base.
- `payment_status` and `booking_status` remain separate. Exact identifiers await
  OD04 review.

#### Availability, Overlap, and Race Conditions

Availability must be computed from date overlap against bookings that block
inventory, not from `room_operations.operational_status` alone.

Use half-open stays `[check_in, check_out)`: checkout on a date does not conflict
with another booking checking in on that same date. Logically, two stays overlap
when each starts before the other ends.

Implementation recommendations:
- Represent stay dates as a PostgreSQL date range (`daterange(check_in, check_out, '[)')`).
- Enforce inventory uniqueness using a database exclusion constraint
  (`EXCLUDE USING gist (room_id WITH =, daterange(check_in, check_out, '[)') WITH &&)`)
  for all inventory-blocking statuses.
- **Payment Concurrency & Inventory Protection:** During checkout payment, two guests
  could attempt to pay for the same room and dates simultaneously. The design supports:
  1. A temporary inventory hold associated with active `checkout_sessions`, or
  2. Conflict detection upon payment confirmation callback, where the database
     exclusion constraint rejects the second booking and triggers an automatic
     payment refund / compensation workflow.
  The preferred inventory-hold mechanism remains an implementation decision.

### 5.8 `booking_access_credentials`

Purpose: booking-scoped Digital Key and door access credentials tied to a specific
reservation and room.

| Field | Suggested type | Nullability | Purpose |
| --- | --- | --- | --- |
| `id` | `uuid` | Required | Primary key |
| `booking_id` | `uuid` | Required | Foreign key to `bookings.id`; identifies owning reservation |
| `room_id` | `uuid` | Required | Foreign key to `rooms.id` |
| `credential_type` | constrained `text` | Required | Credential format: `door_pin`, `digital_key_token` |
| `credential_value` | protected `text` | Required | Door PIN or secure digital key reference |
| `instructions` | `text` | Nullable | Door lock operation instructions |
| `valid_from` | `timestamptz` | Required | Earliest time credential becomes active |
| `valid_until` | `timestamptz` | Required | Expiration timestamp (checkout time or grace period end) |
| `status` | constrained `text` | Required | Credential status: `active`, `expired`, `revoked` |
| `created_at` | `timestamptz` | Required | Issuance timestamp |
| `updated_at` | `timestamptz` | Required | Last update/rotation timestamp |

Security and access rules:

- **Decided Product Rule:** Digital Key credentials belong to a specific **booking**,
  not permanently to the room.
- An authenticated guest may query this table **only** if:
  1. `auth.uid() = booking.user_id`
  2. The booking is verified, paid, and confirmed
  3. The current trusted timestamp (`now()`) is within `[valid_from, valid_until]`
- Outside the approved stay window (before check-in time or after check-out),
  credentials must not be exposed.
- Public/anonymous access is strictly forbidden.
- Credentials must never be transmitted via public room queries, public Realtime
  broadcasts, or client-side logs.

### 5.9 `daily_checkins`

Purpose: one auditable daily reward event per authenticated account.

| Field | Suggested type | Nullability | Purpose |
| --- | --- | --- | --- |
| `id` | `uuid` | Required | Primary key |
| `user_id` | `uuid` | Required | Foreign key to `profiles.id` |
| `checkin_date` | `date` | Required | Calendar date in `Asia/Ho_Chi_Minh` timezone |
| `reward_points` | `numeric(20,4)` | Required | Stored reward snapshot; currently exactly 5 |
| `created_at` | `timestamptz` | Required | Actual event timestamp |

Database constraint: the pair `(user_id, checkin_date)` must be unique. This,
not a frontend check, prevents a user from receiving the daily reward twice for
the same date under retries or concurrent requests.

**Decided Product Rule — Business Timezone:**
- The business timezone is **`Asia/Ho_Chi_Minh`**.
- Day boundaries reset at 00:00 `Asia/Ho_Chi_Minh`.
- UTC calendar days must NOT be used for daily rewards.
- `checkin_date` must be derived by trusted backend/database logic using
  `now() AT TIME ZONE 'Asia/Ho_Chi_Minh'`.
- The browser must not submit an arbitrary reward date or point value.

### 5.10 `loyalty_transactions`

Purpose: append-only source-of-truth ledger for all point changes.

| Field | Suggested type | Nullability | Purpose |
| --- | --- | --- | --- |
| `id` | `uuid` | Required | Primary key |
| `user_id` | `uuid` | Required | Foreign key to `profiles.id` |
| `type` | constrained `text` | Required | Reason/category for the delta |
| `points_delta` | `numeric(20,4)` | Required | Exact positive or negative non-zero point change |
| `booking_id` | `uuid` | Nullable | Source booking when applicable |
| `daily_checkin_id` | `uuid` | Nullable | Source daily event when applicable |
| `voucher_redemption_id` | `uuid` | Nullable | Issued voucher instance when applicable |
| `description` | `text` | Nullable | Human-readable audit note; not business logic |
| `metadata` | `jsonb` | Nullable | Small immutable audit context only when typed columns are insufficient |
| `created_at` | `timestamptz` | Required | Ledger event timestamp |

Minimum transaction types:

- `DAILY_CHECKIN_EARN`: positive (+5); references one `daily_checkins` row.
- `BOOKING_EARN`: positive; references one verified, paid, confirmed booking.
  Calculated strictly as `final_paid_amount_vnd × 0.00025`.
- `BOOKING_REVERSAL`: negative (-X); reverses previously awarded booking earn points
  upon customer voluntary cancellation.
- `VOUCHER_REDEEM`: exactly `-500`; references the issued `voucher_redemptions` instance.
- `VOUCHER_REDEMPTION_REVERSAL`: exactly `+500`; compensates points if a booking/payment
  transaction fails due to system error.
  **Important:** `VOUCHER_REDEMPTION_REVERSAL` is strictly for system-failure compensation.
  It is NEVER used for customer voluntary cancellation.
- `ADJUSTMENT`: positive or negative; operations-only with an explicit required reason.

Integrity recommendations:

- Ledger rows are append-only. Corrections use compensating transactions rather
  than editing or deleting history.
- Enforce one daily earn transaction per `daily_checkin_id`.
- Enforce one booking earn transaction per `booking_id` for idempotent reward creation.
- Enforce one `VOUCHER_REDEEM` deduction per `voucher_redemption_id`.
- Prevent all direct client inserts, updates, and deletes. Only reviewed trusted
  operations and authorized adjustments may append entries.

### 5.11 `vouchers`

Purpose: small definition table for approved voucher terms, not a campaign
engine.

| Field | Suggested type | Nullability | Purpose |
| --- | --- | --- | --- |
| `id` | `uuid` | Required | Primary key |
| `name` | `text` | Required | Internal/display name |
| `voucher_type` | constrained `text` | Required | Currently percentage discount |
| `points_cost` | `numeric(20,4)` | Required | Currently exactly 500 |
| `discount_percentage` | `numeric(5,2)` | Required | Currently exactly 40.00 |
| `max_eligible_base_vnd` | `bigint` | Required | Currently exactly 1,000,000 |
| `is_active` | `boolean` | Required | Whether new instances may be issued |
| `created_at` | `timestamptz` | Required | Definition creation audit |
| `updated_at` | `timestamptz` | Required | Definition update audit |

The maximum discount is derived exactly from the percentage and capped base:

```text
40% × 1,000,000 VND = 400,000 VND
```

Once any user-owned voucher instance references a definition, do not mutate the
financial terms in place. Create a new definition for future terms so previously
issued vouchers remain auditable.

### 5.12 `voucher_redemptions`

Purpose: user-owned voucher instance created when points are redeemed, applied
to a single booking transaction.

| Field | Suggested type | Nullability | Purpose |
| --- | --- | --- | --- |
| `id` | `uuid` | Required | Primary key; identifies the issued instance |
| `voucher_id` | `uuid` | Required | Foreign key to the immutable `vouchers` definition |
| `user_id` | `uuid` | Required | Owning authenticated profile |
| `checkout_session_id` | `uuid` | Nullable | Single source of truth for active checkout session holding the voucher |
| `status` | constrained `text` | Required | `AVAILABLE`, `RESERVED`, `USED`, `EXPIRED`, `REVOKED` |
| `issued_at` | `timestamptz` | Required | Time 500 points were redeemed and instance issued |
| `expires_at` | `timestamptz` | Required | Exactly `issued_at + 24 hours` (elapsed duration) |
| `booking_id` | `uuid` | Nullable until use | Booking receiving the voucher discount |
| `discount_amount_vnd` | `bigint` | Nullable until use | Actual trusted discount applied (max 400,000 VND) |
| `used_at` | `timestamptz` | Nullable until use | Voucher application timestamp |

Lifecycle and business rules:

- **Decided Status Values:**
  - `AVAILABLE`: user owns voucher; voucher is not attached to an active checkout session; can be applied to a new booking.
  - `RESERVED`: temporarily attached to an active `checkout_sessions` row via `checkout_session_id`; cannot simultaneously be applied to another checkout.
  - `USED`: payment verified, booking confirmed, voucher permanently consumed.
  - `EXPIRED`: 24-hour validity has elapsed (`now() >= expires_at`); cannot be applied.
  - `REVOKED`: voucher permanently invalidated because the original 500-point redemption was compensated/reversed due to an unrecoverable system failure. A `REVOKED` voucher cannot be applied to checkout, cannot return to `AVAILABLE`, cannot become `RESERVED`, and cannot be `USED`.
- **Decided Architecture — Single Source of Truth for Checkout Reservation:**
  `voucher_redemptions.checkout_session_id` is the single source of truth for the temporary voucher-to-checkout reservation relationship (`checkout_session ← voucher_redemptions.checkout_session_id`). Redundant two-way references (`checkout_sessions.voucher_redemption_id`) are eliminated.
  Database constraint recommendation: a partial unique index on `voucher_redemptions(checkout_session_id)` where `checkout_session_id IS NOT NULL AND status = 'RESERVED'` guarantees that a checkout session has at most one reserved loyalty voucher.
- **Decided Product Rule — 24-Hour Expiration:**
  A redeemed voucher expires **24 hours** after issuance (`expires_at = issued_at + 24 hours`).
  This is an elapsed duration, not end-of-calendar-day.
  A voucher can only be applied when `now() < expires_at`. Once expired, its status
  becomes `EXPIRED` and it cannot be used. Expired vouchers do not refund points.
- **Decided Product Rule — Maximum One Voucher Per Booking:**
  Each booking may use at most **one** loyalty voucher. Stacking multiple vouchers
  on one booking is prohibited.
  Database constraint recommendation: a unique partial index or constraint on
  `booking_id` where `booking_id IS NOT NULL` and `status = 'USED'`.
- **Three Distinct Voucher Failure and Cancellation Scenarios:**
  1. **Abandoned checkout / payment expiration:** If the user abandons checkout,
     closes the browser, or payment fails without completing, the voucher returns
     from `RESERVED` to **`AVAILABLE`** (provided `now() < expires_at`), and
     `checkout_session_id` is cleared to `NULL`. The 500 points are **not refunded**
     because the voucher is not lost and remains usable until its original 24-hour
     expiration time.
  2. **Customer voluntary cancellation:** If a customer voluntarily cancels a
     completed booking, the 500 points spent on the voucher are **not refunded**
     (the voucher remains consumed / `USED`). Any booking points earned are
     reversed via `BOOKING_REVERSAL`.
  3. **System failure compensation:** If a booking/payment operation fails due to
     system error after points were deducted and the transaction cannot safely
     recover, 500 points are compensated via an append-only
     `VOUCHER_REDEMPTION_REVERSAL` (+500) ledger entry, and the voucher status is
     atomically updated to **`REVOKED`**. The compensation and voucher invalidation
     are treated as a single trusted, idempotent recovery operation. A user must
     **never** receive +500 compensation and still retain a usable 40% voucher. The
     voucher record is permanently preserved for audit history (never deleted).
- **Issuance flow:**
  The user must have at least 500 available points. Issuance, the `-500` ledger
  transaction (`VOUCHER_REDEEM`), and creation of the owned instance happen
  atomically in a trusted operation.

### 5.13 `tickets`

Purpose: service/incident records tied to an authenticated user's booking and
room.

| Field | Suggested type | Nullability | Purpose |
| --- | --- | --- | --- |
| `id` | `uuid` | Required | Primary key |
| `user_id` | `uuid` | Required | Ticket owner; derived from booking |
| `booking_id` | `uuid` | Required | Related booking |
| `room_id` | `uuid` | Required | Related room; derived from booking |
| `category` | `text` | Required | Service/incident category |
| `description` | `text` | Required | Guest-provided details |
| `media_paths` | `text[]` | Required/default empty | Private Storage object paths |
| `status` | constrained `text` | Required | Pending, In Progress, or Resolved |
| `created_at` | `timestamptz` | Required | Submission timestamp |
| `updated_at` | `timestamptz` | Required | Last status/content update |

The trusted creation path derives `user_id` and `room_id` from `booking_id` and
must prevent inconsistent cross-user/cross-room combinations. Users may not set
operations-only fields or arbitrary status transitions. Do not add priority,
assignment, or SLA machinery without a product requirement.

If media later requires per-file captions, ordering, moderation, or deletion
audits, introduce a dedicated `ticket_attachments` table during migration review.

## 6. Points Calculation and Balance

### Booking points formula and qualification

The only approved formula for booking points is:

```text
points_earned = final_paid_amount_vnd × 0.00025
```

**Decided Product Rule — Base Value:**
Points must be calculated strictly from the **actual final amount paid** by the
guest after deducting any applied loyalty voucher discount. Points are never
calculated from the pre-discount gross booking amount.

Example:

```text
Original gross booking amount: 1,000,000 VND
Voucher discount (40% of 1,000,000 VND): 400,000 VND
Actual final amount paid: 600,000 VND

Booking points earned:
600,000 × 0.00025 = 150 points
```

**Qualification Event:**
Booking points are earned **only after verified successful payment and booking
confirmation**. Points are not awarded when initiating checkout, selecting dates,
or creating a temporary reservation intent.

The calculation runs in a trusted backend/database operation when payment is
verified. The operation reads `final_paid_amount_vnd`, calculates an exact
`numeric(20,4)` result, and idempotently appends one `BOOKING_EARN` transaction.
The client is never permitted to submit `points_earned`.

### Option A — derive balance from the ledger

Calculate a user's balance as the exact sum of
`loyalty_transactions.points_delta`.

Advantages:

- One source of truth
- Strong auditability
- No cache/ledger drift
- Lowest implementation complexity for the initial product

Tradeoff: repeated aggregation can become more expensive at high transaction
volume, so index by `(user_id, created_at)` and measure real workload.

### Option B — cached/materialized balance plus ledger

Store a cached balance on a dedicated loyalty account or profile while retaining
the ledger as source of truth.

Advantages:

- Fast frequent balance reads
- Easier explicit row locking for concurrent spending

Tradeoffs:

- Every write must update ledger and cache atomically.
- Drift detection and reconciliation become necessary.
- Direct cache edits must be prohibited.

### Recommendation

Start with **Option A**: the append-only ledger is the source of truth and balance
is `SUM(points_delta)`. It best matches current priorities of auditability,
consistency, and simplicity. Introduce a cache only after measurement shows a
real need, and keep it derived/rebuildable.

Voucher issuance still requires concurrency control. The trusted transaction
must serialize competing redemption attempts for one user (for example by
locking an appropriate account/profile row or using an equivalent reviewed
database strategy) so two simultaneous requests cannot both spend the same 500
points.

## 7. Atomic Transaction Boundaries & Recovery

No RPC, database function, or trigger is implemented here. A later implementation
must enforce these operations atomically in a trusted server/database layer.

### Daily check-in earn

1. Resolve the trusted business date in `Asia/Ho_Chi_Minh` timezone.
2. Enforce unique `(user_id, checkin_date)`.
3. Create the `daily_checkins` row with reward 5.
4. Append the linked `DAILY_CHECKIN_EARN` transaction with `+5`.

All four steps succeed or none do.

### Atomic booking transaction & payment lifecycle

Because external payment network calls cannot be kept inside a single PostgreSQL
transaction, the checkout and booking lifecycle spans trusted database steps and
an external payment verification step:

1. **Authenticate user:** Confirm `auth.uid() = user_id`.
2. **Validate availability:** Verify room and requested date range `[check_in, check_out)`.
3. **Create checkout session (`checkout_sessions`):**
   - Compute trusted `gross_amount_vnd`.
   - Insert `checkout_sessions` row with requested dates, guest count, and `status = 'ACTIVE'`.
   - Set session `expires_at` based on approved hold duration.
4. **Validate & reserve voucher (if applying):**
   - If applying existing voucher: confirm user ownership, verify `status = 'AVAILABLE'` and `now() < expires_at`, set voucher `status = 'RESERVED'` and attach `checkout_session_id`.
   - If redeeming points during checkout: serialize user loyalty writes, verify balance ≥ 500, append `VOUCHER_REDEEM` (-500) to `loyalty_transactions`, and create `voucher_redemptions` instance with `status = 'RESERVED'`, `expires_at = issued_at + 24 hours`, linked to this checkout session.
5. **Compute trusted financials:**
   - `gross_amount_vnd`
   - `discount_amount_vnd` (40%, capped base 1,000,000 VND, max discount 400,000 VND)
   - `final_payable_amount_vnd = gross_amount_vnd - discount_amount_vnd`
   - Update `checkout_sessions` with calculated snapshot amounts.
6. **Initiate external payment:**
   - Transition checkout session `status = 'PAYMENT_PROCESSING'`.
   - Guest initiates 100% full payment of `final_payable_amount_vnd` through the approved payment provider.
7. **Verify payment & confirm booking:**
   - Upon verified successful payment callback/webhook:
   - Mark checkout session `status = 'COMPLETED'`.
   - Create durable row in `bookings` with frozen financial snapshots (`gross_amount_vnd`, `discount_amount_vnd`, `final_paid_amount_vnd = final_payable_amount_vnd`, `payment_status = 'verified'`, `booking_status = 'confirmed'`).
   - Mark voucher instance `status = 'USED'`, setting `booking_id`, `discount_amount_vnd`, and `used_at`.
8. **Award booking loyalty points:**
   - Compute `points = final_paid_amount_vnd × 0.00025`.
   - Append one linked `BOOKING_EARN` transaction (+points).
9. **Issue booking-scoped Digital Key:**
   - Generate `booking_access_credentials` row with stay access window `[valid_from, valid_until]`.
10. **Commit business state:** Booking is fully confirmed and ready for My Stay.

### Abandoned checkout & session expiration

If the guest closes the browser, abandons checkout, or payment fails without completing:
- The checkout session transitions to `status = 'EXPIRED'` or `'FAILED'`.
- Any attached voucher returns from `RESERVED` to **`AVAILABLE`** (provided `now() < voucher.expires_at`), and `checkout_session_id` is cleared to `NULL`.
- If the voucher reaches its 24-hour expiration while reserved, it transitions to `EXPIRED`.
- The 500 points are **not refunded** because the voucher is not lost and remains usable until its original 24-hour expiration time.

### Three distinct voucher failure & cancellation scenarios

The system strictly distinguishes these three scenarios:

1. **Abandoned checkout / payment expiration:**
   - Voucher: `RESERVED` → `AVAILABLE` (if `now() < expires_at`), `checkout_session_id` cleared to `NULL`.
   - 500 points: **not refunded**; voucher remains valid until original `expires_at`.
2. **Customer voluntary cancellation of completed booking:**
   - Voucher: remains **`USED`** (consumed).
   - 500 points: **not refunded**.
   - Awarded booking points: reversed via append-only `BOOKING_REVERSAL` (-X).
3. **System failure compensation:**
   - Trigger: an internal/system error prevents checkout/booking recovery after points deduction.
   - Ledger: `VOUCHER_REDEMPTION_REVERSAL` (+500) compensating transaction.
   - Voucher: status becomes **`REVOKED`** (permanently invalidated). Cannot be applied to checkout, cannot return to `AVAILABLE`, cannot become `RESERVED`, and cannot be `USED`.
   - Invariant: user NEVER receives +500 compensation while retaining a usable voucher.
   - Preserves audit trail (`-500` followed by `+500`, voucher record retained).
   - Never used for normal checkout abandonment or voluntary cancellation.

## 8. Index and Constraint Direction

Review these indexes/constraints during migration design:

- Unique `properties.slug`.
- Unique `daily_checkins(user_id, checkin_date)` enforcing one reward per account
  per calendar day in `Asia/Ho_Chi_Minh`.
- Unique source links for daily earn, booking earn, and voucher point redemption
  ledger entries (`loyalty_transactions`).
- One-to-one primary key on `room_private_details.room_id`.
- One-to-one primary key on `room_operations.room_id`.
- Foreign-key indexes on room/property, booking/user/room, ticket ownership, and
  loyalty/voucher references.
- Composite index on `checkout_sessions(user_id, status, expires_at)` for session
  lookup and cleanup.
- Foreign-key index on `voucher_redemptions(checkout_session_id)` for session-to-voucher lookup.
- Partial unique index on `voucher_redemptions(checkout_session_id)` where
  `checkout_session_id IS NOT NULL AND status = 'RESERVED'`, strictly enforcing at
  most **one reserved voucher per checkout session** without redundant circular foreign keys.
- Composite index on `booking_access_credentials(booking_id, valid_from, valid_until)`.
- Unique constraint or partial unique index on `voucher_redemptions(booking_id)` where
  `booking_id IS NOT NULL` and `status = 'USED'`, strictly enforcing the rule of at
  most **one voucher per booking**.
- Index on `voucher_redemptions(user_id, status)`.
- Booking lookup indexes for user history and room/date availability.
- Ticket indexes for user/booking views and operations status queues.
- Ledger index beginning with `user_id`, followed by time/order columns.
- A room/date-range exclusion constraint for inventory-blocking bookings in `bookings`
  (`EXCLUDE USING gist (room_id WITH =, daterange(check_in, check_out, '[)') WITH &&)`).
- Positive/non-negative checks for capacity, counts, VND values (`gross >= discount`,
  `final_paid = gross - discount`), and appropriate point amounts.

PostgreSQL does not automatically make every foreign-key access pattern fast;
indexes should follow actual queries rather than being added indiscriminately.

## 9. Row Level Security Direction

RLS must be enabled on every table exposed through the Supabase Data API, with
table grants limited to intended operations. Policy SQL belongs to a later task.
Ownership policies should compare the authenticated Supabase user ID to the
row's `user_id`, or traverse a reviewed ownership relationship such as
booking → user. Authentication alone is not authorization.

### Public / unauthenticated

May read only intentionally public fields from:

- Active `properties`
- Listed `rooms` (where `is_listed = true`)

Because `operational_status` has been moved to `room_operations`, public catalog
queries on `rooms` are safe by design and cannot leak internal operational status.

Must not read or write:

- `room_operations` (internal operational state)
- `checkout_sessions` (temporary checkout attempts)
- `room_private_details` (Wi-Fi and private instructions)
- `booking_access_credentials` (Digital Keys)
- `profiles`
- `bookings`
- `daily_checkins` or `loyalty_transactions`
- `voucher_redemptions`
- `tickets` or ticket media

### Authenticated guest/user

May:

- Read and update allowed fields on the user's own profile.
- Create and manage the user's own `checkout_sessions`.
- Read the user's own confirmed bookings and booking history.
- Read `booking_access_credentials` strictly for the user's own confirmed booking
  and strictly within the approved stay window (`now()` between `valid_from` and
  `valid_until`).
- Read `room_private_details` strictly for a room where the user holds an active,
  confirmed booking within the approved stay window.
- Read the user's own daily check-ins, loyalty transactions, and voucher
  instances.
- Create and read tickets only for the user's own booking.
- Upload/read ticket media only within the user's authorized ticket path.

Must not directly:

- Access `room_operations` (operations-only).
- Create bookings for another user or change booking ownership.
- Insert/update/delete loyalty ledger rows.
- Choose a daily reward date/value.
- Issue a voucher, alter its terms/status, or set the discount amount.
- Read another user's profile, checkout sessions, bookings, Digital Keys, Wi-Fi
  credentials, loyalty, vouchers, or tickets.
- Arbitrarily update ticket status.

Daily check-in, booking earn, voucher issuance, voucher use, payment status, and
sensitive status transitions should pass through reviewed trusted operations.

### Operations/admin

Operations users need broader access to bookings, rooms, room_operations,
room private details, booking access credentials, tickets, and necessary guest
contact data, plus permission to update approved room operational statuses and
ticket statuses, and create audited loyalty adjustments where authorized.

**OPEN SECURITY DESIGN: operations/admin role representation.** Do not assume
that a Supabase Dashboard role is the application's staff role. Choose and test
an application role/claims/membership model before writing policies. Apply least
privilege and separate routine operations access from highly privileged service
credentials.

### Service role

The Supabase service role bypasses RLS. It must remain server-only and must not be
used as a substitute for ownership checks in browser code or broadly exposed
application endpoints.

## 10. Storage Direction

Use a private Supabase Storage bucket such as `ticket-media` for ticket images
and videos. Do not create the bucket in this design task.

Recommended object path convention:

```text
<user_id>/<booking_id>/<ticket_id>/<random_object_id>.<extension>
```

Direction:

- The authenticated uploader's identity must match the first path segment and
  own the referenced booking/ticket.
- Object ownership metadata is useful but does not grant access by itself;
  Storage RLS must enforce read/write/delete authorization.
- Guests may upload to and read only their own authorized ticket paths.
- Operations may read ticket media only through the future approved staff role.
- Keep the bucket private and return short-lived signed access where appropriate;
  never rely on publicly guessable object URLs.
- Validate content type, size, and allowed image/video formats in trusted
  configuration/application logic. Generate random object names rather than
  retaining unsafe user-supplied paths.
- Keep `tickets.media_paths` synchronized with successful object creation and
  define cleanup behavior for abandoned uploads in the implementation design.

## 11. Realtime Direction

Do not enable Realtime on every table by default.

Good candidates:

- `tickets`: guests can see status changes, and operations can see newly created
  or updated tickets. RLS must restrict each subscriber to authorized rows.
- `room_operations.operational_status`: useful for the Operations Dashboard when multiple
  staff members update readiness concurrently. Prefer a private authorized
  channel or a carefully scoped table subscription.

Not initially justified:

- Profiles
- Checkout sessions
- Bookings
- Daily check-ins
- Loyalty transactions/balance
- Voucher definitions or instances
- Public room descriptions and property metadata

Normal request/refresh behavior is simpler for those domains. Realtime should be
enabled only after defining payload exposure, authorization, and scaling needs.

## 12. SCHEMA OPEN DECISIONS

The following business rules are **DECIDED** and no longer open:
- **Booking requires successful full payment:** Decided as mandatory 100% full payment
  of `final_paid_amount_vnd` before booking confirmation. Deposits, partial payments,
  and pay-later are strictly not supported.
- **Temporary checkout session architecture:** Decided that ephemeral checkout/payment
  intent attempts are isolated in `checkout_sessions`. Confirmed bookings exist only
  after payment verification.
- **Voucher reservation single source of truth:** Decided that `voucher_redemptions.checkout_session_id`
  is the single source of truth (`checkout_session ← voucher_redemptions.checkout_session_id`).
  Circular `checkout_sessions.voucher_redemption_id` is eliminated, with a partial unique index
  enforcing at most one reserved voucher per active checkout session.
- **Voucher invalidation on system compensation:** Decided that system failure compensation
  (`VOUCHER_REDEMPTION_REVERSAL` +500) atomically transitions the voucher status to `REVOKED`.
  A user never retains both points compensation and a usable voucher.
- **Abandoned checkout voucher preservation:** Decided that abandoning checkout returns
  a reserved voucher to `AVAILABLE` (if `now() < expires_at`), with no points refund.
- **Three distinct voucher failure & cancellation scenarios:** Decided as defined
  (abandoned checkout vs voluntary customer cancellation vs system failure compensation).
- **Room operations separation:** Decided that internal operational states belong to
  `room_operations`, keeping `rooms` strictly as the safe public catalog.
- **Daily check-in timezone:** Decided as `Asia/Ho_Chi_Minh` (00:00 boundary reset).
- **Booking points qualification event:** Decided as verified payment + booking confirmation.
- **Eligible booking value base:** Decided as the actual final amount paid after voucher
  discounts (`final_paid_amount_vnd × 0.00025`).
- **Voucher expiry:** Decided as 24 hours after issuance (`expires_at = issued_at + 24 hours`).
- **Voucher stacking / count:** Decided as maximum 1 voucher per booking.
- **Digital Key scope:** Decided as booking-scoped, time-bounded to the stay window,
  and architecturally separated from room Wi-Fi.

The following technical and workflow decisions remain **GENUINELY OPEN** and
require human/security/product review before implementation:

1. **Canonical My Stay route (OD01):** choose among `/my-stay`,
   `/my-stay/[bookingId]`, `/stay/[bookingId]`, or another approved form.
2. **My Stay booking locator mechanism (OD02):** long-term combination of QR codes,
   direct links, and Booking Code fallback; authentication remains mandatory.
3. **Payment provider and verification mechanism (OD04):** payment gateway selection,
   webhook/callback signature verification, refund mechanics, and payment status
   machine.
4. **e-KYC (OD05):** identity verification provider, document handling, data retention,
   and storage. No identity document schema is proposed here.
5. **Operations/admin role model:** staff identity representation, custom claims vs
   database roles, permissions matrix, and audit logging.
6. **Exact status identifiers:** database enum or text check constraints for booking
   status, payment status, operational status, checkout session status, and ticket status.
7. **Account deletion & legal retention policy:** handling of bookings, financial
   records, loyalty transactions, and guest data when an Auth user is deleted.
8. **Digital Key integration mechanism:** specific smart lock / IoT provider, PIN
   generation vs dynamic token, encryption key management, and hardware failure
   fallback.
9. **Checkout inventory-hold strategy & hold expiration duration:** temporary reservation
   hold (e.g. 15-minute lock) during payment flow versus optimistic payment with
   conflict-triggered refund workflow.
10. **Payment idempotency & provider integration details:** idempotency key headers,
    callback replay defenses, and gateway retry policies.

## 13. Implementation Review Checklist

Before any SQL or migration is authorized:

- Resolve blocking schema open decisions or explicitly defer nullable fields.
- Review every field, type, nullability rule, and delete behavior.
- Define exact status values and transitions.
- Define grants and RLS policies per operation, then test both allow and deny
  cases for public, authenticated owner, other user, and operations roles.
- Confirm availability exclusion behavior and inventory-blocking statuses.
- Confirm atomic/idempotent daily earn, booking earn, voucher issuance, and
  voucher use operations.
- Verify exact point calculations using 250,000 VND → 62.5 points.
- Verify concurrent daily check-in and voucher redemption tests.
- Verify public catalog queries cannot expose room access credentials.
- Verify ticket media Storage policies and signed-access behavior.
- Review indexes against intended queries.
- Keep all SQL, migrations, functions, triggers, seed data, buckets, and policy
  code in a separately authorized implementation task.

## 14. Design References

- [Supabase: Managing user data](https://supabase.com/docs/guides/auth/managing-user-data)
- [Supabase: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase: Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
- [Supabase: Storage ownership](https://supabase.com/docs/guides/storage/security/ownership)
- [Supabase: Subscribing to database changes](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes)
- [PostgreSQL: Numeric types](https://www.postgresql.org/docs/current/datatype-numeric.html)
- [PostgreSQL: Range types and exclusion constraints](https://www.postgresql.org/docs/current/rangetypes.html)
