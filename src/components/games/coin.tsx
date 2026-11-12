// Coin games (play-only coins, never withdrawable) — v48 rules.
// Keno: pick 3 of 1–10, draw 5; 2 matches ×1, 3 matches ×6.5.
// Memory Match: 4 pairs; ≤5 moves ×2, 6 ×1.15, 7 ×0.6, 8 ×0.3 (v48 exact).
// Whack-a-Mole: 30s; golden +10, normal +3, bomb −10 (v48 export exact);
// multiplier = max(points, 0) / 110, capped ×2 (continuous).
// Scratch Card: decide-first — ×10 2%, ×5 6%, ×2 22.5%, blank 69.5%.

"use client";

import { useEffect, useRef, useState } from "react";
import { fmtCoins } from "../../lib/api";
import { GameDef } from "../../lib/games";
import { RoomShell, StakeChips, useGameRoom } from "./shared";

function useCoin(game: GameDef, subtitle: string, intro?: string) {
  const room = useGameRoom(game);
  const [stake, setStake] = useState(5);
  const [msg, setMsg] = useState(intro ?? subtitle);
  return { room, stake, setStake, msg, setMsg };
}

// ---------------- Keno ----------------
export function KenoRoom({ game }: { game: GameDef }) {
  const { room, stake, setStake, msg, setMsg } = useCoin(game, "Pick 3 numbers from 1–10 — the draw picks 5. 2 matches pays ×1, 3 matches pays ×6.5.", "Tap 3 numbers to pick them, then draw. The draw picks 5 — 2 matches pays ×1, 3 matches pays ×6.5.");
  const [picked, setPicked] = useState<number[]>([]);
  const [drawn, setDrawn] = useState<number[]>([]);
  const [done, setDone] = useState(false);
  const toggle = (n: number) => {
    if (done) return;
    setPicked((p) => (p.includes(n) ? p.filter((x) => x !== n) : p.length < 3 ? [...p, n] : p));
  };
  const draw = async () => {
    if (picked.length !== 3) { setMsg("Pick 3 numbers first."); return; }
    const pool = Array.from({ length: 10 }, (_, i) => i + 1);
    const d: number[] = [];
    while (d.length < 5) { const n = pool.splice(Math.floor(Math.random() * pool.length), 1)[0]; d.push(n); }
    setDrawn(d);
    setDone(true);
    const hits = picked.filter((n) => d.includes(n)).length;
    const mult = hits === 3 ? 6.5 : hits === 2 ? 1 : 0;
    const payout = Math.round(stake * mult);
    setMsg(hits >= 2 ? `${hits} matches — ×${mult}! ${fmtCoins(payout)} coins` : `${hits} match${hits === 1 ? "" : "es"} — no win this draw.`);
    await room.settle(stake, payout, { picked, drawn: d, hits });
  };
  const reset = () => { setPicked([]); setDrawn([]); setDone(false); };
  return (
    <RoomShell game={game} subtitle="Pick 3 numbers from 1–10 — the draw picks 5. 2 matches pays ×1, 3 matches pays ×6.5." stats={room.stats} history={room.history}>
      <div className="xg-controls">
        <StakeChips stake={stake} setStake={setStake} currency="coins" disabled={done} />
        <div className="keno-grid" role="group" aria-label="Pick 3 numbers">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" className={`keno-num${picked.includes(n) ? " picked" : ""}${drawn.includes(n) ? " drawn" : ""}`} aria-pressed={picked.includes(n)} onClick={() => toggle(n)} disabled={done}>{n}</button>
          ))}
        </div>
        {!done && <button className="btn btn-gold xg-action" type="button" onClick={() => void draw()} disabled={picked.length !== 3}>Draw · {stake} coins</button>}
        {done && <button className="btn btn-ghost xg-action" type="button" onClick={reset}>Play again</button>}
        <p className="bottle-msg xg-msg">{msg}</p>
        {done && <p className="xg-msg">Your picks: {picked.join(", ")} · Drawn: {drawn.join(", ")} · Hits: {picked.filter((n) => drawn.includes(n)).length}</p>}
      </div>
    </RoomShell>
  );
}

