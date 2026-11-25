// Nov 2026 AlphaPay (Ghana only, docs.alphapay.me): direct MoMo
// push (softpay), server-side client. Built from the API reference
// at https://docs.alphapay.me/ — NOT from the other AlphaPay API
// (api.edibytes.online, /payments/initialize/, X-AlphaPay-Signature
// over the raw body, event payment.succeeded). That is a DIFFERENT
// AlphaPay; do not copy any endpoint, header or payload shape from
// it. This file talks only to api.alphapay.me /
// sandbox-api.alphapay.me, endpoints /payments/softpay/,
// /payments/{id}/verify/, /pricing/my-rates/, webhook headers
// X-Webhook-Signature + X-Webhook-Timestamp, event
// transaction.success.
//
// Flow: softpay a payment (the prompt goes straight to the
// customer's phone) → the customer approves on the phone → AlphaPay
// POSTs a signed webhook to /api/public/alphapay-webhook → we
// re-verify with GET and only then credit the wallet, exactly once.
// Never credit from a webhook body alone. If the softpay response
// carries a non-empty checkout_url, the customer gets NO push —
// redirect them to that URL instead (the normal behaviour for some
// networks, not an edge case).
//
// Auth: the SECRET key as Bearer <redacted> (sk_live_ in live, sk_test_
// in sandbox). Payment routes need key scope PAYIN or BOTH (wrong
// scope → 403 api_key_scope_forbidden). Amounts are decimal STRINGS
// in MAJOR units: GH₵100 is "100.00", not pesewas.
//
// Environment: decided by the BASE URL called, NOT the key prefix
// (docs warning — a sk_test_ key called on live processes real
// money). The saved environment label ("test" | "live") selects the
// base; unset infers from the key prefix; ALPHAPAY_API_BASE_URL
// overrides both (the test fake).
//
// Money rule: the customer pays EXACTLY the requested GHS amount —
// fee_charge_mode "DEDUCTED" is sent on every softpay call, so the
// customer is debited the principal and the fee comes out of what
// AlphaPay settles to the merchant. The wallet is credited EXACTLY
// the requested GHS amount, never less: Royale Gold absorbs the fee
// (same house rule as PayTeller's 10% and Flutterwave's ~2%). The
// fee (debited − net on the verify response) is recorded for
// reconciliation and is never the credit. HONEST LIMIT: the
// fee-mode override is honoured ONLY if ALLOW_CLIENT_OVERRIDE is
// enabled on the AlphaPay account — otherwise it is silently ignored
// and the account's default fee mode applies, so a customer could
// be debited amount + fee when the account default is ADD_ON. The
// owner must check Settings → Fees in the AlphaPay dashboard.
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  getAlphapayCredentials,
  getAlphapayEnvironment,
} from "./gateway-settings";

export const ALPHAPAY_API_BASE_URL_LIVE = "https://api.alphapay.me/api/v1";
export const ALPHAPAY_API_BASE_URL_SANDBOX = "https://sandbox-api.alphapay.me/api/v1";

/** Ghana networks on AlphaPay (docs formats table). */
export const ALPHAPAY_NETWORKS = {
  MTN: "mtn_gh",
  Telecel: "telecel_gh",
  AirtelTigo: "airteltigo_gh",
} as const;

export type AlphaPayMethod = keyof typeof ALPHAPAY_NETWORKS;

/** Error from the AlphaPay API (or from our side of the call). */
export class AlphaPayError extends Error {
  statusCode: number;
  providerBody?: unknown;
  constructor(message: string, statusCode = 502) {
    super(message);
    this.statusCode = statusCode;
  }
}

function providerError(message: string, statusCode = 502): AlphaPayError {
  return new AlphaPayError(typeof message === "string" ? message : JSON.stringify(message), statusCode);
}

