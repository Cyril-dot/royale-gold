// Phase 2 PayTeller (Nov 2026): the owner Gateway panel API.
// GET reads the masked settings (last-4 only, never the secrets) +
// the webhook URL to register in PayTeller Settings. POST saves the
// toggle + any of the 4 fields (blank keeps the current value) and
// audit-logs it. Saving keys fails with a clear 503 when
// GATEWAY_ENCRYPTION_KEY is not set — never plaintext.
// Nov 2026 Theteller (PaySwitch): the same shape for the Theteller
// fields (API user, API key, Merchant ID, callback secret, base URL)
// + the callback URL to register IF the account supports a
// notification URL (unverified — see src/lib/theteller.ts).
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import {
  GatewayError,
  getMaskedGatewaySettings,
  getPaytellerCredentials,
  getPaytellerWebhookSecret,
  getThetellerCredentials,
  saveGatewaySettings,
} from "@/lib/gateway-settings";

export const PAYTELLER_WEBHOOK_URL =
  "https://royale-omega.vercel.app/api/public/payteller-webhook";

/** Register this with PaySwitch IF the account supports a
 *  notification URL for direct process payments (unverified — the
 *  docs describe a redirect_url only for hosted checkout). The
 *  <secret> segment is the callback secret saved in this panel. */
export const THETELLER_CALLBACK_URL =
  "https://royale-omega.vercel.app/api/public/theteller-callback/<secret>";

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

/**
 * Theteller configured = the 3 API credentials resolve (DB or env).
 * The callback secret is NOT required to flip — the status poll is
 * the primary settlement path and the callback is only a trigger.
 */
async function thetellerConfigured(): Promise<boolean> {
  const creds = await getThetellerCredentials().catch(() => null);
  return Boolean(creds);
}

export async function GET() {
  try {
    await requireRole("owner");
    const settings = await getMaskedGatewaySettings();
    return ok({
      ...settings,
      paytellerConfigured: await paytellerConfigured(),
      thetellerConfigured: await thetellerConfigured(),
      webhookUrl: PAYTELLER_WEBHOOK_URL,
      thetellerCallbackUrl: THETELLER_CALLBACK_URL,
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
      thetellerApiUser?: string;
      thetellerApiKey?: string;
      thetellerMerchantId?: string;
      thetellerCallbackSecret?: string;
      thetellerBaseUrl?: string;
    }>(req);
    if (!body) return fail("Invalid JSON body");
    let settings;
    try {
      settings = await saveGatewaySettings(body);
    } catch (err) {
      if (err instanceof GatewayError) return fail(err.message, err.statusCode);
      // The Theteller columns do not exist yet (rg-theteller.sql not
      // run in Neon) — say so plainly instead of a bare 500.
      if ((err as { code?: string }).code === "P2021" || (err as { code?: string }).code === "P2022") {
        return fail("Theteller settings are not set up yet — run rg-theteller.sql in Neon first.", 503);
      }
      throw err;
    }
    await prisma.auditLog.create({
      data: {
        actorId: owner.id,
        action: "gateway.settings",
        detail: `Saved gateway settings (Ghana MoMo: ${settings.ghMomoGateway})`,
      },
    });
    return ok({
      ...settings,
      paytellerConfigured: await paytellerConfigured(),
      thetellerConfigured: await thetellerConfigured(),
      webhookUrl: PAYTELLER_WEBHOOK_URL,
      thetellerCallbackUrl: THETELLER_CALLBACK_URL,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
