// Round 18 — coin games: Bingo Blitz, Brick Breaker, Stack Tower,
// Bubble Shooter, Bullseye Darts, Connect Four. All stake coins (5 by
// default) and settle through the same room.settle pattern as the
// existing coin games. Payouts are total-return multipliers on the
// coin stake, capped by each game's maxMultiplier.
// Refs: mihailgaberov/bingo (bingo card + draws),
// staringelf/Breakout (canvas breakout),
// TomNgo03/Tower-Block (stack tower),
// legilioli/js-bubble-shooter (bubble shooter grid + match-3),
// kubowania/connect-four + caleb531/connect-four (board + AI).

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fmtCoins } from "../../lib/api";
import { GameDef } from "../../lib/games";
import { playSfx } from "../../lib/store";
import { RoomShell, StakeChips, useGameRoom } from "./shared";

// ---------- Bingo Blitz ----------
// 5×5 card, columns B 1–15, I 16–30, N 31–45, G 46–60, O 61–75,
// centre free. 12 balls drawn one at a time. 1 line ×2, 2 lines ×3,
// 3+ lines ×5.
function bingoCard(): (number | "FREE")[][] {
  const col = (lo: number) => {
    const nums = new Set<number>();
    while (nums.size < 5) nums.add(lo + Math.floor(Math.random() * 15));
    return [...nums];
  };
  const cols = [col(1), col(16), col(31), col(46), col(61)];
  const grid: (number | "FREE")[][] = [];
  for (let r = 0; r < 5; r++) grid.push([cols[0][r], cols[1][r], cols[2][r], cols[3][r], cols[4][r]]);
  grid[2][2] = "FREE";
  return grid;
}
const LINES: [number, number][][] = [
  [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]], [[1, 0], [1, 1], [1, 2], [1, 3], [1, 4]],
  [[2, 0], [2, 1], [2, 2], [2, 3], [2, 4]], [[3, 0], [3, 1], [3, 2], [3, 3], [3, 4]],
  [[4, 0], [4, 1], [4, 2], [4, 3], [4, 4]],
  [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1]],
  [[0, 2], [1, 2], [2, 2], [3, 2], [4, 2]], [[0, 3], [1, 3], [2, 3], [3, 3], [4, 3]],
  [[0, 4], [1, 4], [2, 4], [3, 4], [4, 4]],
  [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]], [[0, 4], [1, 3], [2, 2], [3, 1], [4, 0]],
];

export function BingoBlitzRoom({ game }: { game: GameDef }) {
  const room = useGameRoom(game);
  const [stake, setStake] = useState(5);
  const [card, setCard] = useState<(number | "FREE")[][]>([
    [1, 16, 31, 46, 61], [2, 17, 32, 47, 62], [3, 18, "FREE", 48, 63],
    [4, 19, 34, 49, 64], [5, 20, 35, 50, 65],
  ]);
  // The real card is drawn on mount — random draws must not run during
  // render (prerender + hydration both need a deterministic first paint).
  useEffect(() => { setCard(bingoCard()); }, []);
  const [drawn, setDrawn] = useState<number[]>([]);
  const [phase, setPhase] = useState<"idle" | "drawing" | "done">("idle");
  const [msg, setMsg] = useState("Your card is set — draw 12 balls. One line pays ×2, two lines ×3, three or more ×5.");

  const hit = (v: number | "FREE") => v === "FREE" || drawn.includes(v as number);

  const draw = async () => {
    if (phase === "drawing") return;
    if (room.balance < stake) { setMsg("Balance too low for that stake."); return; }
    const pool = Array.from({ length: 75 }, (_, i) => i + 1);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const picks = pool.slice(0, 12);
    setPhase("drawing");
    setDrawn([]);
    setMsg("Drawing the balls…");
    playSfx("spin", room.muted);
    picks.forEach((n, i) => {
      window.setTimeout(() => {
        setDrawn((d) => [...d, n]);
        playSfx("tick", room.muted);
        if (i === picks.length - 1) {
          const all = new Set(picks);
          const isHit = (v: number | "FREE") => v === "FREE" || all.has(v as number);
          const lines = LINES.filter((line) => line.every(([r, c]) => isHit(card[r][c]))).length;
          const mult = lines === 0 ? 0 : lines === 1 ? 2 : lines === 2 ? 3 : 5;
          const payout = Math.round(stake * mult);
          setPhase("done");
          setMsg(lines === 0 ? "No lines — better luck next card." : `${lines} line${lines > 1 ? "s" : ""} complete! Pays ×${mult} — ${fmtCoins(payout)}.`);
          void room.settle(stake, payout, { drawn: picks, lines, mult });
        }
      }, 450 * (i + 1));
    });
  };

  const newCard = () => { setCard(bingoCard()); setDrawn([]); setPhase("idle"); setMsg("Fresh card — draw 12 balls."); };

  return (
    <RoomShell game={game} subtitle="Bingo Blitz — 12 balls, one card. A line pays ×2, three or more pay ×5." stats={room.stats} history={room.history}>
      <div className="xg-controls">
        <StakeChips stake={stake} setStake={setStake} currency="coins" disabled={phase === "drawing"} />
        <div className="v18-bingo" aria-label="Bingo card">
          {["B", "I", "N", "G", "O"].map((h) => <span key={h} className="v18-bhead">{h}</span>)}
          {card.map((row, r) => row.map((v, c) => (
            <span key={`${r}-${c}`} className={`v18-bcell${hit(v) ? " hit" : ""}${v === "FREE" ? " free" : ""}`}>{v === "FREE" ? <svg viewBox="0 0 24 24" aria-hidden="true" className="v18-freestar"><path d="M12 2 L14.6 8.6 L21.5 9 L16.4 13.4 L18 20.5 L12 16.8 L6 20.5 L7.6 13.4 L2.5 9 L9.4 8.6 Z" fill="#F2C230" stroke="#7A5200" strokeWidth="1" strokeLinejoin="round" /></svg> : v}</span>
          )))}
        </div>
        <div className="v18-drawn" aria-label="Drawn balls">
          {drawn.length === 0 ? <span className="v18-sub">No balls drawn yet</span> : drawn.map((n) => <span key={n} className="v18-ball">{n}</span>)}
        </div>
        {phase !== "drawing" && <button className="btn btn-gold xg-action" type="button" onClick={() => void draw()}>{phase === "done" ? `Draw again · ${fmtCoins(stake)}` : `Draw 12 balls · ${fmtCoins(stake)}`}</button>}
        {phase === "done" && <button className="btn btn-ghost xg-action" type="button" onClick={newCard}>New card</button>}
        <p className="bottle-msg xg-msg">{msg}</p>
      </div>
    </RoomShell>
  );
}

