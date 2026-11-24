// Nov 2026 AlphaPay (Ghana only, docs.alphapay.me): the ONE place
// an AlphaPay deposit can credit the wallet. Used by BOTH the
// webhook and the status poll — never credit from anywhere else.
// Mirrors src/lib/flutterwave-deposit.ts exactly, in GHS.
//
// Idempotency has two layers: (1) the payment row is claimed
// atomically (updateMany from pending/processing only — a second
// caller finds 0 rows claimed and returns without crediting); (2)
// everything runs in one transaction, so a failure anywhere rolls
// the claim back and the webhook retry / status poll can try again.
// The wallet is credited the FULL PRINCIPAL — the house absorbs
// AlphaPay's fee; the fee (debited − net on the verify response,
// or the client/gateway/platform fee breakdown) is recorded for
// reconciliation and is never the credit.
//
// The amount is checked against the verified AlphaPay response
// before any credit: a mismatched amount or currency never credits.
// NOTE: the verify response's `reference` is AlphaPay's own TXN-
// reference, NOT our RG- reference — it is never compared to the
// row. The row is found by our reference; the payment id was
// already matched by the caller (status route / webhook look the
// row up by alphapayPaymentId).
import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";
import { dec, round2 } from "./money";
import { getEffectiveRuleNow } from "./commission";
import { applyDepositPromotions } from "./promotions";
import { evaluateDepositRules } from "./risk-rules";
import { topUpAllowance } from "./win-logic";
import { isSuccessfulStatus, type VerifyData } from "./alphapay";

export interface CreditResult {
  newlyCredited: boolean;
  /** The payment row after the call (status + stored provider figures). */
  payment: {
    id: string;
    reference: string;
    status: string;
    amount: number;
  };
  depositEventId: string | null;
}

/**
 * Credit an AlphaPay payment once, from a VERIFIED AlphaPay response
 * (the GET /payments/{id}/verify result, never the webhook body
 * alone). `eventData` is the webhook event's data block when the
 * caller has it. Throws when the payment is unknown, the verified
 * amount/currency does not match the row, or the account is gone —
 * the caller turns that into a retryable (webhook) or visible
 * (status poll) failure. A payment already successful returns
 * newlyCredited:false without touching the wallet.
 */
