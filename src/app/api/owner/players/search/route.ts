// P0 Batch 4 (O6): the owner's global player search — every player
// platform-wide by name, email, or phone (partial match,
// case-insensitive). Owner only; an admin is 403'd.
//
// The match runs in JS over a bounded fetch (the 500 most recent
// users) instead of a Prisma `contains`: `mode: "insensitive"` is not
// supported on SQLite, and a plain `contains` is case-sensitive on
// Postgres — the JS match behaves identically on both. The platform
// has tens of users today; revisit the cap if it grows past 500.
// Password hashes and session data are never selected, let alone
// returned.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { dec } from "@/lib/money";

const SEARCH_CAP = 500;
const RESULT_CAP = 50;

export async function GET(req: Request) {
  try {
    await requireRole("owner");
    const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
    if (q.length < 2) return fail("Search needs at least 2 characters", 400);
    const needle = q.toLowerCase();
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: SEARCH_CAP,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        cashBalance: true,
        coins: true,
        createdAt: true,
        country: true,
        currency: true,
        referredByAdmin: { select: { id: true, name: true } },
      },
    });
    const matched = users
      .filter((u) => [u.name, u.email ?? "", u.phone ?? ""].join(" ").toLowerCase().includes(needle))
      .slice(0, RESULT_CAP);
    // Phase 1 country-based (Nov 2026): deposits are grouped by
    // (user, fiat) — a player's total is the sum in THEIR fiat only.
    // (A deposit is always in the depositing player's fiat, so the
    // player's own bucket is their total; never sum across fiats.)
    const totals =
      matched.length === 0
        ? []
        : await prisma.depositEvent.groupBy({
            by: ["userId", "fiatCurrency"],
            where: { userId: { in: matched.map((m) => m.id) } },
            _sum: { amount: true },
            _count: true,
          });
    const byId = new Map(totals.map((t) => [`${t.userId}:${t.fiatCurrency ?? "GHS"}`, t]));
    return ok({
      q,
      count: matched.length,
      players: matched.map((u) => {
        const fiat = u.currency ?? "GHS";
        const t = byId.get(`${u.id}:${fiat}`);
        return {
          id: u.id,
          name: u.name,
          email: u.email,
          phone: u.phone,
          role: u.role,
          country: u.country ?? "GH",
          currency: fiat,
          referringAdmin: u.referredByAdmin,
          totalDeposited: dec(t?._sum.amount),
          deposits: t?._count ?? 0,
          cash: dec(u.cashBalance),
          coins: u.coins,
          joinedAt: u.createdAt.toISOString(),
        };
      }),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
