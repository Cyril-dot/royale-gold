// P2 Batch 2 (O33): enable / disable a brand. A brand is a config
// record only — toggling it changes nothing on any page, game or URL.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { AuthError } from "@/lib/errors";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireRole("owner");
    const { id } = await params;
    const brand = await prisma.brand.findUnique({ where: { id } });
    if (!brand) return fail("Brand not found", 404);
    const updated = await prisma.brand.update({ where: { id }, data: { active: !brand.active } });
    await prisma.auditLog.create({
      data: {
        actorId: me.id, action: updated.active ? "brand.enable" : "brand.disable", targetId: brand.id,
        detail: `Brand: ${updated.active ? "enabled" : "disabled"} “${brand.name}” — config record only, the live site is unchanged`,
      },
    });
    return ok({ brand: { id: updated.id, name: updated.name, active: updated.active } });
  } catch (err) {
    if (err instanceof AuthError) return toErrorResponse(err);
    if (err instanceof Error) return fail(err.message, 400);
    return toErrorResponse(err);
  }
}
