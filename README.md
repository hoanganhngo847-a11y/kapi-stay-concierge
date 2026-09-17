# Kapi Stay Concierge

## Overview

Kapi Stay Concierge is Kapi House's web app for self check-in homestays without
a front desk. It supports the guest journey from room discovery and booking to
self-service during a stay, while giving operations staff one place to manage
rooms and tickets.

**No AI room recommendation. Guests choose rooms themselves.** The product does
not use AI to rank or select a room.

## Core Features

- Room discovery, filtering, and booking (full payment required before booking confirmation; no deposits)
- Google Login is required before booking and My Stay; guest booking is not
  supported (approved target behavior, not implemented yet)
- Loyalty points and transaction history: daily check-in earns +5 points (Asia/Ho_Chi_Minh timezone), booking
  earns 0.00025 point per actual final VND paid, and 500 points redeems one 40% voucher with a
  1,000,000 VND eligible-base cap (max discount 400,000 VND, 24-hour expiry, max 1 voucher per booking)
- My Stay for check-in details, booking-scoped digital keys, Wi-Fi, and stay information
  (canonical route and long-term Booking Code access remain open decisions)
- Digital Guest Guide with device instructions and local recommendations
- Service requests and incident tickets
- 1-click checkout that moves the room into a waiting-for-cleaning state
- Operations Dashboard for rooms, arrivals, departures, and tickets (planned; not implemented yet)

## Tech Stack

- Next.js 16.3.5 with the App Router
- React 19.2.8
- TypeScript
- Tailwind CSS 4
- Supabase (selected backend for Auth, Database, Realtime, and Storage; integration
  is not implemented yet)

## Project Structure

```text
app/                    Existing Next.js routes and global layout
components/ui/          Shared UI primitives
lib/                    Shared utilities; backend integration is not present yet
docs/PROJECT_GUIDE.md   Product source of truth
docs/ARCHITECTURE.md    Current state and target technical direction
docs/SUPABASE_SCHEMA_DESIGN.md Proposed schema; not implemented
AGENTS.md               Repository rules for coding agents
```

The routes currently implemented in the repository are `/`, `/rooms`, and
`/my-stay`. See the architecture document before assuming that a linked or
planned route has been implemented.

## Getting Started

Prerequisites: a Node.js/npm environment compatible with the versions declared
by this repository.

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Available checks are:

```bash
npm run lint
npm run build
```

## Environment Variables

Supabase is planned but not wired into the current application. When that work
is authorized, the expected public client configuration is:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-project-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
```

Do not commit `.env.local`, API keys, the Supabase service role key, or the
Google OAuth client secret. Google OAuth secrets belong in the appropriate
provider/Supabase configuration, not in browser-exposed variables.

## Development Rules

Read `AGENTS.md` before making changes. Keep work within the requested files,
reuse `components/ui/` for interface primitives, and do not add routes, schema
fields, packages, or product features without explicit authorization.

## Documentation

- [Product guide](docs/PROJECT_GUIDE.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Supabase schema design](docs/SUPABASE_SCHEMA_DESIGN.md)
- [Team file ownership](docs/TEAM_FILE_OWNERSHIP.md)
- [Feature owners](docs/FEATURE_OWNERS.md)

The product guide is authoritative for scope and terminology. Open decisions in
that guide must be resolved by the team rather than inferred during
implementation. OD03 and OD06 are decided; OD01, OD02, OD04, and OD05 remain
open.
