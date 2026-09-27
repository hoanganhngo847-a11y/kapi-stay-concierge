-- ============================================================================
-- Migration: 20260927180000_sepay_payment_webhook_events.sql
-- Description: SePay webhook events audit and idempotency log.
-- Architecture Reference: docs/PROJECT_GUIDE.md, docs/ARCHITECTURE.md
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Table: public.payment_webhook_events
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  provider_event_id BIGINT NOT NULL,
  gateway TEXT NOT NULL,
  account_number TEXT NOT NULL,
  transfer_type TEXT NOT NULL,
  transfer_amount_vnd BIGINT NOT NULL,
  payment_reference TEXT NULL,
  bank_reference TEXT NULL,
  checkout_session_id UUID NULL REFERENCES public.checkout_sessions(id) ON DELETE SET NULL,
  processing_status TEXT NOT NULL,
  error_code TEXT NULL,
  raw_payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ NULL,

  CONSTRAINT chk_payment_webhook_events_provider CHECK (provider = 'sepay'),
  CONSTRAINT chk_payment_webhook_events_status CHECK (
    processing_status IN ('RECEIVED', 'FINALIZED', 'IGNORED', 'REJECTED', 'ERROR')
  ),
  CONSTRAINT chk_payment_webhook_events_amount CHECK (transfer_amount_vnd > 0),
  CONSTRAINT uq_payment_webhook_events_provider_event UNIQUE (provider, provider_event_id)
);

-- ----------------------------------------------------------------------------
-- 2. Indexes for FK lookups, reference matching, and status querying
-- ----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_checkout_session
  ON public.payment_webhook_events (checkout_session_id);

CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_payment_reference
  ON public.payment_webhook_events (payment_reference);

CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_status
  ON public.payment_webhook_events (processing_status);

-- ----------------------------------------------------------------------------
-- 3. Row Level Security & Strict Least-Privilege Permissions
-- ----------------------------------------------------------------------------

ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;

-- Revoke all table access from untrusted roles
REVOKE ALL ON TABLE public.payment_webhook_events FROM PUBLIC;
REVOKE ALL ON TABLE public.payment_webhook_events FROM anon;
REVOKE ALL ON TABLE public.payment_webhook_events FROM authenticated;

-- Grant access strictly to service_role for backend webhook processing
GRANT ALL ON TABLE public.payment_webhook_events TO service_role;
