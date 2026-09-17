-- ============================================================================
-- Migration: 20260917114000_initial_kapi_schema.sql
-- Description: Initial Supabase schema for Kapi Stay Concierge (Phase 1)
-- Authoritative schema source of truth.
-- ============================================================================

-- 1. Extensions
-- Note: btree_gist extension is deferred until booking inventory exclusion constraints
-- are implemented in a future migration with finalized inventory-blocking statuses.

-- 2. Helper Functions
-- Generic updated_at trigger function. Marked SECURITY INVOKER with immutable search_path.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Revoke default public, anon, and authenticated execution to enforce least privilege.
-- Triggers execute the function internally on update without requiring client RPC privileges.
revoke all on function public.set_updated_at() from public, anon, authenticated;
grant execute on function public.set_updated_at() to postgres, service_role;

-- ============================================================================
-- 3. Application Tables (13 Tables)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 3.1 profiles
-- One-to-one application profile associated with an auth.users record.
-- Uses ON DELETE RESTRICT to protect auditable booking and loyalty history.
-- ----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  display_name text null,
  avatar_url text null,
  phone text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger tr_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3.2 properties
-- Kapi House branches / locations.
-- ----------------------------------------------------------------------------
create table public.properties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  address text not null,
  maps_url text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger tr_properties_updated_at
  before update on public.properties
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3.3 rooms
-- Public catalog data only.
-- Sensitive operational and access state are separated into other tables.
-- ----------------------------------------------------------------------------
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete restrict,
  name text not null,
  description text null,
  nightly_price_vnd bigint not null check (nightly_price_vnd > 0),
  capacity integer not null check (capacity > 0),
  amenities text[] not null default '{}',
  image_paths text[] not null default '{}',
  is_listed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger tr_rooms_updated_at
  before update on public.rooms
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3.4 room_operations
-- Strictly internal housekeeping / readiness / maintenance state.
-- Public and guest roles have NO read or write access.
-- ----------------------------------------------------------------------------
create table public.room_operations (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  operational_status text not null default 'ready',
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id) on delete set null
);

create trigger tr_room_operations_updated_at
  before update on public.room_operations
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3.5 room_private_details
-- Sensitive property/room infrastructure (Wi-Fi and private instructions).
-- Public/anonymous access prohibited. Access restricted to authorized stay window.
-- ----------------------------------------------------------------------------
create table public.room_private_details (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  wifi_ssid text null,
  wifi_password text null,
  private_instructions text null,
  updated_at timestamptz not null default now()
);

create trigger tr_room_private_details_updated_at
  before update on public.room_private_details
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3.6 checkout_sessions
-- Temporary checkout and payment intent state prior to verified payment.
-- Single source of truth for voucher reservation is voucher_redemptions.checkout_session_id.
-- ----------------------------------------------------------------------------
create table public.checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  room_id uuid not null references public.rooms(id) on delete restrict,
  check_in date not null,
  check_out date not null,
  guest_count integer not null check (guest_count > 0),
  gross_amount_vnd bigint not null check (gross_amount_vnd >= 0),
  discount_amount_vnd bigint not null default 0 check (discount_amount_vnd >= 0),
  final_payable_amount_vnd bigint not null check (final_payable_amount_vnd >= 0),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'PAYMENT_PROCESSING', 'COMPLETED', 'EXPIRED', 'FAILED')),
  expires_at timestamptz not null,
  payment_reference text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint checkout_sessions_date_order check (check_out > check_in),
  constraint checkout_sessions_discount_le_gross check (gross_amount_vnd >= discount_amount_vnd),
  constraint checkout_sessions_final_amount_calc check (final_payable_amount_vnd = gross_amount_vnd - discount_amount_vnd)
);

create trigger tr_checkout_sessions_updated_at
  before update on public.checkout_sessions
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3.7 bookings
-- Durable, confirmed room reservations created strictly upon verified full payment.
-- Deposits are not supported; guest booking is not supported.
-- Exclusion constraint prevents overlapping inventory for confirmed stays.
-- ----------------------------------------------------------------------------
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  room_id uuid not null references public.rooms(id) on delete restrict,
  check_in date not null,
  check_out date not null,
  guest_count integer not null check (guest_count > 0),
  gross_amount_vnd bigint not null check (gross_amount_vnd >= 0),
  discount_amount_vnd bigint not null default 0 check (discount_amount_vnd >= 0),
  final_paid_amount_vnd bigint not null check (final_paid_amount_vnd >= 0),
  payment_status text not null,
  booking_status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_date_order check (check_out > check_in),
  constraint bookings_discount_le_gross check (gross_amount_vnd >= discount_amount_vnd),
  constraint bookings_final_paid_calc check (final_paid_amount_vnd = gross_amount_vnd - discount_amount_vnd)
  -- TODO: Booking overlap exclusion constraint must be added in a later migration
  -- after inventory-blocking booking statuses are finalized.
  -- Cancelled/non-blocking historical bookings must not hold inventory.
  -- Application/checkout logic performs preliminary availability validation.
);

