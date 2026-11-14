// P0 Batch 3 (O14): the GLOBAL audit log — owner only. EVERY admin and
// owner action platform-wide, newest first, with actor / action /
// target / detail / timestamp. Filter by actor, action, or date. The log
// is APPEND-ONLY: there is no DELETE or PATCH endpoint for these rows
// anywhere, and this route is GET-only.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, toErrorResponse } from "@/lib/http";

export async function GET(req: Request) {
  try {
    await requireRole("owner");
    const sp = new URL(req.url).searchParams;
    const actorId = sp.get("actor") || undefined;
    const action = sp.get("action") || undefined;
    const from = sp.get("from");
    const to = sp.get("to");
    const limit = Math.min(Math.max(Number(sp.get("limit") ?? 100) || 100, 1), 200);
    const fromD = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? new Date(`${from}T00:00:00.000Z`) : undefined;
    const toD = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? new Date(`${to}T23:59:59.999Z`) : undefined;
    const rows = await prisma.auditLog.findMany({
      where: {
        ...(actorId ? { actorId } : {}),
        ...(action ? { action } : {}),
        createdAt: { gte: fromD, lte: toD },
      },
      include: { actor: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    const actions = await prisma.auditLog.groupBy({
      by: ["action"],
      _count: { action: true },
      orderBy: { action: "asc" },
    });
    const actors = await prisma.user.findMany({
      where: { role: { in: ["owner", "admin"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true },
    });
    return ok({
      rows: rows.map((r) => ({
        id: r.id,
        actorId: r.actorId,
        actorName: r.actor.name,
        actorRole: r.actor.role,
        action: r.action,
        targetId: r.targetId,
        detail: r.detail,
        createdAt: r.createdAt.toISOString(),
      })),
      actions: actions.map((a) => ({ action: a.action, count: a._count.action })),
      actors,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
