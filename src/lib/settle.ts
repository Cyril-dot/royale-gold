import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { getGame } from "./games";
import { dec, round2, toDecimal } from "./money";
import { getCrashRound } from "./crash";
import { PLAY_GATED_GAMES } from "./play";
// P0 Batch 2 (O9/O10/O11): per-game owner control — visibility, kill
// switches, min/max bet, max payout, max multiplier override.
import {
  getGameConfig,
  getPlatformSettings,
  isGameBlocked,
  platformMinStake,
} from "./game-config";
// P1 Batch 1 (A20): per-player limits (max stake, daily loss, cool-off).
import { checkPlayLimits } from "./limits";

/** Slugs that settle against a server-issued crash round. Balloon Burst
 * is a crash game too (shared engine, roundId passed at settle) — it
 * belongs here alongside Car Crash, or every one of its settles 400s
 * with "roundId is only valid for crash games" (round 24 fix). */
export const CRASH_GAME_SLUGS = new Set(["aviator-gold", "jet-fly", "car-crash", "balloon-burst"]);

/**
 * The single server-side settlement path. Every balance change for a game
 * goes through here, inside one Prisma transaction. The client NEVER sends
 * balances — only game, currency, stake and payout, all re-validated here.
 * Coins are integers and are never converted to cash.
 *
 * Crash cash-outs: when a roundId is supplied, the round must exist and
 * the cash-out multiplier (payout / stake) must never exceed the server's
 * stored crash point for that round — a client can never cash out above
 * the point the server committed to.
 */
export async function settleGame(
  userId: string,
  gameSlug: string,
  currency: "cash" | "coins",
  stake: number,
  payout: number,
  result?: Record<string, unknown> | null,
  opts?: { roundId?: string; viaPlay?: boolean },
) {
  const game = getGame(gameSlug);
  if (!game) throw new Error(`Unknown game: ${gameSlug}`);
  // Play-gated games settle ONLY through POST /api/games/play, where the
  // server draws the outcome (SIM/LIVE economy factor applied). Settling
  // one here would let a client skip the draw and invent a win. The /play
  // route itself calls settleGame with viaPlay: true.
  if (PLAY_GATED_GAMES.has(gameSlug) && !opts?.viaPlay) {
    throw new Error(`${game.name} settles through /api/games/play only`);
  }
  if (game.currency !== currency) {
    throw new Error(`${game.name} is a ${game.currency} game — settle in ${game.currency} only`);
  }
  if (!Number.isFinite(stake) || stake <= 0) throw new Error("Stake must be > 0");
  if (!Number.isFinite(payout) || payout < 0) throw new Error("Payout must be >= 0");
  // P0 Batch 2 (O9/O10/O11): owner control. A killed, hidden, or
  // globally-paused game cannot settle at all — the stake was never
  // deducted (it moves only inside the transaction below), so blocking
  // here costs the player nothing. A bet outside the game's min/max is
  // rejected; a payout above the game's max payout is CAPPED to it
  // (not rejected) and the capped amount is what settles and is returned.
  const cfg = await getGameConfig(gameSlug);
  const settings = await getPlatformSettings();
  if (cfg) {
    const blocked = isGameBlocked(cfg, settings);
    if (blocked) throw new Error(blocked);
    const minBet = cfg.minBet ?? platformMinStake(currency, settings);
    if (stake < minBet) {
      throw new Error(
        `Minimum stake for ${game.name} is ${currency === "coins" ? `${minBet} coins` : `GH₵ ${minBet.toFixed(2)}`}`,
      );
    }
    if (cfg.maxBet != null && stake > cfg.maxBet) {
      throw new Error(
        `Maximum stake for ${game.name} is ${currency === "coins" ? `${cfg.maxBet} coins` : `GH₵ ${cfg.maxBet.toFixed(2)}`}`,
      );
    }
  }
  if (payout > round2(stake * (cfg?.maxMultiplier ?? game.maxMultiplier)) + 1e-9) {
    throw new Error(`Payout exceeds ${game.name} max multiplier ×${cfg?.maxMultiplier ?? game.maxMultiplier}`);
  }
  // P1 Batch 1 (A20): per-player limits — cool-off blocks all play, a
  // cash stake above the player's max is rejected, and a day's loss at
  // the max blocks further play. Every game settles through here, so
  // this is the single enforcement point; the play route re-checks
  // before the draw so a limited player never draws.
  const limitErr = await checkPlayLimits(userId, stake, currency);
  if (limitErr) throw new Error(limitErr);
  let effPayout = payout;
  if (cfg?.maxPayout != null && effPayout > cfg.maxPayout) {
    effPayout = currency === "coins" ? Math.floor(cfg.maxPayout) : round2(cfg.maxPayout);
  }
  if (opts?.roundId) {
    if (!CRASH_GAME_SLUGS.has(gameSlug)) {
      throw new Error("roundId is only valid for crash games");
    }
    const round = getCrashRound(opts.roundId);
    if (!round) throw new Error("Unknown crash round");
    // Cash-out multiplier must never exceed the server's crash point.
    // (Losses settle payout 0 and always pass.)
    if (effPayout > 0 && effPayout / stake > round.crashPoint + 1e-9) {
      throw new Error(`Cash-out above the round's crash point ×${round.crashPoint}`);
    }
  }
  if (currency === "coins" && (!Number.isInteger(stake) || !Number.isInteger(effPayout))) {
    throw new Error("Coin stakes and payouts must be whole coins");
  }

  const stakeD = currency === "cash" ? toDecimal(stake) : stake;
  const payoutD = currency === "cash" ? toDecimal(effPayout) : effPayout;

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || !user.active) throw new Error("Account not found or inactive");
    // P0 Batch 1 (A8): a blocked player cannot place a bet. This covers
    // /api/games/settle and the REAL path of /api/games/play (which calls
    // settleGame); the play route also checks before the SIM draw.
    if (user.blockedAt) throw new Error("This account is blocked and cannot place bets");
    if (currency === "cash") {
      if (dec(user.cashBalance) < stake) throw new Error("Insufficient cash balance");
    } else if (user.coins < stake) {
      throw new Error("Insufficient coins");
    }

    const updated =
      currency === "cash"
        ? await tx.user.update({
            where: { id: userId },
            data: {
              cashBalance: round2(dec(user.cashBalance) - stake + effPayout),
              xp: { increment: 2 },
            },
          })
        : await tx.user.update({
            where: { id: userId },
            data: { coins: user.coins - stake + effPayout, xp: { increment: 2 } },
          });

    // Level = 1 + floor(xp / 100).
    const level = 1 + Math.floor(updated.xp / 100);
    const withLevel =
      level !== updated.level
        ? await tx.user.update({ where: { id: userId }, data: { level } })
        : updated;

    const gameResult = await tx.gameResult.create({
      data: {
        userId,
        game: gameSlug,
        currency,
        stake: currency === "cash" ? (stakeD as never) : stake,
        payout: currency === "cash" ? (payoutD as never) : effPayout,
        result: (result ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });

    return {
      gameResult,
      // The effective payout — equal to the requested one unless the
      // owner's max-payout cap cut it down (O10).
      payout: effPayout,
      cash: dec(withLevel.cashBalance),
      coins: withLevel.coins,
      sim: dec(withLevel.simBalance),
      xp: withLevel.xp,
      level: withLevel.level,
    };
  });
}
