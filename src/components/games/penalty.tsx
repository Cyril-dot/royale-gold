// Penalty Shoot Out — free-aim rebuild (Chuks, 15 Nov): "users should be
// able to direct where the ball should go" + bigger goal + better
// animation/UI. The FanZone skin stays (score board, kick dots, GOAL!
// banner, lime accents, crowd/lights/mow stripes) but the 5 fixed tap
// zones are GONE — the user drags anywhere inside the goal to place a
// lime crosshair reticle; Kick! shoots the ball to exactly that spot,
// with a dashed aim line from the ball to the reticle while aiming.
// Keeper: centre-biased random dive; a shot is SAVED if the ball lands
// within the keeper's reach (0.30 of goal width — Monte Carlo: ~40%
// saves on mixed aims, so the ~60% goal rate and the ladder are
// unchanged). The keeper never reads the aim — the dive point is drawn
// before the save is decided. Economy untouched: ladder [1.96→31.36],
// bet Min 0.10 / Max 4,000.00, settle flow, 5 shots max. The
// stale-closure fix stays: resolveShot reads stateRef.current.goals
// (reset synchronously in onKick). ALSO FIXED here: the 5/5 auto
// cash-out used to pay the previous rung — its timeout held the
// pre-goal cashOut closure (LADDER[goals-1] with the old goals), so
// five from five paid ×15.68 instead of ×31.36. It now pays LADDER[4]
// directly, with the goals count passed to finish.

"use client";

import { useCallback, useRef, useState } from "react";
import { fmtMoney } from "../../lib/api";
import { GameDef } from "../../lib/games";
import { playSfx } from "../../lib/store";
import { RoomShell, useGameRoom } from "./shared";
import { KeeperSvg, StrikerSvg } from "./penalty-svgs";

const LADDER = [1.96, 3.92, 7.84, 15.68, 31.36];
const BET_MIN = 0.1;
const BET_MAX = 4000;
// Keeper reach, as a fraction of goal width. Monte Carlo (mixed aims:
// corners, top, low, centre, uniform; keeper centre-biased triangular):
// 0.30 -> ~0.59 goal rate on both the broad-mixed and the rig's exact
// 24-aim distributions. Calibrated live across four runs (144 shots):
// 0.46 at 0.30 (24), 0.54 at 0.28 (24), 0.73 at 0.25 (48), 0.71 at
// 0.27 (48) — pooled 93/144 = 0.65 against a pooled sim expectation
// of 94.4, i.e. the sim curve is unbiased and the per-run swing
// (±0.10) is binomial noise, not a mistune. So the reach stays at
// the Monte Carlo value 0.30: the ladder and the ~60% goal rate
// target are unchanged.
const KEEPER_REACH = 0.30;
const GOAL_ASPECT = 16 / 9.2;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const aimLabel = (fx: number, fy: number) => {
  const col = fx < 0.34 ? "left" : fx > 0.66 ? "right" : "centre";
  const row = fy < 0.34 ? "Top" : fy > 0.66 ? "Bottom" : "Middle";
  if (col === "centre" && row === "Middle") return "Centre";
  return `${row} ${col}`;
};

interface Aim { sx: number; sy: number; x: number; y: number; cx: number; cy: number; fx: number; fy: number; gl: number; gt: number; gw: number; gh: number; label: string }
interface Guide { x1: number; y1: number; x2: number; y2: number }

