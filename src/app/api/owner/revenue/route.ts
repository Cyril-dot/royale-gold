// P1 Batch 3 (O16): the owner's revenue breakdowns — by game, by
// admin, by day, by payment method. See src/lib/revenue.ts: every
// figure comes from the real tables, commissions recomputed by the
// rules engine (the same figure the Commission page and the P&L show).
// The P&L endpoint itself is untouched.
import { requireRole } from "@/lib/auth";
import { ok, toErrorResponse } from "@/lib/http";
import { parseOwnerRange, revenueBreakdown } from "@/lib/revenue";

export async function GET(req: Request) {
  try {
    await requireRole("owner");
    const sp = new URL(req.url).searchParams;
    const { from, to } = parseOwnerRange(sp);
    // Phase 1 country-based (Nov 2026): ?currency= (default GHS).
    const fiatCurrency = (sp.get("currency") || "GHS").toUpperCase();
    return ok(await revenueBreakdown(from, to, fiatCurrency));
  } catch (err) {
    return toErrorResponse(err);
  }
}
