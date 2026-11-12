/**
 * Royale Gold game catalogue — ported from the v48 artifact export
 * (~/workspace/your_files/casino-homepage/casino-homepage.html).
 *
 * Cash games settle in GH₵, coin games settle in coins. Never mix.
 * maxMultiplier is the server-side ceiling enforced by /api/games/settle.
 * Sources: v48 tile "mult" text + in-game ladders (Penalty ladder
 * [1.56, 2.6, 4.16, 7.28, 12.5]; Plinko 8-row bins, tile "Edges ×29";
 * Limbo pays target × 0.97, max target 20 → 19.4; Mini Roulette green
 * zero ×36; Mines top prize ×5,000; crash display cap ×50).
 * Where the artifact gives no hard ceiling, the cap is a documented v1
 * ceiling — see API_CONTRACT.md.
 */

export type Currency = "cash" | "coins";

export interface GameDef {
  slug: string;
  name: string;
  currency: Currency;
  maxMultiplier: number;
  note: string;
}

export const CASH_GAMES: GameDef[] = [
  { slug: "aviator-gold", name: "Aviator Gold", currency: "cash", maxMultiplier: 50, note: "Crash engine, display cap ×50" },
  { slug: "jet-fly", name: "Jet Fly", currency: "cash", maxMultiplier: 50, note: "Crash engine, display cap ×50" },
  { slug: "car-crash", name: "Car Crash", currency: "cash", maxMultiplier: 50, note: "Crash engine, display cap ×50" },
  { slug: "rocket-shooter", name: "Rocket Shooter", currency: "cash", maxMultiplier: 50, note: "Crash engine, display cap ×50" },
  { slug: "penalty-shoot-out", name: "Penalty Shoot Out", currency: "cash", maxMultiplier: 12.5, note: "5-shot ladder top rung ×12.5" },
  { slug: "mines", name: "Mines", currency: "cash", maxMultiplier: 5000, note: "Top prize ×5,000" },
  { slug: "plinko", name: "Plinko Drop", currency: "cash", maxMultiplier: 29, note: "8 rows / 9 bins, edge ×29" },
  { slug: "coin-flip", name: "Coin Flip", currency: "cash", maxMultiplier: 2, note: "Pays ×2" },
  { slug: "dice-roll", name: "Dice Roll", currency: "cash", maxMultiplier: 5, note: "Exactly 7 pays ×5" },
  { slug: "lucky-wheel", name: "Lucky Wheel", currency: "cash", maxMultiplier: 4, note: "Top prize ×4" },
  { slug: "hi-lo", name: "Hi-Lo", currency: "cash", maxMultiplier: 50, note: "Chain ×1.9 a card; v1 ceiling ×50" },
  { slug: "rock-paper-scissors", name: "Rock Paper Scissors", currency: "cash", maxMultiplier: 2, note: "Win the throw ×2" },
  { slug: "limbo", name: "Limbo", currency: "cash", maxMultiplier: 19.4, note: "Target × 0.97, max target 20" },
  { slug: "red-or-black", name: "Red or Black", currency: "cash", maxMultiplier: 8, note: "Chain doubles to ×8" },
  { slug: "war", name: "War", currency: "cash", maxMultiplier: 2, note: "Higher card ×2" },
  { slug: "pick-a-box", name: "Pick-a-Box", currency: "cash", maxMultiplier: 1.8, note: "Find the gold ×1.8" },
  { slug: "mini-roulette", name: "Mini Roulette", currency: "cash", maxMultiplier: 36, note: "European wheel: red/black ×2, green zero ×36 (v48 export)" },
  { slug: "texas-poker-room", name: "Texas Poker Room", currency: "cash", maxMultiplier: 20, note: "Best hand wins; v1 ceiling ×20" },
  { slug: "spin-da-bottle", name: "Spin Da Bottle", currency: "cash", maxMultiplier: 2, note: "v1 ceiling ×2" },
  { slug: "blackjack-vip", name: "Blackjack VIP", currency: "cash", maxMultiplier: 2.5, note: "Blackjack 3:2" },
  { slug: "royale-roulette", name: "Royale Roulette", currency: "cash", maxMultiplier: 36, note: "Straight-up ×36" },
];

export const COIN_GAMES: GameDef[] = [
  { slug: "fruit-ninja", name: "Fruit Ninja", currency: "coins", maxMultiplier: 10, note: "v1 ceiling ×10" },
  { slug: "candy-crush", name: "Candy Crush", currency: "coins", maxMultiplier: 3, note: "≥500 pts ×1, ≥1000 ×2, ≥1500 ×3 (v48 export)" },
  { slug: "tetris", name: "Tetris", currency: "coins", maxMultiplier: 3, note: "≥800 pts ×1, ≥1500 ×2, ≥2500 ×3, max ×3 (v48 export)" },
  { slug: "whack-a-mole", name: "Whack-a-Mole", currency: "coins", maxMultiplier: 2, note: "Multiplier = points / 110, capped ×2 (v48 export)" },
  { slug: "memory-match", name: "Memory Match", currency: "coins", maxMultiplier: 2, note: "Clear in ≤5 · ×2" },
  { slug: "scratch-card", name: "Scratch Card", currency: "coins", maxMultiplier: 10, note: "Decide-first: ×10 2%, ×5 6%, ×2 22.5%, blank 69.5% (v48 export)" },
  { slug: "keno", name: "Keno", currency: "coins", maxMultiplier: 6.5, note: "Pick 3 of 1–10, draw 5; 2 matches ×1, 3 matches ×6.5 (v48 export)" },
  // Trivia / Snake / 2048 use flat coin payouts, not multipliers.
  // Their ceilings here are max flat payout / 5-coin entry.
  { slug: "trivia", name: "Trivia", currency: "coins", maxMultiplier: 5, note: "Entry 5; 7→10, 9→15, 10→25 coins (max ×5)" },
  { slug: "snake", name: "Snake", currency: "coins", maxMultiplier: 8, note: "Entry 5; 100+→10, 200+→20, 300+→40 coins" },
  { slug: "2048", name: "2048", currency: "coins", maxMultiplier: 10, note: "Entry 5; 256→10, 512→20, 1024→50 coins" },
];

export const ALL_GAMES: GameDef[] = [...CASH_GAMES, ...COIN_GAMES];

export const GAME_MAP: Record<string, GameDef> = Object.fromEntries(
  ALL_GAMES.map((g) => [g.slug, g]),
);

export function getGame(slug: string): GameDef | undefined {
  return GAME_MAP[slug];
}
