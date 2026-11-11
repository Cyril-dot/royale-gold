// Penalty Shoot Out — v48 rebuilt rigs (SVG striker + keeper, ported
// verbatim in penalty-svgs.tsx) with the v45 band mapping: announcement +
// keeper dive + ball flight all come from ONE release-time snapshot
// measured on the goal as rendered. Ladder [1.56, 2.6, 4.16, 7.28, 12.5];
// cash out after any goal; 5 shots max; ZERO labels in the goal.
// Save chance: 40% per shot (v48), keeper dives to the shot when saving,
// away from it when beaten.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fmtCash } from "../../lib/api";
import { GameDef } from "../../lib/games";
import { RoomShell, StakeChips, useGameRoom } from "./shared";
import { KeeperSvg, StrikerSvg } from "./penalty-svgs";

const LADDER = [1.56, 2.6, 4.16, 7.28, 12.5];

interface Aim { sx: number; sy: number; x: number; y: number; cx: number; cy: number; fx: number; fy: number; gl: number; gt: number; gw: number; gh: number }

function describeAim(fx: number, fy: number) {
  const col = fx < 0.38 ? "left" : fx > 0.62 ? "right" : "centre";
  const row = fy <= 0.34 ? "high" : fy <= 0.67 ? "mid" : "low";
  return row + " " + col;
}

