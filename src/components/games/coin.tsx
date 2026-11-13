// Coin games (play-only coins, never withdrawable) — v48 rules.
// Keno: pick 3 of 1–10, draw 5; 2 matches ×1, 3 matches ×6.5.
// Memory Match: 4 pairs; ≤5 moves ×2, 6 ×1.15, 7 ×0.6, 8 ×0.3 (v48 exact).
// Whack-a-Mole: 30s; golden +10, normal +3, bomb −10 (v48 export exact);
// multiplier = max(points, 0) / 110, capped ×2 (continuous).
// Scratch Card: decide-first — ×10 2%, ×5 6%, ×2 22.5%, blank 69.5%.
// Round 17 restore vs the v48 artifact: real foil scratch canvas (per
// panel, destination-out erase, 42% threshold, coin cursor), SVG prize
// medallions, Keno staggered ball reveal + Quick pick, Memory SVG faces
// + gold card backs + matched "done" state, Whack real mole/bomb SVG
// faces sliding out of dirt holes + bonk squash + live PAYS chip.
// Payouts, odds and settle calls are unchanged.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const [shownBalls, setShownBalls] = useState<number[]>([]);
  const [done, setDone] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const timersRef = useRef<number[]>([]);
  useEffect(() => () => { timersRef.current.forEach((t) => clearTimeout(t)); }, []);

  const toggle = (n: number) => {
    if (done || drawing) return;
    setPicked((p) => (p.includes(n) ? p.filter((x) => x !== n) : p.length < 3 ? [...p, n] : p));
  };
  const quickPick = () => {
    if (done || drawing) return;
    const pool = Array.from({ length: 10 }, (_, i) => i + 1);
    const q: number[] = [];
    while (q.length < 3) q.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    setPicked(q);
    setMsg(`Quick pick: ${q.join(", ")} — hit Draw when ready.`);
  };
  const settleDraw = async (d: number[]) => {
    const hits = picked.filter((n) => d.includes(n)).length;
    const mult = hits === 3 ? 6.5 : hits === 2 ? 1 : 0;
    const payout = Math.round(stake * mult);
    setDone(true);
    setDrawing(false);
    setMsg(hits >= 2 ? `${hits} matches — ×${mult}! ${fmtCoins(payout)} coins` : `${hits} match${hits === 1 ? "" : "es"} — no win this draw.`);
    await room.settle(stake, payout, { picked, drawn: d, hits });
  };
  const draw = () => {
    if (picked.length !== 3 || done || drawing) { if (picked.length !== 3) setMsg("Pick 3 numbers first."); return; }
    const pool = Array.from({ length: 10 }, (_, i) => i + 1);
    const d: number[] = [];
    while (d.length < 5) { const n = pool.splice(Math.floor(Math.random() * pool.length), 1)[0]; d.push(n); }
    setDrawn(d);
    setShownBalls([]);
    setDrawing(true);
    // v48: balls drop one at a time (~190ms apart); each ball marks its
    // grid number drawn (green "hit" when it is one of your picks) and
    // the round settles only after the last ball lands.
    d.forEach((num, i) => {
      const t = window.setTimeout(() => {
        setShownBalls((prev) => [...prev, num]);
        if (i === d.length - 1) void settleDraw(d);
      }, 190 * (i + 1));
      timersRef.current.push(t);
    });
  };
  const reset = () => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
    setPicked([]); setDrawn([]); setShownBalls([]); setDone(false); setDrawing(false);
  };
  return (
    <RoomShell game={game} subtitle="Pick 3 numbers from 1–10 — the draw picks 5. 2 matches pays ×1, 3 matches pays ×6.5." stats={room.stats} history={room.history}>
      <div className="xg-controls xg-coin">
        <StakeChips stake={stake} setStake={setStake} currency="coins" disabled={done || drawing} />
        <div className="keno-grid" role="group" aria-label="Pick 3 numbers">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" className={`keno-num${picked.includes(n) ? " picked" : ""}${shownBalls.includes(n) ? (picked.includes(n) ? " hit" : " drawn") : ""}`} aria-pressed={picked.includes(n)} aria-label={`Number ${n}`} onClick={() => toggle(n)} disabled={done || drawing}>{n}</button>
          ))}
        </div>
        <div className="keno-balls" aria-live="polite">
          {shownBalls.map((n, i) => (
            <span key={`${i}-${n}`} className="keno-ball">{n}</span>
          ))}
        </div>
        {!done && (
          <div className="keno-actions">
            <button className="btn btn-ghost xg-action" type="button" onClick={quickPick} disabled={drawing}>Quick pick</button>
            <button className="btn btn-gold xg-action" type="button" onClick={draw} disabled={picked.length !== 3 || drawing}>{drawing ? "Drawing…" : `Draw · ${stake} coins`}</button>
          </div>
        )}
        {done && <button className="btn btn-ghost xg-action" type="button" onClick={reset}>Play again</button>}
        <p className="bottle-msg xg-msg">{msg}</p>
        {done && <p className="xg-msg">Your picks: {picked.join(", ")} · Drawn: {drawn.join(", ")} · Hits: {picked.filter((n) => drawn.includes(n)).length}</p>}
      </div>
    </RoomShell>
  );
}

