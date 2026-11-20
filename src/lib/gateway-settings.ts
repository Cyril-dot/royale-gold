// Phase 2 PayTeller (Nov 2026): gateway credentials + the Ghana MoMo
// gateway toggle. TypeScript port of BetWins
// backend/services/payment-settings.service.js (PayTeller fields only).
//
// Storage: AES-256-GCM, one ciphertext per field, format
// `iv.tag.ciphertext` (base64url). The key is SHA-256 of the
// GATEWAY_ENCRYPTION_KEY env var — a dedicated env var, never committed.
// If that env var is missing, SAVING a key FAILS with a clear 503 —
// never plaintext, never a silent insecure default. Reading falls back
// to env vars (PAYTELLER_API_KEY etc.) when the DB row has nothing, so
// a key set either way works; a DB failure never breaks the fallback.
//
// The owner panel only ever sees masked values (last-4). All saves are
// audit-logged by the route (action "gateway.settings").
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { prisma } from "./prisma";

/** Thrown for gateway config problems; carries the HTTP status to return. */
export class GatewayError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 503) {
    super(message);
    this.statusCode = statusCode;
  }
}

const ENCRYPTION_ENV = "GATEWAY_ENCRYPTION_KEY";

/** Merchant ID is TTM- + eight digits (docs §01). */
const MERCHANT_ID_RE = /^TTM-\d{8}$/;

/** Theteller (PaySwitch) hosts, verified against the live docs page
 *  20 Nov 2026: test host https://test.theteller.net everywhere;
 *  live host https://prod.theteller.net (seen on the card-reversal
 *  endpoint; the checkout live host is checkout.theteller.net). */
export const THETELLER_TEST_BASE_URL = "https://test.theteller.net";
export const THETELLER_LIVE_BASE_URL = "https://prod.theteller.net";

function encryptionKey(): Buffer {
  const raw = process.env[ENCRYPTION_ENV];
  if (!raw) {
    throw new GatewayError(
      "GATEWAY_ENCRYPTION_KEY is not set — the owner cannot save PayTeller keys until it is set on the server",
      503,
    );
  }
  return createHash("sha256").update(raw, "utf8").digest();
}

function encrypt(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((p) => p.toString("base64url")).join(".");
}

function decrypt(value: string): string {
  const [ivText, tagText, encryptedText] = String(value).split(".");
  if (!ivText || !tagText || !encryptedText) throw new Error("Stored gateway setting is invalid");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** Last-4 mask for the owner panel — the full value is never sent back. */
export function maskSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length <= 4) return "****";
  return `****${value.slice(-4)}`;
}

type GatewayRow = {
  paytellerApiKey: string | null;
  paytellerMerchantId: string | null;
  paytellerUsername: string | null;
  paytellerWebhookSecret: string | null;
  ghMomoGateway: string;
  updatedAt: Date;
};

async function getRow(): Promise<GatewayRow | null> {
  return prisma.gatewaySettings.findUnique({ where: { id: "global" } });
}

/** The Ghana MoMo gateway in force — "payteller" when nothing is set
 *  (Nov 2026, Chuks: live by default, no more silent demo credit).
 *  Three-way — "demo" | "theteller" (direct MoMo push) |
 *  "payteller" (hosted checkout, the default). The owner can still
 *  explicitly pick demo; only the default changed. */
export async function getGhMomoGateway(): Promise<"demo" | "payteller" | "theteller"> {
  const row = await getRow();
  if (row?.ghMomoGateway === "demo") return "demo";
  if (row?.ghMomoGateway === "theteller") return "theteller";
  return "payteller";
}

/** Decrypt one stored field; a bad key / bad ciphertext reads as empty. */
function decryptField(ciphertext: string | null | undefined): string {
  if (!ciphertext) return "";
  try {
    return decrypt(ciphertext);
  } catch {
    // A rotated or missing key must not crash the read path — the field
    // reads as unset and the owner can re-paste it. Never log the value.
    console.error("[gateway] stored PayTeller field could not be decrypted");
    return "";
  }
}

export interface PaytellerCredentials {
  apiKey: string;
  merchantId: string;
  username: string;
}

