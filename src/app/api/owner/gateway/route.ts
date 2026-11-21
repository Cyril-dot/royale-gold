// Phase 2 PayTeller (Nov 2026): the owner Gateway panel API.
// GET reads the masked settings (last-4 only, never the secrets) +
// the webhook URL to register in PayTeller Settings. POST saves the
// toggle + any of the 4 fields (blank keeps the current value) and
// audit-logs it. Saving keys fails with a clear 503 when
// GATEWAY_ENCRYPTION_KEY is not set — never plaintext.
// Nov 2026: Theteller direct MoMo push REMOVED (Chuks: PayTeller
// only) — the toggle is Demo / PayTeller, and saving "theteller" is
// a 400 from saveGatewaySettings.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import {
  GatewayError,
  getFlutterwaveCredentials,
  getFlutterwaveWebhookSecret,
  getMaskedGatewaySettings,
  getPaytellerCredentials,
  getPaytellerWebhookSecret,
  saveGatewaySettings,
} from "@/lib/gateway-settings";

export const PAYTELLER_WEBHOOK_URL =
  "https://royale-omega.vercel.app/api/public/payteller-webhook";

// Nov 2026 Flutterwave v3 (Nigeria only): the webhook URL to register
// in the Flutterwave dashboard (Settings → Webhooks). The secret hash
// pasted there must match the one saved in the owner panel, or every
// webhook is rejected before anything is read.
export const FLUTTERWAVE_WEBHOOK_URL =
  "https://royale-omega.vercel.app/api/public/flutterwave-webhook";

/**
 * Configured means the 3 API credentials + the webhook secret resolve
 * from EITHER the panel (DB) or env vars — the flip guard in the panel
 * must not block an env-configured merchant.
 */
async function paytellerConfigured(): Promise<boolean> {
  const creds = await getPaytellerCredentials().catch(() => null);
  const secret = await getPaytellerWebhookSecret().catch(() => "");
  return Boolean(creds && secret);
}

/** Nov 2026 Flutterwave v3 (Nigeria only): same check for the NG side. */
async function flutterwaveConfigured(): Promise<boolean> {
  const creds = await getFlutterwaveCredentials().catch(() => null);
  const secret = await getFlutterwaveWebhookSecret().catch(() => "");
  return Boolean(creds && secret);
}

export async function GET() {
  try {
    await requireRole("owner");
    const settings = await getMaskedGatewaySettings();
    return ok({
      ...settings,
      paytellerConfigured: await paytellerConfigured(),
      webhookUrl: PAYTELLER_WEBHOOK_URL,
      flutterwaveConfigured: await flutterwaveConfigured(),
      flutterwaveWebhookUrl: FLUTTERWAVE_WEBHOOK_URL,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const owner = await requireRole("owner");
    const body = await readJson<{
      ghMomoGateway?: string;
      paytellerApiKey?: string;
      paytellerMerchantId?: string;
      paytellerUsername?: string;
      paytellerWebhookSecret?: string;
      // Nov 2026 Flutterwave v3 (Nigeria only): the NG fields ride the
      // same save — the owner panel sends them together with the Ghana
      // ones, and the audit row names both gateways when both changed.
      ngGateway?: string;
      flutterwavePublicKey?: string;
      flutterwaveSecretKey?: string;
      flutterwaveWebhookSecret?: string;
      flutterwaveEnvironment?: string;
    }>(req);
    if (!body) return fail("Invalid JSON body");
    let settings;
    try {
      settings = await saveGatewaySettings(body);
    } catch (err) {
      if (err instanceof GatewayError) return fail(err.message, err.statusCode);
      // The GatewaySettings table does not exist yet — say so plainly
      // instead of a bare 500.
      if ((err as { code?: string }).code === "P2021" || (err as { code?: string }).code === "P2022") {
        return fail("Gateway settings are not set up yet — run the gateway SQL in Neon first.", 503);
      }
      throw err;
    }
    await prisma.auditLog.create({
      data: {
        actorId: owner.id,
        action: "gateway.settings",
        detail: `Saved gateway settings (Ghana MoMo: ${settings.ghMomoGateway}; Nigeria: ${settings.ngGateway})`,
      },
    });
    return ok({
      ...settings,
      paytellerConfigured: await paytellerConfigured(),
      webhookUrl: PAYTELLER_WEBHOOK_URL,
      flutterwaveConfigured: await flutterwaveConfigured(),
      flutterwaveWebhookUrl: FLUTTERWAVE_WEBHOOK_URL,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
