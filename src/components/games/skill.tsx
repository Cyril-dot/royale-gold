// Skill coin games — Candy Crush (match-3, 30 moves), Tetris (lines),
// Trivia (difficulty + settings, 1 coin per right answer, server
// per-answer grading + full answer board), Snake (entry 5,
// 100+→10 / 200+→20 / 300+→40 coins), 2048 (entry 5, 256→10 / 512→20 /
// 1024→50 coins). Candy/Tetris payout tiers are the v48 export's exact
// tables: Candy ≥500 ×1, ≥1000 ×2, ≥1500 ×3; Tetris ≥800 ×1, ≥1500 ×2,
// ≥2500 ×3 (max ×3).
// Round 17 restore vs the v48 artifact (casino-homepage.html):
// Candy uses the artifact's real CSS candy (.cc-gem t0–t5, v48.css) on
// absolutely-positioned gliding pieces, drag-or-tap swap, artifact
// scoring (3=60, 4=120+line clear, 5=240+bonus cross, cascades ×2),
// no-standing-match + always-a-move deals and dead-board reshuffles.
// Tetris restores the artifact's 2-minute round timer, level speed-up
// (every 10 lines, 760ms × 0.8^level), SRS shapes + wall kicks, ghost
// piece, NEXT preview, keyboard controls and the v41 touch gestures
// (drag to move, tap to rotate, swipe down soft-drop, fast swipe down
// hard-drop) on the board. Trivia/Snake/2048 restore the artifact's
// timer bar, swipe controls, speed/score chips, per-value tile colours
// and the 2048 End-run button.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, fmtCoins } from "../../lib/api";
import { GameDef } from "../../lib/games";
import { playSfx } from "../../lib/store";
import { RoomShell, StakeChips, fireConfetti, useGameRoom } from "./shared";

const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));
const nextFrame = () => new Promise<void>((res) => requestAnimationFrame(() => requestAnimationFrame(() => res())));

// ---------------- Candy Crush ----------------
// Six real candy types, drawn in pure CSS by v48.css (.cc-gem t0–t5):
// t0 striped candy · t1 wrapped sweet · t2 jelly bean · t3 lollipop ·
// t4 gumdrop · t5 chocolate. CC_COLORS is only for the clear sparks.
const CC_COLORS = ["#FF5A4D", "#FF9E2C", "#3ED97E", "#57B6FF", "#B45CFF", "#FFD964"];
function candyTier(score: number) { return score >= 1500 ? 3 : score >= 1000 ? 2 : score >= 500 ? 1 : 0; }

interface CandyPiece { id: number; type: number; r: number; c: number }
interface CandyRun { dir: "h" | "v"; r: number; c: number; len: number; cells: [number, number][] }

function candyMatrix(pieces: CandyPiece[]): number[][] {
  const m = Array.from({ length: 8 }, () => Array(8).fill(-1));
  pieces.forEach((p) => { if (p.r >= 0 && p.r < 8 && p.c >= 0 && p.c < 8) m[p.r][p.c] = p.type; });
  return m;
}
/* GetMatches, ported from the artifact: every horizontal and vertical run of 3+ */
function findRunsIn(m: number[][]): CandyRun[] {
  const runs: CandyRun[] = [];
  for (let r = 0; r < 8; r++) {
    let c = 0;
    while (c < 8) {
      const t = m[r][c];
      if (t < 0) { c++; continue; }
      let k = c;
      while (k + 1 < 8 && m[r][k + 1] === t) k++;
      if (k - c + 1 >= 3) {
        const cells: [number, number][] = [];
        for (let i = 0; i < k - c + 1; i++) cells.push([r, c + i]);
        runs.push({ dir: "h", r, c, len: k - c + 1, cells });
      }
      c = k + 1;
    }
  }
  for (let c = 0; c < 8; c++) {
    let r = 0;
    while (r < 8) {
      const t = m[r][c];
      if (t < 0) { r++; continue; }
      let k = r;
      while (k + 1 < 8 && m[k + 1][c] === t) k++;
      if (k - r + 1 >= 3) {
        const cells: [number, number][] = [];
        for (let i = 0; i < k - r + 1; i++) cells.push([r + i, c]);
        runs.push({ dir: "v", r, c, len: k - r + 1, cells });
      }
      r = k + 1;
    }
  }
  return runs;
}
/* GetPotentialMatches, ported: try every swap, look for a match, swap back */
function hasMoveIn(m: number[][]): boolean {
  const dirs: [number, number][] = [[0, 1], [1, 0]];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    for (const [dr, dc] of dirs) {
      const r2 = r + dr, c2 = c + dc;
      if (r2 >= 8 || c2 >= 8) continue;
      const tmp = m[r][c]; m[r][c] = m[r2][c2]; m[r2][c2] = tmp;
      const ok = findRunsIn(m).length > 0;
      const tmp2 = m[r][c]; m[r][c] = m[r2][c2]; m[r2][c2] = tmp2;
      if (ok) return true;
    }
  }
  return false;
}
/* A fresh deal: no standing matches and at least one potential match */
function genCandyTypes(): number[][] {
  let m: number[][] = [];
  for (let tries = 0; tries < 80; tries++) {
    m = [];
    for (let r = 0; r < 8; r++) {
      m.push([]);
      for (let c = 0; c < 8; c++) {
        let t = 0;
        do { t = Math.floor(Math.random() * 6); }
        while ((c >= 2 && m[r][c - 1] === t && m[r][c - 2] === t) ||
               (r >= 2 && m[r - 1][c] === t && m[r - 2][c] === t));
        m[r].push(t);
      }
    }
    if (hasMoveIn(m)) return m;
  }
  return m;
}

