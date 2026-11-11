// Arcade cash games — Car Crash (top-down driving, live rising odds,
// gold CASH OUT with live GH₵ value, coins +0.10x, near-miss +0.05x),
// Rocket Shooter (goals EASY 20→×2, MEDIUM 35→×3, HARD 50→×4; powerups;
// speed ramp ~+2% per destroy), Fruit Ninja (score goals 150→×2,
// 250→×3, 400→×4; powerups; coins; speed ramp).

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, fmtCash } from "../../lib/api";
import { GameDef } from "../../lib/games";
import { RoomShell, StakeChips, useGameRoom } from "./shared";

// ---------------- Car Crash ----------------
// Top-down driving on a server-issued crash round: the run's odds grow
// on the shared crash curve (exp(0.00006 * elapsed) + coin/near-miss
// bonuses, cap ×50) and the run ends when the SERVER's round crashes —
// the client polls GET /api/games/crash/reveal, which stays shut until
// the curve reaches the server's point, then reveals seed + point.
// A collision ends the run early (stake lost) and the reveal is still
// fetched afterwards. Cash-outs settle with the roundId so the server
// re-checks the multiplier against the stored crash point.
interface CarReveal { serverSeed: string; clientSeed: string; nonce: number; crashPoint: number; hash: string }
export function CarCrashRoom({ game }: { game: GameDef }) {
  const room = useGameRoom(game);
  const [stake, setStake] = useState(10);
  const [playing, setPlaying] = useState(false);
  const [msg, setMsg] = useState("Drive! Dodge the traffic, grab coins (+0.10x), near-miss a truck (+0.05x). Cash out before you crash.");
  const [odds, setOdds] = useState(1);
  const [coins, setCoins] = useState(0);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [reveal, setReveal] = useState<CarReveal | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<{ x: number; speed: number; obstacles: { x: number; y: number; w: number; h: number; kind: string }[]; coins: { x: number; y: number }[]; dist: number; bonus: number; crashed: boolean; t0: number } | null>(null);
  const rafRef = useRef(0);
  const keysRef = useRef<{ l: boolean; r: boolean }>({ l: false, r: false });
  const roundIdRef = useRef<string | null>(null);
  roundIdRef.current = roundId;

  const fetchReveal = useCallback(async (waitMs = 0): Promise<CarReveal | null> => {
    const id = roundIdRef.current;
    if (!id) return null;
    try {
      const res = await fetch(`/api/games/crash/reveal?roundId=${encodeURIComponent(id)}${waitMs ? `&waitMs=${waitMs}` : ""}`);
      if (!res.ok) return null;
      const data = await res.json();
      if (data.finished === false) return null;
      return data as CarReveal;
    } catch {
      return null;
    }
  }, []);

  // After a run ends, keep asking until the server seed + point land.
  const revealAfterEnd = useCallback(async () => {
    for (let i = 0; i < 10; i++) {
      const rv = await fetchReveal(25000);
      if (rv) { setReveal(rv); return rv; }
    }
    return null;
  }, [fetchReveal]);

  const cashOut = useCallback(async () => {
    const st = stateRef.current;
    if (!st || !playing) return;
    cancelAnimationFrame(rafRef.current);
    setPlaying(false);
    const payout = Math.round(stake * odds * 100) / 100;
    setMsg(`Cashed out at ×${odds.toFixed(2)} — ${fmtCash(payout)}!`);
    await room.settle(stake, payout, { odds, coins, dist: Math.round(st.dist) }, roundIdRef.current || undefined);
    void revealAfterEnd();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, odds, stake, coins, room, revealAfterEnd]);

  const crash = useCallback(async (rv?: CarReveal) => {
    const st = stateRef.current;
    if (!st) return;
    cancelAnimationFrame(rafRef.current);
    setPlaying(false);
    if (rv !== undefined) {
      setReveal(rv);
      setOdds(rv.crashPoint);
      setMsg(`CRASH at ×${rv.crashPoint.toFixed(2)} — the server round crashed. The stake is gone.`);
    } else {
      setMsg(`CRASH at ×${odds.toFixed(2)} — the stake is gone.`);
    }
    await room.settle(stake, 0, { odds: rv?.crashPoint ?? odds, coins, dist: Math.round(st.dist), crashed: true }, roundIdRef.current || undefined);
    if (!rv) void revealAfterEnd();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [odds, stake, coins, room, revealAfterEnd]);

  const start = async () => {
    if (room.balance < stake) { setMsg("Balance too low for that stake."); return; }
    // Server round: the run's crash point lives on the server.
    let startsAt = Date.now();
    try {
      const r = await api<{ roundId: string; startsAt: number }>("/api/games/crash/round", { method: "POST" });
      setRoundId(r.roundId);
      startsAt = r.startsAt;
    } catch {
      setMsg("Could not start a server round — log in and check your connection, then try again.");
      return;
    }
    setReveal(null);
    stateRef.current = { x: 150, speed: 3, obstacles: [], coins: [], dist: 0, bonus: 0, crashed: false, t0: startsAt };
    setOdds(1); setCoins(0); setPlaying(true);
    setMsg("Drive! Steer with ← → or drag.");
  };

  useEffect(() => {
    if (!playing) return;
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const W = cv.width, H = cv.height;
    const laneW = W / 3;
    const loop = () => {
      const st = stateRef.current;
      if (!st) return;
      const dt = 16;
      st.dist += st.speed * dt / 16;
      // steering
      if (keysRef.current.l) st.x = Math.max(30, st.x - 5);
      if (keysRef.current.r) st.x = Math.min(W - 30, st.x + 5);
      // spawn
      if (Math.random() < 0.03) {
        const lane = Math.floor(Math.random() * 3);
        st.obstacles.push({ x: lane * laneW + laneW / 2, y: -40, w: 44, h: 70, kind: ["truck", "van", "moto"][Math.floor(Math.random() * 3)] });
      }
      if (Math.random() < 0.02) st.coins.push({ x: 30 + Math.random() * (W - 60), y: -20 });
      // move
      st.obstacles.forEach((o) => { o.y += st.speed + 1.5; });
      st.coins.forEach((c) => { c.y += st.speed + 1.5; });
      st.obstacles = st.obstacles.filter((o) => o.y < H + 80);
      st.coins = st.coins.filter((c) => c.y < H + 20);
      // live odds: shared crash curve since the server's startsAt,
      // plus coin / near-miss bonuses, cap ×50.
      const elapsedMs = Date.now() - st.t0;
      const o = Math.min(50, Math.exp(0.00006 * elapsedMs) + st.bonus);
      setOdds(Math.round(o * 100) / 100);
      // collisions
      const carY = H - 90;
      for (const ob of st.obstacles) {
        if (Math.abs(ob.y - carY) < 55 && Math.abs(ob.x - st.x) < 42) { void crash(); return; }
        if (Math.abs(ob.y - carY) < 90 && Math.abs(ob.x - st.x) < 70 && Math.abs(ob.x - st.x) >= 42) {
          // near miss — once per obstacle
          if (!(ob as unknown as { nm?: boolean }).nm) { (ob as unknown as { nm?: boolean }).nm = true; st.bonus += 0.05; }
        }
      }
      for (const c of st.coins) {
        if (Math.abs(c.y - carY) < 40 && Math.abs(c.x - st.x) < 40) {
          st.bonus += 0.1;
          setCoins((n) => n + 1);
          st.coins = st.coins.filter((x) => x !== c);
        }
      }
      if (o >= 50) { void crash(); return; }
      // draw
      ctx.fillStyle = "#0C2B22";
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(242,194,48,.5)";
      ctx.setLineDash([18, 14]);
      for (let l = 1; l < 3; l++) { ctx.beginPath(); ctx.moveTo(l * laneW, 0); ctx.lineTo(l * laneW, H); ctx.stroke(); }
      ctx.setLineDash([]);
      st.coins.forEach((c) => { ctx.fillStyle = "#F2C230"; ctx.beginPath(); ctx.arc(c.x, c.y, 10, 0, 7); ctx.fill(); ctx.fillStyle = "#231600"; ctx.font = "bold 10px sans-serif"; ctx.textAlign = "center"; ctx.fillText("₵", c.x, c.y + 3); });
      st.obstacles.forEach((ob) => {
        ctx.fillStyle = ob.kind === "truck" ? "#E5322D" : ob.kind === "van" ? "#2DD4BF" : "#FFD964";
        ctx.fillRect(ob.x - ob.w / 2, ob.y - ob.h / 2, ob.w, ob.h);
      });
      // player car
      ctx.fillStyle = "#F2C230";
      ctx.fillRect(st.x - 20, carY - 34, 40, 68);
      ctx.fillStyle = "#141828";
      ctx.fillRect(st.x - 16, carY - 22, 32, 14);
      ctx.fillRect(st.x - 16, carY + 6, 32, 14);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, crash]);

  // Server crash: long-poll the reveal while driving — when it answers,
  // the server's round has crashed at its point and so does this run.
  // One request at a time, all 200s (no 403 console noise).
  useEffect(() => {
    if (!playing) return;
    let stopped = false;
    (async () => {
      while (!stopped) {
        const rv = await fetchReveal(20000);
        if (stopped) return;
        if (rv) { void crash(rv); return; }
      }
    })();
    return () => { stopped = true; };
  }, [playing, fetchReveal, crash]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") keysRef.current.l = true;
      if (e.key === "ArrowRight") keysRef.current.r = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") keysRef.current.l = false;
      if (e.key === "ArrowRight") keysRef.current.r = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  const steer = (dir: -1 | 1) => {
    const st = stateRef.current;
    if (st) st.x = Math.max(30, Math.min(300 - 30, st.x + dir * 34));
  };

  return (
    <RoomShell game={game} subtitle="Top-down driving — dodge traffic, grab coins (+0.10x), near-miss (+0.05x), cash out before you crash." stats={room.stats} history={room.history}>
      <div className="xg-controls">
        <StakeChips stake={stake} setStake={setStake} currency="cash" disabled={playing} />
        <div className="cc-stage">
          <div className="cc-hud"><span>ODDS <b>×{odds.toFixed(2)}</b></span><span>COINS <b>{coins}</b></span><span>CASH OUT <b>{fmtCash(Math.round(stake * odds * 100) / 100)}</b></span></div>
          <canvas ref={canvasRef} width={300} height={420} className="cc-canvas" aria-label="Car Crash road" />
          <div className="cc-steer">
            <button type="button" aria-label="Steer left" onClick={() => steer(-1)} disabled={!playing}>←</button>
            <button type="button" aria-label="Steer right" onClick={() => steer(1)} disabled={!playing}>→</button>
          </div>
        </div>
        {!playing && <button className="btn btn-gold xg-action" type="button" onClick={() => void start()}>Start driving · {fmtCash(stake)}</button>}
        {playing && <button className="btn btn-gold xg-action cr-cash" type="button" onClick={() => void cashOut()}>CASH OUT · {fmtCash(Math.round(stake * odds * 100) / 100)}</button>}
        <p className="bottle-msg xg-msg">{msg}</p>
        {reveal && (
          <div className="cr-reveal" aria-label="Provably fair reveal">
            <h4>Provably fair — round revealed</h4>
            <p>Server round crashed at <b>×{reveal.crashPoint.toFixed(2)}</b>. SHA-256 of the server seed must equal the hash issued at round start.</p>
            <dl>
              <div><dt>Server seed</dt><dd><code>{reveal.serverSeed}</code></dd></div>
              <div><dt>Client seed</dt><dd><code>{reveal.clientSeed}</code></dd></div>
              <div><dt>Nonce</dt><dd><code>{reveal.nonce}</code></dd></div>
              <div><dt>Crash point</dt><dd><code>×{reveal.crashPoint.toFixed(2)}</code></dd></div>
            </dl>
          </div>
        )}
      </div>
    </RoomShell>
  );
}

// ---------------- Rocket Shooter ----------------
type RsDiff = "easy" | "medium" | "hard";
const RS_GOALS: Record<RsDiff, { kills: number; mult: number }> = { easy: { kills: 20, mult: 2 }, medium: { kills: 35, mult: 3 }, hard: { kills: 50, mult: 4 } };
export function RocketShooterRoom({ game }: { game: GameDef }) {
  const room = useGameRoom(game);
  const [stake, setStake] = useState(10);
  const [diff, setDiff] = useState<RsDiff>("easy");
  const [playing, setPlaying] = useState(false);
  const [kills, setKills] = useState(0);
  const [lives, setLives] = useState(3);
  const [coins, setCoins] = useState(0);
  const [power, setPower] = useState("");
  const [msg, setMsg] = useState("Shoot the asteroids. Reach the kill goal to win — EASY 20 → ×2, MEDIUM 35 → ×3, HARD 50 → ×4.");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stRef = useRef<{ rx: number; rocks: { x: number; y: number; r: number; v: number }[]; shots: { x: number; y: number }[]; items: { x: number; y: number; kind: string }[]; coins: { x: number; y: number }[]; speed: number; shield: number; rapid: number; slow: number; double: number; t: number } | null>(null);
  const rafRef = useRef(0);
  const killsRef = useRef(0);
  const livesRef = useRef(3);

  const goal = RS_GOALS[diff];

  const end = useCallback(async (won: boolean, k: number) => {
    cancelAnimationFrame(rafRef.current);
    setPlaying(false);
    const payout = won ? Math.round(stake * goal.mult * 100) / 100 : 0;
    setMsg(won ? `Goal reached — ${k} kills! ×${goal.mult} = ${fmtCash(payout)}` : `Ship down — ${k}/${goal.kills} kills. Goal not reached.`);
    await room.settle(stake, payout, { kills: k, diff, goal: goal.kills });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stake, goal, diff, room]);

  const start = () => {
    if (room.balance < stake) { setMsg("Balance too low for that stake."); return; }
    stRef.current = { rx: 200, rocks: [], shots: [], items: [], coins: [], speed: 1, shield: 0, rapid: 0, slow: 0, double: 0, t: 0 };
    killsRef.current = 0; livesRef.current = 3;
    setKills(0); setLives(3); setCoins(0); setPower(""); setPlaying(true);
    setMsg(`Goal: ${goal.kills} kills for ×${goal.mult}.`);
  };

  useEffect(() => {
    if (!playing) return;
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const W = cv.width, H = cv.height;
    let lastShot = 0;
    const loop = (t: number) => {
      const st = stRef.current;
      if (!st) return;
      st.t += 1;
      // spawn rocks
      if (Math.random() < 0.02 + st.t * 0.00002) st.rocks.push({ x: 20 + Math.random() * (W - 40), y: -20, r: 12 + Math.random() * 14, v: (1 + Math.random()) * st.speed * (st.slow > 0 ? 0.5 : 1) });
      if (Math.random() < 0.004) st.items.push({ x: 20 + Math.random() * (W - 40), y: -16, kind: ["Double Shot", "Shield", "Slow-Mo", "Rapid Fire"][Math.floor(Math.random() * 4)] });
      if (Math.random() < 0.006) st.coins.push({ x: 20 + Math.random() * (W - 40), y: -12 });
      // auto-fire
      if (t - lastShot > (st.rapid > 0 ? 140 : 320)) {
        lastShot = t;
        st.shots.push({ x: st.rx, y: H - 70 });
        if (st.double > 0) st.shots.push({ x: st.rx - 16, y: H - 66 }, { x: st.rx + 16, y: H - 66 });
      }
      st.shots.forEach((s) => { s.y -= 9; });
      st.rocks.forEach((r) => { r.y += r.v; });
      st.items.forEach((it) => { it.y += 2; });
      st.coins.forEach((c) => { c.y += 2; });
      st.shots = st.shots.filter((s) => s.y > 0);
      st.rocks = st.rocks.filter((r) => r.y < H + 30);
      // collisions: shots vs rocks
      for (const s of [...st.shots]) {
        for (const r of [...st.rocks]) {
          if (Math.hypot(s.x - r.x, s.y - r.y) < r.r + 6) {
            st.shots = st.shots.filter((x) => x !== s);
            st.rocks = st.rocks.filter((x) => x !== r);
            killsRef.current++;
            setKills(killsRef.current);
            st.speed *= 1.02; // ~+2% per destroy
            if (killsRef.current >= goal.kills) { void end(true, killsRef.current); return; }
            break;
          }
        }
      }
      // rocks vs ship
      for (const r of [...st.rocks]) {
        if (Math.hypot(r.x - st.rx, r.y - (H - 50)) < r.r + 16) {
          st.rocks = st.rocks.filter((x) => x !== r);
          if (st.shield > 0) { st.shield--; setPower("Shield absorbed a hit!"); continue; }
          livesRef.current--;
          setLives(livesRef.current);
          if (livesRef.current <= 0) { void end(false, killsRef.current); return; }
        }
      }
      // items + coins
      for (const it of [...st.items]) {
        if (Math.hypot(it.x - st.rx, it.y - (H - 50)) < 26) {
          st.items = st.items.filter((x) => x !== it);
          setPower(it.kind + "!");
          if (it.kind === "Double Shot") st.double = 600;
          if (it.kind === "Shield") st.shield = 1;
          if (it.kind === "Slow-Mo") st.slow = 400;
          if (it.kind === "Rapid Fire") st.rapid = 500;
        }
      }
      for (const c of [...st.coins]) {
        if (Math.hypot(c.x - st.rx, c.y - (H - 50)) < 26) { st.coins = st.coins.filter((x) => x !== c); setCoins((n) => n + 1); }
      }
      st.double = Math.max(0, st.double - 1); st.slow = Math.max(0, st.slow - 1); st.rapid = Math.max(0, st.rapid - 1);
      // draw
      ctx.fillStyle = "#070A18";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#F2C230";
      st.coins.forEach((c) => { ctx.beginPath(); ctx.arc(c.x, c.y, 7, 0, 7); ctx.fill(); });
      ctx.fillStyle = "#3ED97E";
      st.items.forEach((it) => { ctx.fillRect(it.x - 10, it.y - 10, 20, 20); });
      ctx.fillStyle = "#8A93A8";
      st.rocks.forEach((r) => { ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, 7); ctx.fill(); });
      ctx.fillStyle = "#FFD964";
      st.shots.forEach((s) => { ctx.fillRect(s.x - 2, s.y - 10, 4, 12); });
      // rocket
      ctx.fillStyle = "#F2C230";
      ctx.beginPath(); ctx.moveTo(st.rx, H - 78); ctx.lineTo(st.rx - 14, H - 40); ctx.lineTo(st.rx + 14, H - 40); ctx.closePath(); ctx.fill();
      if (st.shield > 0) { ctx.strokeStyle = "#2DD4BF"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(st.rx, H - 56, 30, 0, 7); ctx.stroke(); }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, goal, end]);

  const move = (e: React.PointerEvent) => {
    const st = stRef.current;
    const cv = canvasRef.current;
    if (!st || !cv) return;
    const r = cv.getBoundingClientRect();
    st.rx = Math.max(20, Math.min(380, ((e.clientX - r.left) / r.width) * 400));
  };

  return (
    <RoomShell game={game} subtitle="Shoot the asteroids. Reach the kill goal to win — EASY 20 → ×2, MEDIUM 35 → ×3, HARD 50 → ×4." stats={room.stats} history={room.history}>
      <div className="xg-controls">
        <StakeChips stake={stake} setStake={setStake} currency="cash" disabled={playing} />
        <div className="xg-pickrow" role="group" aria-label="Difficulty">
          {(["easy", "medium", "hard"] as RsDiff[]).map((d) => (
            <button key={d} type="button" className="xg-pick" aria-pressed={diff === d} onClick={() => setDiff(d)} disabled={playing}>
              <span className="xg-pick-txt">{d.toUpperCase()}<small>{RS_GOALS[d].kills} kills → ×{RS_GOALS[d].mult}</small></span>
            </button>
          ))}
        </div>
        <div className="rs-hud"><span>KILLS <b>{kills}/{goal.kills}</b></span><span>LIVES <b>{"♥".repeat(Math.max(0, lives))}</b></span><span>COINS <b>{coins}</b></span><span>{power}</span></div>
        <canvas ref={canvasRef} width={400} height={420} className="rs-canvas" onPointerMove={move} aria-label="Rocket Shooter — move to steer, auto-fire is on" />
        {!playing && <button className="btn btn-gold xg-action" type="button" onClick={start}>Launch · {fmtCash(stake)}</button>}
        <p className="bottle-msg xg-msg">{msg}</p>
      </div>
    </RoomShell>
  );
}

// ---------------- Fruit Ninja ----------------
const FN_GOALS = [{ score: 150, mult: 2 }, { score: 250, mult: 3 }, { score: 400, mult: 4 }];
export function FruitNinjaRoom({ game }: { game: GameDef }) {
  const room = useGameRoom(game);
  const [stake, setStake] = useState(5);
  const [playing, setPlaying] = useState(false);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [coins, setCoins] = useState(0);
  const [timeLeft, setTimeLeft] = useState(45);
  const [msg, setMsg] = useState("Slice the fruit, dodge the bombs. Score 150 → ×2, 250 → ×3, 400 → ×4 in 45 seconds.");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stRef = useRef<{ fruits: { x: number; y: number; vx: number; vy: number; kind: string; r: number }[]; speed: number } | null>(null);
  const rafRef = useRef(0);
  const scoreRef = useRef(0);
  const livesRef = useRef(3);

  const end = useCallback(async (finalScore: number) => {
    cancelAnimationFrame(rafRef.current);
    setPlaying(false);
    const tier = [...FN_GOALS].reverse().find((g) => finalScore >= g.score);
    const payout = tier ? Math.round(stake * tier.mult) : 0;
    setMsg(tier ? `Score ${finalScore} — ×${tier.mult}! ${payout} coins` : `Score ${finalScore} — under 150, no payout.`);
    await room.settle(stake, payout, { score: finalScore, mult: tier?.mult ?? 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stake, room]);

  const start = () => {
    if (room.balance < stake) { setMsg("Not enough coins."); return; }
    stRef.current = { fruits: [], speed: 1 };
    scoreRef.current = 0; livesRef.current = 3;
    setScore(0); setLives(3); setCoins(0); setTimeLeft(45); setPlaying(true);
  };

  useEffect(() => {
    if (!playing) return;
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const W = cv.width, H = cv.height;
    const t0 = Date.now();
    const loop = () => {
      const st = stRef.current;
      if (!st) return;
      const elapsed = (Date.now() - t0) / 1000;
      setTimeLeft(Math.max(0, Math.ceil(45 - elapsed)));
      if (elapsed >= 45) { void end(scoreRef.current); return; }
      if (Math.random() < 0.03 * st.speed) {
        const kinds = ["🍎", "🍊", "🍉", "🍇", "💣"];
        const kind = kinds[Math.floor(Math.random() * kinds.length)];
        st.fruits.push({ x: 30 + Math.random() * (W - 60), y: H + 20, vx: (Math.random() - 0.5) * 2, vy: -(7 + Math.random() * 3) * st.speed, kind, r: 22 });
      }
      st.fruits.forEach((f) => { f.x += f.vx; f.y += f.vy; f.vy += 0.18; });
      st.fruits = st.fruits.filter((f) => f.y < H + 40);
      ctx.fillStyle = "#0C2B22";
      ctx.fillRect(0, 0, W, H);
      ctx.font = "26px serif";
      ctx.textAlign = "center";
      st.fruits.forEach((f) => ctx.fillText(f.kind, f.x, f.y));
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, end]);

  const slice = (e: React.PointerEvent) => {
    const st = stRef.current;
    const cv = canvasRef.current;
    if (!st || !cv || !playing) return;
    const r = cv.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 400;
    const y = ((e.clientY - r.top) / r.height) * 420;
    for (const f of [...st.fruits]) {
      if (Math.hypot(f.x - x, f.y - y) < f.r + 14) {
        st.fruits = st.fruits.filter((v) => v !== f);
        if (f.kind === "💣") {
          livesRef.current--;
          setLives(livesRef.current);
          if (livesRef.current <= 0) { void end(scoreRef.current); return; }
        } else {
          scoreRef.current += 10;
          setScore(scoreRef.current);
          st.speed *= 1.02;
          if (Math.random() < 0.15) setCoins((n) => n + 1);
        }
      }
    }
  };

  return (
    <RoomShell game={game} subtitle="Slice the fruit, dodge the bombs. Score 150 → ×2, 250 → ×3, 400 → ×4 in 45 seconds." stats={room.stats} history={room.history}>
      <div className="xg-controls">
        <StakeChips stake={stake} setStake={setStake} currency="coins" disabled={playing} />
        <div className="rs-hud"><span>SCORE <b>{score}</b></span><span>LIVES <b>{"♥".repeat(Math.max(0, lives))}</b></span><span>COINS <b>{coins}</b></span><span>TIME <b>{timeLeft}s</b></span></div>
        <canvas ref={canvasRef} width={400} height={420} className="rs-canvas" onPointerMove={slice} onPointerDown={slice} aria-label="Fruit Ninja — drag across fruit to slice" />
        {!playing && <button className="btn btn-gold xg-action" type="button" onClick={start}>Start slicing · {stake} coins</button>}
        <p className="bottle-msg xg-msg">{msg}</p>
      </div>
    </RoomShell>
  );
}