/**
 * Decrypted PayTeller credentials, DB first, env fallback. Returns null
 * when any of the three is missing (the caller turns that into a 503).
 */
export async function getPaytellerCredentials(): Promise<PaytellerCredentials | null> {
  const row = await getRow().catch(() => null);
  const apiKey = (row ? decryptField(row.paytellerApiKey) : "") || process.env.PAYTELLER_API_KEY || "";
  const merchantId =
    (row ? decryptField(row.paytellerMerchantId) : "") || process.env.PAYTELLER_MERCHANT_ID || "";
  const username =
    (row ? decryptField(row.paytellerUsername) : "") || process.env.PAYTELLER_USERNAME || "";
  if (!apiKey || !merchantId || !username) return null;
  return { apiKey, merchantId, username };
}

/** The webhook signing secret, DB first, env fallback ("" = not configured). */
export async function getPaytellerWebhookSecret(): Promise<string> {
  const row = await getRow().catch(() => null);
  return (
    (row ? decryptField(row.paytellerWebhookSecret) : "") || process.env.PAYTELLER_WEBHOOK_SECRET || ""
  );
}

// ---- Theteller (PaySwitch) direct MoMo push (Nov 2026) ----

function isMissingTable(err: unknown): boolean {
  const code = (err as { code?: string }).code;
  return code === "P2021" || code === "P2022";
}

type ThetellerRow = {
  thetellerApiUser: string | null;
  thetellerApiKey: string | null;
  thetellerMerchantId: string | null;
  thetellerCallbackSecret: string | null;
  thetellerBaseUrl: string | null;
};

/**
 * The Theteller columns, read with an explicit select — a prod DB
 * without rg-theteller.sql run returns null here instead of 500ing
 * the whole GatewaySettings read (the 17 Nov owner-500s lesson).
 * Callers fall back to env vars, so a key set either way works.
 */
async function getThetellerRow(): Promise<ThetellerRow | null> {
  try {
    return await prisma.gatewaySettings.findUnique({
      where: { id: "global" },
      select: {
        thetellerApiUser: true,
        thetellerApiKey: true,
        thetellerMerchantId: true,
        thetellerCallbackSecret: true,
        thetellerBaseUrl: true,
      },
    });
  } catch (err) {
    if (isMissingTable(err)) return null;
    throw err;
  }
}

export interface ThetellerCredentials {
  apiUser: string;
  apiKey: string;
  merchantId: string;
}

/**
 * Decrypted Theteller credentials, DB first, env fallback. Returns
 * null when any of the three is missing (the caller turns that into
 * a 503). Basic auth is apiUser:apiKey; the merchant ID goes in the
 * body (and as a Merchant-Id header on status checks).
 */
export async function getThetellerCredentials(): Promise<ThetellerCredentials | null> {
  const row = await getThetellerRow().catch(() => null);
  const apiUser = (row ? decryptField(row.thetellerApiUser) : "") || process.env.THETELLER_API_USER || "";
  const apiKey = (row ? decryptField(row.thetellerApiKey) : "") || process.env.THETELLER_API_KEY || "";
  const merchantId =
    (row ? decryptField(row.thetellerMerchantId) : "") || process.env.THETELLER_MERCHANT_ID || "";
  if (!apiUser || !apiKey || !merchantId) return null;
  return { apiUser, apiKey, merchantId };
}

/** The callback path token, DB first, env fallback ("" = not configured — the callback route 404s then). */
export async function getThetellerCallbackSecret(): Promise<string> {
  const row = await getThetellerRow().catch(() => null);
  return (
    (row ? decryptField(row.thetellerCallbackSecret) : "") || process.env.THETELLER_CALLBACK_SECRET || ""
  );
}

/**
 * The Theteller base URL: the stored value first (owner picks Test /
 * Live in the panel), then THETELLER_BASE_URL, then the test host.
 * Only https URLs are honoured — anything else falls back to test —
 * EXCEPT plain-http loopback (localhost / 127.0.0.1), which exists
 * so a local fake Theteller can be pointed at in development and
 * verification. Basic-auth credentials over plain http to any other
 * host would leak, so non-loopback http is never honoured.
 */
