// P1 Batch 1 (A16): game & bet history lookup — look up ANY round by
// its id, or a player's rounds in a date range. An admin sees only
// their own players' rounds; the owner sees all (or one admin's in
// preview, ?adminId=). The round carries the full stored result JSON,
// so the admin sees exactly what the settle recorded.
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { dec } from "@/lib/money";
import { getGame } from "@/lib/games";

function serializeRound(r: {
  id: string;
  userId: string;
  game: string;
  currency: string;
  fiatCurrency?: string | null;
  stake: unknown;
  payout: unknown;
  result: unknown;
  createdAt: Date;
}, user: { id: string; name: string; email: string | null; phone: string | null }) {
  const stake = dec(r.stake as never);
  const payout = dec(r.payout as never);
  return {
    id: r.id,
    userId: r.userId,
    userName: user.name,
    userContact: user.email ?? user.phone ?? null,
    game: r.game,
    gameName: getGame(r.game)?.name ?? r.game,
    currency: r.currency,
    // Phase 1 country-based (Nov 2026): the fiat this round was played in.
    fiatCurrency: r.fiatCurrency ?? "GHS",
    stake,
    payout,
    net: payout - stake,
    result: r.result,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function GET(req: Request) {
  try {
    const me = await requireRole("admin", "owner");
    const sp = new URL(req.url).searchParams;
    const scopeAdminId = me.role === "admin" ? me.id : sp.get("adminId") || undefined;
    if (me.role === "admin") requirePermission(me, "lookup");
    const roundId = sp.get("roundId");
    const userId = sp.get("userId");

    if (roundId) {
      const r = await prisma.gameResult.findUnique({
        where: { id: roundId },
        include: { user: { select: { id: true, name: true, email: true, phone: true, referredByAdminId: true } } },
      });
      if (!r) return fail("Round not found", 404);
      if (me.role === "admin" && r.user.referredByAdminId !== me.id) return fail("Round not found", 404);
      if (me.role === "owner" && scopeAdminId && r.user.referredByAdminId !== scopeAdminId) return fail("Round not found", 404);
      return ok({ round: serializeRound(r, r.user) });
    }

    if (userId) {
      const player = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, phone: true, referredByAdminId: true },
      });
      if (!player) return fail("Player not found", 404);
      if (me.role === "admin" && player.referredByAdminId !== me.id) return fail("Player not found", 404);
      if (me.role === "owner" && scopeAdminId && player.referredByAdminId !== scopeAdminId) return fail("Player not found", 404);
      const fromStr = sp.get("from");
      const toStr = sp.get("to");
      const from = fromStr ? new Date(fromStr + "T00:00:00Z") : undefined;
      const to = toStr ? new Date(new Date(toStr + "T00:00:00Z").getTime() + 24 * 60 * 60 * 1000) : undefined;
      if ((fromStr && Number.isNaN(from?.getTime())) || (toStr && Number.isNaN(to?.getTime()))) {
        return fail("Dates must be YYYY-MM-DD");
      }
      const rounds = await prisma.gameResult.findMany({
        where: {
          userId,
          ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return ok({
        player: { id: player.id, name: player.name, email: player.email, phone: player.phone },
        rounds: rounds.map((r) => serializeRound(r, player)),
      });
    }

    return fail("roundId or userId is required");
  } catch (err) {
    return toErrorResponse(err);
  }
}
