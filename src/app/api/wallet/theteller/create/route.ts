// Nov 2026 Theteller (PaySwitch) direct MoMo push: start a Ghana
// MoMo deposit — the prompt goes straight to the customer's phone,
// no hosted checkout page.
//
// POST /api/wallet/theteller/create { amount, method, phone?, voucherCode? }
//   -> 202 { transactionId, status: "pending" }
//
// The response is immediate: the process call runs AFTER it (Next
// `after()`), because Theteller may block up to 90s while the
// customer acts. The browser polls the status endpoint; the wallet
// only credits when the process response or a status check says
// SUCCESS, through the single settle function
// (src/lib/theteller-deposit.ts). No money moves here.
//
// Guards, in the same order as the PayTeller create route: signed
// in, not blocked (account + number), GHS only, amount inside the
// currency minimum and the 0.01–1,000,000 band, fixed-deposit amount,
// the owner toggle set to Theteller, the method enabled, the daily
// deposit limit, and credentials configured. The deposit number is
// the SAVED one (9834fea round) — a body phone is ignored when one
// is saved; on a first deposit the supplied number is required and
// saved before any provider call. Telecel/Vodafone needs the voucher
// code (*110#) or the request is a 400.
//
// Payment blocks: a start the provider rejects, or a payment the
// provider reports as terminally failed (wrong PIN, insufficient
// funds, timeout), records a failure toward the 2-in-24h block.
// Validation errors, a blocked 403, a toggle 503 and a charge that
// never started (queued timeout) do NOT count.
import { after } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { getCurrencyConfig, getPaymentMethodConfig } from "@/lib/game-config";
import { checkDepositLimit } from "@/lib/limits";
import { getGhMomoGateway, getThetellerCredentials } from "@/lib/gateway-settings";
import { enforceFixedDeposit } from "@/lib/fixed-deposit";
import {
  chargeMomo,
  isNetworkError,
  newTransactionId,
  ThetellerError,
  toMinor12,
  type ThetellerNetwork,
  type ThetellerResponse,
} from "@/lib/theteller";
import { settleThetellerPayment, failThetellerPaymentNoCount } from "@/lib/theteller-deposit";
import {
  DEPOSIT_NUMBER_SQL,
  getDepositPhone,
  normalizeDepositPhone,
  setDepositPhone,
} from "@/lib/deposit-number";
import {
  assertPaymentsNotBlocked,
  normalizePhone,
  PaymentBlockedError,
  recordDepositFailure,
} from "@/lib/payment-blocks";

// The process call may block up to 90s while the customer acts —
// the after() worker needs room past the default route duration.
export const maxDuration = 120;

const METHODS = ["MTN", "Telecel", "AirtelTigo"] as const;

