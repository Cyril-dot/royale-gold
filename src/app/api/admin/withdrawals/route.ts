// P0 Batch 1 (A5): the admin's withdrawal queue — pending requests from
// the admin's own players only (adminId stamped at request time).
// Nothing pays out without an admin action.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { dec } from "@/lib/money";

export async function GET(req: Request) {
  try {
    const admin = await requireRole("admin");
    const sp = new URL(req.url).searchParams;
    const status = sp.get("status") || undefined;
    const limit = Math.min(Math.max(Number(sp.get("limit") ?? 50) || 50, 1), 100);
    const rows = await prisma.withdrawal.findMany({
      where: { adminId: admin.id, ...(status ? { status } : {}) },
      include: { user: { select: { id: true, name: true, email: true, phone: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    const pending = await prisma.withdrawal.count({ where: { adminId: admin.id, status: { in: ["pending", "admin_approved"] } } });
    return ok({
      withdrawals: rows.map((w) => ({
        id: w.id,
        userId: w.userId,
        userName: w.user.name,
        userContact: w.user.email ?? w.user.phone ?? null,
        amount: dec(w.amount),
        method: w.method,
        status: w.status,
        reason: w.reason,
        decidedBy: w.decidedBy,
        createdAt: w.createdAt.toISOString(),
        decidedAt: w.decidedAt?.toISOString() ?? null,
      })),
      pending,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