// ---------------- Memory Match ----------------
// v48 artifact faces: illustrated SVG medallions (spade / heart / diamond
// / club in a cream disc with a gold ring) and a gold diamond-emblem back.
const MEM_GLYPHS = [
  `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="21" fill="#FFF6D8" stroke="#C99612" stroke-width="2.4"/><circle cx="24" cy="24" r="16.5" fill="none" stroke="rgba(201,150,18,.55)" stroke-width="1.2" stroke-dasharray="3 3.4"/><g transform="translate(12 11)"><path fill="#14213D" d="M12 2C9 6.5 4 9.3 4 13.6A4.9 4.9 0 0 0 8.9 18.5c1.2 0 2.3-.5 3.1-1.2-.2 2-1 3.4-2.3 4.7h5.6C13.9 20.7 13.2 19.3 13 17.3c.8.7 1.9 1.2 3.1 1.2a4.9 4.9 0 0 0 4.9-4.9C20 9.3 15 6.5 12 2z"/></g></svg>`,
  `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="21" fill="#FFF6D8" stroke="#C99612" stroke-width="2.4"/><circle cx="24" cy="24" r="16.5" fill="none" stroke="rgba(201,150,18,.55)" stroke-width="1.2" stroke-dasharray="3 3.4"/><g transform="translate(12 12)"><path fill="#C22828" d="M12 20C5 15 3 11 3 7.8 3 5.2 5 3.5 7.4 3.5c1.8 0 3.6 1 4.6 2.6.9-1.6 2.7-2.6 4.6-2.6C19 3.5 21 5.2 21 7.8 21 11 19 15 12 20z"/></g></svg>`,
  `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="21" fill="#FFF6D8" stroke="#C99612" stroke-width="2.4"/><circle cx="24" cy="24" r="16.5" fill="none" stroke="rgba(201,150,18,.55)" stroke-width="1.2" stroke-dasharray="3 3.4"/><path fill="#C22828" d="M24 9 L36 24 L24 39 L12 24 Z"/><path fill="#E04545" d="M24 9 L36 24 L24 24 Z" opacity=".55"/></svg>`,
  `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="21" fill="#FFF6D8" stroke="#C99612" stroke-width="2.4"/><circle cx="24" cy="24" r="16.5" fill="none" stroke="rgba(201,150,18,.55)" stroke-width="1.2" stroke-dasharray="3 3.4"/><g fill="#14213D"><circle cx="24" cy="15.5" r="6.6"/><circle cx="16" cy="26" r="6.6"/><circle cx="32" cy="26" r="6.6"/><path d="M24 23 l-3.4 10 h6.8 Z"/></g></svg>`,
];
const MEM_BACK = `<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="7" y="5" width="34" height="38" rx="6" fill="#C99612" stroke="#9A7410" stroke-width="2"/><path d="M24 14 l8 10 -8 10 -8-10 Z" fill="none" stroke="#FFF6D8" stroke-width="2"/><path d="M24 19 l4.5 5 -4.5 5 -4.5-5 Z" fill="#FFF6D8" opacity=".65"/></svg>`;
function memTier(moves: number) { return moves <= 5 ? 2 : moves === 6 ? 1.15 : moves === 7 ? 0.6 : moves === 8 ? 0.3 : 0; }
function shuffledDeck() {
  const d = [0, 0, 1, 1, 2, 2, 3, 3];
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}
export function MemoryRoom({ game }: { game: GameDef }) {
  const { room, stake, setStake, msg, setMsg } = useCoin(game, "Find all 4 pairs — clear in 5 moves for ×2.", "Tap Start, then flip two cards at a time to find the 4 pairs. Clear the board in 5 moves for ×2.");
  // v48: the 8 gold-backed cards are dealt face-down on load, before Start.
  // Shuffled in an effect (not during render) — Math.random() in render
  // breaks the production prerender of /games/memory-match.
  const [deck, setDeck] = useState<number[]>([0, 0, 1, 1, 2, 2, 3, 3]);
  useEffect(() => { setDeck(shuffledDeck()); }, []);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [started, setStarted] = useState(false);
  const [over, setOver] = useState(false);
  const start = () => {
    setDeck(shuffledDeck()); setFlipped([]); setMatched([]); setMoves(0); setStarted(true); setOver(false);
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
        // v48 flip-back delay: 640ms.
        setTimeout(() => setFlipped([]), 640);
      }
    }
  };
  return (
    <RoomShell game={game} subtitle="Find all 4 pairs — clear in 5 moves for ×2." stats={room.stats} history={room.history}>
      <div className="xg-controls xg-coin">
        <StakeChips stake={stake} setStake={setStake} currency="coins" disabled={started && !over} />
        <div className="mem-hud">
          <span className="xg-chip">MOVES <b>{moves}</b></span>
          <span className="xg-chip">PAIRS <b>{matched.length / 2}/4</b></span>
        </div>
        <div className="mem-grid">
          {deck.map((s, i) => {
            const up = flipped.includes(i) || matched.includes(i);
            const isDone = matched.includes(i);
            return (
              <button key={i} type="button" className={`mem-card${up ? " up" : ""}${isDone ? " done" : ""}`} onClick={() => flip(i)} disabled={!started || over || isDone} aria-label={`Card ${i + 1}${up ? " — face up" : ""}`}>
                {up ? <span className="mem-face" dangerouslySetInnerHTML={{ __html: MEM_GLYPHS[s] }} /> : <span className="mm-back" dangerouslySetInnerHTML={{ __html: MEM_BACK }} />}
              </button>
            );
          })}
        </div>
        {(!started || over) && <button className="btn btn-gold xg-action" type="button" onClick={start}>{over ? "Play again" : `Start · ${stake} coins`}</button>}
        <p className="bottle-msg xg-msg">{msg}</p>
      </div>
    </RoomShell>
  );
}

