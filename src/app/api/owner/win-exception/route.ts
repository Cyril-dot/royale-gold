// Win controls (Nov 2026): POST sets one random win exception chance
// per fiat (or clears it with chancePct: null). Owner-only. When set,
// that percent of cash wins in the fiat bypass the win-allowance cap
// entirely — the full natural profit is credited and the allowance is
// NOT drained for that win. The roll is server-side (Node crypto,
// inside the settle transaction) and the client can never influence
// it. Players never see it: no label, no announcement; a bypassed win
// simply shows its full credited amount, like any uncapped win.
//
// PROD SAFETY: the WinException table does not exist in prod Neon until
// Chuks runs rg-win-controls.sql. A write before then fails here with a
// plain 503 (never a 500) telling him to run the SQL. Reads never
// fail: getWinExceptionChance degrades to OFF.
import { requireRole } from "@/lib/auth";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { setWinExceptionChance, WIN_EXCEPTION_MAX_PCT } from "@/lib/win-logic";
import { round2 } from "@/lib/money";

export async function POST(req: Request) {
  try {
    const owner = await requireRole("owner");
    const body = await readJson<{ currency?: string; chancePct?: number | null }>(req);
    if (!body) return fail("Invalid JSON body");
    const currency = (body.currency ?? "").trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) return fail("currency must be a 3-letter code (e.g. GHS, NGN)");
    // chancePct: null (or omitted) = clear = OFF. A number must be a
    // percent above 0 and at most 100.
    let chancePct: number | null = null;
    if (body.chancePct !== undefined && body.chancePct !== null) {
      const v = body.chancePct;
      if (typeof v !== "number" || !Number.isFinite(v) || v <= 0 || v > WIN_EXCEPTION_MAX_PCT) {
        return fail(`Win exception chance must be a percent above 0 and at most ${WIN_EXCEPTION_MAX_PCT}`);
      }
      chancePct = round2(v);
    }
    try {
      const next = await setWinExceptionChance(owner.id, currency, chancePct);
      return ok({ currency, winExceptionPct: next });
    } catch (err) {
      // Missing table in prod → plain 503, never a 500.
      if (err instanceof Error && err.message.includes("rg-win-controls.sql")) {
        return fail(err.message, 503);
      }
      throw err;
    }
  } catch (err) {
    return toErrorResponse(err);
  }
}