export function isAllowedThetellerBaseUrl(url: string): boolean {
  if (url.startsWith("https://")) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(url);
}

export async function getThetellerBaseUrl(): Promise<string> {
  const row = await getThetellerRow().catch(() => null);
  const stored = (row?.thetellerBaseUrl ?? "").trim();
  const candidate = stored || process.env.THETELLER_BASE_URL || "";
  if (candidate && isAllowedThetellerBaseUrl(candidate)) return candidate.replace(/\/$/, "");
  return THETELLER_TEST_BASE_URL;
}

export interface MaskedGatewaySettings {
  ghMomoGateway: "demo" | "payteller" | "theteller";
  paytellerConfigured: boolean;
  paytellerApiKey: string | null;
  paytellerMerchantId: string | null;
  paytellerUsername: string | null;
  paytellerWebhookSecret: string | null;
  thetellerConfigured: boolean;
  thetellerApiUser: string | null;
  thetellerApiKey: string | null;
  thetellerMerchantId: string | null;
  thetellerCallbackSecret: string | null;
  thetellerBaseUrl: string | null;
  updatedAt: string | null;
}

/** What the owner panel reads — masked values only, never the secrets. */
export async function getMaskedGatewaySettings(): Promise<MaskedGatewaySettings> {
  const row = await getRow();
  const apiKey = row ? decryptField(row.paytellerApiKey) : "";
  const merchantId = row ? decryptField(row.paytellerMerchantId) : "";
  const username = row ? decryptField(row.paytellerUsername) : "";
  const webhookSecret = row ? decryptField(row.paytellerWebhookSecret) : "";
  const tRow = await getThetellerRow();
  const tApiUser = tRow ? decryptField(tRow.thetellerApiUser) : "";
  const tApiKey = tRow ? decryptField(tRow.thetellerApiKey) : "";
  const tMerchantId = tRow ? decryptField(tRow.thetellerMerchantId) : "";
  const tCallbackSecret = tRow ? decryptField(tRow.thetellerCallbackSecret) : "";
  const tBaseUrl = (tRow?.thetellerBaseUrl ?? "").trim() || null;
  return {
    ghMomoGateway:
      row?.ghMomoGateway === "demo" ? "demo" : row?.ghMomoGateway === "theteller" ? "theteller" : "payteller",
    paytellerConfigured: Boolean(apiKey && merchantId && username && webhookSecret),
    paytellerApiKey: maskSecret(apiKey),
    paytellerMerchantId: maskSecret(merchantId),
    paytellerUsername: maskSecret(username),
    paytellerWebhookSecret: maskSecret(webhookSecret),
    thetellerConfigured: Boolean(tApiUser && tApiKey && tMerchantId),
    thetellerApiUser: maskSecret(tApiUser),
    thetellerApiKey: maskSecret(tApiKey),
    thetellerMerchantId: maskSecret(tMerchantId),
    thetellerCallbackSecret: maskSecret(tCallbackSecret),
    thetellerBaseUrl: tBaseUrl,
    updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
  };
}

export interface SaveGatewayInput {
  ghMomoGateway?: string;
  paytellerApiKey?: string;
  paytellerMerchantId?: string;
  paytellerUsername?: string;
  paytellerWebhookSecret?: string;
  thetellerApiUser?: string;
  thetellerApiKey?: string;
  thetellerMerchantId?: string;
  thetellerCallbackSecret?: string;
  thetellerBaseUrl?: string;
}

/**
 * Owner save: the toggle + any of the fields. A blank field KEEPS the
 * current stored value (same convention as BetWins). A non-empty secret
 * field is encrypted before storage — and when GATEWAY_ENCRYPTION_KEY
 * is missing that save fails with a clear 503 instead of storing
 * plaintext. The toggle alone (no secret fields) never needs the key.
 * Theteller base URL is stored as a plain host string (not a secret):
 * "test" / "live" from the panel map to the two known hosts, or a full
 * https:// URL the owner pastes. Saving Theteller fields when the
 * columns do not exist yet (rg-theteller.sql not run) fails with a
 * plain error naming the SQL — the upsert throws P2022.
 */
