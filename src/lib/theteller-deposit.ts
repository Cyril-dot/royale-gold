// Nov 2026 Theteller (PaySwitch) direct MoMo push: the ONE place a
// Theteller deposit can credit the wallet. Used by the initiate
// worker (after), the status poll AND the callback — never credit from
// anywhere else, never from a browser claim, a callback alone, or a
// poll result alone.
//
// Idempotency has two layers, exactly like PayTeller
// (src/lib/payteller-deposit.ts): (1) the payment row is claimed
// atomically (updateMany from pending only — a second caller finds 0
// rows claimed and returns without crediting); (2) everything runs in
// one transaction, so a failure anywhere rolls the claim back and the
// next poll / callback can try again. The wallet is credited the FULL
// PRINCIPAL — the house absorbs Theteller's merchant-side charge;
// the provider's figures are recorded for reconciliation and are
// never the credit.
//
// Fulfilment happens ONLY on the PENDING -> SUCCESS transition:
// settleThetellerPayment() is the single transition function — the
// poll, the callback and the initiate worker all go through it, so a
// callback plus poll plus worker cannot double-fulfil.
//
// The amount is checked against the verified Theteller response
// before any credit: a mismatched amount never credits. The verified
// amount arrives as a 12-digit pesewas string on process responses;
// the status endpoint's sample shows a bare number instead, so both
// readings are accepted (pesewas, or GHS) — the CREDIT always uses
// the row's own principal, never the verified figure.
import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";
import { dec, round2 } from "./money";
import { getEffectiveRuleNow } from "./commission";
import { applyDepositPromotions } from "./promotions";
import { evaluateDepositRules } from "./risk-rules";
import { topUpAllowance } from "./win-logic";
import { mapStatus, type ThetellerResponse } from "./theteller";
import { recordDepositFailure } from "./payment-blocks";
import { resolveDepositNumber } from "./deposit-number";

export interface ThetellerCreditResult {
  newlyCredited: boolean;
  payment: {
    id: string;
    transactionId: string;
    status: string;
    amount: number;
  };
  depositEventId: string | null;
}

/** The verified amount in pesewas, or null when it cannot be read. */
function verifiedPesewas(verified: ThetellerResponse): number | null {
  const raw = verified.amount;
  if (typeof raw === "string") {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return null;
    // A 12-digit zero-padded string is pesewas; a short string is
    // ambiguous — treat it as pesewas when it matches, GHS otherwise
    // (the caller checks both).
    return Number(digits);
  }
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.round(raw);
  return null;
}

function verifiedMatchesRow(verified: ThetellerResponse, amountPesewas: number, amountGhs: number): boolean {
  const v = verifiedPesewas(verified);
  if (v === null) return false;
  if (v === amountPesewas) return true;
  // The status endpoint's sample shows a bare number — if it is GHS,
  // it matches the principal instead.
  if (round2(v) === round2(amountGhs)) return true;
  return false;
}

/**
 * Credit a Theteller payment once, from a VERIFIED Theteller response
 * (the process response or a status check — never a callback body
 * alone). Throws when the payment is unknown, not successful, or the
 * verified amount does not match the row. A payment already
 * successful returns newlyCredited:false without touching the wallet.
 */
export async function creditThetellerPayment(
  transactionId: string,
  verified: ThetellerResponse,
): Promise<ThetellerCreditResult> {
  const tid = String(transactionId);
  if (mapStatus(verified) !== "SUCCESS") {
    throw new Error(`Theteller payment ${tid} is not successful (code: ${String(verified.code ?? "unknown")})`);
  }
  if (verified.transaction_id && String(verified.transaction_id) !== tid) {
    throw new Error(`Theteller payment transaction mismatch (expected ${tid})`);
  }
  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.thetellerPayment.findUnique({ where: { transactionId: tid } });
    if (!payment) throw new Error(`Theteller payment ${tid} not found`);
    if (payment.status === "successful") {
      return { payment, depositEventId: null, newlyCredited: false, userId: payment.userId };
    }
    if (payment.status !== "pending") {
      // failed — a terminal state never resurrects.
      return { payment, depositEventId: null, newlyCredited: false, userId: payment.userId };
    }
    // The row's amount is the principal the player asked for — the
    // verified amount must match it, or nobody gets credited.
    if (!verifiedMatchesRow(verified, payment.amountPesewas, dec(payment.amount))) {
      throw new Error(
        `Theteller payment ${tid} amount mismatch (expected ${payment.amountPesewas} pesewas)`,
      );
    }
    // Atomic claim: only one caller can move this row out of pending.
    // A concurrent callback + poll race loses here and returns
    // newlyCredited:false below.
    const claimed = await tx.thetellerPayment.updateMany({
      where: { id: payment.id, status: "pending" },
      data: {
        status: "successful",
        chargeState: "called",
        providerPayload: verified as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    });
    if (claimed.count === 0) {
      const reread = await tx.thetellerPayment.findUnique({ where: { transactionId: tid } });
      return { payment: reread ?? payment, depositEventId: null, newlyCredited: false, userId: payment.userId };
    }

    const fresh = await tx.user.findUnique({ where: { id: payment.userId } });
    if (!fresh || !fresh.active) throw new Error("Account not found or inactive");
    const amount = round2(dec(payment.amount));

    // Commission stamping — exactly like the PayTeller credit
    // (P0 Batch 3 O4): a rule in force earns commission on activity,
    // not on the deposit (rate stamped, commission 0); no rule =
    // legacy flat % of the deposit, frozen forever.
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
        method: "Theteller",
        fiatCurrency: "GHS",
        pctInForce: round2(pctInForce),
        commission: round2(commission),
        providerPayload: verified as Prisma.InputJsonValue,
      },
    });
    // Win logic (Nov 2026): this deposit's win allowance — deposit x
    // the rate in force right now (no-op when the rate is OFF).
    await topUpAllowance(tx, payment.userId, "GHS", amount);
    // P1 Batch 3 (O19): same promotion hook as the other deposit
    // routes — a live deposit_match / first-deposit free-coins grant
    // lands in the same transaction as the deposit itself.
    await applyDepositPromotions(tx, payment.userId, fresh.name, amount, fresh.referredByAdminId);
    const done = await tx.thetellerPayment.findUnique({ where: { transactionId: tid } });
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
      transactionId: result.payment.transactionId,
      status: result.payment.status,
      amount: dec(result.payment.amount),
    },
    depositEventId: result.depositEventId,
  };
}