// ---------- Brick Breaker ----------
// Canvas breakout: paddle + ball, 24 bricks. One ball — miss it and
// the round ends. Clear them all for ×5, 80%+ for ×3, 50%+ for ×2.
export function BrickBreakerRoom({ game }: { game: GameDef }) {
  const room = useGameRoom(game);
  const [stake, setStake] = useState(5);
  const [phase, setPhase] = useState<"idle" | "playing" | "done">("idle");
  const [broken, setBroken] = useState(0);
  const [msg, setMsg] = useState("Break the wall — clear all 24 bricks for ×5, 80% for ×3, half for ×2. One ball — miss it and you lose. Drag or use ← →.");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // All-games sound pass: bricks break inside the rAF loop, so the
  // mute flag is read through a ref (mirror the Plinko pattern).
  const mutedRef = useRef(room.muted);
  mutedRef.current = room.muted;
  const sRef = useRef({ px: 120, bx: 150, by: 300, vx: 3, vy: -3.4, bricks: [] as boolean[], broken: 0, over: false, trail: [] as { x: number; y: number }[] });
  const rafRef = useRef(0);
  const settledRef = useRef(false);

  const finish = useCallback(async (brk: number, fell = false) => {
    sRef.current.over = true;
    cancelAnimationFrame(rafRef.current);
    setPhase("done");
    const mult = brk >= 24 ? 5 : brk >= 20 ? 3 : brk >= 12 ? 2 : 0;
    const payout = Math.round(stake * mult);
    // One ball only: when the ball falls the round ends here, so the
    // message names the miss.
    const lead = fell ? "Ball missed — " : "";
    setMsg(brk >= 24 ? `Wall cleared! ×5 — ${fmtCoins(payout)}` : brk >= 12 ? `${lead}${brk} bricks down — pays ×${mult}, ${fmtCoins(payout)}` : `${lead}${brk} bricks down — not enough for a payout.`);
    if (!settledRef.current) { settledRef.current = true; await room.settle(stake, payout, { broken: brk, mult }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stake, room]);

  const draw = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const s = sRef.current;
    const W = 300, H = 400;
    // Felt night background with a starfield and a soft gold glow.
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0B1030");
    bg.addColorStop(0.6, "#070812");
    bg.addColorStop(1, "#0C2B22");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,246,216,.7)";
    for (let i = 0; i < 22; i++) { const sx = (i * 47 + 13) % W, sy = (i * 61 + 9) % 300; ctx.globalAlpha = 0.25 + ((i * 7) % 10) / 18; ctx.fillRect(sx, sy, 1.6, 1.6); }
    ctx.globalAlpha = 1;
    const glow = ctx.createRadialGradient(150, 60, 4, 150, 60, 130);
    glow.addColorStop(0, "rgba(242,194,48,.14)");
    glow.addColorStop(1, "rgba(242,194,48,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, 200);
    // Bricks: bevelled blocks with a top highlight, a darker base
    // and a rivet dot — 8 cols × 3 rows.
    const BW = 32, BH = 14, GAP = 4, OX = 6, OY = 34;
    const colors = ["#F2C230", "#E5322D", "#3ED97E"];
    const dark = ["#8A6D1B", "#7A0F0F", "#1E6B2E"];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) {
      if (!s.bricks[r * 8 + c]) continue;
      const x = OX + c * (BW + GAP), y = OY + r * (BH + GAP);
      const g = ctx.createLinearGradient(x, y, x, y + BH);
      g.addColorStop(0, "#FFF6D8");
      g.addColorStop(0.22, colors[r]);
      g.addColorStop(1, dark[r]);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.roundRect(x, y, BW, BH, 3); ctx.fill();
      ctx.fillStyle = "rgba(255,246,216,.55)";
      ctx.fillRect(x + 3, y + 1.5, BW - 6, 2);
      ctx.fillStyle = "rgba(7,8,18,.35)";
      ctx.beginPath(); ctx.arc(x + BW / 2, y + BH / 2 + 1, 2, 0, 7); ctx.fill();
    }
    // Paddle: metallic gold with grip lines and rounded ends.
    const pg = ctx.createLinearGradient(s.px, 380, s.px, 390);
    pg.addColorStop(0, "#FFE9A8");
    pg.addColorStop(0.5, "#F2C230");
    pg.addColorStop(1, "#B8860B");
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.roundRect(s.px, 380, 60, 10, 5); ctx.fill();
    ctx.strokeStyle = "rgba(122,82,0,.8)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(s.px + (60 / 4) * i, 382); ctx.lineTo(s.px + (60 / 4) * i, 388); ctx.stroke(); }
    ctx.fillStyle = "rgba(255,246,216,.7)";
    ctx.fillRect(s.px + 4, 381, 52, 1.6);
    // Ball: shaded sphere with a highlight, plus a fading trail.
    s.trail.forEach((p, i) => {
      ctx.fillStyle = `rgba(255,246,216,${0.05 + (i / Math.max(1, s.trail.length)) * 0.16})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, 5 - (i / Math.max(1, s.trail.length)) * 2, 0, 7); ctx.fill();
    });
    const bg2 = ctx.createRadialGradient(s.bx - 2, s.by - 2, 0.5, s.bx, s.by, 7);
    bg2.addColorStop(0, "#FFFFFF");
    bg2.addColorStop(0.55, "#FFF6D8");
    bg2.addColorStop(1, "#C99612");
    ctx.fillStyle = bg2;
    ctx.beginPath(); ctx.arc(s.bx, s.by, 6, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.95)";
    ctx.beginPath(); ctx.arc(s.bx - 2, s.by - 2, 1.6, 0, 7); ctx.fill();
  }, []);

  const start = () => {
    if (room.balance < stake) { setMsg("Balance too low for that stake."); return; }
    settledRef.current = false;
    sRef.current = { px: 120, bx: 150, by: 300, vx: 3, vy: -3.4, bricks: new Array(24).fill(true), broken: 0, over: false, trail: [] };
    setBroken(0);
    setPhase("playing");
    setMsg("Go! Break the wall.");
    const step = () => {
      const s = sRef.current;
      if (s.over) return;
      s.bx += s.vx; s.by += s.vy;
      s.trail.push({ x: s.bx, y: s.by });
      if (s.trail.length > 7) s.trail.shift();
      if (s.bx < 6 || s.bx > 294) s.vx = -s.vx;
      if (s.by < 6) s.vy = -s.vy;
      if (s.by > 380 && s.by < 394 && s.bx > s.px - 6 && s.bx < s.px + 66) {
        s.vy = -Math.abs(s.vy);
        s.vx += ((s.bx - (s.px + 30)) / 30) * 1.2;
      }
      // bricks
      const BW = 32, BH = 14, GAP = 4, OX = 6, OY = 34;
      for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) {
        if (!s.bricks[r * 8 + c]) continue;
        const x = OX + c * (BW + GAP), y = OY + r * (BH + GAP);
        if (s.bx > x - 6 && s.bx < x + BW + 6 && s.by > y - 6 && s.by < y + BH + 6) {
          s.bricks[r * 8 + c] = false;
          s.broken++;
          playSfx("crack", mutedRef.current);
          setBroken(s.broken);
          s.vy = -s.vy;
          if (s.broken >= 24) { draw(); void finish(s.broken); return; }
        }
      }
      // One ball only: a miss ends the round at once — no reset, no
      // extra balls. finish() settles with the bricks-broken payout.
      if (s.by > 406) { draw(); void finish(s.broken, true); return; }
      draw();
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 300;
    sRef.current.px = Math.max(0, Math.min(240, x - 30));
    draw();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") { sRef.current.px = Math.max(0, sRef.current.px - 18); draw(); }
    if (e.key === "ArrowRight") { sRef.current.px = Math.min(240, sRef.current.px + 18); draw(); }
  };

  useEffect(() => { draw(); return () => cancelAnimationFrame(rafRef.current); }, [draw]);

  return (
    <RoomShell game={game} subtitle="Brick Breaker — paddle, ball, wall. Clear it all for ×5." stats={room.stats} history={room.history}>
      <div className="xg-controls">
        <StakeChips stake={stake} setStake={setStake} currency="coins" disabled={phase === "playing"} />
        <div className="v18-stage">
          <div className="v18-hud"><span>BRICKS <b>{broken}/24</b></span></div>
          <canvas ref={canvasRef} width={300} height={400} className="v18-canvas" tabIndex={0} onPointerMove={onMove} onKeyDown={onKey} aria-label="Brick Breaker board" />
          <p className="v18-aim">Drag across the board (or ← → keys) to move the paddle</p>
        </div>
        {phase !== "playing" && <button className="btn btn-gold xg-action" type="button" onClick={start}>{phase === "done" ? `Play again · ${fmtCoins(stake)}` : `Start · ${fmtCoins(stake)}`}</button>}
        <p className="bottle-msg xg-msg">{msg}</p>
      </div>
    </RoomShell>
  );
}

// ---------- Stack Tower ----------
// A block swings above the tower — tap to drop it. The overhang is
// trimmed; miss the tower and the round ends. 10 blocks max, each one
// placed is +0.5×, a full tower pays ×5.
export function StackTowerRoom({ game }: { game: GameDef }) {
  const room = useGameRoom(game);
  const [stake, setStake] = useState(5);
  const [phase, setPhase] = useState<"idle" | "playing" | "done">("idle");
  const [blocks, setBlocks] = useState<{ x: number; w: number }[]>([{ x: 90, w: 120 }]);
  const [swing, setSwing] = useState(90);
  const [msg, setMsg] = useState("The block swings — tap the tower to drop it. Each block placed is +0.5×, a full 10-block tower pays ×5.");
  const swingRef = useRef({ x: 90, dir: 1, w: 120 });
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const settledRef = useRef(false);

  useEffect(() => {
    if (phase !== "playing") return;
    const iv = window.setInterval(() => {
      const s = swingRef.current;
      s.x += s.dir * 4;
      if (s.x > 270 - s.w) { s.x = 270 - s.w; s.dir = -1; }
      if (s.x < 0) { s.x = 0; s.dir = 1; }
      setSwing(s.x);
    }, 16);
    return () => window.clearInterval(iv);
  }, [phase]);

  const start = () => {
    if (room.balance < stake) { setMsg("Balance too low for that stake."); return; }
    settledRef.current = false;
    setBlocks([{ x: 90, w: 120 }]);
    swingRef.current = { x: 90, dir: 1, w: 120 };
    setPhase("playing");
    setMsg("Drop the block on the tower!");
  };

  const drop = async () => {
    if (phase !== "playing") return;
    const prev = blocksRef.current[blocksRef.current.length - 1];
    const cur = swingRef.current;
    const left = Math.max(prev.x, cur.x);
    const right = Math.min(prev.x + prev.w, cur.x + cur.w);
    const placed = blocksRef.current.length; // blocks already placed incl. base
    if (right - left <= 0) {
      setPhase("done");
      const mult = Math.round(placed * 0.5 * 100) / 100;
      const payout = Math.round(stake * mult);
      setMsg(`Missed the tower after ${placed} block${placed === 1 ? "" : "s"} — ×${mult}, ${fmtCoins(payout)}.`);
      if (!settledRef.current) { settledRef.current = true; await room.settle(stake, payout, { placed, mult }); }
      return;
    }
    // Landed on the tower — a crack for the block.
    playSfx("crack", room.muted);
    const nb = { x: left, w: right - left };
    const next = [...blocksRef.current, nb];
    setBlocks(next);
    swingRef.current = { x: 0, dir: 1, w: nb.w };
    if (next.length - 1 >= 10) {
      setPhase("done");
      const payout = Math.round(stake * 5);
      setMsg(`A full 10-block tower! ×5 — ${fmtCoins(payout)}`);
      if (!settledRef.current) { settledRef.current = true; await room.settle(stake, payout, { placed: 10, mult: 5 }); }
      return;
    }
    setMsg(`${next.length - 1} block${next.length - 1 === 1 ? "" : "s"} up — ×${((next.length - 1) * 0.5).toFixed(1)} so far. Drop the next one!`);
  };

  return (
    <RoomShell game={game} subtitle="Stack Tower — drop the swinging block on the tower. 10 blocks pays ×5." stats={room.stats} history={room.history}>
      <div className="xg-controls">
        <StakeChips stake={stake} setStake={setStake} currency="coins" disabled={phase === "playing"} />
        <div className="v18-stack" onPointerDown={() => void drop()} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); void drop(); } }} aria-label="Stack tower — tap to drop the block">
          {blocks.map((b, i) => (
            <div key={i} className="v18-block" style={{ left: `${b.x}px`, width: `${b.w}px`, bottom: `${i * 22}px`, background: i % 2 === 0 ? "#F2C230" : "#C99612" }} />
          ))}
          {phase === "playing" && <div className="v18-block swing" style={{ left: `${swing}px`, width: `${swingRef.current.w}px`, bottom: `${blocks.length * 22}px` }} />}
        </div>
        <p className="v18-sub">Blocks placed: {blocks.length - 1} / 10 · current payout ×{((blocks.length - 1) * 0.5).toFixed(1)}</p>
        {phase === "idle" && <button className="btn btn-gold xg-action" type="button" onClick={start}>Start stacking · {fmtCoins(stake)}</button>}
        {phase === "done" && <button className="btn btn-gold xg-action" type="button" onClick={start}>Stack again · ${fmtCoins(stake)}</button>}
        <p className="bottle-msg xg-msg">{msg}</p>
      </div>
    </RoomShell>
  );
}

// ---------- Bubble Shooter ----------
// Aim and shoot bubbles up the grid — match 3+ of a colour to pop
// them. 30 shots. Pop 10 ×1, 20 ×2, 30 ×3, clear the board ×5.
const BUB_COLORS = ["#F2C230", "#E5322D", "#3ED97E", "#5AA9FF"];
const BUB_COLS = 11;
const BUB_ROWS = 9;

function neighbours(r: number, c: number): [number, number][] {
  const odd = r % 2 === 1;
  const list: [number, number][] = odd
    ? [[r - 1, c], [r - 1, c + 1], [r, c - 1], [r, c + 1], [r + 1, c], [r + 1, c + 1]]
    : [[r - 1, c - 1], [r - 1, c], [r, c - 1], [r, c + 1], [r + 1, c - 1], [r + 1, c]];
  return list.filter(([rr, cc]) => rr >= 0 && rr < BUB_ROWS && cc >= 0 && cc < BUB_COLS);
}

export function BubbleShooterRoom({ game }: { game: GameDef }) {
  const room = useGameRoom(game);
  const [stake, setStake] = useState(5);
  const [grid, setGrid] = useState<(number | null)[][]>(() => Array.from({ length: 6 }, () => new Array(BUB_COLS).fill(0)));
  // Random board on mount only — no Math.random during render
  // (prerender + hydration need a deterministic first paint).
  useEffect(() => {
    setGrid(Array.from({ length: 6 }, () => Array.from({ length: BUB_COLS }, () => Math.floor(Math.random() * 4))));
    curRef.current = Math.floor(Math.random() * 4);
  }, []);
  const [shots, setShots] = useState(30);
  const [popped, setPopped] = useState(0);
  const [phase, setPhase] = useState<"idle" | "playing" | "done">("idle");
  const [angle, setAngle] = useState(0);
  const [flying, setFlying] = useState<{ x: number; y: number; c: number } | null>(null);
  const [msg, setMsg] = useState("Aim with your finger or mouse, tap to shoot. Match 3+ of a colour to pop them — pop 30 for ×3, clear the board for ×5.");
  const gridRef = useRef(grid);
  gridRef.current = grid;
  const settledRef = useRef(false);
  const stageRef = useRef<HTMLDivElement>(null);
  // Fixed placeholder — the mount effect above picks the real colour.
  // (Math.random() here would break the production prerender.)
  const curRef = useRef(0);

  const cellXY = (r: number, c: number): [number, number] => {
    const x = 14 + c * 26 + (r % 2 === 1 ? 13 : 0);
    const y = 14 + r * 24;
    return [x, y];
  };

  const finish = useCallback(async (pop: number, cleared: boolean, shotsLeft: number) => {
    setPhase("done");
    setFlying(null);
    const mult = cleared ? 5 : pop >= 30 ? 3 : pop >= 20 ? 2 : pop >= 10 ? 1 : 0;
    const payout = Math.round(stake * mult);
    setMsg(cleared ? `Board cleared! ×5 — ${fmtCoins(payout)}` : pop >= 10 ? `${pop} bubbles popped — pays ×${mult}, ${fmtCoins(payout)}` : `${pop} bubbles popped — not enough for a payout. ${shotsLeft} shots used.`);
    if (!settledRef.current) { settledRef.current = true; await room.settle(stake, payout, { popped: pop, mult }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stake, room]);

  const start = () => {
    if (room.balance < stake) { setMsg("Balance too low for that stake."); return; }
    settledRef.current = false;
    setGrid(Array.from({ length: 6 }, () => Array.from({ length: BUB_COLS }, () => Math.floor(Math.random() * 4))));
    setShots(30); setPopped(0); setFlying(null);
    setPhase("playing");
    setMsg("Aim and shoot — match 3+ to pop!");
  };

  const aim = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = stageRef.current;
    if (!el || phase !== "playing") return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height;
    const a = Math.atan2(x, -y) * (180 / Math.PI);
    setAngle(Math.max(-75, Math.min(75, a)));
  };

  const shoot = () => {
    if (phase !== "playing" || flying || shots <= 0) return;
    playSfx("shoot", room.muted);
    const color = curRef.current;
    curRef.current = Math.floor(Math.random() * 4);
    setShots((s) => s - 1);
    const el = stageRef.current;
    const W = el ? el.clientWidth : 300;
    const H = el ? el.clientHeight : 320;
    const rad = (angle * Math.PI) / 180;
    const speed = 520; // px/s
    const fx = { x: W / 2, y: H - 26, c: color };
    const t0 = performance.now();
    const step = (now: number) => {
      const dt = (now - t0) / 1000;
      let x = fx.x + Math.sin(rad) * speed * dt;
      let y = fx.y - Math.cos(rad) * speed * dt;
      if (x < 14) x = 14 + (14 - x);
      if (x > W - 14) x = W - 14 - (x - (W - 14));
      const g = gridRef.current;
      let hit: [number, number] | null = null;
      if (y <= 24) hit = [0, Math.max(0, Math.min(BUB_COLS - 1, Math.round((x - 14) / 26)))];
      else {
        outer: for (let r = 0; r < BUB_ROWS; r++) for (let c = 0; c < BUB_COLS; c++) {
          if (g[r] && g[r][c] !== null && g[r][c] !== undefined) {
            const [cx, cy] = cellXY(r, c);
            const sx = (cx / 300) * W, sy = (cy / 240) * H;
            if (Math.hypot(x - sx, y - sy) < 26) {
              // nearest empty cell to the contact point
              let best: [number, number] | null = null;
              let bestD = Infinity;
              for (let rr = 0; rr < BUB_ROWS; rr++) for (let cc = 0; cc < BUB_COLS; cc++) {
                const occupied = g[rr] && g[rr][cc] !== null && g[rr][cc] !== undefined;
                if (occupied) continue;
                const [bx, by] = cellXY(rr, cc);
                const d = Math.hypot(x - (bx / 300) * W, y - (by / 240) * H);
                if (d < bestD) { bestD = d; best = [rr, cc]; }
              }
              hit = best;
              break outer;
            }
          }
        }
      }
      if (hit) {
        const [hr, hc] = hit;
        const next = gridRef.current.map((row) => [...row]);
        while (next.length <= hr) next.push(new Array(BUB_COLS).fill(null));
        next[hr][hc] = color;
        // flood fill match
        const group: [number, number][] = [];
        const seen = new Set<string>();
        const stack: [number, number][] = [[hr, hc]];
        while (stack.length) {
          const [r, c] = stack.pop()!;
          const key = `${r},${c}`;
          if (seen.has(key)) continue;
          seen.add(key);
          if (next[r][c] !== color) continue;
          group.push([r, c]);
          neighbours(r, c).forEach(([nr, nc]) => { if (next[nr] && next[nr][nc] === color) stack.push([nr, nc]); });
        }
        let popCount = 0;
        if (group.length >= 3) {
          group.forEach(([r, c]) => { next[r][c] = null; });
          popCount = group.length;
          // floating bubbles (not connected to row 0) fall
          const connected = new Set<string>();
          const q: [number, number][] = [];
          for (let c = 0; c < BUB_COLS; c++) if (next[0][c] !== null && next[0][c] !== undefined) q.push([0, c]);
          while (q.length) {
            const [r, c] = q.pop()!;
            const key = `${r},${c}`;
            if (connected.has(key)) continue;
            connected.add(key);
            neighbours(r, c).forEach(([nr, nc]) => { if (next[nr] && next[nr][nc] !== null && next[nr][nc] !== undefined) q.push([nr, nc]); });
          }
          for (let r = 0; r < next.length; r++) for (let c = 0; c < BUB_COLS; c++) {
            if (next[r][c] !== null && next[r][c] !== undefined && !connected.has(`${r},${c}`)) { next[r][c] = null; popCount++; }
          }
        }
        setGrid(next);
        setFlying(null);
        const totalPopped = popped + popCount;
        setPopped(totalPopped);
        const cleared = next.every((row) => row.every((v) => v === null || v === undefined));
        const shotsLeft = shots - 1;
        if (cleared) { void finish(totalPopped, true, shotsLeft); return; }
        if (shotsLeft <= 0) { void finish(totalPopped, false, shotsLeft); return; }
        if (popCount > 0) setMsg(`${popCount} popped! ${totalPopped} total — ${shotsLeft} shots left.`);
        return;
      }
      if (y < -20) { setFlying(null); return; }
      setFlying({ x, y, c: color });
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  return (
    <RoomShell game={game} subtitle="Bubble Shooter — aim, shoot, match 3+. Pop 30 for ×3, clear the board for ×5." stats={room.stats} history={room.history}>
      <div className="xg-controls">
        <StakeChips stake={stake} setStake={setStake} currency="coins" disabled={phase === "playing"} />
        <div className="v18-stage">
          <div className="v18-hud"><span>SHOTS <b>{shots}</b></span><span>POPPED <b>{popped}</b></span><span>NEXT <b className="v18-nextdot" style={{ ["--bub" as string]: BUB_COLORS[curRef.current] }} aria-hidden="true" /></span></div>
          <div ref={stageRef} className={phase === "playing" ? "v18-bubbleboard live" : "v18-bubbleboard"} onPointerMove={aim} onPointerDown={(e) => { aim(e); shoot(); }} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "ArrowLeft") setAngle((a) => Math.max(-75, a - 5)); if (e.key === "ArrowRight") setAngle((a) => Math.min(75, a + 5)); if (e.key === " " || e.key === "Enter") { e.preventDefault(); shoot(); } }} aria-label="Bubble shooter board — aim and tap to shoot">
            {grid.map((row, r) => row.map((v, c) => {
              if (v === null || v === undefined) return null;
              const [x, y] = cellXY(r, c);
              return <span key={`${r}-${c}`} className="v18-bub" style={{ left: `${(x / 300) * 100}%`, top: `${(y / 240) * 100}%`, ["--bub" as string]: BUB_COLORS[v] }} />;
            }))}
            {phase === "playing" && !flying && <span className="v18-aimline" style={{ transform: `rotate(${angle}deg)` }} aria-hidden="true" />}
            {flying && <span className="v18-bub fly" style={{ left: `${(flying.x / (stageRef.current?.clientWidth ?? 300)) * 100}%`, top: `${(flying.y / (stageRef.current?.clientHeight ?? 320)) * 100}%`, ["--bub" as string]: BUB_COLORS[flying.c] }} />}
            <span className="v18-shooter" style={{ ["--bub" as string]: BUB_COLORS[curRef.current] }} aria-hidden="true" />
          </div>
          <p className="v18-aim">Move to aim · tap the board (or Space) to shoot · ← → keys work too</p>
        </div>
        {phase === "idle" && <button className="btn btn-gold xg-action" type="button" onClick={start}>Start shooting · {fmtCoins(stake)}</button>}
        {phase === "done" && <button className="btn btn-gold xg-action" type="button" onClick={start}>Shoot again · {fmtCoins(stake)}</button>}
        <p className="bottle-msg xg-msg">{msg}</p>
      </div>
    </RoomShell>
  );
}

// ---------- Bullseye Darts ----------
// The aim drifts in a slow circle — tap the board to throw. 3 darts.
// Bullseye 50, inner 25, mid 15, outer 10, edge 5. Total 100+ ×5,
// 70+ ×3, 40+ ×2.

// A real dartboard: 20 numbered segments in the standard order,
// doubles + trebles rings, 25 ring and bull — drawn as SVG. The thin
// gold circles mark the scoring radii (20/40/60/80/100) so the zones
// the game actually pays on are visible.
const DART_ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
function wedgePath(cx: number, cy: number, r1: number, r2: number, a0: number, a1: number): string {
  const p = (r: number, a: number) => { const rad = (a * Math.PI) / 180; return `${(cx + r * Math.cos(rad)).toFixed(1)} ${(cy + r * Math.sin(rad)).toFixed(1)}`; };
  return `M ${p(r1, a0)} L ${p(r2, a0)} A ${r2} ${r2} 0 0 1 ${p(r2, a1)} L ${p(r1, a1)} A ${r1} ${r1} 0 0 0 ${p(r1, a0)} Z`;
}
function DartboardArt() {
  const cx = 130, cy = 130;
  const segs = DART_ORDER.map((num, i) => {
    const a0 = -90 - 9 + i * 18, a1 = -90 + 9 + i * 18;
    const black = i % 2 === 0; // 20, 18, 13… are the black wedges
    const mid = -90 + i * 18;
    const tx = cx + 121 * Math.cos((mid * Math.PI) / 180), ty = cy + 121 * Math.sin((mid * Math.PI) / 180);
    return (
      <g key={num}>
        <path d={wedgePath(cx, cy, 62, 100, a0, a1)} fill={black ? "#14213D" : "#F5EFE0"} />
        <path d={wedgePath(cx, cy, 52, 62, a0, a1)} fill={black ? "#E5322D" : "#3ED97E"} />
        <path d={wedgePath(cx, cy, 100, 112, a0, a1)} fill={black ? "#E5322D" : "#3ED97E"} />
        <text x={tx} y={ty} textAnchor="middle" dominantBaseline="central" fontSize="10.5" fontWeight="900" fill="#FFF6D8" fontFamily="Outfit, sans-serif">{num}</text>
      </g>
    );
  });
  return (
    <svg viewBox="0 0 260 260" aria-hidden="true" className="v18-boardart">
      <circle cx={cx} cy={cy} r={129} fill="#0A0A12" stroke="#C99612" strokeWidth="2" />
      <circle cx={cx} cy={cy} r={112} fill="#14213D" />
      {segs}
      <circle cx={cx} cy={cy} r={22} fill="#3ED97E" stroke="#1E6B2E" strokeWidth="1" />
      <circle cx={cx} cy={cy} r={11} fill="#E5322D" stroke="#7A0F0F" strokeWidth="1" />
      <circle cx={cx} cy={cy} r={4} fill="#FFF6D8" opacity=".85" />
      {[20, 40, 60, 80, 100].map((r) => <circle key={r} cx={cx} cy={cy} r={r} fill="none" stroke="#F2C230" strokeWidth="1" strokeDasharray="2 3" opacity=".55" />)}
      <circle cx={cx} cy={cy} r={112} fill="none" stroke="#C99612" strokeWidth="1.4" />
    </svg>
  );
}

function DartMark() {
  return (
    <svg viewBox="0 0 26 26" aria-hidden="true" className="v18-dartmark">
      <g transform="rotate(-28 13 13)">
        <path d="M13 2 L16.5 9 L13 12 L9.5 9 Z" fill="#F2C230" stroke="#7A5200" strokeWidth=".8" />
        <path d="M13 2 L13 9" stroke="#FFF6D8" strokeWidth="1" opacity=".8" />
        <rect x="12" y="11" width="2" height="8" fill="#8A6D1B" />
        <path d="M13 19 L11.4 24 L14.6 24 Z" fill="#C0C0C0" stroke="#555" strokeWidth=".6" />
      </g>
    </svg>
  );
}
export function BullseyeDartsRoom({ game }: { game: GameDef }) {
  const room = useGameRoom(game);
  const [stake, setStake] = useState(5);
  const [phase, setPhase] = useState<"idle" | "playing" | "done">("idle");
  const [aim, setAim] = useState({ x: 0, y: 0 });
  const [darts, setDarts] = useState<{ x: number; y: number; score: number }[]>([]);
  const [msg, setMsg] = useState("Three darts, one drifting aim — tap the board to throw. Bullseye is 50, 100+ total pays ×5.");
  const dartsRef = useRef(darts);
  dartsRef.current = darts;
  const settledRef = useRef(false);

  useEffect(() => {
    if (phase !== "playing") return;
    let raf = 0;
    const loop = () => {
      const t = Date.now() / 1000;
      const speed = 0.9 + dartsRef.current.length * 0.35;
      setAim({ x: Math.sin(t * 1.1 * speed) * 62, y: Math.sin(t * 1.7 * speed + 1.2) * 62 });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  const start = () => {
    if (room.balance < stake) { setMsg("Balance too low for that stake."); return; }
    settledRef.current = false;
    setDarts([]);
    setPhase("playing");
    setMsg("Dart 1 — tap the board when the crosshair is on the bullseye!");
  };

  const throwDart = async () => {
    if (phase !== "playing") return;
    playSfx("shoot", room.muted);
    const jx = aim.x + (Math.random() * 16 - 8);
    const jy = aim.y + (Math.random() * 16 - 8);
    const dist = Math.hypot(jx, jy);
    const score = dist <= 20 ? 50 : dist <= 40 ? 25 : dist <= 60 ? 15 : dist <= 80 ? 10 : dist <= 100 ? 5 : 0;
    const next = [...dartsRef.current, { x: jx, y: jy, score }];
    setDarts(next);
    if (next.length >= 3) {
      const total = next.reduce((s, d) => s + d.score, 0);
      const mult = total >= 100 ? 5 : total >= 70 ? 3 : total >= 40 ? 2 : 0;
      const payout = Math.round(stake * mult);
      setPhase("done");
      setMsg(`Darts: ${next.map((d) => d.score).join(" + ")} = ${total} — ${mult > 0 ? `pays ×${mult}, ${fmtCoins(payout)}!` : "not enough for a payout."}`);
      if (!settledRef.current) { settledRef.current = true; await room.settle(stake, payout, { darts: next.map((d) => d.score), total, mult }); }
      return;
    }
    setMsg(score === 50 ? `BULLSEYE! 50 points. Dart ${next.length + 1} — aim again.` : `${score} points. Dart ${next.length + 1} of 3 — the aim drifts faster now.`);
  };

  const total = darts.reduce((s, d) => s + d.score, 0);

  return (
    <RoomShell game={game} subtitle="Bullseye Darts — three darts, a drifting aim. 100+ points pays ×5." stats={room.stats} history={room.history}>
      <div className="xg-controls">
        <StakeChips stake={stake} setStake={setStake} currency="coins" disabled={phase === "playing"} />
        <div className="v18-stage">
          <div className="v18-hud"><span>DARTS <b>{darts.length}/3</b></span><span>SCORE <b>{total}</b></span><span>TARGET <b>100</b></span></div>
          <div className="v18-dartboard" onPointerDown={() => void throwDart()} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); void throwDart(); } }} aria-label="Dartboard — tap to throw">
            <DartboardArt />
            {darts.map((d, i) => <span key={i} className="v18-dartmark" style={{ left: `calc(50% + ${d.x}px)`, top: `calc(50% + ${d.y}px)` }}><DartMark /></span>)}
            {phase === "playing" && <span className="v18-cross" style={{ left: `calc(50% + ${aim.x}px)`, top: `calc(50% + ${aim.y}px)` }} aria-hidden="true" />}
          </div>
          <p className="v18-aim">Bullseye 50 · inner 25 · mid 15 · outer 10 · edge 5 — tap the board (or Space) to throw</p>
        </div>
        {phase === "idle" && <button className="btn btn-gold xg-action" type="button" onClick={start}>Throw darts · {fmtCoins(stake)}</button>}
        {phase === "done" && <button className="btn btn-gold xg-action" type="button" onClick={start}>Throw again · {fmtCoins(stake)}</button>}
        <p className="bottle-msg xg-msg">{msg}</p>
      </div>
    </RoomShell>
  );
}

// ---------- Connect Four ----------
// You are gold, the house is red. Win ×2, draw ×1. The AI takes a
// win when it can, blocks your win, otherwise prefers the centre.
type Cell = 0 | 1 | 2;
function checkWin(b: Cell[][]): Cell {
  const R = 6, C = 7;
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const v = b[r][c];
    if (!v) continue;
    for (const [dr, dc] of dirs) {
      let n = 0;
      for (let k = 0; k < 4; k++) {
        const rr = r + dr * k, cc = c + dc * k;
        if (rr < 0 || rr >= R || cc < 0 || cc >= C || b[rr][cc] !== v) break;
        n++;
      }
      if (n === 4) return v;
    }
  }
  return 0;
}
function dropIn(b: Cell[][], col: number, v: Cell): { board: Cell[][]; row: number } | null {
  const nb = b.map((row) => [...row]);
  for (let r = 5; r >= 0; r--) {
    if (nb[r][col] === 0) { nb[r][col] = v; return { board: nb, row: r }; }
  }
  return null;
}

export function ConnectFourRoom({ game }: { game: GameDef }) {
  const room = useGameRoom(game);
  const [stake, setStake] = useState(5);
  const [board, setBoard] = useState<Cell[][]>(Array.from({ length: 6 }, () => new Array<Cell>(7).fill(0)));
  const [phase, setPhase] = useState<"idle" | "playing" | "done">("idle");
  const [msg, setMsg] = useState("Connect Four against the house — you are gold, the house is red. Win pays ×2, a draw pays your stake back.");
  const settledRef = useRef(false);

  const start = () => {
    if (room.balance < stake) { setMsg("Balance too low for that stake."); return; }
    settledRef.current = false;
    setBoard(Array.from({ length: 6 }, () => new Array<Cell>(7).fill(0)));
    setPhase("playing");
    setMsg("Your move — tap a column to drop a gold disc.");
  };

  const endRound = async (b: Cell[][], w: Cell) => {
    setPhase("done");
    const mult = w === 1 ? 2 : 0;
    const payout = Math.round(stake * mult);
    setMsg(w === 1 ? `Four in a row — you win! ×2, ${fmtCoins(payout)}` : "The house connects four. Better luck next game.");
    if (!settledRef.current) { settledRef.current = true; await room.settle(stake, payout, { winner: w === 1 ? "player" : "house" }); }
  };

  const play = async (col: number) => {
    if (phase !== "playing") return;
    const mine = dropIn(board, col, 1);
    if (!mine) { setMsg("That column is full — pick another."); return; }
    playSfx("pop", room.muted);
    let b = mine.board;
    setBoard(b);
    if (checkWin(b) === 1) { void endRound(b, 1); return; }
    if (b.every((row) => row.every((v) => v !== 0))) {
      setPhase("done");
      setMsg("A draw — your stake comes back.");
      if (!settledRef.current) { settledRef.current = true; await room.settle(stake, stake, { winner: "draw" }); }
      return;
    }
    // AI: win > block > centre preference.
    const order = [3, 2, 4, 1, 5, 0, 6];
    let aiCol = order.find((c) => dropIn(b, c, 2) !== null) ?? -1;
    for (const c of order) {
      const t = dropIn(b, c, 2);
      if (t && checkWin(t.board) === 2) { aiCol = c; break; }
    }
    if (aiCol < 0) {
      for (const c of order) {
        const t = dropIn(b, c, 1);
        if (t && checkWin(t.board) === 1) { aiCol = c; break; }
      }
    }
    if (aiCol < 0) aiCol = order.find((c) => dropIn(b, c, 2) !== null) ?? -1;
    if (aiCol >= 0) {
      const ai = dropIn(b, aiCol, 2)!;
      b = ai.board;
      setBoard(b);
      if (checkWin(b) === 2) { void endRound(b, 2); return; }
      if (b.every((row) => row.every((v) => v !== 0))) {
        setPhase("done");
        setMsg("A draw — your stake comes back.");
        if (!settledRef.current) { settledRef.current = true; await room.settle(stake, stake, { winner: "draw" }); }
        return;
      }
    }
    setMsg("Your move — tap a column.");
  };

  return (
    <RoomShell game={game} subtitle="Connect Four vs the house — four in a row pays ×2, a draw pays your stake back." stats={room.stats} history={room.history}>
      <div className="xg-controls">
        <StakeChips stake={stake} setStake={setStake} currency="coins" disabled={phase === "playing"} />
        <div className="v18-c4" role="group" aria-label="Connect Four board">
          {Array.from({ length: 7 }, (_, c) => (
            <button key={c} type="button" className="v18-c4col" onClick={() => void play(c)} disabled={phase !== "playing"} aria-label={`Drop in column ${c + 1}`}>
              {board.map((row, r) => <span key={r} className={`v18-c4cell${row[c] === 1 ? " gold" : row[c] === 2 ? " red" : ""}`} />)}
            </button>
          ))}
        </div>
        <p className="v18-sub">You are <span style={{ color: "#F2C230" }}>● gold</span> · the house is <span style={{ color: "#E5322D" }}>● red</span></p>
        {phase === "idle" && <button className="btn btn-gold xg-action" type="button" onClick={start}>Play · {fmtCoins(stake)}</button>}
        {phase === "done" && <button className="btn btn-gold xg-action" type="button" onClick={start}>Play again · {fmtCoins(stake)}</button>}
        <p className="bottle-msg xg-msg">{msg}</p>
      </div>
    </RoomShell>
  );
}
