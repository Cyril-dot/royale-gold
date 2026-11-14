// P1 Batch 1 (A16): the most recent issued crash rounds, so the admin
// can pick one and verify it without knowing its roundId. The seed is
// never listed here — verification reveals it only for finished rounds.
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { ok, toErrorResponse } from "@/lib/http";
import { dec } from "@/lib/money";
import { CRASH_GROWTH } from "@/lib/crash";

export async function GET() {
  try {
    const me = await requireRole("admin", "owner");
    if (me.role === "admin") requirePermission(me, "lookup");
    const rows = await prisma.crashRound.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { roundId: true, hash: true, crashPoint: true, createdAt: true },
    });
    const now = Date.now();
    return ok({
      rounds: rows.map((r) => {
        const point = dec(r.crashPoint);
        return {
          roundId: r.roundId,
          hash: r.hash,
          crashPoint: point,
          createdAt: r.createdAt.toISOString(),
          finished: now >= r.createdAt.getTime() + 6000 + Math.log(Math.max(1, point)) / CRASH_GROWTH,
        };
      }),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
