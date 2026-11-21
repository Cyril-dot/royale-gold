// Nov 2026 Flutterwave v3 (Nigeria only): hosted checkout, server-side
// client. TypeScript port of BetWins
// backend/services/flutterwave-v3-nigeria.service.js (live-verified
// there for NGN bank transfer) — extended here to the full Nigerian
// checkout (card, bank transfer, USSD, bank account).
//
// Flow: create a payment → the customer is redirected to Flutterwave's
// hosted checkout and pays there → Flutterwave POSTs a signed webhook
// to /api/public/flutterwave-webhook → we re-verify with GET and only
// then credit the wallet, exactly once. Never credit from a redirect,
// a poll result alone, or a "payment sent" screen.
// Docs: https://developer.flutterwave.com/api/charge/standard (checkout),
// https://developer.flutterwave.com/docs/webhooks (webhooks).
//
// Auth (v3): the SECRET key as a Bearer <redacted> (FLWSECK_TEST- in test,
// FLWSECK- live). No encryption key is needed for the standard hosted
// checkout — the encryption key only applies to direct card charges,
// which this flow never makes. Amounts are MAJOR units: ₦10,000 is
// `10000`, not kobo.
//
// Money rule: Flutterwave charges the merchant ~2% on local Nigerian
// payments (1.4% + 0.6% platform fee; 4.8% international cards; 7.5%
// VAT on the fee). The customer is charged EXACTLY the requested NGN
// amount on the checkout page — the fee comes out of what Flutterwave
// settles to the merchant. The wallet is credited EXACTLY the requested
// NGN amount, never less: Royale Gold absorbs the fee (same house rule
// as PayTeller's 10%). The fee is recorded on the payment row for
// reconciliation and is never the credit.
import { timingSafeEqual } from "node:crypto";
import { getFlutterwaveCredentials } from "./gateway-settings";

export const FLUTTERWAVE_API_BASE_URL = (
  process.env.FLUTTERWAVE_API_BASE_URL || "https://api.flutterwave.com/v3"
).replace(/\/$/, "");

/** Nigerian methods on the hosted checkout, comma-separated (docs). */
export const FLUTTERWAVE_PAYMENT_OPTIONS = "card,banktransfer,ussd,account";

