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
// P2 Batch 2 (O31): automated risk rules — evaluated inside the same
// transaction as the request, AFTER the request is created, so a hold
// is atomic with it.
import { evaluateWithdrawalRules } from "@/lib/risk-rules";

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

    // Phase 1 country-based (Nov 2026): the request is in the
    // player's fiat — stamped so the queues never blend fiats.
    const fiatCurrency = fresh.currency ?? "GHS";
    const created = await prisma.$transaction(async (tx) => {
      const w = await tx.withdrawal.create({
        data: {
          userId: user.id,
          adminId: fresh.referredByAdminId ?? null,
          amount: round2(amount),
          method,
          fiatCurrency,
          status: "pending",
        },
      });
      await tx.auditLog.create({
        data: { actorId: user.id, action: "withdrawal.request", targetId: w.id, detail: `Requested ${round2(amount)} ${fiatCurrency} via ${method}` },
      });
      // P2 Batch 2 (O31): the risk rules run AFTER the request is
      // created — a "hold_withdrawal" rule sets this request "held"
      // for admin review; a "block_player" rule blocks the player.
      // "flag" needs nothing (the fraud console already shows it).
      const rules = await evaluateWithdrawalRules(tx, { id: w.id, userId: user.id, amount: round2(amount) }, fresh.createdAt);
      return { w, status: rules.held ? "held" : "pending" };
    });

    return ok({
      withdrawal: {
        id: created.w.id,
        amount: dec(created.w.amount),
        method: created.w.method,
        fiatCurrency: created.w.fiatCurrency,
        status: created.status,
        createdAt: created.w.createdAt.toISOString(),
      },
      note: created.status === "held"
        ? "This request was held for admin review by an automated risk rule."
        : "Request only — no money moves until an admin approves it.",
    }, 201);
  } catch (err) {
    return toErrorResponse(err);
  }
}
