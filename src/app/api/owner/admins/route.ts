import bcrypt from "bcryptjs";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { dec } from "@/lib/money";
import { publicUser } from "@/lib/serialize";

/** All admins with codes / referral counts / coins given / commission. */
export async function GET() {
  try {
    await requireRole("owner");
    const admins = await prisma.user.findMany({
      where: { role: "admin" },
      orderBy: { createdAt: "desc" },
      include: {
        referralCodes: { select: { id: true, code: true, active: true } },
        _count: { select: { referredUsers: true } },
      },
    });
    const rows = await Promise.all(
      admins.map(async (a) => {
        const [coinsAgg, commissionAgg] = await Promise.all([
          prisma.redemption.aggregate({ where: { code: { adminId: a.id } }, _sum: { coins: true } }),
          prisma.depositEvent.aggregate({ where: { adminId: a.id }, _sum: { commission: true } }),
        ]);
        return {
          ...publicUser(a),
          codes: a.referralCodes,
          referralCount: a._count.referredUsers,
          coinsGiven: coinsAgg._sum.coins ?? 0,
          commissionAllTime: dec(commissionAgg._sum.commission),
        };
      }),
    );
    return ok({ admins: rows });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Add an admin: name, email, password, commission %. */
export async function POST(req: Request) {
  try {
    await requireRole("owner");
    const body = await readJson<{ name?: string; email?: string; password?: string; commissionPct?: number }>(req);
    if (!body) return fail("Invalid JSON body");
    const name = (body.name ?? "").trim();
    const email = (body.email ?? "").trim().toLowerCase();
    const password = body.password ?? "";
    const pct = body.commissionPct === undefined || body.commissionPct === null ? null : Number(body.commissionPct);
    if (!name) return fail("Name is required");
    if (!email.includes("@")) return fail("A valid email is required");
    if (password.length < 6) return fail("Password must be at least 6 characters");
    if (pct !== null && (!Number.isFinite(pct) || pct < 0 || pct > 100)) {
      return fail("commissionPct must be between 0 and 100");
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return fail("An account with this email already exists", 409);
    const created = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash: await bcrypt.hash(password, 10),
        role: "admin",
        commissionPct: pct,
      },
    });
    return ok({ admin: publicUser(created) }, 201);
  } catch (err) {
    return toErrorResponse(err);
  }
}
