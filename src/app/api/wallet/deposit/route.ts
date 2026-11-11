import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { dec, round2, toDecimal } from "@/lib/money";

const METHODS = ["MTN", "Telecel", "AirtelTigo", "card"] as const;

/**
 * Demo cashier deposit. Credits REAL cash (GH₵) only — coins are never
 * involved. If the user was referred, a DepositEvent is recorded with the
 * referring admin, their CURRENT commissionPct frozen as pctInForce, and
 * commission = amount * pct / 100 (2dp). Changing the % later never
 * rewrites this event.
 */
export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await readJson<{ amount?: number; method?: string }>(req);
    if (!body) return fail("Invalid JSON body");
    const amount = Number(body.amount);
    const method = body.method ?? "";
    if (!Number.isFinite(amount) || amount <= 0) return fail("Amount must be > 0");
    if (!METHODS.includes(method as (typeof METHODS)[number])) {
      return fail(`Method must be one of: ${METHODS.join(", ")}`);
    }

    const result = await prisma.$transaction(async (tx) => {
      const fresh = await tx.user.findUnique({ where: { id: user.id } });
      if (!fresh || !fresh.active) throw new Error("Account not found or inactive");

      let adminId: string | null = null;
      let pctInForce = 0;
      if (fresh.referredByAdminId) {
        const admin = await tx.user.findUnique({ where: { id: fresh.referredByAdminId } });
        if (admin && admin.active && admin.role === "admin") {
          adminId = admin.id;
          pctInForce = dec(admin.commissionPct);
        }
      }
      const commission = round2((amount * pctInForce) / 100);

      const updated = await tx.user.update({
        where: { id: user.id },
        data: { cashBalance: toDecimal(dec(fresh.cashBalance) + amount) },
      });
      const event = await tx.depositEvent.create({
        data: {
          userId: user.id,
          adminId,
          amount: toDecimal(amount),
          method,
          pctInForce: toDecimal(pctInForce),
          commission: toDecimal(commission),
        },
      });
      return { updated, event, commission };
    });

    return ok({
      cash: dec(result.updated.cashBalance),
      coins: result.updated.coins,
      sim: dec(result.updated.simBalance),
      deposit: {
        id: result.event.id,
        amount: dec(result.event.amount),
        method: result.event.method,
        pctInForce: dec(result.event.pctInForce),
        commission: result.commission,
        createdAt: result.event.createdAt.toISOString(),
      },
    }, 201);
  } catch (err) {
    return toErrorResponse(err);
  }
}