// ---------------- Memory Match ----------------
const MEM_SYMBOLS = ["♠", "♥", "♦", "♣", "★", "◆", "●", "▲"];
function memTier(moves: number) { return moves <= 5 ? 2 : moves === 6 ? 1.15 : moves === 7 ? 0.6 : moves === 8 ? 0.3 : 0; }
export function MemoryRoom({ game }: { game: GameDef }) {
  const { room, stake, setStake, msg, setMsg } = useCoin(game, "Find all 4 pairs — clear in 5 moves for ×2.", "Tap Start, then flip two cards at a time to find the 4 pairs. Clear the board in 5 moves for ×2.");
  const [deck, setDeck] = useState<string[]>([]);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [started, setStarted] = useState(false);
  const [over, setOver] = useState(false);
  const start = () => {
    const d = [...MEM_SYMBOLS.slice(0, 4), ...MEM_SYMBOLS.slice(0, 4)].sort(() => Math.random() - 0.5);
    setDeck(d); setFlipped([]); setMatched([]); setMoves(0); setStarted(true); setOver(false);
    setMsg("Tap two cards to find a pair.");
  };
  const flip = (i: number) => {
    if (!started || over || flipped.includes(i) || matched.includes(i) || flipped.length === 2) return;
    const f = [...flipped, i];
    setFlipped(f);
    if (f.length === 2) {
      const m = moves + 1;
      setMoves(m);
      if (deck[f[0]] === deck[f[1]]) {
        const nm = [...matched, ...f];
        setMatched(nm);
        setFlipped([]);
        if (nm.length === 8) {
          const mult = memTier(m);
          const payout = Math.round(stake * mult);
          setOver(true);
          setMsg(mult > 1 ? `All 4 pairs in ${m} moves — ×${mult}! ${fmtCoins(payout)} coins` : mult > 0 ? `All 4 pairs in ${m} moves — ×${mult}, ${fmtCoins(payout)} coins back` : `All 4 pairs, but ${m} moves is past the last paying tier (8). Nothing back.`);
          void room.settle(stake, payout, { moves: m, mult });
        } else setMsg(`Pair found — ${nm.length / 2} of 4.`);
      } else {
        setTimeout(() => setFlipped([]), 700);
      }
    }
  };
  return (
    <RoomShell game={game} subtitle="Find all 4 pairs — clear in 5 moves for ×2." stats={room.stats} history={room.history}>
      <div className="xg-controls">
        <StakeChips stake={stake} setStake={setStake} currency="coins" disabled={started && !over} />
        <div className="mem-grid">
          {deck.map((s, i) => (
            <button key={i} type="button" className={`mem-card${flipped.includes(i) || matched.includes(i) ? " up" : ""}`} onClick={() => flip(i)} disabled={!started || over}>
              {flipped.includes(i) || matched.includes(i) ? s : "?"}
            </button>
          ))}
        </div>
        <div className="mem-hud">Moves: {moves} · Pairs: {matched.length / 2}/4</div>
        {(!started || over) && <button className="btn btn-gold xg-action" type="button" onClick={start}>{over ? "Play again" : `Start · ${stake} coins`}</button>}
        <p className="bottle-msg xg-msg">{msg}</p>
      </div>
    </RoomShell>
  );
}

