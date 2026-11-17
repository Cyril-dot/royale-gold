// Phase 2 PayTeller (Nov 2026): the signed webhook receiver (docs §04).
// POST /api/public/payteller-webhook — no auth cookie; the HMAC signature
// IS the auth.
//
// Order (BetWins handlePayTellerWebhook, ported): raw body → secret
// configured (else 503, so PayTeller keeps retrying) → signature +
// timestamp (else 401) → parse (else 400) → event id present (else
// 400) → dedup (already seen → 200, no repeat) → payment.successful:
// find the payment by merchant_reference, RE-VERIFY by GET, credit once
// via the shared function → payment.failed: mark failed.
//
// The raw body is read with await req.text() BEFORE any parse — never
// req.json() first, or the signature check sees reserialized bytes and
// fails. No body-parsing middleware sits in front of this route.
//
// 2xx is returned ONLY after durable accept. A re-verify or credit
// failure returns 503 (no event row inserted) so PayTeller retries;
// the return-page status poll is the other backstop.
import { prisma } from "@/lib/prisma";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { getPaytellerWebhookSecret } from "@/lib/gateway-settings";
import {
  getPaymentByReference,
  isSuccessfulStatus,
  verifySignature,
  PaytellerError,
} from "@/lib/payteller";
import { creditPaytellerPayment } from "@/lib/payteller-deposit";

export async function POST(req: Request) {
  try {
    // The raw bytes are the signature input — read them first.
    const rawBody = await req.text();
    const secret = await getPaytellerWebhookSecret();
    if (!secret) {
      // Unconfigured secret → 503: PayTeller keeps retrying until the
      // owner pastes the webhook secret in the Gateway panel.
      return fail("PayTeller webhook secret is not configured", 503);
    }
    const signature = req.headers.get("x-payteller-signature");
    if (!verifySignature(rawBody, signature, secret)) {
      return fail("Invalid webhook signature", 401);
    }
    let event: { id?: string; type?: string; data?: Record<string, unknown> };
    try {
      event = JSON.parse(rawBody) as { id?: string; type?: string; data?: Record<string, unknown> };
    } catch {
      return fail("Invalid webhook payload", 400);
    }
    const eventId = String(event.id || "");
    if (!eventId) return fail("Missing webhook event id", 400);

    // Dedup: PayTeller delivers at least once (8 attempts). A seen event
    // id is acknowledged without repeating fulfillment.
    const seen = await prisma.paytellerWebhookEvent.findUnique({ where: { eventId } });
    if (seen) return ok({ received: true, duplicate: true, eventId });

    const data = event.data || {};
    const reference = String(
      (data.merchant_reference as string | undefined) ??
        (data.reference as string | undefined) ??
        "",
    );

    if (event.type === "payment.successful") {
      const payment = reference
        ? await prisma.paytellerPayment.findUnique({ where: { reference } })
        : null;
      if (payment && payment.status !== "successful") {
        // Re-verify before crediting: the webhook is the signal, the
        // GET is the lock (docs §03/§04). A failure here returns 503
        // WITHOUT inserting the event row, so PayTeller retries.
        let verified;
        try {
          verified = await getPaymentByReference(payment.reference);
        } catch (err) {
          if (err instanceof PaytellerError) return fail(err.message, err.statusCode >= 500 ? 503 : err.statusCode);
          return fail("Could not re-verify the PayTeller payment", 503);
        }
        if (!isSuccessfulStatus(verified.status ?? null)) {
          return fail(`PayTeller payment ${payment.reference} is not successful on re-verify`, 503);
        }
        try {
          await creditPaytellerPayment(payment.reference, verified, data);
        } catch (err) {
          return fail(err instanceof Error ? err.message : "Could not credit the PayTeller payment", 503);
        }
      }
    } else if (event.type === "payment.failed") {
      const payment = reference
        ? await prisma.paytellerPayment.findUnique({ where: { reference } })
        : null;
      if (payment && (payment.status === "pending" || payment.status === "processing")) {
        await prisma.paytellerPayment.update({
          where: { id: payment.id },
          data: { status: "failed" },
        });
      }
    }
    // Durable accept: record the event AFTER processing, so a failure
    // above leaves no row and the delivery retries. A concurrent twin
    // delivery loses the unique constraint here and is a duplicate.
    try {
      await prisma.paytellerWebhookEvent.create({
        data: {
          eventId,
          paymentId: typeof data.id === "string" ? data.id : null,
          eventType: event.type ?? "unknown",
        },
      });
    } catch {
      return ok({ received: true, duplicate: true, eventId });
    }
    return ok({ received: true, eventId, type: event.type ?? "unknown" });
  } catch (err) {
    return toErrorResponse(err);
  }
}
