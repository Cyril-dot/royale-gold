// Owner analytics (Nov 2026): income vs losses + when income rises.
// Owner-only. GET /api/owner/analytics?from=&to=&currency= — range
// defaults to this month through today (parseOwnerRange), capped at
// 92 days so the daily series stays readable. All figures from the
// real tables via src/lib/analytics.ts; per-game figures reuse
// revenueBreakdown (same as the BI page). No new tables, no stored
// state, no forecasting.
import { requireRole } from "@/lib/auth";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { parseOwnerRange } from "@/lib/revenue";
import { getAnalytics } from "@/lib/analytics";

const MAX_RANGE_DAYS = 92;

export async function GET(req: Request) {
  try {
    await requireRole("owner");
    const sp = new URL(req.url).searchParams;
    const { from, to } = parseOwnerRange(sp);
    const spanDays =
      Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86400000) + 1;
    if (spanDays > MAX_RANGE_DAYS) return fail(`Analytics range must be ${MAX_RANGE_DAYS} days or fewer`);
    const fiatCurrency = (sp.get("currency") || "GHS").toUpperCase();
    return ok(await getAnalytics(from, to, fiatCurrency));
  } catch (err) {
    return toErrorResponse(err);
  }
}
