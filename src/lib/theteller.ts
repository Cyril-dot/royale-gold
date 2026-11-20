// Nov 2026 Theteller (PaySwitch) direct MoMo push — server-side
// client. The prompt goes straight to the customer's phone (USSD/PIN),
// no hosted checkout page.
//
// Flow: our API calls POST /v1.1/transaction/process with the saved
// deposit number and network → Theteller sends the MoMo prompt → the
// customer approves on their phone → we confirm via the process
// response and/or GET /v1.1/users/transactions/{id}/status, and only
// then credit the wallet exactly once (src/lib/theteller-deposit.ts).
// Never credit from a browser claim, a callback alone, or a poll
// result alone.
//
// Docs: https://theteller.net/documentation ("Mobile Money Payments"
// + "Theteller Response Codes", read 20 Nov 2026). Verified against
// the live docs page:
//   - POST /v1.1/transaction/process, processing_code "000200" for a
//     mobile money payment, amount 12-digit zero-padded pesewas,
//     transaction_id 12 digits, r-switch MTN / VDF / ATL / TGO (+
//     ZPY, GMY), subscriber_number "(10 - 12)" — the worked example
//     sends 12-digit 233 format ("233243124824").
//   - GET /v1.1/users/transactions/{transaction_id}/status with a
//     `Merchant-Id` header.
//   - Basic auth (API user + API key) on every call.
//   - Response codes: 000 success, 111 "Payment request sent
//     successfully" (prompt sent, pending), 101/105 insufficient
//     funds, 102 number not registered, 103 wrong PIN or timed out,
//     104 declined/terminated, 107 USSD busy, 114 invalid voucher,
//     909 duplicate transaction id, 979/600/999 access denied.
//   - Test host https://test.theteller.net; live host
//     https://prod.theteller.net (seen on the card-reversal endpoint;
//     the checkout live host is checkout.theteller.net).
// NOT resolved by the docs (see the report):
//   - the voucher field name — the docs never show it in a request
//     body (code 114 proves vouchers exist); community SDKs pass
//     `voucher_code`, which is what we send.
//   - any minimum length for `desc` — none is stated; we send a
//     27-character narration, safely above the rumoured ~10.
//   - whether Theteller POSTs a callback for direct process
//     payments, and how it is configured — the docs describe a
//     redirect_url only for the hosted checkout. The callback route
//     exists so it works IF PaySwitch supports configuring a
//     notification URL; the poll + status check is the primary path.
//   - the status-check example in the docs shows NO Authorization
//     header (only Merchant-Id) — we send Basic auth AND Merchant-Id;
//     sending auth the endpoint ignores is harmless, missing auth it
//     requires is fatal.
//
// Money rule (same as PayTeller): Theteller charges the merchant,
// the wallet is credited EXACTLY the requested GHS principal — the
// house absorbs the provider charge. Integer pesewas on the wire,
// never floats.
import { randomInt } from "node:crypto";
import {
  getThetellerBaseUrl,
  getThetellerCredentials,
} from "./gateway-settings";

// Docs cap: a single payment is "0.01" to "1000000.00" GHS — the same
// band PayTeller enforces; the 12-digit pesewas field caps far above it.
export const MAX_AMOUNT_GHS = 1000000;

/** The networks Theteller debits (r-switch values, docs §"Mobile Money Payments"). */
export const THETELLER_NETWORKS = ["MTN", "VDF", "ATL", "TGO"] as const;
export type ThetellerNetwork = (typeof THETELLER_NETWORKS)[number];

export interface ThetellerResponse {
  status?: string;
  code?: string | number;
  reason?: string;
  transaction_id?: string;
  "r-switch"?: string;
  r_switch?: string;
  subscriber_number?: string;
  amount?: string | number;
  [key: string]: unknown;
}

/** Error from the Theteller API (or from our side of the call). */
export class ThetellerError extends Error {
  statusCode: number;
  providerCode?: string | null;
  providerBody?: unknown;
  constructor(message: string, statusCode = 502, code?: string | null) {
    super(message);
    this.statusCode = statusCode;
    if (code) this.providerCode = code;
  }
}

function providerError(message: string, statusCode = 502, code: string | null = null): ThetellerError {
  return new ThetellerError(typeof message === "string" ? message : JSON.stringify(message), statusCode, code);
}

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