create trigger tr_bookings_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3.8 booking_access_credentials
-- Booking-scoped Digital Key / door credentials bounded to stay window.
-- ----------------------------------------------------------------------------
create table public.booking_access_credentials (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete restrict,
  credential_type text not null default 'pin',
  credential_value text not null,
  instructions text null,
  valid_from timestamptz not null,
  valid_until timestamptz not null,
  status text not null default 'active' check (status in ('active', 'expired', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_access_credentials_valid_window check (valid_until > valid_from)
);

create trigger tr_booking_access_credentials_updated_at
  before update on public.booking_access_credentials
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3.9 tickets
-- Incident/service requests linked to confirmed booking and room.
-- ----------------------------------------------------------------------------
create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  booking_id uuid not null references public.bookings(id) on delete restrict,
  room_id uuid not null references public.rooms(id) on delete restrict,
  category text not null,
  description text not null,
  media_paths text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger tr_tickets_updated_at
  before update on public.tickets
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3.10 daily_checkins
-- Daily reward event: one per user account per Asia/Ho_Chi_Minh calendar day (+5 points).
-- ----------------------------------------------------------------------------
create table public.daily_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  checkin_date date not null,
  reward_points numeric(20,4) not null default 5.0000 check (reward_points > 0),
  created_at timestamptz not null default now(),
  constraint daily_checkins_user_date_key unique (user_id, checkin_date)
);

-- ----------------------------------------------------------------------------
-- 3.11 vouchers
-- Immutable definition/template table for loyalty vouchers.
-- ----------------------------------------------------------------------------
create table public.vouchers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  voucher_type text not null default 'percentage_discount',
  points_cost numeric(20,4) not null default 500.0000 check (points_cost > 0),
  discount_percentage numeric(5,2) not null default 40.00 check (discount_percentage > 0 and discount_percentage <= 100),
  max_eligible_base_vnd bigint not null default 1000000 check (max_eligible_base_vnd > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger tr_vouchers_updated_at
  before update on public.vouchers
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3.12 voucher_redemptions
-- User-owned voucher instance issued via 500 points redemption.
-- Single source of truth for temporary checkout reservation is checkout_session_id.
-- At most one active RESERVED voucher per checkout; at most one USED voucher per booking.
-- ----------------------------------------------------------------------------
create table public.voucher_redemptions (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references public.vouchers(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  checkout_session_id uuid null references public.checkout_sessions(id) on delete set null,
  status text not null default 'AVAILABLE' check (status in ('AVAILABLE', 'RESERVED', 'USED', 'EXPIRED', 'REVOKED')),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  booking_id uuid null references public.bookings(id) on delete restrict,
  discount_amount_vnd bigint null check (discount_amount_vnd is null or discount_amount_vnd >= 0),
  used_at timestamptz null,
  constraint voucher_redemptions_expiry_check check (expires_at > issued_at)
);

-- Enforce at most one USED voucher applied per booking
create unique index voucher_redemptions_one_used_per_booking_idx
  on public.voucher_redemptions(booking_id)
  where (booking_id is not null and status = 'USED');

-- Enforce at most one actively RESERVED voucher attached per checkout session
create unique index voucher_redemptions_one_reserved_per_checkout_idx
  on public.voucher_redemptions(checkout_session_id)
  where (checkout_session_id is not null and status = 'RESERVED');

-- ----------------------------------------------------------------------------
-- 3.13 loyalty_transactions
-- Append-only ledger for all loyalty points changes.
-- ----------------------------------------------------------------------------
create table public.loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  type text not null check (type in (
    'daily_checkin_earn',
    'booking_earn',
    'booking_reversal',
    'voucher_redeem',
    'voucher_redemption_reversal',
    'adjustment'
  )),
  points_delta numeric(20,4) not null check (points_delta <> 0),
  booking_id uuid null references public.bookings(id) on delete restrict,
  daily_checkin_id uuid null references public.daily_checkins(id) on delete restrict,
  voucher_redemption_id uuid null references public.voucher_redemptions(id) on delete restrict,
  description text null,
  metadata jsonb null,
  created_at timestamptz not null default now()
);

-- Idempotency constraints on ledger source events
create unique index loyalty_transactions_daily_checkin_unique_idx
  on public.loyalty_transactions(daily_checkin_id)
  where daily_checkin_id is not null and type = 'daily_checkin_earn';

create unique index loyalty_transactions_booking_earn_unique_idx
  on public.loyalty_transactions(booking_id)
  where booking_id is not null and type = 'booking_earn';

create unique index loyalty_transactions_voucher_redeem_unique_idx
  on public.loyalty_transactions(voucher_redemption_id)
  where voucher_redemption_id is not null and type = 'voucher_redeem';

-- ============================================================================
-- 4. Indexes
-- ============================================================================

-- properties
-- slug is covered by unique constraint

-- rooms
create index rooms_property_id_idx on public.rooms(property_id);
create index rooms_is_listed_idx on public.rooms(is_listed);

-- checkout_sessions
create index checkout_sessions_user_id_idx on public.checkout_sessions(user_id);
create index checkout_sessions_room_id_idx on public.checkout_sessions(room_id);
create index checkout_sessions_status_expires_at_idx on public.checkout_sessions(status, expires_at);

-- bookings
create index bookings_user_id_idx on public.bookings(user_id);
create index bookings_room_id_idx on public.bookings(room_id);

-- booking_access_credentials
create index booking_access_credentials_booking_id_idx on public.booking_access_credentials(booking_id);
create index booking_access_credentials_window_idx on public.booking_access_credentials(booking_id, valid_from, valid_until);

-- tickets
create index tickets_user_id_idx on public.tickets(user_id);
create index tickets_booking_id_idx on public.tickets(booking_id);
create index tickets_status_idx on public.tickets(status);

-- loyalty_transactions
create index loyalty_transactions_user_id_created_at_idx on public.loyalty_transactions(user_id, created_at desc);
create index loyalty_transactions_booking_id_idx on public.loyalty_transactions(booking_id);
create index loyalty_transactions_daily_checkin_id_idx on public.loyalty_transactions(daily_checkin_id);
create index loyalty_transactions_voucher_redemption_id_idx on public.loyalty_transactions(voucher_redemption_id);

-- voucher_redemptions
create index voucher_redemptions_user_id_status_idx on public.voucher_redemptions(user_id, status);
create index voucher_redemptions_checkout_session_id_idx on public.voucher_redemptions(checkout_session_id);
create index voucher_redemptions_booking_id_idx on public.voucher_redemptions(booking_id);

-- ============================================================================
-- 5. Row Level Security (RLS)
-- ============================================================================

-- Enable RLS on all 13 application tables
alter table public.profiles enable row level security;
alter table public.properties enable row level security;
alter table public.rooms enable row level security;
alter table public.room_operations enable row level security;
alter table public.room_private_details enable row level security;
alter table public.checkout_sessions enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_access_credentials enable row level security;
alter table public.tickets enable row level security;
alter table public.daily_checkins enable row level security;
alter table public.vouchers enable row level security;
alter table public.voucher_redemptions enable row level security;
alter table public.loyalty_transactions enable row level security;

-- ----------------------------------------------------------------------------
-- 5.1 Public Catalog Policies (properties, rooms)
-- Explicitly targeted to anon and authenticated roles.
-- ----------------------------------------------------------------------------
create policy "Public properties are viewable by everyone"
  on public.properties for select
  to anon, authenticated
  using (is_active = true);

create policy "Public rooms are viewable by everyone"
  on public.rooms for select
  to anon, authenticated
  using (is_listed = true);

-- ----------------------------------------------------------------------------
-- 5.2 Profiles Policies
-- ----------------------------------------------------------------------------
create policy "Users can view own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ----------------------------------------------------------------------------
-- 5.3 Checkout Sessions Policies
-- Authenticated users view own sessions. Direct client creation is prohibited
-- in Phase 1 (server derives trusted financial amounts in next phase).
-- ----------------------------------------------------------------------------
create policy "Users can view own checkout sessions"
  on public.checkout_sessions for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- ----------------------------------------------------------------------------
-- 5.4 Bookings Policies
-- Authenticated users view own bookings. Direct client creation prohibited
-- (booking creation strictly requires verified payment confirmation).
-- ----------------------------------------------------------------------------
create policy "Users can view own bookings"
  on public.bookings for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- ----------------------------------------------------------------------------
-- 5.5 Tickets Policies
-- Authenticated users view own tickets and submit tickets for their bookings.
-- ----------------------------------------------------------------------------
create policy "Users can view own tickets"
  on public.tickets for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create tickets for own bookings"
  on public.tickets for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and b.user_id = (select auth.uid())
        and b.room_id = tickets.room_id
    )
  );

