// Plinko — decide-first Galton board, 8 rows / 9 bins.
// Tables (v48, exact):
//   low:  [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6]
//   med:  [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13]
//   high: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29]

"use client";

import { useEffect, useRef, useState } from "react";
import { fmtCash } from "../../lib/api";
import { GameDef } from "../../lib/games";
import { RoomShell, StakeChips, useGameRoom } from "./shared";

const TABLES: Record<string, number[]> = {
  low: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
  med: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
  high: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
};
const ROWS = 8;

export default function PlinkoRoom({ game }: { game: GameDef }) {
  const room = useGameRoom(game);
  const [stake, setStake] = useState(25);
  const [risk, setRisk] = useState<"low" | "med" | "high">("low");
  const [msg, setMsg] = useState("Pick a risk and stake, then drop the ball. The bin it lands in sets your multiplier.");
  const [lastBin, setLastBin] = useState<number | null>(null);
  const [lastMult, setLastMult] = useState<number | null>(null);
  const [ball, setBall] = useState<{ x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dropping, setDropping] = useState(false);

  const table = TABLES[risk];

  const draw = (bx: number | null, by: number | null, bin: number | null) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    // pegs
    ctx.fillStyle = "#F2C230";
    const topY = 70;
    for (let r = 0; r < ROWS; r++) {
      const n = r + 3;
      for (let i = 0; i < n; i++) {
        const x = W / 2 + (i - (n - 1) / 2) * 56;
        const y = topY + r * 44;
        ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill();
      }
    }
    // bins
    const binY = topY + ROWS * 44 + 14;
    const bw = W / 9;
    table.forEach((m, i) => {
      ctx.fillStyle = i === bin ? "rgba(242,194,48,.85)" : m >= 4 ? "rgba(62,217,126,.25)" : "rgba(255,246,216,.08)";
      ctx.fillRect(i * bw + 2, binY, bw - 4, 34);
      ctx.fillStyle = "#FFF6D8";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("×" + m, i * bw + bw / 2, binY + 22);
    });
    if (bx !== null && by !== null) {
      ctx.fillStyle = "#FFD964";
      ctx.beginPath(); ctx.arc(bx, by, 9, 0, 7); ctx.fill();
      ctx.fillStyle = "#231600";
      ctx.font = "bold 10px sans-serif";
      ctx.fillText("●", bx, by + 3);
    }
  };

  useEffect(() => { draw(ball?.x ?? null, ball?.y ?? null, lastBin); }, [ball, lastBin, risk]); // eslint-disable-line react-hooks/exhaustive-deps

  const drop = async () => {
    if (dropping || room.balance < stake) { if (room.balance < stake) setMsg("Balance too low for that stake."); return; }
    setDropping(true);
    setLastBin(null);
    setLastMult(null);
    // Decide-first: the bin is decided up front, the ball animates to it.
    let rights = 0;
    const path: number[] = [];
    for (let r = 0; r < ROWS; r++) { const goRight = Math.random() < 0.5; if (goRight) rights++; path.push(goRight ? 1 : 0); }
    const bin = rights; // 0..8
    const mult = table[bin];
    const cv = canvasRef.current;
    const W = cv ? cv.width : 560;
    const topY = 70;
    let step = 0;
    let x = W / 2;
    const iv = setInterval(() => {
      const r = step;
      if (r < ROWS) {
        x += path[r] ? 28 : -28;
        setBall({ x, y: topY + r * 44 });
        step++;
      } else {
        clearInterval(iv);
        const binX = (bin + 0.5) * (W / 9);
        setBall({ x: binX, y: topY + ROWS * 44 + 30 });
        setLastBin(bin);
        setLastMult(mult);
        const payout = Math.round(stake * mult * 100) / 100;
        setMsg(mult >= 1 ? `Landed ×${mult} — ${fmtCash(payout)}!` : `Landed ×${mult} — ${fmtCash(payout)} back.`);
        void room.settle(stake, payout, { bin, mult, risk });
        setDropping(false);
      }
    }, 110);
  };

  return (
    <RoomShell game={game} subtitle="8 rows · 9 bins · pick your risk, drop the ball" stats={room.stats} history={room.history}>
      <div className="pk-stage">
        <canvas ref={canvasRef} width={560} height={560} className="pk-canvas" aria-label="Plinko board" />
        <div className="pk-last">{lastMult !== null ? <>Last drop: bin {lastBin} · ×{lastMult}</> : "No drop yet"}</div>
      </div>
      <div className="xg-controls">
        <div className="xg-pickrow" role="group" aria-label="Risk">
          {(["low", "med", "high"] as const).map((r) => (
            <button key={r} type="button" className="xg-pick" aria-pressed={risk === r} onClick={() => setRisk(r)} disabled={dropping}>
              <span className="xg-pick-txt">{r === "low" ? "Low" : r === "med" ? "Medium" : "High"}<small>edge ×{table[0]}</small></span>
            </button>
          ))}
        </div>
        <StakeChips stake={stake} setStake={setStake} currency="cash" disabled={dropping} />
        <button className="btn btn-gold xg-action" type="button" onClick={() => void drop()} disabled={dropping}>{dropping ? "Dropping…" : "Drop the ball"}</button>
        <p className="bottle-msg xg-msg">{msg}</p>
        <div className="pk-table" aria-label="Payout table">
          {table.map((m, i) => (<span key={i} className={i === lastBin ? "on" : ""}>×{m}</span>))}
        </div>
      </div>
    </RoomShell>
  );
}
