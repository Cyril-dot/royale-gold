// P1 Batch 2 (A23): send one in-app notification to one of the
// admin's own players. In-app only — no email, SMS or push (no
// messaging infra exists). The player sees it on their account page.
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireRole("admin");
    requirePermission(admin, "players");
    const { id } = await params;
    const body = await readJson<{ title?: string; body?: string }>(req);
    if (!body) return fail("Invalid JSON body");
    const title = (body.title ?? "").trim();
    const text = (body.body ?? "").trim();
    if (title.length < 2 || title.length > 120) return fail("Title must be 2–120 characters");
    if (text.length < 2 || text.length > 2000) return fail("Message must be 2–2000 characters");
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return fail("User not found", 404);
    if (target.referredByAdminId !== admin.id) return fail("This user was not referred by you", 404);
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.notification.create({
        data: { userId: id, adminId: admin.id, title, body: text },
      });
      await tx.auditLog.create({
        data: {
          actorId: admin.id, action: "notification.send", targetId: id,
          detail: `Notification: sent "${title}" to ${target.name}`,
        },
      });
      return created;
    });
    return ok({
      notification: { id: row.id, title: row.title, body: row.body, createdAt: row.createdAt.toISOString() },
    }, 201);
  } catch (err) {
    return toErrorResponse(err);
  }
}
