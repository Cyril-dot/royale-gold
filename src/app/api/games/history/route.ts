import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, toErrorResponse } from "@/lib/http";
import { dec } from "@/lib/money";

/** Recent game results for the session user (newest first, max 50). */
export async function GET(req: Request) {
  try {
    const user = await requireAuth();
    const limit = Math.min(Math.max(Number(new URL(req.url).searchParams.get("limit") ?? 50) || 50, 1), 100);
    const rows = await prisma.gameResult.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return ok({
      history: rows.map((r) => ({
        id: r.id,
        game: r.game,
        currency: r.currency,
        stake: dec(r.stake),
        payout: dec(r.payout),
        result: r.result,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
