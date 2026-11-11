// Skill coin games — Candy Crush (match-3, 30 moves), Tetris (lines),
// Trivia (server questions + grading, 15s each), Snake (entry 5,
// 100+→10 / 200+→20 / 300+→40 coins), 2048 (entry 5, 256→10 / 512→20 /
// 1024→50 coins). Candy/Tetris payout tiers are the v48 export's exact
// tables: Candy ≥500 ×1, ≥1000 ×2, ≥1500 ×3; Tetris ≥800 ×1, ≥1500 ×2,
// ≥2500 ×3 (max ×3).

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, fmtCoins } from "../../lib/api";
import { GameDef } from "../../lib/games";
import { RoomShell, StakeChips, useGameRoom } from "./shared";

// ---------------- Candy Crush ----------------
const CANDY_TYPES = ["●", "◆", "▲", "■", "★", "♥"];
const CANDY_COLORS = ["#E5322D", "#2DD4BF", "#FFD964", "#3ED97E", "#F2C230", "#E879C6"];
function candyTier(score: number) { return score >= 1500 ? 3 : score >= 1000 ? 2 : score >= 500 ? 1 : 0; }
export function CandyRoom({ game }: { game: GameDef }) {
  const room = useGameRoom(game);
  const [stake, setStake] = useState(5);
  const [board, setBoard] = useState<number[][]>([]);
  const [sel, setSel] = useState<[number, number] | null>(null);
  const [moves, setMoves] = useState(30);
  const [score, setScore] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [msg, setMsg] = useState("Swap adjacent candies to match 3+. 30 moves — 500 pts ×1, 1000 ×2, 1500 ×3.");
  const scoreRef = useRef(0);

  const genBoard = () => {
    const b: number[][] = [];
    for (let r = 0; r < 8; r++) { const row: number[] = []; for (let c = 0; c < 8; c++) row.push(Math.floor(Math.random() * 6)); b.push(row); }
    return b;
  };
  const findRuns = (b: number[][]) => {
    const clear = new Set<string>();
    for (let r = 0; r < 8; r++) for (let c = 0; c < 6; c++) if (b[r][c] === b[r][c + 1] && b[r][c] === b[r][c + 2]) { clear.add(`${r},${c}`); clear.add(`${r},${c + 1}`); clear.add(`${r},${c + 2}`); }
    for (let c = 0; c < 8; c++) for (let r = 0; r < 6; r++) if (b[r][c] === b[r + 1][c] && b[r][c] === b[r + 2][c]) { clear.add(`${r},${c}`); clear.add(`${r + 1},${c}`); clear.add(`${r + 2},${c}`); }
    return clear;
  };
  const resolve = (b: number[][]) => {
    let total = 0;
    let cur = b.map((row) => [...row]);
    for (let iter = 0; iter < 10; iter++) {
      const clear = findRuns(cur);
      if (clear.size === 0) break;
      total += clear.size * 10;
      clear.forEach((key) => { const [r, c] = key.split(",").map(Number); cur[r][c] = -1; });
      for (let c = 0; c < 8; c++) {
        const col = cur.map((row) => row[c]).filter((v) => v !== -1);
        while (col.length < 8) col.unshift(Math.floor(Math.random() * 6));
        for (let r = 0; r < 8; r++) cur[r][c] = col[r];
      }
    }
    return { board: cur, gained: total };
  };
  const start = () => {
    let b = genBoard();
    let r = resolve(b);
    while (r.gained > 0) { b = r.board; r = resolve(b); }
    setBoard(b); setMoves(30); setScore(0); scoreRef.current = 0; setPlaying(true); setSel(null);
    setMsg("Swap two adjacent candies to match 3 or more.");
  };
  const click = async (r: number, c: number) => {
    if (!playing) return;
    if (!sel) { setSel([r, c]); return; }
    const [sr, sc] = sel;
    setSel(null);
    if (Math.abs(sr - r) + Math.abs(sc - c) !== 1) { setSel([r, c]); return; }
    const b = board.map((row) => [...row]);
    [b[sr][sc], b[r][c]] = [b[r][c], b[sr][sc]];
    const res = resolve(b);
    if (res.gained === 0) { setMsg("No match — try another swap."); return; }
    scoreRef.current += res.gained;
    setScore(scoreRef.current);
    setBoard(res.board);
    const m = moves - 1;
    setMoves(m);
    if (m <= 0) {
      setPlaying(false);
      const mult = candyTier(scoreRef.current);
      const payout = Math.round(stake * mult);
      setMsg(mult > 0 ? `Out of moves — ${scoreRef.current} pts, ×${mult}! ${fmtCoins(payout)} coins` : `Out of moves — ${scoreRef.current} pts, under 500. No payout.`);
      await room.settle(stake, payout, { score: scoreRef.current, mult });
    }
  };
  return (
    <RoomShell game={game} subtitle="Swap adjacent candies to match 3+. 30 moves — 500 pts ×1, 1000 ×2, 1500 ×3." stats={room.stats} history={room.history}>
      <div className="xg-controls">
        <StakeChips stake={stake} setStake={setStake} currency="coins" disabled={playing} />
        <div className="cc-hud"><span>SCORE <b>{score}</b></span><span>MOVES <b>{moves}</b></span><span>TIER <b>×{candyTier(score)}</b></span></div>
        <div className="cc-board">
          {board.map((row, r) => row.map((v, c) => (
            <button key={`${r}-${c}`} type="button" className={`cc-gem${sel && sel[0] === r && sel[1] === c ? " sel" : ""}`} style={{ color: CANDY_COLORS[v] }} onClick={() => void click(r, c)} aria-label={`Candy row ${r + 1} column ${c + 1}`}>{CANDY_TYPES[v]}</button>
          )))}
        </div>
        {!playing && <button className="btn btn-gold xg-action" type="button" onClick={start}>Start · {stake} coins</button>}
        <p className="bottle-msg xg-msg">{msg}</p>
      </div>
    </RoomShell>
  );
}

