// P1 Batch 4 (O24): set or clear an admin's PARENT admin (a senior
// agent). The parent sees the child's downline as a read-only rollup
// on their Overview / Commission / Players pages. A parent cannot be
// their own child, and cycles are rejected. Owner only.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { wouldCreateCycle } from "@/lib/hierarchy";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const owner = await requireRole("owner");
    const { id } = await params;
    const body = await readJson<{ parentAdminId?: string | null }>(req);
    if (!body) return fail("Invalid JSON body");
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target || target.role !== "admin") return fail("Admin not found", 404);
    const parentAdminId = body.parentAdminId ?? null;
    let parentName: string | null = null;
    if (parentAdminId) {
      if (parentAdminId === id) return fail("An admin cannot be their own parent");
      const parent = await prisma.user.findUnique({ where: { id: parentAdminId } });
      if (!parent || parent.role !== "admin") return fail("Parent admin not found", 404);
      if (await wouldCreateCycle(id, parentAdminId)) {
        return fail("That would create a cycle in the agent hierarchy");
      }
      parentName = parent.name;
    }
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({ where: { id }, data: { parentAdminId } });
      await tx.auditLog.create({
        data: {
          actorId: owner.id,
          action: "admin.parent.set",
          targetId: id,
          detail: parentAdminId
            ? `Set ${target.name}'s parent admin to ${parentName}`
            : `Cleared ${target.name}'s parent admin`,
        },
      });
      return u;
    });
    return ok({
      admin: { id: updated.id, parentAdminId: updated.parentAdminId, parentName },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