export default function PenaltyRoom({ game }: { game: GameDef }) {
  const room = useGameRoom(game);
  const [stake, setStake] = useState(1);
  const [betText, setBetText] = useState("1");
  // Free aim: fractions of the goal mouth. Default is top centre — a
  // sensible first shot for a player who just taps Kick!.
  const [aim, setAim] = useState({ fx: 0.5, fy: 0.3 });
  const [aimed, setAimed] = useState(false);
  const [guide, setGuide] = useState<Guide | null>(null);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [goals, setGoals] = useState(0);
  const [savedAt, setSavedAt] = useState(-1);
  const [msg, setMsg] = useState("Drag anywhere on the goal to aim — the crosshair is where the ball will go. Tap Kick! to shoot. First goal pays ×1.96; cash out after any goal, but one save ends it and the stake is gone.");
  const [keeperPose, setKeeperPose] = useState<"ready" | "diving" | "beaten" | "hero">("ready");
  const [keeperStyle, setKeeperStyle] = useState<React.CSSProperties>({});
  const [strikerPose, setStrikerPose] = useState("");
  const [ballStyle, setBallStyle] = useState<React.CSSProperties>({});
  const [bulge, setBulge] = useState<{ x: number; y: number; key: number } | null>(null);
  const [result, setResult] = useState<{ kind: "goal" | "saved"; mult?: number } | null>(null);
  const [shaking, setShaking] = useState(false);
  const [rippling, setRippling] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const goalRef = useRef<HTMLDivElement>(null);
  const ballRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ playing, busy, goals });
  stateRef.current = { playing, busy, goals };

  const resetActors = useCallback(() => {
    setKeeperPose("ready");
    setKeeperStyle({});
    setStrikerPose("");
    setBallStyle({});
    setBulge(null);
  }, []);

  const finish = useCallback(async (won: boolean, payout: number, label: string, goalsNow?: number, shotsTaken?: number) => {
    const g = goalsNow ?? goals;
    // shots is the TRUE number of kicks taken: a cash-out after g
    // goals took g shots, a save took g + 1 (the saved kick counts),
    // five-from-five took 5. The old formula (g + 1 on a win, g on a
    // loss) was wrong on every path — callers pass it explicitly.
    const shots = shotsTaken ?? g;
    // Capped-win display: callers build their win line from the
    // returned effective payout, never from the local ladder value.
    const res = await room.settle(stake, payout, { shots, goals: g, label });
    setPlaying(false);
    setBusy(false);
    stateRef.current.playing = false;
    stateRef.current.busy = false;
    return res;
  }, [room, stake, goals]);

  const cashOut = useCallback(async (auto = false) => {
    if (!playing || goals < 1) return;
    const m = LADDER[goals - 1];
    const pay = Math.round(stake * m * 100) / 100;
    const res = await finish(true, pay, `×${m}`, undefined, goals);
    const eff = res?.payout ?? pay;
    setMsg(`${auto ? "Five from five! " : "Cashed out — "}${goals}${goals === 1 ? " goal" : " goals"} at ×${m}: ${fmtMoney(eff, room.user?.currency ?? "GHS")}${eff > stake ? "." : " back."}`);
  }, [playing, goals, stake, finish]);

  // Goal confetti (the artifact's burst): coloured shards fly out of
  // the goal mouth on every goal, more of them from the third goal on.
  const burst = useCallback((x: number, y: number, colors: string[], n: number) => {
    const stage = stageRef.current;
    if (!stage || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (let i = 0; i < n; i++) {
      const s = document.createElement("span");
      s.className = "pn-burst";
      s.style.background = colors[i % colors.length];
      if (i % 3 === 0) { s.style.borderRadius = "1.5px"; s.style.width = "6px"; s.style.height = "11px"; }
      s.style.left = `${x}px`;
      s.style.top = `${y}px`;
      stage.appendChild(s);
      const ang = Math.random() * Math.PI * 2, dist = 40 + Math.random() * 90;
      const dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist - 24;
      try {
        const a = s.animate([
          { transform: "translate(-50%,-50%) scale(1) rotate(0deg)", opacity: 1 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.3) rotate(200deg)`, opacity: 0 },
        ], { duration: 760, easing: "cubic-bezier(.2,.8,.3,1)" });
        a.onfinish = () => s.remove();
      } catch { /* no WAAPI — the shard is removed below anyway */ }
      setTimeout(() => s.remove(), 850);
    }
  }, []);

  const resolveShot = useCallback((saved: boolean, aim: Aim) => {
    const { fx, fy } = aim;
    if (!saved) {
      // Read the live goals from the ref, not the closure: onKick resets
      // goals to 0 and shoots in the same tick, so the closure still
      // holds the previous run's count and the first goal of a new run
      // would land on the old rung (e.g. 2 + 1 = 3 after a ×3.92 cash-out).
      const g = stateRef.current.goals + 1;
      setGoals(g);
      stateRef.current.goals = g;
      setBulge({ x: fx * 100, y: fy * 100, key: Date.now() });
      setKeeperPose("beaten");
      setStrikerPose("celebrate");
      setResult({ kind: "goal", mult: LADDER[g - 1] });
      // Net ripple + stage shake + confetti, all from the artifact.
      setRippling(true);
      setTimeout(() => setRippling(false), 500);
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
      burst(aim.x, aim.y, ["#F2C230", "#FFD964", "#3ED97E", "#FFF6D8"], g >= 3 ? 26 : 16);
      if (g >= 3) burst(aim.x, aim.y, ["#F2C230", "#FFF6D8"], 14);
      if (g >= 5) {
        // Five from five pays the TOP rung. The old code called the
        // cashOut closure here, which still held the pre-goal count
        // and paid LADDER[3] (×15.68) — half the win. Pay LADDER[4]
        // directly and pass the true goals count to finish.
        const m5 = LADDER[4];
        const pay5 = Math.round(stake * m5 * 100) / 100;
        // Capped-win display: no amount is shown until settle returns
        // the credited one — the interim line carries no figure at all.
        setMsg(`Five from five!`);
        setTimeout(async () => { resetActors(); const res = await finish(true, pay5, `×${m5}`, g, g); const eff = res?.payout ?? pay5; setMsg(`Five from five! ${g} goals at ×${m5}: ${fmtMoney(eff, room.user?.currency ?? "GHS")}${eff > stake ? "." : " back."}`); }, 460);
        return;
      }
      setMsg(`GOAL — ${aim.label}! That's ${g} on the ladder: ×${LADDER[g - 1]} = ${fmtMoney(Math.round(stake * LADDER[g - 1] * 100) / 100, room.user?.currency ?? "GHS")}. Cash out now or shoot for ×${LADDER[g]}.`);
      setTimeout(() => { resetActors(); setBusy(false); stateRef.current.busy = false; }, 520);
    } else {
      setKeeperPose("hero");
      setSavedAt(stateRef.current.goals);
      setResult({ kind: "saved" });
      // The gloves meet it: the ball parries away from the goal mouth.
      const dir = fx < 0.5 ? -1 : 1;
      const dxTotal = aim.x - aim.sx, dyTotal = aim.y - aim.sy;
      const ex = dxTotal + dir * 105, ey = dyTotal + 66;
      try {
        ballRef.current?.animate([
          { transform: `translate(${dxTotal}px,${dyTotal}px) scale(.42) rotate(640deg)`, opacity: 1 },
          { transform: `translate(${ex}px,${ey}px) scale(.36) rotate(840deg)`, opacity: 0.85 },
        ], { duration: 380, easing: "cubic-bezier(.2,.7,.3,1)", fill: "forwards" });
      } catch { /* no WAAPI — the style below still lands the parry */ }
      setBallStyle({ transform: `translate(${ex}px,${ey}px) scale(.36)`, opacity: 1 });
      setMsg(`NO GOAL — the keeper got a glove to the ${aim.label} shot and parried it. The ${fmtMoney(stake, room.user?.currency ?? "GHS")} stake is gone.`);
      setTimeout(() => {
        resetActors();
        void finish(false, 0, "SAVED", stateRef.current.goals, stateRef.current.goals + 1);
      }, 900);
    }
  }, [stake, finish, resetActors, burst]);

  // Keeper dive for free aim: the dive point is drawn centre-biased
  // BEFORE the save is decided, so the keeper never reads the aim. A
  // shot is saved when the ball lands within KEEPER_REACH of where the
  // keeper ends up (distance in goal-width units, y scaled by the goal
  // aspect so the reach is a true circle on screen). On a save the dive
  // point is nudged onto the ball so the gloves land on it; on a goal
  // the dive is redrawn until it is clearly away, so a goal never
  // looks like a near-miss.
  const keeperDive = useCallback((fx: number, fy: number) => {
    const draw = () => ({
      kx: clamp(0.5 + (Math.random() + Math.random() + Math.random() - 1.5) * 0.45, 0.06, 0.94),
      ky: clamp(0.42 + (Math.random() + Math.random() - 1) * 0.4, 0.08, 0.92),
    });
    const dist = (p: { kx: number; ky: number }) =>
      Math.hypot(fx - p.kx, (fy - p.ky) / GOAL_ASPECT);
    let k = draw();
    const saved = dist(k) < KEEPER_REACH;
    if (saved) {
      k = {
        kx: clamp(fx + (Math.random() - 0.5) * 0.08, 0.06, 0.94),
        ky: clamp(fy + (Math.random() - 0.5) * 0.06, 0.08, 0.92),
      };
    } else {
      for (let i = 0; i < 8 && dist(k) < KEEPER_REACH * 1.25; i++) k = draw();
    }
    return { ...k, saved };
  }, []);

  const shoot = useCallback((aim: Aim) => {
    if (!stateRef.current.playing || stateRef.current.busy) return;
    // Guard synchronously — the state update lands on the next render,
    // and a fast double-tap on Kick! must not fire a second shot.
    stateRef.current.busy = true;
    setBusy(true);
    setResult(null);
    setGuide(null);
    playSfx("blip", room.muted);
    const { fx, fy } = aim;
    const { kx: kfx, ky: kfy, saved } = keeperDive(fx, fy);
    // Rig hook (precedent: window.__rgSfx in sound.ts): the last shot's
    // aim, keeper dive point and outcome, for goal-rate measurement.
    (window as unknown as { __pnLastShot?: unknown }).__pnLastShot = { fx, fy, kfx, kfy, saved };
    setStrikerPose("runup");
    setTimeout(() => {
      setStrikerPose("kick");
      setTimeout(() => {
        setStrikerPose("follow");
        setTimeout(() => setStrikerPose(""), 340);
      }, 240);
      // Keeper travels to the dive spot — the body centre goes 72% of
      // the way (the gloves span the rest), with a dive lean.
      const gw = aim.gw;
      const kx = (kfx - 0.5) * gw * 0.72;
      const kRot = Math.max(-82, Math.min(82, (kfx - 0.5) * 160));
      const ky = (kfy - 0.5) * 44;
      setKeeperStyle({ transform: `translateX(calc(-50% + ${kx}px)) translateY(${ky}px) rotate(${kRot}deg)` });
      setKeeperPose("diving");
      // Ball flight along a higher arc to the aimed spot — rAF, like
      // the artifact, so a fading trail can be left behind it.
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const dur = 520, t0 = performance.now();
      let lastTrail = 0;
      const bez = (t: number) => {
        const u = 1 - t;
        return { x: u * u * aim.sx + 2 * u * t * aim.cx + t * t * aim.x, y: u * u * aim.sy + 2 * u * t * aim.cy + t * t * aim.y };
      };
      // Kick dust where the boot meets the ball.
      burst(aim.sx, aim.sy, ["#FFF6D8", "#F2C230", "#D8D2BD"], 8);
      const flight = (now: number) => {
        const elapsed = Math.max(0, now - t0);
        const t = Math.min(1, elapsed / dur);
        const p = bez(t);
        setBallStyle({ transform: `translate(${p.x - aim.sx}px,${p.y - aim.sy}px) scale(${1 - 0.58 * t}) rotate(${640 * t}deg)`, opacity: 1 });
        if (!reduced && now - lastTrail > 44 && t < 0.92) {
          lastTrail = now;
          const stage = stageRef.current;
          if (stage) {
            const s = document.createElement("span");
            s.className = "pn-trail";
            const sz = 30 * (1 - 0.5 * t);
            s.style.width = `${sz}px`; s.style.height = `${sz}px`;
            s.style.left = `${p.x - sz / 2}px`; s.style.top = `${p.y - sz / 2}px`; s.style.opacity = ".5";
            stage.appendChild(s);
            try {
              const a = s.animate([{ opacity: 0.5 }, { opacity: 0 }], { duration: 420, easing: "ease-out" });
              a.onfinish = () => s.remove();
            } catch { /* no WAAPI */ }
            setTimeout(() => s.remove(), 460);
          }
        }
        if (t < 1) requestAnimationFrame(flight);
        else resolveShot(saved, aim);
      };
      if (reduced) {
        setBallStyle({ transform: `translate(${aim.x - aim.sx}px,${aim.y - aim.sy}px) scale(.42)`, opacity: 1 });
        resolveShot(saved, aim);
      } else requestAnimationFrame(flight);
    }, 290);
  }, [resolveShot, room.muted, keeperDive, burst]);

  // Drag anywhere on the goal to aim: the fractions come from the goal
  // rect as rendered (which accounts for the goal's rotateX), clamped
  // just inside the posts so the reticle never sits on the frame.
  const updateAim = useCallback((clientX: number, clientY: number) => {
    const goal = goalRef.current, stage = stageRef.current, ball = ballRef.current;
    if (!goal || !stage || !ball) return;
    const gr = goal.getBoundingClientRect();
    const fx = clamp((clientX - gr.left) / gr.width, 0.05, 0.95);
    const fy = clamp((clientY - gr.top) / gr.height, 0.06, 0.94);
    setAim({ fx, fy });
    setAimed(true);
    // Aim guide: dashed line from the ball to the reticle, in stage %.
    const sr = stage.getBoundingClientRect();
    const br = ball.getBoundingClientRect();
    setGuide({
      x1: ((br.left + br.width / 2 - sr.left) / sr.width) * 100,
      y1: ((br.top + br.height / 2 - sr.top) / sr.height) * 100,
      x2: ((gr.left - sr.left + fx * gr.width) / sr.width) * 100,
      y2: ((gr.top - sr.top + fy * gr.height) / sr.height) * 100,
    });
  }, []);

  // The aim fractions become a stage point via the goal rect measured
  // on the goal as rendered.
  const aimFor = useCallback((fx: number, fy: number): Aim | null => {
    if (!stageRef.current || !goalRef.current || !ballRef.current) return null;
    const sr = stageRef.current.getBoundingClientRect();
    const gr = goalRef.current.getBoundingClientRect();
    const ball = ballRef.current.getBoundingClientRect();
    const sx = ball.left + ball.width / 2 - sr.left;
    const sy = ball.top + ball.height / 2 - sr.top;
    const x = gr.left - sr.left + fx * gr.width;
    const y = gr.top - sr.top + fy * gr.height;
    return {
      sx, sy, x, y,
      cx: (sx + x) / 2, cy: Math.min(sy, y) - 78,
      fx, fy,
      gl: gr.left - sr.left, gt: gr.top - sr.top, gw: gr.width, gh: gr.height,
      label: aimLabel(fx, fy),
    };
  }, []);

  // Kick! — one tap starts the shootout AND kicks (the video's rhythm).
  // The ball goes exactly where the crosshair is.
  const onKick = () => {
    if (busy) return;
    const shot = aimFor(aim.fx, aim.fy);
    if (!shot) return;
    if (!playing) {
      if (room.balance < stake) { setMsg(room.simMode ? "SIM balance too low for that stake." : "Balance too low for that stake — top up at the cashier."); return; }
      setPlaying(true);
      stateRef.current.playing = true;
      setGoals(0);
      stateRef.current.goals = 0;
      setSavedAt(-1);
      resetActors();
      setMsg(`Shootout live — ${fmtMoney(stake, room.user?.currency ?? "GHS")} riding on it. Aiming ${shot.label}. First goal pays ×${LADDER[0]}.`);
    }
    shoot(shot);
  };

  // Bet controls — the video's Min/−, amount, +/Max (Min 0.10, Max 4,000.00).
  const clampBet = (v: number) => Math.min(BET_MAX, Math.max(BET_MIN, Math.round(v * 100) / 100));
  const commitBet = (v: number) => { const c = clampBet(v); setStake(c); setBetText(String(c)); };
  const onBetChange = (raw: string) => {
    setBetText(raw);
    if (raw.trim() === "") return;
    const n = Number(raw);
    if (Number.isFinite(n) && String(clampBet(n)) === raw) setStake(clampBet(n));
  };
  const onBetBlur = () => {
    const n = Number(betText);
    if (!Number.isFinite(n) || betText.trim() === "") { commitBet(1); return; }
    commitBet(n);
  };

  const label = aimLabel(aim.fx, aim.fy);
  const cashOutAmt = goals >= 1 ? Math.round(stake * LADDER[goals - 1] * 100) / 100 : 0;
  // FanZone's two-column score board: GOALS + the kick number (1–5) on
  // the first row, SAVED + the NEXT rung on the second. Kicks taken =
  // goals + the save that ended the run (if any); the current kick is
  // the next one while the shootout is live.
  const kicksTaken = goals + (savedAt >= 0 ? 1 : 0);
  const kickNum = playing ? Math.min(5, kicksTaken + 1) : Math.max(1, Math.min(5, kicksTaken));
  const nextMult = goals >= 5 ? null : LADDER[goals];

  return (
    <RoomShell game={game} subtitle="Drag the goal to aim · 5 shots · ladder to ×31.36" stats={room.stats} history={room.history}>
      <div className="pn2-ladderbar" aria-label="Payout ladder">
        {LADDER.map((m, i) => (
          <span key={m} className={`pn2-rung2 ${i < goals ? "done" : i === goals ? "next" : ""}`}>
            <i className="pn2-dot" aria-hidden="true" />
            <b>×{m}</b>
          </span>
        ))}
      </div>
      <div className={`pn-stage${playing ? " armed" : ""}${shaking ? " shake" : ""}`} id="pnStage" ref={stageRef}>
        <div className="pn2-board" aria-label="Shootout score">
          <div className="pn2-board-card">
            <small>GOALS</small>
            <b>{goals}</b>
          </div>
          <div className="pn2-board-mid"><span>KICK {kickNum}/5</span></div>
          <div className="pn2-board-card">
            <small>SAVED</small>
            <b className="is-saved">{savedAt >= 0 ? 1 : 0}</b>
          </div>
          <div className="pn2-board-card">
            <small>NEXT</small>
            <b className="is-next">{nextMult === null ? "—" : `×${nextMult}`}</b>
          </div>
        </div>
        <div className="pn-lights" aria-hidden="true">
          <div className="pn-pylon l"><i /><i /><i /><i /><i /><i /></div><div className="pn-pylon r"><i /><i /><i /><i /><i /><i /></div>
          <div className="pn-cone l" /><div className="pn-cone r" />
        </div>
        <div className="pn-crowd" aria-hidden="true" />
        {guide && !busy && (
          <svg className="pn-aimline" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <line x1={guide.x1} y1={guide.y1} x2={guide.x2} y2={guide.y2} vectorEffect="non-scaling-stroke" />
          </svg>
        )}
        <div
          className={`pn-goal${rippling ? " ripple" : ""}${aimed ? " aimed" : ""}`}
          ref={goalRef}
          role="img"
          aria-label={`The goal and its keeper — drag to aim, currently ${label}`}
          onPointerDown={(e) => {
            if (busy) return;
            e.preventDefault();
            try { goalRef.current?.setPointerCapture(e.pointerId); } catch { /* no capture — drag still works on the goal */ }
            updateAim(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => { if (busy || !e.buttons) return; updateAim(e.clientX, e.clientY); }}
        >
          <div className="pn-net-back" aria-hidden="true" />
          <div className="pn-net-side l" aria-hidden="true" />
          <div className="pn-net-side r" aria-hidden="true" />
          {bulge && <div className="pn-bulge hit" aria-hidden="true" style={{ left: `${bulge.x}%`, top: `${bulge.y}%` }} />}
          <div className={`pn-keeper ${keeperPose}`} aria-hidden="true" style={keeperStyle}><KeeperSvg /></div>
          <div className="pn-reticle" aria-hidden="true" style={{ left: `${aim.fx * 100}%`, top: `${aim.fy * 100}%` }}><i /></div>
        </div>
        <div className={`pn2-result${result ? (result.kind === "saved" ? " saved" : " goal") : ""}`} aria-live="polite">
          {result && <b>{result.kind === "saved" ? "NO GOAL!" : `GOAL! ×${result.mult}`}</b>}
        </div>
        <div className="pn-grass"><span className="pn-spot" aria-hidden="true" /></div>
        <div className={`pn-striker ${strikerPose}`} aria-hidden="true"><StrikerSvg /></div>
        <div className="pn-ball" ref={ballRef} aria-hidden="true" style={ballStyle} />
      </div>
      <div className="pn-shots" aria-label="Shots taken">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className={`pn-shotdot${i < goals ? " goal" : i === savedAt ? " miss" : ""}`} />
        ))}
      </div>
      <div className="pn2-bet" aria-label="Bet amount">
        <div className="pn2-bet-row">
          <button type="button" onClick={() => commitBet(BET_MIN)} disabled={playing}>Min</button>
          <button type="button" onClick={() => commitBet(stake - 1)} disabled={playing} aria-label="Decrease bet">−</button>
          <span className="pn2-bet-amt">
            <small>Bet Amount</small>
            <input
              type="number"
              min={BET_MIN}
              max={BET_MAX}
              step={0.1}
              inputMode="decimal"
              enterKeyHint="done"
              aria-label="Bet amount in Ghana cedis"
              value={betText}
              onChange={(e) => onBetChange(e.target.value)}
              onBlur={onBetBlur}
              disabled={playing}
            />
          </span>
          <button type="button" onClick={() => commitBet(stake + 1)} disabled={playing} aria-label="Increase bet">+</button>
          <button type="button" onClick={() => commitBet(BET_MAX)} disabled={playing}>Max</button>
        </div>
        <div className="pn2-bet-cap"><span>Min: 0.10</span><span>Max: 4,000.00</span></div>
      </div>
      {playing && goals >= 1 ? (
        <div className="pn2-actions">
          <button className="btn btn-gold" type="button" onClick={() => void cashOut()} disabled={busy}>
            Cash Out {fmtMoney(cashOutAmt, room.user?.currency ?? "GHS")}
          </button>
          <button className="btn cr-cash pn2-kick2" type="button" onClick={onKick} disabled={busy}>
            Kick!!<small>{label}</small>
          </button>
        </div>
      ) : (
        <div className="pn2-kickwrap">
          <button className="pn2-kick" type="button" onClick={onKick} disabled={busy}>Kick!</button>
          <small>{aimed ? label : `${label} — drag the goal to move it`}</small>
        </div>
      )}
      <p className="bottle-msg xg-msg">{msg}</p>
    </RoomShell>
  );
}
