import bcrypt from "bcryptjs";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { dec } from "@/lib/money";
import { publicUser } from "@/lib/serialize";
import { currencyForCountry, isOfferedCountry } from "@/lib/country";
// P0 Batch 3 (O4): the all-time commission is RECOMPUTED by the rules
// engine — not the stamped sum (which is 0 when a rule is in force).
import { commissionSummary } from "@/lib/commission";

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
        const [coinsAgg, summary, parent] = await Promise.all([
          prisma.redemption.aggregate({ where: { code: { adminId: a.id } }, _sum: { coins: true } }),
          // Phase 1 country-based (Nov 2026): the all-time commission
          // is in the ADMIN'S fiat (their downline may span fiats, but
          // the list figure is their own currency's).
          commissionSummary(a.id, a.currency ?? "GHS"),
          // P1 Batch 4 (O24): the admin's parent admin, if any.
          a.parentAdminId
            ? prisma.user.findUnique({ where: { id: a.parentAdminId }, select: { id: true, name: true } })
            : Promise.resolve(null),
        ]);
        return {
          ...publicUser(a),
          codes: a.referralCodes,
          referralCount: a._count.referredUsers,
          coinsGiven: coinsAgg._sum.coins ?? 0,
          commissionAllTime: summary.allTime,
          commissionCurrency: summary.fiatCurrency,
          parentAdminId: a.parentAdminId,
          parentName: parent?.name ?? null,
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
    const body = await readJson<{ name?: string; email?: string; password?: string; commissionPct?: number; country?: string }>(req);
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
    // Phase 1 country-based (Nov 2026): the owner picks the admin's
    // country at creation (GH | NG, default GH); the fiat follows it.
    const country = (body.country ?? "GH").toUpperCase();
    if (!isOfferedCountry(country)) return fail("Country must be Ghana or Nigeria", 400);
    const currency = currencyForCountry(country);
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return fail("An account with this email already exists", 409);
    const created = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash: await bcrypt.hash(password, 10),
        role: "admin",
        country,
        currency,
        commissionPct: pct,
      },
    });
    return ok({ admin: publicUser(created) }, 201);
  } catch (err) {
    return toErrorResponse(err);
  }
}
