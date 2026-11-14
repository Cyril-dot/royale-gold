// P2 Batch 2 (O29): pause / resume a jackpot. A paused jackpot
// stops growing (the settle hook only feeds active jackpots); the pot
// keeps its value and can still be paid.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { AuthError } from "@/lib/errors";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireRole("owner");
    const { id } = await params;
    const j = await prisma.jackpot.findUnique({ where: { id } });
    if (!j) return fail("Jackpot not found", 404);
    const updated = await prisma.jackpot.update({ where: { id }, data: { active: !j.active } });
    await prisma.auditLog.create({
      data: {
        actorId: me.id, action: updated.active ? "jackpot.resume" : "jackpot.pause", targetId: j.id,
        detail: `Jackpot: ${updated.active ? "resumed" : "paused"} “${j.name}”`,
      },
    });
    return ok({ jackpot: { id: updated.id, name: updated.name, active: updated.active } });
  } catch (err) {
    if (err instanceof AuthError) return toErrorResponse(err);
    if (err instanceof Error) return fail(err.message, 400);
    return toErrorResponse(err);
  }
}