export function CandyRoom({ game }: { game: GameDef }) {
  const room = useGameRoom(game);
  const [stake, setStake] = useState(5);
  const [pieces, setPieces] = useState<CandyPiece[]>([]);
  const [sel, setSel] = useState<[number, number] | null>(null);
  const [clearing, setClearing] = useState<Set<number>>(new Set());
  const [floats, setFloats] = useState<{ id: number; left: number; top: number; text: string }[]>([]);
  const [sparks, setSparks] = useState<{ id: number; left: number; top: number; dx: number; dy: number; color: string }[]>([]);
  const [moves, setMoves] = useState(30);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [msg, setMsg] = useState("Set your stake and start. 500+ pts returns your stake · 1,000+ pays ×2 · 1,500+ pays ×3. A swap that makes no match flips straight back and costs nothing.");
  const scoreRef = useRef(0);
  const movesRef = useRef(30);
  const busyRef = useRef(false);
  const playingRef = useRef(false);
  const piecesRef = useRef<CandyPiece[]>([]);
  piecesRef.current = pieces;
  const idRef = useRef(1);
  const boardInnerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ cell: [number, number]; x: number; y: number } | null>(null);
  const settleRef = useRef(room.settle);
  settleRef.current = room.settle;

  const piecesFromTypes = (m: number[][]): CandyPiece[] => {
    const out: CandyPiece[] = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) out.push({ id: idRef.current++, type: m[r][c], r, c });
    return out;
  };

  // The artifact deals the board on open, so the candies are visible
  // behind the idle card before the first Start.
  useEffect(() => {
    if (piecesRef.current.length === 0) setPieces(piecesFromTypes(genCandyTypes()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* clear → collapse → refill, looping while new matches form;
     cascade steps (chain 2 and beyond) pay double — artifact logic */
  const resolveBoard = async (startPieces: CandyPiece[]): Promise<CandyPiece[]> => {
    let cur = startPieces;
    let chain = 0;
    while (true) {
      const runs = findRunsIn(candyMatrix(cur));
      if (!runs.length) break;
      chain++;
      const clearSet = new Set<string>();
      let gained = 0;
      runs.forEach((run) => {
        gained += run.len >= 5 ? 240 : run.len === 4 ? 120 : 60;
        run.cells.forEach(([r, c]) => clearSet.add(`${r},${c}`));
        if (run.len >= 4) {
          if (run.dir === "h") { for (let i = 0; i < 8; i++) clearSet.add(`${run.r},${i}`); }
          else { for (let i = 0; i < 8; i++) clearSet.add(`${i},${run.c}`); }
          if (run.len >= 5) {
            const mid = run.cells[Math.floor(run.len / 2)];
            if (run.dir === "h") { for (let i = 0; i < 8; i++) clearSet.add(`${i},${mid[1]}`); }
            else { for (let i = 0; i < 8; i++) clearSet.add(`${mid[0]},${i}`); }
          }
        }
      });
      if (chain >= 2) gained *= 2;
      scoreRef.current += gained;
      setScore(scoreRef.current);
      playSfx("pop", room.muted);
      // floating score + burst sparks over the clear, then the pop
      const keys = [...clearSet];
      let sr = 0, sc = 0;
      keys.forEach((k) => { const [r, c] = k.split(",").map(Number); sr += r; sc += c; });
      const n = Math.max(1, keys.length);
      const fid = idRef.current++;
      setFloats((f) => [...f, { id: fid, left: ((sc / n) + 0.5) * 12.5, top: ((sr / n) + 0.5) * 12.5, text: (chain >= 2 ? "Cascade +" : "+") + gained }]);
      setTimeout(() => setFloats((f) => f.filter((x) => x.id !== fid)), 1020);
      const mat = candyMatrix(cur);
      const newSparks: { id: number; left: number; top: number; dx: number; dy: number; color: string }[] = [];
      keys.forEach((k) => {
        const [r, c] = k.split(",").map(Number);
        const col = mat[r][c] >= 0 ? CC_COLORS[mat[r][c]] : "#FFD964";
        for (let i = 0; i < 4; i++) {
          const ang = Math.random() * Math.PI * 2, dist = 26 + Math.random() * 34;
          newSparks.push({ id: idRef.current++, left: (c + 0.5) * 12.5, top: (r + 0.5) * 12.5, dx: Math.cos(ang) * dist, dy: Math.sin(ang) * dist - 14, color: i % 3 === 0 ? "#FFF3C4" : col });
        }
      });
      const sparkIds = new Set(newSparks.map((s) => s.id));
      setSparks((s) => [...s, ...newSparks]);
      setTimeout(() => setSparks((s) => s.filter((x) => !sparkIds.has(x.id))), 720);
      const clearingIds = new Set(cur.filter((p) => clearSet.has(`${p.r},${p.c}`)).map((p) => p.id));
      setClearing(clearingIds);
      setMsg((chain >= 2 ? "Cascade ×2! " : "") + `+${gained} pts — ${scoreRef.current} total, ${movesRef.current} ${movesRef.current === 1 ? "move" : "moves"} left.`);
      await sleep(230);
      cur = cur.filter((p) => !clearSet.has(`${p.r},${p.c}`));
      setClearing(new Set());
      setPieces(cur);
      // collapse: survivors fall, fresh candies spawn above the board
      // and glide in — artifact CreateNewCandyInSpecificColumns
      const next: CandyPiece[] = [];
      const spawned: { id: number; finalR: number }[] = [];
      for (let c = 0; c < 8; c++) {
        const col = cur.filter((p) => p.c === c).sort((a, b) => b.r - a.r);
        let write = 7;
        col.forEach((p) => { next.push({ ...p, r: write }); write--; });
        const fresh = write + 1;
        for (let r = write; r >= 0; r--) {
          const np: CandyPiece = { id: idRef.current++, type: Math.floor(Math.random() * 6), r: r - fresh, c };
          next.push(np);
          spawned.push({ id: np.id, finalR: r });
        }
      }
      setPieces(next);
      await nextFrame();
      const landed = next.map((p) => { const s = spawned.find((x) => x.id === p.id); return s ? { ...p, r: s.finalR } : p; });
      setPieces(landed);
      await sleep(300);
      cur = landed;
    }
    return cur;
  };

  const endRound = async () => {
    playingRef.current = false;
    setPlaying(false);
    setSel(null);
    const finalScore = scoreRef.current;
    setBest((b) => Math.max(b, finalScore));
    const mult = candyTier(finalScore);
    const payout = Math.round(stake * mult);
    setMsg(mult > 0 ? `Out of moves — ${finalScore} pts, ×${mult}! ${fmtCoins(payout)} coins` : `Out of moves — ${finalScore} pts, under 500. No payout.`);
    await settleRef.current(stake, payout, { score: finalScore, mult });
  };

  const attemptSwap = async (a: [number, number], b: [number, number]) => {
    if (busyRef.current || !playingRef.current) return;
    busyRef.current = true;
    setSel(null);
    const cur = piecesRef.current;
    const swapped = cur.map((p) => {
      if (p.r === a[0] && p.c === a[1]) return { ...p, r: b[0], c: b[1] };
      if (p.r === b[0] && p.c === b[1]) return { ...p, r: a[0], c: a[1] };
      return p;
    });
    setPieces(swapped);
    await sleep(250);
    if (!findRunsIn(candyMatrix(swapped)).length) {
      // no match produced — swap flips back and the move is not spent
      setPieces(cur);
      await sleep(250);
      setMsg("No match — the swap flips back and costs nothing. Line up three of a kind.");
      busyRef.current = false;
      return;
    }
    movesRef.current -= 1;
    setMoves(movesRef.current);
    const settled = await resolveBoard(swapped);
    if (movesRef.current <= 0) {
      await endRound();
    } else if (!hasMoveIn(candyMatrix(settled))) {
      // dead board — reshuffle the types until a move exists again
      const m = genCandyTypes();
      setPieces(settled.map((p) => ({ ...p, type: m[p.r][p.c] })));
      setMsg(`That board had no moves left — shuffled into a fresh one. ${movesRef.current} moves left, score stands.`);
    }
    busyRef.current = false;
  };

  const start = () => {
    if (busyRef.current) return;
    if (room.balance < stake) { setMsg("Not enough coins — claim your daily +5 or win some first."); return; }
    setPieces(piecesFromTypes(genCandyTypes()));
    setMoves(30); movesRef.current = 30;
    setScore(0); scoreRef.current = 0;
    setSel(null); setClearing(new Set()); setFloats([]); setSparks([]);
    playingRef.current = true; setPlaying(true);
    setMsg("Drag a candy to swap it, or tap two neighbours — match 3 for 60, 4 for 120 + a line clear, 5 for 240 + a bonus cross. Cascades pay ×2.");
  };

  /* input: drag a candy (artifact wireInput), or tap-tap two neighbours */
  const cellFromEvent = (e: React.PointerEvent): [number, number] | null => {
    const el = boardInnerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const c = Math.floor(((e.clientX - rect.left) / rect.width) * 8);
    const r = Math.floor(((e.clientY - rect.top) / rect.height) * 8);
    if (r < 0 || r >= 8 || c < 0 || c >= 8) return null;
    return [r, c];
  };
  const tapCell = (cell: [number, number]) => {
    if (!playingRef.current || busyRef.current) return;
    if (sel && Math.abs(sel[0] - cell[0]) + Math.abs(sel[1] - cell[1]) === 1) {
      const s = sel;
      setSel(null);
      void attemptSwap(s, cell);
    } else {
      setSel(cell);
    }
  };
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!playingRef.current || busyRef.current) return;
    const cell = cellFromEvent(e);
    if (!cell) return;
    dragRef.current = { cell, x: e.clientX, y: e.clientY };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || !playingRef.current || busyRef.current) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    const dir: [number, number] = Math.abs(dx) > Math.abs(dy) ? [0, dx > 0 ? 1 : -1] : [dy > 0 ? 1 : -1, 0];
    const t: [number, number] = [d.cell[0] + dir[0], d.cell[1] + dir[1]];
    dragRef.current = null;
    if (t[0] < 0 || t[0] >= 8 || t[1] < 0 || t[1] >= 8) return;
    void attemptSwap(d.cell, t);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    if (!playingRef.current || busyRef.current) return;
    const cell = cellFromEvent(e);
    if (cell && (cell[0] !== d.cell[0] || cell[1] !== d.cell[1])) {
      if (Math.abs(cell[0] - d.cell[0]) + Math.abs(cell[1] - d.cell[1]) === 1) void attemptSwap(d.cell, cell);
      return;
    }
    tapCell(d.cell);
  };

  return (
    <RoomShell game={game} subtitle="Swap adjacent candies to match 3+. 30 moves — 500 pts ×1, 1000 ×2, 1500 ×3." stats={room.stats} history={room.history}>
      <div className="xg-controls">
        <StakeChips stake={stake} setStake={setStake} currency="coins" disabled={playing} />
        <div className="cc-hud"><span>SCORE <b>{score}</b></span><span>MOVES <b>{moves}</b></span><span>TIER <b>×{candyTier(score)}</b></span><span>BEST <b>{Math.max(best, score)}</b></span></div>
        <div className="cc-boardwrap">
          <div className={playing ? "cc-board live" : "cc-board"}>
            <div className={playing ? "cc-inner live" : "cc-inner"} ref={boardInnerRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => { dragRef.current = null; }}>
              {pieces.map((p) => (
                <div key={p.id} role="button" tabIndex={0} aria-label={`Candy row ${p.r + 1} column ${p.c + 1}`}
                  className={`cc-candy${clearing.has(p.id) ? " clearing" : ""}${sel && sel[0] === p.r && sel[1] === p.c ? " sel" : ""}`}
                  style={{ width: "12.5%", height: "12.5%", transform: `translate(${p.c * 100}%, ${p.r * 100}%)` }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tapCell([p.r, p.c]); } }}>
                  <div className={`cc-gem t${p.type}`} />
                </div>
              ))}
              {floats.map((f) => <div key={f.id} className="cc-float" style={{ left: `${f.left}%`, top: `${f.top}%` }}>{f.text}</div>)}
              {sparks.map((s) => <span key={s.id} className="cc-spark" style={{ left: `${s.left}%`, top: `${s.top}%`, background: s.color, "--dx": `${s.dx}px`, "--dy": `${s.dy}px` } as React.CSSProperties} />)}
            </div>
          </div>
          {!playing && <div className="fn-idle"><b>30 moves</b><span>Match 3 = 60 · match 4 = 120 + line clear · match 5 = 240 + bonus cross · cascades ×2</span></div>}
        </div>
        {!playing && <button className="btn btn-gold xg-action" type="button" onClick={start}>Start · {stake} coins</button>}
        <p className="bottle-msg xg-msg">{msg}</p>
      </div>
    </RoomShell>
  );
}

