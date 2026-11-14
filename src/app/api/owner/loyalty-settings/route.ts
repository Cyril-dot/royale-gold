// P2 Batch 2 (O28): the loyalty settings — the points rule (points
// per GH₵ staked, a READ-ONLY display rule — a player's points are
// computed live from their total staked, there is no points ledger)
// and the birthday bonus (GH₵ credited as a bonus on a player's
// birthday, paid once per year by the owner's manual button — there
// is NO cron). The tier-upgrade rule lives with the VIP tiers (A26)
// and is shown on the page, not re-implemented here.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { AuthError } from "@/lib/errors";
import { getLoyaltySettings, birthdaysToday, pointsFor } from "@/lib/loyalty";
import { getVipTiers, totalsDeposited, tierFor } from "@/lib/vip";
import { round2 } from "@/lib/money";

export async function GET() {
  try {
    const me = await requireRole("owner");
    const [settings, tiers, todays] = await Promise.all([
      getLoyaltySettings(),
      getVipTiers(me.id),
      birthdaysToday(),
    ]);
    // A sample of players with their live points, so the owner can see
    // the rule in action (the 10 most recent players).
    const users = await prisma.user.findMany({
      where: { role: "user" },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, name: true },
    });
    const totals = await totalsDeposited(users.map((u) => u.id));
    const points = await Promise.all(users.map((u) => pointsFor(u.id, settings.pointsPerGhs)));
    return ok({
      settings,
      tiers: tiers.map((t) => ({ id: t.id, name: t.name, minDeposited: t.minDeposited, perks: t.perks })),
      birthdaysToday: todays,
      players: users.map((u, i) => {
        const total = totals.get(u.id) ?? 0;
        const tier = tierFor(total, tiers);
        return {
          id: u.id,
          name: u.name,
          totalDeposited: total,
          totalStaked: points[i].totalStaked,
          points: points[i].points,
          tier: tier ? tier.name : null,
        };
      }),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireRole("owner");
    const body = await readJson<{ pointsPerGhs?: number; birthdayBonus?: number }>(req);
    const pointsPerGhs = Number(body?.pointsPerGhs);
    const birthdayBonus = Number(body?.birthdayBonus);
    if (!Number.isFinite(pointsPerGhs) || pointsPerGhs < 0 || pointsPerGhs > 100) {
      return fail("Points per GH₵ must be between 0 and 100");
    }
    if (!Number.isFinite(birthdayBonus) || birthdayBonus < 0 || birthdayBonus > 10000) {
      return fail("Birthday bonus must be between GH₵ 0 and GH₵ 10,000");
    }
    const saved = await prisma.loyaltySettings.upsert({
      where: { id: "global" },
      update: { pointsPerGhs: round2(pointsPerGhs), birthdayBonus: round2(birthdayBonus) },
      create: { id: "global", pointsPerGhs: round2(pointsPerGhs), birthdayBonus: round2(birthdayBonus) },
    });
    await prisma.auditLog.create({
      data: {
        actorId: me.id, action: "loyalty.settings",
        detail: `Loyalty settings: ${round2(pointsPerGhs)} points per GH₵ staked, birthday bonus GH₵ ${round2(birthdayBonus).toFixed(2)}`,
      },
    });
    return ok({
      settings: { pointsPerGhs: round2(Number(saved.pointsPerGhs)), birthdayBonus: round2(Number(saved.birthdayBonus)) },
    });
  } catch (err) {
    if (err instanceof AuthError) return toErrorResponse(err);
    if (err instanceof Error) return fail(err.message, 400);
    return toErrorResponse(err);
  }
}
