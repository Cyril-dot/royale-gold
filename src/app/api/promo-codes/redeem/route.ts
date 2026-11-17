// P1 Batch 1 (A18): redeem a promo code. Any signed-in player can
// redeem any admin's code (unlike referral codes, which are one per
// user ever). One redemption per user per code; expired or fully-used
// codes are rejected with a plain message. The credit, the
// BalanceAdjustment (kind "promo", so the ledger names it a promo
// credit), the PromoRedemption row and the AuditLog row
// ("promo.redeem") land in one atomic transaction.
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { dec, round2 } from "@/lib/money";
import { normalizeCode } from "@/lib/serialize";
import { symbolFor } from "@/lib/country";

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await readJson<{ code?: string }>(req);
    if (!body?.code) return fail("code is required");
    const code = normalizeCode(body.code);

    const promo = await prisma.promoCode.findUnique({
      where: { code },
      include: { redemptions: { where: { userId: user.id } } },
    });
    if (!promo) return fail("Invalid promo code", 400);
    if (promo.expiresAt && promo.expiresAt.getTime() < Date.now()) return fail("This promo code has expired", 400);
    if (promo.uses >= promo.maxUses) return fail("This promo code has been fully used", 400);
    if (promo.redemptions.length > 0) return fail("You have already redeemed this promo code", 409);

    const result = await prisma.$transaction(async (tx) => {
      const fresh = await tx.promoCode.findUnique({ where: { id: promo.id } });
      if (!fresh || fresh.uses >= fresh.maxUses) throw new Error("This promo code has been fully used");
      await tx.promoCode.update({ where: { id: promo.id }, data: { uses: { increment: 1 } } });
      await tx.promoRedemption.create({ data: { promoCodeId: promo.id, userId: user.id } });
      const me = await tx.user.findUnique({ where: { id: user.id } });
      if (!me) throw new Error("Account not found");
      const amount = dec(promo.bonusAmount);
      const updated =
        promo.bonusCurrency === "cash"
          ? await tx.user.update({ where: { id: user.id }, data: { cashBalance: round2(dec(me.cashBalance) + amount) } })
          : await tx.user.update({ where: { id: user.id }, data: { coins: me.coins + amount } });
      await tx.balanceAdjustment.create({
        data: {
          userId: user.id, adminId: promo.createdByAdminId, wallet: promo.bonusCurrency,
          direction: "credit", amount: round2(amount), reason: `Promo code ${promo.code}`, kind: "promo",
          // Phase 1 country-based (Nov 2026): the redeemer's fiat.
          fiatCurrency: me.currency ?? "GHS",
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id, action: "promo.redeem", targetId: promo.id,
          detail: `${me.name} redeemed promo code ${promo.code} — +${promo.bonusCurrency === "cash" ? `${symbolFor(me.currency)} ${amount.toFixed(2)}` : `${amount} coins`}`,
        },
      });
      return updated;
    });

    return ok({
      code,
      bonusAmount: dec(promo.bonusAmount),
      bonusCurrency: promo.bonusCurrency,
      balances: { cash: dec(result.cashBalance), coins: result.coins },
    });
  } catch (err) {
    if (err instanceof Error) return fail(err.message, 400);
    return toErrorResponse(err);
  }
}
