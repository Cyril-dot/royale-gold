// P0 Batch 3 (O4): the rollup is recomputed from the ledger by the
// commission rules engine — one row per day per admin, newest first.
// A day now appears when the admin earned commission from PLAY as well
// as from deposits (RevShare/Turnover pay on activity, not on deposits).
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, toErrorResponse } from "@/lib/http";
import { dec, round2 } from "@/lib/money";
import { dayCommissions } from "@/lib/commission";

/** Per-day per-admin rollup table + totals (newest day first).
 * Phase 1 country-based (Nov 2026): ?currency= (default GHS). */
export async function GET(req: Request) {
  try {
    await requireRole("owner");
    const sp = new URL(req.url).searchParams;
    const fiatCurrency = (sp.get("currency") || "GHS").toUpperCase();
    const admins = await prisma.user.findMany({
      where: { role: "admin" },
      select: { id: true, name: true },
    });
    const days: {
      date: string;
      fiatCurrency: string;
      adminId: string;
      adminName: string;
      deposits: number;
      totalAmount: number;
      totalCommission: number;
      totalStakes: number;
      totalPayouts: number;
      model: string;
      rate: number;
    }[] = [];
    let depositCount = 0;
    let totalAmount = 0;
    let totalCommission = 0;
    for (const a of admins) {
      const rows = await dayCommissions(a.id, undefined, undefined, fiatCurrency);
      for (const r of rows) {
        days.push({
          date: r.date,
          fiatCurrency: r.fiatCurrency,
          adminId: a.id,
          adminName: a.name,
          deposits: r.deposits,
          totalAmount: r.totalAmount,
          totalCommission: r.totalCommission,
          totalStakes: r.totalStakes,
          totalPayouts: r.totalPayouts,
          model: r.model,
          rate: r.rate,
        });
        depositCount += r.deposits;
        totalAmount = round2(totalAmount + r.totalAmount);
        totalCommission = round2(totalCommission + r.totalCommission);
      }
    }
    days.sort((a, b) =>
      a.date === b.date ? a.adminName.localeCompare(b.adminName) : a.date < b.date ? 1 : -1,
    );
    return ok({
      currency: fiatCurrency,
      days,
      totals: {
        deposits: depositCount,
        totalAmount,
        totalCommission,
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
