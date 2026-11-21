// Nov 2026 Flutterwave v3 (Nigeria only): the signed webhook receiver
// (docs: "Webhooks"). POST /api/public/flutterwave-webhook — no auth
// cookie; the verif-hash header IS the auth.
//
// Order: raw body → secret configured (else 503, so Flutterwave keeps
// retrying) → verif-hash plain compare (else 401) → parse (else 400)
// → transaction id present (else 400) → dedup (already seen → 200, no
// repeat) → charge.completed: find the payment by tx_ref, RE-VERIFY by
// GET, credit once via the shared function → charge.failed: mark
// failed.
//
// v3 does NOT sign the payload: Flutterwave echoes the secret hash you
// set in the dashboard, as-is, in the `verif-hash` header. A plain
// constant-time compare is the whole check — never an HMAC (that is
// the v4 `flutterwave-signature` header, a different scheme).
//
// Flutterwave webhooks carry no unique event id of their own, so the
// dedup key is synthetic: "<event>:<transaction id>" (e.g.
// "charge.completed:1234567"). The payload's `data` block holds the
// transaction (id, tx_ref, status, currency, amount).
//
// The raw body is read with await req.text() BEFORE any parse — the
// v3 check does not need the bytes (it compares the header), but
// reading the body once, up front, keeps the route honest and the
// order identical to PayTeller's.
//
// 2xx is returned ONLY after durable accept. A re-verify or credit
// failure returns 503 (no event row inserted) so Flutterwave retries;
// the return-page status poll is the other backstop.
import { prisma } from "@/lib/prisma";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { getFlutterwaveWebhookSecret } from "@/lib/gateway-settings";
import {
  FlutterwaveError,
  isSuccessfulStatus,
  verifyTransaction,
  verifyWebhookHash,
} from "@/lib/flutterwave";
import { creditFlutterwavePayment } from "@/lib/flutterwave-deposit";
// Payment blocks (Nov 2026): a payment the provider reports as
// failed is a genuine failure — recorded here so two in 24h trip
// the block. Never throws into the webhook flow.
import { normalizePhone, recordDepositFailure } from "@/lib/payment-blocks";

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const secret = await getFlutterwaveWebhookSecret();
    if (!secret) {
      // Unconfigured secret → 503: Flutterwave keeps retrying until the
      // owner pastes the webhook secret hash in the Gateway panel.
      return fail("Flutterwave webhook secret is not configured", 503);
    }
    const verifHash = req.headers.get("verif-hash");
    if (!verifyWebhookHash(verifHash, secret)) {
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
    const flwTransactionId = data.id != null ? String(data.id) : "";
    if (!flwTransactionId) return fail("Missing transaction id in webhook payload", 400);
    // Dedup: Flutterwave delivers at least once (retries 3 times, 30
    // min apart, when enabled). The event id is synthetic — there is
    // no provider event id on a v3 webhook.
    const eventId = `${eventType || "unknown"}:${flwTransactionId}`;

    let seen;
    try {
      seen = await prisma.flutterwaveWebhookEvent.findUnique({ where: { eventId } });
    } catch (err) {
      if ((err as { code?: string }).code === "P2021" || (err as { code?: string }).code === "P2022") {
        return fail("Flutterwave payments are not set up yet — run rg-flutterwave.sql in Neon first", 503);
      }
      throw err;
    }
    if (seen) return ok({ received: true, duplicate: true, eventId });

    const reference = String((data.tx_ref as string | undefined) ?? "");

    if (eventType === "charge.completed") {
      const payment = reference
        ? await prisma.flutterwavePayment.findUnique({ where: { reference } })
        : null;
      if (payment && payment.status !== "successful") {
        // Re-verify before crediting: the webhook is the signal, the
        // GET is the lock. A failure here returns 503 WITHOUT
        // inserting the event row, so Flutterwave retries.
        let verified;
        try {
          verified = await verifyTransaction(flwTransactionId);
        } catch (err) {
          if (err instanceof FlutterwaveError) return fail(err.message, err.statusCode >= 500 ? 503 : err.statusCode);
          return fail("Could not re-verify the Flutterwave payment", 503);
        }
        if (!isSuccessfulStatus(verified.status ?? null)) {
          return fail(`Flutterwave payment ${payment.reference} is not successful on re-verify`, 503);
        }
        try {
          await creditFlutterwavePayment(payment.reference, verified, data);
        } catch (err) {
          return fail(err instanceof Error ? err.message : "Could not credit the Flutterwave payment", 503);
        }
      }
    } else if (eventType === "charge.failed") {
      const payment = reference
        ? await prisma.flutterwavePayment.findUnique({ where: { reference } })
        : null;
      if (payment && (payment.status === "pending" || payment.status === "processing")) {
        await prisma.flutterwavePayment.update({
          where: { id: payment.id },
          data: { status: "failed", flwTransactionId },
        });
        // Payment blocks (Nov 2026): the provider says this payment
        // failed — a genuine failure. The number is the account phone:
        // Flutterwave never shares the number typed on its checkout.
        const owner = await prisma.user.findUnique({
          where: { id: payment.userId },
          select: { phone: true },
        });
        await recordDepositFailure({
          userId: payment.userId,
          phoneNumber: normalizePhone(owner?.phone ?? null),
          depositRef: payment.reference,
        });
      }
    }
    // Durable accept: record the event AFTER processing, so a failure
    // above leaves no row and the delivery retries. A concurrent twin
    // delivery loses the unique constraint here and is a duplicate.
    try {
      await prisma.flutterwaveWebhookEvent.create({
        data: {
          eventId,
          paymentId: flwTransactionId,
          eventType: eventType || "unknown",
        },
      });
    } catch (err) {
      if ((err as { code?: string }).code === "P2021" || (err as { code?: string }).code === "P2022") {
        return fail("Flutterwave payments are not set up yet — run rg-flutterwave.sql in Neon first", 503);
      }
      return ok({ received: true, duplicate: true, eventId });
    }
    return ok({ received: true, eventId, type: eventType || "unknown" });
  } catch (err) {
    return toErrorResponse(err);
  }
}
