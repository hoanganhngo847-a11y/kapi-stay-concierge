# Kapi Stay Concierge — Architecture

> **TECHNICAL DIRECTION**  
> This document distinguishes what exists in the repository today from the
> intended architecture. `TARGET` does not mean implemented.

## Architecture Principles

- Next.js remains the web application framework.
- Supabase is the selected backend for Auth, Database, Realtime, and Storage.
- Guests choose rooms themselves; no AI recommendation, ranking, or selection
  layer belongs in the architecture.
- Product decisions and open questions are governed by
  `docs/PROJECT_GUIDE.md`.
- New routes, schema fields, packages, and auth providers require explicit task
  scope or a new team decision.
- Google Login through Supabase Auth is mandatory before booking and My Stay.
  Guest and anonymous booking are not supported; every booking created through
  the application belongs to an authenticated user (OD06, decided).
- Secrets remain server-side or in the appropriate provider configuration and
  are never committed.

## Current Repository State — CURRENT

The repository is currently a front-end prototype built with the Next.js App
Router, React, TypeScript, and Tailwind CSS. `@supabase/supabase-js` is declared
as a dependency, but no Supabase client, authentication flow, database access,
realtime subscription, or storage integration is present in the inspected
application files.

### Current routes

| Route | Source | Current behavior |
| --- | --- | --- |
| `/` | `app/page.tsx` | Landing page with room CTA and a demo Booking Code modal that navigates to `/my-stay?code=...` |
| `/rooms` | `app/rooms/page.tsx` | Static sample room list with local data and selection buttons |
| `/my-stay` | `app/my-stay/page.tsx` | Demo Booking Code lookup UI; uses a timeout and alert rather than backend validation |

`app/layout.tsx` also links to `/admin/dashboard`, but no matching route file
exists in the current repository. The link is not proof of an implemented
Operations Dashboard.

### Current supporting structure

```text
app/layout.tsx       Shared layout, navigation, and footer
app/globals.css      Global styles and theme tokens
components/ui/       Shared Badge, Button, Input, and Modal primitives
lib/utils.ts         Shared class-name utility
```

There are currently no implemented booking-detail routes, room-detail routes,
payment APIs, authentication routes, Supabase schema files, or operations route
files in the inspected tree.

## Target Architecture — TARGET

The planned high-level request path is:

```text
Browser
   ↓
Next.js App Router
   ↓
Application/data access layer (for example, lib/api.ts and domain modules)
   ↓
Supabase
├── Auth
├── Database
├── Realtime
└── Storage
```

The data-access filenames and boundaries shown above are architectural direction,
not existing files or permission to create them in an unrelated task.

### Responsibilities

#### Next.js App Router

- Render public booking, authenticated guest, and operations experiences.
- Enforce the appropriate server/client boundaries using the repository's local
  Next.js documentation.
- Validate inputs and authorization at trusted boundaries.
- Avoid exposing privileged credentials to the browser.

#### Application/data access layer

- Centralize calls to Supabase rather than scattering raw data access throughout
  presentation components.
- Express domain operations for bookings, stays, tickets, rooms, profiles, and
  loyalty.
- Keep UI components independent from physical schema details where practical.
- Preserve authorization and error handling across callers.

#### Supabase

- **Auth:** Google OAuth and user sessions
- **Database:** durable domain records and status changes
- **Realtime:** operational updates where live synchronization is justified
- **Storage:** supported guest-uploaded media and other approved assets

Supabase is the selected backend. Firebase, MongoDB, a separate
Prisma/PostgreSQL stack, and an Express backend are not approved replacements.

## Domain Boundaries — TARGET

### Public Booking

Owns property/room discovery, filters, availability, room details, guest room
selection, checkout session progression, full payment, and booking confirmation.
Deposits and partial payments are not supported. It must not contain AI room
recommendations or automatically choose a room. Public visitors may browse
through room details, but the booking flow requires Google Login before a
checkout session or booking can be created.

