// Nov 2026 AlphaPay (Ghana only, docs.alphapay.me): the status
// poll. GET /api/wallet/alphapay/status?reference=RG-... — auth +
// OWN payment only. Looks the payment up with AlphaPay (verify by
// payment id) and, when it is successful and not yet credited, runs
// the shared credit function — the same one the webhook uses. The
// client polls no faster than every 5 s.
//
// An AlphaPay-side failure (network, 502, 404) does NOT fail the
// poll: the local status is returned and the page keeps polling. The
// modal's waiting state is never proof — only a "successful" answer
// here moves the wallet.
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, toErrorResponse } from "@/lib/http";
import {
  AlphaPayError,
  isFailedStatus,
  isSuccessfulStatus,
  normalizeStatus,
  verifyPayment,
} from "@/lib/alphapay";
import { creditAlphaPayPayment } from "@/lib/alphapay-deposit";
// Payment blocks (Nov 2026): a payment the poll finds "failed" is a
// genuine failure. Never throws into the poll flow.
import {
  findActiveBlock,
  normalizePhone,
  recordDepositFailure,
} from "@/lib/payment-blocks";
import { getDepositPhone as getSavedDepositPhone } from "@/lib/deposit-number";

export async function GET(req: Request) {
  try {
    const user = await requireAuth();
    const params = new URL(req.url).searchParams;
    const reference = params.get("reference") ?? "";
    if (!reference) return fail("reference is required");
    let payment;
    try {
      payment = await prisma.alphaPayPayment.findUnique({ where: { reference } });
    } catch (err) {
      if ((err as { code?: string }).code === "P2021" || (err as { code?: string }).code === "P2022") {
        return fail("AlphaPay payments are not set up yet — run rg-alphapay.sql in Neon first", 503);
      }
      throw err;
    }
    if (!payment || payment.userId !== user.id) return fail("Payment not found", 404);
    if (payment.status === "successful") {
      return ok({ status: "successful", credited: true, amount: Number(payment.amount.toString()) });
    }
    if (payment.status === "failed") {
      return ok({ status: "failed", credited: false, amount: Number(payment.amount.toString()) });
    }

    // The AlphaPay payment UUID stored at create time is the only
    // lookup the verify endpoint takes — there is no
    // verify-by-reference on this API.
    if (!payment.alphapayPaymentId) {
      return ok({ status: payment.status, credited: false, amount: Number(payment.amount.toString()) });
    }
    let verified;
    try {
      verified = await verifyPayment(payment.alphapayPaymentId);
    } catch (err) {
      if (err instanceof AlphaPayError && err.statusCode === 404) {
        // No transaction at AlphaPay yet — the customer may not have
        // approved the prompt. Keep polling; the webhook may still
        // settle it.
        return ok({ status: payment.status, credited: false, amount: Number(payment.amount.toString()) });
      }
      // AlphaPay unreachable or another provider error — return the
      // local status and let the page keep polling.
      return ok({ status: payment.status, credited: false, amount: Number(payment.amount.toString()) });
    }
    const status = normalizeStatus(verified.status ?? null);
    if (isSuccessfulStatus(status)) {
      try {
        const result = await creditAlphaPayPayment(reference, verified);
        return ok({ status: "successful", credited: result.newlyCredited, amount: result.payment.amount });
      } catch (err) {
        return fail(err instanceof Error ? err.message : "Could not credit the payment", 503);
      }
    }
    if (isFailedStatus(status)) {
      await prisma.alphaPayPayment.update({
        where: { id: payment.id },
        data: { status: "failed" },
      });
      // Payment blocks (Nov 2026): "failed" counts — the customer
      // tried and it failed. The number is the saved deposit number
      // first, the login phone second.
      const owner = await prisma.user.findUnique({
        where: { id: payment.userId },
        select: { phone: true },
      });
      const phoneNumber = (await getSavedDepositPhone(payment.userId).catch(() => null)) ?? normalizePhone(owner?.phone ?? null);
      await recordDepositFailure({
        userId: payment.userId,
        phoneNumber,
        depositRef: payment.reference,
      });
      // If this failure just tripped the block, tell the modal so it
      // can swap in the blocked card instead of a red line.
      const block = await findActiveBlock({ userId: payment.userId, phoneNumber }).catch(() => null);
      return ok({
        status: "failed",
        credited: false,
        amount: Number(payment.amount.toString()),
        ...(block ? { blockedUntil: block.blockedUntil } : {}),
      });
    }
    // Still in flight — persist the provider's view of it (pending /
    // processing) so the row is not stale if the customer closes the page.
    if (status === "pending" || status === "processing") {
      if (payment.status !== status) {
        await prisma.alphaPayPayment.update({
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
