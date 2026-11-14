// P0 Batch 3 (A12): the admin's OWN activity log — their own AuditLog
// rows only (action, target, detail, timestamp), newest first. An admin
// can never see another admin's or the owner's rows.
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { ok, toErrorResponse } from "@/lib/http";

export async function GET(req: Request) {
  try {
    const admin = await requireRole("admin");
    requirePermission(admin, "activity");
    const sp = new URL(req.url).searchParams;
    const action = sp.get("action") || undefined;
    const limit = Math.min(Math.max(Number(sp.get("limit") ?? 50) || 50, 1), 100);
    const rows = await prisma.auditLog.findMany({
      where: { actorId: admin.id, ...(action ? { action } : {}) },
      include: { actor: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return ok({
      rows: rows.map((r) => ({
        id: r.id,
        actorId: r.actorId,
        actorName: r.actor.name,
        action: r.action,
        targetId: r.targetId,
        detail: r.detail,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
