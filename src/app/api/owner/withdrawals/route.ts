// P0 Batch 1 (O8): the owner's withdrawal oversight — every pending
// withdrawal platform-wide, with the player and the referring admin.
// This is the second half of maker-checker: large withdrawals an admin
// approved sit here as "admin_approved" until the owner approves them.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { dec } from "@/lib/money";

export async function GET(req: Request) {
  try {
    await requireRole("owner");
    const sp = new URL(req.url).searchParams;
    const status = sp.get("status") || undefined;
    // Owner preview of one admin's panel (?preview=<adminId>): narrow to
    // that admin's queue.
    const adminId = sp.get("adminId") || undefined;
    const limit = Math.min(Math.max(Number(sp.get("limit") ?? 50) || 50, 1), 100);
    const rows = await prisma.withdrawal.findMany({
      where: { ...(status ? { status } : {}), ...(adminId ? { adminId } : {}) },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        admin: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    const pending = await prisma.withdrawal.count({ where: { status: { in: ["pending", "admin_approved"] } } });
    return ok({
      withdrawals: rows.map((w) => ({
        id: w.id,
        userId: w.userId,
        userName: w.user.name,
        userContact: w.user.email ?? w.user.phone ?? null,
        adminId: w.adminId,
        adminName: w.admin?.name ?? null,
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