export default function PenaltyRoom({ game }: { game: GameDef }) {
  const room = useGameRoom(game);
  const [stake, setStake] = useState(25);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [goals, setGoals] = useState(0);
  const [savedAt, setSavedAt] = useState(-1);
  const [msg, setMsg] = useState("Start the shootout, then press on the ball, drag toward the goal to draw your shot, and release — or shoot Random. Every goal climbs the ladder; cash out after any goal, but one save ends it and the stake is gone.");
  const [keeperPose, setKeeperPose] = useState<"ready" | "diving" | "beaten" | "hero">("ready");
  const [keeperStyle, setKeeperStyle] = useState<React.CSSProperties>({});
  const [strikerPose, setStrikerPose] = useState("");
  const [ballStyle, setBallStyle] = useState<React.CSSProperties>({});
  const [aimPath, setAimPath] = useState("");
  const [aimDot, setAimDot] = useState<{ x: number; y: number } | null>(null);
  const [showAim, setShowAim] = useState(false);
  const [bulge, setBulge] = useState<{ x: number; y: number; key: number } | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const goalRef = useRef<HTMLDivElement>(null);
  const ballRef = useRef<HTMLDivElement>(null);
  const dragPts = useRef<{ x: number; y: number }[]>([]);
  const dragging = useRef(false);
  const curAim = useRef<Aim | null>(null);
  const stateRef = useRef({ playing, busy, goals });
  stateRef.current = { playing, busy, goals };

  const resetActors = useCallback(() => {
    setKeeperPose("ready");
    setKeeperStyle({});
    setStrikerPose("");
    setBallStyle({});
    setShowAim(false);
    setBulge(null);
  }, []);

  const start = () => {
    if (playing) return;
    if (room.balance < stake) { setMsg(room.simMode ? "SIM balance too low for that stake." : "Balance too low for that stake — top up at the cashier."); return; }
    setPlaying(true);
    setGoals(0);
    setSavedAt(-1);
    resetActors();
    setMsg(`Shootout live — ${fmtCash(stake)} riding on it. Press on the ball, drag toward the goal to draw your shot, and release to shoot. First goal pays ×${LADDER[0]}.`);
  };

  const finish = useCallback(async (won: boolean, payout: number, label: string) => {
    await room.settle(stake, payout, { shots: goals + (won ? 1 : 0), goals, label });
    setPlaying(false);
    setBusy(false);
  }, [room, stake, goals]);

  const cashOut = useCallback(async (auto = false) => {
    if (!playing || goals < 1) return;
    const m = LADDER[goals - 1];
    const pay = Math.round(stake * m * 100) / 100;
    setMsg(`${auto ? "Five from five! " : "Cashed out — "}${goals}${goals === 1 ? " goal" : " goals"} at ×${m}: ${fmtCash(pay)}.`);
    await finish(true, pay, `×${m}`);
  }, [playing, goals, stake, finish]);

  const resolveShot = useCallback((saved: boolean, aim: Aim) => {
    const { fx, fy } = aim;
    if (!saved) {
      const g = goals + 1;
      setGoals(g);
      setBulge({ x: fx * 100, y: fy * 100, key: Date.now() });
      setKeeperPose("beaten");
      setStrikerPose("celebrate");
      if (g >= 5) {
        setTimeout(() => { resetActors(); void cashOut(true); }, 460);
        return;
      }
      setMsg(`GOAL — ${describeAim(fx, fy)}! That's ${g} on the ladder: ×${LADDER[g - 1]} = ${fmtCash(Math.round(stake * LADDER[g - 1] * 100) / 100)}. Cash out now or shoot for ×${LADDER[g]}.`);
      setTimeout(() => { resetActors(); setBusy(false); }, 520);
    } else {
      setKeeperPose("hero");
      setSavedAt(goals);
      setMsg(`SAVED — the keeper read the ${describeAim(fx, fy)} all the way and parried it. The ${fmtCash(stake)} stake is gone.`);
      setTimeout(() => {
        resetActors();
        void finish(false, 0, "SAVED");
      }, 900);
    }
  }, [goals, stake, cashOut, finish, resetActors]);

  const shoot = useCallback((aim: Aim) => {
    if (!stateRef.current.playing || stateRef.current.busy) return;
    setBusy(true);
    setShowAim(false);
    const { fx, fy } = aim;
    const saved = Math.random() < 0.4;
    let kfx: number, kfy: number;
    if (saved) { kfx = fx; kfy = fy; }
    else {
      kfx = fx < 0.5 ? Math.min(0.93, fx + 0.42 + Math.random() * 0.15) : Math.max(0.07, fx - 0.42 - Math.random() * 0.15);
      kfy = fy < 0.35 ? 0.68 : fy > 0.65 ? 0.3 : Math.random() < 0.5 ? 0.25 : 0.75;
    }
    setStrikerPose("runup");
    setTimeout(() => {
      setStrikerPose("kick");
      setTimeout(() => setStrikerPose("follow"), 240);
      // Keeper dive from the SAME snapshot
      const gw = aim.gw;
      const kx = (kfx - 0.5) * gw * 0.66;
      const kRot = Math.max(-82, Math.min(82, (kfx - 0.5) * 155));
      const ky = (kfy - 0.5) * 38;
      setKeeperStyle({ transform: `translateX(calc(-50% + ${kx}px)) translateY(${ky}px) rotate(${kRot}deg)` });
      setKeeperPose("diving");
      // Ball flight along the dragged quadratic curve
      const dx = aim.x - aim.sx, dy = aim.y - aim.sy;
      setBallStyle({ transform: `translate(${dx}px, ${dy}px) scale(.42) rotate(560deg)`, opacity: 1, transition: "transform .48s cubic-bezier(.2,.7,.3,1)" });
      setTimeout(() => resolveShot(saved, aim), 480);
    }, 290);
  }, [resolveShot]);

  const shootRandom = () => {
    if (!playing || busy || !stageRef.current || !goalRef.current) return;
    const sr = stageRef.current.getBoundingClientRect();
    const gr = goalRef.current.getBoundingClientRect();
    const fx = 0.08 + Math.random() * 0.84, fy = 0.12 + Math.random() * 0.76;
    const ball = ballRef.current?.getBoundingClientRect();
    const sx = ball ? ball.left + ball.width / 2 - sr.left : sr.width / 2;
    const sy = ball ? ball.top + ball.height / 2 - sr.top : sr.height - 60;
    const x = gr.left - sr.left + fx * gr.width;
    const y = gr.top - sr.top + fy * gr.height;
    shoot({ sx, sy, x, y, cx: (sx + x) / 2, cy: (sy + y) / 2, fx, fy, gl: gr.left - sr.left, gt: gr.top - sr.top, gw: gr.width, gh: gr.height });
  };

  // Drag aiming — v45: ONE measurement of stage + goal rects at release.
  const relPos = (e: React.PointerEvent) => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onDown = (e: React.PointerEvent) => {
    if (!playing || busy) return;
    dragging.current = true;
    dragPts.current = [relPos(e)];
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dragging.current || !stageRef.current || !ballRef.current) return;
    const p = relPos(e);
    dragPts.current.push(p);
    const sr = stageRef.current.getBoundingClientRect();
    const b = ballRef.current.getBoundingClientRect();
    const st = { x: b.left + b.width / 2 - sr.left, y: b.top + b.height / 2 - sr.top };
    // Dotted trajectory (quadratic through drag midpoint bend)
    let bend = 0;
    if (dragPts.current.length > 3) {
      const mid = dragPts.current[Math.floor(dragPts.current.length / 2)];
      const dx = p.x - st.x, dy = p.y - st.y, len = Math.max(1, Math.hypot(dx, dy));
      const px = -dy / len, py = dx / len;
      bend = Math.max(-85, Math.min(85, ((mid.x - (st.x + p.x) / 2) * px + (mid.y - (st.y + p.y) / 2) * py) * 1.5));
    }
    const len = Math.max(1, Math.hypot(p.x - st.x, p.y - st.y));
    const cx = (st.x + p.x) / 2 + (-(p.y - st.y)) * bend / len;
    const cy = (st.y + p.y) / 2 + (p.x - st.x) * bend / len;
    curAim.current = { sx: st.x, sy: st.y, x: p.x, y: p.y, cx, cy, fx: 0.5, fy: 0.5, gl: 0, gt: 0, gw: 0, gh: 0 };
    setAimPath(`M ${st.x} ${st.y} Q ${cx} ${cy} ${p.x} ${p.y}`);
    setAimDot({ x: p.x, y: p.y });
    setShowAim(true);
  };
  const onUp = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    if (!playing || busy || !stageRef.current || !goalRef.current || !curAim.current) { setShowAim(false); return; }
    // THE one measurement: stage rect + goal mouth's live rendered rect.
    const sr = stageRef.current.getBoundingClientRect();
    const gr = goalRef.current.getBoundingClientRect();
    const gl = gr.left - sr.left, gt = gr.top - sr.top;
    const px = e.clientX - sr.left, py = e.clientY - sr.top;
    const cx = Math.max(gl + 10, Math.min(gl + gr.width - 10, px));
    const cy = Math.max(gt + 10, Math.min(gt + gr.height - 10, py));
    const aim: Aim = { ...curAim.current, x: cx, y: cy, fx: (cx - gl) / gr.width, fy: (cy - gt) / gr.height, gl, gt, gw: gr.width, gh: gr.height };
    shoot(aim);
  };

  useEffect(() => () => { dragPts.current = []; }, []);

  return (
    <RoomShell game={game} subtitle="5 shots · ladder to ×12.5 · cash out after any goal" stats={room.stats} history={room.history}>
      <div className="pn-stage" id="pnStage" ref={stageRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} style={{ touchAction: "none" }}>
        <div className="pn-lights" aria-hidden="true">
          <div className="pn-pylon l"><i /><i /><i /><i /><i /><i /></div><div className="pn-pylon r"><i /><i /><i /><i /><i /><i /></div>
          <div className="pn-cone l" /><div className="pn-cone r" />
        </div>
        <div className="pn-crowd" aria-hidden="true" />
        <div className="pn-boards" aria-hidden="true"><span>ROYALE GOLD</span><span className="mid">PENALTY SHOOTOUT</span><span>TOP PRIZE ×12.5</span></div>
        <div className="pn-goal" ref={goalRef} role="img" aria-label="The goal and its keeper — drag from the ball below to aim your shot">
          <div className="pn-net-back" aria-hidden="true" />
          <div className="pn-net-side l" aria-hidden="true" />
          <div className="pn-net-side r" aria-hidden="true" />
          {bulge && <div className="pn-bulge hit" aria-hidden="true" style={{ left: `${bulge.x}%`, top: `${bulge.y}%` }} />}
          <div className={`pn-keeper ${keeperPose}`} aria-hidden="true" style={keeperStyle}><KeeperSvg /></div>
        </div>
        <div className="pn-grass"><span className="pn-spot" aria-hidden="true" /></div>
        <div className={`pn-striker ${strikerPose}`} aria-hidden="true"><StrikerSvg /></div>
        <div className="pn-ball" ref={ballRef} aria-hidden="true" style={ballStyle} />
        <div className="pn-hint" hidden={!playing || busy}>Drag from the ball toward the goal — release to shoot</div>
        {showAim && (
          <svg className="pn-aim" aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
            <path d={aimPath} fill="none" stroke="#FFD964" strokeWidth={5} strokeLinecap="round" strokeDasharray="0.5 11" />
            {aimDot && <><circle cx={aimDot.x} cy={aimDot.y} r={12} fill="none" stroke="#FFD964" strokeWidth={3.5} /><circle cx={aimDot.x} cy={aimDot.y} r={4} fill="#FFD964" /></>}
          </svg>
        )}
      </div>
      <div className="pn-ladder" aria-label="Payout ladder">
        <div className="pn-track"><i style={{ width: `${(goals / 5) * 100}%` }} /></div>
        {LADDER.map((m, i) => (
          <div key={m} className={`pn-rung ${i < goals ? "done" : playing && i === goals ? "next" : ""}`}>
            {i === goals - 1 && <i className="pn-lball" />}
            <b>×{m}</b><span>GOAL {i + 1}</span><span className="pn-val">{fmtCash(Math.round(stake * m * 100) / 100)}</span>
          </div>
        ))}
      </div>
      <div className="pn-shots" aria-label="Shots taken">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className={`pn-shotdot${i < goals ? " goal" : i === savedAt ? " miss" : ""}`} />
        ))}
      </div>
      <div className="xg-controls">
        <StakeChips stake={stake} setStake={setStake} currency="cash" disabled={playing} />
        {!playing && <button className="btn btn-gold xg-action" type="button" onClick={start}>Start shootout</button>}
        {playing && <button className="btn btn-ghost xg-action" type="button" onClick={shootRandom} disabled={busy}>Random shot</button>}
        {playing && goals >= 1 && (
          <button className="btn btn-gold xg-action cr-cash" type="button" onClick={() => void cashOut()} disabled={busy}>
            Cash out {fmtCash(Math.round(stake * LADDER[goals - 1] * 100) / 100)}
          </button>
        )}
        <p className="bottle-msg xg-msg">{msg}</p>
      </div>
    </RoomShell>
  );
}
