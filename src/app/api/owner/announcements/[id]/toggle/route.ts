// P1 Batch 4 (O20): toggle an announcement active / inactive.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, toErrorResponse } from "@/lib/http";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const owner = await requireRole("owner");
    const { id } = await params;
    const a = await prisma.announcement.findUnique({ where: { id } });
    if (!a) return fail("Announcement not found", 404);
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.announcement.update({ where: { id }, data: { active: !a.active } });
      await tx.auditLog.create({
        data: {
          actorId: owner.id,
          action: "announcement.toggle",
          targetId: id,
          detail: `${u.active ? "Activated" : "Deactivated"} announcement "${a.title}"`,
        },
      });
      return u;
    });
    return ok({ announcement: { id: updated.id, active: updated.active } });
  } catch (err) {
    return toErrorResponse(err);
  }
}
