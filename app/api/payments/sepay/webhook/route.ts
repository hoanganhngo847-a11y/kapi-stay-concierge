import { NextResponse } from "next/server";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Processing Status Canonical Values
// ---------------------------------------------------------------------------

type WebhookProcessingStatus =
  | "RECEIVED"
  | "FINALIZED"
  | "IGNORED"
  | "REJECTED"
  | "ERROR";

interface RpcFinalizeResult {
  success?: boolean;
  error?: string;
  idempotent?: boolean;
}

interface ExistingAuditEventRow {
  id: string;
  processing_status: WebhookProcessingStatus;
  checkout_session_id: string | null;
  payment_reference: string | null;
}

// ---------------------------------------------------------------------------
// Security & Verification Helpers
// ---------------------------------------------------------------------------

/**
 * Validates timestamp to prevent replay attacks (tolerance: 300 seconds).
 */
function verifyTimestampSkew(timestampHeader: string): boolean {
  const trimmed = timestampHeader.trim();
  const tsNum = Number(trimmed);
  let tsSeconds: number;

  if (!Number.isNaN(tsNum) && tsNum > 0) {
    tsSeconds = tsNum > 1e11 ? Math.floor(tsNum / 1000) : Math.floor(tsNum);
  } else {
    const parsed = Date.parse(trimmed);
    if (Number.isNaN(parsed)) {
      return false;
    }
    tsSeconds = Math.floor(parsed / 1000);
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  return Math.abs(nowSeconds - tsSeconds) <= 300;
}

/**
 * Verifies SePay HMAC-SHA256 signature using timingSafeEqual.
 * Signed string format: `${timestamp}.${rawBody}`
 * Expected signature format: `sha256=<hex>` (64 hex characters)
 */
function verifySepaySignature(
  rawBody: string,
  timestamp: string,
  signatureHeader: string,
  secret: string
): boolean {
  if (!secret) {
    return false;
  }

  const trimmedSig = signatureHeader.trim();
  if (!/^sha256=[0-9a-fA-F]{64}$/.test(trimmedSig)) {
    return false;
  }

  const hexSignature = trimmedSig.slice(7);

  const signedPayload = `${timestamp.trim()}.${rawBody}`;
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(signedPayload);
  const expectedHex = hmac.digest("hex");

  const providedBuffer = Buffer.from(hexSignature, "hex");
  const expectedBuffer = Buffer.from(expectedHex, "hex");

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

/**
 * Extracts canonical payment reference:
 * Matches `KAPI-` (with optional '-' or whitespace) followed by exactly 12 hexadecimal characters.
 * Always normalizes result to canonical: KAPI-${captured.toUpperCase()}
 */
function extractPaymentReference(code: unknown, content: unknown): string | null {
  const paymentRefRegex = /\bKAPI[-\s]?([0-9A-Fa-f]{12})\b/i;

  if (typeof code === "string") {
    const match = code.trim().match(paymentRefRegex);
    if (match) {
      return `KAPI-${match[1].toUpperCase()}`;
    }
  }

  if (typeof content === "string") {
    const match = content.match(paymentRefRegex);
    if (match) {
      return `KAPI-${match[1].toUpperCase()}`;
    }
  }

  return null;
}

/**
 * Helper to update audit records in public.payment_webhook_events.
 * Throws if the database update fails so callers do NOT falsely return HTTP 200.
 */
async function updateAuditEvent(
  untypedClient: SupabaseClient,
  id: string | null,
  updates: {
    processing_status: WebhookProcessingStatus;
    error_code?: string | null;
    checkout_session_id?: string | null;
    payment_reference?: string | null;
  }
): Promise<void> {
  if (!id) {
    return;
  }

  const { error } = await untypedClient
    .from("payment_webhook_events")
    .update({
      processing_status: updates.processing_status,
      error_code: updates.error_code ?? null,
      checkout_session_id: updates.checkout_session_id ?? null,
      payment_reference: updates.payment_reference ?? null,
      processed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.error(
      "[SePay Webhook] Failed to update audit event status:",
      error.message
    );
    throw new Error(
      `Failed to update audit event ${id} to ${updates.processing_status}: ${error.message}`
    );
  }
}

// ---------------------------------------------------------------------------
// Route Handler: POST /api/payments/sepay/webhook
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  let eventRecordId: string | null = null;
  let untypedClient: SupabaseClient | null = null;

  try {
    // 1. Read raw body as text BEFORE any parsing for HMAC integrity
    const rawBody = await request.text();

    const signatureHeader = request.headers.get("x-sepay-signature");
    const timestampHeader = request.headers.get("x-sepay-timestamp");

    console.info("[SePay Webhook][diag] request headers", {
      hasSignature: Boolean(signatureHeader),
      hasTimestamp: Boolean(timestampHeader),
    });

    if (!signatureHeader || !timestampHeader) {
      return NextResponse.json(
        { error: "Missing required SePay signature headers" },
        { status: 401 }
      );
    }

    // 2. Anti-replay verification
    const timestampValid = verifyTimestampSkew(timestampHeader);
    console.info("[SePay Webhook][diag] timestamp check", {
      timestampValid,
    });

    if (!timestampValid) {
      return NextResponse.json(
        { error: "Timestamp skew exceeds allowable window" },
        { status: 401 }
      );
    }

    // 3. HMAC-SHA256 signature verification
    const webhookSecret = process.env.SEPAY_WEBHOOK_SECRET;
    console.info("[SePay Webhook][diag] secret configuration", {
      hasSecret: Boolean(webhookSecret),
    });

    if (!webhookSecret) {
      console.error(
        "[SePay Webhook] SEPAY_WEBHOOK_SECRET environment variable is missing."
      );
      return NextResponse.json(
        { error: "Server authentication misconfigured" },
        { status: 401 }
      );
    }

    const isValidSignature = verifySepaySignature(
      rawBody,
      timestampHeader,
      signatureHeader,
      webhookSecret
    );

    console.info("[SePay Webhook][diag] signature check", {
      signatureValid: isValidSignature,
    });

    if (!isValidSignature) {
      return NextResponse.json(
        { error: "Invalid webhook signature" },
        { status: 401 }
      );
    }

    // 4. Parse JSON payload
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON request body" },
        { status: 400 }
      );
    }

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return NextResponse.json(
        { error: "Payload must be a JSON object" },
        { status: 400 }
      );
    }

    // 5. Extract and validate required transaction fields
    const rawId = payload.id;
    const providerEventId =
      typeof rawId === "number"
        ? rawId
        : typeof rawId === "string" && /^\d+$/.test(rawId)
        ? parseInt(rawId, 10)
        : NaN;

    // SePay's dashboard "Gửi thử" request uses event id 0.
    // At this point the request has already passed timestamp + HMAC validation.
    // Perform a read-only Supabase connectivity check, then acknowledge the test.
    // This does NOT create audit rows, bookings, or mutate payment state.
    if (providerEventId === 0) {
      const testClient = createServiceRoleClient();
      const untypedTestClient = (testClient as unknown) as SupabaseClient;
      const { error: connectivityError } = await untypedTestClient
        .from("payment_webhook_events")
        .select("id")
        .limit(1);

      const supabaseConnectivityValid = !connectivityError;
      console.info("[SePay Webhook][diag] authenticated SePay test payload", {
        supabaseConnectivityValid,
      });

      if (connectivityError) {
        console.error(
          "[SePay Webhook] Supabase connectivity test failed:",
          connectivityError.message
        );
        return NextResponse.json(
          { error: "Supabase connectivity test failed" },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true }, { status: 200 });
    }

    const rawGateway = payload.gateway;
    const rawAccountNumber = payload.accountNumber ?? payload.account_number;
    const rawTransferType = payload.transferType ?? payload.transfer_type;
    const rawTransferAmount = payload.transferAmount ?? payload.transfer_amount;
    const rawContent = payload.content;
    const rawReferenceCode = payload.referenceCode ?? payload.reference_code ?? null;
    const rawCode = payload.code ?? null;

    const transferAmount =
      typeof rawTransferAmount === "number"
        ? rawTransferAmount
        : typeof rawTransferAmount === "string" && /^\d+$/.test(rawTransferAmount)
        ? parseInt(rawTransferAmount, 10)
        : NaN;

    if (
      Number.isNaN(providerEventId) ||
      !Number.isSafeInteger(providerEventId) ||
      providerEventId <= 0 ||
      typeof rawGateway !== "string" ||
      rawGateway.trim().length === 0 ||
      typeof rawAccountNumber !== "string" ||
      rawAccountNumber.trim().length === 0 ||
      typeof rawTransferType !== "string" ||
      rawTransferType.trim().length === 0 ||
      Number.isNaN(transferAmount) ||
      !Number.isSafeInteger(transferAmount) ||
      transferAmount <= 0 ||
      typeof rawContent !== "string"
    ) {
      return NextResponse.json(
        { error: "Missing or invalid required transaction fields" },
        { status: 400 }
      );
    }

    const gateway = rawGateway.trim();
    const accountNumber = rawAccountNumber.trim();
    const transferType = rawTransferType.trim();
    const referenceCode =
      typeof rawReferenceCode === "string" && rawReferenceCode.trim().length > 0
        ? rawReferenceCode.trim()
        : null;

    // 6. Initialize service role clients
    const typedClient = createServiceRoleClient();
    untypedClient = (typedClient as unknown) as SupabaseClient;

    // 7. Check idempotency: provider='sepay' and provider_event_id
    const { data: existingData, error: findError } = await untypedClient
      .from("payment_webhook_events")
      .select("id, processing_status, checkout_session_id, payment_reference")
      .eq("provider", "sepay")
      .eq("provider_event_id", providerEventId)
      .maybeSingle();

    if (findError) {
      console.error(
        "[SePay Webhook] Database error querying existing event:",
        findError.message
      );
      return NextResponse.json(
        { error: "Database error during idempotency check" },
        { status: 500 }
      );
    }

    const existingEvent = (existingData as unknown) as ExistingAuditEventRow | null;

    if (existingEvent) {
      if (
        ["FINALIZED", "IGNORED", "REJECTED"].includes(
          existingEvent.processing_status
        )
      ) {
        return NextResponse.json(
          { success: true },
          { status: 200 }
        );
      }
      eventRecordId = existingEvent.id;
    } else {
      // Record initial event status as RECEIVED
      const { data: insertedData, error: insertError } = await untypedClient
        .from("payment_webhook_events")
        .insert({
          provider: "sepay",
          provider_event_id: providerEventId,
          gateway,
          account_number: accountNumber,
          transfer_type: transferType,
          transfer_amount_vnd: transferAmount,
          payment_reference: null,
          bank_reference: referenceCode,
          checkout_session_id: null,
          processing_status: "RECEIVED",
          error_code: null,
          raw_payload: payload,
        })
        .select("id")
        .maybeSingle();

      const insertedEvent = (insertedData as unknown) as { id: string } | null;

      if (insertError) {
        // Handle concurrent insert (unique constraint code 23505)
        if (insertError.code === "23505") {
          const { data: concurrentData } = await untypedClient
            .from("payment_webhook_events")
            .select("id, processing_status")
            .eq("provider", "sepay")
            .eq("provider_event_id", providerEventId)
            .maybeSingle();

          const concurrentEvent = (concurrentData as unknown) as ExistingAuditEventRow | null;

          if (
            concurrentEvent &&
            ["FINALIZED", "IGNORED", "REJECTED"].includes(
              concurrentEvent.processing_status
            )
          ) {
            return NextResponse.json(
              { success: true },
              { status: 200 }
            );
          }
          if (concurrentEvent) {
            eventRecordId = concurrentEvent.id;
          } else {
            return NextResponse.json(
              { error: "Failed to resolve concurrent event" },
              { status: 500 }
            );
          }
        } else {
          console.error(
            "[SePay Webhook] Failed to insert audit event:",
            insertError.message
          );
          return NextResponse.json(
            { error: "Failed to persist audit event" },
            { status: 500 }
          );
        }
      } else if (insertedEvent) {
        eventRecordId = insertedEvent.id;
      } else {
        return NextResponse.json(
          { error: "Audit event record creation failed" },
          { status: 500 }
        );
      }
    }

    // 8. Filter transfer type: only incoming transfers ("in") are processed
    if (transferType.toLowerCase() !== "in") {
      await updateAuditEvent(untypedClient, eventRecordId, {
        processing_status: "IGNORED",
        error_code: "TRANSFER_TYPE_NOT_IN",
      });
      return NextResponse.json(
        { success: true },
        { status: 200 }
      );
    }

    // 9. Validate receiving account against server configuration
    const expectedAccountNo = process.env.SEPAY_RECEIVING_ACCOUNT_NO;
    if (!expectedAccountNo) {
      console.error(
        "[SePay Webhook] SEPAY_RECEIVING_ACCOUNT_NO server environment variable is not configured."
      );
      await updateAuditEvent(untypedClient, eventRecordId, {
        processing_status: "ERROR",
        error_code: "SEPAY_RECEIVING_ACCOUNT_NO_MISSING",
      });
      return NextResponse.json(
        { error: "Receiving account configuration missing" },
        { status: 500 }
      );
    }

    if (accountNumber !== expectedAccountNo.trim()) {
      await updateAuditEvent(untypedClient, eventRecordId, {
        processing_status: "IGNORED",
        error_code: "ACCOUNT_NUMBER_MISMATCH",
      });
      return NextResponse.json(
        { success: true },
        { status: 200 }
      );
    }

    // 10. Identify canonical payment reference from code or content
    const paymentReference = extractPaymentReference(rawCode, rawContent);
    if (!paymentReference) {
      await updateAuditEvent(untypedClient, eventRecordId, {
        processing_status: "IGNORED",
        error_code: "PAYMENT_REFERENCE_NOT_FOUND",
      });
      return NextResponse.json(
        { success: true },
        { status: 200 }
      );
    }

    // 11. Lookup checkout session using payment reference
    const { data: checkout, error: checkoutError } = await typedClient
      .from("checkout_sessions")
      .select("id, payment_reference, final_payable_amount_vnd, status, expires_at")
      .eq("payment_reference", paymentReference)
      .maybeSingle();

    if (checkoutError) {
      console.error(
        "[SePay Webhook] Database error querying checkout session:",
        checkoutError.message
      );
      await updateAuditEvent(untypedClient, eventRecordId, {
        processing_status: "ERROR",
        payment_reference: paymentReference,
        error_code: "DB_LOOKUP_ERROR",
      });
      return NextResponse.json(
        { error: "Database error querying checkout session" },
        { status: 500 }
      );
    }

    if (!checkout) {
      await updateAuditEvent(untypedClient, eventRecordId, {
        processing_status: "IGNORED",
        payment_reference: paymentReference,
        error_code: "CHECKOUT_SESSION_NOT_FOUND",
      });
      return NextResponse.json(
        { success: true },
        { status: 200 }
      );
    }

    if (!checkout.payment_reference) {
      console.error(
        "[SePay Webhook] Checkout session has null payment reference:",
        checkout.id
      );
      await updateAuditEvent(untypedClient, eventRecordId, {
        processing_status: "ERROR",
        checkout_session_id: checkout.id,
        payment_reference: paymentReference,
        error_code: "CHECKOUT_PAYMENT_REFERENCE_NULL",
      });
      return NextResponse.json(
        { error: "Invalid checkout session payment reference" },
        { status: 500 }
      );
    }

    // 12. Exact amount verification: no tolerance, no partial/over payment
    if (transferAmount !== checkout.final_payable_amount_vnd) {
      await updateAuditEvent(untypedClient, eventRecordId, {
        processing_status: "REJECTED",
        checkout_session_id: checkout.id,
        payment_reference: checkout.payment_reference,
        error_code: "VERIFIED_AMOUNT_MISMATCH",
      });
      return NextResponse.json(
        { success: true },
        { status: 200 }
      );
    }

    // 13. Finalize verified checkout atomically via service_role RPC
    const { data: rpcData, error: rpcError } = await typedClient.rpc(
      "finalize_verified_checkout_atomic",
      {
        p_checkout_session_id: checkout.id,
        p_verified_paid_amount_vnd: transferAmount,
        p_verified_payment_reference: checkout.payment_reference,
      }
    );

    if (rpcError) {
      console.error(
        "[SePay Webhook] finalize_verified_checkout_atomic transport error:",
        rpcError.message
      );
      await updateAuditEvent(untypedClient, eventRecordId, {
        processing_status: "ERROR",
        checkout_session_id: checkout.id,
        payment_reference: checkout.payment_reference,
        error_code: rpcError.code || "RPC_ERROR",
      });
      return NextResponse.json(
        { error: "Failed to execute checkout finalization" },
        { status: 500 }
      );
    }

    const result = (rpcData as unknown) as RpcFinalizeResult | null;

    if (result?.success === true) {
      await updateAuditEvent(untypedClient, eventRecordId, {
        processing_status: "FINALIZED",
        checkout_session_id: checkout.id,
        payment_reference: checkout.payment_reference,
      });
      return NextResponse.json(
        { success: true },
        { status: 200 }
      );
    }

    // RPC reported business validation failure (e.g., CHECKOUT_SESSION_EXPIRED, ROOM_NOT_AVAILABLE)
    const businessErrorCode =
      typeof result?.error === "string" ? result.error : "RPC_BUSINESS_FAILURE";

    await updateAuditEvent(untypedClient, eventRecordId, {
      processing_status: "REJECTED",
      checkout_session_id: checkout.id,
      payment_reference: checkout.payment_reference,
      error_code: businessErrorCode,
    });

    return NextResponse.json(
      { success: true },
      { status: 200 }
    );
  } catch (err) {
    console.error(
      "[SePay Webhook] Internal server exception:",
      err instanceof Error ? err.message : "Unknown error"
    );

    if (eventRecordId && untypedClient) {
      try {
        const { error: fallbackError } = await untypedClient
          .from("payment_webhook_events")
          .update({
            processing_status: "ERROR",
            error_code: "INTERNAL_SERVER_EXCEPTION",
            processed_at: new Date().toISOString(),
          })
          .eq("id", eventRecordId);

        if (fallbackError) {
          console.error(
            "[SePay Webhook] Failed to persist ERROR audit state in outer catch:",
            fallbackError.message
          );
        }
      } catch (auditErr) {
        console.error(
          "[SePay Webhook] Exception while recording ERROR audit status in outer catch:",
          auditErr instanceof Error ? auditErr.message : "Unknown error"
        );
      }
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
