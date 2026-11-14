// P2 Batch 2 (O29): jackpots. The pot is HOUSE-funded — every cash
// stake in the jackpot's game(s) grows the pot by contributionPct% of
// the stake (a reporting number, tracked in a JackpotPot row, never
// taken from any payout). Paying the pot credits the picked player as
// a bonus and resets the pot to the seed amount.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { AuthError } from "@/lib/errors";
import { getJackpots, jackpotGameName } from "@/lib/jackpots";
import { getGame } from "@/lib/games";
import { round2, dec } from "@/lib/money";

export async function GET() {
  try {
    await requireRole("owner");
    const jackpots = await getJackpots();
    return ok({ jackpots });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireRole("owner");
    const body = await readJson<{ name?: string; gameSlug?: string; seedAmount?: number; contributionPct?: number }>(req);
    const name = (body?.name ?? "").trim();
    if (name.length < 2 || name.length > 60) return fail("The jackpot needs a name of 2–60 characters");
    const gameSlug = (body?.gameSlug ?? "").trim();
    if (gameSlug !== "all" && !getGame(gameSlug)) return fail("Pick one of the 46 games, or “all”");
    const seed = Number(body?.seedAmount);
    if (!Number.isFinite(seed) || seed < 0 || seed > 100000) return fail("Seed amount must be between GH₵ 0 and GH₵ 100,000");
    const pct = Number(body?.contributionPct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 50) return fail("Contribution must be between 0% and 50% of each stake");
    const created = await prisma.$transaction(async (tx) => {
      const j = await tx.jackpot.create({
        data: {
          name, gameSlug, seedAmount: round2(seed), contributionPct: round2(pct),
          currentPot: round2(seed), createdBy: me.id,
        },
      });
      await tx.jackpotPot.create({ data: { jackpotId: j.id, pot: round2(seed) } });
      await tx.auditLog.create({
        data: {
          actorId: me.id, action: "jackpot.create", targetId: j.id,
          detail: `Jackpot: created “${name}” (${jackpotGameName(gameSlug)}) — seed GH₵ ${round2(seed).toFixed(2)}, ${round2(pct)}% of each stake feeds the pot`,
        },
      });
      return j;
    });
    return ok({
      jackpot: {
        id: created.id, name: created.name, gameSlug: created.gameSlug,
        gameName: jackpotGameName(created.gameSlug),
        seedAmount: dec(created.seedAmount), contributionPct: dec(created.contributionPct),
        currentPot: dec(created.currentPot), active: created.active,
        createdAt: created.createdAt.toISOString(),
      },
    });
  } catch (err) {
    if (err instanceof AuthError) return toErrorResponse(err);
    if (err instanceof Error) return fail(err.message, 400);
    return toErrorResponse(err);
  }
}
