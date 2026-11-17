// Plinko — decide-first Galton board, 8 rows / 9 bins.
// Tables (v48, exact):
//   low:  [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6]
//   med:  [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13]
//   high: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29]
// Restored vs the artifact: the ball flies a smooth waypoint arc
// (the port jumped row to row on a 110ms timer); pegs pulse + tick
// as the ball crosses each row; the ball leaves a fading trail; the
// landing bin flashes gold; bins are gradient-coloured by payout
// (log scale, red → yellow); drops queue up instead of being refused
// while a ball is live; the "DROP ZONE" label and the risk-change
// messages are back.

"use client";

import { useEffect, useRef, useState } from "react";
import { fmtMoney } from "../../lib/api";
import { GameDef } from "../../lib/games";
import { RoomShell, StakeChips, useGameRoom } from "./shared";
import { playSfx } from "../../lib/store";

const TABLES: Record<string, number[]> = {
  low: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
  med: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
  high: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
};
const ROWS = 8, SX = 56, ROWH = 54, TOPY = 104, CX = 280, BINY = 104 + 8 * 54 + 16;
const W = 560, H = 600;

interface Drop { stake: number; risk: string; path: number[]; bin: number }

function binColor(mult: number, table: number[]): string {
  const lo = Math.min(...table), hi = Math.max(...table);
  let t = (Math.log(mult) - Math.log(lo)) / (Math.log(hi) - Math.log(lo) + 0.0001);
  t = Math.max(0, Math.min(1, t));
  const c1 = [229, 50, 45], c2 = [255, 210, 63];
  const r = Math.round(c1[0] + (c2[0] - c1[0]) * t), g = Math.round(c1[1] + (c2[1] - c1[1]) * t), b = Math.round(c1[2] + (c2[2] - c1[2]) * t);
  return `rgb(${r},${g},${b})`;
}

