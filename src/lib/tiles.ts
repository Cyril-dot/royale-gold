// Homepage / Games-page tile metadata for the 29 games.
// Tile copy (RTP, min, players, badge, mult line, size) follows the v48
// export LIST where the game existed there; the seven games that were
// crash skins / rooms in v48 (Jet Fly, Car Crash, Rocket Shooter, Penalty,
// Fruit Ninja, Candy Crush, Tetris) take the matching room values.
// Covers are the supplied images in /public/covers — object-fit:contain
// with gradient side pillars, never cover; Mines + Spin Da Bottle art is
// shown whole as full-bleed art tiles, exactly as in v48.

import { ALL_GAMES, GameDef } from "./games";

export interface TileMeta {
  cover?: string; // /covers/... path
  fullArt?: boolean; // supplied art IS the whole tile
  glyph?: string; // CSS-art fallback when no cover exists
  rtp: string;
  min: string;
  players: number;
  size: "hero" | "wide" | "tall" | "cell";
  badge: "hot" | "new" | "live" | null;
  mult: string;
  tag: string; // filter category: crash | slots | table | arcade | live
  slots?: boolean; // in the export's "slots" filter (data-cats includes slots)
  hideMobile?: boolean;
  beginner?: boolean;
  top?: string; // artifact TOPW value, shown as the TOP ×n pill
  cssArt?: "blackjack"; // artifact CSS-art tile (fan of cards), not an image
}

