// Nov 2026 Flutterwave v3 (Nigeria only): the return-page poll. GET
// /api/wallet/flutterwave/status?reference=RG-... — auth + OWN payment
// only. Looks the payment up with Flutterwave and, when it is
// successful and not yet credited, runs the shared credit function —
// the same one the webhook uses. The client polls no faster than every
// 10 s.
//
// Flutterwave's redirect appends `transaction_id` (and `status` and
// `tx_ref`) to the return URL — the poll verifies by that transaction
// id when it has one, and falls back to verify_by_reference when it
// does not (the customer may have closed the page before the redirect
// happened, or the redirect may have lost its query string).
//
// A Flutterwave-side failure (network, 502, 404) does NOT fail the
// poll: the local status is returned and the page keeps polling. The
// return is never proof — only a "successful" answer here moves the
// wallet.
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, toErrorResponse } from "@/lib/http";
import {
  FlutterwaveError,
  isSuccessfulStatus,
  normalizeStatus,
  verifyByReference,
  verifyTransaction,
  type VerifyData,
} from "@/lib/flutterwave";
import { creditFlutterwavePayment } from "@/lib/flutterwave-deposit";
// Payment blocks (Nov 2026): a payment the poll finds "failed" is a
// genuine failure. An "expired" checkout is NOT — the customer never
// paid. Never throws into the poll flow.
import { normalizePhone, recordDepositFailure } from "@/lib/payment-blocks";

export async function GET(req: Request) {
  try {
    const user = await requireAuth();
    const params = new URL(req.url).searchParams;
    const reference = params.get("reference") ?? "";
    if (!reference) return fail("reference is required");
    let payment;
    try {
      payment = await prisma.flutterwavePayment.findUnique({ where: { reference } });
    } catch (err) {
      if ((err as { code?: string }).code === "P2021" || (err as { code?: string }).code === "P2022") {
        return fail("Flutterwave payments are not set up yet — run rg-flutterwave.sql in Neon first", 503);
      }
      throw err;
    }
    if (!payment || payment.userId !== user.id) return fail("Payment not found", 404);
    if (payment.status === "successful") {
      return ok({ status: "successful", credited: true, amount: Number(payment.amount.toString()) });
    }
    if (payment.status === "failed" || payment.status === "expired") {
      return ok({ status: payment.status, credited: false, amount: Number(payment.amount.toString()) });
    }

    // The transaction id the redirect carried (or the one we already
    // stored) is the first lookup. verify_by_reference is the fallback
    // when neither is known — and returns null when Flutterwave has no
    // transaction for this reference yet.
    const transactionId = params.get("transaction_id") ?? payment.flwTransactionId ?? null;
    let verified: VerifyData | null = null;
    try {
      if (transactionId) {
        verified = await verifyTransaction(transactionId);
      } else {
        verified = await verifyByReference(reference);
      }
    } catch (err) {
      if (err instanceof FlutterwaveError && err.statusCode === 404) {
        // No transaction at Flutterwave yet — the customer may not have
        // paid. Keep polling; the webhook may still settle it.
        return ok({ status: payment.status, credited: false, amount: Number(payment.amount.toString()) });
      }
      // Flutterwave unreachable or another provider error — return the
      // local status and let the page keep polling.
      return ok({ status: payment.status, credited: false, amount: Number(payment.amount.toString()) });
    }
    if (!verified || !verified.id) {
      return ok({ status: payment.status, credited: false, amount: Number(payment.amount.toString()) });
    }
    // Remember the transaction id once we know it — the next poll and
    // the webhook both use it.
    if (transactionId && !payment.flwTransactionId) {
      await prisma.flutterwavePayment.update({
        where: { id: payment.id },
        data: { flwTransactionId: String(transactionId) },
      });
    }
    const status = normalizeStatus(verified.status ?? null);
    if (isSuccessfulStatus(status)) {
      try {
        const result = await creditFlutterwavePayment(reference, verified);
        return ok({ status: "successful", credited: result.newlyCredited, amount: result.payment.amount });
      } catch (err) {
        return fail(err instanceof Error ? err.message : "Could not credit the payment", 503);
      }
    }
    if (status === "failed" || status === "cancelled") {
      await prisma.flutterwavePayment.update({
        where: { id: payment.id },
        data: { status: "failed" },
      });
      // Payment blocks (Nov 2026): "failed" counts — the customer
      // tried and it failed. (Flutterwave has no "expired" on a verify
      // response; an abandoned checkout simply stays pending.)
      const owner = await prisma.user.findUnique({
        where: { id: payment.userId },
        select: { phone: true },
      });
      await recordDepositFailure({
        userId: payment.userId,
        phoneNumber: normalizePhone(owner?.phone ?? null),
        depositRef: payment.reference,
      });
      return ok({ status: "failed", credited: false, amount: Number(payment.amount.toString()) });
    }
    // Still in flight — persist the provider's view of it (pending /
    // processing) so the row is not stale if the customer closes the page.
    if (status === "pending" || status === "processing") {
      if (payment.status !== status) {
        await prisma.flutterwavePayment.update({
          where: { id: payment.id },
          data: { status },
        });
      }
      return ok({ status, credited: false, amount: Number(payment.amount.toString()) });
    }
    return ok({ status: payment.status, credited: false, amount: Number(payment.amount.toString()) });
  } catch (err) {
    return toErrorResponse(err);
  }
}
