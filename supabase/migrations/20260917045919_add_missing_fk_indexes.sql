-- ============================================================================
-- Migration: 20260917045919_add_missing_fk_indexes.sql
-- Description: Add missing foreign key indexes for booking_access_credentials,
-- room_operations, tickets, and voucher_redemptions.
-- Reconciles local schema with Supabase Cloud migration history.
-- ============================================================================

create index if not exists booking_access_credentials_room_id_idx
on public.booking_access_credentials(room_id);

create index if not exists room_operations_updated_by_idx
on public.room_operations(updated_by);

create index if not exists tickets_room_id_idx
on public.tickets(room_id);

create index if not exists voucher_redemptions_voucher_id_idx
on public.voucher_redemptions(voucher_id);
