// P2 Batch 2 (O26): advanced BI & cohorts — players grouped by the
// month they joined, with activity, deposits, stakes, GGR and average
// deposit per cohort, plus a month-1/2/3 retention curve. Every figure
// comes from the real tables (User.createdAt, GameResult,
// DepositEvent) — no separate analytics store. The existing P&L and
// Revenue sections are untouched.
import { requireRole } from "@/lib/auth";
import { ok, toErrorResponse } from "@/lib/http";
import { cohortReport } from "@/lib/bi";

export async function GET(req: Request) {
  try {
    await requireRole("owner");
    // Phase 1 country-based (Nov 2026): ?currency= (default GHS) —
    // cohorts count only players of that fiat.
    const sp = new URL(req.url).searchParams;
    const fiatCurrency = (sp.get("currency") || "GHS").toUpperCase();
    const report = await cohortReport(fiatCurrency);
    return ok(report);
  } catch (err) {
    return toErrorResponse(err);
  }
}