// ---------------- Tetris ----------------
// Artifact engine: classic 10×20 well, all 7 tetrominoes, SRS-style
// rotation with wall kicks [0,-1,1,-2,2]. Lines pay 100 / 300 / 500 /
// 800; every 10 lines the level rises and the fall speeds up
// (760ms × 0.8^(level-1), floor 110ms). A round is 2 minutes or
// top-out, whichever comes first. Touch (v41): ONE Rotate button +
// gestures on the well — drag left/right moves one column per cell of
// drag, drag down soft-drops one row per cell, a TAP rotates, a FAST
// SWIPE DOWN hard-drops. Arrow keys + space work too.
const TT_SHAPES: Record<string, number[][]> = {
  I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
  O: [[1, 1], [1, 1]],
  S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
};
const TT_TYPES = ["I", "J", "L", "O", "S", "T", "Z"];
const TT_COLORS: Record<string, string> = { I: "#F2C230", J: "#57B6FF", L: "#2ED3B7", O: "#FF9E2C", S: "#3ED97E", T: "#B45CFF", Z: "#FF5A4D" };
const TT_POINTS = [0, 100, 300, 500, 800];
const TT_ROUND_SECS = 120;
const dropMsFor = (level: number) => Math.max(110, Math.round(760 * Math.pow(0.8, level - 1)));
const fmtClock = (s: number) => { const t = Math.max(0, s); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };
function tetrisTier(score: number) { return score >= 2500 ? 3 : score >= 1500 ? 2 : score >= 800 ? 1 : 0; }
interface TTPiece { type: string; m: number[][]; x: number; y: number }
interface TTState { board: string[][]; cur: TTPiece | null; next: string; score: number; lines: number; level: number; timeLeft: number; playing: boolean; settled: boolean; banked: number; roundId: string }
// banked = coins already cashed out mid-round this round; roundId
// identifies the round to the server so a replayed cash-out is
// rejected there (the server sums this round's cash-out rows).
const emptyTTBoard = (): string[][] => Array.from({ length: 20 }, () => Array(10).fill(""));
const ttCollides = (b: string[][], shape: number[][], x: number, y: number) => {
  for (let r = 0; r < shape.length; r++) for (let c = 0; c < shape[r].length; c++) {
    if (!shape[r][c]) continue;
    const bx = x + c, by = y + r;
    if (bx < 0 || bx >= 10 || by >= 20) return true;
    if (by >= 0 && b[by][bx]) return true;
  }
  return false;
};

