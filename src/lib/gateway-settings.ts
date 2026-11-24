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

// Nov 2026: Theteller direct MoMo push REMOVED (Chuks: PayTeller
// only). The Theteller credential getters, base-URL helpers and host
// constants lived here; the columns stay in the DB (dormant) and the
// ThetellerPayment rows stay readable for wallet History.

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

/** Nov 2026 Flutterwave v3 (Nigeria only): the new columns, read with
 *  an explicit select so a prod DB without them (rg-flutterwave.sql
 *  not run yet) degrades to null instead of P2022. */
type NgGatewayRow = {
  flutterwavePublicKey: string | null;
  flutterwaveSecretKey: string | null;
  flutterwaveWebhookSecret: string | null;
  flutterwaveEnvironment: string | null;
  ngGateway: string | null;
};

/** Nov 2026 AlphaPay (Ghana only): the new columns, read with an
 *  explicit select so a prod DB without them (rg-alphapay.sql not
 *  run yet) degrades to null instead of P2022. */
type AlphaPayRow = {
  alphapaySecretKey: string | null;
  alphapayWebhookSecret: string | null;
  alphapayEnvironment: string | null;
};

function isMissingTable(err: unknown): boolean {
  const code = (err as { code?: string }).code;
  return code === "P2021" || code === "P2022";
}

async function getRow(): Promise<GatewayRow | null> {
  // Explicit select (pre-Flutterwave columns only): a plain findUnique
  // would name the new Flutterwave columns too and P2022 before
  // rg-flutterwave.sql runs — the Ghana reads must never break for
  // that (17 Nov owner-500s lesson).
  return prisma.gatewaySettings.findUnique({
    where: { id: "global" },
    select: {
      paytellerApiKey: true,
      paytellerMerchantId: true,
      paytellerUsername: true,
      paytellerWebhookSecret: true,
      ghMomoGateway: true,
      updatedAt: true,
    },
  });
}

/** The Nigeria columns, or null when the table/columns do not exist yet. */
async function getNgRow(): Promise<NgGatewayRow | null> {
  try {
    return await prisma.gatewaySettings.findUnique({
      where: { id: "global" },
      select: {
        flutterwavePublicKey: true,
        flutterwaveSecretKey: true,
        flutterwaveWebhookSecret: true,
        flutterwaveEnvironment: true,
        ngGateway: true,
      },
    });
  } catch (err) {
    if (isMissingTable(err)) return null;
    throw err;
  }
}

/** The AlphaPay columns, or null when the table/columns do not exist yet. */
async function getAlphaRow(): Promise<AlphaPayRow | null> {
  try {
    return await prisma.gatewaySettings.findUnique({
      where: { id: "global" },
      select: {
        alphapaySecretKey: true,
        alphapayWebhookSecret: true,
        alphapayEnvironment: true,
      },
    });
  } catch (err) {
    if (isMissingTable(err)) return null;
    throw err;
  }
}

/** The Ghana MoMo gateway in force — "payteller" when nothing is set
 *  (Nov 2026, Chuks: live by default, no more silent demo credit).
 *  Three-way — "demo" | "payteller" (hosted checkout, the default) |
 *  "alphapay" (direct MoMo push, Nov 2026).
 *  Theteller direct MoMo push was REMOVED Nov 2026 (Chuks: PayTeller
 *  only) — a row still stamped "theteller" reads as PayTeller, so a
 *  stale toggle can never re-enable the prompt. The owner can still
 *  explicitly pick demo; only the default changed. */
export async function getGhMomoGateway(): Promise<"demo" | "payteller" | "theteller" | "alphapay"> {
  const row = await getRow();
  if (row?.ghMomoGateway === "demo") return "demo";
  if (row?.ghMomoGateway === "alphapay") return "alphapay";
  // Nov 2026: Theteller removed — a stale "theteller" row is PayTeller.
  // The "theteller" member stays in the type so existing callers keep
  // compiling; it is never returned.
  return "payteller";
}

