// Phase 2 PayTeller (Nov 2026): the return-page poll. GET
// /api/wallet/payteller/status?reference=RG-... — auth + OWN payment
// only. Looks the payment up with PayTeller and, when it is successful
// and not yet credited, runs the shared credit function — the same one
// the webhook uses. The client polls no faster than every 10 s.
//
// A PayTeller-side failure (network, 502, 404) does NOT fail the poll:
// the local status is returned and the page keeps polling. The return
// is never proof — only a "successful" answer here moves the wallet.
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { getPaymentByReference, isSuccessfulStatus, normalizeStatus } from "@/lib/payteller";
import { creditPaytellerPayment } from "@/lib/payteller-deposit";
// Payment blocks (Nov 2026): a payment the poll finds "failed" is a
// genuine failure. An "expired" checkout is NOT — the customer never
// paid. Never throws into the poll flow.
import { recordDepositFailure } from "@/lib/payment-blocks";
// Deposit MoMo number (Nov 2026): the failure keys on the saved
// deposit number first, the login phone second.
import { resolveDepositNumber } from "@/lib/deposit-number";

export async function GET(req: Request) {
  try {
    const user = await requireAuth();
    const reference = new URL(req.url).searchParams.get("reference") ?? "";
    if (!reference) return fail("reference is required");
    const payment = await prisma.paytellerPayment.findUnique({ where: { reference } });
    if (!payment || payment.userId !== user.id) return fail("Payment not found", 404);
    if (payment.status === "successful") {
      return ok({ status: "successful", credited: true, amount: Number(payment.amount.toString()) });
    }
    if (payment.status === "failed" || payment.status === "expired") {
      return ok({ status: payment.status, credited: false, amount: Number(payment.amount.toString()) });
    }

    let verified;
    try {
      verified = await getPaymentByReference(reference);
    } catch {
      // PayTeller unreachable or the payment unknown there — return the
      // local status and let the page keep polling; the webhook may
      // still settle it.
      return ok({ status: payment.status, credited: false, amount: Number(payment.amount.toString()) });
    }
    const status = normalizeStatus(verified.status ?? null);
    if (isSuccessfulStatus(status)) {
      try {
        const result = await creditPaytellerPayment(reference, verified);
        return ok({ status: "successful", credited: result.newlyCredited, amount: result.payment.amount });
      } catch (err) {
        return fail(err instanceof Error ? err.message : "Could not credit the payment", 503);
      }
    }
    if (status === "failed" || status === "expired") {
      await prisma.paytellerPayment.update({
        where: { id: payment.id },
        data: { status },
      });
      // Payment blocks (Nov 2026): "failed" counts, "expired" does
      // not — an expired checkout means the customer never paid.
      if (status === "failed") {
        const owner = await prisma.user.findUnique({
          where: { id: payment.userId },
          select: { phone: true },
        });
        // Deposit MoMo number (Nov 2026): the failure keys on the saved
        // deposit number first, the login phone second.
        const depositNumber = await resolveDepositNumber(payment.userId, owner?.phone ?? null);
        await recordDepositFailure({
          userId: payment.userId,
          phoneNumber: depositNumber,
          depositRef: payment.reference,
        });
      }
      return ok({ status, credited: false, amount: Number(payment.amount.toString()) });
    }
    // Still in flight — persist the provider's view of it (pending /
    // processing) so the row is not stale if the customer closes the page.
    if (status === "pending" || status === "processing") {
      if (payment.status !== status) {
        await prisma.paytellerPayment.update({
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
