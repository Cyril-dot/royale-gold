// Economy math test (round 6) — pure functions from src/lib/economy.ts +
// src/lib/play.ts, run through tsx. No server needed. Seeded RNG so the
// rates are reproducible. Asserts:
//  - SIM win rate ≈ 2x natural at p=0.5 and p=1/37 (roulette straight-up)
//  - LIVE factor: 1.00 @ GH₵0, 0.95 @ GH₵100, 0.75 @ GH₵500, 0.50 @ GH₵1000+
//  - LIVE win rate falls as lifetime deposits rise, never below the floor
//  - SIM win probability never exceeds the 0.90 cap
// Run: npx tsx economy-test.ts   (from ~/workspace/royale-gold)

import { adjustedWinProb, drawWin, liveWinFactor, SIM_WIN_BOOST, SIM_WIN_PROB_CAP } from "./src/lib/economy";
import { drawRoulette, rouletteNaturalProb } from "./src/lib/play";

// Mulberry32 — small seeded RNG.
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rate(natural: number, factor: number, n: number, seed: number): number {
  const r = rng(seed);
  let wins = 0;
  for (let i = 0; i < n; i++) if (drawWin(natural, factor, r)) wins++;
  return wins / n;
}

function check(name: string, cond: boolean, detail: string): void {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name} — ${detail}`);
  if (!cond) process.exitCode = 1;
}

const N = 200_000;

// --- LIVE factor curve ---
check("factor @ GH₵0 = 1.00", liveWinFactor(0) === 1, `got ${liveWinFactor(0)}`);
check("factor @ GH₵99 = 1.00", liveWinFactor(99) === 1, `got ${liveWinFactor(99)}`);
check("factor @ GH₵100 = 0.95", liveWinFactor(100) === 0.95, `got ${liveWinFactor(100)}`);
check("factor @ GH₵500 = 0.75", liveWinFactor(500) === 0.75, `got ${liveWinFactor(500)}`);
check("factor @ GH₵999 = 0.55", liveWinFactor(999) === 0.55, `got ${liveWinFactor(999)}`);
check("factor @ GH₵1000 = 0.50", liveWinFactor(1000) === 0.5, `got ${liveWinFactor(1000)}`);
check("factor @ GH₵5000 = 0.50 (floor)", liveWinFactor(5000) === 0.5, `got ${liveWinFactor(5000)}`);

// --- SIM boost at p=0.5 (coin-flip-like) ---
const sim50 = rate(0.5, SIM_WIN_BOOST, N, 11);
check("SIM win rate @ p=0.5 ≈ 0.90 (capped)", Math.abs(sim50 - 0.9) < 0.01, `got ${sim50.toFixed(4)} (natural 0.50, boost x2 -> 1.00 capped 0.90)`);
const live0 = rate(0.5, liveWinFactor(0), N, 12);
check("LIVE win rate @ GH₵0, p=0.5 ≈ 0.50", Math.abs(live0 - 0.5) < 0.01, `got ${live0.toFixed(4)}`);
const live500 = rate(0.5, liveWinFactor(500), N, 13);
check("LIVE win rate @ GH₵500, p=0.5 ≈ 0.375", Math.abs(live500 - 0.375) < 0.01, `got ${live500.toFixed(4)}`);
const liveFloor = rate(0.5, liveWinFactor(5000), N, 14);
check("LIVE win rate @ GH₵5000, p=0.5 ≈ 0.25 (floor)", Math.abs(liveFloor - 0.25) < 0.01, `got ${liveFloor.toFixed(4)}`);
check("LIVE falls with deposits", live0 > live500 && live500 > liveFloor, `${live0.toFixed(3)} > ${live500.toFixed(3)} > ${liveFloor.toFixed(3)}`);
check("SIM clearly above LIVE @ same stakes", sim50 > live0 + 0.3, `SIM ${sim50.toFixed(3)} vs LIVE@0 ${live0.toFixed(3)}`);

// --- Roulette straight-up (p=1/37) through the real draw function ---
function rouletteRate(factor: number, n: number, seed: number): { win: number; pocketOk: number } {
  const r = rng(seed);
  let wins = 0, pocketOk = 0;
  for (let i = 0; i < n; i++) {
    const d = drawRoulette("straight", 7, factor, r);
    if (d.won) wins++;
    if (d.won === (d.pocket === 7)) pocketOk++;
  }
  return { win: wins / n, pocketOk: pocketOk / n };
}
const nat = rouletteNaturalProb("straight");
const rSim = rouletteRate(SIM_WIN_BOOST, N, 21);
const rLive0 = rouletteRate(liveWinFactor(0), N, 22);
const rLive500 = rouletteRate(liveWinFactor(500), N, 23);
const rLiveFloor = rouletteRate(liveWinFactor(5000), N, 24);
console.log(`roulette straight-up natural p=${nat.toFixed(4)}: SIM ${rSim.win.toFixed(4)} (expect ~${(nat * 2).toFixed(4)}) | LIVE@0 ${rLive0.win.toFixed(4)} | LIVE@500 ${rLive500.win.toFixed(4)} (expect ~${(nat * 0.75).toFixed(4)}) | LIVE@floor ${rLiveFloor.win.toFixed(4)} (expect ~${(nat * 0.5).toFixed(4)})`);
check("roulette SIM ≈ 2x natural", Math.abs(rSim.win - nat * 2) < 0.004, `got ${rSim.win.toFixed(4)}`);
check("roulette LIVE@500 ≈ 0.75x natural", Math.abs(rLive500.win - nat * 0.75) < 0.004, `got ${rLive500.win.toFixed(4)}`);
check("roulette LIVE@floor ≈ 0.5x natural", Math.abs(rLiveFloor.win - nat * 0.5) < 0.004, `got ${rLiveFloor.win.toFixed(4)}`);
check("roulette pocket always matches won", rSim.pocketOk === 1 && rLive0.pocketOk === 1, `pocketOk SIM ${rSim.pocketOk}, LIVE ${rLive0.pocketOk}`);

// --- Red/black (p=18/37) — SIM cap binds ---
const rbSim = rate(18 / 37, SIM_WIN_BOOST, N, 31);
check("red/black SIM capped at 0.90", Math.abs(rbSim - SIM_WIN_PROB_CAP) < 0.01, `got ${rbSim.toFixed(4)} (natural 0.4865 x2 = 0.973 -> cap 0.90)`);

// --- adjustedWinProb never exceeds cap, never negative ---
check("adjustedWinProb caps at 0.90", adjustedWinProb(0.99, 5) === SIM_WIN_PROB_CAP, `got ${adjustedWinProb(0.99, 5)}`);
check("adjustedWinProb floor 0", adjustedWinProb(0.5, 0) === 0, `got ${adjustedWinProb(0.5, 0)}`);

// --- Per-game win chance (Nov 2026, win controls): the owner's base
// probability replaces the natural one, the LIVE factor still applies
// on top (base x factor). Unset = the natural path above (unchanged).
function rouletteRateBase(baseProb: number, factor: number, n: number, seed: number, sim = false): number {
  const r = rng(seed);
  let wins = 0;
  for (let i = 0; i < n; i++) if (drawRoulette("red", 1, factor, r, { baseProb, sim }).won) wins++;
  return wins / n;
}
const b100 = rouletteRateBase(1, liveWinFactor(0), 1000, 41);
check("base 100% LIVE@0 = always win", b100 === 1, `got ${b100}`);
const b0 = rouletteRateBase(0, liveWinFactor(0), 1000, 42);
check("base 0% LIVE@0 = never win", b0 === 0, `got ${b0}`);
const b50f50 = rouletteRateBase(0.5, liveWinFactor(5000), N, 43);
check("base 50% x LIVE floor 0.5 ≈ 0.25", Math.abs(b50f50 - 0.25) < 0.01, `got ${b50f50.toFixed(4)}`);
const b50live0 = rouletteRateBase(0.5, liveWinFactor(0), N, 44);
check("base 50% x LIVE@0 1.0 ≈ 0.50", Math.abs(b50live0 - 0.5) < 0.01, `got ${b50live0.toFixed(4)}`);
const b50sim = rouletteRateBase(0.5, SIM_WIN_BOOST, N, 45, true);
check("base 50% SIM = capped 0.90 (boost x2)", Math.abs(b50sim - 0.9) < 0.01, `got ${b50sim.toFixed(4)}`);

console.log(process.exitCode ? "ECONOMY MATH: FAILURES ABOVE" : "ECONOMY MATH: ALL PASS");
