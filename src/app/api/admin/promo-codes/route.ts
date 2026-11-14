// P1 Batch 1 (A18): promo codes — an admin's bonus offer any player
// can redeem (unlike referral codes, which are one per user and tie the
// player to the admin). GET lists the admin's codes with uses left and
// who redeemed them; POST creates one. An owner previews one admin's
// codes with ?adminId=.
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { dec, round2 } from "@/lib/money";
import { normalizeCode, randomCode } from "@/lib/serialize";

export async function GET(req: Request) {
  try {
    const me = await requireRole("admin", "owner");
    const sp = new URL(req.url).searchParams;
    const adminId = me.role === "admin" ? me.id : sp.get("adminId") || undefined;
    if (me.role === "admin") requirePermission(me, "referrals");
    if (me.role === "owner" && !adminId) return fail("adminId is required");
    if (!adminId) return fail("adminId is required");
    const codes = await prisma.promoCode.findMany({
      where: { createdByAdminId: adminId },
      orderBy: { createdAt: "desc" },
      include: {
        redemptions: {
          include: { user: { select: { id: true, name: true, email: true, phone: true } } },
          orderBy: { redeemedAt: "desc" },
          take: 20,
        },
      },
    });
    const now = Date.now();
    return ok({
      codes: codes.map((c) => ({
        id: c.id,
        code: c.code,
        bonusAmount: dec(c.bonusAmount),
        bonusCurrency: c.bonusCurrency,
        maxUses: c.maxUses,
        uses: c.uses,
        usesLeft: Math.max(0, c.maxUses - c.uses),
        expired: !!c.expiresAt && c.expiresAt.getTime() < now,
        expiresAt: c.expiresAt?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
        redemptions: c.redemptions.map((r) => ({
          userId: r.userId,
          userName: r.user.name,
          userContact: r.user.email ?? r.user.phone ?? null,
          redeemedAt: r.redeemedAt.toISOString(),
        })),
      })),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireRole("admin");
    requirePermission(admin, "referrals");
    const body = await readJson<{ code?: string; bonusAmount?: number; bonusCurrency?: string; maxUses?: number; expiresAt?: string }>(req);
    if (!body) return fail("Invalid JSON body");
    const code = normalizeCode(body.code || randomCode());
    if (code.length < 3 || code.length > 20) return fail("Code must be 3–20 characters");
    const bonusAmount = Number(body.bonusAmount);
    if (!Number.isFinite(bonusAmount) || bonusAmount <= 0) return fail("Bonus amount must be > 0");
    const bonusCurrency = body.bonusCurrency;
    if (bonusCurrency !== "cash" && bonusCurrency !== "coins") return fail("bonusCurrency must be cash or coins");
    if (bonusCurrency === "coins" && !Number.isInteger(bonusAmount)) return fail("Coin bonuses must be whole coins");
    const maxUses = Number(body.maxUses);
    if (!Number.isInteger(maxUses) || maxUses < 1) return fail("Max uses must be a whole number of 1 or more");
    const expiresAt = (body.expiresAt ?? "").trim();
    if (expiresAt && Number.isNaN(new Date(expiresAt + "T00:00:00Z").getTime())) {
      return fail("Expiry must be a date (YYYY-MM-DD)");
    }
    const existing = await prisma.promoCode.findUnique({ where: { code } });
    if (existing) return fail("That promo code already exists", 409);

    const created = await prisma.$transaction(async (tx) => {
      const promo = await tx.promoCode.create({
        data: {
          code,
          bonusAmount: round2(bonusAmount),
          bonusCurrency,
          maxUses,
          expiresAt: expiresAt ? new Date(expiresAt + "T00:00:00Z") : null,
          createdByAdminId: admin.id,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: admin.id, action: "promo.create", targetId: promo.id,
          detail: `Promo code ${code} created — ${bonusCurrency === "cash" ? `GH₵ ${round2(bonusAmount).toFixed(2)}` : `${bonusAmount} coins`}, ${maxUses} uses${expiresAt ? `, expires ${expiresAt}` : ""}`,
        },
      });
      return promo;
    });

    return ok({
      code: {
        id: created.id,
        code: created.code,
        bonusAmount: dec(created.bonusAmount),
        bonusCurrency: created.bonusCurrency,
        maxUses: created.maxUses,
        uses: 0,
        usesLeft: created.maxUses,
        expired: false,
        expiresAt: created.expiresAt?.toISOString() ?? null,
        createdAt: created.createdAt.toISOString(),
      },
    }, 201);
  } catch (err) {
    if (err instanceof Error) return fail(err.message, 400);
    return toErrorResponse(err);
  }
}
