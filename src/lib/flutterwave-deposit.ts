// Nov 2026 Flutterwave v3 (Nigeria only): the ONE place a Flutterwave
// deposit can credit the wallet. Used by BOTH the webhook and the
// return-page status poll — never credit from anywhere else. Mirrors
// src/lib/payteller-deposit.ts exactly, in NGN.
//
// Idempotency has two layers: (1) the payment row is claimed atomically
// (updateMany from pending/processing only — a second caller finds 0
// rows claimed and returns without crediting); (2) everything runs in
// one transaction, so a failure anywhere rolls the claim back and the
// webhook retry / status poll can try again. The wallet is credited the
// FULL PRINCIPAL — the house absorbs Flutterwave's ~2% local-Nigeria
// fee; the fee (app_fee / merchant_fee on the verify response) is
// recorded for reconciliation and is never the credit.
//
// The amount is checked against the verified Flutterwave response
// before any credit: a mismatched amount, currency or tx_ref never
// credits.
import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";
import { dec, round2 } from "./money";
import { getEffectiveRuleNow } from "./commission";
import { applyDepositPromotions } from "./promotions";
import { evaluateDepositRules } from "./risk-rules";
import { topUpAllowance } from "./win-logic";
import { isSuccessfulStatus, type VerifyData } from "./flutterwave";

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
 * Credit a Flutterwave payment once, from a VERIFIED Flutterwave
 * response (the GET /transactions/{id}/verify result, never the
 * webhook body alone). `eventData` is the webhook event's data block
 * when the caller has it. Throws when the payment is unknown, the
 * verified amount/currency/tx_ref does not match the row, or the
 * account is gone — the caller turns that into a retryable (webhook)
 * or visible (status poll) failure. A payment already successful
 * returns newlyCredited:false without touching the wallet.
 */
export async function creditFlutterwavePayment(
  reference: string,
  verified: VerifyData,
  eventData?: Record<string, unknown> | null,
): Promise<CreditResult> {
  const ref = String(reference);
  const verifiedStatus = isSuccessfulStatus(verified.status ?? null);
  if (!verifiedStatus) {
    throw new Error(`Flutterwave payment ${ref} is not successful (status: ${verified.status ?? "unknown"})`);
  }
  const verifiedAmount = round2(Number(verified.amount));
  if (!Number.isFinite(verifiedAmount) || verifiedAmount <= 0) {
    throw new Error(`Flutterwave payment ${ref} has no usable verified amount`);
  }
  if (verified.currency && String(verified.currency).toUpperCase() !== "NGN") {
    throw new Error(`Flutterwave payment ${ref} is not NGN (currency: ${verified.currency})`);
  }
  if (verified.tx_ref && String(verified.tx_ref) !== ref) {
    throw new Error(`Flutterwave payment reference mismatch (expected ${ref})`);
  }
  // The fee Flutterwave took — app_fee / merchant_fee on the verify
  // response, or the webhook event data. A record, never the credit.
  const feeRaw =
    (verified.app_fee as number | string | undefined) ??
    (verified.merchant_fee as number | string | undefined) ??
    (eventData?.app_fee as number | string | undefined) ??
    (eventData?.merchant_fee as number | string | undefined);
  const flutterwaveFee = feeRaw != null && Number.isFinite(Number(feeRaw)) ? round2(Number(feeRaw)) : null;

  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.flutterwavePayment.findUnique({ where: { reference: ref } });
    if (!payment) throw new Error(`Flutterwave payment ${ref} not found`);
    if (payment.status === "successful") {
      return { payment, depositEventId: null, newlyCredited: false, userId: payment.userId };
    }
    if (payment.status !== "pending" && payment.status !== "processing") {
      // failed / expired — a terminal state never resurrects.
      return { payment, depositEventId: null, newlyCredited: false, userId: payment.userId };
    }
    // The row's amount is the principal the player asked for — the
    // verified amount must match it exactly, or nobody gets credited.
    if (round2(dec(payment.amount)) !== verifiedAmount) {
      throw new Error(
        `Flutterwave payment ${ref} amount mismatch (expected ${dec(payment.amount)}, verified ${verifiedAmount})`,
      );
    }
    // Atomic claim: only one caller can move this row out of
    // pending/processing. A concurrent webhook + poll race loses here
    // and returns newlyCredited:false below.
    const claimed = await tx.flutterwavePayment.updateMany({
      where: { id: payment.id, status: { in: ["pending", "processing"] } },
      data: {
        status: "successful",
        flwTransactionId:
          verified.id != null ? String(verified.id) : payment.flwTransactionId,
        flutterwaveFee,
        providerPayload: verified as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    });
    if (claimed.count === 0) {
      const reread = await tx.flutterwavePayment.findUnique({ where: { reference: ref } });
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
        method: "Flutterwave",
        fiatCurrency: "NGN",
        pctInForce: round2(pctInForce),
        commission: round2(commission),
        providerPayload: verified as Prisma.InputJsonValue,
      },
    });
    // Win logic (Nov 2026): this deposit's win allowance — deposit x
    // the rate in force right now (no-op when the rate is OFF).
    await topUpAllowance(tx, payment.userId, "NGN", amount);
    // P1 Batch 3 (O19): same promotion hook as the PayTeller credit —
    // a live deposit_match / first-deposit free-coins grant lands in
    // the same transaction as the deposit itself.
    await applyDepositPromotions(tx, payment.userId, fresh.name, amount, fresh.referredByAdminId);
    const done = await tx.flutterwavePayment.findUnique({ where: { reference: ref } });
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