export async function creditAlphaPayPayment(
  reference: string,
  verified: VerifyData,
  eventData?: Record<string, unknown> | null,
): Promise<CreditResult> {
  const ref = String(reference);
  const verifiedStatus = isSuccessfulStatus(verified.status ?? null);
  if (!verifiedStatus) {
    throw new Error(`AlphaPay payment ${ref} is not successful (status: ${verified.status ?? "unknown"})`);
  }
  // The verify response names the principal `requested_amount`
  // (the sandbox guide abbreviates it as `amount`); either is the
  // amount the customer was asked for.
  const verifiedAmount = round2(Number(verified.requested_amount ?? verified.amount));
  if (!Number.isFinite(verifiedAmount) || verifiedAmount <= 0) {
    throw new Error(`AlphaPay payment ${ref} has no usable verified amount`);
  }
  if (verified.currency && String(verified.currency).toUpperCase() !== "GHS") {
    throw new Error(`AlphaPay payment ${ref} is not GHS (currency: ${verified.currency})`);
  }
  // The fee AlphaPay took — debited − net on the verify response,
  // else the fee breakdown, else the webhook event data. A record,
  // never the credit.
  const debited = Number(verified.debited_amount ?? NaN);
  const net = Number(verified.net_amount ?? NaN);
  let alphapayFee: number | null = null;
  if (Number.isFinite(debited) && Number.isFinite(net) && debited > net) {
    alphapayFee = round2(debited - net);
  } else {
    const feeRaw =
      (verified.client_fee as number | string | undefined) ??
      (verified.gateway_fee as number | string | undefined) ??
      (verified.platform_fee as number | string | undefined) ??
      (eventData?.fee as number | string | undefined);
    if (feeRaw != null && Number.isFinite(Number(feeRaw))) {
      const sum = [
        Number(verified.client_fee ?? 0),
        Number(verified.gateway_fee ?? 0),
        Number(verified.platform_fee ?? 0),
      ].reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
      alphapayFee = round2(sum > 0 ? sum : Number(feeRaw));
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.alphaPayPayment.findUnique({ where: { reference: ref } });
    if (!payment) throw new Error(`AlphaPay payment ${ref} not found`);
    if (payment.status === "successful") {
      return { payment, depositEventId: null, newlyCredited: false, userId: payment.userId };
    }
    if (payment.status !== "pending" && payment.status !== "processing") {
      // failed — a terminal state never resurrects.
      return { payment, depositEventId: null, newlyCredited: false, userId: payment.userId };
    }
    // The row's amount is the principal the player asked for — the
    // verified amount must match it exactly, or nobody gets credited.
    if (round2(dec(payment.amount)) !== verifiedAmount) {
      throw new Error(
        `AlphaPay payment ${ref} amount mismatch (expected ${dec(payment.amount)}, verified ${verifiedAmount})`,
      );
    }
    // Atomic claim: only one caller can move this row out of
    // pending/processing. A concurrent webhook + poll race loses here
    // and returns newlyCredited:false below.
    const claimed = await tx.alphaPayPayment.updateMany({
      where: { id: payment.id, status: { in: ["pending", "processing"] } },
      data: {
        status: "successful",
        alphapayFee,
        providerPayload: verified as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    });
    if (claimed.count === 0) {
      const reread = await tx.alphaPayPayment.findUnique({ where: { reference: ref } });
      return { payment: reread ?? payment, depositEventId: null, newlyCredited: false, userId: payment.userId };
    }

    const fresh = await tx.user.findUnique({ where: { id: payment.userId } });
    if (!fresh || !fresh.active) throw new Error("Account not found or inactive");
    const amount = round2(dec(payment.amount));

    // Commission stamping — exactly like the PayTeller credit (P0
    // Batch 3 O4): a rule in force earns commission on activity, not on
    // the deposit (rate stamped, commission 0); no rule = legacy flat %
    // of the deposit, frozen forever.
    let adminId: string | null = null;
    let pctInForce = 0;
    let commission = 0;
    if (fresh.referredByAdminId) {
      const admin = await tx.user.findUnique({ where: { id: fresh.referredByAdminId } });
      if (admin && admin.active && admin.role === "admin") {
        adminId = admin.id;
        const rule = await getEffectiveRuleNow(admin.id);
        if (rule) {
          pctInForce = rule.rate;
          commission = 0;
        } else {
          pctInForce = dec(admin.commissionPct);
          commission = round2((amount * pctInForce) / 100);
        }
      }
    }

    const updated = await tx.user.update({
      where: { id: payment.userId },
      data: { cashBalance: round2(dec(fresh.cashBalance) + amount) },
    });
    void updated;
    const event = await tx.depositEvent.create({
      data: {
        userId: payment.userId,
        adminId,
        amount,
        method: "AlphaPay",
        fiatCurrency: "GHS",
        pctInForce: round2(pctInForce),
        commission: round2(commission),
        providerPayload: verified as Prisma.InputJsonValue,
      },
    });
    // Win logic (Nov 2026): this deposit's win allowance — deposit x
    // the rate in force right now (no-op when the rate is OFF).
    await topUpAllowance(tx, payment.userId, "GHS", amount);
    // P1 Batch 3 (O19): same promotion hook as the PayTeller credit —
    // a live deposit_match / first-deposit free-coins grant lands in
    // the same transaction as the deposit itself.
    await applyDepositPromotions(tx, payment.userId, fresh.name, amount, fresh.referredByAdminId);
    const done = await tx.alphaPayPayment.findUnique({ where: { reference: ref } });
    return { payment: done ?? payment, depositEventId: event.id, newlyCredited: true, userId: payment.userId };
  });

  // P2 Batch 2 (O31): deposit-time risk rules — best-effort, after the
  // deposit transaction, never fails the deposit. Only on a real credit.
  if (result.newlyCredited && result.userId) {
    try {
      await evaluateDepositRules(result.userId);
    } catch {
      /* best-effort only */
    }
  }

  return {
    newlyCredited: result.newlyCredited,
    payment: {
      id: result.payment.id,
      reference: result.payment.reference,
      status: result.payment.status,
      amount: dec(result.payment.amount),
    },
    depositEventId: result.depositEventId,
  };
}