// ---------------- Whack-a-Mole ----------------
// v48 artifact faces, verbatim: a brown mole face and a round bomb.
const WM_FACE = `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="9" cy="13" r="6.5" fill="#7A4E22"/><circle cx="9" cy="13" r="3" fill="#E8A0A8"/><circle cx="39" cy="13" r="6.5" fill="#7A4E22"/><circle cx="39" cy="13" r="3" fill="#E8A0A8"/><path d="M8 22a17 15 0 0 1 32 0l-3-1.4a13.5 11.5 0 0 0-26 0Z" fill="#6E451D" opacity=".55"/><path d="M17 6.4q7-6.4 14 0" stroke="#5E3A16" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M19 9.6q5-3.4 10 0" stroke="#8A5A2B" stroke-width="2.2" fill="none" stroke-linecap="round"/><circle cx="16.5" cy="19.5" r="3.1" fill="#171A29"/><circle cx="17.6" cy="18.4" r="1.15" fill="#FFFFFF"/><circle cx="31.5" cy="19.5" r="3.1" fill="#171A29"/><circle cx="32.6" cy="18.4" r="1.15" fill="#FFFFFF"/><ellipse cx="10.5" cy="27" rx="3.4" ry="2.2" fill="#E86A7A" opacity=".4"/><ellipse cx="37.5" cy="27" rx="3.4" ry="2.2" fill="#E86A7A" opacity=".4"/><ellipse cx="24" cy="31.5" rx="11.5" ry="8.5" fill="#F2D5B8"/><ellipse cx="24" cy="38.6" rx="7.5" ry="2.4" fill="#D9AE7E" opacity=".7"/><ellipse cx="24" cy="27.8" rx="4.8" ry="3.4" fill="#E86A7A" stroke="#B23A48" stroke-width="1.2"/><circle cx="22.4" cy="27.8" r=".9" fill="#B23A48"/><circle cx="25.6" cy="27.8" r=".9" fill="#B23A48"/><ellipse cx="22.2" cy="26.2" rx="1.5" ry=".8" fill="#FFB3B5"/><path d="M24 31.2v2.6M17.5 37.2q6.5 4.4 13 0" stroke="#6E451D" stroke-width="1.8" fill="none" stroke-linecap="round"/><rect x="20.8" y="34.8" width="6.4" height="5.6" rx="1.2" fill="#FFFFFF" stroke="#C9CFDD" stroke-width="1"/><path d="M24 35.2v4.8" stroke="#C9CFDD" stroke-width="1"/><path d="M3.5 28l7.5 1.6M4.5 34.5l7-.6M44.5 28L37 29.6M43.5 34.5l-7-.6" stroke="#5E3A16" stroke-width="1.3" opacity=".6" stroke-linecap="round"/></svg>`;
const WM_BOMB = `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M27 11q8-7 13-3" stroke="#8A5A2B" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M41 3.4l1.3 3.4 3.4 1.3-3.4 1.3L41 12.8l-1.3-3.4-3.4-1.3 3.4-1.3z" fill="#FF9E2C"/><path d="M41 6l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" fill="#FFD964"/><rect x="20.5" y="9" width="7" height="6.5" rx="1.6" fill="#C99612" stroke="#9A7410" stroke-width="1.2"/><circle cx="24" cy="29" r="14.5" fill="#2A2F45" stroke="#10131F" stroke-width="2"/><ellipse cx="18" cy="21.5" rx="5.4" ry="3.4" fill="#FFFFFF" opacity=".38" transform="rotate(-28 18 21.5)"/><circle cx="30" cy="35" r="4.6" fill="#171A29" opacity=".5"/></svg>`;
type MoleKind = "golden" | "normal" | "bomb";
export function WhackRoom({ game }: { game: GameDef }) {
  const { room, stake, setStake, msg, setMsg } = useCoin(game, "30 seconds — whack the moles. Golden moles are worth 10, normal moles 3, bomb moles cost 10. Your multiplier is points ÷ 110, up to ×2.", "Tap the moles as they pop up — golden +10, normal +3, bomb −10. Your multiplier is points ÷ 110, up to ×2.");
  const [playing, setPlaying] = useState(false);
  const [score, setScore] = useState(0);
  const [time, setTime] = useState(30);
  const [active, setActive] = useState<{ hole: number; kind: MoleKind } | null>(null);
  const [bonked, setBonked] = useState<{ hole: number; kind: MoleKind } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const spawnRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bonkRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spawnToken = useRef(0);
  const scoreRef = useRef(0);

  const spawnMole = useCallback(() => {
    // v48 export spawn mix: 10% bomb, 20% golden, 70% normal.
    const r = Math.random();
    const kind: MoleKind = r < 0.10 ? "bomb" : r < 0.30 ? "golden" : "normal";
    const token = ++spawnToken.current;
    setActive({ hole: Math.floor(Math.random() * 9), kind });
    // Token-guarded hide: a later spawn's mole is never cleared by an
    // earlier mole's timeout (the old code cleared whatever was active).
    hideRef.current = setTimeout(() => { if (spawnToken.current === token) setActive(null); }, 600);
  }, []);

  const end = async (finalScore: number) => {
    setPlaying(false);
    setActive(null);
    setBonked(null);
    if (timerRef.current) clearInterval(timerRef.current);
    if (spawnRef.current) clearInterval(spawnRef.current);
    if (hideRef.current) clearTimeout(hideRef.current);
    if (bonkRef.current) clearTimeout(bonkRef.current);
    // v48 export: continuous multiplier = max(points, 0) / 110, capped ×2.
    // Bombs can drive points below zero; a negative score pays nothing.
    const mult = Math.min(2, Math.max(0, finalScore) / 110);
    const payout = Math.round(stake * mult);
    setMsg(mult > 0 ? `${finalScore} points — ×${mult.toFixed(2)}! ${fmtCoins(payout)} coins` : `${finalScore} points — no payout this time.`);
    await room.settle(stake, payout, { score: finalScore, mult: Math.round(mult * 100) / 100 });
  };

  const start = () => {
    setScore(0); scoreRef.current = 0; setTime(30); setPlaying(true); setBonked(null);
    setMsg("Whack! Golden moles are +10, normal +3 — leave the bomb moles alone, tapping one costs 10.");
    timerRef.current = setInterval(() => {
      setTime((t) => {
        if (t <= 1) { void end(scoreRef.current); return 0; }
        return t - 1;
      });
    }, 1000);
    spawnMole(); // v48: first mole pops immediately, not after 900ms.
    spawnRef.current = setInterval(spawnMole, 900);
  };

  const whack = (hole: number) => {
    if (!playing || !active || active.hole !== hole) return;
    // v48 export economy: golden +10, normal +3, bomb −10 (round goes on).
    const pts = active.kind === "golden" ? 10 : active.kind === "bomb" ? -10 : 3;
    scoreRef.current += pts;
    setScore(scoreRef.current);
    if (hideRef.current) clearTimeout(hideRef.current);
    // v48 bonk: the mole squashes flat for 140ms instead of vanishing.
    setBonked({ hole, kind: active.kind });
    bonkRef.current = setTimeout(() => setBonked(null), 140);
    setActive(null);
  };

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (spawnRef.current) clearInterval(spawnRef.current);
    if (hideRef.current) clearTimeout(hideRef.current);
    if (bonkRef.current) clearTimeout(bonkRef.current);
  }, []);

  const liveMult = Math.min(2, Math.max(0, score) / 110);
  return (
    <RoomShell game={game} subtitle="30 seconds — whack the moles. Golden moles are worth 10, normal moles 3, bomb moles cost 10. Your multiplier is points ÷ 110, up to ×2." stats={room.stats} history={room.history}>
      <div className="xg-controls xg-coin">
        <StakeChips stake={stake} setStake={setStake} currency="coins" disabled={playing} />
        <div className="wm-hud">
          <span className="xg-chip">POINTS <b>{score}</b></span>
          <span className={`xg-chip${playing && time <= 5 ? " hot" : ""}`}>TIME <b>{time}s</b></span>
          <span className="xg-chip push">PAYS <b>×{liveMult.toFixed(2)}</b></span>
        </div>
        <div className="whack-grid">
          {Array.from({ length: 9 }, (_, i) => {
            const a = active?.hole === i ? active : null;
            const b = bonked?.hole === i ? bonked : null;
            const m = a ?? b;
            return (
              <button key={i} type="button" className="hole" onClick={() => whack(i)} disabled={!playing} aria-label={`Hole ${i + 1}${a ? ` — ${a.kind} mole up` : ""}`}>
                <span className={`mole${m ? ` ${m.kind}` : ""}${a ? " up" : ""}${b ? " bonked" : ""}`} dangerouslySetInnerHTML={{ __html: m && m.kind === "bomb" ? WM_BOMB : WM_FACE }} />
              </button>
            );
          })}
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

// Prize faces: the v48 artifact's SVG medallions (gold coin ×10, star ×5,
// cherry ×2, gem), plus a silver coin for the port's fifth filler symbol.
const SC_SYMS: Record<string, { svg: string; label: string }> = {
  gold: {
    label: "GOLD · ×10",
    svg: `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><radialGradient id="scg-gold" cx="35%" cy="30%" r="80%"><stop offset="0%" stop-color="#FFF3C4"/><stop offset="55%" stop-color="#F2C230"/><stop offset="100%" stop-color="#9A7410"/></radialGradient></defs><circle cx="12" cy="12" r="9.2" fill="url(#scg-gold)" stroke="#9A7410" stroke-width="1.8"/><circle cx="12" cy="12" r="6.6" fill="none" stroke="#9A7410" stroke-width="1" stroke-dasharray="2 2.2"/><path d="M12 7.6l1.3 2.9 3.1.3-2.3 2.1.7 3.1-2.8-1.6-2.8 1.6.7-3.1-2.3-2.1 3.1-.3z" fill="#B57F0E"/><ellipse cx="8.4" cy="8" rx="2.7" ry="1.5" fill="#FFE89A" opacity=".85" transform="rotate(-24 8.4 8)"/></svg>`,
  },
  silver: {
    label: "SILVER · ×5",
    svg: `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><radialGradient id="scg-silver" cx="38%" cy="30%" r="80%"><stop offset="0%" stop-color="#FFE2B0"/><stop offset="55%" stop-color="#F08A1D"/><stop offset="100%" stop-color="#B85E00"/></radialGradient></defs><path fill="url(#scg-silver)" stroke="#B57F0E" stroke-width="1.3" stroke-linejoin="round" d="M12 2.4l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.6l-6.1 3.4 1.4-6.8L2.2 9.5l6.9-.8z"/><path fill="#FFB35C" d="M12 5.2l1.9 4.2-4.6-.4z"/><circle cx="12" cy="12.4" r="1.6" fill="#FFD964"/></svg>`,
  },
  bronze: {
    label: "BRONZE · ×2",
    svg: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 13C10 8 13 5 18.6 3.8" stroke="#0B7A38" stroke-width="2" fill="none" stroke-linecap="round"/><ellipse cx="18.4" cy="4" rx="3.4" ry="1.8" fill="#35C26E" transform="rotate(-16 18.4 4)"/><defs><radialGradient id="scg-bronze" cx="35%" cy="30%" r="80%"><stop offset="0%" stop-color="#FFB3B5"/><stop offset="55%" stop-color="#E5322D"/><stop offset="100%" stop-color="#8F1712"/></radialGradient><radialGradient id="scg-bronze2" cx="35%" cy="30%" r="80%"><stop offset="0%" stop-color="#FF9A8A"/><stop offset="55%" stop-color="#C22828"/><stop offset="100%" stop-color="#7A0F0B"/></radialGradient></defs><circle cx="7.5" cy="16.5" r="4.6" fill="url(#scg-bronze)"/><circle cx="16" cy="18" r="4" fill="url(#scg-bronze2)"/><ellipse cx="5.8" cy="14.6" rx="1.7" ry="1.1" fill="#FFB3B5" transform="rotate(-28 5.8 14.6)"/><ellipse cx="14.4" cy="16.2" rx="1.4" ry=".9" fill="#FFB3B5" transform="rotate(-28 14.4 16.2)"/></svg>`,
  },
  star: {
    label: "GEM",
    svg: `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><radialGradient id="scg-star" cx="35%" cy="28%" r="85%"><stop offset="0%" stop-color="#EAF7FF"/><stop offset="55%" stop-color="#57B6FF"/><stop offset="100%" stop-color="#1D4E8F"/></radialGradient></defs><path d="M6.2 4h11.6L21 9.4 12 20 3 9.4z" fill="url(#scg-star)" stroke="#2B5EA7" stroke-width="1.4" stroke-linejoin="round"/><path d="M3 9.4h18M12 20L8.6 9.4 12 4l3.4 5.4L12 20M6.2 4l2.4 5.4M17.8 4l-2.4 5.4" stroke="#2B5EA7" stroke-width="1" fill="none" opacity=".65"/><path d="M6.4 5.2h4L8.6 8.6z" fill="#D8EFFF"/></svg>`,
  },
  coin: {
    label: "COIN",
    svg: `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><radialGradient id="scg-coin" cx="35%" cy="30%" r="80%"><stop offset="0%" stop-color="#FFFFFF"/><stop offset="55%" stop-color="#D8DCE6"/><stop offset="100%" stop-color="#8E94A6"/></radialGradient></defs><circle cx="12" cy="12" r="9.2" fill="url(#scg-coin)" stroke="#8E94A6" stroke-width="1.8"/><circle cx="12" cy="12" r="6.6" fill="none" stroke="#8E94A6" stroke-width="1" stroke-dasharray="2 2.2"/><text x="12" y="16.5" text-anchor="middle" font-size="10" font-weight="900" fill="#5A6076" font-family="monospace">₵</text></svg>`,
  },
};

// --- Real foil, v48-exact paint + erase (canvas 240×192) ---
// Brushed-metal foil: multi-stop silver/gold gradient, fine diagonal
// cross-hatch both ways, sparkle flecks, and an embossed edge (light
// top-left, dark bottom-right) so it reads as metal, not grey paint.
function paintFoil(cv: HTMLCanvasElement) {
  const x = cv.getContext("2d");
  if (!x) return;
  const W = cv.width, H = cv.height;
  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#DDE1EA"); g.addColorStop(0.28, "#A8AEBE"); g.addColorStop(0.45, "#E8DC9E");
  g.addColorStop(0.58, "#C9B25E"); g.addColorStop(0.72, "#9AA0B0"); g.addColorStop(1, "#7C8296");
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.strokeStyle = "rgba(255,255,255,.22)"; x.lineWidth = 4;
  for (let i = -H; i < W; i += 22) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + H, H); x.stroke(); }
  x.strokeStyle = "rgba(0,0,0,.10)"; x.lineWidth = 2;
  for (let i = -H; i < W; i += 22) { x.beginPath(); x.moveTo(i + H, 0); x.lineTo(i, H); x.stroke(); }
  // Sparkle flecks (fixed positions, so the foil is stable).
  x.fillStyle = "rgba(255,255,255,.5)";
  for (let i = 0; i < 14; i++) {
    const fx = ((i * 53) % 220) + 10, fy = ((i * 89) % 172) + 10;
    x.beginPath(); x.arc(fx, fy, 1.1, 0, 7); x.fill();
  }
  // Embossed edge.
  x.strokeStyle = "rgba(255,255,255,.55)"; x.lineWidth = 2;
  x.strokeRect(1, 1, W - 2, H - 2);
  x.strokeStyle = "rgba(0,0,0,.35)"; x.lineWidth = 1.5;
  x.strokeRect(3.5, 3.5, W - 7, H - 7);
  x.fillStyle = "rgba(40,45,60,.78)"; x.font = "900 17px Outfit, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
  x.fillText("✦ SCRATCH ✦", W / 2, H / 2 - 11);
  x.font = "900 21px monospace"; x.fillStyle = "rgba(122,82,0,.85)";
  x.fillText("₵", W / 2, H / 2 + 16);
}
function scratchPct(cv: HTMLCanvasElement): number {
  try {
    const x = cv.getContext("2d");
    if (!x) return 0;
    const d = x.getImageData(0, 0, cv.width, cv.height).data;
    let clear = 0, total = 0;
    for (let i = 3; i < d.length; i += 32) { total++; if (d[i] < 40) clear++; }
    return total ? clear / total : 0;
  } catch { return 0; }
}