// Nov 2026: AlphaPay answers some provider errors in French. The
// "no provider available" one is the one a player can actually hit
// (a network with no provider on the merchant's account — live it
// 422'd on mtn_gh while Test connection still said Connected). It
// is translated to plain English here, in the one place every caller
// reads its error from, so it never reaches a player-facing surface
// in French. Any message that does not match is returned exactly as
// AlphaPay sent it — nothing else is rewritten.
const NO_PROVIDER_RE = /Aucun fournisseur disponible pour le réseau (\w+) pour le moment/i;
const NO_PROVIDER_NETWORK_NAMES: Record<string, string> = {
  mtn_gh: "MTN",
  telecel_gh: "Telecel",
  airteltigo_gh: "AirtelTigo",
  vodafone_gh: "Telecel",
  tigo_gh: "AirtelTigo",
};

function translateProviderMessage(message: string): string {
  const match = NO_PROVIDER_RE.exec(message);
  if (!match) return message;
  const code = match[1].toLowerCase();
  const name = NO_PROVIDER_NETWORK_NAMES[code] ?? match[1];
  return `No payment provider is available for ${name} right now — try another network or try again later.`;
}

// Credentials are set by the owner in the Gateway panel (encrypted in
// GatewaySettings) — the env vars remain as a fallback so a key set
// either way works. A DB failure never breaks the fallback.
async function secretKey(): Promise<string> {
  const stored = await getAlphapayCredentials().catch(() => null);
  const key = stored?.secretKey || process.env.ALPHAPAY_SECRET_KEY || "";
  if (!key) {
    throw providerError("AlphaPay credentials are not configured", 503);
  }
  return key;
}

/**
 * The base URL for this call. Env override first (the test fake),
 * then the saved environment label, then the key prefix, then live.
 * Never infer the environment from anything else: the docs are
 * explicit that the base URL decides, not the key.
 */
export async function resolveAlphapayBaseUrl(): Promise<string> {
  const override = (process.env.ALPHAPAY_API_BASE_URL || "").replace(/\/$/, "");
  if (override) return override;
  const env = (await getAlphapayEnvironment().catch(() => "")) || "";
  if (env === "test") return ALPHAPAY_API_BASE_URL_SANDBOX;
  if (env === "live") return ALPHAPAY_API_BASE_URL_LIVE;
  const stored = await getAlphapayCredentials().catch(() => null);
  const key = stored?.secretKey || process.env.ALPHAPAY_SECRET_KEY || "";
  if (key.startsWith("sk_test_")) return ALPHAPAY_API_BASE_URL_SANDBOX;
  return ALPHAPAY_API_BASE_URL_LIVE;
}

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * AlphaPay's responses disagree between the reference panel (a flat
 * body) and the sandbox guide (the {success, data, code} envelope).
 * The introduction says the envelope applies to all responses — but
 * the code panel shows a flat 201. Accept both: unwrap `data` when
 * it is an object, otherwise use the body as-is.
 */
export function unwrapAlphaPayResponse(body: Record<string, unknown>): Record<string, unknown> {
  const data = body?.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return body;
}

function errorMessage(body: Record<string, unknown>): string {
  let message: string | null = null;
  if (typeof body.message === "string" && body.message) message = body.message;
  else {
    const err = body.error as Record<string, unknown> | undefined;
    if (err && typeof err.message === "string" && err.message) message = err.message;
    else {
      // Validation errors come back as {field: ["message", ...]}.
      for (const value of Object.values(body)) {
        if (Array.isArray(value) && typeof value[0] === "string") {
          message = value[0];
          break;
        }
      }
    }
  }
  if (!message) return "AlphaPay request failed";
  return translateProviderMessage(message);
}

async function readResponse(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = { message: text };
  }
  if (response.ok) return unwrapAlphaPayResponse(body);
  const message = errorMessage(body);
  const thrown = providerError(message, response.status >= 500 ? 502 : response.status);
  thrown.providerBody = body;
  throw thrown;
}

