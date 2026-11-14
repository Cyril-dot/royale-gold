// P2 Batch 1 (A29): "Take a break" — the player sets their OWN
// cool-off for 24 hours, 7 days or 30 days, no admin needed. The
// cool-off is only ever EXTENDED, never shortened: a break cannot cut
// short an admin-set cool-off, and a self-excluded player cannot use
// it at all (they are already excluded — the account page shows the
// exclusion instead). Writes PlayerLimit.coolOffUntil + an AuditLog
// "player.break" row, so the admin can see who took a break.
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { AuthError } from "@/lib/errors";

const BREAK_DAYS = [1, 7, 30] as const;

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await readJson<{ days?: number }>(req);
    if (!body) return fail("Invalid JSON body");
    const days = Number(body.days);
    if (!BREAK_DAYS.includes(days as (typeof BREAK_DAYS)[number])) {
      return fail("Pick a break of 24 hours, 7 days or 30 days");
    }
    const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const saved = await prisma.$transaction(async (tx) => {
      const existing = await tx.playerLimit.findUnique({ where: { userId: user.id } });
      if (existing?.selfExcludedUntil && existing.selfExcludedUntil.getTime() > Date.now()) {
        throw new Error(
          `You are self-excluded until ${existing.selfExcludedUntil.toLocaleDateString("en-GB")} — a break cannot change that`,
        );
      }
      // Only ever extend: an admin-set cool-off that runs longer stays,
      // and a shorter break writes nothing at all (no audit noise for
      // a tap that changed nothing).
      const current = existing?.coolOffUntil?.getTime() ?? 0;
      if (until.getTime() <= current) {
        return { row: existing, extended: false };
      }
      const row = await tx.playerLimit.upsert({
        where: { userId: user.id },
        create: { userId: user.id, coolOffUntil: until, updatedBy: user.id },
        update: { coolOffUntil: until, updatedBy: user.id },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id, action: "player.break", targetId: user.id,
          detail: `Take a break: ${user.name} set a ${days === 1 ? "24-hour" : `${days}-day`} cool-off until ${until.toISOString().slice(0, 10)}`,
        },
      });
      return { row, extended: true };
    });
    return ok({
      break: {
        days,
        coolOffUntil: saved.row?.coolOffUntil?.toISOString() ?? null,
        extended: saved.extended,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) return toErrorResponse(err);
    if (err instanceof Error) return fail(err.message, 400);
    return toErrorResponse(err);
  }
}