-- ----------------------------------------------------------------------------
-- 5.6 Vouchers Definition Policies
-- Authenticated users can view active voucher definitions.
-- ----------------------------------------------------------------------------
create policy "Authenticated users can view active vouchers"
  on public.vouchers for select
  to authenticated
  using (is_active = true);

-- ----------------------------------------------------------------------------
-- 5.7 Voucher Redemptions Policies
-- Authenticated users view own redeemed voucher instances. Direct client writes
-- prohibited (handled via trusted points deduction RPC).
-- ----------------------------------------------------------------------------
create policy "Users can view own voucher redemptions"
  on public.voucher_redemptions for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- ----------------------------------------------------------------------------
-- 5.8 Daily Check-ins Policies
-- Authenticated users view own daily check-in records. Direct writes prohibited
-- (handled via trusted daily reward RPC).
-- ----------------------------------------------------------------------------
create policy "Users can view own daily checkins"
  on public.daily_checkins for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- ----------------------------------------------------------------------------
-- 5.9 Loyalty Transactions Ledger Policies
-- Append-only ledger: authenticated users view own points transactions.
-- Direct client writes strictly prohibited.
-- ----------------------------------------------------------------------------
create policy "Users can view own loyalty transactions"
  on public.loyalty_transactions for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- ----------------------------------------------------------------------------
