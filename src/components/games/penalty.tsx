// Penalty Shoot Out — LALIGA-style rebuild (video spec, not a copy):
// 5 tap-to-aim target zones over the goal, a doubling multiplier ladder
// [1.96, 3.92, 7.84, 15.68, 31.36] as a top bar, bet controls (Min/−,
// amount, +/Max; Min 0.10, Max 4,000.00), a big green Kick! button
// (tap a zone to aim, or Kick! for a random target), GOAL! / NO GOAL!
// states, and a gold Cash Out after each goal or Kick!! to climb the
// ladder. The striker always wears the gold #9 kit (no team picker).
// Keeper logic follows the classic zone-match pattern
// (adhkr81/Penalty-Shooter- reference): the keeper dives to a zone; if it is the shot's zone the shot is saved. Save
// chance is 40% per shot, so a goal is the common outcome; one save
// ends the run and the stake is gone. One stake rides the whole
// shootout (unchanged settle flow — settle() still computes the payout
// from the multiplier; server cap is stake × 31.36 via games.ts).
// PAYOUT CHANGE: top rung was ×12.5, now ×31.36.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fmtCash } from "../../lib/api";
import { GameDef } from "../../lib/games";
import { playSfx } from "../../lib/store";
import { RoomShell, useGameRoom } from "./shared";
import { KeeperSvg, StrikerSvg } from "./penalty-svgs";

const LADDER = [1.96, 3.92, 7.84, 15.68, 31.36];
const SAVE_CHANCE = 0.4;
const BET_MIN = 0.1;
const BET_MAX = 4000;

interface Zone { id: string; label: string; fx: number; fy: number }
// The video's five targets: three across the top, two low in the corners.
const ZONES: Zone[] = [
  { id: "tl", label: "Top left", fx: 0.14, fy: 0.16 },
  { id: "tc", label: "Top centre", fx: 0.5, fy: 0.12 },
  { id: "tr", label: "Top right", fx: 0.86, fy: 0.16 },
  { id: "bl", label: "Bottom left", fx: 0.12, fy: 0.8 },
  { id: "br", label: "Bottom right", fx: 0.88, fy: 0.8 },
];

interface Aim { sx: number; sy: number; x: number; y: number; cx: number; cy: number; fx: number; fy: number; gl: number; gt: number; gw: number; gh: number; label: string }