function ScratchCell({ index, sym, cardId, forceReveal, onRevealed }: {
  index: number; sym: string; cardId: number; forceReveal: number; onRevealed: (i: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const doneRef = useRef(false);
  const dragRef = useRef({ down: false, lx: 0, ly: 0 });
  const [done, setDone] = useState(false);
  const onRevealedRef = useRef(onRevealed);
  onRevealedRef.current = onRevealed;

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setDone(true);
    onRevealedRef.current(index);
  }, [index]);

  // Fresh foil on every new card (canvas remounts via key, repaint here).
  useEffect(() => {
    const cv = canvasRef.current;
    if (cv) paintFoil(cv);
  }, [cardId]);
  // "Reveal all & settle" — finish this panel without scratching.
  useEffect(() => { if (forceReveal > 0) finish(); }, [forceReveal, finish]);

  const pos = (e: React.PointerEvent) => {
    const cv = canvasRef.current;
    if (!cv) return { x: 0, y: 0 };
    const r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) * cv.width / Math.max(1, r.width), y: (e.clientY - r.top) * cv.height / Math.max(1, r.height) };
  };
  const erase = (e: React.PointerEvent) => {
    const cv = canvasRef.current;
    const x = cv?.getContext("2d");
    if (!cv || !x) return;
    const p = pos(e);
    x.globalCompositeOperation = "destination-out";
    x.strokeStyle = "rgba(0,0,0,1)"; x.fillStyle = "rgba(0,0,0,1)";
    x.lineWidth = 30; x.lineCap = "round"; x.lineJoin = "round";
    x.beginPath(); x.moveTo(dragRef.current.lx, dragRef.current.ly); x.lineTo(p.x, p.y); x.stroke();
    x.beginPath(); x.arc(p.x, p.y, 15, 0, 7); x.fill();
    dragRef.current.lx = p.x; dragRef.current.ly = p.y;
  };
  const onDown = (e: React.PointerEvent) => {
    if (doneRef.current) return;
    dragRef.current.down = true;
    try { (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const p = pos(e);
    dragRef.current.lx = p.x; dragRef.current.ly = p.y;
    erase(e);
    e.preventDefault();
  };
  const onMove = (e: React.PointerEvent) => { if (dragRef.current.down && !doneRef.current) erase(e); };
  const onUp = () => {
    if (!dragRef.current.down) return;
    dragRef.current.down = false;
    const cv = canvasRef.current;
    // v48 threshold: >42% of the foil cleared counts the panel revealed.
    if (cv && !doneRef.current && scratchPct(cv) > 0.42) finish();
  };

  const prize = SC_SYMS[sym] ?? SC_SYMS.coin;
  return (
    <div className={`scratch-cell${done ? " burst" : ""}`}>
      <span className="sym" dangerouslySetInnerHTML={{ __html: `${prize.svg}<span class="sc-lab">${prize.label}</span>` }} />
      <canvas
        ref={canvasRef}
        className={`foil${done ? " done" : ""}`}
        width={240}
        height={192}
        role="img"
        aria-label={`Foil panel ${index + 1} — scratch with finger or mouse to reveal`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      />
    </div>
  );
}

export function ScratchRoom({ game }: { game: GameDef }) {
  const { room, stake, setStake, msg, setMsg } = useCoin(game, "Scratch all 9 — match 3 of a kind. Three gold pays ×10, silver ×5, bronze ×2.", "Buy a card, then scratch the foil off each panel with your finger or mouse. Match 3 of a kind — three gold pays ×10, silver ×5, bronze ×2.");
  const [cells, setCells] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [cardId, setCardId] = useState(0);
  const [forceReveal, setForceReveal] = useState(0);
  const doneRef = useRef(false);
  const revealedCount = useRef(0);
  const cellsRef = useRef<string[]>(cells);
  cellsRef.current = cells;
  const stakeRef = useRef(stake);
  stakeRef.current = stake;

  const doSettle = useCallback(async () => {
    if (doneRef.current) return;
    doneRef.current = true;
    setDone(true);
    const { mult: best, sym: bestSym } = scratchBest(cellsRef.current);
    const payout = Math.round(stakeRef.current * best);
    setMsg(best > 0 ? `Three ${bestSym}! ×${best} — ${fmtCoins(payout)} coins` : "No match of three — better luck next card.");
    await room.settle(stakeRef.current, payout, { best, bestSym });
  }, [room]);

  const onRevealed = (i: number) => {
    void i;
    revealedCount.current += 1;
    if (revealedCount.current >= 9) void doSettle();
  };

  const start = () => {
    // Decide the outcome FIRST, with the export's exact weights.
    const roll = Math.random();
    const targetMult = roll < 0.02 ? 10 : roll < 0.08 ? 5 : roll < 0.305 ? 2 : 0;
    const { cells: board } = buildScratchBoard(targetMult);
    setCells(board);
    revealedCount.current = 0;
    doneRef.current = false;
    setDone(false);
    setForceReveal(0);
    setCardId((c) => c + 1);
    setMsg("Scratch the foil off each panel with your finger or mouse — three of a kind pays.");
  };
  return (
    <RoomShell game={game} subtitle="Scratch all 9 — match 3 of a kind. Three gold pays ×10." stats={room.stats} history={room.history}>
      <div className="xg-controls xg-coin">
        <StakeChips stake={stake} setStake={setStake} currency="coins" disabled={cells.length > 0 && !done} />
        <div className={`scratch-grid${done ? " burst-all" : ""}`}>
          {cells.map((s, i) => (
            <ScratchCell key={`${cardId}-${i}`} index={i} sym={s} cardId={cardId} forceReveal={forceReveal} onRevealed={onRevealed} />
          ))}
        </div>
        {cells.length > 0 && !done && (
          <>
            <div className="sc-strip">SCRATCH THE FOIL OFF — MATCH 3 OF A KIND</div>
            <button className="btn btn-ghost xg-action" type="button" onClick={() => setForceReveal((t) => t + 1)}>Reveal all &amp; settle</button>
          </>
        )}
        {(cells.length === 0 || done) && <button className="btn btn-gold xg-action" type="button" onClick={start}>{done ? "New card" : `Buy card · ${stake} coins`}</button>}
        <p className="bottle-msg xg-msg">{msg}</p>
      </div>
    </RoomShell>
  );
}