/** The Nigeria gateway in force — "flutterwave" when nothing is set
 *  (Nov 2026: live by default, no more silent demo credit — the same
 *  call as Ghana's PayTeller default). Two-way — "demo" |
 *  "flutterwave" (hosted checkout, the default). Never throws: a DB
 *  without the columns reads as the default, and the create route
 *  turns that into a 503 naming rg-flutterwave.sql. */
export async function getNgGateway(): Promise<"demo" | "flutterwave"> {
  const row = await getNgRow().catch(() => null);
  if (row?.ngGateway === "demo") return "demo";
  return "flutterwave";
}

/** True when the Nigeria columns exist in the DB (rg-flutterwave.sql
 *  has run). The create route uses this to fail closed with the SQL
 *  name instead of a misleading "not configured". */
export async function isFlutterwaveSetup(): Promise<boolean> {
  const row = await getNgRow().catch(() => null);
  return row !== null;
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

export interface FlutterwaveCredentials {
  publicKey: string;
  secretKey: string;
}

/**
 * Decrypted Flutterwave v3 credentials, DB first, env fallback.
 * Returns null when the secret key is missing (the caller turns that
 * into a 503). The public key is not needed for the standard hosted
 * checkout (only the secret signs the Bearer <redacted> — but the panel
 * collects it anyway, and the flip guard wants all three fields set.
 */
export async function getFlutterwaveCredentials(): Promise<FlutterwaveCredentials | null> {
  const row = await getNgRow().catch(() => null);
  const publicKey =
    (row ? decryptField(row.flutterwavePublicKey) : "") || process.env.FLUTTERWAVE_PUBLIC_KEY || "";
  const secretKey =
    (row ? decryptField(row.flutterwaveSecretKey) : "") || process.env.FLUTTERWAVE_SECRET_KEY || "";
  if (!secretKey) return null;
  return { publicKey, secretKey };
}

/** The v3 webhook secret hash, DB first, env fallback ("" = not configured). */
export async function getFlutterwaveWebhookSecret(): Promise<string> {
  const row = await getNgRow().catch(() => null);
  return (
    (row ? decryptField(row.flutterwaveWebhookSecret) : "") ||
    process.env.FLUTTERWAVE_WEBHOOK_SECRET ||
    ""
  );
}

/** The environment the saved keys belong to ("test" | "live", "" = unset). */
export async function getFlutterwaveEnvironment(): Promise<string> {
  const row = await getNgRow().catch(() => null);
  return row?.flutterwaveEnvironment ?? "";
}

/** True when the AlphaPay columns exist in the DB (rg-alphapay.sql
 *  has run). The create route uses this to fail closed with the SQL
 *  name instead of a misleading "not configured". */
export async function isAlphapaySetup(): Promise<boolean> {
  const row = await getAlphaRow().catch(() => null);
  return row !== null;
}

export interface AlphapayCredentials {
  secretKey: string;
}

/**
 * Decrypted AlphaPay credentials, DB first, env fallback. Returns
 * null when the secret key is missing (the caller turns that into a
 * 503). The secret key is the ONLY API credential AlphaPay needs —
 * there is no public key / merchant id on this API.
 */
export async function getAlphapayCredentials(): Promise<AlphapayCredentials | null> {
  const row = await getAlphaRow().catch(() => null);
  const secretKey =
    (row ? decryptField(row.alphapaySecretKey) : "") || process.env.ALPHAPAY_SECRET_KEY || "";
  if (!secretKey) return null;
  return { secretKey };
}

/**
 * The webhook SIGNING secret, DB first, env fallback ("" = not
 * configured). This is SEPARATE from the API secret key — it is
 * shown once at webhook creation in the AlphaPay dashboard and never
 * returned by any read API, so it must be pasted here by hand.
 */
export async function getAlphapayWebhookSecret(): Promise<string> {
  const row = await getAlphaRow().catch(() => null);
  return (
    (row ? decryptField(row.alphapayWebhookSecret) : "") ||
    process.env.ALPHAPAY_WEBHOOK_SECRET ||
    ""
  );
}

/** The environment the saved keys belong to ("test" | "live", "" = unset). */
export async function getAlphapayEnvironment(): Promise<string> {
  const row = await getAlphaRow().catch(() => null);
  return row?.alphapayEnvironment ?? "";
}

export interface MaskedGatewaySettings {
  ghMomoGateway: "demo" | "payteller" | "theteller" | "alphapay";
  paytellerConfigured: boolean;
  paytellerApiKey: string | null;
  paytellerMerchantId: string | null;
  paytellerUsername: string | null;
  paytellerWebhookSecret: string | null;
  ngGateway: "demo" | "flutterwave";
  flutterwaveConfigured: boolean;
  flutterwavePublicKey: string | null;
  flutterwaveSecretKey: string | null;
  flutterwaveWebhookSecret: string | null;
  flutterwaveEnvironment: string | null;
  alphapayConfigured: boolean;
  alphapaySecretKey: string | null;
  alphapayWebhookSecret: string | null;
  alphapayEnvironment: string | null;
  updatedAt: string | null;
}

/** What the owner panel reads — masked values only, never the secrets. */
export async function getMaskedGatewaySettings(): Promise<MaskedGatewaySettings> {
  const row = await getRow();
  const apiKey = row ? decryptField(row.paytellerApiKey) : "";
  const merchantId = row ? decryptField(row.paytellerMerchantId) : "";
  const username = row ? decryptField(row.paytellerUsername) : "";
  const webhookSecret = row ? decryptField(row.paytellerWebhookSecret) : "";
  const ngRow = await getNgRow().catch(() => null);
  const flwPublicKey = ngRow ? decryptField(ngRow.flutterwavePublicKey) : "";
  const flwSecretKey = ngRow ? decryptField(ngRow.flutterwaveSecretKey) : "";
  const flwWebhookSecret = ngRow ? decryptField(ngRow.flutterwaveWebhookSecret) : "";
  const apRow = await getAlphaRow().catch(() => null);
  const apSecretKey = apRow ? decryptField(apRow.alphapaySecretKey) : "";
  const apWebhookSecret = apRow ? decryptField(apRow.alphapayWebhookSecret) : "";
  return {
    // Nov 2026: a stale "theteller" row reads as PayTeller.
    ghMomoGateway:
      row?.ghMomoGateway === "demo" ? "demo" : row?.ghMomoGateway === "alphapay" ? "alphapay" : "payteller",
    paytellerConfigured: Boolean(apiKey && merchantId && username && webhookSecret),
    paytellerApiKey: maskSecret(apiKey),
    paytellerMerchantId: maskSecret(merchantId),
    paytellerUsername: maskSecret(username),
    paytellerWebhookSecret: maskSecret(webhookSecret),
    ngGateway: ngRow?.ngGateway === "demo" ? "demo" : "flutterwave",
    flutterwaveConfigured: Boolean(flwPublicKey && flwSecretKey && flwWebhookSecret),
    flutterwavePublicKey: maskSecret(flwPublicKey),
    flutterwaveSecretKey: maskSecret(flwSecretKey),
    flutterwaveWebhookSecret: maskSecret(flwWebhookSecret),
    flutterwaveEnvironment: ngRow?.flutterwaveEnvironment || null,
    alphapayConfigured: Boolean(apSecretKey && apWebhookSecret),
    alphapaySecretKey: maskSecret(apSecretKey),
    alphapayWebhookSecret: maskSecret(apWebhookSecret),
    alphapayEnvironment: apRow?.alphapayEnvironment || null,
    updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
  };
}

export interface SaveGatewayInput {
  ghMomoGateway?: string;
  paytellerApiKey?: string;
  paytellerMerchantId?: string;
  paytellerUsername?: string;
  paytellerWebhookSecret?: string;
  ngGateway?: string;
  flutterwavePublicKey?: string;
  flutterwaveSecretKey?: string;
  flutterwaveWebhookSecret?: string;
  flutterwaveEnvironment?: string;
  alphapaySecretKey?: string;
  alphapayWebhookSecret?: string;
  alphapayEnvironment?: string;
}

/** Flutterwave secret keys start FLWSECK- (live) or FLWSECK_TEST- (test)
 *  — the BetWins v3 validation. A pasted public key (FLWPUBK-) is the
 *  common mistake; say so plainly instead of a bare "invalid". */
const FLW_SECRET_RE = /^FLWSECK(_TEST)?-/;
const FLW_PUBLIC_RE = /^FLWPUBK(_TEST)?-/;

/**
 * Owner save: the toggle + any of the fields. A blank field KEEPS the
 * current stored value (same convention as BetWins). A non-empty secret
 * field is encrypted before storage — and when GATEWAY_ENCRYPTION_KEY
 * is missing that save fails with a clear 503 instead of storing
 * plaintext. The toggle alone (no secret fields) never needs the key.
 * Nov 2026: Theteller is gone — saving ghMomoGateway "theteller" is
 * a 400, and Theteller fields are no longer written (the columns stay
 * dormant in the DB).
 */
export async function saveGatewaySettings(input: SaveGatewayInput): Promise<MaskedGatewaySettings> {
  const gateway = (input.ghMomoGateway ?? "").trim().toLowerCase();
  if (gateway === "theteller") {
    throw new GatewayError("Theteller direct MoMo prompt is removed — Ghana MoMo is PayTeller or Demo", 400);
  }
  if (gateway !== "" && gateway !== "demo" && gateway !== "payteller" && gateway !== "alphapay") {
    throw new GatewayError("Ghana deposit gateway must be demo, payteller or alphapay", 400);
  }
  const merchantId = (input.paytellerMerchantId ?? "").trim();
  if (merchantId && !MERCHANT_ID_RE.test(merchantId)) {
    throw new GatewayError("PayTeller Merchant ID must look like TTM-00984532.", 400);
  }
  // Nov 2026 Flutterwave v3 (Nigeria only): the NG toggle is two-way,
  // and a secret key must look like one (FLWSECK- / FLWSECK_TEST-) —
  // a pasted public key (FLWPUBK-) is the common mistake.
  const ngGateway = (input.ngGateway ?? "").trim().toLowerCase();
  if (ngGateway !== "" && ngGateway !== "demo" && ngGateway !== "flutterwave") {
    throw new GatewayError("Nigeria deposit gateway must be demo or flutterwave", 400);
  }
  if (input.flutterwaveSecretKey?.trim() && !FLW_SECRET_RE.test(input.flutterwaveSecretKey.trim())) {
    if (FLW_PUBLIC_RE.test(input.flutterwaveSecretKey.trim())) {
      throw new GatewayError(
        "That looks like a Flutterwave PUBLIC key (FLWPUBK-) — paste the SECRET key (FLWSECK-)",
        400,
      );
    }
    throw new GatewayError(
      "That does not look like a Flutterwave secret key — it starts FLWSECK- (live) or FLWSECK_TEST- (test)",
      400,
    );
  }
  if (input.flutterwavePublicKey?.trim() && !FLW_PUBLIC_RE.test(input.flutterwavePublicKey.trim())) {
    throw new GatewayError(
      "That does not look like a Flutterwave public key — it starts FLWPUBK- (live) or FLWPUBK_TEST- (test)",
      400,
    );
  }
  const flwEnv = (input.flutterwaveEnvironment ?? "").trim().toLowerCase();
  if (flwEnv !== "" && flwEnv !== "test" && flwEnv !== "live") {
    throw new GatewayError("Flutterwave environment must be test or live", 400);
  }
  // Nov 2026 AlphaPay (Ghana only): the secret key starts sk_live_
  // or sk_test_ — anything else is a paste mistake, said plainly.
  // The webhook signing secret has no documented shape (it is shown
  // once in the AlphaPay dashboard), so it is never shape-checked.
  const apSecretRe = /^sk_(live|test)_/;
  if (input.alphapaySecretKey?.trim() && !apSecretRe.test(input.alphapaySecretKey.trim())) {
    throw new GatewayError(
      "That does not look like an AlphaPay secret key — it starts sk_live_ (live) or sk_test_ (test)",
      400,
    );
  }
  const apEnv = (input.alphapayEnvironment ?? "").trim().toLowerCase();
  if (apEnv !== "" && apEnv !== "test" && apEnv !== "live") {
    throw new GatewayError("AlphaPay environment must be test or live", 400);
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
      data[column] = existing[column as keyof typeof existing] as string | null;
    } else {
      data[column] = null;
    }
  }
  // Nov 2026 Flutterwave v3: the NG columns are written ONLY when the
  // save mentions Nigeria at all (any Flutterwave field or the toggle).
  // A Ghana-only save never names them, so it can never P2022 on a DB
  // where rg-flutterwave.sql has not run yet. When they ARE mentioned,
  // a missing-column error is a 503 naming that file.
  const touchesNg =
    input.ngGateway !== undefined ||
    input.flutterwavePublicKey !== undefined ||
    input.flutterwaveSecretKey !== undefined ||
    input.flutterwaveWebhookSecret !== undefined ||
    input.flutterwaveEnvironment !== undefined;
  const ngData: Record<string, string | null> = {};
  if (touchesNg) {
    const ngExisting = await getNgRow().catch(() => null);
    const ngFields: Array<
      [keyof SaveGatewayInput, "flutterwavePublicKey" | "flutterwaveSecretKey" | "flutterwaveWebhookSecret"]
    > = [
      ["flutterwavePublicKey", "flutterwavePublicKey"],
      ["flutterwaveSecretKey", "flutterwaveSecretKey"],
      ["flutterwaveWebhookSecret", "flutterwaveWebhookSecret"],
    ];
    for (const [inputKey, column] of ngFields) {
      const value = (input[inputKey] ?? "").trim();
      if (value) {
        ngData[column] = encrypt(value);
      } else if (ngExisting) {
        ngData[column] = ngExisting[column as keyof typeof ngExisting] as string | null;
      } else {
        ngData[column] = null;
      }
    }
    if (flwEnv !== "") ngData.flutterwaveEnvironment = flwEnv;
    else if (ngExisting?.flutterwaveEnvironment) ngData.flutterwaveEnvironment = ngExisting.flutterwaveEnvironment;
    if (ngGateway !== "") ngData.ngGateway = ngGateway;
    else if (ngExisting?.ngGateway) ngData.ngGateway = ngExisting.ngGateway;
  }
  // Nov 2026 AlphaPay (Ghana only): the AlphaPay columns are written
  // ONLY when the save mentions AlphaPay at all (any AlphaPay field).
  // A Ghana PayTeller-only save never names them, so it can never
  // P2022 on a DB where rg-alphapay.sql has not run yet. Flipping
  // the toggle to alphapay does NOT touch them either — ghMomoGateway
  // is a base column, so the flip alone works on a column-less DB
  // (the create route then 503s naming the SQL). When they ARE
  // mentioned, a missing-column error is a 503 naming that file.
  const touchesAlphaPay =
    input.alphapaySecretKey !== undefined ||
    input.alphapayWebhookSecret !== undefined ||
    input.alphapayEnvironment !== undefined;
  const apData: Record<string, string | null> = {};
  if (touchesAlphaPay) {
    const apExisting = await getAlphaRow().catch(() => null);
    const apFields: Array<
      [keyof SaveGatewayInput, "alphapaySecretKey" | "alphapayWebhookSecret"]
    > = [
      ["alphapaySecretKey", "alphapaySecretKey"],
      ["alphapayWebhookSecret", "alphapayWebhookSecret"],
    ];
    for (const [inputKey, column] of apFields) {
      const value = (input[inputKey] ?? "").trim();
      if (value) {
        apData[column] = encrypt(value);
      } else if (apExisting) {
        apData[column] = apExisting[column as keyof typeof apExisting] as string | null;
      } else {
        apData[column] = null;
      }
    }
    if (apEnv !== "") apData.alphapayEnvironment = apEnv;
    else if (apExisting?.alphapayEnvironment) apData.alphapayEnvironment = apExisting.alphapayEnvironment;
  }
  let row: { id: string };
  try {
    // select {id} only: a full upsert RETURNING would name the new
    // Flutterwave columns and P2022 on a column-less DB (the
    // max-withdrawal lesson — upsert returns ALL columns by default).
    row = await prisma.gatewaySettings.upsert({
      where: { id: "global" },
      update: {
        ...data,
        ...(touchesNg ? ngData : {}),
        ...(touchesAlphaPay ? apData : {}),
        ...(gateway !== "" ? { ghMomoGateway: gateway } : {}),
      },
      create: {
        id: "global",
        paytellerApiKey: data.paytellerApiKey,
        paytellerMerchantId: data.paytellerMerchantId,
        paytellerUsername: data.paytellerUsername,
        paytellerWebhookSecret: data.paytellerWebhookSecret,
        ghMomoGateway: gateway === "demo" ? "demo" : gateway === "alphapay" ? "alphapay" : "payteller",
        ...(touchesNg
          ? {
              flutterwavePublicKey: ngData.flutterwavePublicKey ?? null,
              flutterwaveSecretKey: ngData.flutterwaveSecretKey ?? null,
              flutterwaveWebhookSecret: ngData.flutterwaveWebhookSecret ?? null,
              flutterwaveEnvironment: ngData.flutterwaveEnvironment ?? null,
              ngGateway: ngData.ngGateway ?? "flutterwave",
            }
          : {}),
        ...(touchesAlphaPay
          ? {
              alphapaySecretKey: apData.alphapaySecretKey ?? null,
              alphapayWebhookSecret: apData.alphapayWebhookSecret ?? null,
              alphapayEnvironment: apData.alphapayEnvironment ?? null,
            }
          : {}),
      },
      select: { id: true },
    });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "P2021" || code === "P2022") {
      if (touchesAlphaPay) {
        throw new GatewayError("AlphaPay settings are not set up yet — run rg-alphapay.sql in Neon first", 503);
      }
      if (touchesNg) {
        throw new GatewayError("Flutterwave settings are not set up yet — run rg-flutterwave.sql in Neon first", 503);
      }
      throw new GatewayError("Gateway settings are not set up yet — run rg-payment-blocks.sql in Neon first", 503);
    }
    throw err;
  }
  void row;
  return getMaskedGatewaySettings();
}

// Nov 2026: Theteller REMOVED (Chuks: PayTeller only) — but the push
// button (push-files) cannot delete files, so the old Theteller lib +
// routes still sit on GitHub main as dead code. These three stubs exist
// ONLY so those leftover files still compile; they always report "not
// configured", so no prompt can ever start from them. Delete the stubs
// together with the leftover files (src/lib/theteller*.ts and the
// theteller routes) once a git push removes them for real.
export interface ThetellerCredentials {
  apiUser: string;
  apiKey: string;
  merchantId: string;
}

export async function getThetellerCredentials(): Promise<ThetellerCredentials | null> {
  return null;
}

export async function getThetellerBaseUrl(): Promise<string> {
  return "";
}

export async function getThetellerCallbackSecret(): Promise<string> {
  return "";
}