-- 5.10 Strict Deny-By-Default Tables (Phase 1)
-- - room_operations: internal operations only (role model is an open decision).
-- - room_private_details: Wi-Fi credentials (stay-window RLS deferred to avoid leakage).
-- - booking_access_credentials: Digital Keys (provider integration deferred).
-- Because RLS is enabled and no permissive policies exist for anon/authenticated,
-- PostgreSQL default-denies all operations on these tables for client roles.
-- ----------------------------------------------------------------------------

-- ============================================================================
-- 6. Explicit Table Grants (Least Privilege)
-- Do not rely on default table privileges or auto-expose settings.
-- ============================================================================

-- 6.1 Revoke default public privileges on all 13 application tables
revoke all on public.profiles from public, anon, authenticated;
revoke all on public.properties from public, anon, authenticated;
revoke all on public.rooms from public, anon, authenticated;
revoke all on public.room_operations from public, anon, authenticated;
revoke all on public.room_private_details from public, anon, authenticated;
revoke all on public.checkout_sessions from public, anon, authenticated;
revoke all on public.bookings from public, anon, authenticated;
revoke all on public.booking_access_credentials from public, anon, authenticated;
revoke all on public.tickets from public, anon, authenticated;
revoke all on public.daily_checkins from public, anon, authenticated;
revoke all on public.vouchers from public, anon, authenticated;
revoke all on public.voucher_redemptions from public, anon, authenticated;
revoke all on public.loyalty_transactions from public, anon, authenticated;

-- 6.2 anon role: strictly public read-only catalog access
grant select on public.properties to anon;
grant select on public.rooms to anon;

-- 6.3 authenticated role: least-privilege grants matching active RLS policies
grant select, insert, update on public.profiles to authenticated;
grant select on public.properties to authenticated;
grant select on public.rooms to authenticated;
grant select on public.checkout_sessions to authenticated;
grant select on public.bookings to authenticated;
grant select, insert on public.tickets to authenticated;
grant select on public.vouchers to authenticated;
grant select on public.voucher_redemptions to authenticated;
grant select on public.daily_checkins to authenticated;
grant select on public.loyalty_transactions to authenticated;

-- 6.4 service_role: full management for trusted server operations and migrations
grant all on public.profiles to service_role;
grant all on public.properties to service_role;
grant all on public.rooms to service_role;
grant all on public.room_operations to service_role;
grant all on public.room_private_details to service_role;
grant all on public.checkout_sessions to service_role;
grant all on public.bookings to service_role;
grant all on public.booking_access_credentials to service_role;
grant all on public.tickets to service_role;
grant all on public.daily_checkins to service_role;
grant all on public.vouchers to service_role;
grant all on public.voucher_redemptions to service_role;
grant all on public.loyalty_transactions to service_role;
