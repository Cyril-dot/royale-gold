import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { dec, round2, toDecimal } from "@/lib/money";
// P0 Batch 2 (O12/O13): owner-controlled payment methods + wallet config.
import { getPaymentMethodConfig, getPlatformSettings } from "@/lib/game-config";
// P0 Batch 3 (O4): the commission rule in force decides what a deposit stamps.
import { getEffectiveRuleNow } from "@/lib/commission";

const METHODS = ["MTN", "Telecel", "AirtelTigo", "card"] as const;

/**
 * Demo cashier deposit. Credits REAL cash (GH₵) only — coins are never
 * involved. If the user was referred, a DepositEvent is recorded with the
 * referring admin and the rate in force FROZEN as pctInForce.
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
    const body = await readJson<{ amount?: number; method?: string }>(req);
    if (!body) return fail("Invalid JSON body");
    const amount = Number(body.amount);
    const method = body.method ?? "";
    if (!Number.isFinite(amount) || amount <= 0) return fail("Amount must be > 0");
    if (!METHODS.includes(method as (typeof METHODS)[number])) {
      return fail(`Method must be one of: ${METHODS.join(", ")}`);
    }

    const me = await prisma.user.findUnique({ where: { id: user.id } });
    // P0 Batch 1 (A8): a blocked player cannot deposit.
    if (me?.blockedAt) return fail("This account is blocked and cannot deposit", 403);

    // P0 Batch 2 (O12/O13): owner-controlled payment methods + wallet
    // config. A disabled method is rejected; a per-method min/max (or
    // the platform cash minimum deposit when the method sets none) is
    // enforced here, server-side.
    const pm = await getPaymentMethodConfig(method);
    if (!pm.enabled) return fail(`${method} deposits are currently disabled`, 403);
    const settings = await getPlatformSettings();
    const minDeposit = pm.minDeposit ?? settings.cashMinDeposit;
    if (amount < minDeposit) {
      return fail(`Minimum deposit via ${method} is GH₵ ${round2(minDeposit).toFixed(2)}`);
    }
    if (pm.maxDeposit != null && amount > pm.maxDeposit) {
      return fail(`Maximum deposit via ${method} is GH₵ ${round2(pm.maxDeposit).toFixed(2)}`);
    }

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
          pctInForce: round2(pctInForce),
          commission: round2(commission),
        },
      });
      return { updated, event, commission };
    });

    return ok({
      cash: dec(result.updated.cashBalance),
      coins: result.updated.coins,
      sim: dec(result.updated.simBalance),
      deposit: {
        id: result.event.id,
        amount: dec(result.event.amount),
        method: result.event.method,
        pctInForce: dec(result.event.pctInForce),
        commission: result.commission,
        createdAt: result.event.createdAt.toISOString(),
      },
    }, 201);
  } catch (err) {
    return toErrorResponse(err);
  }
}
