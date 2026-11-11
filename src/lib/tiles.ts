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
  hideMobile?: boolean;
  beginner?: boolean;
}

const T: Record<string, TileMeta> = {
  "aviator-gold": { cover: "/covers/game-crash.webp", rtp: "97.0%", min: "GH₵ 1", players: 6745, size: "wide", badge: "hot", mult: "Crash · playable", tag: "crash" },
  "jet-fly": { cover: "/covers/cover-jet-fly.jpg", rtp: "97.0%", min: "GH₵ 1", players: 5120, size: "wide", badge: "hot", mult: "Crash · playable", tag: "crash" },
  "car-crash": { cover: "/covers/cover-car-crash.jpg", rtp: "97.0%", min: "GH₵ 1", players: 4380, size: "wide", badge: "hot", mult: "Crash · playable", tag: "crash" },
  "rocket-shooter": { cover: "/covers/cover-rocket.jpg", rtp: "97.0%", min: "GH₵ 1", players: 5108, size: "hero", badge: "hot", mult: "Crash · playable", tag: "crash" },
  "penalty-shoot-out": { cover: "/covers/cover-penalty.jpg", rtp: "97.2%", min: "GH₵ 1", players: 3210, size: "wide", badge: "new", mult: "Top rung ×12.5", tag: "arcade" },
  mines: { cover: "/covers/mines-art.png", fullArt: true, rtp: "97.5%", min: "GH₵ 1", players: 2210, size: "cell", badge: "new", mult: "Top prize ×5,000", tag: "arcade" },
  plinko: { cover: "/covers/cover-plinko.jpg", rtp: "99.0%", min: "GH₵ 1", players: 1950, size: "cell", badge: "new", mult: "Edges ×29 · playable", tag: "arcade" },
  "coin-flip": { cover: "/covers/cover-coin.jpg", rtp: "100%", min: "GH₵ 1", players: 2874, size: "cell", badge: "new", mult: "Pays ×2 · playable", tag: "arcade", beginner: true },
  "dice-roll": { cover: "/covers/cover-dice.jpg", rtp: "97.2%", min: "GH₵ 1", players: 1932, size: "cell", badge: "new", mult: "Exactly 7 pays ×5", tag: "arcade", beginner: true },
  "lucky-wheel": { cover: "/covers/cover-wheel.jpg", rtp: "95.8%", min: "GH₵ 1", players: 2417, size: "cell", badge: "new", mult: "Top prize ×4 · playable", tag: "arcade", beginner: true },
  "hi-lo": { cover: "/covers/cover-hilo.jpg", rtp: "95%", min: "GH₵ 1", players: 1311, size: "cell", badge: "new", mult: "Chain ×1.9 a card", tag: "arcade", beginner: true },
  "rock-paper-scissors": { cover: "/covers/cover-rps.jpg", rtp: "95%", min: "GH₵ 1", players: 1448, size: "cell", badge: "new", mult: "Win the throw ×2", tag: "arcade", beginner: true },
  limbo: { glyph: "×19.4", rtp: "95%", min: "GH₵ 1", players: 1585, size: "cell", badge: "new", mult: "Climb to ×19.4", tag: "arcade", beginner: true },
  "red-or-black": { glyph: "♥♦", rtp: "95%", min: "GH₵ 1", players: 1722, size: "cell", badge: "new", mult: "Chain doubles to ×8", tag: "arcade", beginner: true },
  war: { glyph: "♠ K", rtp: "95%", min: "GH₵ 1", players: 1859, size: "cell", badge: "new", mult: "Higher card ×2", tag: "arcade", beginner: true },
  "pick-a-box": { glyph: "▣", rtp: "95%", min: "GH₵ 1", players: 1996, size: "cell", badge: "new", mult: "Find the gold ×1.8", tag: "arcade", beginner: true },
  "mini-roulette": { cover: "/covers/game-roulette.webp", rtp: "95%", min: "GH₵ 1", players: 2681, size: "cell", badge: "new", mult: "Green zero ×36", tag: "table", beginner: true },
  "texas-poker-room": { glyph: "♠♥", rtp: "97.8%", min: "GH₵ 10", players: 1187, size: "tall", badge: null, mult: "Best hand wins · playable", tag: "table" },
  "spin-da-bottle": { cover: "/covers/spin-da-bottle-art.png", fullArt: true, rtp: "96.8%", min: "GH₵ 1", players: 764, size: "hero", badge: "new", mult: "Pays ×2 · playable", tag: "arcade" },
  "blackjack-vip": { glyph: "♠ 21", rtp: "99.4%", min: "GH₵ 5", players: 932, size: "cell", badge: "live", mult: "Blackjack pays 3:2", tag: "live", hideMobile: true },
  "royale-roulette": { cover: "/covers/game-roulette.webp", rtp: "97.3%", min: "GH₵ 2", players: 1874, size: "cell", badge: "live", mult: "Straight-up ×36", tag: "live", hideMobile: true },
  "fruit-ninja": { cover: "/covers/cover-fruit.jpg", rtp: "95%", min: "5 coins", players: 2640, size: "cell", badge: "new", mult: "Score 400 · ×4", tag: "arcade", beginner: true },
  "candy-crush": { cover: "/covers/cover-candy.jpg", rtp: "95%", min: "5 coins", players: 2510, size: "cell", badge: "new", mult: "Match-3 cascades", tag: "arcade", beginner: true },
  tetris: { cover: "/covers/cover-tetris.jpg", rtp: "95%", min: "5 coins", players: 2380, size: "cell", badge: "new", mult: "Clear lines · ×10", tag: "arcade", beginner: true },
  "whack-a-mole": { cover: "/covers/cover-mole.jpg", rtp: "95%", min: "5 coins", players: 2407, size: "cell", badge: "new", mult: "Golden moles · up to ×2", tag: "arcade", beginner: true },
  "memory-match": { glyph: "◆◆", rtp: "95%", min: "5 coins", players: 2270, size: "cell", badge: "new", mult: "Clear in ≤5 · ×2", tag: "arcade", beginner: true },
  "scratch-card": { glyph: "✦", rtp: "95%", min: "5 coins", players: 2544, size: "cell", badge: "new", mult: "Match 3 · up to ×10", tag: "arcade", beginner: true },
  keno: { cover: "/covers/cover-keno.jpg", rtp: "95%", min: "5 coins", players: 2133, size: "cell", badge: "new", mult: "Match 3 · ×6.5", tag: "arcade", beginner: true },
  trivia: { glyph: "?", rtp: "Skill", min: "5 coins", players: 3120, size: "cell", badge: "new", mult: "10/10 pays 25 coins", tag: "arcade", beginner: true },
  snake: { glyph: "≈", rtp: "Skill", min: "5 coins", players: 2985, size: "cell", badge: "new", mult: "300+ pts pays 40 coins", tag: "arcade", beginner: true },
  "2048": { glyph: "2048", rtp: "Skill", min: "5 coins", players: 2740, size: "cell", badge: "new", mult: "Reach 1024 · 50 coins", tag: "arcade", beginner: true },
};

export interface TileGame extends GameDef {
  meta: TileMeta;
}

export const TILE_GAMES: TileGame[] = ALL_GAMES.map((g) => ({ ...g, meta: T[g.slug] }));

export const TOP_PLAYERS = [
  { name: "Kwame A.", amount: 12480, game: "Aviator Gold" },
  { name: "Ama S.", amount: 9320, game: "Penalty Shoot Out" },
  { name: "Kofi D.", amount: 7150, game: "Mines" },
  { name: "Efua M.", amount: 5400, game: "Lucky Wheel" },
  { name: "Yaw B.", amount: 4100, game: "Plinko" },
];

export const LIVE_WINS = [
  { name: "Adwoa", amount: 320, game: "Coin Flip" },
  { name: "Selasi", amount: 1250, game: "Jet Fly" },
  { name: "Nana", amount: 86, game: "Dice Roll" },
  { name: "Akosua", amount: 640, game: "Car Crash" },
  { name: "Mensah", amount: 210, game: "Hi-Lo" },
];
