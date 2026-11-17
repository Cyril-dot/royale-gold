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

/** The Ghana MoMo gateway in force — "demo" when nothing is set. */
export async function getGhMomoGateway(): Promise<"demo" | "payteller"> {
  const row = await getRow();
  return row?.ghMomoGateway === "payteller" ? "payteller" : "demo";
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

export interface MaskedGatewaySettings {
  ghMomoGateway: "demo" | "payteller";
  paytellerConfigured: boolean;
  paytellerApiKey: string | null;
  paytellerMerchantId: string | null;
  paytellerUsername: string | null;
  paytellerWebhookSecret: string | null;
  updatedAt: string | null;
}

/** What the owner panel reads — masked values only, never the secrets. */
export async function getMaskedGatewaySettings(): Promise<MaskedGatewaySettings> {
  const row = await getRow();
  const apiKey = row ? decryptField(row.paytellerApiKey) : "";
  const merchantId = row ? decryptField(row.paytellerMerchantId) : "";
  const username = row ? decryptField(row.paytellerUsername) : "";
  const webhookSecret = row ? decryptField(row.paytellerWebhookSecret) : "";
  return {
    ghMomoGateway: row?.ghMomoGateway === "payteller" ? "payteller" : "demo",
    paytellerConfigured: Boolean(apiKey && merchantId && username && webhookSecret),
    paytellerApiKey: maskSecret(apiKey),
    paytellerMerchantId: maskSecret(merchantId),
    paytellerUsername: maskSecret(username),
    paytellerWebhookSecret: maskSecret(webhookSecret),
    updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
  };
}

export interface SaveGatewayInput {
  ghMomoGateway?: string;
  paytellerApiKey?: string;
  paytellerMerchantId?: string;
  paytellerUsername?: string;
  paytellerWebhookSecret?: string;
}

/**
 * Owner save: the toggle + any of the 4 fields. A blank field KEEPS the
 * current stored value (same convention as BetWins). A non-empty secret
 * field is encrypted before storage — and when GATEWAY_ENCRYPTION_KEY
 * is missing that save fails with a clear 503 instead of storing
 * plaintext. The toggle alone (no secret fields) never needs the key.
 */
export async function saveGatewaySettings(input: SaveGatewayInput): Promise<MaskedGatewaySettings> {
  const gateway = (input.ghMomoGateway ?? "").trim().toLowerCase();
  if (gateway !== "" && gateway !== "demo" && gateway !== "payteller") {
    throw new GatewayError("Ghana deposit gateway must be demo or payteller", 400);
  }
  const merchantId = (input.paytellerMerchantId ?? "").trim();
  if (merchantId && !MERCHANT_ID_RE.test(merchantId)) {
    throw new GatewayError("PayTeller Merchant ID must look like TTM-00984532.", 400);
  }
  const fields: Array<[keyof SaveGatewayInput, "paytellerApiKey" | "paytellerMerchantId" | "paytellerUsername" | "paytellerWebhookSecret"]> = [
    ["paytellerApiKey", "paytellerApiKey"],
    ["paytellerMerchantId", "paytellerMerchantId"],
    ["paytellerUsername", "paytellerUsername"],
    ["paytellerWebhookSecret", "paytellerWebhookSecret"],
  ];
  const existing = await getRow();
  const data: Record<string, string | null> = {};
  for (const [inputKey, column] of fields) {
    const value = (input[inputKey] ?? "").trim();
    if (value) {
      // Throws GatewayError 503 when the encryption key is not set.
      data[column] = encrypt(value);
    } else if (existing) {
      data[column] = existing[column];
    } else {
      data[column] = null;
    }
  }
  const row = await prisma.gatewaySettings.upsert({
    where: { id: "global" },
    update: {
      ...data,
      ...(gateway !== "" ? { ghMomoGateway: gateway } : {}),
    },
    create: {
      id: "global",
      paytellerApiKey: data.paytellerApiKey,
      paytellerMerchantId: data.paytellerMerchantId,
      paytellerUsername: data.paytellerUsername,
      paytellerWebhookSecret: data.paytellerWebhookSecret,
      ghMomoGateway: gateway === "payteller" ? "payteller" : "demo",
    },
  });
  void row;
  return getMaskedGatewaySettings();
}
