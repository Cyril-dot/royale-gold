// P1 Batch 3 (O17): the owner's RTP monitor — per-game ACTUAL RTP
// (total payouts / total stakes × 100, from GameResult) against the
// BASE RTP the tiles print (src/lib/tiles.ts — the same "97.0%" the
// homepage shows). READ-ONLY: it changes no game's maths or limits;
// the kill switch + per-game economics (Batch 2 O10) stay where they
// are, on the Games section.
//
// Flags: a game is OVER-PAYING when its actual RTP is more than 10
// points above its base, UNDER-PAYING when more than 10 points below —
// but only with 50+ rounds in the period. Below 50 rounds the sample
// is too small to flag, and the page says so. Skill games (Trivia,
// Snake, 2048, Brick Breaker, Stack Tower, Bubble Shooter, Bullseye
// Darts, Connect Four) print "Skill" on their tiles, not a number —
// they have NO base RTP, and the page says so instead of inventing one.
import { prisma } from "./prisma";
import { dec, round2 } from "./money";
import { TILE_GAMES } from "./tiles";

export type RtpStatus = "flagged-over" | "flagged-under" | "ok" | "small-sample" | "no-base";

export interface RtpRow {
  slug: string;
  name: string;
  currency: string;
  rounds: number;
  stakes: number;
  payouts: number;
  actualRtp: number | null;
  baseRtp: number | null;
  status: RtpStatus;
}

const FLAG_ROUNDS = 50;
const FLAG_POINTS = 10;

/** Parse a tile's base RTP ("97.0%" → 97, "Skill" → null). */
export function baseRtpFor(slug: string): number | null {
  const tile = TILE_GAMES.find((g) => g.slug === slug);
  if (!tile) return null;
  const m = /^(\d+(?:\.\d+)?)%$/.exec(tile.meta.rtp.trim());
  return m ? Number(m[1]) : null;
}

export async function rtpMonitor(from: string, to: string): Promise<{ from: string; to: string; rows: RtpRow[] }> {
  const groups = await prisma.gameResult.groupBy({
    by: ["game", "currency"],
    where: { createdAt: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T23:59:59.999Z`) } },
    _sum: { stake: true, payout: true },
    _count: true,
  });
  const byKey = new Map(groups.map((g) => [`${g.game}|${g.currency}`, g]));
  const rows: RtpRow[] = TILE_GAMES.map((g) => {
    const grp = byKey.get(`${g.slug}|${g.currency}`);
    const rounds = grp?._count ?? 0;
    const stakes = round2(dec(grp?._sum.stake));
    const payouts = round2(dec(grp?._sum.payout));
    const actualRtp = stakes > 0 ? round2((payouts / stakes) * 100) : null;
    const baseRtp = baseRtpFor(g.slug);
    let status: RtpStatus;
    if (baseRtp === null) status = "no-base";
    else if (rounds < FLAG_ROUNDS) status = "small-sample";
    else if (actualRtp === null) status = "small-sample";
    else if (actualRtp > baseRtp + FLAG_POINTS) status = "flagged-over";
    else if (actualRtp < baseRtp - FLAG_POINTS) status = "flagged-under";
    else status = "ok";
    return {
      slug: g.slug,
      name: g.name,
      currency: g.currency,
      rounds,
      stakes,
      payouts,
      actualRtp,
      baseRtp,
      status,
    };
  });
  // Flagged first, then the most-played.
  const rank = (s: RtpStatus) => (s === "flagged-over" || s === "flagged-under" ? 0 : 1);
  rows.sort((a, b) => rank(a.status) - rank(b.status) || b.rounds - a.rounds);
  return { from, to, rows };
}
