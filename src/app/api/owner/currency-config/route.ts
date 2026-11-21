// Phase 1 country-based (Nov 2026): the owner's CurrencyConfig
// editor — per-currency platform rules (min deposit / min stake /
// cash→coins rate / LIVE decay step / owner-approval threshold /
// enabled). GET lists every known currency row (seed defaults included
// when no row exists yet). POST upserts one row; every field is
// optional. All changes are audit-logged.
//
// Seed values (GHS 1/1/5/100/500, NGN 100/100/500/10000/50000) are
// defaults Chuks can change here — no code change, no redeploy.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { getAllCurrencyConfigs, upsertCurrencyConfig, type CurrencyConfigShape } from "@/lib/game-config";
import { symbolFor } from "@/lib/country";
import { round2 } from "@/lib/money";

export async function GET() {
  try {
    await requireRole("owner");
    const currencies = await getAllCurrencyConfigs();
    return ok({ currencies });
  } catch (err) {
    return toErrorResponse(err);
  }
}

type Body = {
  currency?: string;
  symbol?: string;
  minDeposit?: number;
  minStake?: number;
  conversionRate?: number;
  decayStep?: number;
  withdrawalOwnerThreshold?: number;
  // Max withdrawal per request (Nov 2026): a number > 0 sets it,
  // null clears it back to no max. Omitted = leave it alone.
  withdrawalMax?: number | null;
  enabled?: boolean;
};

export async function POST(req: Request) {
  try {
    const owner = await requireRole("owner");
    const body = await readJson<Body>(req);
    if (!body) return fail("Invalid JSON body");
    const currency = (body.currency ?? "").trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) return fail("currency must be a 3-letter code (e.g. GHS, NGN)");
    const patch: Partial<Omit<CurrencyConfigShape, "currency">> = {};
    const changes: string[] = [];
    const money = (v: unknown, name: string, min: number): number | null => {
      if (typeof v !== "number" || !Number.isFinite(v) || v < min || Math.abs(round2(v) - v) > 1e-9) return null;
      return round2(v);
    };
    if (typeof body.symbol === "string" && body.symbol.trim()) {
      patch.symbol = body.symbol.trim();
      changes.push(`symbol = ${patch.symbol}`);
    }
    if ("minDeposit" in body) {
      const v = money(body.minDeposit, "minDeposit", 0);
      if (v === null) return fail("minDeposit must be an amount >= 0");
      patch.minDeposit = v;
      changes.push(`min deposit = ${symbolFor(currency)} ${v.toFixed(2)}`);
    }
    if ("minStake" in body) {
      const v = money(body.minStake, "minStake", 0.01);
      if (v === null) return fail("minStake must be an amount > 0");
      patch.minStake = v;
      changes.push(`min stake = ${symbolFor(currency)} ${v.toFixed(2)}`);
    }
    if ("conversionRate" in body) {
      const v = money(body.conversionRate, "conversionRate", 1);
      if (v === null) return fail("conversionRate must be an amount >= 1");
      patch.conversionRate = v;
      changes.push(`conversion rate = ${symbolFor(currency)} ${v} = 1 coin`);
    }
    if ("decayStep" in body) {
      const v = money(body.decayStep, "decayStep", 1);
      if (v === null) return fail("decayStep must be an amount >= 1");
      patch.decayStep = v;
      changes.push(`decay step = ${symbolFor(currency)} ${v.toFixed(2)}`);
    }
    if ("withdrawalOwnerThreshold" in body) {
      const v = money(body.withdrawalOwnerThreshold, "withdrawalOwnerThreshold", 0);
      if (v === null) return fail("withdrawalOwnerThreshold must be an amount >= 0");
      patch.withdrawalOwnerThreshold = v;
      changes.push(`owner-approval threshold = ${symbolFor(currency)} ${v.toFixed(2)}`);
    }
    if ("withdrawalMax" in body) {
      if (body.withdrawalMax === null) {
        patch.withdrawalMax = null;
        changes.push("max withdrawal cleared (no max)");
      } else {
        const v = money(body.withdrawalMax, "withdrawalMax", 0.01);
        if (v === null) return fail("withdrawalMax must be an amount > 0");
        patch.withdrawalMax = v;
        changes.push(`max withdrawal = ${symbolFor(currency)} ${v.toFixed(2)}`);
      }
    }
    if (typeof body.enabled === "boolean") {
      patch.enabled = body.enabled;
      changes.push(body.enabled ? "enabled" : "disabled");
    }
    if (changes.length === 0) return fail("Nothing to update");
    let updated;
    try {
      updated = await upsertCurrencyConfig(currency, patch);
    } catch (err) {
      // Missing column in prod → plain 503, never a 500.
      if (err instanceof Error && err.message.includes("rg-withdrawal-max.sql")) {
        return fail(err.message, 503);
      }
      throw err;
    }
    await prisma.auditLog.create({
      data: {
        actorId: owner.id,
        action: "currency.config",
        targetId: currency,
        detail: `Currency ${currency}: ${changes.join(", ")}`,
      },
    });
    return ok({ currency: updated });
  } catch (err) {
    return toErrorResponse(err);
  }
}