### Authentication

Owns Google Login through Supabase Auth, session handling, and the link between
an authenticated identity and a guest profile, bookings, and loyalty. Google
Login is mandatory before booking and My Stay. No additional auth provider and
no anonymous booking flow are approved.

### Loyalty

Owns the points balance and immutable or auditable earn/deduct history linked to
an authenticated guest account. OD03 is decided: one daily check-in earns 5
points in the `Asia/Ho_Chi_Minh` timezone, booking points are earned upon verified
payment and booking confirmation based on the actual final amount paid
(`final_paid_amount_vnd × 0.00025`), and 500 points redeems a 40% voucher whose
eligible base is capped at 1,000,000 VND (maximum discount 400,000 VND), expiring
in 24 hours with a limit of one voucher per booking. Customer cancellation does
not refund voucher points and reverses booking earn; system failure compensates
deducted voucher points and revokes the voucher (status REVOKED). Exact decimal
arithmetic and the transaction ledger are required.

### My Stay

Owns authorized post-booking access to room/check-in details, booking-scoped
Digital Key, Wi-Fi, Digital Guest Guide, service requests, incident tracking, and
checkout. Digital Key credentials belong to a specific booking and room, valid
only within the approved stay window. Room Wi-Fi credentials remain separate
room-level sensitive data. Access requires an authenticated user who owns the
booking. Its canonical route (OD01) and permanent booking locator method (OD02)
remain open. Secure direct links, QR codes, or Booking Code fallback may
identify the booking only after authentication; they do not replace it.

### Operations

Owns operational room views, same-day arrivals/departures, cleaning/readiness
workflow, ticket queues, and permitted status updates. Advanced reporting is a
possible later capability rather than a current implementation requirement.

## Data Direction — TARGET

The proposed physical model is documented in
`docs/SUPABASE_SCHEMA_DESIGN.md`. Its logical domains include:

- `profiles`
- `properties`
- `rooms` (public room catalog)
- `room_private_details` (room-level Wi-Fi and private instructions)
- `room_operations` (internal operational readiness and cleaning state)
- `checkout_sessions` (temporary checkout and payment intent state)
- `bookings` (durable confirmed reservations)
- `booking_access_credentials` (booking-scoped Digital Key credentials)
- `tickets`
- `daily_checkins`
- `loyalty_transactions`
- `vouchers`
- `voucher_redemptions`

The design document is a reviewed proposal, not an implementation. Its central
constraints are that `profiles.id` maps to `auth.users.id`, `bookings.user_id`
is required, point deltas use exact decimal storage, and the loyalty ledger is
the balance source of truth. SQL, migrations, functions, triggers, grants, and
RLS policy definitions still require a separate implementation task and review.

## Route Direction

### CURRENT

- `/`
- `/rooms`
- `/my-stay`

Only these routes have matching page files in the current repository. The manual
Booking Code lookup on `/my-stay` reflects current prototype behavior rather than
an approved permanent access architecture.

### TARGET / not yet implemented

The product needs routes or equivalent application surfaces for room details,
booking/payment, authenticated account history and loyalty, the complete My Stay
experience, and Operations. Exact URLs have not been approved by the supplied
product decisions and must not be invented during unrelated work.

**OPEN DECISION — Canonical My Stay Route (OD01):** choose among `/my-stay`,
`/my-stay/[bookingId]`, `/stay/[bookingId]`, or another explicitly approved form
before refactoring. Do not treat any route as canonical until approved.
QR/direct-link access and fallback Booking Code access (OD02), along with
the mandatory authentication boundary from decided OD06, must be handled
without prematurely removing the current flow. A booking locator never grants
My Stay access by itself.

The existing `/admin/dashboard` navigation link does not establish that path as
the approved canonical Operations route.

## Key Workflows — TARGET

### Booking

