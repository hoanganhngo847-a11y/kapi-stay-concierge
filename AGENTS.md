<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Kapi Stay Concierge Project Rules

## Source of truth

Before changing code or product behavior, read these files in order:

1. `AGENTS.md`
2. `docs/PROJECT_GUIDE.md`
3. `docs/ARCHITECTURE.md`
4. `docs/TEAM_FILE_OWNERSHIP.md`
5. `docs/FEATURE_OWNERS.md`

`docs/PROJECT_GUIDE.md` is the product source of truth. `docs/ARCHITECTURE.md`
defines the current repository state and the approved technical direction. Keep
the distinction between `CURRENT` and `TARGET`; planned behavior must not be
described as implemented.

## Team file ownership

Before editing project files, contributors and coding agents must read:

`docs/TEAM_FILE_OWNERSHIP.md`

Before starting feature work, also read:

`docs/FEATURE_OWNERS.md`

Respect FEATURE-OWNED, SHARED, and PROTECTED file boundaries. Do not modify
protected files without authorization.

Before Supabase schema or backend work, also read
`docs/SUPABASE_SCHEMA_DESIGN.md`. It is a reviewed design proposal, not evidence
of an implemented schema; SQL and migrations require separate authorization.

## Product scope discipline

- Do not add product scope without an explicit team decision.
- Do not add AI room recommendations, AI room selection, or AI room ranking.
  Guests choose rooms themselves.
- Do not introduce a new route, database field, package, or authentication
  provider unless the task explicitly requires it.
- Do not resolve an item marked `OPEN DECISION` by assumption. Record or request
  the team decision first.
- Authentication is mandatory before booking and before My Stay. Use Google
  Login through Supabase Auth; do not implement guest or anonymous booking.
- Every booking created through Kapi Stay Concierge must belong to an
  authenticated user, and loyalty belongs only to authenticated users.
- Do not change the approved loyalty formulas, reward values, or voucher terms
  without a new team decision. Follow `docs/PROJECT_GUIDE.md` for the current
  rules.
- Booking points are calculated from the actual final amount paid after voucher
  discounts (`final_paid_amount_vnd × 0.00025`).
- Full payment is required before a booking is confirmed; deposits and partial payments
  are not supported.
- Checkout sessions (`checkout_sessions`) model temporary checkout/payment attempts
  before confirmed booking creation (`bookings`).
- `voucher_redemptions.checkout_session_id` is the single source of truth for
  temporary voucher-to-checkout reservations; `checkout_sessions` does not store a
  circular `voucher_redemption_id`.
- Voucher redemption costs 500 points, expires 24 hours after issuance, and at
  most one voucher may be applied per booking.
- When a user abandons checkout, a reserved voucher returns to `AVAILABLE` until its
  original expiration; points are not refunded.
- Customer voluntary cancellation does not refund voucher redemption points;
  system failure during checkout compensates points (+500) and atomically marks the
  voucher as `REVOKED` so a user never retains both points and a usable voucher.
- Digital Key credentials are booking-scoped and time-bounded to the stay
  window; they are not static room properties.
- Room operational status belongs to internal operations (`room_operations`),
  separated from the public room catalog (`rooms`).
- Change only the files required by the task. Do not opportunistically refactor
  unrelated files.

## Backend direction

Supabase is the selected backend for authentication, database, realtime, and
storage. Do not replace it with Firebase, MongoDB, a separate Prisma/PostgreSQL
stack, or an Express backend unless the team makes a new architecture decision.

The intended authentication provider is Google through Supabase Auth. Do not
add another provider without an explicit requirement. Google Login is required
before booking and My Stay; guest booking is not supported.

## File safety and compatibility

Before editing a file:

1. Inspect its current implementation.
2. Find its callers, imports, routes, and other dependencies.
3. Preserve compatibility unless the task explicitly authorizes a breaking
   change.

Keep existing framework-generated instructions in this file. For framework
work, follow the relevant local Next.js documentation as required by the block
above.

## Package policy

Do not run `npm install` or `npm uninstall`, and do not modify `package.json` or
the lockfile, unless the task explicitly authorizes package changes.

## UI consistency

Reuse the shared primitives in `components/ui/` before creating custom button,
input, badge, or modal styles. UI changes still require explicit task scope.

## Secrets

Never commit secrets or local credentials, including:

- `.env.local`
- API keys
- the Supabase service role key
- the Google OAuth client secret

Only document environment-variable names and use safe placeholders in examples.

## Before completion

- Review the final diff and confirm that only in-scope files changed.
- Run checks proportional to the change. For code changes, this normally includes
  `npm run lint` and `npm run build` when applicable.
- A documentation-only task does not require a build unless its scope or risk
  makes one necessary.
- Do not commit or push unless the task explicitly requests it.