export interface FlutterwavePaymentResponse {
  status?: string;
  message?: string;
  data?: {
    link?: string;
    id?: number | string;
    tx_ref?: string;
    flw_ref?: string;
    status?: string;
    currency?: string;
    amount?: number | string;
    charged_amount?: number | string;
    app_fee?: number | string;
    merchant_fee?: number | string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** Error from the Flutterwave API (or from our side of the call). */
export class FlutterwaveError extends Error {
  statusCode: number;
  providerBody?: unknown;
  constructor(message: string, statusCode = 502) {
    super(message);
    this.statusCode = statusCode;
  }
}

function providerError(message: string, statusCode = 502): FlutterwaveError {
  return new FlutterwaveError(typeof message === "string" ? message : JSON.stringify(message), statusCode);
}

// Credentials are set by the owner in the Gateway panel (encrypted in
// GatewaySettings) — the env vars remain as a fallback so a key set
// either way works. A DB failure never breaks the fallback.
async function secretKey(): Promise<string> {
  const stored = await getFlutterwaveCredentials().catch(() => null);
  const key = stored?.secretKey || process.env.FLUTTERWAVE_SECRET_KEY || "";
  if (!key) {
    throw providerError("Flutterwave credentials are not configured", 503);
  }
  return key;
}

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

async function readResponse(response: Response): Promise<FlutterwavePaymentResponse> {
  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = { message: text };
  }
  if (response.ok) return body as FlutterwavePaymentResponse;
  const message = (body.message as string) || "Flutterwave request failed";
  const thrown = providerError(message, response.status >= 500 ? 502 : response.status);
  thrown.providerBody = body;
  throw thrown;
}

async function request(
  path: string,
  { method = "GET", body, requestFn = fetch }: { method?: string; body?: unknown; requestFn?: FetchFn } = {},
): Promise<FlutterwavePaymentResponse> {
  const key = await secretKey();
  let response: Response;
  try {
    response = await requestFn(`${FLUTTERWAVE_API_BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    throw providerError(
      `Unable to reach Flutterwave: ${error instanceof Error ? error.message : String(error)}`,
      502,
    );
  }
  return readResponse(response);
}

// NGN as a number in major units (docs + BetWins v3 service). Flutterwave
// takes naira, not kobo: ₦10,000 is 10000.
export function toAmountNumber(ngnAmount: number): number {
  const value = Number(ngnAmount);
  if (!Number.isFinite(value) || value <= 0) {
    throw providerError("Invalid amount", 400);
  }
  return Math.round(value * 100) / 100;
}

export interface CreatePaymentInput {
  reference: string;
  amountNgn: number;
  email: string;
  name?: string;
  phone?: string | null;
  userId?: string;
  redirectUrl?: string;
  requestFn?: FetchFn;
}

/**
 * POST /v3/payments — the standard hosted checkout (docs + BetWins v3
 * Nigeria service). The customer is redirected to the returned link
 * and pays there (card / bank transfer / USSD / bank account — the
 * customer picks on the checkout page). Creating a payment does NOT
 * charge the customer. The reference is our tx_ref (unique per
 * deposit, RG-<hex>); Flutterwave echoes it back on the redirect and
 * in the webhook, and it is how we find the local row.
 */
export async function initializePayment({
  reference,
  amountNgn,
  email,
  name,
  phone,
  userId,
  redirectUrl,
  requestFn,
}: CreatePaymentInput): Promise<{ link: string; response: FlutterwavePaymentResponse }> {
  if (!reference) throw providerError("Reference is required", 400);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
    throw providerError("A valid customer email is required", 400);
  }
  const response = await request("/payments", {
    method: "POST",
    requestFn,
    body: {
      tx_ref: String(reference),
      amount: toAmountNumber(amountNgn),
      currency: "NGN",
      redirect_url: redirectUrl ? String(redirectUrl) : undefined,
      payment_options: FLUTTERWAVE_PAYMENT_OPTIONS,
      customer: {
        email: String(email).trim(),
        ...(name ? { name: String(name) } : {}),
        ...(phone ? { phone_number: String(phone) } : {}),
      },
      customizations: {
        title: "Royale Gold",
        description: "Royale Gold wallet deposit",
        logo: "https://www.royalegolld.com/icon.png",
      },
      meta: {
        ...(userId ? { user_id: userId } : {}),
        source: "royale-gold",
      },
    },
  });
  const link = response?.data?.link ?? (response?.link as string | undefined) ?? null;
  if (typeof link !== "string" || !link) {
    throw providerError("Flutterwave did not return a checkout link", 502);
  }
  return { link, response };
}

export interface VerifyData {
  id?: number | string;
  tx_ref?: string;
  flw_ref?: string;
  status?: string;
  currency?: string;
  amount?: number | string;
  charged_amount?: number | string;
  app_fee?: number | string;
  merchant_fee?: number | string;
  customer?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * GET /v3/transactions/{id}/verify — the lock before any credit.
 * Returns the verify payload's data block. The caller checks status
 * === "successful", tx_ref, currency and amount against the local row.
 */
export async function verifyTransaction(
  transactionId: string | number,
  { requestFn }: { requestFn?: FetchFn } = {},
): Promise<VerifyData> {
  if (transactionId === "" || transactionId == null) {
    throw providerError("Flutterwave transaction ID is required", 400);
  }
  const response = await request(
    `/transactions/${encodeURIComponent(String(transactionId))}/verify`,
    { requestFn },
  );
  return (response?.data ?? {}) as VerifyData;
}

/**
 * GET /v3/transactions/verify_by_reference?tx_ref= — the fallback
 * lookup (BetWins v3 service): used when the customer never came back
 * through the redirect, so no transaction id is known. Returns null
 * when Flutterwave has no transaction for the reference yet.
 */
export async function verifyByReference(
  reference: string,
  { requestFn }: { requestFn?: FetchFn } = {},
): Promise<VerifyData | null> {
  if (!reference) throw providerError("Flutterwave tx_ref is required", 400);
  try {
    const response = await request(
      `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(String(reference))}`,
      { requestFn },
    );
    return (response?.data ?? {}) as VerifyData;
  } catch (err) {
    if (err instanceof FlutterwaveError && (err.statusCode === 404 || /no transaction/i.test(err.message))) {
      return null;
    }
    throw err;
  }
}

/**
 * GET /v3/banks/NG — tests the saved secret key without creating a
 * payment. A 200 means the key is valid; a 401/403 means Flutterwave
 * rejected it. (v3 has no /auth endpoint like PayTeller's.)
 */
export async function testFlutterwaveAuth({
  requestFn,
}: { requestFn?: FetchFn } = {}): Promise<{ authenticated: boolean }> {
  const response = await request("/banks/NG", { requestFn });
  return { authenticated: response?.status === "success" };
}

// The verify response reports `successful` where some list endpoints
// report `success` — normalize to one value for settlement.
export function normalizeStatus(status: string | null | undefined): string {
  const value = String(status || "").toLowerCase();
  if (value === "success") return "successful";
  return value;
}

export function isSuccessfulStatus(status: string | null | undefined): boolean {
  return normalizeStatus(status) === "successful";
}

// Verify the v3 webhook header (docs: "Verifying Webhook Signatures").
// v3 does NOT sign the payload: Flutterwave echoes the secret hash you
// set in the dashboard, as-is, in the `verif-hash` header. A plain
// constant-time compare is the whole check — never an HMAC (that is
// the v4 `flutterwave-signature` header, a different scheme). Returns
// false on any missing header, missing secret or mismatch.
export function verifyWebhookHash(
  header: string | null | undefined,
  secret: string,
): boolean {
  try {
    if (!secret || typeof header !== "string") return false;
    const a = Buffer.from(header.trim(), "utf8");
    const b = Buffer.from(secret.trim(), "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