const T: Record<string, TileMeta> = {
  "aviator-gold": { cover: "/covers/game-crash.webp", rtp: "97.0%", min: "GH₵ 1", players: 6745, size: "wide", badge: "hot", mult: "Crash · playable", tag: "crash" },
  "jet-fly": { cover: "/covers/cover-jet-fly.jpg", rtp: "97.0%", min: "GH₵ 1", players: 5120, size: "wide", badge: "hot", mult: "Crash · playable", tag: "crash" },
  "car-crash": { cover: "/covers/cover-car-crash.jpg", rtp: "97.0%", min: "GH₵ 1", players: 4380, size: "wide", badge: "hot", mult: "Crash · playable", tag: "crash" },
  "rocket-shooter": { cover: "/covers/cover-rocket.jpg", rtp: "97.0%", min: "GH₵ 1", players: 5108, size: "hero", badge: "hot", mult: "Skill · up to ×4", tag: "arcade" },
  "penalty-shoot-out": { cover: "/covers/cover-penalty.jpg", rtp: "97.2%", min: "GH₵ 1", players: 3210, size: "wide", badge: "new", mult: "Top rung ×12.5", tag: "arcade" },
  mines: { cover: "/covers/mines-art.png", fullArt: true, rtp: "97.5%", min: "GH₵ 1", players: 2210, size: "cell", badge: "new", mult: "Top prize ×5,000", tag: "arcade" },
  plinko: { cover: "/covers/cover-plinko.jpg", rtp: "99.0%", min: "GH₵ 1", players: 1950, size: "cell", badge: "new", mult: "Edges ×29 · playable", tag: "arcade" },
  "coin-flip": { cover: "/covers/cover-coin.jpg", rtp: "100%", min: "GH₵ 1", players: 2874, size: "cell", badge: "new", mult: "Pays ×2 · playable", tag: "arcade", beginner: true, top: "×2" },
  "dice-roll": { cover: "/covers/cover-dice.jpg", rtp: "97.2%", min: "GH₵ 1", players: 1932, size: "cell", badge: "new", mult: "Exactly 7 pays ×5", tag: "arcade", beginner: true, top: "×5" },
  "lucky-wheel": { cover: "/covers/cover-wheel.jpg", rtp: "95.8%", min: "GH₵ 1", players: 2417, size: "cell", badge: "new", mult: "Top prize ×4 · playable", tag: "arcade", beginner: true, top: "×4" },
  "hi-lo": { cover: "/covers/cover-hilo.jpg", rtp: "95%", min: "GH₵ 1", players: 1311, size: "cell", badge: "new", mult: "Chain ×1.9 a card", tag: "arcade", beginner: true, top: "×1.9" },
  "rock-paper-scissors": { cover: "/covers/cover-rps.jpg", rtp: "95%", min: "GH₵ 1", players: 1448, size: "cell", badge: "new", mult: "Win the throw ×2", tag: "arcade", beginner: true, top: "×2" },
  limbo: { cover: "/covers/cover-limbo.svg", rtp: "95%", min: "GH₵ 1", players: 1585, size: "cell", badge: "new", mult: "Climb to ×19.4", tag: "arcade", beginner: true, top: "×19.4" },
  "red-or-black": { cover: "/covers/cover-red-or-black.svg", rtp: "95%", min: "GH₵ 1", players: 1722, size: "cell", badge: "new", mult: "Chain doubles to ×8", tag: "arcade", beginner: true, top: "×8" },
  war: { cover: "/covers/cover-war.svg", rtp: "95%", min: "GH₵ 1", players: 1859, size: "cell", badge: "new", mult: "Higher card ×2", tag: "arcade", beginner: true, top: "×2" },
  "pick-a-box": { cover: "/covers/cover-pick-a-box.svg", rtp: "95%", min: "GH₵ 1", players: 1996, size: "cell", badge: "new", mult: "Find the gold ×1.8", tag: "arcade", beginner: true, top: "×1.8" },
  "mini-roulette": { cover: "/covers/game-roulette.webp", rtp: "95%", min: "GH₵ 1", players: 2681, size: "cell", badge: "new", mult: "Green zero ×36", tag: "table", beginner: true, top: "×36" },
  "texas-poker-room": { cover: "/covers/cover-texas-poker-room.svg", rtp: "97.8%", min: "GH₵ 10", players: 1187, size: "tall", badge: null, mult: "Best hand wins · playable", tag: "table" },
  "spin-da-bottle": { cover: "/covers/spin-da-bottle-art.png", fullArt: true, rtp: "96.8%", min: "GH₵ 1", players: 764, size: "hero", badge: "new", mult: "Pays ×2 · playable", tag: "arcade" },
  "blackjack-vip": { cssArt: "blackjack", rtp: "99.4%", min: "GH₵ 5", players: 932, size: "cell", badge: "live", mult: "Blackjack pays 3:2", tag: "live" },
  "royale-roulette": { cover: "/covers/game-roulette.webp", rtp: "97.3%", min: "GH₵ 2", players: 1874, size: "cell", badge: "live", mult: "Straight-up ×36", tag: "live", hideMobile: true },
  "fruit-ninja": { cover: "/covers/cover-fruit.jpg", rtp: "95%", min: "5 coins", players: 2640, size: "cell", badge: "new", mult: "Score 400 · ×4", tag: "arcade", beginner: true },
  "candy-crush": { cover: "/covers/cover-candy.jpg", rtp: "95%", min: "5 coins", players: 2510, size: "cell", badge: "new", mult: "500 pts ×1 · 1500 ×3", tag: "arcade", slots: true, beginner: true },
  tetris: { cover: "/covers/cover-tetris.jpg", rtp: "95%", min: "5 coins", players: 2380, size: "cell", badge: "new", mult: "Clear lines · ×3", tag: "arcade", beginner: true },
  "whack-a-mole": { cover: "/covers/cover-mole.jpg", rtp: "95%", min: "5 coins", players: 2407, size: "cell", badge: "new", mult: "Golden moles · up to ×2", tag: "arcade", beginner: true },
  "memory-match": { cover: "/covers/cover-memory-match.svg", rtp: "95%", min: "5 coins", players: 2270, size: "cell", badge: "new", mult: "Clear in ≤5 · ×2", tag: "arcade", beginner: true, top: "×2" },
  "scratch-card": { cover: "/covers/cover-scratch-card.svg", rtp: "95%", min: "5 coins", players: 2544, size: "cell", badge: "new", mult: "Match 3 · up to ×10", tag: "arcade", slots: true, beginner: true, top: "×10" },
  keno: { cover: "/covers/cover-keno.jpg", rtp: "95%", min: "5 coins", players: 2133, size: "cell", badge: "new", mult: "Match 3 · ×6.5", tag: "arcade", beginner: true, top: "×6.5" },
  trivia: { cover: "/covers/cover-trivia.svg", rtp: "Skill", min: "5 coins", players: 3120, size: "cell", badge: "new", mult: "10/10 pays 25 coins", tag: "arcade", beginner: true, top: "×5" },
  snake: { cover: "/covers/cover-snake.svg", rtp: "Skill", min: "5 coins", players: 2985, size: "cell", badge: "new", mult: "300+ pts pays 40 coins", tag: "arcade", beginner: true, top: "×8" },
  "2048": { cover: "/covers/cover-2048.svg", rtp: "Skill", min: "5 coins", players: 2740, size: "cell", badge: "new", mult: "Reach 1024 · 50 coins", tag: "arcade", beginner: true, top: "×10" },
  // Round 18 — 15 new games. Covers are crafted SVG scenes in
  // /public/covers (text-free, brand tokens). All badge "new".
  "balloon-burst": { cover: "/covers/cover-balloon-burst.svg", rtp: "97.0%", min: "GH₵ 1", players: 4230, size: "wide", badge: "new", mult: "Crash · playable", tag: "crash" },
  "golden-reels": { cover: "/covers/cover-golden-reels.svg", rtp: "96.5%", min: "GH₵ 1", players: 5100, size: "wide", badge: "new", mult: "777 pays ×20", tag: "arcade", slots: true, beginner: true, top: "×20" },
  baccarat: { cover: "/covers/cover-baccarat.svg", rtp: "98.9%", min: "GH₵ 1", players: 1870, size: "cell", badge: "new", mult: "Tie pays ×9", tag: "table" },
  "three-card-poker": { cover: "/covers/cover-three-card-poker.svg", rtp: "97.5%", min: "GH₵ 1", players: 1240, size: "cell", badge: "new", mult: "Trips pays ×5", tag: "table" },
  "sic-bo": { cover: "/covers/cover-sic-bo.svg", rtp: "97.0%", min: "GH₵ 1", players: 980, size: "cell", badge: "new", mult: "Totals pay to ×6", tag: "table" },
  "tower-climb": { cover: "/covers/cover-tower-climb.svg", rtp: "97.0%", min: "GH₵ 1", players: 3420, size: "cell", badge: "new", mult: "Top of Hard ×10", tag: "arcade" },
  "golden-catch": { cover: "/covers/cover-golden-catch.svg", rtp: "96.0%", min: "GH₵ 1", players: 2760, size: "cell", badge: "new", mult: "Golden koi ×2 a catch", tag: "arcade" },
  "gold-rush-derby": { cover: "/covers/cover-gold-rush-derby.svg", rtp: "96.0%", min: "GH₵ 1", players: 1980, size: "wide", badge: "new", mult: "Winner pays ×4", tag: "arcade" },
  "jacks-or-better": { cover: "/covers/cover-jacks-or-better.svg", rtp: "97.5%", min: "GH₵ 5", players: 1430, size: "cell", badge: "new", mult: "Royal Flush ×10", tag: "table" },
  "bingo-blitz": { cover: "/covers/cover-bingo-blitz.svg", rtp: "95%", min: "5 coins", players: 2890, size: "cell", badge: "new", mult: "Full house ×5", tag: "arcade", beginner: true, top: "×5" },
  "brick-breaker": { cover: "/covers/cover-brick-breaker.svg", rtp: "Skill", min: "5 coins", players: 2310, size: "cell", badge: "new", mult: "Clear the wall ×5", tag: "arcade" },
  "stack-tower": { cover: "/covers/cover-stack-tower.svg", rtp: "Skill", min: "5 coins", players: 2140, size: "cell", badge: "new", mult: "10 blocks ×5", tag: "arcade", beginner: true, top: "×5" },
  "bubble-shooter": { cover: "/covers/cover-bubble-shooter.svg", rtp: "Skill", min: "5 coins", players: 2470, size: "cell", badge: "new", mult: "Clear the board ×5", tag: "arcade" },
  "bullseye-darts": { cover: "/covers/cover-bullseye-darts.svg", rtp: "Skill", min: "5 coins", players: 1760, size: "cell", badge: "new", mult: "100+ points ×5", tag: "arcade", beginner: true, top: "×5" },
  "connect-four": { cover: "/covers/cover-connect-four.svg", rtp: "Skill", min: "5 coins", players: 2650, size: "cell", badge: "new", mult: "Win ×2", tag: "arcade", beginner: true, top: "×2" },
};

