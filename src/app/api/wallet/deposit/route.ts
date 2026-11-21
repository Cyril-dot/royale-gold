import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { dec, round2, toDecimal } from "@/lib/money";
import { symbolFor } from "@/lib/country";
// P0 Batch 2 (O12/O13): owner-controlled payment methods + wallet config.
import { getCurrencyConfig, getPaymentMethodConfig, getPlatformSettings } from "@/lib/game-config";
// P0 Batch 3 (O4): the commission rule in force decides what a deposit stamps.
import { getEffectiveRuleNow } from "@/lib/commission";
// P1 Batch 1 (A20): per-player daily deposit max.
import { checkDepositLimit } from "@/lib/limits";
// P1 Batch 3 (O19): promotion engine — deposit-match + first-deposit
// free coins, applied in the same transaction as the deposit.
import { applyDepositPromotions } from "@/lib/promotions";
// P2 Batch 2 (O31): automated risk rules — evaluated AFTER the
// deposit lands (best-effort; a rule failure never fails the deposit).
import { evaluateDepositRules } from "@/lib/risk-rules";
// Fixed deposit amount (Nov 2026, owner feature) — server-side
// enforcement, see the check below.
import { enforceFixedDeposit } from "@/lib/fixed-deposit";
// Win logic (Nov 2026): a deposit tops up the win allowance by
// deposit x the owner-set rate in force now (no-op when the rate is
// OFF or the tables do not exist yet).
import { getWinnings, splitCash, topUpAllowance } from "@/lib/win-logic";
// Deposit MoMo number (Nov 2026): the block keys on the saved number
// first, the login phone second. The demo path never asks for or
// saves a number — it is play money, no prompt goes out.
import { resolveDepositNumber } from "@/lib/deposit-number";
// Payment blocks (Nov 2026): two failed PayTeller deposits in 24h
// blocks the account AND the number from deposits for 24h. The demo
// path cannot record a failure (no provider), but a block earned on
// PayTeller still stops it — a blocked user deposits nothing while
// the block lasts.
import { assertPaymentsNotBlocked, PaymentBlockedError } from "@/lib/payment-blocks";
// Demo-credit hole (Nov 2026, full live everywhere, no more demo):
// the live Ghana gateway in force — the demo cashier only runs while
// the owner has explicitly picked demo. Read live on every call.
import { getGhMomoGateway, getNgGateway } from "@/lib/gateway-settings";

const METHODS = ["MTN", "Telecel", "AirtelTigo", "card"] as const;

/**
 * Demo cashier deposit. Credits REAL cash (in the player's fiat) only —
 * coins are never involved. If the user was referred, a DepositEvent is
 * recorded with the referring admin and the rate in force FROZEN as
 * pctInForce. Phase 1 country-based (Nov 2026): the event is stamped
 * with the player's fiatCurrency, and the min/max come from
 * CurrencyConfig + the (method × fiat) PaymentMethodConfig row.
 *
 * P0 Batch 3 (O4): when a commission rule is in force for the admin, the
 * commission is earned on ACTIVITY (stakes / net loss), not on the deposit
 * itself — so pctInForce is the rule's rate and the stamped commission is
 * 0. With no rule (legacy mode), pctInForce is the admin's flat
 * commissionPct and commission = amount * pct / 100 as before. Changing
 * the rule later never rewrites this event.
 */