// ---------------- Whack-a-Mole ----------------
export function WhackRoom({ game }: { game: GameDef }) {
  const { room, stake, setStake, msg, setMsg } = useCoin(game, "30 seconds — whack the moles. Golden moles are worth 10, normal moles 3, bomb moles cost 10. Your multiplier is points ÷ 110, up to ×2.", "Tap the moles as they pop up — golden +10, normal +3, bomb −10. Your multiplier is points ÷ 110, up to ×2.");
  const [playing, setPlaying] = useState(false);
  const [score, setScore] = useState(0);
  const [time, setTime] = useState(30);
  const [active, setActive] = useState<{ hole: number; kind: "golden" | "normal" | "bomb" } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const spawnRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scoreRef = useRef(0);

  const end = async (finalScore: number) => {
    setPlaying(false);
    setActive(null);
    if (timerRef.current) clearInterval(timerRef.current);
    if (spawnRef.current) clearInterval(spawnRef.current);
    // v48 export: continuous multiplier = max(points, 0) / 110, capped ×2.
    // Bombs can drive points below zero; a negative score pays nothing.
    const mult = Math.min(2, Math.max(0, finalScore) / 110);
    const payout = Math.round(stake * mult);
    setMsg(mult > 0 ? `${finalScore} points — ×${mult.toFixed(2)}! ${fmtCoins(payout)} coins` : `${finalScore} points — no payout this time.`);
    await room.settle(stake, payout, { score: finalScore, mult: Math.round(mult * 100) / 100 });
  };

  const start = () => {
    setScore(0); scoreRef.current = 0; setTime(30); setPlaying(true);
    setMsg("Whack! Golden moles are +10, normal +3 — leave the bomb moles alone, tapping one costs 10.");
    timerRef.current = setInterval(() => {
      setTime((t) => {
        if (t <= 1) { void end(scoreRef.current); return 0; }
        return t - 1;
      });
    }, 1000);
    spawnRef.current = setInterval(() => {
      // v48 export spawn mix: 10% bomb, 20% golden, 70% normal.
      const r = Math.random();
      const kind = r < 0.10 ? "bomb" : r < 0.30 ? "golden" : "normal";
      setActive({ hole: Math.floor(Math.random() * 9), kind });
      setTimeout(() => setActive((a) => (a ? null : a)), 600);
    }, 900);
  };

  const whack = (hole: number) => {
    if (!playing || !active || active.hole !== hole) return;
    // v48 export economy: golden +10, normal +3, bomb −10 (round goes on).
    const pts = active.kind === "golden" ? 10 : active.kind === "bomb" ? -10 : 3;
    scoreRef.current += pts;
    setScore(scoreRef.current);
    setActive(null);
  };

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); if (spawnRef.current) clearInterval(spawnRef.current); }, []);

  return (
    <RoomShell game={game} subtitle="30 seconds — whack the moles. Golden moles are worth 10, normal moles 3, bomb moles cost 10. Your multiplier is points ÷ 110, up to ×2." stats={room.stats} history={room.history}>
      <div className="xg-controls">
        <StakeChips stake={stake} setStake={setStake} currency="coins" disabled={playing} />
        <div className="wm-hud">Time: {time}s · Points: {score}</div>
        <div className="wm-grid">
          {Array.from({ length: 9 }, (_, i) => (
            <button key={i} type="button" className={`wm-hole${active?.hole === i ? ` ${active.kind === "golden" ? "golden" : active.kind === "bomb" ? "bomb" : "up"}` : ""}`} onClick={() => whack(i)} disabled={!playing} aria-label={`Hole ${i + 1}`}>
              {active?.hole === i ? (active.kind === "golden" ? "★" : active.kind === "bomb" ? "💣" : "●") : ""}
            </button>
          ))}
        </div>
        {!playing && <button className="btn btn-gold xg-action" type="button" onClick={start}>Start · {stake} coins</button>}
        <p className="bottle-msg xg-msg">{msg}</p>
      </div>
    </RoomShell>
  );
}

