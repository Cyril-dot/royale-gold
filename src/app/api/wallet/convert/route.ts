// Round 16 — convert REAL cash to coins at the platform rate
// (GH₵5 = 1 coin by default; the owner can change it in the wallet
// config — P0 Batch 2 O13). One-way only: coins are never withdrawable
// or convertible back to cash, and SIM is never touched — the converter
// only debits cashBalance. The debit + credit + audit row land in one
// $transaction, so a failed convert can never leave half a conversion
// behind.
//
// Phase 1 country-based (Nov 2026): the rate is PER-FIAT, from
// CurrencyConfig (GHS 5 / NGN 500 seed) — an NGN user converts at
// ₦500 = 1 coin, never ₦5. The event is stamped with the fiat.
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { dec, round2 } from "@/lib/money";
import { symbolFor } from "@/lib/country";
import { getCurrencyConfig, getPlatformSettings, PLATFORM_DEFAULTS } from "@/lib/game-config";
// Win logic (Nov 2026): converting cash to coins debits cash —
// debits hit Stake first, so clamp Winnings to the cash left.
import { clampWinnings, getWinnings, splitCash } from "@/lib/win-logic";

export const CONVERSION_RATE = PLATFORM_DEFAULTS.conversionRate; // GH₵5 = 1 coin (default, GHS)

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await readJson<{ cashAmount?: number }>(req);
    if (!body) return fail("Invalid JSON body");
    // P0 Batch 2 (O13): the conversion rate comes from the wallet
    // config (default GH₵5 = 1 coin); the minimum and the multiple are
    // the rate itself, so changing the rate moves both together.
    // Phase 1 (Nov 2026): per-fiat — CurrencyConfig for the player's
    // currency (GHS 5 / NGN 500 seed).
    const me = await prisma.user.findUnique({ where: { id: user.id }, select: { currency: true } });
    const fiatCurrency = me?.currency ?? "GHS";
    const sym = symbolFor(fiatCurrency);
    const rate = (await getCurrencyConfig(fiatCurrency, await getPlatformSettings())).conversionRate;
    const amount = Math.round(Number(body.cashAmount) * 100) / 100;
    if (!Number.isFinite(amount) || amount < rate) {
      return fail(`Amount must be at least ${sym}${rate}`);
    }
    // Compare in pesewas so float dust can never pass or block a convert.
    if (Math.round(amount * 100) % Math.round(rate * 100) !== 0) {
      return fail(`Amount must be a multiple of ${sym}${rate}`);
    }
    const coinsGained = amount / rate;

    const result = await prisma.$transaction(async (tx) => {
      const fresh = await tx.user.findUnique({ where: { id: user.id } });
      if (!fresh || !fresh.active) throw new Error("Account not found or inactive");
      // Compare in pesewas so float dust can never pass or block a convert.
      if (Math.round(dec(fresh.cashBalance) * 100) < Math.round(amount * 100)) {
        throw new Error("INSUFFICIENT_CASH");
      }
      const updated = await tx.user.update({
        where: { id: user.id },
        data: {
          cashBalance: round2(dec(fresh.cashBalance) - amount),
          coins: { increment: coinsGained },
        },
      });
      // Win logic: the debit hits Stake first — Winnings can never
      // exceed the cash left after the conversion.
      await clampWinnings(tx, user.id, dec(updated.cashBalance));
      await tx.conversionEvent.create({
        data: { userId: user.id, cashDebited: round2(amount), coinsGained, fiatCurrency },
      });
      return updated;
    });

    const split = splitCash(dec(result.cashBalance), await getWinnings(user.id));

    return ok({
      cash: dec(result.cashBalance),
      coins: result.coins,
      sim: dec(result.simBalance),
      stake: split.stake,
      winnings: split.winnings,
      coinsGained,
      cashDebited: round2(amount),
      fiatCurrency,
      rate,
    }, 201);
  } catch (err) {
    if (err instanceof Error && err.message === "INSUFFICIENT_CASH") {
      return fail("Not enough cash — deposit first to convert", 409);
    }
    return toErrorResponse(err);
  }
}