async function request(
  path: string,
  {
    method = "GET",
    body,
    idempotencyKey,
    requestFn = fetch,
  }: {
    method?: string;
    body?: unknown;
    idempotencyKey?: string;
    requestFn?: FetchFn;
  } = {},
): Promise<Record<string, unknown>> {
  const key = await secretKey();
  const base = await resolveAlphapayBaseUrl();
  let response: Response;
  try {
    response = await requestFn(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    throw providerError(
      `Unable to reach AlphaPay: ${error instanceof Error ? error.message : String(error)}`,
      502,
    );
  }
  return readResponse(response);
}

/** GHS as a 2dp decimal string ("100.00") — AlphaPay takes major units. */
export function toAmountString(ghsAmount: number): string {
  const value = Number(ghsAmount);
  if (!Number.isFinite(value) || value <= 0) {
    throw providerError("Invalid amount", 400);
  }
  return (Math.round(value * 100) / 100).toFixed(2);
}

/** Local 0XXXXXXXXX → +233XXXXXXXXX (AlphaPay wants +233 + 9 digits). */
export function toInternationalPhone(localPhone: string): string {
  const digits = String(localPhone).replace(/[\s-]/g, "");
  if (/^0\d{9}$/.test(digits)) return `+233${digits.slice(1)}`;
  if (/^\+233\d{9}$/.test(digits)) return digits;
  if (/^233\d{9}$/.test(digits)) return `+${digits}`;
  throw providerError("Enter a valid Ghana MoMo number (e.g. 0244 000 000)", 400);
}

export interface SoftpayInput {
  reference: string;
  amountGhs: number;
  email: string;
  firstName: string;
  lastName: string;
  phone: string; // local 0XXXXXXXXX — converted to +233 here
  network: string; // mtn_gh | telecel_gh | airteltigo_gh
  returnUrl?: string;
  userId?: string;
  idempotencyKey?: string;
  requestFn?: FetchFn;
}

export interface SoftpayResult {
  paymentId: string;
  status: string;
  /** Non-empty when AlphaPay wants a hosted page instead of a push. */
  checkoutUrl: string;
  response: Record<string, unknown>;
}

/**
 * POST /payments/softpay/ — the direct MoMo push. The prompt goes
 * straight to the customer's phone (MTN / Telecel / AirtelTigo);
 * the customer approves it there. Creating a payment does NOT charge
 * the customer — the push is only sent. The reference is our RG-
 * <16 hex> (sent in metadata — AlphaPay has no merchant-reference
 * field on softpay; its own reference is a TXN- number). The
 * payment UUID returned here is the lookup key for /verify and for
 * the webhook (data.id).
 */
export async function softpay({
  reference,
  amountGhs,
  email,
  firstName,
  lastName,
  phone,
  network,
  returnUrl,
  userId,
  idempotencyKey,
  requestFn,
}: SoftpayInput): Promise<SoftpayResult> {
  if (!reference) throw providerError("Reference is required", 400);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
    throw providerError("A valid customer email is required", 400);
  }
  const response = await request("/payments/softpay/", {
    method: "POST",
    requestFn,
    idempotencyKey: idempotencyKey ?? randomUUID(),
    body: {
      amount: toAmountString(amountGhs),
      currency: "GHS",
      country: "GH",
      network: String(network),
      customer: {
        email: String(email).trim(),
        first_name: String(firstName).trim(),
        last_name: String(lastName).trim(),
        phone: toInternationalPhone(phone),
      },
      description: "Royale Gold wallet deposit",
      // DEDUCTED: the customer is debited exactly the principal; the
      // fee comes out of what AlphaPay settles. See the money rule at
      // the top of this file for the ALLOW_CLIENT_OVERRIDE limit.
      fee_charge_mode: "DEDUCTED",
      ...(returnUrl ? { return_url: String(returnUrl) } : {}),
      metadata: {
        reference: String(reference),
        ...(userId ? { user_id: userId } : {}),
        source: "royale-gold",
      },
    },
  });
  const paymentId = response?.id != null ? String(response.id) : "";
  if (!paymentId) {
    throw providerError("AlphaPay did not return a payment id", 502);
  }
  return {
    paymentId,
    status: String(response?.status ?? "PENDING"),
    checkoutUrl: typeof response?.checkout_url === "string" ? response.checkout_url : "",
    response,
  };
}

