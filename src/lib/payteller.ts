// Phase 2 PayTeller (Nov 2026): Ghana MoMo hosted checkout, server-side
// client. TypeScript port of BetWins
// backend/services/payteller.service.js (live-verified, commit 10161366).
//
// Flow: create a payment → the customer is redirected to PayTeller's
// hosted checkout and pays with MoMo there → PayTeller POSTs a signed
// webhook to /api/public/payteller-webhook → we re-verify with GET and
// only then credit the wallet, exactly once. Never credit from a
// redirect, a poll result alone, or a "payment sent" screen.
// Docs: https://paytelller.com/docs.html
//
// Money rule (docs §02): PayTeller charges the merchant a percentage of
// the principal by default (10% — the merchant receives 90%). The wallet
// is credited EXACTLY the requested GHS amount, never merchant_net:
// Royale Gold absorbs the 10% unless the merchant's Charge setting is
// OFF (0%, set by the PayTeller team per merchant). The 10% is recorded
// on the payment row (provider_payload) for reconciliation, it is never
// the credit. No USD layer — PayTeller takes GHS natively and Royale
// Gold's economy is principal-denominated.
import { createHmac, timingSafeEqual } from "node:crypto";
import { getPaytellerCredentials, getPaytellerWebhookSecret } from "./gateway-settings";

export const PAYTELLER_API_BASE_URL = (
  process.env.PAYTELLER_API_BASE_URL || "https://paytelller.com/api/v1"
).replace(/\/$/, "");

// Docs cap: a single payment is "0.01" to "1000000.00" GHS.
export const MAX_AMOUNT_GHS = 1000000;

export interface PaytellerPaymentResponse {
  id?: string;
  reference?: string;
  environment?: string;
  status?: string;
  currency?: string;
  amount?: string;
  merchant_net?: string;
  platform_commission?: string;
  customer_charge?: string;
  customer_total?: string;
  customer_processing_fee?: string;
  checkout_url?: string;
  expires_at?: string;
  transaction_id?: string;
  provider_reference?: string;
  created_at?: string;
  completed_at?: string;
  timestamp?: string;
  [key: string]: unknown;
}

/** Error from the PayTeller API (or from our side of the call). */
export class PaytellerError extends Error {
  statusCode: number;
  providerCode?: string | null;
  providerBody?: unknown;
  constructor(message: string, statusCode = 502, code?: string | null) {
    super(message);
    this.statusCode = statusCode;
    if (code) this.providerCode = code;
  }
}

function providerError(message: string, statusCode = 502, code: string | null = null): PaytellerError {
  return new PaytellerError(typeof message === "string" ? message : JSON.stringify(message), statusCode, code);
}

// Credentials are set by the owner in the Gateway panel (encrypted in
// GatewaySettings) — the env vars remain as a fallback so a key set
// either way works. A DB failure never breaks the fallback.
async function credentials() {
  const stored = await getPaytellerCredentials().catch(() => null);
  if (!stored) {
    throw providerError("PayTeller credentials are not configured", 503);
  }
  return stored;
}

async function webhookSecret(): Promise<string> {
  return getPaytellerWebhookSecret();
}

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

async function readResponse(response: Response): Promise<PaytellerPaymentResponse> {
  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = { message: text };
  }
  if (response.ok) return body as PaytellerPaymentResponse;
  const message = (body.error as string) || (body.message as string) || "PayTeller request failed";
  const thrown = providerError(
    message,
    response.status >= 500 ? 502 : response.status,
    (body.code as string) || null,
  );
  // Callers need the full body for the 409 duplicate-reference path,
  // which returns the original payment when the details are identical.
  thrown.providerBody = body;
  throw thrown;
}