export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    // Demo-credit hole (Nov 2026, full live everywhere, no more demo):
    // this endpoint credits real cash with no provider behind it, so
    // it only runs while the owner has explicitly picked demo for the
    // player's own fiat — Ghana checks the Ghana toggle, Nigeria the
    // Nigeria toggle (Nov 2026 Flutterwave v3: an NG user on demo must
    // not be blocked by Ghana being live, and vice versa). When the
    // player's gateway is live, a direct call here 403s — no credit,
    // no wallet change, no failure recorded toward the payment block
    // (a gateway-closed call is not a deposit failure). The gateway is
    // read live on every call, never cached, so flipping the toggle
    // takes effect immediately. A DB without the GatewaySettings table
    // yet (PayTeller SQL not run) reads as demo, so the endpoint keeps
    // working there as today.
    const me = await prisma.user.findUnique({ where: { id: user.id } });
    const fiat = me?.currency ?? "GHS";
    let gateway: "demo" | "payteller" | "theteller" | "flutterwave";
    try {
      gateway = fiat === "NGN" ? await getNgGateway() : await getGhMomoGateway();
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "P2021" || code === "P2022") gateway = "demo";
      else throw err;
    }
    if (gateway !== "demo") {
      return fail("Demo deposits are off while the live gateway is active", 403, {
        code: "demo_deposits_disabled",
      });
    }
    const body = await readJson<{ amount?: number; method?: string }>(req);
    if (!body) return fail("Invalid JSON body");
    const amount = Number(body.amount);
    const method = body.method ?? "";
    if (!Number.isFinite(amount) || amount <= 0) return fail("Amount must be > 0");
    if (!METHODS.includes(method as (typeof METHODS)[number])) {
      return fail(`Method must be one of: ${METHODS.join(", ")}`);
    }

    // P0 Batch 1 (A8): a blocked player cannot deposit.
    if (me?.blockedAt) return fail("This account is blocked and cannot deposit", 403);
    // Deposit MoMo number (Nov 2026): the block keys on the saved
    // deposit number first, the login phone second.
    const depositNumber = await resolveDepositNumber(user.id, me?.phone ?? null);
    // Payment blocks (Nov 2026): a 24h deposit block earned on
    // PayTeller stops the demo path too. The 403 carries
    // code + blockedUntil so the modal shows the card, not a line.
    try {
      await assertPaymentsNotBlocked({ userId: user.id, phoneNumber: depositNumber });
    } catch (err) {
      if (err instanceof PaymentBlockedError) {
        return fail(err.message, 403, { code: err.code, blockedUntil: err.blockedUntil });
      }
      throw err;
    }
    // Phase 1 country-based (Nov 2026): this deposit is in the
    // player's fiat, full stop — the amount is never converted.
    const fiatCurrency = me?.currency ?? "GHS";
    const sym = symbolFor(fiatCurrency);

    // P0 Batch 2 (O12/O13): owner-controlled payment methods + wallet
    // config. A disabled method is rejected; a per-method min/max (or
    // the currency's minimum deposit when the method sets none) is
    // enforced here, server-side.
    const pm = await getPaymentMethodConfig(method, fiatCurrency);
    if (!pm.enabled) return fail(`${method} deposits are currently disabled`, 403);
    const settings = await getPlatformSettings();
    const currencyCfg = await getCurrencyConfig(fiatCurrency, settings);
    const minDeposit = pm.minDeposit ?? currencyCfg.minDeposit;
    if (amount < minDeposit) {
      return fail(`Minimum deposit via ${method} is ${sym} ${round2(minDeposit).toFixed(2)}`);
    }
    if (pm.maxDeposit != null && amount > pm.maxDeposit) {
      return fail(`Maximum deposit via ${method} is ${sym} ${round2(pm.maxDeposit).toFixed(2)}`);
    }
    // Fixed deposit amount (Nov 2026, owner feature): when the owner
    // has fixed this fiat's deposit amount, every deposit must be
    // exactly that amount — no other amount is allowed. Enforced here,
    // server-side; the modal only locks the UI.
    const fixedErr = await enforceFixedDeposit(amount, fiatCurrency);
    if (fixedErr) return fail(fixedErr);

    // P1 Batch 1 (A20): per-player daily deposit max.
    const limitErr = await checkDepositLimit(user.id, amount, fiatCurrency);
    if (limitErr) return fail(limitErr, 403);

    const result = await prisma.$transaction(async (tx) => {
      const fresh = await tx.user.findUnique({ where: { id: user.id } });
      if (!fresh || !fresh.active) throw new Error("Account not found or inactive");

      let adminId: string | null = null;
      let pctInForce = 0;
      let commission = 0;
      if (fresh.referredByAdminId) {
        const admin = await tx.user.findUnique({ where: { id: fresh.referredByAdminId } });
        if (admin && admin.active && admin.role === "admin") {
          adminId = admin.id;
          // P0 Batch 3 (O4): a rule in force earns commission on activity,
          // not on the deposit — stamp the rule rate with commission 0.
          // No rule = legacy flat % of the deposit.
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
        where: { id: user.id },
        data: { cashBalance: round2(dec(fresh.cashBalance) + amount) },
      });
      const event = await tx.depositEvent.create({
        data: {
          userId: user.id,
          adminId,
          amount: round2(amount),
          method,
          fiatCurrency,
          pctInForce: round2(pctInForce),
          commission: round2(commission),
        },
      });
      // Win logic (Nov 2026): this deposit's win allowance — deposit x
      // the rate in force right now. The promotion match below is house
      // money, not a deposit, so it never tops the allowance up.
      await topUpAllowance(tx, user.id, fiatCurrency, amount);
      // P1 Batch 3 (O19): promotion engine — a live deposit_match
      // credits a % of this deposit (capped, once per player per
      // promotion), and a live free_coins promotion with trigger
      // "first_deposit" grants its coins on this first deposit. Both
      // land in the same transaction as the deposit itself. The balance
      // returned below is re-read so it includes any match.
      const promoGrants = await applyDepositPromotions(tx, user.id, fresh.name, amount, fresh.referredByAdminId);
      const updatedAfterPromo =
        promoGrants.length > 0
          ? await tx.user.findUnique({ where: { id: user.id } })
          : updated;
      return { updated: updatedAfterPromo ?? updated, event, commission, promoGrants };
    });

    // P2 Batch 2 (O31): deposit-time risk rules — signal (c)
    // "deposit, no play" can block the player. Best-effort: it runs
    // after the deposit transaction and never fails the deposit.
    await evaluateDepositRules(user.id);

    // Win logic (Nov 2026): the split after this deposit — a deposit
    // adds to Stake only; Winnings is untouched by it.
    const split = splitCash(dec(result.updated.cashBalance), await getWinnings(user.id));

    return ok({
      cash: dec(result.updated.cashBalance),
      coins: result.updated.coins,
      sim: dec(result.updated.simBalance),
      stake: split.stake,
      winnings: split.winnings,
      // Phase 1 country-based (Nov 2026): the wallet's fiat + country
      // (the store needs them to keep formatting the wallet right).
      currency: result.event.fiatCurrency ?? "GHS",
      country: user.country ?? "GH",
      promotions: result.promoGrants,
      deposit: {
        id: result.event.id,
        amount: dec(result.event.amount),
        method: result.event.method,
        fiatCurrency: result.event.fiatCurrency,
        pctInForce: dec(result.event.pctInForce),
        commission: result.commission,
        createdAt: result.event.createdAt.toISOString(),
      },
    }, 201);
  } catch (err) {
    return toErrorResponse(err);
  }
}