```text
Browse/filter rooms
→ guest selects a room/dates
→ Google Login required
→ authenticated account
→ start checkout session
→ optionally redeem/apply loyalty voucher (status becomes RESERVED)
→ full payment
→ verified payment succeeds
→ booking confirmed as a valid reservation
→ mark voucher USED
→ calculate points from actual final paid amount
→ append BOOKING_EARN transaction
→ authenticated My Stay (with booking-scoped Digital Key)
```

The product requires 100% full verified payment before a room becomes a confirmed
booking; deposits, partial payments, and creating a booking first to pay later are
not supported. Temporary checkout state is isolated in `checkout_sessions`. If
checkout is abandoned or expires, any reserved voucher returns to `AVAILABLE` (if
within its 24-hour expiration) and no points are refunded. Demo self-confirmation
and production-grade payment verification remain distinct implementation levels (OD04).

### Stay and checkout

```text
Authenticated user with own valid booking
→ authorized My Stay access
→ self-service and ticket tracking
→ 1-click checkout
→ room waits for cleaning
→ staff restores room readiness
```

Authorized My Stay access requires Google Login and ownership of the booking.
The canonical route and locator method still depend on OD01 and OD02. Digital Key
credentials are time-bounded to the stay window.

### Loyalty

```text
Authenticated daily check-in
→ validate calendar date in Asia/Ho_Chi_Minh
→ enforce one check-in per account per day
→ append +5 ledger transaction

Verified successful booking payment
→ calculate actual final amount paid after voucher
→ final_paid_amount_vnd × 0.00025
→ append exact BOOKING_EARN transaction

Voucher redemption during booking transaction:
Balance at least 500
→ atomically append VOUCHER_REDEEM (-500)
→ issue one 40% voucher instance (expires in 24 hours)
→ cap eligible discount base at 1,000,000 VND (max discount 400,000 VND)
→ apply to current checkout via voucher_redemptions.checkout_session_id (single source of truth; max 1 voucher per checkout)

Compensating transactions:
- Voluntary cancellation: voucher points not refunded; append BOOKING_REVERSAL (-X)
- System failure during booking/payment: append VOUCHER_REDEMPTION_REVERSAL (+500) and mark voucher REVOKED
```

Reward calculations and voucher issuance must run in a trusted
backend/database transaction, not from client-submitted point values.

### Ticket lifecycle

```text
Pending → In Progress → Resolved
```

Realtime can later synchronize justified operational updates, but its use does
not remove the need for authorization and persisted status transitions.

## Security and Configuration Direction

- Use the Supabase public project URL and anon key only in approved public client
  configuration.
- Never expose or commit the Supabase service role key or Google OAuth client
  secret.
- Store local environment values in an ignored file such as `.env.local`.
- Enforce data access with an approved authorization model and Supabase Row Level
  Security when schema work begins.
- Treat door codes, Digital Keys, booking access, identity documents, and guest
  media as sensitive data.
- e-KYC using CCCD/Passport is planned but remains an open technical decision;
  no provider or data-retention design is currently approved.
- Require an authenticated session and booking ownership before returning My
  Stay data, including room access credentials.
- Keep public room/property metadata separate from door codes, Digital Keys,
  Wi-Fi passwords, private bookings, loyalty, vouchers, and tickets.

## Decisions Required Before Implementation

1. Canonical My Stay route (OD01)
2. QR/direct-link and Booking Code access/security model (OD02)
3. Production payment provider and verification flow (OD04)
4. e-KYC provider, workflow, security, and data retention (OD05)
5. Operations/admin role representation
6. Final physical schema, status values, RLS policies, and transactional
   implementation based on the approved schema design
7. Canonical URLs and access-control model for Operations and remaining product
   surfaces

OD03 (Loyalty Rules) and OD06 (Authentication Requirement) are decided. Until
the remaining items are decided, implementation must preserve existing
compatibility and avoid encoding speculative business rules.
