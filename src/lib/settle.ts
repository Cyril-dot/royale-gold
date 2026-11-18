import { Prisma } from "@prisma/client";
import { AuthError } from "./errors";
import { prisma } from "./prisma";
import { getGame } from "./games";
import { dec, round2, toDecimal } from "./money";
import { symbolFor } from "./country";
import { getCrashRound } from "./crash";
import { PLAY_GATED_GAMES } from "./play";
// P0 Batch 2 (O9/O10/O11): per-game owner control — visibility, kill
// switches, min/max bet, max payout, max multiplier override.
import {
  getGameConfig,
  getPlatformSettings,
  isGameBlocked,
  platformMinStakeFiat,
  scaleGhsAmount,
} from "./game-config";
// P1 Batch 1 (A20): per-player limits (max stake, daily loss, cool-off).
import { checkPlayLimits } from "./limits";
// P2 Batch 2 (O29): jackpot pot growth — a house-funded reporting
// number, never taken from any payout (runs after the payout is
// computed, inside the same transaction, and touches only JackpotPot).
import { contributeToJackpots } from "./jackpots";
// Win logic (Nov 2026): Stake + Winnings split + per-deposit win
// allowance cap (src/lib/win-logic.ts). The cap is a hard limit ON TOP
// of the LIVE win-chance factor (economy.ts) — it never changes the
// draw, only the credited profit. Silent server-side: no message, no
// label; the credited (capped) payout is what settles and is returned.
import { clampWinnings, creditWinProfit, getWinningsTx, splitCash } from "./win-logic";

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
  // Phase 1 country-based (Nov 2026): the round is played in the
  // PLAYER'S fiat. Min/max stakes come from CurrencyConfig for that
  // fiat; per-game minBet/maxBet/maxPayout overrides are stored in GHS
  // terms and scaled (×100 for NGN). The GameResult row is stamped
  // with the fiat so no aggregate ever blends currencies.
  const player = await prisma.user.findUnique({ where: { id: userId }, select: { currency: true } });
  const fiatCurrency = player?.currency ?? "GHS";
  const sym = symbolFor(fiatCurrency);
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
    const minBet = cfg.minBet != null ? await scaleGhsAmount(cfg.minBet, fiatCurrency) : await platformMinStakeFiat(currency, settings, fiatCurrency);
    if (stake < minBet) {
      throw new Error(
        `Minimum stake for ${game.name} is ${currency === "coins" ? `${minBet} coins` : `${sym} ${minBet.toFixed(2)}`}`,
      );
    }
    if (cfg.maxBet != null) {
      const maxBet = await scaleGhsAmount(cfg.maxBet, fiatCurrency);
      if (stake > maxBet) {
        throw new Error(
          `Maximum stake for ${game.name} is ${currency === "coins" ? `${maxBet} coins` : `${sym} ${maxBet.toFixed(2)}`}`,
        );
      }
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
  const limitErr = await checkPlayLimits(userId, stake, currency, fiatCurrency);
  if (limitErr) throw new AuthError(403, limitErr);
  let effPayout = payout;
  if (cfg?.maxPayout != null) {
    const maxPayout = await scaleGhsAmount(cfg.maxPayout, fiatCurrency);
    if (effPayout > maxPayout) {
      effPayout = currency === "coins" ? Math.floor(maxPayout) : round2(maxPayout);
    }
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

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || !user.active) throw new Error("Account not found or inactive");
    // P0 Batch 1 (A8): a blocked player cannot place a bet. This covers
    // /api/games/settle and the REAL path of /api/games/play (which calls
    // settleGame); the play route also checks before the SIM draw.
    if (user.blockedAt) throw new AuthError(403, "This account is blocked and cannot place bets");
    if (currency === "cash") {
      if (dec(user.cashBalance) < stake) throw new Error("Insufficient cash balance");
    } else if (user.coins < stake) {
      throw new Error("Insufficient coins");
    }

    // Win allowance cap (Nov 2026, cash only): the profit of this round
    // (payout - stake) is credited only up to the remaining allowance
    // for this deposit pool. The stake itself always returns in full —
    // only the PROFIT is capped, so a capped win still pays back the
    // stake. When the allowance is exhausted the credited payout is
    // exactly the stake (a win that pays nothing extra). The credited
    // profit lands in Winnings (WinWallet) via creditWinProfit. Coins
    // never touch the cap.
    if (currency === "cash") {
      const profit = Math.max(0, round2(effPayout - stake));
      if (profit > 0) {
        // The exception flag is deliberately NOT returned to the
        // client and NOT stored on the GameResult: GET /api/games/history
        // returns the result blob to the player, and the cap (and its
        // exceptions) stays silent. The credited payout is all any
        // surface ever shows.
        const { credited } = await creditWinProfit(tx, userId, fiatCurrency, profit);
        effPayout = round2(stake + credited);
      }
    }
    // Recomputed here (not before the transaction) so the GameResult
    // records the CAPPED payout — what was actually credited.
    const payoutD = currency === "cash" ? toDecimal(effPayout) : effPayout;

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

    // Win logic: a cash debit (a losing round, or a round whose capped
    // payout is below the stake) can drop the total below the Winnings
    // sub-ledger — debits hit Stake first, Winnings only when the total
    // drops below it.
    if (currency === "cash") {
      await clampWinnings(tx, userId, dec(updated.cashBalance));
    }

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
        fiatCurrency,
        stake: currency === "cash" ? (stakeD as never) : stake,
        payout: currency === "cash" ? (payoutD as never) : effPayout,
        result: (result ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });

    // P2 Batch 2 (O29): the jackpot pot grows by contributionPct% of
    // this cash stake (house-funded — the payout above is already
    // final and is never touched). Coins never feed a jackpot.
    // Phase 1 (Nov 2026): GHS-only — NGN stakes do not feed the pot.
    await contributeToJackpots(tx, gameSlug, currency, stake, fiatCurrency);

    // The Stake/Winnings split after this round (cash only; coins
    // have no split). Read post-clamp so the returned split always
    // satisfies winnings <= cash.
    const split =
      currency === "cash"
        ? splitCash(dec(withLevel.cashBalance), await getWinningsTx(tx, userId))
        : { cash: dec(withLevel.cashBalance), winnings: 0, stake: dec(withLevel.cashBalance) };

    return {
      gameResult,
      // The effective payout — equal to the requested one unless the
      // owner's max-payout cap (O10) or the win allowance cap cut it
      // down. Both caps are silent: the credited amount is returned
      // with no mention of why it is lower.
      payout: effPayout,
      cash: dec(withLevel.cashBalance),
      coins: withLevel.coins,
      sim: dec(withLevel.simBalance),
      xp: withLevel.xp,
      level: withLevel.level,
      // Named stakeBalance/winningsBalance (not stake/winnings) so
      // they never collide with the round's `stake` in the response.
      stakeBalance: split.stake,
      winningsBalance: split.winnings,
    };
  });
}