export default function PenaltyRoom({ game }: { game: GameDef }) {
  const room = useGameRoom(game);
  const [stake, setStake] = useState(1);
  const [betText, setBetText] = useState("1");
  const [selected, setSelected] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [goals, setGoals] = useState(0);
  const [savedAt, setSavedAt] = useState(-1);
  const [msg, setMsg] = useState("Tap a target zone, then Kick! — or just Kick! for a random shot. First goal pays ×1.96; cash out after any goal, but one save ends it and the stake is gone.");
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

  const finish = useCallback(async (won: boolean, payout: number, label: string) => {
    await room.settle(stake, payout, { shots: goals + (won ? 1 : 0), goals, label });
    setPlaying(false);
    setBusy(false);
    stateRef.current.playing = false;
    stateRef.current.busy = false;
  }, [room, stake, goals]);

  const cashOut = useCallback(async (auto = false) => {
    if (!playing || goals < 1) return;
    const m = LADDER[goals - 1];
    const pay = Math.round(stake * m * 100) / 100;
    setMsg(`${auto ? "Five from five! " : "Cashed out — "}${goals}${goals === 1 ? " goal" : " goals"} at ×${m}: ${fmtCash(pay)}.`);
    await finish(true, pay, `×${m}`);
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
      const g = goals + 1;
      setGoals(g);
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
        setTimeout(() => { resetActors(); void cashOut(true); }, 460);
        return;
      }
      setMsg(`GOAL — ${aim.label}! That's ${g} on the ladder: ×${LADDER[g - 1]} = ${fmtCash(Math.round(stake * LADDER[g - 1] * 100) / 100)}. Cash out now or shoot for ×${LADDER[g]}.`);
      setTimeout(() => { resetActors(); setBusy(false); stateRef.current.busy = false; }, 520);
    } else {
      setKeeperPose("hero");
      setSavedAt(goals);
      setResult({ kind: "saved" });
      // The gloves meet it: the ball parries away from the goal mouth.
      const dir = fx < 0.5 ? -1 : 1;
      const dxTotal = aim.x - aim.sx, dyTotal = aim.y - aim.sy;
      const ex = dxTotal + dir * 105, ey = dyTotal + 66;
      try {
        ballRef.current?.animate([
          { transform: `translate(${dxTotal}px,${dyTotal}px) scale(.42) rotate(560deg)`, opacity: 1 },
          { transform: `translate(${ex}px,${ey}px) scale(.36) rotate(760deg)`, opacity: 0.85 },
        ], { duration: 380, easing: "cubic-bezier(.2,.7,.3,1)", fill: "forwards" });
      } catch { /* no WAAPI — the style below still lands the parry */ }
      setBallStyle({ transform: `translate(${ex}px,${ey}px) scale(.36)`, opacity: 1 });
      setMsg(`NO GOAL — the keeper read the ${aim.label} all the way and parried it. The ${fmtCash(stake)} stake is gone.`);
      setTimeout(() => {
        resetActors();
        void finish(false, 0, "SAVED");
      }, 900);
    }
  }, [goals, stake, cashOut, finish, resetActors, burst]);

  const shoot = useCallback((aim: Aim) => {
    if (!stateRef.current.playing || stateRef.current.busy) return;
    // Guard synchronously — the state update lands on the next render,
    // and a fast double-tap on Kick! must not fire a second shot.
    stateRef.current.busy = true;
    setBusy(true);
    setResult(null);
    setSelected(null);
    playSfx("blip", room.muted);
    const { fx, fy } = aim;
    // Zone-match keeper (adhkr81 pattern): the keeper dives to a zone;
    // if it is the shot's zone, the shot is saved. 40% save, so a goal
    // is the common outcome.
    const saved = Math.random() < SAVE_CHANCE;
    let kfx: number, kfy: number;
    if (saved) { kfx = fx; kfy = fy; }
    else {
      const others = ZONES.filter((z) => Math.abs(z.fx - fx) > 0.01 || Math.abs(z.fy - fy) > 0.01);
      const kz = others[Math.floor(Math.random() * others.length)];
      kfx = kz.fx; kfy = kz.fy;
    }
    setStrikerPose("runup");
    setTimeout(() => {
      setStrikerPose("kick");
      setTimeout(() => {
        setStrikerPose("follow");
        setTimeout(() => setStrikerPose(""), 340);
      }, 240);
      // Keeper dive from the SAME snapshot
      const gw = aim.gw;
      const kx = (kfx - 0.5) * gw * 0.66;
      const kRot = Math.max(-82, Math.min(82, (kfx - 0.5) * 155));
      const ky = (kfy - 0.5) * 38;
      setKeeperStyle({ transform: `translateX(calc(-50% + ${kx}px)) translateY(${ky}px) rotate(${kRot}deg)` });
      setKeeperPose("diving");
      // Ball flight along a gentle arc to the target zone — rAF, like
      // the artifact, so a fading trail can be left behind it.
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const dur = 480, t0 = performance.now();
      let lastTrail = 0;
      const bez = (t: number) => {
        const u = 1 - t;
        return { x: u * u * aim.sx + 2 * u * t * aim.cx + t * t * aim.x, y: u * u * aim.sy + 2 * u * t * aim.cy + t * t * aim.y };
      };
      const flight = (now: number) => {
        const elapsed = Math.max(0, now - t0);
        const t = Math.min(1, elapsed / dur);
        const p = bez(t);
        setBallStyle({ transform: `translate(${p.x - aim.sx}px,${p.y - aim.sy}px) scale(${1 - 0.58 * t}) rotate(${560 * t}deg)`, opacity: 1 });
        if (!reduced && now - lastTrail > 52 && t < 0.92) {
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
  }, [resolveShot, room.muted]);

  // Aim at a zone: the zone's fractions become a stage point via the
  // goal rect measured on the goal as rendered.
  const aimFor = useCallback((zone: Zone): Aim | null => {
    if (!stageRef.current || !goalRef.current || !ballRef.current) return null;
    const sr = stageRef.current.getBoundingClientRect();
    const gr = goalRef.current.getBoundingClientRect();
    const ball = ballRef.current.getBoundingClientRect();
    const sx = ball.left + ball.width / 2 - sr.left;
    const sy = ball.top + ball.height / 2 - sr.top;
    const x = gr.left - sr.left + zone.fx * gr.width;
    const y = gr.top - sr.top + zone.fy * gr.height;
    return {
      sx, sy, x, y,
      cx: (sx + x) / 2, cy: Math.min(sy, y) - 42,
      fx: zone.fx, fy: zone.fy,
      gl: gr.left - sr.left, gt: gr.top - sr.top, gw: gr.width, gh: gr.height,
      label: zone.label,
    };
  }, []);

  // Kick! — one tap starts the shootout AND kicks (the video's rhythm).
  // A selected zone is the aim; with none selected the target is random.
  const onKick = () => {
    if (busy) return;
    const zone = (selected ? ZONES.find((z) => z.id === selected) : undefined) ?? ZONES[Math.floor(Math.random() * ZONES.length)];
    const aim = aimFor(zone);
    if (!aim) return;
    if (!playing) {
      if (room.balance < stake) { setMsg(room.simMode ? "SIM balance too low for that stake." : "Balance too low for that stake — top up at the cashier."); return; }
      setPlaying(true);
      stateRef.current.playing = true;
      setGoals(0);
      setSavedAt(-1);
      resetActors();
      setMsg(`Shootout live — ${fmtCash(stake)} riding on it. ${zone.label} it is. First goal pays ×${LADDER[0]}.`);
    }
    shoot(aim);
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

  useEffect(() => { setBetText(String(stake)); }, [stake]);

  const selectedZone = selected ? ZONES.find((z) => z.id === selected) : undefined;
  const cashOutAmt = goals >= 1 ? Math.round(stake * LADDER[goals - 1] * 100) / 100 : 0;

  return (
    <RoomShell game={game} subtitle="5 shots · ladder to ×31.36 · cash out after any goal" stats={room.stats} history={room.history}>
      <div className="pn2-ladderbar" aria-label="Payout ladder">
        {LADDER.map((m, i) => (
          <span key={m} className={`pn2-rung2 ${i < goals ? "done" : i === goals ? "next" : ""}`}>
            <i className="pn2-dot" aria-hidden="true" />
            <b>×{m}</b>
          </span>
        ))}
      </div>
      <div className={`pn-stage${playing ? " armed" : ""}${shaking ? " shake" : ""}`} id="pnStage" ref={stageRef}>
        <div className="pn-lights" aria-hidden="true">
          <div className="pn-pylon l"><i /><i /><i /><i /><i /><i /></div><div className="pn-pylon r"><i /><i /><i /><i /><i /><i /></div>
          <div className="pn-cone l" /><div className="pn-cone r" />
        </div>
        <div className="pn-crowd" aria-hidden="true" />
        <div className="pn-boards" aria-hidden="true"><span>ROYALE GOLD</span><span className="mid">PENALTY SHOOTOUT</span><span>TOP PRIZE ×31.36</span></div>
        <div className={`pn-goal${rippling ? " ripple" : ""}`} ref={goalRef} role="img" aria-label="The goal and its keeper — tap a target zone, then Kick!">
          <div className="pn-net-back" aria-hidden="true" />
          <div className="pn-net-side l" aria-hidden="true" />
          <div className="pn-net-side r" aria-hidden="true" />
          {bulge && <div className="pn-bulge hit" aria-hidden="true" style={{ left: `${bulge.x}%`, top: `${bulge.y}%` }} />}
          <div className={`pn-keeper ${keeperPose}`} aria-hidden="true" style={keeperStyle}><KeeperSvg /></div>
          {ZONES.map((z) => (
            <button
              key={z.id}
              type="button"
              className={`pn2-zone${selected === z.id ? " sel" : ""}`}
              style={{ left: `${z.fx * 100}%`, top: `${z.fy * 100}%` }}
              onClick={() => { if (!busy) setSelected(z.id); }}
              disabled={busy}
              aria-pressed={selected === z.id}
              aria-label={`Aim ${z.label}`}
            >
              <span className="pn2-zone-in" aria-hidden="true" />
            </button>
          ))}
        </div>
        <div className="pn-grass"><span className="pn-spot" aria-hidden="true" /></div>
        <div className={`pn-striker ${strikerPose}`} aria-hidden="true"><StrikerSvg /></div>
        <div className="pn-ball" ref={ballRef} aria-hidden="true" style={ballStyle} />
        {result && (
          <div className={`pn2-result ${result.kind === "saved" ? "saved" : ""}`} aria-live="polite">
            <b>{result.kind === "saved" ? "NO GOAL!" : "GOAL!"}</b>
            {result.kind === "goal" && result.mult !== undefined && <span>×{result.mult}</span>}
          </div>
        )}
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
            Cash Out {fmtCash(cashOutAmt)}
          </button>
          <button className="btn cr-cash pn2-kick2" type="button" onClick={onKick} disabled={busy}>
            Kick!!<small>Random</small>
          </button>
        </div>
      ) : (
        <div className="pn2-kickwrap">
          <button className="pn2-kick" type="button" onClick={onKick} disabled={busy}>Kick!</button>
          <small>{selectedZone ? selectedZone.label : "Random"}</small>
        </div>
      )}
      <div className="pn-shots" aria-label="Shots taken">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className={`pn-shotdot${i < goals ? " goal" : i === savedAt ? " miss" : ""}`} />
        ))}
      </div>
      <p className="bottle-msg xg-msg">{msg}</p>
    </RoomShell>
  );
}