export function TetrisRoom({ game }: { game: GameDef }) {
  const room = useGameRoom(game);
  const [stake, setStake] = useState(5);
  const G = useRef<TTState>({ board: emptyTTBoard(), cur: null, next: "T", score: 0, lines: 0, level: 1, timeLeft: TT_ROUND_SECS, playing: false, settled: false, banked: 0, roundId: "" });
  const [board, setBoard] = useState<string[][]>(G.current.board);
  const [cur, setCur] = useState<TTPiece | null>(null);
  const [nextType, setNextType] = useState("T");
  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [level, setLevel] = useState(1);
  const [timeLeft, setTimeLeft] = useState(TT_ROUND_SECS);
  const [playing, setPlaying] = useState(false);
  const [msg, setMsg] = useState("Set your stake and start. Clear lines before the stack tops out — a Tetris (4 lines at once) pays 800.");
  // Per-line cash-out (15 Nov 2026): the tier payout the score has
  // earned so far can be banked mid-round and the game goes on.
  // bankable = stake x tier(score) - banked, so the end-of-round
  // settle pays only the remainder — banked lines are never paid
  // twice. The offer appears after a line clear and auto-dismisses
  // after 6s; ignoring it changes nothing (it pays at the end).
  const [banked, setBanked] = useState(0);
  const [cashOutOffer, setCashOutOffer] = useState<number | null>(null);
  const [cashOutBusy, setCashOutBusy] = useState(false);
  const offerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearOffer = () => {
    if (offerTimerRef.current) { clearTimeout(offerTimerRef.current); offerTimerRef.current = null; }
    setCashOutOffer(null);
  };
  const showOffer = (amount: number) => {
    setCashOutOffer(amount);
    if (offerTimerRef.current) clearTimeout(offerTimerRef.current);
    offerTimerRef.current = setTimeout(() => setCashOutOffer(null), 6000);
  };
  const bankable = (g: TTState) => Math.max(0, stake * tetrisTier(g.score) - g.banked);
  useEffect(() => () => { if (offerTimerRef.current) clearTimeout(offerTimerRef.current); }, []);
  const boardWrapRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<{ pid: number | null; sx: number; sy: number; lx: number; ly: number; accX: number; accY: number; t0: number; moved: boolean; hardDone: boolean }>({ pid: null, sx: 0, sy: 0, lx: 0, ly: 0, accX: 0, accY: 0, t0: 0, moved: false, hardDone: false });
  const settleRef = useRef(room.settle);
  settleRef.current = room.settle;

  const sync = () => {
    const g = G.current;
    setBoard(g.board); setCur(g.cur); setNextType(g.next);
    setScore(g.score); setLines(g.lines); setLevel(g.level);
    setTimeLeft(g.timeLeft); setPlaying(g.playing); setBanked(g.banked);
  };
  const randType = () => TT_TYPES[Math.floor(Math.random() * TT_TYPES.length)];

  const endRound = async (reason: "time" | "topout") => {
    const g = G.current;
    if (g.settled) return;
    g.settled = true;
    g.playing = false;
    clearOffer();
    sync();
    const mult = tetrisTier(g.score);
    // NO DOUBLE PAY: the final settle pays only the tier payout not
    // already banked mid-round (banked lines are excluded here).
    const payout = Math.max(0, Math.round(stake * mult) - g.banked);
    const bankedNote = g.banked > 0 ? `${fmtCoins(g.banked)} coins already banked mid-round. ` : "";
    setMsg(reason === "topout"
      ? `Topped out — ${g.score} pts, ${g.lines} lines. ${bankedNote}${payout > 0 ? `${fmtCoins(payout)} coins paid ×${mult}.` : mult > 0 ? "The full tier payout is already in your wallet." : "Under 800, so the stake is gone."}`
      : mult >= 2 ? `Time! ${g.score} pts — ${bankedNote}${payout > 0 ? `${fmtCoins(payout)} coins paid ×${mult}.` : "The full tier payout is already in your wallet."}`
      : mult === 1 ? `Time! ${g.score} pts — ${bankedNote}${payout > 0 ? `your ${fmtCoins(stake)} coins stake comes back ×1; 1,500+ pays ×2.` : "Your stake is already back in your wallet; 1,500+ pays ×2."}`
      : `Time! ${g.score} pts, under 800 — the stake is gone. Tetrises are where the points live.`);
    await settleRef.current(stake, payout, { score: g.score, lines: g.lines, mult, banked: g.banked });
  };
  const endRoundRef = useRef(endRound);
  endRoundRef.current = endRound;

  // Per-line cash-out: bank the tier payout earned so far and keep
  // playing. The server credits the coins and enforces the cap
  // (stake x tier - already banked this round), so a replayed tap
  // can never double-pay. The board is untouched — the next piece
  // is already live.
  const cashOut = async () => {
    const g = G.current;
    const amount = cashOutOffer;
    if (!g.playing || g.settled || cashOutBusy || amount == null || amount <= 0) return;
    setCashOutBusy(true);
    try {
      const r = await api<{ amount: number; banked: number; cash: number; coins: number; sim: number }>("/api/games/cashout", {
        method: "POST",
        body: JSON.stringify({ game: "tetris", stake, score: g.score, lines: g.lines, amount, roundId: g.roundId }),
      });
      // Server is the authority on banked — sync from its reply.
      g.banked = r.banked;
      sync();
      clearOffer();
      await room.refresh();
      playSfx("cheer", room.muted);
      fireConfetti();
      setMsg(`Cashed out ${fmtCoins(r.amount)} coins — ${fmtCoins(r.banked)} banked this round. Keep playing!`);
    } catch (ex) {
      // A failed cash-out leaves the lines pending — they pay at the
      // end as normal, so the player loses nothing.
      clearOffer();
      setMsg(ex instanceof Error ? ex.message : "Cash-out failed — the lines stay pending and pay at the end.");
    } finally {
      setCashOutBusy(false);
    }
  };

  const spawn = () => {
    const g = G.current;
    const t = g.next;
    g.next = randType();
    const m = TT_SHAPES[t];
    const piece: TTPiece = { type: t, m, x: Math.floor((10 - m[0].length) / 2), y: t === "I" ? -1 : 0 };
    if (ttCollides(g.board, piece.m, piece.x, piece.y)) { g.cur = null; return false; }
    g.cur = piece;
    return true;
  };

  const lockPiece = () => {
    const g = G.current;
    const piece = g.cur;
    if (!piece) return;
    playSfx("crack", room.muted);
    const nb = g.board.map((row) => [...row]);
    piece.m.forEach((row, r) => row.forEach((v, c) => {
      if (v && piece.y + r >= 0 && piece.y + r < 20) nb[piece.y + r][piece.x + c] = piece.type;
    }));
    let cleared = 0;
    const kept = nb.filter((row) => { if (row.every(Boolean)) { cleared++; return false; } return true; });
    while (kept.length < 20) kept.unshift(Array(10).fill(""));
    g.board = kept;
    if (cleared > 0) {
      g.score += TT_POINTS[cleared];
      g.lines += cleared;
      g.level = 1 + Math.floor(g.lines / 10);
      // Per-line cash-out: the lines just cleared may have unlocked a
      // new tier — offer the bankable amount (tier payout not yet
      // banked). Ignoring it changes nothing: it pays at the end.
      const b = bankable(g);
      if (b > 0 && g.playing) showOffer(b);
    }
    g.cur = null;
    sync();
    if (!g.playing) return;
    if (!spawn()) { sync(); void endRoundRef.current("topout"); return; }
    sync();
  };
  const lockRef = useRef(lockPiece);
  lockRef.current = lockPiece;

  const stepDown = () => {
    const g = G.current;
    if (!g.cur) return;
    if (!ttCollides(g.board, g.cur.m, g.cur.x, g.cur.y + 1)) { g.cur = { ...g.cur, y: g.cur.y + 1 }; sync(); }
    else lockRef.current();
  };
  const move = (dx: number) => {
    const g = G.current;
    if (!g.playing || !g.cur) return;
    if (!ttCollides(g.board, g.cur.m, g.cur.x + dx, g.cur.y)) { g.cur = { ...g.cur, x: g.cur.x + dx }; sync(); }
  };
  const rotate = () => {
    const g = G.current;
    if (!g.playing || !g.cur) return;
    const m = g.cur.m, n = m.length, out: number[][] = [];
    for (let r = 0; r < n; r++) { out.push([]); for (let c = 0; c < n; c++) out[r].push(m[n - 1 - c][r]); }
    for (const kick of [0, -1, 1, -2, 2]) {
      if (!ttCollides(g.board, out, g.cur.x + kick, g.cur.y)) { g.cur = { ...g.cur, m: out, x: g.cur.x + kick }; sync(); return; }
    }
  };
  const softStep = () => {
    const g = G.current;
    if (!g.playing || !g.cur) return;
    stepDown();
  };
  const hardDrop = () => {
    const g = G.current;
    if (!g.playing || !g.cur) return;
    let y = g.cur.y;
    while (!ttCollides(g.board, g.cur.m, g.cur.x, y + 1)) y++;
    g.cur = { ...g.cur, y };
    lockRef.current();
  };

  // gravity — interval follows the level speed-up
  useEffect(() => {
    if (!playing) return;
    const iv = setInterval(() => {
      const g = G.current;
      if (!g.playing || !g.cur) return;
      if (!ttCollides(g.board, g.cur.m, g.cur.x, g.cur.y + 1)) { g.cur = { ...g.cur, y: g.cur.y + 1 }; sync(); }
      else lockRef.current();
    }, dropMsFor(level));
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, level]);

  // 2-minute round clock
  useEffect(() => {
    if (!playing) return;
    const iv = setInterval(() => {
      const g = G.current;
      if (!g.playing) return;
      g.timeLeft -= 1;
      if (g.timeLeft <= 0) { g.timeLeft = 0; sync(); void endRoundRef.current("time"); }
      else sync();
    }, 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  // arrow keys + space
  useEffect(() => {
    if (!playing) return;
    const onKey = (e: KeyboardEvent) => {
      if (!G.current.playing) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); move(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); move(1); }
      else if (e.key === "ArrowDown") { e.preventDefault(); softStep(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); rotate(); }
      else if (e.key === " ") { e.preventDefault(); hardDrop(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const start = () => {
    if (room.balance < stake) { setMsg("Not enough coins — claim your daily +5 or win some first."); return; }
    const g = G.current;
    g.board = emptyTTBoard();
    g.score = 0; g.lines = 0; g.level = 1; g.timeLeft = TT_ROUND_SECS;
    g.banked = 0;
    g.roundId = `tetris-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    clearOffer();
    g.next = randType();
    g.playing = true; g.settled = false;
    spawn();
    sync();
    setMsg("Round live — 2:00 on the clock. Drag to move, tap or hit Rotate to turn, fast swipe down to slam. Singles 100, doubles 300, triples 500, Tetris 800.");
  };

  /* v41 gestures on the well: drag moves / soft-drops per cell,
     tap rotates, fast swipe down hard-drops */
  const cellPx = () => {
    const el = boardWrapRef.current;
    const w = el ? el.getBoundingClientRect().width : 300;
    return Math.max(10, w / 10);
  };
  const fastSwipe = (totX: number, totY: number, dt: number) => totY > 56 && dt < 240 && totY > Math.abs(totX) * 1.3;
  const onBoardPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button != null && e.button > 0) return;
    const gt = gestureRef.current;
    gt.pid = e.pointerId != null ? e.pointerId : 1;
    gt.sx = gt.lx = e.clientX; gt.sy = gt.ly = e.clientY;
    gt.accX = 0; gt.accY = 0; gt.t0 = performance.now(); gt.moved = false; gt.hardDone = false;
    try { e.currentTarget.setPointerCapture(gt.pid); } catch { /* ignore */ }
  };
  const onBoardPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const gt = gestureRef.current;
    if (gt.pid === null || (e.pointerId != null && e.pointerId !== gt.pid)) return;
    const dx = e.clientX - gt.lx, dy = e.clientY - gt.ly;
    gt.lx = e.clientX; gt.ly = e.clientY;
    const totX = e.clientX - gt.sx, totY = e.clientY - gt.sy;
    if (Math.abs(totX) > 8 || Math.abs(totY) > 8) gt.moved = true;
    if (!G.current.playing || gt.hardDone) return;
    if (fastSwipe(totX, totY, performance.now() - gt.t0)) { hardDrop(); gt.hardDone = true; gt.accX = 0; gt.accY = 0; if (e.cancelable) e.preventDefault(); return; }
    const cell = cellPx();
    gt.accX += dx;
    while (gt.accX >= cell) { move(1); gt.accX -= cell; }
    while (gt.accX <= -cell) { move(-1); gt.accX += cell; }
    gt.accY += dy;
    while (gt.accY >= cell) { softStep(); gt.accY -= cell; }
    if (gt.accY < -cell) gt.accY = -cell;
    if (e.cancelable) e.preventDefault();
  };
  const endGesture = (e: React.PointerEvent<HTMLDivElement>) => {
    const gt = gestureRef.current;
    if (gt.pid === null || (e.pointerId != null && e.pointerId !== gt.pid)) return;
    const totX = e.clientX - gt.sx, totY = e.clientY - gt.sy, dt = performance.now() - gt.t0;
    gt.pid = null;
    if (!G.current.playing) return;
    if (!gt.hardDone && fastSwipe(totX, totY, dt)) { hardDrop(); return; }
    if (!gt.moved && dt < 350) rotate();
  };

  const ghostY = () => {
    const g = G.current;
    if (!g.cur) return -1;
    let y = g.cur.y;
    while (!ttCollides(g.board, g.cur.m, g.cur.x, y + 1)) y++;
    return y;
  };
  const display: string[][] = board.map((row) => [...row]);
  if (cur) {
    const gy = ghostY();
    if (gy !== cur.y) cur.m.forEach((row, r) => row.forEach((v, c) => {
      if (v && gy + r >= 0 && gy + r < 20 && !display[gy + r][cur.x + c]) display[gy + r][cur.x + c] = "ghost";
    }));
    cur.m.forEach((row, r) => row.forEach((v, c) => {
      if (v && cur.y + r >= 0 && cur.y + r < 20) display[cur.y + r][cur.x + c] = cur.type;
    }));
  }

  return (
    <RoomShell game={game} subtitle="Clear lines — 800 pts ×1, 1500 ×2, 2500 ×3." stats={room.stats} history={room.history}>
      <div className="xg-controls">
        <StakeChips stake={stake} setStake={setStake} currency="coins" disabled={playing} />
        <div className="tt-hud">
          <span>SCORE <b>{score}</b></span><span>LINES <b>{lines}</b></span><span>LEVEL <b>{level}</b></span>
          <span className={playing && timeLeft <= 15 ? "hot" : ""}>TIME <b>{fmtClock(timeLeft)}</b></span>
          <span className="tt-next"><span className="tt-next-label">NEXT</span><span className="tt-next-grid">{TT_SHAPES[nextType].flatMap((row, r) => row.map((v, c) => (
            <i key={`${r}-${c}`} className={v ? "on" : ""} style={v ? { background: TT_COLORS[nextType] } : undefined} />
          )))}</span></span>
        </div>
        {playing && (
          <div className="tt-bank" aria-live="polite">
            <span>BANKED <b>{fmtCoins(banked)} coins</b></span>
            <button type="button" className="tt-bank-pending" onClick={() => { const b = bankable(G.current); if (b > 0) showOffer(b); }} disabled={cashOutBusy}>
              PENDING <b>{fmtCoins(Math.max(0, stake * tetrisTier(score) - banked))} coins</b>
            </button>
          </div>
        )}
        <div style={{ position: "relative" }} ref={boardWrapRef}
          onPointerDown={onBoardPointerDown} onPointerMove={onBoardPointerMove} onPointerUp={endGesture} onPointerCancel={() => { gestureRef.current.pid = null; }}>
          <div className={playing ? "tt-board live" : "tt-board"}>
            {display.map((row, r) => row.map((v, c) => (
              <span key={`${r}-${c}`} className={`tt-cell${v === "ghost" ? " ghost" : v ? " on" : ""}`} style={v && v !== "ghost" ? { background: TT_COLORS[v] } : undefined} />
            )))}
          </div>
          {!playing && <div className="fn-idle"><b>2 minutes on the clock</b><span>800+ pts returns your stake · 1,500+ pays ×2 · 2,500+ pays ×3 · every 10 lines the fall speeds up</span></div>}
        </div>
        {playing && cashOutOffer != null && (
          <div className="tt-cashout" role="status">
            <div className="tt-cashout-text">
              <b>Line cleared! Cash Out &amp; Continue — +{fmtCoins(cashOutOffer)} coins</b>
              <span>Bank the tier payout earned so far and keep playing — or ignore this and it pays at the end.</span>
            </div>
            <button type="button" className="btn btn-gold" onClick={cashOut} disabled={cashOutBusy}>
              {cashOutBusy ? "Banking…" : `Cash Out ${fmtCoins(cashOutOffer)}`}
            </button>
            <button type="button" className="tt-cashout-x" onClick={clearOffer} aria-label="Dismiss cash-out">×</button>
          </div>
        )}
        {playing && (
          <div className="tt-btns">
            <button type="button" className="btn btn-ghost" onClick={() => move(-1)}>←</button>
            <button type="button" className="btn btn-gold" onClick={rotate}>Rotate</button>
            <button type="button" className="btn btn-ghost" onClick={() => move(1)}>→</button>
            <button type="button" className="btn btn-gold" onClick={hardDrop}>Drop</button>
          </div>
        )}
        {playing && <p className="tt-touch-hint">Drag to move · tap to rotate · swipe down to soft-drop · fast swipe down to slam</p>}
        {!playing && <button className="btn btn-gold xg-action" type="button" onClick={start}>Start · {stake} coins</button>}
        <p className="bottle-msg xg-msg">{msg}</p>
      </div>
    </RoomShell>
  );
}

// ---------------- Trivia ----------------
// Nov 2026 rebuild: the player sets the difficulty (easy/medium/hard —
// wired to real question pools classified in the seed bank, plus the
// clock: easy 20s, medium 15s, hard 10s), the question count (5/10)
// and the seconds per question. Every correct answer banks 1 coin as
// the game goes on (shown live), paid at grading on top of the
// milestone table. Each answer is graded by the server as it lands
// (POST /api/games/trivia/answer) — the client gets the right/wrong
// reveal for THAT question only, the key for unanswered questions
// never leaves the server, and answers must arrive in order so the
// key cannot be probed early. After the game the answer board shows
// every question with your answer and the correct one; the last
// finished round is kept in localStorage so the board is still there
// when you come back.
type TriviaDifficulty = "easy" | "medium" | "hard";
interface TriviaQ { id: string; question: string; options: string[]; category: string }
interface TriviaBoardRow { question: number; text: string; category: string; options: string[]; yourAnswer: number; correctAnswer: number; correct: boolean }
interface TriviaResult { correct: number; total: number; difficulty: TriviaDifficulty; payoutCoins: number; perAnswerCoins: number; breakdown: TriviaBoardRow[] }
interface TriviaSettings { difficulty: TriviaDifficulty; count: number; timePerQ: number }
const TRIVIA_DIFFS: { id: TriviaDifficulty; label: string; time: number; blurb: string }[] = [
  { id: "easy", label: "Easy", time: 20, blurb: "Gentlest questions · 20s each" },
  { id: "medium", label: "Medium", time: 15, blurb: "A mix of everything · 15s each" },
  { id: "hard", label: "Hard", time: 10, blurb: "Toughest questions · 10s each" },
];
const TRIVIA_LAST_KEY = "rg-trivia-last";
function triviaMilestoneText(total: number): string {
  const mid = Math.ceil(total * 0.7);
  const high = Math.ceil(total * 0.9);
  const parts = [`${mid} right pays 10`];
  if (high < total) parts.push(`${high} right pays 15`);
  parts.push(`all ${total} right pays 25`);
  return parts.join(" · ");
}
function TriviaBoard({ result }: { result: TriviaResult }) {
  return (
    <div className="tv-board">
      <h4 className="tv-board-title">Answer board — {result.correct}/{result.total} right</h4>
      {result.breakdown.map((b) => (
        <div key={b.question} className={`tv-board-q${b.correct ? " ok" : " bad"}`}>
          <div className="tv-board-head"><span>Q{b.question}</span><span>{b.category}</span><span className="tv-board-mark">{b.correct ? "✓ Right" : "✗ Wrong"}</span></div>
          <p className="tv-board-text">{b.text}</p>
          <p className={`tv-board-your${b.correct ? " ok" : " bad"}`}>Your answer: {b.yourAnswer >= 0 ? b.options[b.yourAnswer] : "No answer — time ran out"}</p>
          {!b.correct && <p className="tv-board-correct">Correct answer: {b.options[b.correctAnswer]}</p>}
        </div>
      ))}
    </div>
  );
}
export function TriviaRoom({ game }: { game: GameDef }) {
  const room = useGameRoom(game);
  const [settings, setSettings] = useState<TriviaSettings>({ difficulty: "medium", count: 10, timePerQ: 15 });
  const [qs, setQs] = useState<TriviaQ[]>([]);
  const [token, setToken] = useState("");
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [reveal, setReveal] = useState<{ correct: boolean; correctIndex: number } | null>(null);
  const [earned, setEarned] = useState(0);
  const [time, setTime] = useState(15);
  const [timePerQ, setTimePerQ] = useState(15);
  // All-games sound pass: answer is a useCallback whose deps don't
  // include room, so the mute flag is read through a ref.
  const mutedRef = useRef(room.muted);
  mutedRef.current = room.muted;
  const [phase, setPhase] = useState<"idle" | "playing" | "done">("idle");
  const [result, setResult] = useState<TriviaResult | null>(null);
  const [last, setLast] = useState<TriviaResult | null>(null);
  const [msg, setMsg] = useState("Pick a difficulty, set your round, and play. Every right answer earns 1 coin.");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TRIVIA_LAST_KEY);
      if (raw) setLast(JSON.parse(raw) as TriviaResult);
    } catch { /* no last round stored */ }
  }, []);

  const start = async (s: TriviaSettings = settings) => {
    try {
      const r = await api<{ roundToken: string; questions: TriviaQ[]; difficulty: TriviaDifficulty; total: number; timePerQ: number }>(
        `/api/games/trivia/questions?difficulty=${s.difficulty}&count=${s.count}&time=${s.timePerQ}`,
      );
      setToken(r.roundToken);
      setQs(r.questions);
      setIdx(0); setPicked(null); setReveal(null); setEarned(0);
      setTime(r.timePerQ); setTimePerQ(r.timePerQ); setPhase("playing"); setResult(null);
      setMsg(`Question 1 of ${r.total} — good luck.`);
    } catch (ex) {
      setMsg(ex instanceof Error ? ex.message : "Could not load questions.");
    }
  };

  const grade = async () => {
    setPhase("done");
    if (timerRef.current) clearInterval(timerRef.current);
    try {
      const r = await api<{ correct: number; total: number; difficulty: TriviaDifficulty; payoutCoins: number; perAnswerCoins: number; cash: number; coins: number; breakdown: TriviaBoardRow[] }>("/api/games/trivia/grade", {
        method: "POST",
        body: JSON.stringify({ roundToken: token }),
      });
      const res: TriviaResult = { correct: r.correct, total: r.total, difficulty: r.difficulty, payoutCoins: r.payoutCoins, perAnswerCoins: r.perAnswerCoins, breakdown: r.breakdown };
      setResult(res);
      try { localStorage.setItem(TRIVIA_LAST_KEY, JSON.stringify(res)); setLast(res); } catch { /* storage unavailable */ }
      setMsg(`${r.correct}/${r.total} correct — ${r.payoutCoins > 0 ? `${r.payoutCoins} coins paid` : "no payout this round"}.`);
      if (r.payoutCoins >= 25) { fireConfetti(); playSfx("cheer", mutedRef.current); }
      await room.refreshStats();
      await room.refresh();
    } catch (ex) {
      setMsg(ex instanceof Error ? ex.message : "Grading failed.");
    }
  };

  const answer = useCallback(async (choice: number) => {
    if (phase !== "playing" || picked !== null) return;
    playSfx("blip", mutedRef.current);
    setPicked(choice);
    const myIdx = idx;
    try {
      const r = await api<{ correct: boolean; earned: number; correctIndex: number }>("/api/games/trivia/answer", {
        method: "POST",
        body: JSON.stringify({ roundToken: token, index: myIdx, choice }),
      });
      setReveal({ correct: r.correct, correctIndex: r.correctIndex });
      setEarned(r.earned);
      if (r.correct) {
        playSfx("pop", mutedRef.current);
        setMsg("Right — +1 coin banked.");
      } else {
        setMsg(choice === -1 ? "Time up — that one got away." : "Not this time — the right answer is highlighted.");
      }
    } catch (ex) {
      setMsg(ex instanceof Error ? ex.message : "Could not grade that answer.");
      setReveal({ correct: false, correctIndex: -1 });
    }
    await sleep(1400);
    if (myIdx + 1 >= qs.length) {
      void grade();
    } else {
      setIdx(myIdx + 1); setPicked(null); setReveal(null); setTime(timePerQ);
      setMsg(`Question ${myIdx + 2} of ${qs.length} — good luck.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, picked, idx, qs.length, token, timePerQ]);

  useEffect(() => {
    if (phase !== "playing") return;
    timerRef.current = setInterval(() => {
      setTime((t) => {
        // hold the bar still during the locked-in reveal pause
        if (picked !== null) return t;
        if (t <= 1) {
          // time out on this question — count as wrong (-1 sentinel)
          if (picked === null) void answer(-1);
          return timePerQ;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, idx, picked, answer, timePerQ]);

  const q = qs[idx];
  return (
    <RoomShell game={game} subtitle={`${settings.count} questions, ${settings.timePerQ}s each · Entry 5 coins · 1 coin per right answer`} stats={room.stats} history={room.history}>
      <div className="xg-controls">
        {phase === "idle" && (
          <div className="tv-settings">
            <p className="tv-set-label">Difficulty</p>
            <div className="tv-diff-row">
              {TRIVIA_DIFFS.map((d) => (
                <button key={d.id} type="button" className={`tv-diff${settings.difficulty === d.id ? " on" : ""}`} onClick={() => setSettings((s) => ({ ...s, difficulty: d.id, timePerQ: d.time }))}>
                  <b>{d.label}</b><span>{d.blurb}</span>
                </button>
              ))}
            </div>
            <p className="tv-set-label">Questions per round</p>
            <div className="tv-seg">
              {[5, 10].map((n) => (
                <button key={n} type="button" className={settings.count === n ? "on" : ""} onClick={() => setSettings((s) => ({ ...s, count: n }))}>{n} questions</button>
              ))}
            </div>
            <p className="tv-set-label">Seconds per question</p>
            <div className="tv-seg">
              {[10, 15, 20].map((n) => (
                <button key={n} type="button" className={settings.timePerQ === n ? "on" : ""} onClick={() => setSettings((s) => ({ ...s, timePerQ: n }))}>{n}s</button>
              ))}
            </div>
            <p className="tv-note">Entry 5 coins · every right answer earns 1 coin · {triviaMilestoneText(settings.count)}</p>
            <button className="btn btn-gold xg-action" type="button" onClick={() => void start()}>Start round · 5 coins</button>
            {last && (
              <>
                <p className="tv-set-label">Your last round</p>
                <TriviaBoard result={last} />
              </>
            )}
          </div>
        )}
        {phase === "playing" && q && (
          <div className="tv-stage">
            <div className="tv-hud"><span>Q {idx + 1}/{qs.length}</span><span>{q.category}</span><span className="tv-diff-chip">{settings.difficulty}</span><span>{time}s</span></div>
            <div className="tv-earned-row"><span>◉ {earned} coin{earned === 1 ? "" : "s"} banked</span>{reveal && reveal.correct && <span className="tv-plus">+1 coin</span>}</div>
            <div className="tv-timerbar"><i style={{ width: `${(time / timePerQ) * 100}%` }} /></div>
            <h3 className="tv-q">{q.question}</h3>
            <div className="tv-opts">
              {q.options.map((o, i) => (
                <button
                  key={i}
                  type="button"
                  className={`tv-opt${picked === i ? " picked" : ""}${reveal ? (i === reveal.correctIndex ? " right" : picked === i ? " wrong" : "") : ""}`}
                  onClick={() => void answer(i)}
                  disabled={picked !== null}
                >{o}</button>
              ))}
            </div>
          </div>
        )}
        {phase === "done" && result && (
          <div className="tv-result">
            <h3>{result.correct}/{result.total} correct — {result.payoutCoins} coins</h3>
            <p className="tv-note">{result.perAnswerCoins} coin{result.perAnswerCoins === 1 ? "" : "s"} from right answers{result.payoutCoins > result.perAnswerCoins ? ` · topped up to ${result.payoutCoins} by the milestone` : ""}.</p>
            <TriviaBoard result={result} />
            <button className="btn btn-gold xg-action" type="button" onClick={() => void start()}>Play again · 5 coins</button>
            <button className="btn xg-action" type="button" onClick={() => setPhase("idle")}>Change settings</button>
          </div>
        )}
        <p className="bottle-msg xg-msg">{msg}</p>
      </div>
    </RoomShell>
  );
}

// ---------------- Snake ----------------
// Artifact restore: swipe steering on the canvas (the port's message
// promised a swipe that did not exist), a SPEED chip that rises as you
// eat, the checkerboard floor, an apple with a stem, a brighter head
// than body, and the pending-direction queue so two quick turns cannot
// reverse the snake into itself mid-step.
export function SnakeRoom({ game }: { game: GameDef }) {
  const room = useGameRoom(game);
  const [playing, setPlaying] = useState(false);
  const [score, setScore] = useState(0);
  const [speed, setSpeed] = useState(130);
  const [msg, setMsg] = useState("Steer with the arrow keys, swipe, or the on-screen arrows. Eat apples for +10 pts — don't hit the walls or yourself.");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // All-games sound pass: eating happens inside the rAF loop, so the
  // mute flag is read through a ref (mirror the Plinko pattern).
  const mutedRef = useRef(room.muted);
  mutedRef.current = room.muted;
  const stRef = useRef<{ snake: { x: number; y: number }[]; dir: { x: number; y: number }; apple: { x: number; y: number }; speed: number } | null>(null);
  const pendRef = useRef<{ x: number; y: number } | null>(null);
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  const scoreRef = useRef(0);
  const rafRef = useRef(0);
  const lastRef = useRef(0);

  const payoutFor = (s: number) => (s >= 300 ? 40 : s >= 200 ? 20 : s >= 100 ? 10 : 0);

  const end = useCallback(async (finalScore: number) => {
    cancelAnimationFrame(rafRef.current);
    setPlaying(false);
    const payout = payoutFor(finalScore);
    setMsg(payout > 0 ? `Score ${finalScore} — ${payout} coins!` : `Score ${finalScore} — under 100, no payout.`);
    await room.settle(5, payout, { score: finalScore });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  const placeApple = (snake: { x: number; y: number }[]) => {
    let a = { x: Math.floor(Math.random() * 20), y: Math.floor(Math.random() * 20) };
    while (snake.some((s) => s.x === a.x && s.y === a.y)) a = { x: Math.floor(Math.random() * 20), y: Math.floor(Math.random() * 20) };
    return a;
  };

  const drawBoard = (ctx: CanvasRenderingContext2D, snake: { x: number; y: number }[], apple: { x: number; y: number }) => {
    const cell = 20;
    ctx.fillStyle = "#05070F";
    ctx.fillRect(0, 0, 400, 400);
    ctx.fillStyle = "#101527";
    for (let x = 0; x < 20; x++) for (let y = 0; y < 20; y++) if ((x + y) % 2 === 0) ctx.fillRect(x * cell, y * cell, cell, cell);
    ctx.fillStyle = "#E5322D";
    ctx.beginPath(); ctx.arc(apple.x * cell + 10, apple.y * cell + 11, 8, 0, 7); ctx.fill();
    ctx.fillStyle = "#0B7A38";
    ctx.fillRect(apple.x * cell + 9, apple.y * cell + 1, 2.4, 5);
    snake.forEach((sn, i) => {
      ctx.fillStyle = i === 0 ? "#3ED97E" : "#27A85E";
      ctx.fillRect(sn.x * cell + 1.5, sn.y * cell + 1.5, cell - 3, cell - 3);
    });
  };

  const start = () => {
    if (room.balance < 5) { setMsg("Not enough coins — claim your daily +5 or win some first."); return; }
    const snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
    stRef.current = { snake, dir: { x: 1, y: 0 }, apple: placeApple(snake), speed: 130 };
    pendRef.current = null;
    scoreRef.current = 0;
    setScore(0); setSpeed(130); setPlaying(true);
    setMsg("Use arrow keys, swipe, or the on-screen arrows.");
  };

  useEffect(() => {
    if (!playing) return;
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const step = (t: number) => {
      const st = stRef.current;
      if (!st) return;
      const draw = () => drawBoard(ctx, st.snake, st.apple);
      if (t - lastRef.current < st.speed) { rafRef.current = requestAnimationFrame(step); draw(); return; }
      lastRef.current = t;
      if (pendRef.current && !(pendRef.current.x === -st.dir.x && pendRef.current.y === -st.dir.y)) st.dir = pendRef.current;
      pendRef.current = null;
      const head = { x: st.snake[0].x + st.dir.x, y: st.snake[0].y + st.dir.y };
      if (head.x < 0 || head.x >= 20 || head.y < 0 || head.y >= 20 || st.snake.some((s) => s.x === head.x && s.y === head.y)) {
        void end(scoreRef.current);
        return;
      }
      st.snake.unshift(head);
      if (head.x === st.apple.x && head.y === st.apple.y) {
        scoreRef.current += 10;
        setScore(scoreRef.current);
        playSfx("pop", mutedRef.current);
        st.speed = Math.max(70, st.speed - 3);
        setSpeed(st.speed);
        st.apple = placeApple(st.snake);
      } else st.snake.pop();
      draw();
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, end]);

  // Pre-start: draw the starting board (snake + apple) so the canvas
  // is not a blank dark box before the first Start — the artifact shows
  // the board on load.
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    drawBoard(ctx, [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }], { x: 14, y: 6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = stRef.current;
      if (!st || !playing) return;
      const d = { ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 } }[e.key];
      if (d) pendRef.current = d;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing]);

  const setDir = (x: number, y: number) => {
    const st = stRef.current;
    if (!st) return;
    if (!(x === -st.dir.x && y === -st.dir.y)) pendRef.current = { x, y };
  };
  const onCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    swipeRef.current = { x: e.clientX, y: e.clientY };
  };
  const onCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = swipeRef.current;
    swipeRef.current = null;
    if (!s || !playing) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.abs(dx) > 24 || Math.abs(dy) > 24) setDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : -1) : 0, Math.abs(dx) > Math.abs(dy) ? 0 : (dy > 0 ? 1 : -1));
  };

  return (
    <RoomShell game={game} subtitle="Eat apples (+10 pts), don't hit the walls or yourself. Entry 5 coins — 100+ pays 10, 200+ pays 20, 300+ pays 40." stats={room.stats} history={room.history}>
      <div className="xg-controls">
        <div className="sn-hud"><span>SCORE <b>{score}</b></span><span>SPEED <b>×{(130 / speed).toFixed(1)}</b></span><span>PAYOUT <b>{payoutFor(score)} coins</b></span></div>
        <canvas ref={canvasRef} width={400} height={400} className={playing ? "sn-canvas live" : "sn-canvas"} aria-label="Snake board" onPointerDown={onCanvasPointerDown} onPointerUp={onCanvasPointerUp} onPointerCancel={() => { swipeRef.current = null; }} />
        <div className="sn-arrows">
          <button type="button" aria-label="Up" onPointerDown={(e) => { e.preventDefault(); setDir(0, -1); }}>↑</button>
          <button type="button" aria-label="Left" onPointerDown={(e) => { e.preventDefault(); setDir(-1, 0); }}>←</button>
          <button type="button" aria-label="Down" onPointerDown={(e) => { e.preventDefault(); setDir(0, 1); }}>↓</button>
          <button type="button" aria-label="Right" onPointerDown={(e) => { e.preventDefault(); setDir(1, 0); }}>→</button>
        </div>
        {!playing && <button className="btn btn-gold xg-action" type="button" onClick={start}>Start · 5 coins</button>}
        <p className="bottle-msg xg-msg">{msg}</p>
      </div>
    </RoomShell>
  );
}

// ---------------- 2048 ----------------
// Artifact restore: a SCORE chip (merges bank the tile value, as in the
// artifact), swipe-to-slide on the board (the port's message promised
// a swipe that did not exist), per-value tile colours (.g48-tile v2…
// v2048, v48 palette), and the "End run & collect" button so a player
// can bank their best tile instead of playing to a dead board.
function g48Tier(max: number) { return max >= 1024 ? 50 : max >= 512 ? 20 : max >= 256 ? 10 : 0; }
export function Game2048Room({ game }: { game: GameDef }) {
  const room = useGameRoom(game);
  const [board, setBoard] = useState<number[][]>([]);
  const [playing, setPlaying] = useState(false);
  const [over, setOver] = useState(false);
  const [maxTile, setMaxTile] = useState(0);
  const [score, setScore] = useState(0);
  const [msg, setMsg] = useState("Slide the tiles to merge them — reach 256 for 10 coins, 512 for 20, 1024 for 50.");
  // All-games sound pass: move is a useCallback whose deps don't
  // include room, so the mute flag is read through a ref.
  const mutedRef = useRef(room.muted);
  mutedRef.current = room.muted;
  const boardRef = useRef<number[][]>([]);
  const maxRef = useRef(0);
  const scoreRef = useRef(0);
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  const settleRef = useRef(room.settle);
  settleRef.current = room.settle;

  const addRandom = (b: number[][]) => {
    const empty: [number, number][] = [];
    b.forEach((row, r) => row.forEach((v, c) => { if (!v) empty.push([r, c]); }));
    if (!empty.length) return b;
    const [r, c] = empty[Math.floor(Math.random() * empty.length)];
    const nb = b.map((row) => [...row]);
    nb[r][c] = Math.random() < 0.9 ? 2 : 4;
    return nb;
  };
  const slideLine = (line: number[]) => {
    const arr = line.filter(Boolean);
    const out: number[] = [];
    let gained = 0;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i + 1] === arr[i]) { out.push(arr[i] * 2); gained += arr[i] * 2; i++; }
      else out.push(arr[i]);
    }
    while (out.length < 4) out.push(0);
    return { line: out, gained };
  };
  const canMove = (b: number[][]) => {
    if (b.some((row) => row.some((v) => !v))) return true;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      if ((c < 3 && b[r][c] === b[r][c + 1]) || (r < 3 && b[r][c] === b[r + 1][c])) return true;
    }
    return false;
  };
  const finishRun = async (reason: "top" | "stuck" | "early") => {
    const mx = maxRef.current;
    setOver(true); setPlaying(false);
    const payout = g48Tier(mx);
    setMsg(reason === "top" ? `1024 reached! 50 coins — top tier.`
      : reason === "early" ? `Run ended early — best tile ${mx}, score ${scoreRef.current}, ${payout > 0 ? `${payout} coins.` : "under 256. No payout."}`
      : payout > 0 ? `No moves left — best tile ${mx}, score ${scoreRef.current}, ${payout} coins.`
      : `No moves left — best tile ${mx}, score ${scoreRef.current}, under 256. No payout.`);
    await settleRef.current(5, payout, { maxTile: mx, score: scoreRef.current });
  };
  const finishRef = useRef(finishRun);
  finishRef.current = finishRun;

  const move = useCallback(async (dir: "left" | "right" | "up" | "down") => {
    if (!playing || over) return;
    const b = boardRef.current;
    let nb: number[][] = b.map((row) => [...row]);
    let gained = 0;
    const apply = (line: number[]) => { const r = slideLine(line); gained += r.gained; return r.line; };
    if (dir === "left") nb = nb.map(apply);
    if (dir === "right") nb = nb.map((row) => apply([...row].reverse()).reverse());
    if (dir === "up") nb = [0, 1, 2, 3].map((c) => apply([b[0][c], b[1][c], b[2][c], b[3][c]])).reduce((acc, col, c) => { col.forEach((v, r) => { acc[r][c] = v; }); return acc; }, Array.from({ length: 4 }, () => Array(4).fill(0)));
    if (dir === "down") nb = [0, 1, 2, 3].map((c) => apply([b[3][c], b[2][c], b[1][c], b[0][c]]).reverse()).reduce((acc, col, c) => { col.forEach((v, r) => { acc[r][c] = v; }); return acc; }, Array.from({ length: 4 }, () => Array(4).fill(0)));
    if (JSON.stringify(nb) === JSON.stringify(b)) return;
    nb = addRandom(nb);
    const mx = Math.max(...nb.flat());
    maxRef.current = Math.max(maxRef.current, mx);
    setMaxTile(maxRef.current);
    scoreRef.current += gained;
    setScore(scoreRef.current);
    boardRef.current = nb;
    setBoard(nb);
    if (gained > 0) playSfx("pop", mutedRef.current);
    if (mx >= 1024) { await finishRef.current("top"); return; }
    if (!canMove(nb)) { await finishRef.current("stuck"); }
  }, [playing, over]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, "left" | "right" | "up" | "down"> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };
      if (map[e.key]) { e.preventDefault(); void move(map[e.key]); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move]);

  const onBoardPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    swipeRef.current = { x: e.clientX, y: e.clientY };
  };
  const onBoardPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = swipeRef.current;
    swipeRef.current = null;
    if (!s || !playing) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.abs(dx) > 24 || Math.abs(dy) > 24) {
      if (Math.abs(dx) > Math.abs(dy)) void move(dx > 0 ? "right" : "left");
      else void move(dy > 0 ? "down" : "up");
    }
  };

  const start = () => {
    if (room.balance < 5) { setMsg("Not enough coins — claim your daily +5 or win some first."); return; }
    let b = addRandom(Array.from({ length: 4 }, () => Array(4).fill(0)));
    b = addRandom(b);
    boardRef.current = b;
    setBoard(b);
    maxRef.current = 0; setMaxTile(0);
    scoreRef.current = 0; setScore(0);
    setOver(false); setPlaying(true);
    setMsg("Arrow keys or swipe to slide — matching numbers merge and double.");
  };

  return (
    <RoomShell game={game} subtitle="Slide the tiles — reach 256 for 10 coins, 512 for 20, 1024 for 50. Entry 5 coins." stats={room.stats} history={room.history}>
      <div className="xg-controls">
        <div className="g48-hud"><span>SCORE <b>{score}</b></span><span>BEST TILE <b>{maxTile || "—"}</b></span><span>PAYOUT <b>{g48Tier(maxTile)} coins</b></span></div>
        <div className={playing ? "g48-boardwrap live" : "g48-boardwrap"} onPointerDown={onBoardPointerDown} onPointerUp={onBoardPointerUp} onPointerCancel={() => { swipeRef.current = null; }}>
          <div className="g48-board">
            {board.map((row, r) => row.map((v, c) => <span key={`${r}-${c}`} className={`g48-tile${v ? ` on v${Math.min(v, 2048)}` : ""}`}>{v || ""}</span>))}
          </div>
        </div>
        {playing && (
          <div className="tt-btns">
            <button type="button" className="btn btn-ghost" onClick={() => void move("left")}>←</button>
            <button type="button" className="btn btn-ghost" onClick={() => void move("up")}>↑</button>
            <button type="button" className="btn btn-ghost" onClick={() => void move("down")}>↓</button>
            <button type="button" className="btn btn-ghost" onClick={() => void move("right")}>→</button>
          </div>
        )}
        {playing && <button className="btn btn-ghost xg-action" type="button" onClick={() => void finishRef.current("early")}>End run &amp; collect</button>}
        {(!playing) && <button className="btn btn-gold xg-action" type="button" onClick={start}>{over ? "Play again · 5 coins" : "Start · 5 coins"}</button>}
        <p className="bottle-msg xg-msg">{msg}</p>
      </div>
    </RoomShell>
  );
}

