# Kapi Stay Concierge — Project Guide

> **PRODUCT SOURCE OF TRUTH**  
> This document defines the approved product direction. Do not infer business
> rules that are absent here, and do not silently resolve items marked
> **OPEN DECISION**.

## 1. Product Identity

- **Business / brand:** Kapi House
- **Product:** Kapi Stay Concierge
- **Model:** A web app for guest self-service and homestay operations in a self
  check-in, no-front-desk setting.

## 2. Problem Statement

Kapi House needs a single digital guest journey that reduces dependence on
manual Facebook and Zalo conversations. Guests should be able to book, check in,
find stay information, request services, report incidents, and check out with
less staff intervention. Staff need a central operational view of rooms and
tickets.

## 3. Product Goals

- Let guests discover and book rooms themselves.
- Reduce manual booking and support conversations on Facebook and Zalo.
- Support self check-in and self-service throughout a stay.
- Digitize service requests and incident reporting.
- Give staff a centralized place to manage room and ticket status.

## 4. User Roles

### Public visitor

Explores properties and rooms, filters availability, views room details, and
can initiate a booking intent. Authentication is required before the booking
flow can continue.

### Guest

An authenticated customer. Google Login is required before booking and before
accessing My Stay. Every booking created through Kapi Stay Concierge belongs to
an authenticated user; guest or anonymous booking is not supported.

### Operations staff / admin

Uses the Operations Dashboard to monitor stays, room readiness, arrivals,
departures, and tickets, and to update operational statuses.

No additional role model or permission matrix has been approved yet.

## 5. Product Areas

The approved product areas are:

1. Public Booking
2. Authentication
3. Loyalty
4. My Stay
5. Operations Dashboard

Supabase is the selected backend direction for these areas, but backend
implementation and detailed schema design are outside this document's current
scope.

## 6. Public Booking Flow

The intended journey is:

```text
Home
→ browse properties and rooms
→ filter rooms
→ view room details
→ choose a room
→ Google Login required
→ authenticated account
→ start checkout session
→ optionally apply loyalty voucher (max 1 per booking)
→ full payment
→ verified payment succeeds
→ booking confirmed as a valid reservation
→ My Stay (with booking-scoped Digital Key)
```

A user must successfully complete 100% of the required payment
(`final_paid_amount_vnd`) before the room becomes a confirmed booking. Deposits,
partial payments, and creating a booking first to pay later are strictly not supported.
Temporary checkout state is isolated in checkout sessions before confirmed reservation
creation.

Supported discovery filters include:

- Property/location
- Check-in date
- Check-out date
- Guest count
- Room availability

The guest makes the room choice. There is **no AI room recommendation, AI room
ranking, or automatic AI room selection**.

## 7. Google Authentication

The product includes **Sign in with Google**, planned through Supabase Auth and
Google OAuth. Authentication is required before booking and before My Stay. It
supports:

- Customer identity
- Guest profiles
- Linking bookings to an account
- Booking history
- Loyalty points and membership management

Every booking created through Kapi Stay Concierge must belong to an
authenticated user. Guest and anonymous booking are not supported. Loyalty and
booking history belong to the authenticated account. These are approved target
rules, not a statement that authentication has already been implemented.

## 8. Loyalty System

Loyalty belongs only to authenticated users. Each account has a current points
balance and an auditable history of points earned and deducted.

The approved rules are:

- **Daily check-in:** once per account per calendar day in the **`Asia/Ho_Chi_Minh`**
  timezone, earning **5 points**. Day boundaries reset at 00:00 `Asia/Ho_Chi_Minh`;
  UTC calendar days must not be used.
- **Booking earn qualification:** points are earned only after **successful verified
  payment and booking confirmation**. Initiating checkout or temporary intents do
  not qualify.
- **Booking earn rate:** **1 VND = 0.00025 point**.
- **Booking points calculation base:** points are computed strictly from the
  **actual final amount paid by the guest after voucher discounts**
  (`final_paid_amount_vnd`). Points are not calculated from the pre-discount gross
  amount.
- **Voucher conversion:** **500 points** redeems one **40% discount voucher** and
  deducts 500 points through the loyalty transaction history (`VOUCHER_REDEEM`).
- **Voucher limit:** the voucher's discount calculation base is capped at
  **1,000,000 VND**, producing a maximum discount of **400,000 VND**.
- **Voucher expiry:** a voucher expires **24 hours** after issuance (`expires_at =
  issued_at + 24 hours`). Expiry is an elapsed 24-hour duration, not end-of-calendar-day.
  Expired vouchers cannot be used, and expired points are not refunded.
- **One voucher per booking:** each booking may use at most **one** loyalty voucher.
  Stacking multiple vouchers on a single booking is prohibited.
- **Voucher checkout reservation:** `voucher_redemptions.checkout_session_id` is the
  single source of truth for attaching a voucher to an in-progress checkout session
  (no circular foreign key on `checkout_sessions`). When attached, the voucher enters
  a temporary `RESERVED` status and cannot be used concurrently in another checkout.