// ---------------- Scratch Card ----------------
// v48 export: decide-first with exact weights — ×10 2%, ×5 6%, ×2 22.5%,
// blank 69.5%. The outcome is decided before the board is built; the
// board is then constructed to pay exactly that tier (one winning line
// for a prize tier, no paying line at all for a blank card).
const SC_PRIZES: Record<string, number> = { gold: 10, silver: 5, bronze: 2 };
const SC_LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
function scratchBest(cells: string[]): { mult: number; sym: string } {
  let best = 0;
  let bestSym = "";
  for (const [a, b, c] of SC_LINES) {
    if (cells[a] === cells[b] && cells[b] === cells[c] && SC_PRIZES[cells[a]] && SC_PRIZES[cells[a]] > best) {
      best = SC_PRIZES[cells[a]];
      bestSym = cells[a];
    }
  }
  return { mult: best, sym: bestSym };
}
function buildScratchBoard(targetMult: number): { cells: string[]; sym: string } {
  const syms = ["gold", "silver", "bronze", "star", "coin"];
  const prizeSym = targetMult === 10 ? "gold" : targetMult === 5 ? "silver" : targetMult === 2 ? "bronze" : "";
  for (let attempt = 0; attempt < 200; attempt++) {
    const board = Array.from({ length: 9 }, () => syms[Math.floor(Math.random() * syms.length)]);
    if (prizeSym) {
      // Force the top row to the prize symbol.
      board[0] = board[1] = board[2] = prizeSym;
    }
    const { mult } = scratchBest(board);
    if (mult === targetMult) return { cells: board, sym: prizeSym };
  }
  // Fallback (effectively unreachable): a board with no paying line.
  return { cells: ["gold", "silver", "bronze", "star", "coin", "gold", "silver", "star", "coin"], sym: "" };
}
export function ScratchRoom({ game }: { game: GameDef }) {
  const { room, stake, setStake, msg, setMsg } = useCoin(game, "Scratch all 9 — match 3 of a kind. Three gold pays ×10, silver ×5, bronze ×2.", "Buy a card, then tap each square to scratch it off. Match 3 of a kind — three gold pays ×10, silver ×5, bronze ×2.");
  const [cells, setCells] = useState<string[]>([]);
  const [revealed, setRevealed] = useState<boolean[]>(Array(9).fill(false));
  const [done, setDone] = useState(false);
  const start = () => {
    // Decide the outcome FIRST, with the export's exact weights.
    const roll = Math.random();
    const targetMult = roll < 0.02 ? 10 : roll < 0.08 ? 5 : roll < 0.305 ? 2 : 0;
    const { cells: board } = buildScratchBoard(targetMult);
    setCells(board);
    setRevealed(Array(9).fill(false));
    setDone(false);
    setMsg("Tap each square to scratch it off.");
  };
  const scratch = (i: number) => {
    if (done || revealed[i] || cells.length === 0) return;
    const r = [...revealed];
    r[i] = true;
    setRevealed(r);
    if (r.every(Boolean)) {
      const { mult: best, sym: bestSym } = scratchBest(cells);
      const payout = Math.round(stake * best);
      setDone(true);
      setMsg(best > 0 ? `Three ${bestSym}! ×${best} — ${fmtCoins(payout)} coins` : "No match of three — better luck next card.");
      void room.settle(stake, payout, { best, bestSym });
    }
  };
  const glyph = (s: string) => (s === "gold" ? "★" : s === "silver" ? "◆" : s === "bronze" ? "●" : s === "star" ? "✦" : "◉");
  return (
    <RoomShell game={game} subtitle="Scratch all 9 — match 3 of a kind. Three gold pays ×10." stats={room.stats} history={room.history}>
      <div className="xg-controls">
        <StakeChips stake={stake} setStake={setStake} currency="coins" disabled={cells.length > 0 && !done} />
        <div className="sc-grid">
          {cells.map((s, i) => (
            <button key={i} type="button" className={`sc-cell${revealed[i] ? " open" : ""}`} onClick={() => scratch(i)}>
              {revealed[i] ? glyph(s) : "✦"}
            </button>
          ))}
        </div>
        {(cells.length === 0 || done) && <button className="btn btn-gold xg-action" type="button" onClick={start}>{done ? "New card" : `Buy card · ${stake} coins`}</button>}
        <p className="bottle-msg xg-msg">{msg}</p>
      </div>
    </RoomShell>
  );
}