export default function PlinkoRoom({ game }: { game: GameDef }) {
  const room = useGameRoom(game);
  const [stake, setStake] = useState(25);
  const [risk, setRisk] = useState<"low" | "med" | "high">("low");
  const [msg, setMsg] = useState("Pick your risk, set your stake, drop the ball. Every peg is a coin flip — the middle bins land often and pay small, the edge bins are rare and pay big.");
  const [lastBin, setLastBin] = useState<number | null>(null);
  const [lastMult, setLastMult] = useState<number | null>(null);
  const [lastPay, setLastPay] = useState<number | null>(null);
  const [queued, setQueued] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const queueRef = useRef<Drop[]>([]);
  const activeRef = useRef<Drop | null>(null);
  const rafRef = useRef(0);
  const pegPulseRef = useRef<Record<string, number>>({});
  const flashRef = useRef<{ bin: number; t0: number }>({ bin: -1, t0: 0 });
  const mutedRef = useRef(room.muted);
  mutedRef.current = room.muted;
  const settleRef = useRef(room.settle);
  settleRef.current = room.settle;

  const table = TABLES[risk];

  const pegPos = (r: number, k: number): [number, number] => {
    const count = r + 3;
    return [CX + (k - (count - 1) / 2) * SX, TOPY + r * ROWH];
  };

  const draw = (ballPos: [number, number] | null, trail: [number, number][]) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const x = cv.getContext("2d");
    if (!x) return;
    x.clearRect(0, 0, W, H);
    const g = x.createRadialGradient(280, 60, 40, 280, 300, 560);
    g.addColorStop(0, "#14406E"); g.addColorStop(1, "#060D1C");
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.font = "800 13px Outfit, sans-serif"; x.textAlign = "center"; x.fillStyle = "rgba(255,232,154,.75)";
    x.fillText("DROP ZONE", CX, 26);
    // pegs (pulse ring while the ball crosses the row)
    const now = performance.now();
    for (let r = 0; r < ROWS; r++) {
      const count = r + 3;
      for (let k = 0; k < count; k++) {
        const p = pegPos(r, k), key = `${r},${k}`;
        const pulse = pegPulseRef.current[key] ? Math.max(0, 1 - (now - pegPulseRef.current[key]) / 260) : 0;
        const rad = 5 + pulse * 4;
        const pg = x.createRadialGradient(p[0] - 2, p[1] - 2, 1, p[0], p[1], rad + 2);
        pg.addColorStop(0, "#FFEFA8"); pg.addColorStop(0.6, "#F2C230"); pg.addColorStop(1, "#9A7410");
        x.beginPath(); x.arc(p[0], p[1], rad, 0, 7); x.fillStyle = pg; x.fill();
        if (pulse > 0) {
          x.beginPath(); x.arc(p[0], p[1], rad + 6 * pulse + 3, 0, 7);
          x.strokeStyle = `rgba(255,217,100,${pulse * 0.7})`; x.lineWidth = 2; x.stroke();
        }
      }
    }
    // bins
    for (let b = 0; b < 9; b++) {
      const bx = CX + (b - 4) * SX, bw = SX - 7, bh = 46;
      const flash = b === flashRef.current.bin ? Math.max(0, 1 - (now - flashRef.current.t0) / 600) : 0;
      x.save();
      if (flash > 0) { x.shadowColor = "rgba(255,217,100,.95)"; x.shadowBlur = 26 * flash; }
      x.fillStyle = binColor(table[b], table);
      const rx = bx - bw / 2, ry = BINY, rr = 8;
      x.beginPath();
      x.moveTo(rx + rr, ry); x.lineTo(rx + bw - rr, ry); x.arcTo(rx + bw, ry, rx + bw, ry + rr, rr);
      x.lineTo(rx + bw, ry + bh - rr); x.arcTo(rx + bw, ry + bh, rx + bw - rr, ry + bh, rr);
      x.lineTo(rx + rr, ry + bh); x.arcTo(rx, ry + bh, rx, ry + bh - rr, rr);
      x.lineTo(rx, ry + rr); x.arcTo(rx, ry, rx + rr, ry, rr);
      x.closePath(); x.fill();
      x.restore();
      x.fillStyle = table[b] >= 1 ? "#231600" : "#FFF6D8";
      x.font = "900 14px Outfit, sans-serif";
      x.fillText("×" + table[b], bx, BINY + 29);
    }
    // trail + ball
    if (ballPos) {
      trail.forEach((tp, i) => {
        x.beginPath(); x.arc(tp[0], tp[1], (11 * (i + 1)) / trail.length, 0, 7);
        x.fillStyle = `rgba(255,217,100,${0.1 + (0.12 * i) / Math.max(1, trail.length)})`; x.fill();
      });
      const bg = x.createRadialGradient(ballPos[0] - 4, ballPos[1] - 5, 2, ballPos[0], ballPos[1], 13);
      bg.addColorStop(0, "#FFF6D8"); bg.addColorStop(0.45, "#FFD964"); bg.addColorStop(1, "#B57F0E");
      x.beginPath(); x.arc(ballPos[0], ballPos[1], 11, 0, 7); x.fillStyle = bg; x.fill();
      x.lineWidth = 1.6; x.strokeStyle = "rgba(122,82,0,.8)"; x.stroke();
    }
  };
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => { drawRef.current(null, []); }, [risk, lastBin]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const waypoints = (path: number[]) => {
    const pts: [number, number][] = [[CX, 44]];
    let sum = 0;
    for (let r = 0; r < ROWS; r++) {
      sum += path[r];
      pts.push([CX + sum * (SX / 2), TOPY + r * ROWH + ROWH * 0.55]);
    }
    const bin = path.reduce((a, d) => a + (d > 0 ? 1 : 0), 0);
    pts.push([CX + (bin - 4) * SX, BINY + 22]);
    return { pts, bin };
  };

  const settleDrop = (drop: Drop) => {
    const t = TABLES[drop.risk];
    const mult = t[drop.bin];
    const pay = Math.round(drop.stake * mult * 100) / 100;
    flashRef.current = { bin: drop.bin, t0: performance.now() };
    setLastBin(drop.bin);
    setLastMult(mult);
    setLastPay(pay);
    setMsg(
      mult > 1 ? `Bin ${drop.bin + 1} — ×${mult}! ${fmtMoney(pay, room.user?.currency ?? "GHS")} paid to your balance.`
      : mult === 1 ? `Dead centre — ×1, your ${fmtMoney(drop.stake, room.user?.currency ?? "GHS")} stake comes straight back.`
      : `Bin ${drop.bin + 1} — ×${mult}. ${pay > 0 ? `${fmtMoney(pay, room.user?.currency ?? "GHS")} back of your ${fmtMoney(drop.stake, room.user?.currency ?? "GHS")}.` : "Nothing back this drop."}`
    );
    drawRef.current(null, []);
    void settleRef.current(drop.stake, pay, { bin: drop.bin, mult, risk: drop.risk });
  };

  const runDrop = (drop: Drop) => {
    activeRef.current = drop;
    const { pts, bin } = waypoints(drop.path);
    drop.bin = bin;
    const trail: [number, number][] = [];
    const startT = performance.now();
    const segDur = 120;
    let lastSeg = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const frame = (now: number) => {
      // The rAF timestamp is the frame-START time, so the first frame
      // after a click can arrive with now < startT (up to ~a frame
      // behind performance.now()). Without the clamp, segFloat goes
      // negative, seg becomes -1, pts[-1] is undefined and a[0] throws
      // — killing the loop, freezing the ball mid-board and leaving
      // activeRef set so every later drop just queues forever (the
      // "stuck ball": won once, dropped again, ball stuck). Clamp
      // elapsed at 0 and seg into range so a behind-timestamp can
      // never index out of bounds.
      const elapsed = Math.max(0, now - startT);
      const segFloat = elapsed / segDur;
      const seg = Math.max(0, Math.min(pts.length - 2, Math.floor(segFloat)));
      const u = Math.min(1, segFloat - seg);
      // Termination MUST use segFloat: seg is capped at pts.length - 2,
      // so `seg >= pts.length - 1` can never be true and the ball would
      // sit on the last bin forever without ever settling (found by the
      // round-17 phase-2 play-check: "No drop yet" after 12s, no errors).
      if (segFloat >= pts.length - 1 || (reduced && elapsed > 30)) {
        drawRef.current(pts[pts.length - 1], trail);
        activeRef.current = null;
        setTimeout(() => { settleDrop(drop); pump(); }, reduced ? 10 : 190);
        return;
      }
      const a = pts[seg], b = pts[seg + 1];
      const e = u * u * (3 - 2 * u);
      const px = a[0] + (b[0] - a[0]) * e;
      const py = a[1] + (b[1] - a[1]) * (u * u * 0.6 + u * 0.4) - Math.sin(u * Math.PI) * 7;
      if (seg !== lastSeg && seg > 0) {
        // crossed a peg row — pulse the peg nearest the crossing + tick
        const row = seg - 1;
        const cnt = row + 3;
        let sumPrev = 0;
        for (let i = 0; i < row; i++) sumPrev += drop.path[i];
        const centreIdx = (cnt - 1) / 2 + sumPrev;
        const kk = Math.max(0, Math.min(cnt - 1, Math.round(centreIdx + (drop.path[row] > 0 ? 0.5 : -0.5))));
        pegPulseRef.current[`${row},${kk}`] = now;
        playSfx("tick", mutedRef.current);
        lastSeg = seg;
      }
      trail.push([px, py]);
      if (trail.length > 7) trail.shift();
      drawRef.current([px, py], trail.slice(0, -1));
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
  };

  const pump = () => {
    if (activeRef.current || queueRef.current.length === 0) {
      setQueued(queueRef.current.length);
      return;
    }
    const next = queueRef.current.shift()!;
    setQueued(queueRef.current.length);
    runDrop(next);
  };

  const drop = () => {
    if (room.balance < stake) { setMsg("Balance too low for that stake."); return; }
    playSfx("blip", mutedRef.current);
    const path: number[] = [];
    for (let i = 0; i < ROWS; i++) path.push(Math.random() < 0.5 ? -1 : 1);
    queueRef.current.push({ stake, risk, path, bin: -1 });
    setMsg(activeRef.current ? "Queued — that ball drops as soon as this one lands." : "Ball away — every peg is a coin flip.");
    pump();
  };

  const setRiskMsg = (r: "low" | "med" | "high") => {
    setRisk(r);
    setMsg(r === "low" ? "Low risk — edges pay ×5.6, the middle pays ×0.5." : r === "med" ? "Medium risk — edges pay ×13, the middle pays ×0.4." : "High risk — edges pay ×29, the middle pays ×0.2. Rare and big.");
  };

  return (
    <RoomShell game={game} subtitle="8 rows · 9 bins · pick your risk, drop the ball" stats={room.stats} history={room.history}>
      <div className="pk-stage">
        <canvas ref={canvasRef} width={W} height={H} className="pk-canvas" aria-label="Plinko Drop board" />
        <div className={`pk-last${lastMult !== null ? (lastMult > 1 ? " win" : lastMult < 1 ? " lose" : "") : ""}`}>{lastMult !== null && lastPay !== null ? <>×{lastMult} · {fmtMoney(lastPay, room.user?.currency ?? "GHS")}</> : "No drop yet"}</div>
      </div>
      <div className="xg-controls">
        <div className="xg-pickrow" role="group" aria-label="Risk">
          {(["low", "med", "high"] as const).map((r) => (
            <button key={r} type="button" className="xg-pick" aria-pressed={risk === r} onClick={() => setRiskMsg(r)}>
              <span className="xg-pick-txt">{r === "low" ? "Low" : r === "med" ? "Medium" : "High"}</span>
            </button>
          ))}
        </div>
        <StakeChips stake={stake} setStake={setStake} currency="cash" />
        <button className="btn btn-gold xg-action" type="button" onClick={() => void drop()}>{queued > 0 ? `Drop the ball (${queued} queued)` : "Drop the ball"}</button>
        <p className="bottle-msg xg-msg">{msg}</p>
        <div className="pk-table" aria-label="Payout table">
          {table.map((m, i) => (<span key={i} className={i === lastBin ? "on" : ""}>×{m}</span>))}
        </div>
      </div>
    </RoomShell>
  );
}
