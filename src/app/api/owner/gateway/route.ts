// Phase 2 PayTeller (Nov 2026): the owner Gateway panel API.
// GET reads the masked settings (last-4 only, never the secrets) +
// the webhook URL to register in PayTeller Settings. POST saves the
// toggle + any of the 4 fields (blank keeps the current value) and
// audit-logs it. Saving keys fails with a clear 503 when
// GATEWAY_ENCRYPTION_KEY is not set — never plaintext.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import {
  GatewayError,
  getMaskedGatewaySettings,
  getPaytellerCredentials,
  getPaytellerWebhookSecret,
  saveGatewaySettings,
} from "@/lib/gateway-settings";

export const PAYTELLER_WEBHOOK_URL =
  "https://royale-omega.vercel.app/api/public/payteller-webhook";

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

export async function GET() {
  try {
    await requireRole("owner");
    const settings = await getMaskedGatewaySettings();
    return ok({ ...settings, paytellerConfigured: await paytellerConfigured(), webhookUrl: PAYTELLER_WEBHOOK_URL });
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
    }>(req);
    if (!body) return fail("Invalid JSON body");
    let settings;
    try {
      settings = await saveGatewaySettings(body);
    } catch (err) {
      if (err instanceof GatewayError) return fail(err.message, err.statusCode);
      throw err;
    }
    await prisma.auditLog.create({
      data: {
        actorId: owner.id,
        action: "gateway.settings",
        detail: `Saved PayTeller gateway settings (Ghana MoMo: ${settings.ghMomoGateway})`,
      },
    });
    return ok({ ...settings, paytellerConfigured: await paytellerConfigured(), webhookUrl: PAYTELLER_WEBHOOK_URL });
  } catch (err) {
    return toErrorResponse(err);
  }
}