async function readResponse(response: Response): Promise<ThetellerResponse> {
  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = { message: text };
  }
  if (response.ok) return body as ThetellerResponse;
  const message =
    (body.reason as string) || (body.message as string) || (body.error as string) || "Theteller request failed";
  const thrown = providerError(
    message,
    response.status >= 500 ? 502 : response.status,
    body.code != null ? String(body.code) : null,
  );
  thrown.providerBody = body;
  throw thrown;
}

async function request(
  path: string,
  { method = "GET", body, requestFn = fetch, merchantId = false }: { method?: string; body?: unknown; requestFn?: FetchFn; merchantId?: boolean } = {},
): Promise<ThetellerResponse> {
  const creds = await getThetellerCredentials();
  if (!creds) {
    throw providerError("Theteller credentials are not configured", 503);
  }
  const baseUrl = await getThetellerBaseUrl();
  let response: Response;
  try {
    response = await requestFn(`${baseUrl}${path}`, {
      method,
      headers: {
        // Docs: Basic base64("API_USER:API_KEY") on every call.
        Authorization: `Basic ${Buffer.from(`${creds.apiUser}:${creds.apiKey}`, "utf8").toString("base64")}`,
        // Merchant-Id ONLY on the status check: the docs' process
        // section lists Content-Type + Basic auth + Cache-Control
        // only (confirmed by a live read 20 Nov 2026). An extra
        // header is usually ignored, but there is no reason to send
        // one the docs do not list on a money call.
        ...(merchantId ? { "Merchant-Id": creds.merchantId } : {}),
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        "Cache-Control": "no-cache",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      // MoMo can block until the customer acts (docs suggest 90s).
      signal: AbortSignal.timeout(90_000),
    });
  } catch (error) {
    if (error instanceof ThetellerError) throw error;
    // A timeout / network failure means the outcome is UNKNOWN — the
    // caller must NOT fail the payment, only reconcile via status.
    const err = providerError(
      `Unable to reach Theteller: ${error instanceof Error ? error.message : String(error)}`,
      502,
    );
    (err as unknown as { isNetworkError: boolean }).isNetworkError = true;
    throw err;
  }
  return readResponse(response);
}

export function isNetworkError(err: unknown): boolean {
  return (err as { isNetworkError?: boolean } | null)?.isNetworkError === true;
}

/** GHS 2.00 -> "000000000200": integer pesewas, 12-digit zero-padded.
 * A fractional pesewa (e.g. GH₵0.005) is REJECTED, never silently
 * rounded — rounding would charge the customer more than they asked
 * for. The 1e-6 epsilon absorbs float noise (19.99 * 100 =
 * 1998.9999999999998) without letting a real half-pesewa through. */
export function toMinor12(ghsAmount: number): string {
  const value = Number(ghsAmount);
  if (!Number.isFinite(value) || value <= 0 || value > MAX_AMOUNT_GHS) {
    throw providerError("Invalid amount", 400, "invalid_amount");
  }
  const raw = value * 100;
  const pesewas = Math.round(raw);
  if (Math.abs(raw - pesewas) > 1e-6 || pesewas <= 0 || pesewas > 999_999_999_999) {
    throw providerError("Invalid amount", 400, "invalid_amount");
  }
  return String(pesewas).padStart(12, "0");
}

/** GHS -> integer pesewas (for the DB row + the amount check).
 * Same rule as toMinor12: a fractional pesewa throws. */
export function toPesewas(ghsAmount: number): number {
  const value = Number(ghsAmount);
  if (!Number.isFinite(value) || value <= 0) {
    throw providerError("Invalid amount", 400, "invalid_amount");
  }
  const raw = value * 100;
  const pesewas = Math.round(raw);
  if (Math.abs(raw - pesewas) > 1e-6) {
    throw providerError("Invalid amount", 400, "invalid_amount");
  }
  return pesewas;
}

/** 12-digit unique id. Crypto-random (not timestamp-based — two
 *  concurrent attempts must never collide); the DB unique constraint
 *  is the backstop and the caller regenerates on a clash. */
export function newTransactionId(): string {
  return String(randomInt(0, 1_000_000_000_000)).padStart(12, "0");
}

/** "0244...", "+233244...", "233244..." -> local "0244..." (10 digits). */
export function normalizeGhPhone(raw: string): string {
  const d = String(raw).replace(/\D/g, "");
  if (d.startsWith("233") && d.length === 12) return `0${d.slice(3)}`;
  if (d.length === 10 && d.startsWith("0")) return d;
  throw providerError("Invalid Ghana phone number", 400, "invalid_phone");
}

/** Local "0244..." -> wire "233244..." — the format in the docs'
 *  worked MoMo example (subscriber_number "(10 - 12)"). */
export function toWirePhone(localPhone: string): string {
  const local = normalizeGhPhone(localPhone);
  return `233${local.slice(1)}`;
}

export interface ChargeMomoInput {
  transactionId: string;
  amountGhs: number;
  phone: string;
  network: ThetellerNetwork;
  description?: string;
  voucherCode?: string;
  requestFn?: FetchFn;
}

/**
 * POST /v1.1/transaction/process — send the MoMo prompt to the phone.
 * Voucher is required for Telecel/Vodafone (VDF): the customer
 * generates it on their phone first (*110#) and it is sent in the
 * same request as `voucher_code` (field name NOT in the docs — from
 * community SDKs; code 114 "Invalid Voucher code" proves vouchers
 * exist in the flow). The voucher is never stored anywhere.
 */
export async function chargeMomo({
  transactionId,
  amountGhs,
  phone,
  network,
  description,
  voucherCode,
  requestFn,
}: ChargeMomoInput): Promise<ThetellerResponse> {
  if (!/^\d{12}$/.test(String(transactionId))) {
    throw providerError("Transaction id must be exactly 12 digits", 400, "invalid_transaction_id");
  }
  if (!THETELLER_NETWORKS.includes(network)) {
    throw providerError("Unknown network", 400, "invalid_network");
  }
  if (network === "VDF" && !voucherCode?.trim()) {
    throw providerError("Voucher code required for Telecel/Vodafone — dial *110# to generate one", 400, "voucher_required");
  }
  const body: Record<string, string> = {
    amount: toMinor12(amountGhs),
    processing_code: "000200",
    transaction_id: String(transactionId),
    // 27 chars — safely above the rumoured ~10-char minimum (unverified).
    desc: String(description || "Royale Gold wallet deposit").slice(0, 250),
    merchant_id: (await getThetellerCredentials())?.merchantId ?? "",
    subscriber_number: toWirePhone(phone),
    "r-switch": network,
  };
  if (network === "VDF") body.voucher_code = String(voucherCode).trim();
  return request("/v1.1/transaction/process", { method: "POST", requestFn, body });
}

/** GET /v1.1/users/transactions/{transaction_id}/status (docs §"Checking payment response"). Merchant-Id rides here — and only here. */
export async function getStatus(
  transactionId: string,
  { requestFn }: { requestFn?: FetchFn } = {},
): Promise<ThetellerResponse> {
  if (!/^\d{12}$/.test(String(transactionId))) {
    throw providerError("Transaction id must be exactly 12 digits", 400, "invalid_transaction_id");
  }
  return request(`/v1.1/users/transactions/${encodeURIComponent(String(transactionId))}/status`, { requestFn, merchantId: true });
}

export type PaymentStatus = "PENDING" | "SUCCESS" | "FAILED";

/**
 * Map a Theteller response to our status. Unknown codes default to
 * PENDING plus a reconciliation check — NEVER to SUCCESS. The code
 * arrives as a string ("000") or a number (200) depending on the
 * endpoint, so it is normalised first. 000 + approved/successful is
 * the only SUCCESS. 111 is the prompt-sent code ("Payment request
 * sent successfully"). The documented failure codes and any
 * declined/failed/error status are FAILED. 107 (USSD busy) is
 * deliberately NOT a failure — it is transient ("try again later"),
 * so it stays PENDING until the prompt window expires and the
 * timeout fails it; failing it at once would punish the customer
 * for a busy network and count it toward their block.
 */
const FAILURE_CODES = new Set(["100", "101", "102", "103", "104", "105", "114", "909", "600", "979", "999"]);

export function mapStatus(r: ThetellerResponse | null | undefined): PaymentStatus {
  // A null / non-object body (empty response, bad JSON) is unknown —
  // PENDING, never SUCCESS and never a crash in the settle path.
  if (!r || typeof r !== "object") return "PENDING";
  const code = r.code != null ? String(r.code) : "";
  const status = String(r.status ?? "").toLowerCase();
  if (code === "000" && (status === "approved" || status === "successful" || status === "success")) {
    return "SUCCESS";
  }
  if (code === "111") return "PENDING";
  if (FAILURE_CODES.has(code)) return "FAILED";
  if (status === "declined" || status === "failed" || status === "error") return "FAILED";
  return "PENDING";
}

export function isSuccessfulResponse(r: ThetellerResponse): boolean {
  return mapStatus(r) === "SUCCESS";
}