// ---------------- Tetris ----------------
const SHAPES: number[][][] = [
  [[1, 1, 1, 1]], [[1, 1], [1, 1]], [[0, 1, 0], [1, 1, 1]],
  [[1, 0, 0], [1, 1, 1]], [[0, 0, 1], [1, 1, 1]], [[1, 1, 0], [0, 1, 1]], [[0, 1, 1], [1, 1, 0]],
];
function tetrisTier(score: number) { return score >= 2500 ? 3 : score >= 1500 ? 2 : score >= 800 ? 1 : 0; }
export function TetrisRoom({ game }: { game: GameDef }) {
  const room = useGameRoom(game);
  const [stake, setStake] = useState(5);
  const [board, setBoard] = useState<number[][]>(Array.from({ length: 20 }, () => Array(10).fill(0)));
  const [cur, setCur] = useState<{ shape: number[][]; x: number; y: number; color: number } | null>(null);
  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [msg, setMsg] = useState("Clear lines — 800 pts ×1, 1500 ×2, 2500 ×3. One Rotate button + drag to move.");
  const scoreRef = useRef(0);
  const stateRef = useRef({ board, cur, playing });
  stateRef.current = { board, cur, playing };

  const spawn = (b: number[][]) => {
    const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    const piece = { shape, x: 3, y: 0, color: 1 + Math.floor(Math.random() * 6) };
    if (collides(b, piece.shape, piece.x, piece.y)) return null;
    return piece;
  };
  const collides = (b: number[][], shape: number[][], x: number, y: number) => {
    for (let r = 0; r < shape.length; r++) for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const bx = x + c, by = y + r;
      if (bx < 0 || bx >= 10 || by >= 20) return true;
      if (by >= 0 && b[by][bx]) return true;
    }
    return false;
  };
  const lock = async (b: number[][], piece: { shape: number[][]; x: number; y: number; color: number }) => {
    const nb = b.map((row) => [...row]);
    piece.shape.forEach((row, r) => row.forEach((v, c) => { if (v && piece.y + r >= 0) nb[piece.y + r][piece.x + c] = piece.color; }));
    let cleared = 0;
    const kept = nb.filter((row) => { if (row.every(Boolean)) { cleared++; return false; } return true; });
    while (kept.length < 20) kept.unshift(Array(10).fill(0));
    const gained = [0, 100, 300, 500, 800][cleared] || 0;
    scoreRef.current += gained;
    setScore(scoreRef.current);
    setLines((l) => l + cleared);
    setBoard(kept);
    const next = spawn(kept);
    if (!next) {
      setPlaying(false);
      setCur(null);
      const mult = tetrisTier(scoreRef.current);
      const payout = Math.round(stake * mult);
      setMsg(mult > 0 ? `Game over — ${scoreRef.current} pts, ${lines + cleared} lines, ×${mult}! ${fmtCoins(payout)} coins` : `Game over — ${scoreRef.current} pts, under 800. No payout.`);
      await room.settle(stake, payout, { score: scoreRef.current, lines: lines + cleared, mult });
      return;
    }
    setCur(next);
  };

  useEffect(() => {
    if (!playing) return;
    const iv = setInterval(() => {
      const { board: b, cur: piece } = stateRef.current;
      if (!piece) return;
      if (!collides(b, piece.shape, piece.x, piece.y + 1)) setCur({ ...piece, y: piece.y + 1 });
      else void lock(b, piece);
    }, 700);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const start = () => {
    const b = Array.from({ length: 20 }, () => Array(10).fill(0));
    setBoard(b); setScore(0); scoreRef.current = 0; setLines(0); setPlaying(true);
    setCur(spawn(b));
    setMsg("Drop the pieces — fill rows to clear them.");
  };
  const move = (dx: number) => {
    if (!cur) return;
    if (!collides(board, cur.shape, cur.x + dx, cur.y)) setCur({ ...cur, x: cur.x + dx });
  };
  const rotate = () => {
    if (!cur) return;
    const shape = cur.shape[0].map((_, i) => cur.shape.map((row) => row[i]).reverse());
    if (!collides(board, shape, cur.x, cur.y)) setCur({ ...cur, shape });
  };
  const drop = () => {
    if (!cur) return;
    let y = cur.y;
    while (!collides(board, cur.shape, cur.x, y + 1)) y++;
    void lock(board, { ...cur, y });
  };

  const display = board.map((row) => [...row]);
  if (cur) cur.shape.forEach((row, r) => row.forEach((v, c) => { if (v && cur.y + r >= 0 && cur.y + r < 20) display[cur.y + r][cur.x + c] = cur.color; }));

  return (
    <RoomShell game={game} subtitle="Clear lines — 800 pts ×1, 1500 ×2, 2500 ×3." stats={room.stats} history={room.history}>
      <div className="xg-controls">
        <StakeChips stake={stake} setStake={setStake} currency="coins" disabled={playing} />
        <div className="tt-hud"><span>SCORE <b>{score}</b></span><span>LINES <b>{lines}</b></span><span>TIER <b>×{tetrisTier(score)}</b></span></div>
        <div className="tt-board">
          {display.map((row, r) => row.map((v, c) => <span key={`${r}-${c}`} className={`tt-cell${v ? " on" : ""}`} style={v ? { background: CANDY_COLORS[(v - 1) % 6] } : undefined} />))}
        </div>
        {playing && (
          <div className="tt-btns">
            <button type="button" className="btn btn-ghost" onClick={() => move(-1)}>←</button>
            <button type="button" className="btn btn-gold" onClick={rotate}>Rotate</button>
            <button type="button" className="btn btn-ghost" onClick={() => move(1)}>→</button>
            <button type="button" className="btn btn-gold" onClick={drop}>Drop</button>
          </div>
        )}
        {!playing && <button className="btn btn-gold xg-action" type="button" onClick={start}>Start · {stake} coins</button>}
        <p className="bottle-msg xg-msg">{msg}</p>
      </div>
    </RoomShell>
  );
}

// ---------------- Trivia ----------------
interface TriviaQ { id: string; question: string; options: string[]; category: string }
export function TriviaRoom({ game }: { game: GameDef }) {
  const room = useGameRoom(game);
  const [qs, setQs] = useState<TriviaQ[]>([]);
  const [token, setToken] = useState("");
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [time, setTime] = useState(15);
  const [phase, setPhase] = useState<"idle" | "playing" | "done">("idle");
  const [result, setResult] = useState<{ correct: number; payoutCoins: number; breakdown: { question: number; correct: boolean }[] } | null>(null);
  const [msg, setMsg] = useState("10 questions, 15 seconds each. Entry 5 coins — 7 right pays 10, 9 pays 15, 10 pays 25.");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = async () => {
    try {
      const r = await api<{ roundToken: string; questions: TriviaQ[] }>("/api/games/trivia/questions");
      setToken(r.roundToken);
      setQs(r.questions);
      setIdx(0); setAnswers([]); setPicked(null); setTime(15); setPhase("playing"); setResult(null);
      setMsg("Question 1 of 10 — good luck.");
    } catch (ex) {
      setMsg(ex instanceof Error ? ex.message : "Could not load questions.");
    }
  };

  const answer = useCallback((choice: number) => {
    if (phase !== "playing" || picked !== null) return;
    setPicked(choice);
    const a = [...answers, choice];
    setAnswers(a);
    setTimeout(() => {
      if (idx + 1 >= qs.length) {
        void grade(a);
      } else {
        setIdx(idx + 1); setPicked(null); setTime(15);
      }
    }, 600);
  }, [phase, picked, answers, idx, qs.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const grade = async (a: number[]) => {
    setPhase("done");
    if (timerRef.current) clearInterval(timerRef.current);
    try {
      const r = await api<{ correct: number; total: number; payoutCoins: number; cash: number; coins: number; breakdown: { question: number; correct: boolean }[] }>("/api/games/trivia/grade", {
        method: "POST",
        body: JSON.stringify({ roundToken: token, answers: a }),
      });
      setResult(r);
      setMsg(`${r.correct}/10 correct — ${r.payoutCoins > 0 ? `${r.payoutCoins} coins paid` : "no payout this round"}.`);
      await room.refreshStats();
      await room.refresh();
    } catch (ex) {
      setMsg(ex instanceof Error ? ex.message : "Grading failed.");
    }
  };

  useEffect(() => {
    if (phase !== "playing") return;
    timerRef.current = setInterval(() => {
      setTime((t) => {
        if (t <= 1) {
          // time out on this question — count as wrong (-1 sentinel)
          if (picked === null) answer(-1);
          return 15;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, idx, picked, answer]);

  const q = qs[idx];
  return (
    <RoomShell game={game} subtitle="10 questions, 15 seconds each. Entry 5 coins — 7 right pays 10, 9 pays 15, 10 pays 25." stats={room.stats} history={room.history}>
      <div className="xg-controls">
        {phase === "idle" && <button className="btn btn-gold xg-action" type="button" onClick={() => void start()}>Start round · 5 coins</button>}
        {phase === "playing" && q && (
          <div className="tv-stage">
            <div className="tv-hud"><span>Q {idx + 1}/10</span><span>{q.category}</span><span>{time}s</span></div>
            <h3 className="tv-q">{q.question}</h3>
            <div className="tv-opts">
              {q.options.map((o, i) => (
                <button key={i} type="button" className={`tv-opt${picked === i ? " picked" : ""}`} onClick={() => answer(i)} disabled={picked !== null}>{o}</button>
              ))}
            </div>
          </div>
        )}
        {phase === "done" && result && (
          <div className="tv-result">
            <h3>{result.correct}/10 correct — {result.payoutCoins} coins</h3>
            <div className="tv-breakdown">{result.breakdown.map((b, i) => <span key={i} className={b.correct ? "win" : "lose"}>Q{i + 1} {b.correct ? "✓" : "✗"}</span>)}</div>
            <button className="btn btn-gold xg-action" type="button" onClick={() => void start()}>Play again · 5 coins</button>
          </div>
        )}
        <p className="bottle-msg xg-msg">{msg}</p>
      </div>
    </RoomShell>
  );
}

// ---------------- Snake ----------------
export function SnakeRoom({ game }: { game: GameDef }) {
  const room = useGameRoom(game);
  const [playing, setPlaying] = useState(false);
  const [score, setScore] = useState(0);
  const [msg, setMsg] = useState("Eat apples (+10 pts), don't hit the walls or yourself. Entry 5 coins — 100+ pays 10, 200+ pays 20, 300+ pays 40.");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stRef = useRef<{ snake: { x: number; y: number }[]; dir: { x: number; y: number }; apple: { x: number; y: number }; speed: number } | null>(null);
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

  const start = () => {
    if (room.balance < 5) { setMsg("Not enough coins — claim your daily +5 or win some first."); return; }
    const snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
    stRef.current = { snake, dir: { x: 1, y: 0 }, apple: placeApple(snake), speed: 130 };
    scoreRef.current = 0;
    setScore(0); setPlaying(true);
    setMsg("Use arrow keys, swipe, or the on-screen arrows.");
  };

  useEffect(() => {
    if (!playing) return;
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const cell = 20;
    const step = (t: number) => {
      const st = stRef.current;
      if (!st) return;
      if (t - lastRef.current < st.speed) { rafRef.current = requestAnimationFrame(step); draw(); return; }
      lastRef.current = t;
      const head = { x: st.snake[0].x + st.dir.x, y: st.snake[0].y + st.dir.y };
      if (head.x < 0 || head.x >= 20 || head.y < 0 || head.y >= 20 || st.snake.some((s) => s.x === head.x && s.y === head.y)) {
        void end(scoreRef.current);
        return;
      }
      st.snake.unshift(head);
      if (head.x === st.apple.x && head.y === st.apple.y) {
        scoreRef.current += 10;
        setScore(scoreRef.current);
        st.speed = Math.max(70, st.speed - 3);
        st.apple = placeApple(st.snake);
      } else st.snake.pop();
      draw();
      rafRef.current = requestAnimationFrame(step);
      function draw() {
        const g = ctx!;
        const s = st!;
        g.fillStyle = "#0C2B22";
        g.fillRect(0, 0, 400, 400);
        g.fillStyle = "#E5322D";
        g.beginPath(); g.arc(s.apple.x * cell + 10, s.apple.y * cell + 10, 8, 0, 7); g.fill();
        g.fillStyle = "#3ED97E";
        s.snake.forEach((sn) => g.fillRect(sn.x * cell + 1, sn.y * cell + 1, cell - 2, cell - 2));
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, end]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = stRef.current;
      if (!st || !playing) return;
      const d = { ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 } }[e.key];
      if (d && !(d.x === -st.dir.x && d.y === -st.dir.y)) st.dir = d;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing]);

  const setDir = (x: number, y: number) => {
    const st = stRef.current;
    if (!st) return;
    if (!(x === -st.dir.x && y === -st.dir.y)) st.dir = { x, y };
  };

  return (
    <RoomShell game={game} subtitle="Eat apples (+10 pts), don't hit the walls or yourself. Entry 5 coins — 100+ pays 10, 200+ pays 20, 300+ pays 40." stats={room.stats} history={room.history}>
      <div className="xg-controls">
        <div className="sn-hud"><span>SCORE <b>{score}</b></span><span>PAYOUT <b>{payoutFor(score)} coins</b></span></div>
        <canvas ref={canvasRef} width={400} height={400} className="sn-canvas" aria-label="Snake board" />
        <div className="sn-arrows">
          <button type="button" aria-label="Up" onClick={() => setDir(0, -1)}>↑</button>
          <button type="button" aria-label="Left" onClick={() => setDir(-1, 0)}>←</button>
          <button type="button" aria-label="Down" onClick={() => setDir(0, 1)}>↓</button>
          <button type="button" aria-label="Right" onClick={() => setDir(1, 0)}>→</button>
        </div>
        {!playing && <button className="btn btn-gold xg-action" type="button" onClick={start}>Start · 5 coins</button>}
        <p className="bottle-msg xg-msg">{msg}</p>
      </div>
    </RoomShell>
  );
}

// ---------------- 2048 ----------------
function g48Tier(max: number) { return max >= 1024 ? 50 : max >= 512 ? 20 : max >= 256 ? 10 : 0; }
export function Game2048Room({ game }: { game: GameDef }) {
  const room = useGameRoom(game);
  const [board, setBoard] = useState<number[][]>([]);
  const [playing, setPlaying] = useState(false);
  const [over, setOver] = useState(false);
  const [maxTile, setMaxTile] = useState(0);
  const [msg, setMsg] = useState("Slide the tiles — reach 256 for 10 coins, 512 for 20, 1024 for 50. Entry 5 coins.");
  const boardRef = useRef<number[][]>([]);
  const maxRef = useRef(0);

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
    for (let i = 0; i < arr.length; i++) {
      if (arr[i + 1] === arr[i]) { out.push(arr[i] * 2); i++; }
      else out.push(arr[i]);
    }
    while (out.length < 4) out.push(0);
    return out;
  };
  const canMove = (b: number[][]) => {
    if (b.some((row) => row.some((v) => !v))) return true;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      if ((c < 3 && b[r][c] === b[r][c + 1]) || (r < 3 && b[r][c] === b[r + 1][c])) return true;
    }
    return false;
  };
  const move = useCallback(async (dir: "left" | "right" | "up" | "down") => {
    if (!playing || over) return;
    const b = boardRef.current;
    let nb: number[][] = b.map((row) => [...row]);
    if (dir === "left") nb = nb.map(slideLine);
    if (dir === "right") nb = nb.map((row) => slideLine([...row].reverse()).reverse());
    if (dir === "up") nb = [0, 1, 2, 3].map((c) => slideLine([b[0][c], b[1][c], b[2][c], b[3][c]])).reduce((acc, col, c) => { col.forEach((v, r) => { acc[r][c] = v; }); return acc; }, Array.from({ length: 4 }, () => Array(4).fill(0)));
    if (dir === "down") nb = [0, 1, 2, 3].map((c) => slideLine([b[3][c], b[2][c], b[1][c], b[0][c]]).reverse()).reduce((acc, col, c) => { col.forEach((v, r) => { acc[r][c] = v; }); return acc; }, Array.from({ length: 4 }, () => Array(4).fill(0)));
    if (JSON.stringify(nb) === JSON.stringify(b)) return;
    nb = addRandom(nb);
    const mx = Math.max(...nb.flat());
    maxRef.current = Math.max(maxRef.current, mx);
    setMaxTile(maxRef.current);
    boardRef.current = nb;
    setBoard(nb);
    if (mx >= 1024) {
      setOver(true); setPlaying(false);
      setMsg(`1024 reached! 50 coins — top tier.`);
      await room.settle(5, 50, { maxTile: mx });
      return;
    }
    if (!canMove(nb)) {
      setOver(true); setPlaying(false);
      const payout = g48Tier(maxRef.current);
      setMsg(payout > 0 ? `No moves left — best tile ${maxRef.current}, ${payout} coins.` : `No moves left — best tile ${maxRef.current}, under 256. No payout.`);
      await room.settle(5, payout, { maxTile: maxRef.current });
    }
  }, [playing, over, room]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, "left" | "right" | "up" | "down"> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };
      if (map[e.key]) { e.preventDefault(); void move(map[e.key]); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move]);

  const start = () => {
    if (room.balance < 5) { setMsg("Not enough coins — claim your daily +5 or win some first."); return; }
    let b = addRandom(Array.from({ length: 4 }, () => Array(4).fill(0)));
    b = addRandom(b);
    boardRef.current = b;
    setBoard(b);
    maxRef.current = 0; setMaxTile(0); setOver(false); setPlaying(true);
    setMsg("Arrow keys or swipe to slide.");
  };

  return (
    <RoomShell game={game} subtitle="Slide the tiles — reach 256 for 10 coins, 512 for 20, 1024 for 50. Entry 5 coins." stats={room.stats} history={room.history}>
      <div className="xg-controls">
        <div className="g48-hud"><span>BEST TILE <b>{maxTile || "—"}</b></span><span>PAYOUT <b>{g48Tier(maxTile)} coins</b></span></div>
        <div className="g48-board">
          {board.map((row, r) => row.map((v, c) => <span key={`${r}-${c}`} className={`g48-tile${v ? " on" : ""}`}>{v || ""}</span>))}
        </div>
        {playing && (
          <div className="tt-btns">
            <button type="button" className="btn btn-ghost" onClick={() => void move("left")}>←</button>
            <button type="button" className="btn btn-ghost" onClick={() => void move("up")}>↑</button>
            <button type="button" className="btn btn-ghost" onClick={() => void move("down")}>↓</button>
            <button type="button" className="btn btn-ghost" onClick={() => void move("right")}>→</button>
          </div>
        )}
        {(!playing) && <button className="btn btn-gold xg-action" type="button" onClick={start}>{over ? "Play again · 5 coins" : "Start · 5 coins"}</button>}
        <p className="bottle-msg xg-msg">{msg}</p>
      </div>
    </RoomShell>
  );
}