export interface SettleResult {
  status: "pending" | "successful" | "failed";
  newlyCredited: boolean;
  reason: string | null;
}

/**
 * The single PENDING -> terminal transition for a Theteller payment,
 * from a VERIFIED response (process answer or status check). The
 * initiate worker, the status poll and the callback ALL go through
 * here, so no path can fulfil twice or resurrect a terminal row.
 *
 * - SUCCESS: credit once via creditThetellerPayment (amount-checked,
 *   atomically claimed). An amount mismatch throws — the caller
 *   treats it as retryable (503), the row stays pending.
 * - FAILED: mark failed (pending only) and record a block failure —
 *   a provider-declined / wrong-PIN / insufficient-funds / timeout
 *   outcome is a genuine failure toward the 2-in-24h block.
 * - PENDING: persist the provider's view and stay pending.
 */
export async function settleThetellerPayment(
  transactionId: string,
  verified: ThetellerResponse,
): Promise<SettleResult> {
  const tid = String(transactionId);
  const mapped = mapStatus(verified);
  const payment = await prisma.thetellerPayment.findUnique({
    where: { transactionId: tid },
    select: { id: true, userId: true, status: true },
  });
  if (!payment) throw new Error(`Theteller payment ${tid} not found`);
  if (payment.status === "successful") {
    return { status: "successful", newlyCredited: false, reason: null };
  }
  if (payment.status === "failed") {
    return { status: "failed", newlyCredited: false, reason: null };
  }
  if (mapped === "SUCCESS") {
    const result = await creditThetellerPayment(tid, verified);
    return { status: "successful", newlyCredited: result.newlyCredited, reason: null };
  }
  if (mapped === "FAILED") {
    const reason = String(verified.reason ?? `Payment failed (code ${String(verified.code ?? "?")})`);
    await prisma.thetellerPayment.update({
      where: { id: payment.id },
      data: { status: "failed", chargeState: "called", reason, providerPayload: verified as Prisma.InputJsonValue, completedAt: new Date() },
    });
    // Payment blocks: the provider says this payment failed — a
    // genuine failure. The number is the saved deposit number first,
    // the login phone second (same rule as PayTeller).
    const owner = await prisma.user.findUnique({ where: { id: payment.userId }, select: { phone: true } });
    const depositNumber = await resolveDepositNumber(payment.userId, owner?.phone ?? null);
    await recordDepositFailure({ userId: payment.userId, phoneNumber: depositNumber, depositRef: tid });
    return { status: "failed", newlyCredited: false, reason };
  }
  // Still pending — persist the provider's view so the row is not
  // stale if the customer closes the page.
  await prisma.thetellerPayment.update({
    where: { id: payment.id },
    data: { chargeState: "called", providerPayload: verified as Prisma.InputJsonValue },
  });
  return { status: "pending", newlyCredited: false, reason: null };
}

/** Mark a pending row failed WITHOUT recording a block failure — for
 *  outcomes that are our fault, not the customer's: the charge never
 *  started (queued timeout) or a duplicate-transaction-id collision
 *  (909). No charge happened, so no money moved. */
export async function failThetellerPaymentNoCount(transactionId: string, reason: string): Promise<boolean> {
  const claimed = await prisma.thetellerPayment.updateMany({
    where: { transactionId: String(transactionId), status: "pending" },
    data: { status: "failed", reason, completedAt: new Date() },
  });
  return claimed.count > 0;
}