export async function saveGatewaySettings(input: SaveGatewayInput): Promise<MaskedGatewaySettings> {
  const gateway = (input.ghMomoGateway ?? "").trim().toLowerCase();
  if (gateway !== "" && gateway !== "demo" && gateway !== "payteller" && gateway !== "theteller") {
    throw new GatewayError("Ghana deposit gateway must be demo, theteller or payteller", 400);
  }
  const merchantId = (input.paytellerMerchantId ?? "").trim();
  if (merchantId && !MERCHANT_ID_RE.test(merchantId)) {
    throw new GatewayError("PayTeller Merchant ID must look like TTM-00984532.", 400);
  }
  const tMerchantId = (input.thetellerMerchantId ?? "").trim();
  if (tMerchantId && !MERCHANT_ID_RE.test(tMerchantId)) {
    throw new GatewayError("Theteller Merchant ID must look like TTM-00984532.", 400);
  }
  const baseUrlRaw = (input.thetellerBaseUrl ?? "").trim();
  const baseUrl =
    baseUrlRaw === "test"
      ? THETELLER_TEST_BASE_URL
      : baseUrlRaw === "live"
        ? THETELLER_LIVE_BASE_URL
        : baseUrlRaw;
  if (baseUrl && !isAllowedThetellerBaseUrl(baseUrl)) {
    throw new GatewayError("Theteller base URL must start with https:// (http:// is allowed only for localhost).", 400);
  }
  const fields: Array<[keyof SaveGatewayInput, "paytellerApiKey" | "paytellerMerchantId" | "paytellerUsername" | "paytellerWebhookSecret" | "thetellerApiUser" | "thetellerApiKey" | "thetellerMerchantId" | "thetellerCallbackSecret"]> = [
    ["paytellerApiKey", "paytellerApiKey"],
    ["paytellerMerchantId", "paytellerMerchantId"],
    ["paytellerUsername", "paytellerUsername"],
    ["paytellerWebhookSecret", "paytellerWebhookSecret"],
    ["thetellerApiUser", "thetellerApiUser"],
    ["thetellerApiKey", "thetellerApiKey"],
    ["thetellerMerchantId", "thetellerMerchantId"],
    ["thetellerCallbackSecret", "thetellerCallbackSecret"],
  ];
  const existing = await getRow();
  const data: Record<string, string | null> = {};
  for (const [inputKey, column] of fields) {
    const value = (input[inputKey] ?? "").trim();
    if (value) {
      // Throws GatewayError 503 when the encryption key is not set.
      data[column] = encrypt(value);
    } else if (existing) {
      data[column] = existing[column as keyof typeof existing] as string | null;
    } else {
      data[column] = null;
    }
  }
  // Theteller base URL is not a secret — stored plain. Blank keeps
  // the current value (same convention as the secret fields).
  const tExisting = await getThetellerRow();
  const baseUrlValue = baseUrl || tExisting?.thetellerBaseUrl || null;
  const row = await prisma.gatewaySettings.upsert({
    where: { id: "global" },
    update: {
      ...data,
      thetellerBaseUrl: baseUrlValue,
      ...(gateway !== "" ? { ghMomoGateway: gateway } : {}),
    },
    create: {
      id: "global",
      paytellerApiKey: data.paytellerApiKey,
      paytellerMerchantId: data.paytellerMerchantId,
      paytellerUsername: data.paytellerUsername,
      paytellerWebhookSecret: data.paytellerWebhookSecret,
      thetellerApiUser: data.thetellerApiUser,
      thetellerApiKey: data.thetellerApiKey,
      thetellerMerchantId: data.thetellerMerchantId,
      thetellerCallbackSecret: data.thetellerCallbackSecret,
      thetellerBaseUrl: baseUrlValue,
      ghMomoGateway: gateway === "demo" ? "demo" : gateway === "theteller" ? "theteller" : "payteller",
    },
  });
  void row;
  return getMaskedGatewaySettings();
}
