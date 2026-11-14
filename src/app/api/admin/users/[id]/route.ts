import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { dec } from "@/lib/money";
import { getGame } from "@/lib/games";
import { playerCommission } from "@/lib/commission";
import { latestKycStatus } from "@/lib/kyc";
import { adminScopeAdminIds } from "@/lib/hierarchy";

/**
 * User detail for the admin panel: profile, joined date, code used,
 * referring admin, full deposit history, totals, coins given.
 * An admin may only view users they referred; the owner may view anyone.
 *
 * P0 Batch 4 (A3): player 360 — the same response now also carries the
 * player's bet/round history (GameResult, newest first), their KYC
 * status (the latest KycSubmission — P1 Batch 2 A21 replaced the old
 * "not_submitted" placeholder with the real status), the commission
 * earned for the viewing admin (recomputed by the rules engine; the
 * commission page is the source of truth), and their support tickets.
 *
 * P1 Batch 1 (A19/A20): the same response also carries the admin-only
 * notes and tags on this player, and the per-player limits in force.
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
    // P1 Batch 4 (O24): a parent admin may also view players in their
    // child admins' downlines — read-only (the detail page hides the
    // action sections and shows a "read-only" note).
    const readOnly =
      me.role === "admin" && user.referredByAdminId !== null && user.referredByAdminId !== me.id;
    if (me.role === "admin") {
      const scopeIds = await adminScopeAdminIds(me.id);
      if (!user.referredByAdminId || !scopeIds.includes(user.referredByAdminId)) {
        return fail("This user was not referred by you", 404);
      }
    }
    const [deposits, redemptions, rounds, tickets, notes, tags, limit, kyc] = await Promise.all([
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
      // P1 Batch 1 (A19): admin-only notes + tags (the player never sees them).
      prisma.playerNote.findMany({
        where: { userId: id },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { admin: { select: { id: true, name: true } } },
      }),
      prisma.playerTag.findMany({
        where: { userId: id },
        orderBy: { createdAt: "asc" },
        select: { tag: true },
      }),
      // P1 Batch 1 (A20): per-player limits in force.
      prisma.playerLimit.findUnique({ where: { userId: id } }),
      // P1 Batch 2 (A21): the real KYC status — the latest submission wins.
      latestKycStatus(id),
    ]);
    const totalDeposited = deposits.reduce((s, d) => s + dec(d.amount), 0);
    const totalCommission = deposits.reduce((s, d) => s + dec(d.commission), 0);
    // P0 Batch 4 (A3): commission earned on this player, recomputed by
    // the rules engine for the viewing admin. For the owner it is the
    // referring admin's commission; a player with no referring admin
    // earns nobody anything.
    // P1 Batch 4 (O24): for a child-downline player the commission is
    // the REFERRING (child) admin's — that is the figure that feeds the
    // parent's rollup. For an own-downline player that IS the viewer.
    const commissionAdminId = user.referredByAdminId;
    const commission = commissionAdminId
      ? await playerCommission(commissionAdminId, id)
      : { total: 0, model: "none" as const, rate: 0 };
    return ok({
      // P1 Batch 4 (O24): readOnly — the player is in a child admin's
      // downline, so the detail page hides the action sections.
      readOnly,
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
      // earned, and support tickets. P1 Batch 2 (A21): the KYC status
      // is the real one now — the latest submission, with its document
      // type, submitted date and rejection reason.
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
      kycStatus: kyc.status,
      kycDocumentType: kyc.documentType,
      kycDocumentUrl: kyc.documentUrl,
      kycSubmittedAt: kyc.submittedAt,
      kycRejectionReason: kyc.rejectionReason,
      commission,
      tickets: tickets.map((t) => ({
        id: t.id,
        subject: t.subject,
        status: t.status,
        createdAt: t.createdAt.toISOString(),
      })),
      // P1 Batch 1 (A19/A20): admin-only notes + tags, and the
      // per-player limits in force (null = no limits set).
      notes: notes.map((n) => ({
        id: n.id,
        text: n.text,
        authorId: n.adminId,
        authorName: n.admin.name,
        createdAt: n.createdAt.toISOString(),
      })),
      tags: tags.map((t) => t.tag),
      limits: limit
        ? {
            maxStake: limit.maxStake == null ? null : dec(limit.maxStake),
            maxDepositPerDay: limit.maxDepositPerDay == null ? null : dec(limit.maxDepositPerDay),
            maxLossPerDay: limit.maxLossPerDay == null ? null : dec(limit.maxLossPerDay),
            coolOffUntil: limit.coolOffUntil?.toISOString() ?? null,
          }
        : null,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