export interface TileGame extends GameDef {
  meta: TileMeta;
}

export const TILE_GAMES: TileGame[] = ALL_GAMES.map((g) => ({ ...g, meta: T[g.slug] ?? {
  // Round 17 (games page): a catalogue game with no tile entry yet must
  // still render instead of crashing the page (g.meta.tag access) or
  // vanishing. Plain fallback tile; a real T entry replaces it.
  rtp: "95%", min: g.currency === "coins" ? "5 coins" : "GH₵ 1", players: 0,
  size: "cell", badge: null, mult: "Playable", tag: "arcade",
} }));

// Games-page order = the v48 export's gp-card order (29 games), with the
// two port-only live-table games (Blackjack VIP, Royale Roulette) appended.
// Round 17: any catalogue game NOT in this order is appended after it, in
// catalogue order — the page must show every game in the catalogue, so a
// game added to games.ts can never silently miss the page (the count text
// reads list.length of TILE_GAMES.length, i.e. N of N for whatever N is).
const GAMES_PAGE_ORDER = [
  "car-crash", "jet-fly", "penalty-shoot-out", "rocket-shooter",
  "fruit-ninja", "candy-crush", "tetris", "lucky-wheel", "spin-da-bottle",
  "mines", "plinko", "aviator-gold", "texas-poker-room", "dice-roll",
  "coin-flip", "hi-lo", "rock-paper-scissors", "limbo", "red-or-black",
  "war", "pick-a-box", "keno", "memory-match", "whack-a-mole",
  "scratch-card", "mini-roulette", "trivia", "snake", "2048",
  "blackjack-vip", "royale-roulette",
  // Round 18 — the 15 new games, in catalogue order.
  "balloon-burst", "golden-reels", "baccarat", "three-card-poker",
  "sic-bo", "tower-climb", "golden-catch", "gold-rush-derby",
  "jacks-or-better", "bingo-blitz", "brick-breaker", "stack-tower",
  "bubble-shooter", "bullseye-darts", "connect-four",
];
const orderedSlugs = new Set(GAMES_PAGE_ORDER);
export const GAMES_PAGE_GAMES: TileGame[] = [
  ...GAMES_PAGE_ORDER.map(
    (slug) => TILE_GAMES.find((g) => g.slug === slug)!,
  ).filter(Boolean),
  ...TILE_GAMES.filter((g) => !orderedSlugs.has(g.slug)),
];

export const TOP_PLAYERS = [
  { name: "Kwame A.", amount: 12480, game: "Aviator Gold" },
  { name: "Ama S.", amount: 9320, game: "Penalty Shoot Out" },
  { name: "Kofi D.", amount: 7150, game: "Mines" },
  { name: "Efua M.", amount: 5400, game: "Lucky Wheel" },
  { name: "Yaw B.", amount: 4100, game: "Plinko Drop" },
];

export const LIVE_WINS = [
  { name: "Adwoa", amount: 320, game: "Coin Flip" },
  { name: "Selasi", amount: 1250, game: "Jet Fly" },
  { name: "Nana", amount: 86, game: "Dice Roll" },
  { name: "Akosua", amount: 640, game: "Car Crash" },
  { name: "Mensah", amount: 210, game: "Hi-Lo" },
];
