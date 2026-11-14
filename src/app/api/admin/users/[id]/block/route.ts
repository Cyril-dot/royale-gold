// P0 Batch 1 (A8): an admin blocks or unblocks one of their own players.
// Blocking suspends betting and depositing immediately (enforced in
// /api/games/settle via lib/settle.ts, in /api/games/play, and in
// /api/wallet/deposit). Blocking needs a reason; unblocking does not.
// The action is written to the audit log.
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireRole("admin");
    requirePermission(admin, "players");
    const { id } = await params;
    const body = await readJson<{ blocked?: boolean; reason?: string }>(req);
    if (!body) return fail("Invalid JSON body");
    if (typeof body.blocked !== "boolean") return fail("blocked must be true or false");
    const reason = (body.reason ?? "").trim();
    if (body.blocked && reason.length < 3) return fail("A reason is required to block a player");

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return fail("User not found", 404);
    if (target.referredByAdminId !== admin.id) return fail("This user was not referred by you", 404);

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id },
        data: {
          blockedAt: body.blocked ? new Date() : null,
          blockedReason: body.blocked ? reason : null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: admin.id, action: body.blocked ? "user.block" : "user.unblock", targetId: id,
          detail: `${body.blocked ? "Blocked" : "Unblocked"} ${target.name}${body.blocked ? ` — ${reason}` : ""}`,
        },
      });
      return u;
    });

    return ok({
      user: {
        id: updated.id,
        blockedAt: updated.blockedAt?.toISOString() ?? null,
        blockedReason: updated.blockedReason,
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
