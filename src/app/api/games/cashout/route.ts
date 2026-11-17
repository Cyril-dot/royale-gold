// Tetris line cash-out — bank the tier payout earned so far mid-round
// and keep playing.
//
// WHY A NEW ROUTE: the shared settle path (src/lib/settle.ts) always
// deducts the full stake in the same transaction as the payout, so it
// cannot bank a partial amount mid-round — calling it per line would
// deduct the stake once per cash-out. This route is credit-only: it
// adds coins to the wallet and records the credit as a
// BalanceAdjustment (kind "cashout", so the admin/owner ledger names
// it a Tetris line cash-out instead of a manual adjustment).
//
// THE RULE (same table as the room, no new payout table): a cleared
// line is worth the tier jump its points unlock — Tetris tiers are
// >=800 pts x1, >=1500 x2, >=2500 x3 of the stake. Bankable at any
// moment = stake x tier(score) - already banked this round. The
// server is the authority on "already banked": it sums this round's
// earlier cash-out rows (matched by roundId in the reason) inside the
// same transaction, so replaying the same cash-out is rejected — a
// client can never bank the same tier value twice.
//
// NO DOUBLE PAY: the room's end-of-round settle pays only
// stake x tier(final score) - banked, so everything banked mid-round
// is excluded from the final payout by construction.
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { AuthError } from "@/lib/errors";
import { dec } from "@/lib/money";
import { checkPlayLimits } from "@/lib/limits";
import {
  getGameConfig,
  getPlatformSettings,
  isGameBlocked,
  platformMinStake,
} from "@/lib/game-config";

/** Mirror of the Tetris tier table in skill.tsx: >=2500 x3, >=1500 x2,
 *  >=800 x1, else x0. */
function tetrisTier(score: number) {
  return score >= 2500 ? 3 : score >= 1500 ? 2 : score >= 800 ? 1 : 0;
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await readJson<{
      game?: string;
      stake?: number;
      score?: number;
      lines?: number;
      amount?: number;
      roundId?: string;
    }>(req);
    if (!body) return fail("Invalid JSON body");
    if (body.game !== "tetris") return fail("Line cash-out is only for Tetris");
    const stake = Math.floor(Number(body.stake));
    const score = Math.floor(Number(body.score));
    const lines = Math.floor(Number(body.lines));
    const amount = Math.floor(Number(body.amount));
    const roundId = String(body.roundId ?? "").trim();
    if (!Number.isFinite(stake) || stake <= 0) return fail("Stake must be > 0");
    if (!Number.isFinite(score) || score < 0) return fail("Score must be >= 0");
    if (!Number.isFinite(lines) || lines < 0) return fail("Lines must be >= 0");
    if (!Number.isFinite(amount) || amount <= 0) return fail("Amount must be > 0");
    if (!roundId || roundId.length > 80) return fail("roundId is required");
    // The tier the reported score has earned caps this cash-out: a
    // line is only worth the tier jump its points unlock.
    const tier = tetrisTier(score);
    const maxBankable = stake * tier;
    if (amount > maxBankable) {
      return fail(`That cash-out is above what ${score} pts has earned (max ${maxBankable} coins)`);
    }

    // Same gates as settle: a killed/hidden/paused game cannot pay,
    // and the stake must sit inside the game's min/max.
    const cfg = await getGameConfig("tetris");
    const settings = await getPlatformSettings();
    if (cfg) {
      const blocked = isGameBlocked(cfg, settings);
      if (blocked) return fail(blocked);
      const minBet = cfg.minBet ?? platformMinStake("coins", settings);
      if (stake < minBet) return fail(`Minimum stake for Tetris is ${minBet} coins`);
      if (cfg.maxBet != null && stake > cfg.maxBet) {
        return fail(`Maximum stake for Tetris is ${cfg.maxBet} coins`);
      }
    }
    // Same player gates as settle (self-exclusion + cool-off; cash
    // stake/loss limits do not apply to coin games).
    const limitErr = await checkPlayLimits(user.id, stake, "coins", user.currency ?? "GHS");
    if (limitErr) throw new AuthError(403, limitErr);

    const reason = `Tetris line cash-out ${roundId}`;
    const result = await prisma.$transaction(async (tx) => {
      const fresh = await tx.user.findUnique({ where: { id: user.id } });
      if (!fresh || !fresh.active) throw new Error("Account not found or inactive");
      if (fresh.blockedAt) throw new AuthError(403, "This account is blocked and cannot place bets");
      // Replay guard: what this round has already banked, summed from
      // the ledger rows this route wrote. The client tracks banked too,
      // but the server sum is the authority.
      const prior = await tx.balanceAdjustment.findMany({
        where: { userId: user.id, kind: "cashout", reason },
        select: { amount: true },
      });
      const banked = prior.reduce((s, r) => s + dec(r.amount), 0);
      if (amount > maxBankable - banked) {
        throw new Error(
          `Only ${Math.max(0, maxBankable - banked)} coins left to bank this round (${banked} already banked)`,
        );
      }
      const after = await tx.user.update({
        where: { id: user.id },
        data: { coins: fresh.coins + amount },
      });
      await tx.balanceAdjustment.create({
        data: {
          userId: user.id,
          // Player-initiated: the actor is the player themself (the
          // ledger's admin column is required, so it holds the player).
          adminId: user.id,
          wallet: "coins",
          direction: "credit",
          amount,
          reason,
          kind: "cashout",
          // Phase 1 country-based (Nov 2026): the player's fiat, so
          // the ledger never blends fiats on coin rows either.
          fiatCurrency: fresh.currency ?? "GHS",
        },
      });
      return { after, banked: banked + amount };
    });

    return ok({
      game: "tetris",
      amount,
      banked: result.banked,
      maxBankable,
      tier,
      cash: dec(result.after.cashBalance),
      coins: result.after.coins,
      sim: dec(result.after.simBalance),
    }, 201);
  } catch (err) {
    if (err instanceof AuthError) return toErrorResponse(err);
    if (err instanceof Error) return fail(err.message, 400);
    return toErrorResponse(err);
  }
}
