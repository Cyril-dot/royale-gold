// P0 Batch 2 (O11): the global kill switch — stops ALL play at once.
// Body: { killed: boolean }. Logged to the AuditLog either way.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";

export async function POST(req: Request) {
  try {
    const owner = await requireRole("owner");
    const body = await readJson<{ killed?: boolean }>(req);
    if (!body || typeof body.killed !== "boolean") return fail("killed must be true or false");
    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.platformSettings.upsert({
        where: { id: "global" },
        create: { id: "global", globalKill: body.killed },
        update: { globalKill: body.killed },
      });
      await tx.auditLog.create({
        data: {
          actorId: owner.id,
          action: body.killed ? "platform.kill" : "platform.unkill",
          targetId: "global",
          detail: body.killed ? "Owner paused ALL games (global kill switch)" : "Owner resumed all games",
        },
      });
      return updated;
    });
    return ok({ globalKill: row.globalKill });
  } catch (err) {
    return toErrorResponse(err);
  }
}