- **Voucher lifecycle states:** supports `AVAILABLE`, `RESERVED`, `USED`, `EXPIRED`,
  and `REVOKED`.
- **Three voucher cancellation and failure scenarios:**
  1. **Abandoned checkout / payment timeout:** if the guest abandons checkout, closes
     the browser, or payment fails without completing, the voucher returns from
     `RESERVED` to **`AVAILABLE`** (provided `now() < expires_at`). The 500 points are
     **not refunded** because the voucher is not lost and remains valid until its
     original 24-hour expiration time.
  2. **Customer voluntary cancellation:** if a guest voluntarily cancels a completed
     booking where a voucher was applied, the **500 points spent on the voucher are
     not refunded** (voucher remains permanently consumed / `USED`). If booking points
     (`BOOKING_EARN`) were previously awarded, they are reversed via an append-only
     `BOOKING_REVERSAL` ledger entry.
  3. **System failure compensation:** if a booking/payment operation fails due to system
     error after points were deducted and the transaction cannot safely recover, the
     500 points are compensated back to the user via an append-only
     `VOUCHER_REDEMPTION_REVERSAL` ledger transaction (+500) and the voucher status is
     permanently set to **`REVOKED`**. A user never receives points compensation while
     retaining a usable voucher. This is strictly for system failures, never for checkout
     abandonment or voluntary cancellation.

Example of booking points with voucher discount:

```text
Gross booking amount: 1,000,000 VND
Voucher discount (40% of 1,000,000 VND): 400,000 VND
Actual final amount paid: 600,000 VND
Points earned: 600,000 × 0.00025 = 150 points
```

The exact formula is:

```text
points_earned = final_paid_amount_vnd × 0.00025
```

Point values can be fractional and must be represented exactly with `numeric`
arithmetic rather than floating-point types. The transaction ledger is the sole
source of truth; a balance field alone is insufficient.

## 9. My Stay

My Stay is the post-booking area for an authenticated user with an authorized
booking. Google Login is mandatory before access.

Key stay capabilities:

- **Digital Key / Door access credentials are booking-scoped:** access credentials
  belong to a specific booking and room, and are strictly time-bounded to the
  approved stay window (`valid_from` to `valid_until`). They are not static room
  properties and must not be exposed before or after the permitted stay window.
- **Wi-Fi credentials remain room/property scoped:** Wi-Fi SSID and password are
  sensitive property/room attributes managed separately from booking-specific door
  credentials.

After authentication, the system may use a secure direct link, QR code, or
Booking Code fallback to locate the relevant booking. These mechanisms do not
replace authentication. Their permanent combination remains open under OD02.

My Stay brings together:

- Room information
- Property address
- Google Maps access
- Booking-scoped door code / Digital Key
- Wi-Fi network and password
- Check-in information
- Digital Guest Guide
- Service requests
- Incident tickets and their status
- Checkout

The canonical URL for My Stay has not been approved (see **OD01 — Canonical My
Stay Route**). Booking Code access must not be removed while **OD02** remains
open.

## 10. Digital Guest Guide

The guide provides concise, practical assistance during the stay through video,
images, and short microcopy. Content can cover:

- Water heater
- Door lock
- Induction cooktop
- Air conditioner
- Washing machine, where available at the property
- Food recommendations
- Cafes
- Pharmacies
- Nearby amenities

## 11. Service Requests

Guests can submit suitable stay-related requests, including:

- Bottled water
- Towels
- Borrowing an iron
- Room cleaning
- Vehicle rental
- Late checkout
- Other appropriate additional services

Pricing, fulfillment rules, availability, and approval workflows are not defined
unless separately approved by the team.

## 12. Ticket System

For an incident, a guest can:

- Select an incident category
- Enter a description
- Attach images or video when supported
- Submit a ticket
- Track its status

The minimum status flow is:

```text
Pending → In Progress → Resolved
```

Operations staff can view tickets and change their status. Detailed priority,
assignment, escalation, and service-level rules are not yet defined.

## 13. Checkout

The product includes **1-Click Checkout**. The intended operational transition
is:

```text
Guest checks out
→ room status becomes Waiting for Cleaning
→ room appears in the Operations Dashboard
→ staff handles cleaning/readiness
→ room returns to an available/ready state
```

Exact status identifiers and automation rules belong to future data and workflow
design; this document does not define database enum values.

## 14. Operations Dashboard

The staff/admin area includes at minimum:

- Occupied rooms
- Available rooms
- Rooms waiting for cleaning
- Today's check-ins
- Today's check-outs
- Ticket list
- Ticket status updates
- Room status updates

Possible later reporting includes ticket volume, common incident categories,
and average resolution time. These reports are not required as part of the
minimum dashboard scope.

## 15. Product Scope

The approved scope is a web application covering:

- Guest-led room discovery, filtering, selection, checkout, and full payment (no deposits)
- Mandatory Google Login before booking and My Stay; every booking belongs to an
  authenticated account and guest booking is not supported
- Loyalty points and transaction history under the decided daily check-in,
  booking earn, and voucher rules (OD03)
- Post-booking self-service through My Stay (canonical route and permanent
  booking locator method remain open under OD01 and OD02)
- Digital stay guidance, service requests, and incident tickets
- 1-click checkout and the cleaning/readiness handoff
- Centralized room and ticket operations

Supabase is the selected backend for Auth, Database, Realtime, and Storage. The
expected data domains include `profiles`, `rooms`, `bookings`, `tickets`, and
loyalty data such as `loyalty_transactions`. These are domain directions, not an
approved physical schema.

## 16. Out of Scope

The following are not part of the approved product scope:

- AI room recommendation
- AI room selection or ranking
- Native mobile apps
- A social network
- An AI chatbot
- Cryptocurrency
- Blockchain

Adding any of these requires a new team decision. They must not be inferred from
general product goals.

## 17. Decision Register

### OD01 — Canonical My Stay Route

Possible forms currently include:

```text
/my-stay
/my-stay/[bookingId]
/stay/[bookingId]
```

**OPEN DECISION:** The canonical route must be approved by the team before any
route refactor. Do not change existing route code to settle this question.

### OD02 — Booking Code Access

- **CURRENT:** The repository currently implements manual Booking Code entry (`/my-stay` and landing page modal).
- **PRODUCT REQUIREMENT:** Booking Code has not been confirmed as a permanent or mandatory product requirement.
- **TARGET:** QR codes, secure direct links, and authenticated account access may co-exist, with Booking Code possibly serving as a fallback.
- **OPEN DECISION:** Confirm the permanent access methods, security model, and whether manual Booking Code entry is retained long-term. Do not remove Booking Code access while this decision is open.

### OD03 — Loyalty Rules

**DECIDED — Loyalty Rules**

- Loyalty belongs only to authenticated users.
- Daily check-in: one per account per calendar day in the **`Asia/Ho_Chi_Minh`**
  timezone, earning **5 points** (day boundary 00:00 `Asia/Ho_Chi_Minh`).
- Booking earn qualification: points are awarded only upon **verified successful
  payment and confirmed booking**.
- Booking earn rate: **1 VND = 0.00025 point**, calculated strictly from the
  **actual final amount paid after voucher discounts** (`final_paid_amount_vnd`).
- 500 points redeems one 40% voucher and produces an append-only `VOUCHER_REDEEM`
  ledger transaction (-500).
- The voucher discount base is capped at 1,000,000 VND (maximum discount 400,000 VND).
- Voucher expiry: exactly **24 hours** after issuance (`issued_at + 24 hours`).
  Expired vouchers cannot be used and points are not refunded.
- Maximum **one voucher per booking**; stacking is prohibited.
- Customer voluntary cancellation: voucher points are **not refunded**; any
  awarded booking earn points are reversed via `BOOKING_REVERSAL`.
- System failure compensation: if checkout/booking fails due to system error
  after points were deducted, the 500 points are compensated via
  `VOUCHER_REDEMPTION_REVERSAL` (+500) and the voucher is permanently revoked
  (`REVOKED`).
- Points may be fractional and require exact `numeric` arithmetic and an auditable
  transaction ledger.

### OD04 — Payment Verification

The repository may use a demo action such as “Tôi đã chuyển khoản thành công,”
while the product vision aims for automatic booking confirmation.

**OPEN DECISION:** Demo payment confirmation and production payment verification
are different implementation levels. The production provider, verification
mechanism, and booking-confirmation rules must be approved before integration.

### OD05 — e-KYC

The product vision mentions identity verification using CCCD or Passport.

**PLANNED / OPEN TECHNICAL DECISION:** The provider, data handling, security,
retention, and guest flow are not approved. Do not implement e-KYC by
assumption.

### OD06 — Authentication Requirement

**DECIDED — Authentication Requirement**

- Google Login through Supabase Auth and Google OAuth is required before
  booking.
- Google Login is required before accessing My Stay.
- Guest and anonymous booking are not supported.
- Every booking created through Kapi Stay Concierge belongs to an authenticated
  user.
- Loyalty and booking history belong to the authenticated account.
- An unauthenticated visitor may view Home, the room list, and room details, but
  must authenticate before continuing into booking or My Stay.

QR codes, direct links, and a possible Booking Code fallback may locate a
booking after authentication; they do not bypass the authentication requirement.

## 18. Terminology

| Term | Canonical meaning |
| --- | --- |
| **Kapi House** | The business and brand |
| **Kapi Stay Concierge** | The web app product |
| **My Stay** | The post-booking area for an authenticated user with an authorized booking |
| **Operations Dashboard** | The operational area for staff/admin users |
| **Booking** | A room reservation/order |
| **Ticket** | A service request or incident that requires handling and status tracking |
