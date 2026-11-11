import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, toErrorResponse } from "@/lib/http";
import { dateStr, dec } from "@/lib/money";

/** Per-day per-admin rollup table + totals (newest day first). */
export async function GET() {
  try {
    await requireRole("owner");
    const rows = await prisma.depositEvent.findMany({
      where: { adminId: { not: null } },
      include: { admin: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
    const byKey = new Map<
      string,
      { date: string; adminId: string; adminName: string; deposits: number; totalAmount: number; totalCommission: number }
    >();
    for (const r of rows) {
      const key = `${dateStr(r.createdAt)}|${r.adminId}`;
      const cur = byKey.get(key) ?? {
        date: dateStr(r.createdAt),
        adminId: r.adminId!,
        adminName: r.admin!.name,
        deposits: 0,
        totalAmount: 0,
        totalCommission: 0,
      };
      cur.deposits += 1;
      cur.totalAmount += dec(r.amount);
      cur.totalCommission += dec(r.commission);
      byKey.set(key, cur);
    }
    const days = [...byKey.values()].sort((a, b) =>
      a.date === b.date ? a.adminName.localeCompare(b.adminName) : a.date < b.date ? 1 : -1,
    );
    return ok({
      days,
      totals: {
        deposits: rows.length,
        totalAmount: rows.reduce((s, r) => s + dec(r.amount), 0),
        totalCommission: rows.reduce((s, r) => s + dec(r.commission), 0),
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
