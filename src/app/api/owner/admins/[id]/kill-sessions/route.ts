// P0 Batch 3 (O15): "Kill all sessions" for one admin. Bumps their
// session version, so every JWT they hold stops working at once — their
// next request fails getSessionUser and they must sign in again. The
// owner cannot kill their own sessions this way (use the login page's
// sign-out); the route 403s for the root account.
import { killSessions, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, toErrorResponse } from "@/lib/http";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const owner = await requireRole("owner");
    const { id } = await params;
    const admin = await prisma.user.findUnique({ where: { id } });
    if (!admin || admin.role !== "admin") return fail("Admin not found", 404);
    if (admin.id === owner.id) return fail("The owner account's sessions cannot be killed from the panel", 403);
    const version = await killSessions(admin.id);
    await prisma.auditLog.create({
      data: {
        actorId: owner.id,
        action: "admin.kill_sessions",
        targetId: admin.id,
        detail: `Killed all sessions for ${admin.name} (session version ${version})`,
      },
    });
    return ok({ adminId: admin.id, sessionVersion: version });
  } catch (err) {
    return toErrorResponse(err);
  }
}
