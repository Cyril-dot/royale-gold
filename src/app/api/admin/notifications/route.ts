// P1 Batch 2 (A23): broadcast — one in-app notification to ALL of the
// admin's own players at once (one row per player, in one transaction).
// The form lives on the admin Overview page; the sent list below shows
// what went out. In-app only — no email, SMS or push.
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";

/** The admin's recently sent notifications (newest first). */
export async function GET(req: Request) {
  try {
    const admin = await requireRole("admin");
    requirePermission(admin, "overview");
    const sp = new URL(req.url).searchParams;
    const limit = Math.min(Math.max(Number(sp.get("limit") ?? 10) || 10, 1), 50);
    const rows = await prisma.notification.findMany({
      where: { adminId: admin.id },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return ok({
      sent: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        userName: r.user.name,
        title: r.title,
        body: r.body,
        readAt: r.readAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireRole("admin");
    requirePermission(admin, "overview");
    const body = await readJson<{ title?: string; body?: string }>(req);
    if (!body) return fail("Invalid JSON body");
    const title = (body.title ?? "").trim();
    const text = (body.body ?? "").trim();
    if (title.length < 2 || title.length > 120) return fail("Title must be 2–120 characters");
    if (text.length < 2 || text.length > 2000) return fail("Message must be 2–2000 characters");
    const players = await prisma.user.findMany({
      where: { referredByAdminId: admin.id, active: true },
      select: { id: true, name: true },
    });
    if (players.length === 0) return fail("You have no players to notify", 400);
    const sent = await prisma.$transaction(async (tx) => {
      await tx.notification.createMany({
        data: players.map((p) => ({ userId: p.id, adminId: admin.id, title, body: text })),
      });
      await tx.auditLog.create({
        data: {
          actorId: admin.id, action: "notification.send", targetId: null,
          detail: `Notification: broadcast "${title}" to ${players.length} players`,
        },
      });
      return players.length;
    });
    return ok({ sent }, 201);
  } catch (err) {
    return toErrorResponse(err);
  }
}
