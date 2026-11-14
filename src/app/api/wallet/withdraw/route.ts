// P0 Batch 1 (A5): a player requests a withdrawal. This creates a
// REQUEST only — no real money moves (deposits are demo cashier only),
// no balance is debited, and nothing pays out without an admin action.
// The request lands in the referring admin's queue (or the owner's
// global queue when the player was not referred). A blocked player
// cannot request.
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { dec, round2 } from "@/lib/money";
import { WITHDRAWAL_METHODS } from "@/lib/withdrawals";

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await readJson<{ amount?: number; method?: string }>(req);
    if (!body) return fail("Invalid JSON body");
    const amount = Number(body.amount);
    const method = body.method ?? "";
    if (!Number.isFinite(amount) || amount <= 0) return fail("Amount must be > 0");
    if (!WITHDRAWAL_METHODS.includes(method as (typeof WITHDRAWAL_METHODS)[number])) {
      return fail(`Method must be one of: ${WITHDRAWAL_METHODS.join(", ")}`);
    }

    const fresh = await prisma.user.findUnique({ where: { id: user.id } });
    if (!fresh || !fresh.active) return fail("Account not found or inactive", 403);
    if (fresh.blockedAt) return fail("This account is blocked and cannot request a withdrawal", 403);
    if (dec(fresh.cashBalance) < amount) return fail("Amount exceeds your cash balance");

    const created = await prisma.$transaction(async (tx) => {
      const w = await tx.withdrawal.create({
        data: {
          userId: user.id,
          adminId: fresh.referredByAdminId ?? null,
          amount: round2(amount),
          method,
          status: "pending",
        },
      });
      await tx.auditLog.create({
        data: { actorId: user.id, action: "withdrawal.request", targetId: w.id, detail: `Requested ${round2(amount)} via ${method}` },
      });
      return w;
    });

    return ok({
      withdrawal: {
        id: created.id,
        amount: dec(created.amount),
        method: created.method,
        status: created.status,
        createdAt: created.createdAt.toISOString(),
      },
      note: "Request only — no money moves until an admin approves it.",
    }, 201);
  } catch (err) {
    return toErrorResponse(err);
  }
}
