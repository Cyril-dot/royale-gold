// P1 Batch 1 (A17): a bonus grant — the admin grants a bonus to one of
// their own players (cash or coins, credit only). A plain credit: no
// wagering requirements (that is the P1 bonus engine, O19, a later
// batch). The credit, the BalanceAdjustment (kind "bonus", so the
// ledger names it a bonus and never mistakes it for a manual
// adjustment) and the AuditLog row (action "bonus.grant") land in one
// atomic transaction. An optional expiry date is recorded in the audit
// detail — it is NOT auto-enforced (no cron revokes a bonus); the
// bonus is in the wallet the moment it is granted.
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { dec, round2 } from "@/lib/money";
import { symbolFor } from "@/lib/country";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireRole("admin");
    requirePermission(admin, "players");
    const { id } = await params;
    const body = await readJson<{ wallet?: string; amount?: number; reason?: string; expiresAt?: string }>(req);
    if (!body) return fail("Invalid JSON body");
    const wallet = body.wallet;
    if (wallet !== "cash" && wallet !== "coins") return fail("wallet must be cash or coins");
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) return fail("Amount must be > 0");
    if (wallet === "coins" && !Number.isInteger(amount)) return fail("Coin bonuses must be whole coins");
    const reason = (body.reason ?? "").trim();
    if (reason.length < 3) return fail("A reason is required (at least 3 characters)");
    const expiresAt = (body.expiresAt ?? "").trim();
    if (expiresAt && Number.isNaN(new Date(expiresAt + "T00:00:00Z").getTime())) {
      return fail("Expiry must be a date (YYYY-MM-DD)");
    }

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return fail("User not found", 404);
    if (target.referredByAdminId !== admin.id) return fail("This user was not referred by you", 404);

    const result = await prisma.$transaction(async (tx) => {
      const fresh = await tx.user.findUnique({ where: { id } });
      if (!fresh) throw new Error("User not found");
      const after =
        wallet === "cash"
          ? await tx.user.update({ where: { id }, data: { cashBalance: round2(dec(fresh.cashBalance) + amount) } })
          : await tx.user.update({ where: { id }, data: { coins: fresh.coins + amount } });
      const adj = await tx.balanceAdjustment.create({
        data: {
          userId: id,
          adminId: admin.id,
          wallet,
          direction: "credit",
          amount: round2(amount),
          reason,
          kind: "bonus",
          // Phase 1 country-based (Nov 2026): the target player's fiat.
          fiatCurrency: fresh.currency ?? "GHS",
        },
      });
      const bonusLabel = wallet === "cash" ? `${symbolFor(fresh.currency)} ${round2(amount).toFixed(2)}` : `${amount} coins`;
      await tx.auditLog.create({
        data: {
          actorId: admin.id, action: "bonus.grant", targetId: id,
          detail: `Bonus: granted ${bonusLabel} to ${fresh.name} — ${reason}${expiresAt ? ` (expiry recorded: ${expiresAt}, not auto-enforced)` : ""}`,
        },
      });
      return { adj, after };
    });

    return ok({
      bonus: {
        id: result.adj.id, wallet, amount: dec(result.adj.amount), reason,
        expiresAt: expiresAt || null, createdAt: result.adj.createdAt.toISOString(),
      },
      balances: { cash: dec(result.after.cashBalance), coins: result.after.coins },
    }, 201);
  } catch (err) {
    if (err instanceof Error) return fail(err.message, 400);
    return toErrorResponse(err);
  }
}
