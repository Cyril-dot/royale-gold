import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { normalizeCode } from "@/lib/serialize";

/**
 * Redeem a referral code after registration. One code per user, ever —
 * enforced by the unique Redemption.userId constraint. Exactly 5 coins.
 */
export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await readJson<{ code?: string }>(req);
    if (!body?.code) return fail("code is required");
    const code = normalizeCode(body.code);

    const codeRow = await prisma.referralCode.findUnique({ where: { code } });
    if (!codeRow || !codeRow.active) return fail("Invalid referral code", 400);

    const existing = await prisma.redemption.findUnique({ where: { userId: user.id } });
    if (existing) return fail("You have already redeemed a referral code", 409);

    const updated = await prisma.$transaction(async (tx) => {
      await tx.redemption.create({ data: { userId: user.id, codeId: codeRow.id, coins: 5 } });
      return tx.user.update({
        where: { id: user.id },
        data: { coins: { increment: 5 }, referredByAdminId: codeRow.adminId, referralCodeUsed: code },
      });
    });
    return ok({ coins: updated.coins, redeemedCode: code, bonusCoins: 5 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
