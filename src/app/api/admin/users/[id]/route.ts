import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { dec } from "@/lib/money";
import { getGame } from "@/lib/games";
import { playerCommission } from "@/lib/commission";

/**
 * User detail for the admin panel: profile, joined date, code used,
 * referring admin, full deposit history, totals, coins given.
 * An admin may only view users they referred; the owner may view anyone.
 *
 * P0 Batch 4 (A3): player 360 — the same response now also carries the
 * player's bet/round history (GameResult, newest first), their KYC
 * status (there is no KYC model yet — always "not_submitted"; the KYC
 * review queue is P1 A21), the commission earned for the viewing admin
 * (recomputed by the rules engine; the commission page is the source of
 * truth), and their support tickets.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireRole("admin", "owner");
    if (me.role === "admin") requirePermission(me, "players");
    const { id } = await params;
    const user = await prisma.user.findUnique({
      where: { id },
      include: { referredByAdmin: { select: { id: true, name: true, email: true } } },
    });
    if (!user) return fail("User not found", 404);
    if (me.role === "admin" && user.referredByAdminId !== me.id) {
      return fail("This user was not referred by you", 404);
    }
    const [deposits, redemptions, rounds, tickets] = await Promise.all([
      prisma.depositEvent.findMany({
        where: { userId: id },
        orderBy: { createdAt: "desc" },
      }),
      prisma.redemption.findMany({ where: { userId: id } }),
      prisma.gameResult.findMany({
        where: { userId: id },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.ticket.findMany({
        where: { userId: id },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, subject: true, status: true, createdAt: true },
      }),
    ]);
    const totalDeposited = deposits.reduce((s, d) => s + dec(d.amount), 0);
    const totalCommission = deposits.reduce((s, d) => s + dec(d.commission), 0);
    // P0 Batch 4 (A3): commission earned on this player, recomputed by
    // the rules engine for the viewing admin. For the owner it is the
    // referring admin's commission; a player with no referring admin
    // earns nobody anything.
    const commissionAdminId = me.role === "admin" ? me.id : user.referredByAdminId;
    const commission = commissionAdminId
      ? await playerCommission(commissionAdminId, id)
      : { total: 0, model: "none" as const, rate: 0 };
    return ok({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        cash: dec(user.cashBalance),
        coins: user.coins,
        joinedAt: user.createdAt.toISOString(),
        referralCodeUsed: user.referralCodeUsed,
        referringAdmin: user.referredByAdmin,
        // P0 Batch 1 (A8): block state, shown on the player detail page.
        blockedAt: user.blockedAt?.toISOString() ?? null,
        blockedReason: user.blockedReason,
      },
      deposits: deposits.map((d) => ({
        id: d.id,
        amount: dec(d.amount),
        method: d.method,
        pctInForce: dec(d.pctInForce),
        commission: dec(d.commission),
        createdAt: d.createdAt.toISOString(),
      })),
      totals: {
        deposits: deposits.length,
        totalDeposited,
        totalCommission,
        coinsGiven: redemptions.reduce((s, r) => s + r.coins, 0),
      },
      // P0 Batch 4 (A3): bet/round history, KYC status, commission
      // earned, and support tickets.
      rounds: rounds.map((r) => ({
        id: r.id,
        game: r.game,
        gameName: getGame(r.game)?.name ?? r.game,
        currency: r.currency,
        stake: dec(r.stake),
        payout: dec(r.payout),
        net: dec(r.payout) - dec(r.stake),
        createdAt: r.createdAt.toISOString(),
      })),
      kycStatus: "not_submitted",
      commission,
      tickets: tickets.map((t) => ({
        id: t.id,
        subject: t.subject,
        status: t.status,
        createdAt: t.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