// DepositModal method -> Theteller r-switch.
const RSWITCH: Record<(typeof METHODS)[number], ThetellerNetwork> = {
  MTN: "MTN",
  Telecel: "VDF",
  AirtelTigo: "ATL",
};

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await readJson<{ amount?: number; method?: string; phone?: string; voucherCode?: string }>(req);
    if (!body) return fail("Invalid JSON body");
    const amount = Number(body.amount);
    const method = body.method ?? "";
    if (!Number.isFinite(amount) || amount <= 0) return fail("Amount must be > 0");
    if (!METHODS.includes(method as (typeof METHODS)[number])) {
      return fail(`Method must be one of: ${METHODS.join(", ")}`);
    }
    const network = RSWITCH[method as (typeof METHODS)[number]];
    // Telecel/Vodafone: the voucher is required before any provider
    // call — the customer generates it on their phone (*110#).
    const voucherCode = (body.voucherCode ?? "").trim() || undefined;
    if (network === "VDF" && !voucherCode) {
      return fail("Voucher code required for Telecel — dial *110# to generate one");
    }

    const me = await prisma.user.findUnique({ where: { id: user.id } });
    if (me?.blockedAt) return fail("This account is blocked and cannot deposit", 403);
    // Deposit MoMo number (Nov 2026): the SAVED number (table only)
    // and the effective number (saved first, login phone second — the
    // block keys on the effective one). A login phone is NOT a saved
    // deposit number.
    const savedNumber = await getDepositPhone(user.id);
    const depositNumber = savedNumber ?? normalizePhone(me?.phone ?? null);
    // Payment blocks: the guard runs before any provider call, so a
    // blocked user never burns a Theteller start. The 403 carries
    // code + blockedUntil so the modal shows the card.
    try {
      await assertPaymentsNotBlocked({ userId: user.id, phoneNumber: depositNumber });
    } catch (err) {
      if (err instanceof PaymentBlockedError) {
        return fail(err.message, 403, { code: err.code, blockedUntil: err.blockedUntil });
      }
      throw err;
    }
    // Theteller is GHS only — an NGN account never gets this path.
    if ((me?.currency ?? "GHS") !== "GHS") {
      return fail("Theteller is available for Ghana cedi accounts only");
    }

    const currencyCfg = await getCurrencyConfig("GHS");
    if (amount < currencyCfg.minDeposit) {
      return fail(`Minimum Theteller deposit is GH₵ ${currencyCfg.minDeposit.toFixed(2)}`);
    }
    // Fixed deposit amount (Nov 2026, owner feature): when the owner
    // has fixed the GHS deposit amount, a Theteller push may only
    // start for exactly that amount. Deliberately NOT enforced again
    // at credit time: by then the customer has already paid, and
    // rejecting a paid payment would strand money.
    const fixedErr = await enforceFixedDeposit(amount, "GHS");
    if (fixedErr) return fail(fixedErr);
    try {
      toMinor12(amount);
    } catch {
      return fail("Amount must be between GH₵ 0.01 and GH₵ 1,000,000.00");
    }

    // The owner toggle decides whether Ghana MoMo is Theteller,
    // PayTeller or demo.
    const gateway = await getGhMomoGateway();
    if (gateway !== "theteller") {
      return fail("Theteller is not the active Ghana gateway", 503);
    }

    // A disabled method stays disabled on Theteller too — the owner
    // disabling MTN must stop Theteller MTN deposits.
    const pm = await getPaymentMethodConfig(method, "GHS");
    if (!pm.enabled) return fail(`${method} deposits are currently disabled`, 403);

    // Per-player daily deposit max — fail fast here; the credit
    // itself never fails for money already paid.
    const limitErr = await checkDepositLimit(user.id, amount, "GHS");
    if (limitErr) return fail(limitErr, 403);

    // Deposit MoMo number: the prompt goes to the SAVED number. A
    // saved number is never overwritten by a free-typed one — a body
    // phone is ignored when one is saved. First Theteller deposit
    // (nothing saved — a login phone does NOT count): the supplied
    // number is required and saved to the account here, before any
    // provider call. A missing DepositNumber table in prod fails
    // closed with a 503 naming the SQL.
    let numberToUse = depositNumber;
    if (!savedNumber) {
      const supplied = normalizeDepositPhone(body.phone);
      if (!supplied) {
        return fail("Add your MoMo number — the prompt goes to the number you set on your first deposit");
      }
      try {
        numberToUse = await setDepositPhone(user.id, supplied);
      } catch (err) {
        if (err instanceof Error && err.message.includes(DEPOSIT_NUMBER_SQL)) {
          return fail(err.message, 503);
        }
        throw err;
      }
    }
    if (!numberToUse) {
      return fail("Add your MoMo number — the prompt goes to the number you set on your first deposit");
    }

    // The 12-digit transaction id — crypto-random, unique per attempt.
    // A retry is always a NEW id, never a reuse (Theteller 909s a
    // duplicate id).
    let transactionId = newTransactionId();
    let payment: { id: string };
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        payment = await prisma.thetellerPayment.create({
          data: {
            userId: user.id,
            transactionId,
            amount,
            amountPesewas: Math.round(amount * 100),
            fiatCurrency: "GHS",
            network,
            subscriberNumber: numberToUse,
            status: "pending",
            chargeState: "queued",
          },
          select: { id: true },
        });
        break;
      } catch (err) {
        if ((err as { code?: string }).code === "P2002" && attempt < 2) {
          transactionId = newTransactionId();
          continue;
        }
        throw err;
      }
    }
    // Credentials: checked AFTER the row exists so a no-credentials
    // failure still has a depositRef to record (established
    // safeguards-round behaviour — it counts toward the block).
    const creds = await getThetellerCredentials().catch(() => null);
    if (!creds) {
      await prisma.thetellerPayment.update({
        where: { id: payment!.id },
        data: { status: "failed", chargeState: "called", reason: "Theteller credentials are not configured" },
      });
      await recordDepositFailure({ userId: user.id, phoneNumber: numberToUse, depositRef: transactionId });
      return fail("Theteller credentials are not configured", 503);
    }

    // The charge runs after the 202: Theteller may block up to 90s
    // while the customer acts, and the browser must never hang on it.
    // The browser polls the status endpoint; the settle function is
    // the only path that moves the row to a terminal state or credits.
    const amountGhs = amount;
    const phone = numberToUse;
    const voucher = voucherCode;
    const tid = transactionId;
    after(async () => {
      try {
        const response = await chargeMomo({
          transactionId: tid,
          amountGhs,
          phone,
          network,
          description: "Royale Gold wallet deposit",
          voucherCode: voucher,
        });
        await settleThetellerPayment(tid, response);
      } catch (err) {
        // A network failure / timeout means the outcome is UNKNOWN:
        // leave the row pending — the status poll reconciles it via
        // the status endpoint. Never fail (or credit) on unknown.
        if (isNetworkError(err)) {
          console.error(`[Theteller] charge ${tid} unreachable — left pending for reconciliation`);
          return;
        }
        if (err instanceof ThetellerError) {
          // A provider answer WITH a body maps to a real outcome:
          // 909 (duplicate id) is our collision, not the customer's
          // failure — fail the row without counting it.
          if (err.providerCode === "909") {
            await failThetellerPaymentNoCount(tid, "Duplicate transaction id — try again");
            return;
          }
          const body = (err.providerBody ?? null) as ThetellerResponse | null;
          if (body && (body.code != null || body.status != null)) {
            try {
              await settleThetellerPayment(tid, body);
            } catch (settleErr) {
              console.error(`[Theteller] settle ${tid} failed:`, settleErr instanceof Error ? settleErr.message : settleErr);
            }
            return;
          }
          // An HTTP error with no usable body: outcome unknown, leave
          // pending for the status poll to reconcile.
          console.error(`[Theteller] charge ${tid} failed without a provider body — left pending`);
          return;
        }
        console.error(`[Theteller] charge ${tid} error:`, err instanceof Error ? err.message : err);
      }
    });

    return ok({ transactionId, status: "pending" }, 202);
  } catch (err) {
    return toErrorResponse(err);
  }
}