async function request(
  path: string,
  { method = "GET", body, requestFn = fetch }: { method?: string; body?: unknown; requestFn?: FetchFn } = {},
): Promise<PaytellerPaymentResponse> {
  const creds = await credentials();
  let response: Response;
  try {
    response = await requestFn(`${PAYTELLER_API_BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${creds.apiKey}`,
        "X-Payteller-Merchant-ID": creds.merchantId,
        "X-Payteller-Username": creds.username,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    throw providerError(`Unable to reach PayTeller: ${error instanceof Error ? error.message : String(error)}`, 502);
  }
  return readResponse(response);
}

// GHS as a decimal string with exactly 2 places (docs §02). PayTeller
// rejects JSON numbers and amounts outside "0.01"–"1000000.00".
export function toAmountString(ghsAmount: number): string {
  const value = Number(ghsAmount);
  if (!Number.isFinite(value) || value <= 0 || value > MAX_AMOUNT_GHS) {
    throw providerError("Invalid amount", 400, "invalid_amount");
  }
  return value.toFixed(2);
}

export interface CreatePaymentInput {
  reference: string;
  amountGhs: number;
  email: string;
  description?: string;
  returnUrl?: string;
  requestFn?: FetchFn;
}

export async function createPayment({
  reference,
  amountGhs,
  email,
  description,
  returnUrl,
  requestFn,
}: CreatePaymentInput): Promise<PaytellerPaymentResponse> {
  if (!reference) throw providerError("Reference is required", 400, "reference_required");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
    throw providerError("A valid customer email is required", 400, "invalid_email");
  }
  // The reference is PayTeller's idempotency key: retrying it with
  // identical details returns the original payment; changed details
  // return HTTP 409. Our references are unique per deposit (RG-<hex>),
  // so a 409 means a caller reused a reference — never retry with a
  // different amount.
  return request("/payments", {
    method: "POST",
    requestFn,
    body: {
      amount: toAmountString(amountGhs),
      currency: "GHS",
      reference: String(reference),
      customer_email: String(email).trim(),
      description: String(description || "Royale Gold wallet deposit").slice(0, 250),
      ...(returnUrl ? { return_url: String(returnUrl) } : {}),
    },
  });
}

export async function getPaymentByReference(
  reference: string,
  { requestFn }: { requestFn?: FetchFn } = {},
): Promise<PaytellerPaymentResponse> {
  if (!reference) throw providerError("Reference is required", 400);
  return request(`/payments/${encodeURIComponent(String(reference))}`, { requestFn });
}

export async function verifyPayment(
  transactionId: string,
  { requestFn }: { requestFn?: FetchFn } = {},
): Promise<PaytellerPaymentResponse> {
  if (!transactionId) throw providerError("Transaction id is required", 400);
  return request(`/payments/verify/${encodeURIComponent(String(transactionId))}`, { requestFn });
}

/** GET /api/v1/auth — tests the connection without creating a payment. */
export async function testAuth({ requestFn }: { requestFn?: FetchFn } = {}): Promise<{
  authenticated: boolean;
  merchant_id?: string;
  environment?: string;
}> {
  const body = await request("/auth", { requestFn });
  return {
    authenticated: body.authenticated === true,
    merchant_id: typeof body.merchant_id === "string" ? body.merchant_id : undefined,
    environment: typeof body.environment === "string" ? body.environment : undefined,
  };
}

// The verify endpoint reports `success` where the reference endpoint and
// webhooks report `successful` — normalize to one value for settlement.
export function normalizeStatus(status: string | null | undefined): string {
  const value = String(status || "").toLowerCase();
  if (value === "success") return "successful";
  return value;
}

export function isSuccessfulStatus(status: string | null | undefined): boolean {
  return normalizeStatus(status) === "successful";
}

// Verify X-Payteller-Signature on the RAW request body (docs §04).
// v1 = HMAC-SHA256(key = webhook signing secret, message = "<t>.<raw body>").
// Returns false on any malformed header, stale timestamp (>300s) or
// mismatch. The caller resolves the secret first (panel, env fallback).
export function verifySignature(rawBody: string, header: string | null | undefined, secret: string): boolean {
  try {
    if (!secret || typeof header !== "string") return false;
    const parts: Record<string, string> = {};
    for (const part of header.split(",")) {
      const idx = part.indexOf("=");
      if (idx <= 0) return false;
      parts[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
    }
    const t = Number(parts.t);
    if (!t || !/^[a-f0-9]{64}$/.test(parts.v1 || "")) return false;
    if (Math.abs(Math.floor(Date.now() / 1000) - t) > 300) return false;
    const expected = createHmac("sha256", secret).update(`${parts.t}.${rawBody}`).digest("hex");
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(parts.v1, "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export { webhookSecret };
