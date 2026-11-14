// P0 Batch 1 (A7): an admin credits or debits one of their own players'
// cash or coin balance. The reason is MANDATORY. The balance change, the
// BalanceAdjustment row and the AuditLog row are written in one atomic
// transaction, so the ledger (A6) and the audit trail always agree.
// A debit can never take a balance below zero. Blocked players can still
// be adjusted (an admin may need to correct a blocked account).
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { dec, round2 } from "@/lib/money";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireRole("admin");
    requirePermission(admin, "players");
    const { id } = await params;
    const body = await readJson<{ wallet?: string; direction?: string; amount?: number; reason?: string }>(req);
    if (!body) return fail("Invalid JSON body");
    const wallet = body.wallet;
    if (wallet !== "cash" && wallet !== "coins") return fail("wallet must be cash or coins");
    const direction = body.direction;
    if (direction !== "credit" && direction !== "debit") return fail("direction must be credit or debit");
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) return fail("Amount must be > 0");
    if (wallet === "coins" && !Number.isInteger(amount)) return fail("Coin adjustments must be whole coins");
    const reason = (body.reason ?? "").trim();
    if (reason.length < 3) return fail("A reason is required (at least 3 characters)");

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return fail("User not found", 404);
    if (target.referredByAdminId !== admin.id) return fail("This user was not referred by you", 404);

    const result = await prisma.$transaction(async (tx) => {
      const fresh = await tx.user.findUnique({ where: { id } });
      if (!fresh) throw new Error("User not found");
      const signed = direction === "credit" ? amount : -amount;
      if (wallet === "cash") {
        const next = round2(dec(fresh.cashBalance) + signed);
        if (next < 0) throw new Error("Debit exceeds the player's cash balance");
        await tx.user.update({ where: { id }, data: { cashBalance: next } });
      } else {
        const next = fresh.coins + signed;
        if (next < 0) throw new Error("Debit exceeds the player's coin balance");
        await tx.user.update({ where: { id }, data: { coins: next } });
      }
      const adj = await tx.balanceAdjustment.create({
        data: { userId: id, adminId: admin.id, wallet, direction, amount: round2(amount), reason },
      });
      await tx.auditLog.create({
        data: {
          actorId: admin.id, action: "balance.adjust", targetId: id,
          detail: `${direction === "credit" ? "Credited" : "Debited"} ${wallet === "cash" ? `GH₵ ${round2(amount).toFixed(2)}` : `${amount} coins`} ${direction === "credit" ? "to" : "from"} ${fresh.name} — ${reason}`,
        },
      });
      const after = await tx.user.findUnique({ where: { id } });
      return { adj, after };
    });

    return ok({
      adjustment: {
        id: result.adj.id, wallet, direction, amount: dec(result.adj.amount),
        reason, createdAt: result.adj.createdAt.toISOString(),
      },
      balances: { cash: dec(result.after?.cashBalance), coins: result.after?.coins ?? 0 },
    }, 201);
  } catch (err) {
    if (err instanceof Error) return fail(err.message, 400);
    return toErrorResponse(err);
  }
}
