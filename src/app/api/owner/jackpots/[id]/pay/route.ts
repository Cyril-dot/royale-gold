// P2 Batch 2 (O29): pay a jackpot — the current pot goes to the
// player the owner picked as a bonus credit (wallet credit +
// BalanceAdjustment kind "bonus" + AuditLog "jackpot.pay"), and the
// pot resets to the seed amount.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { AuthError } from "@/lib/errors";
import { round2, dec } from "@/lib/money";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireRole("owner");
    const { id } = await params;
    const body = await readJson<{ userId?: string; reason?: string }>(req);
    const userId = (body?.userId ?? "").trim();
    if (!userId) return fail("Pick the player to pay");
    const reason = (body?.reason ?? "").trim();
    if (reason.length > 300) return fail("Reason is too long (max 300 characters)");

    const result = await prisma.$transaction(async (tx) => {
      const j = await tx.jackpot.findUnique({ where: { id }, include: { pot: true } });
      if (!j) throw new Error("Jackpot not found");
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new Error("Player not found");
      if (user.role !== "user") throw new Error("The jackpot pays a player, not an admin or the owner");
      const pot = round2(dec(j.pot?.pot ?? j.currentPot));
      if (pot <= 0) throw new Error("The pot is empty — nothing to pay");
      const seed = round2(dec(j.seedAmount));
      const after = await tx.user.update({
        where: { id: userId },
        data: { cashBalance: round2(dec(user.cashBalance) + pot) },
      });
      await tx.balanceAdjustment.create({
        data: {
          userId, adminId: me.id, wallet: "cash", direction: "credit",
          amount: pot, reason: `Jackpot win: ${j.name}${reason ? ` — ${reason}` : ""}`, kind: "bonus",
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: me.id, action: "jackpot.pay", targetId: j.id,
          detail: `Jackpot: paid GH₵ ${pot.toFixed(2)} from “${j.name}” to ${user.name}${reason ? ` — ${reason}` : ""}. Pot reset to the GH₵ ${seed.toFixed(2)} seed.`,
        },
      });
      await tx.jackpotPot.upsert({
        where: { jackpotId: j.id },
        update: { pot: seed },
        create: { jackpotId: j.id, pot: seed },
      });
      await tx.jackpot.update({ where: { id: j.id }, data: { currentPot: seed } });
      return { jackpot: j, user, pot, seed, afterCash: dec(after.cashBalance) };
    });
    return ok({
      jackpot: { id: result.jackpot.id, name: result.jackpot.name, currentPot: result.seed },
      winner: { id: result.user.id, name: result.user.name, cash: result.afterCash },
      paid: result.pot,
    });
  } catch (err) {
    if (err instanceof AuthError) return toErrorResponse(err);
    if (err instanceof Error) return fail(err.message, 400);
    return toErrorResponse(err);
  }
}
