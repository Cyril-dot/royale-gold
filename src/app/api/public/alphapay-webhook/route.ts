// Nov 2026 AlphaPay (Ghana only, docs.alphapay.me): the signed
// webhook receiver. POST /api/public/alphapay-webhook — no auth
// cookie; the HMAC signature IS the auth.
//
// Order: raw body → signing secret configured (else 503, so
// AlphaPay keeps retrying) → timestamp age ≤ 300 s (else 401) →
// HMAC constant-time compare (else 401) → parse (else 400) →
// payment id present (else 400) → dedup (already seen → 200, no
// repeat) → transaction.success: find the payment by the AlphaPay
// payment id, RE-VERIFY by GET, credit once via the shared function
// → transaction.failed: mark failed.
//
// The signed string is "{timestamp}.{rawBody}" (timestamp, a dot,
// the exact raw JSON body) — HMAC-SHA256 keyed with the webhook
// SIGNING secret (separate from the API secret key). The timestamp
// is inside the signature, so it cannot be refreshed by an attacker.
// AlphaPay webhooks carry no unique event id of their own, so the
// dedup key is synthetic: "<event>:<payment id>" (e.g.
// "transaction.success:a8a8c2cf-..."). The payload's `data` block
// holds the transaction (id, reference, status, currency, amount,
// net_amount, charged).
//
// 2xx is returned ONLY after durable accept. A re-verify or credit
// failure returns 503 (no event row inserted) so AlphaPay retries;
// the status poll is the other backstop.
import { prisma } from "@/lib/prisma";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { getAlphapayWebhookSecret } from "@/lib/gateway-settings";
import {
  AlphaPayError,
  isFailedStatus,
  isSuccessfulStatus,
  verifyPayment,
  verifyWebhookSignature,
} from "@/lib/alphapay";
import { creditAlphaPayPayment } from "@/lib/alphapay-deposit";
// Payment blocks (Nov 2026): a payment the provider reports as
// failed is a genuine failure — recorded here so two in 24h trip
// the block. Never throws into the webhook flow.
import { normalizePhone, recordDepositFailure } from "@/lib/payment-blocks";
import { getDepositPhone as getSavedDepositPhone } from "@/lib/deposit-number";

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const secret = await getAlphapayWebhookSecret();
    if (!secret) {
      // Unconfigured secret → 503: AlphaPay keeps retrying until the
      // owner pastes the webhook signing secret in the Gateway panel.
      return fail("AlphaPay webhook signing secret is not configured", 503);
    }
    const signature = req.headers.get("x-webhook-signature");
    const timestamp = req.headers.get("x-webhook-timestamp");
    if (!verifyWebhookSignature(rawBody, timestamp, signature, secret)) {
      return fail("Invalid webhook signature", 401);
    }
    let event: { event?: string; data?: Record<string, unknown> };
    try {
      event = JSON.parse(rawBody) as { event?: string; data?: Record<string, unknown> };
    } catch {
      return fail("Invalid webhook payload", 400);
    }
    const eventType = String(event.event || "");
    const data = event.data || {};
    const alphapayPaymentId = data.id != null ? String(data.id) : "";
    if (!alphapayPaymentId) return fail("Missing payment id in webhook payload", 400);
    // Dedup: AlphaPay retries a failed delivery 5 times (immediate,
    // +30s, +5min, +30min, +2h). The event id is synthetic — there is
    // no provider event id on an AlphaPay webhook.
    const eventId = `${eventType || "unknown"}:${alphapayPaymentId}`;

    let seen;
    try {
      seen = await prisma.alphaPayWebhookEvent.findUnique({ where: { eventId } });
    } catch (err) {
      if ((err as { code?: string }).code === "P2021" || (err as { code?: string }).code === "P2022") {
        return fail("AlphaPay payments are not set up yet — run rg-alphapay.sql in Neon first", 503);
      }
      throw err;
    }
    if (seen) return ok({ received: true, duplicate: true, eventId });

    if (eventType === "transaction.success") {
      const payment = await prisma.alphaPayPayment.findUnique({
        where: { alphapayPaymentId },
      });
      if (payment && payment.status !== "successful") {
        // Re-verify before crediting: the webhook is the signal, the
        // GET is the lock. A failure here returns 503 WITHOUT
        // inserting the event row, so AlphaPay retries.
        let verified;
        try {
          verified = await verifyPayment(alphapayPaymentId);
        } catch (err) {
          if (err instanceof AlphaPayError) return fail(err.message, err.statusCode >= 500 ? 503 : err.statusCode);
          return fail("Could not re-verify the AlphaPay payment", 503);
        }
        if (!isSuccessfulStatus(verified.status ?? null)) {
          return fail(`AlphaPay payment ${payment.reference} is not successful on re-verify`, 503);
        }
        try {
          await creditAlphaPayPayment(payment.reference, verified, data);
        } catch (err) {
          return fail(err instanceof Error ? err.message : "Could not credit the AlphaPay payment", 503);
        }
      }
    } else if (eventType === "transaction.failed") {
      const payment = await prisma.alphaPayPayment.findUnique({
        where: { alphapayPaymentId },
      });
      if (payment && (payment.status === "pending" || payment.status === "processing")) {
        await prisma.alphaPayPayment.update({
          where: { id: payment.id },
          data: { status: "failed" },
        });
        // Payment blocks (Nov 2026): the provider says this payment
        // failed — a genuine failure. The number is the saved deposit
        // number first, the login phone second: AlphaPay never shares
        // the number typed on its hosted page (checkout_url branch),
        // so the number side of the block keys on the account's
        // number, same honest limit as PayTeller.
        const owner = await prisma.user.findUnique({
          where: { id: payment.userId },
          select: { phone: true },
        });
        const phoneNumber =
          (await getSavedDepositPhone(payment.userId).catch(() => null)) ??
          normalizePhone(owner?.phone ?? null);
        await recordDepositFailure({
          userId: payment.userId,
          phoneNumber,
          depositRef: payment.reference,
        });
      }
    }
    // Durable accept: record the event AFTER processing, so a failure
    // above leaves no row and the delivery retries. A concurrent twin
    // delivery loses the unique constraint here and is a duplicate.
    try {
      await prisma.alphaPayWebhookEvent.create({
        data: {
          eventId,
          paymentId: alphapayPaymentId,
          eventType: eventType || "unknown",
        },
      });
    } catch (err) {
      if ((err as { code?: string }).code === "P2021" || (err as { code?: string }).code === "P2022") {
        return fail("AlphaPay payments are not set up yet — run rg-alphapay.sql in Neon first", 503);
      }
      return ok({ received: true, duplicate: true, eventId });
    }
    return ok({ received: true, eventId, type: eventType || "unknown" });
  } catch (err) {
    return toErrorResponse(err);
  }
}
