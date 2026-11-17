// P0 Batch 2 (O13): the owner's wallet config — the platform rules for
// the two wallets. Defaults are the values the code enforced before any
// owner row exists (cash min deposit GH₵1, cash min stake GH₵1, coin min
// stake 1, conversion GH₵5 = 1 coin, coins never withdrawable).
// (Imports live below, shared with the POST handler.)

export async function GET() {
  try {
    await requireRole("owner");
    const s = await getPlatformSettings();
    return ok(s);
  } catch (err) {
    return toErrorResponse(err);
  }
}

// P0 Batch 2 (O13): update the wallet config. Body fields are all
// optional. Flipping coinsWithdrawable is explicit and logged —
// flipping it ON records the policy only: no coin payout path exists
// (withdrawal requests are cash-only), so coins still cannot be paid
// out until that path is built.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { getPlatformSettings, PLATFORM_DEFAULTS, upsertCurrencyConfig } from "@/lib/game-config";
import { round2 } from "@/lib/money";

type Body = {
  cashMinDeposit?: number;
  cashMinStake?: number;
  coinMinStake?: number;
  conversionRate?: number;
  coinsWithdrawable?: boolean;
};

export async function POST(req: Request) {
  try {
    const owner = await requireRole("owner");
    const body = await readJson<Body>(req);
    if (!body) return fail("Invalid JSON body");

    const changes: string[] = [];
    const data: {
      cashMinDeposit?: number;
      cashMinStake?: number;
      coinMinStake?: number;
      conversionRate?: number;
      coinsWithdrawable?: boolean;
    } = {};
    const money = (v: unknown, name: string, min: number): number | null => {
      if (typeof v !== "number" || !Number.isFinite(v) || v < min || Math.abs(round2(v) - v) > 1e-9) {
        return null;
      }
      return round2(v);
    };
    if ("cashMinDeposit" in body) {
      const v = money(body.cashMinDeposit, "cashMinDeposit", 0);
      if (v === null) return fail("cashMinDeposit must be a GH₵ amount >= 0");
      data.cashMinDeposit = v;
      changes.push(`cash min deposit = GH₵ ${v.toFixed(2)}`);
    }
    if ("cashMinStake" in body) {
      const v = money(body.cashMinStake, "cashMinStake", 0.01);
      if (v === null) return fail("cashMinStake must be a GH₵ amount > 0");
      data.cashMinStake = v;
      changes.push(`cash min stake = GH₵ ${v.toFixed(2)}`);
    }
    if ("coinMinStake" in body) {
      const v = body.coinMinStake;
      if (typeof v !== "number" || !Number.isInteger(v) || v < 1) {
        return fail("coinMinStake must be a whole number of coins >= 1");
      }
      data.coinMinStake = v;
      changes.push(`coin min stake = ${v}`);
    }
    if ("conversionRate" in body) {
      const v = money(body.conversionRate, "conversionRate", 1);
      if (v === null) return fail("conversionRate must be a GH₵ amount >= 1");
      data.conversionRate = v;
      changes.push(`conversion rate = GH₵ ${v} = 1 coin`);
    }
    if (typeof body.coinsWithdrawable === "boolean") {
      data.coinsWithdrawable = body.coinsWithdrawable;
      changes.push(
        body.coinsWithdrawable
          ? "coins withdrawable ON — policy only, no coin payout path exists yet"
          : "coins withdrawable OFF",
      );
    }
    if (changes.length === 0) return fail("Nothing to update");

    const before = await getPlatformSettings();
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.platformSettings.upsert({
        where: { id: "global" },
        create: {
          id: "global",
          cashMinDeposit: PLATFORM_DEFAULTS.cashMinDeposit,
          cashMinStake: PLATFORM_DEFAULTS.cashMinStake,
          coinMinStake: PLATFORM_DEFAULTS.coinMinStake,
          conversionRate: PLATFORM_DEFAULTS.conversionRate,
          coinsWithdrawable: PLATFORM_DEFAULTS.coinsWithdrawable,
          ...data,
        },
        update: data,
      });
      await tx.auditLog.create({
        data: {
          actorId: owner.id,
          action: "wallet.config",
          targetId: "global",
          detail: `Wallet config: ${changes.join(", ")}`,
        },
      });
      return row;
    });
    // Phase 1 country-based (Nov 2026): the legacy PlatformSettings
    // fields ARE the GHS row's values — keep the GHS CurrencyConfig
    // row in sync so the two can never disagree. (Per-currency edits
    // go through the CurrencyConfig editor instead.)
    if ("cashMinDeposit" in data || "cashMinStake" in data || "conversionRate" in data) {
      await upsertCurrencyConfig("GHS", {
        ...(data.cashMinDeposit !== undefined ? { minDeposit: data.cashMinDeposit } : {}),
        ...(data.cashMinStake !== undefined ? { minStake: data.cashMinStake } : {}),
        ...(data.conversionRate !== undefined ? { conversionRate: data.conversionRate } : {}),
      });
    }

    return ok({
      globalKill: updated.globalKill,
      cashMinDeposit: Number(updated.cashMinDeposit.toString()),
      cashMinStake: Number(updated.cashMinStake.toString()),
      coinMinStake: updated.coinMinStake,
      conversionRate: Number(updated.conversionRate.toString()),
      coinsWithdrawable: updated.coinsWithdrawable,
      coinsWithdrawableWas: before.coinsWithdrawable,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
