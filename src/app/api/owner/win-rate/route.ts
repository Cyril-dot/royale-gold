// Win rate (Nov 2026, owner feature): POST sets one win rate per fiat
// (or clears it with ratePct: null). Owner-only. When set, a deposit
// of D in that fiat can win at most D x rate% in total across all
// games — enforced server-side in settleGame, and the DepositModal
// never shows it (no max-win labels anywhere player-facing).
//
// PROD SAFETY: the WinRate table does not exist in prod Neon until
// Chuks runs rg-win-logic.sql. A write before then fails here with a
// plain 503 (never a 500) telling him to run the SQL. Reads never
// fail: getWinRate degrades to OFF.
import { requireRole } from "@/lib/auth";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { setWinRate, WIN_RATE_MAX_PCT } from "@/lib/win-logic";
import { round2 } from "@/lib/money";

export async function POST(req: Request) {
  try {
    const owner = await requireRole("owner");
    const body = await readJson<{ currency?: string; ratePct?: number | null }>(req);
    if (!body) return fail("Invalid JSON body");
    const currency = (body.currency ?? "").trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) return fail("currency must be a 3-letter code (e.g. GHS, NGN)");
    // ratePct: null (or omitted) = clear = OFF. A number must be a
    // percent above 0 and at most 100.
    let ratePct: number | null = null;
    if (body.ratePct !== undefined && body.ratePct !== null) {
      const v = body.ratePct;
      if (typeof v !== "number" || !Number.isFinite(v) || v <= 0 || v > WIN_RATE_MAX_PCT) {
        return fail(`Win rate must be a percent above 0 and at most ${WIN_RATE_MAX_PCT}`);
      }
      ratePct = round2(v);
    }
    try {
      const next = await setWinRate(owner.id, currency, ratePct);
      return ok({ currency, winRatePct: next });
    } catch (err) {
      // Missing table in prod → plain 503, never a 500.
      if (err instanceof Error && err.message.includes("rg-win-logic.sql")) {
        return fail(err.message, 503);
      }
      throw err;
    }
  } catch (err) {
    return toErrorResponse(err);
  }
}
