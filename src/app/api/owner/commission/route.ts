import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { depositsForAdminOnScoped } from "@/lib/hierarchy";
import { dec, todayStr } from "@/lib/money";

/**
 * Owner day detail. ?adminId= (one admin) and ?date=YYYY-MM-DD (default today).
 * Without adminId, returns every admin's deposits that day, grouped by admin.
 */
export async function GET(req: Request) {
  try {
    await requireRole("owner");
    const q = new URL(req.url).searchParams;
    const adminId = q.get("adminId") ?? undefined;
    const date = q.get("date") ?? todayStr();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail("date must be YYYY-MM-DD");
    if (adminId) {
      const admin = await prisma.user.findUnique({ where: { id: adminId } });
      if (!admin || admin.role !== "admin") return fail("Admin not found", 404);
      // P1 Batch 4 (O24): the owner preview shows the admin's own view —
      // a parent admin's day detail rolls their child downlines in.
      return ok({ admin: { id: admin.id, name: admin.name }, ...(await depositsForAdminOnScoped(adminId, date)) });
    }
    const start = new Date(`${date}T00:00:00.000Z`);
    const end = new Date(`${date}T23:59:59.999Z`);
    const rows = await prisma.depositEvent.findMany({
      where: { createdAt: { gte: start, lte: end }, adminId: { not: null } },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        admin: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    const byAdmin = new Map<string, { admin: { id: string; name: string }; deposits: unknown[]; totalAmount: number; totalCommission: number }>();
    for (const r of rows) {
      const key = r.adminId!;
      const cur = byAdmin.get(key) ?? {
        admin: { id: r.admin!.id, name: r.admin!.name },
        deposits: [],
        totalAmount: 0,
        totalCommission: 0,
      };
      (cur.deposits as unknown[]).push({
        id: r.id,
        userId: r.userId,
        userName: r.user.name,
        userContact: r.user.email ?? r.user.phone ?? null,
        amount: dec(r.amount),
        method: r.method,
        pctInForce: dec(r.pctInForce),
        commission: dec(r.commission),
        time: r.createdAt.toISOString(),
      });
      cur.totalAmount += dec(r.amount);
      cur.totalCommission += dec(r.commission);
      byAdmin.set(key, cur);
    }
    return ok({
      date,
      admins: [...byAdmin.values()],
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
