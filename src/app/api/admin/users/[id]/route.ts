import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { dec } from "@/lib/money";

/**
 * User detail for the admin panel: profile, joined date, code used,
 * referring admin, full deposit history, totals, coins given.
 * An admin may only view users they referred; the owner may view anyone.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireRole("admin", "owner");
    const { id } = await params;
    const user = await prisma.user.findUnique({
      where: { id },
      include: { referredByAdmin: { select: { id: true, name: true, email: true } } },
    });
    if (!user) return fail("User not found", 404);
    if (me.role === "admin" && user.referredByAdminId !== me.id) {
      return fail("This user was not referred by you", 404);
    }
    const [deposits, redemptions] = await Promise.all([
      prisma.depositEvent.findMany({
        where: { userId: id },
        orderBy: { createdAt: "desc" },
      }),
      prisma.redemption.findMany({ where: { userId: id } }),
    ]);
    const totalDeposited = deposits.reduce((s, d) => s + dec(d.amount), 0);
    const totalCommission = deposits.reduce((s, d) => s + dec(d.commission), 0);
    return ok({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        cash: dec(user.cashBalance),
        coins: user.coins,
        joinedAt: user.createdAt.toISOString(),
        referralCodeUsed: user.referralCodeUsed,
        referringAdmin: user.referredByAdmin,
      },
      deposits: deposits.map((d) => ({
        id: d.id,
        amount: dec(d.amount),
        method: d.method,
        pctInForce: dec(d.pctInForce),
        commission: dec(d.commission),
        createdAt: d.createdAt.toISOString(),
      })),
      totals: {
        deposits: deposits.length,
        totalDeposited,
        totalCommission,
        coinsGiven: redemptions.reduce((s, r) => s + r.coins, 0),
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
