// P0 Batch 1 (A4): the admin's own players' deposits, by method /
// status / amount / date, with a receipt/reference lookup (search by
// player name, contact, or deposit id). Scoped to deposits whose
// adminId is this admin — the referring admin stamped at deposit time.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { dec } from "@/lib/money";

export async function GET(req: Request) {
  try {
    const admin = await requireRole("admin");
    const sp = new URL(req.url).searchParams;
    const method = sp.get("method") || undefined;
    const q = (sp.get("q") || "").trim().toLowerCase();
    const from = sp.get("from");
    const to = sp.get("to");
    const limit = Math.min(Math.max(Number(sp.get("limit") ?? 50) || 50, 1), 100);
    const fromD = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? new Date(`${from}T00:00:00.000Z`) : undefined;
    const toD = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? new Date(`${to}T23:59:59.999Z`) : undefined;

    const rows = await prisma.depositEvent.findMany({
      where: {
        adminId: admin.id,
        ...(method ? { method } : {}),
        createdAt: { gte: fromD, lte: toD },
      },
      include: { user: { select: { id: true, name: true, email: true, phone: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const filtered = rows.filter((d) => {
      if (!q) return true;
      return `${d.user.name} ${d.user.email ?? ""} ${d.user.phone ?? ""} ${d.id}`.toLowerCase().includes(q);
    });
    const page = filtered.slice(0, limit);
    const totalAmount = filtered.reduce((s, d) => s + dec(d.amount), 0);
    const totalCommission = filtered.reduce((s, d) => s + dec(d.commission), 0);
    return ok({
      deposits: page.map((d) => ({
        id: d.id,
        userId: d.userId,
        userName: d.user.name,
        userContact: d.user.email ?? d.user.phone ?? null,
        amount: dec(d.amount),
        method: d.method,
        pctInForce: dec(d.pctInForce),
        commission: dec(d.commission),
        createdAt: d.createdAt.toISOString(),
      })),
      totals: { deposits: filtered.length, totalAmount: Math.round(totalAmount * 100) / 100, totalCommission: Math.round(totalCommission * 100) / 100 },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