export interface VerifyData {
  id?: string | number;
  reference?: string;
  status?: string;
  currency?: string;
  requested_amount?: number | string;
  amount?: number | string;
  net_amount?: number | string;
  debited_amount?: number | string;
  client_fee?: number | string;
  gateway_fee?: number | string;
  platform_fee?: number | string;
  [key: string]: unknown;
}

/**
 * GET /payments/{payment_id}/verify/ — the lock before any credit.
 * If the transaction is still PENDING, AlphaPay re-checks its real
 * state with the gateway before answering — never trust a cached
 * status. NOTE: `reference` here is AlphaPay's own TXN- reference,
 * NOT our RG- reference — never compare it to the local row.
 */
export async function verifyPayment(
  paymentId: string,
  { requestFn }: { requestFn?: FetchFn } = {},
): Promise<VerifyData> {
  if (!paymentId) throw providerError("AlphaPay payment id is required", 400);
  const response = await request(`/payments/${encodeURIComponent(paymentId)}/verify/`, {
    requestFn,
  });
  return response as VerifyData;
}

/**
 * GET /pricing/my-rates/ — the per-network fee tiers for this
 * merchant's key. Used by the owner "Test connection" probe: a 200
 * means the key is valid, and the Ghana rows prove the account can
 * collect on mtn_gh / telecel_gh / airteltigo_gh. No public Ghana
 * fee exists in the docs — this is the only place to read it.
 */
export async function getMyRates({
  requestFn,
}: { requestFn?: FetchFn } = {}): Promise<unknown> {
  return request("/pricing/my-rates/", { requestFn });
}

// AlphaPay statuses are UPPER-CASE: PENDING, SUCCESS, FAILED,
// CANCELLED. Local rows use the Flutterwave words.
export function normalizeStatus(status: string | null | undefined): string {
  const value = String(status || "").toLowerCase();
  if (value === "success") return "successful";
  return value;
}

export function isSuccessfulStatus(status: string | null | undefined): boolean {
  return normalizeStatus(status) === "successful";
}

/** Terminal failure on AlphaPay's side (CANCELLED never credits either). */
export function isFailedStatus(status: string | null | undefined): boolean {
  const value = normalizeStatus(status);
  return value === "failed" || value === "cancelled";
}

/** Max age of a webhook timestamp: 5 minutes (docs). */
export const WEBHOOK_TIMESTAMP_TOLERANCE_S = 300;

// Verify an AlphaPay webhook delivery (docs: "Webhooks"). Each
// delivery carries X-Webhook-Signature (lowercase hex HMAC-SHA256),
// X-Webhook-Timestamp (Unix seconds) and X-Webhook-Event. The signed
// string is "{timestamp}.{rawBody}" — the timestamp, a dot, the exact
// raw JSON body. Verify BOTH: (1) the timestamp is no more than 300 s
// from now (a replayed delivery fails the age check); (2) the HMAC
// over the RAW body received, never a re-serialised payload,
// compared in constant time. The signing secret is SEPARATE from the
// API secret key — it is shown once at webhook creation in the
// dashboard and never returned by any read API.
export function verifyWebhookSignature(
  rawBody: string,
  timestampHeader: string | null | undefined,
  signatureHeader: string | null | undefined,
  secret: string,
): boolean {
  try {
    if (!secret || typeof signatureHeader !== "string" || typeof timestampHeader !== "string") {
      return false;
    }
    const timestamp = Number(timestampHeader.trim());
    if (!Number.isFinite(timestamp)) return false;
    const nowS = Math.floor(Date.now() / 1000);
    if (Math.abs(nowS - timestamp) > WEBHOOK_TIMESTAMP_TOLERANCE_S) return false;
    const computed = createHmac("sha256", secret)
      .update(`${timestampHeader.trim()}.${rawBody}`, "utf8")
      .digest("hex");
    const a = Buffer.from(computed, "utf8");
    const b = Buffer.from(signatureHeader.trim().toLowerCase(), "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
