// P2 Batch 1 (A26): the owner manages the VIP tiers — the thresholds
// and perks live here, NOT on the admin panel (the admin panel only
// shows them). POST saves the WHOLE tier list at once (replace-all:
// nothing references a tier id — a player's tier is computed live
// from their total deposited, so recreating the rows is safe). At
// least one tier must start at GH₵0, so every player always has a
// tier. VIP changes no economy, limits or payouts.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { AuthError } from "@/lib/errors";
import { getVipTiers, tierFor, totalsDeposited, type VipTierRow } from "@/lib/vip";
import { round2 } from "@/lib/money";

export async function GET() {
  try {
    const me = await requireRole("owner");
    // The owner sees EVERY player (the global view) with their tier,
    // computed live from the deposit ledger — the same shape as the
    // admin endpoint, unscoped.
    const tiers = await getVipTiers(me.id);
    const users = await prisma.user.findMany({
      where: { role: "user" },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, email: true, phone: true },
    });
    const totals = await totalsDeposited(users.map((u) => u.id));
    return ok({
      tiers,
      players: users.map((u) => {
        const total = totals.get(u.id) ?? 0;
        const tier = tierFor(total, tiers);
        return {
          id: u.id,
          name: u.name,
          contact: u.email ?? u.phone ?? null,
          totalDeposited: total,
          tier: tier ? { id: tier.id, name: tier.name, minDeposited: tier.minDeposited, perks: tier.perks } : null,
        };
      }),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireRole("owner");
    const body = await readJson<{ tiers?: { name?: string; minDeposited?: number; perks?: string; sortOrder?: number }[] }>(req);
    if (!body || !Array.isArray(body.tiers)) return fail("Send a tiers list");
    const tiers = body.tiers;
    if (tiers.length === 0 || tiers.length > 10) return fail("Keep 1–10 tiers");
    const names = new Set<string>();
    let hasZero = false;
    const cleaned: { name: string; minDeposited: number; perks: string; sortOrder: number }[] = [];
    for (let i = 0; i < tiers.length; i++) {
      const t = tiers[i];
      const name = (t.name ?? "").trim();
      if (name.length < 2 || name.length > 40) return fail("Each tier needs a name of 2–40 characters");
      if (names.has(name.toLowerCase())) return fail(`Two tiers are called "${name}"`);
      names.add(name.toLowerCase());
      const min = Number(t.minDeposited);
      if (!Number.isFinite(min) || min < 0) return fail(`"${name}" needs a minimum deposit of GH₵ 0 or more`);
      if (min === 0) hasZero = true;
      const perks = (t.perks ?? "").trim();
      if (perks.length > 500) return fail(`"${name}" perks are too long (max 500 characters)`);
      cleaned.push({ name, minDeposited: round2(min), perks, sortOrder: Number.isFinite(Number(t.sortOrder)) ? Number(t.sortOrder) : i + 1 });
    }
    if (!hasZero) return fail("One tier must start at GH₵ 0, so every player has a tier");
    const mins = new Set(cleaned.map((c) => c.minDeposited));
    if (mins.size !== cleaned.length) return fail("Two tiers share the same minimum deposit");

    const saved = await prisma.$transaction(async (tx) => {
      await tx.vipTier.deleteMany({});
      await tx.vipTier.createMany({
        data: cleaned.map((c) => ({ ...c, createdBy: me.id })),
      });
      await tx.auditLog.create({
        data: {
          actorId: me.id, action: "vip.tier.set",
          detail: `VIP tiers: ${cleaned.map((c) => `${c.name} ≥ GH₵ ${c.minDeposited.toFixed(2)}`).join(", ")}`,
        },
      });
      return tx.vipTier.findMany({ orderBy: { sortOrder: "asc" } });
    });
    const rows: VipTierRow[] = saved.map((t) => ({
      id: t.id,
      name: t.name,
      minDeposited: Number(t.minDeposited),
      perks: t.perks.split(",").map((p) => p.trim()).filter(Boolean),
      sortOrder: t.sortOrder,
      createdAt: t.createdAt.toISOString(),
    }));
    return ok({ tiers: rows });
  } catch (err) {
    if (err instanceof AuthError) return toErrorResponse(err);
    if (err instanceof Error) return fail(err.message, 400);
    return toErrorResponse(err);
  }
}
