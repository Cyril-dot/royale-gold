// Round 18 — Balloon Burst. A fifth crash game on the SHARED server
// crash engine (POST /api/games/crash/round + GET /api/games/crash/reveal,
// same endpoints Car Crash uses) — the client only presents it: a gold
// balloon that inflates and climbs as the multiplier rises, and pops when
// the server round crashes. Tap the balloon to pump it (+0.05x a tap,
// max +0.50 total, 500ms cooldown) — the same bonus pattern Car Crash
// uses for coins / near-misses. Cash out before it pops.
// Ref: gamelabz/html5-game-balloon-pop (balloon visuals),
// akashmahlaz/aviator-crash (crash presentation).

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, fmtCash } from "../../lib/api";
import { GameDef } from "../../lib/games";
import { RoomShell, StakeChips, useGameRoom } from "./shared";

interface CarReveal { serverSeed: string; clientSeed: string; nonce: number; crashPoint: number; hash: string }

// --- Realistic canvas art: dusk sky, panelled balloon, woven basket ---
function drawSky(ctx: CanvasRenderingContext2D, W: number, H: number, clouds: { x: number; y: number; s: number; v: number }[]) {
  // Dusk gradient: deep indigo up top, warm horizon band, felt ground haze.
  const sky = ctx.createLinearGradient(0, 0, 0, H - 26);
  sky.addColorStop(0, "#0B1030");
  sky.addColorStop(0.5, "#1B2A52");
  sky.addColorStop(0.78, "#7A4A2B");
  sky.addColorStop(1, "#2A1E14");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H - 26);
  // Low sun with glow.
  const sunX = W - 62, sunY = H - 132;
  const glow = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 70);
  glow.addColorStop(0, "rgba(255,217,100,.85)");
  glow.addColorStop(0.4, "rgba(242,194,48,.35)");
  glow.addColorStop(1, "rgba(242,194,48,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(sunX - 70, sunY - 70, 140, 140);
  ctx.fillStyle = "#FFD964";
  ctx.beginPath(); ctx.arc(sunX, sunY, 15, 0, 7); ctx.fill();
  // Stars, only in the dark upper sky.
  ctx.fillStyle = "rgba(255,246,216,.85)";
  for (let i = 0; i < 16; i++) { const sx = (i * 53 + 11) % W, sy = (i * 37 + 7) % 110; ctx.globalAlpha = 0.35 + ((i * 7) % 10) / 16; ctx.fillRect(sx, sy, 2, 2); }
  ctx.globalAlpha = 1;
  // Clouds: soft triple-ellipse puffs, warm-lit underneath.
  clouds.forEach((c) => {
    c.x += c.v;
    if (c.x > W + 40) c.x = -40;
    const s = c.s;
    ctx.fillStyle = "rgba(255,246,216,.20)";
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, 26 * s, 10 * s, 0, 0, 7);
    ctx.ellipse(c.x - 16 * s, c.y + 4 * s, 16 * s, 7 * s, 0, 0, 7);
    ctx.ellipse(c.x + 16 * s, c.y + 4 * s, 16 * s, 7 * s, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = "rgba(255,180,120,.14)";
    ctx.beginPath(); ctx.ellipse(c.x, c.y + 6 * s, 24 * s, 5 * s, 0, 0, 7); ctx.fill();
  });
  // Distant hills.
  ctx.fillStyle = "#0A1F1A";
  ctx.beginPath();
  ctx.moveTo(0, H - 26);
  for (let x = 0; x <= W; x += 10) ctx.lineTo(x, H - 26 - 14 - 10 * Math.sin(x / 55));
  ctx.lineTo(W, H - 26);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#0C2B22";
  ctx.fillRect(0, H - 26, W, 26);
  ctx.fillStyle = "#F2C230";
  ctx.fillRect(0, H - 28, W, 2);
  ctx.fillStyle = "rgba(242,194,48,.25)";
  ctx.fillRect(0, H - 26, W, 1);
}

function drawBalloon(ctx: CanvasRenderingContext2D, cx: number, by: number, br: number, wob: number, flame: boolean) {
  const x = cx + wob;
  // Envelope: teardrop clipped into vertical gores with alternating
  // shades and seam lines, like a real hot-air balloon.
  const top = by - br * 1.12, bot = by + br * 1.05;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.bezierCurveTo(x + br * 0.95, top + br * 0.5, x + br, by + br * 0.4, x, bot);
  ctx.bezierCurveTo(x - br, by + br * 0.4, x - br * 0.95, top + br * 0.5, x, top);
  ctx.closePath();
  ctx.clip();
  const grad = ctx.createRadialGradient(x - br * 0.35, by - br * 0.4, br * 0.1, x, by, br * 1.25);
  grad.addColorStop(0, "#FFD964");
  grad.addColorStop(0.55, "#F2C230");
  grad.addColorStop(1, "#B8860B");
  ctx.fillStyle = grad;
  ctx.fillRect(x - br, top, br * 2, bot - top);
  // Alternating gore shading.
  for (let k = -2; k <= 2; k++) {
    if (k % 2 === 0) continue;
    ctx.fillStyle = "rgba(122,82,0,.16)";
    ctx.fillRect(x + k * br * 0.38 - br * 0.17, top, br * 0.34, bot - top);
  }
  // Gore seams.
  ctx.strokeStyle = "rgba(122,82,0,.55)";
  ctx.lineWidth = 1.2;
  for (let k = -2; k <= 2; k++) {
    if (k === 0) continue;
    ctx.beginPath();
    ctx.moveTo(x + k * br * 0.2, top + 2);
    ctx.bezierCurveTo(x + k * br * 0.42, by - br * 0.4, x + k * br * 0.42, by + br * 0.4, x + k * br * 0.14, bot - 2);
    ctx.stroke();
  }
  // Big soft highlight on the upper-left panel.
  ctx.fillStyle = "rgba(255,246,216,.5)";
  ctx.beginPath(); ctx.ellipse(x - br * 0.42, by - br * 0.45, br * 0.2, br * 0.34, -0.35, 0, 7); ctx.fill();
  ctx.restore();
  // Outline + knot.
  ctx.strokeStyle = "#7A5200";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.bezierCurveTo(x + br * 0.95, top + br * 0.5, x + br, by + br * 0.4, x, bot);
  ctx.bezierCurveTo(x - br, by + br * 0.4, x - br * 0.95, top + br * 0.5, x, top);
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = "#8A6D1B";
  ctx.beginPath(); ctx.moveTo(x - 7, bot); ctx.lineTo(x + 7, bot); ctx.lineTo(x, bot + 9); ctx.closePath(); ctx.fill();
  // Ropes to the basket.
  ctx.strokeStyle = "#C99612";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x - 5, bot + 7); ctx.lineTo(x - 11, bot + 24);
  ctx.moveTo(x + 5, bot + 7); ctx.lineTo(x + 11, bot + 24);
  ctx.moveTo(x, bot + 7); ctx.lineTo(x - 4, bot + 24);
  ctx.moveTo(x, bot + 7); ctx.lineTo(x + 4, bot + 24);
  ctx.stroke();
  // Burner flame while pumping.
  if (flame) {
    const fg = ctx.createRadialGradient(x, bot + 14, 1, x, bot + 14, 16);
    fg.addColorStop(0, "rgba(255,240,170,.95)");
    fg.addColorStop(0.5, "rgba(255,140,40,.75)");
    fg.addColorStop(1, "rgba(255,80,20,0)");
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.arc(x, bot + 14, 16, 0, 7); ctx.fill();
    ctx.fillStyle = "#FFD964";
    ctx.beginPath();
    ctx.moveTo(x, bot + 2);
    ctx.bezierCurveTo(x + 6, bot + 10, x + 4, bot + 18, x, bot + 22);
    ctx.bezierCurveTo(x - 4, bot + 18, x - 6, bot + 10, x, bot + 2);
    ctx.fill();
  }
  // Woven basket.
  const bx = x - 11, bw = 22, byy = bot + 24, bh = 13;
  const bg = ctx.createLinearGradient(bx, byy, bx, byy + bh);
  bg.addColorStop(0, "#A8822E");
  bg.addColorStop(1, "#6B4E12");
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.roundRect(bx, byy, bw, bh, 3); ctx.fill();
  ctx.strokeStyle = "rgba(60,40,0,.65)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(bx, byy + (bh / 4) * i); ctx.lineTo(bx + bw, byy + (bh / 4) * i); ctx.stroke(); }
  for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(bx + (bw / 5) * i, byy); ctx.lineTo(bx + (bw / 5) * i, byy + bh); ctx.stroke(); }
  ctx.fillStyle = "#C99612";
  ctx.beginPath(); ctx.roundRect(bx - 1.5, byy - 2, bw + 3, 4, 2); ctx.fill();
}

function drawPop(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  // Burst shards + a red POP star.
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const r1 = 18 + (i % 3) * 8, r2 = 42 + (i % 4) * 10;
    ctx.strokeStyle = i % 2 ? "#F2C230" : "#E5322D";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
    ctx.stroke();
  }
  ctx.fillStyle = "#E5322D";
  ctx.font = "900 30px Outfit, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("POP!", cx, cy + 10);
  ctx.fillStyle = "rgba(255,246,216,.9)";
  ctx.font = "900 30px Outfit, sans-serif";
  ctx.fillText("POP!", cx - 1.5, cy + 8.5);
}

export function BalloonBurstRoom({ game }: { game: GameDef }) {
  const room = useGameRoom(game);
  const [stake, setStake] = useState(10);
  const [playing, setPlaying] = useState(false);
  const [msg, setMsg] = useState("The balloon climbs as the multiplier grows — cash out before it pops. Tap the balloon to pump it (+0.05x a tap).");
  const [odds, setOdds] = useState(1);
  const [pumps, setPumps] = useState(0);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [reveal, setReveal] = useState<CarReveal | null>(null);
  const [popped, setPopped] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<{ t0: number; bonus: number; crashed: boolean; pumpAt: number } | null>(null);
  const rafRef = useRef(0);
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
    setMsg(`Cashed out at ×${odds.toFixed(2)} — ${fmtCash(payout)}! The balloon floats away.`);
    await room.settle(stake, payout, { odds }, roundIdRef.current || undefined);
    void revealAfterEnd();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, odds, stake, room, revealAfterEnd]);

  const crash = useCallback(async (rv?: CarReveal) => {
    const st = stateRef.current;
    if (!st) return;
    cancelAnimationFrame(rafRef.current);
    setPlaying(false);
    setPopped(true);
    if (rv !== undefined) {
      setReveal(rv);
      setOdds(rv.crashPoint);
      setMsg(`POP at ×${rv.crashPoint.toFixed(2)} — the server round burst. The stake is gone.`);
    } else {
      setMsg(`POP at ×${odds.toFixed(2)} — the stake is gone.`);
    }
    await room.settle(stake, 0, { odds: rv?.crashPoint ?? odds, crashed: true }, roundIdRef.current || undefined);
    if (!rv) void revealAfterEnd();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [odds, stake, room, revealAfterEnd]);

  const start = async () => {
    if (room.balance < stake) { setMsg("Balance too low for that stake."); return; }
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
    setPopped(false);
    setCountdown(6);
    stateRef.current = { t0: startsAt, bonus: 0, crashed: false, pumpAt: 0 };
    setOdds(1); setPumps(0); setPlaying(true);
    setMsg("The balloon is inflating — launching in a few seconds. Tap it to pump it, then cash out before it pops.");
  };

  const pump = () => {
    const st = stateRef.current;
    if (!st || !playing) return;
    const now = Date.now();
    if (now - st.pumpAt < 500) return;
    if (st.bonus >= 0.5) { setMsg("The balloon is pumped full — cash out while you can!"); return; }
    st.pumpAt = now;
    st.bonus = Math.round((st.bonus + 0.05) * 100) / 100;
    setPumps((n) => n + 1);
  };

  // Draw loop: the balloon inflates and climbs with the odds.
  useEffect(() => {
    if (!playing) return;
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const W = cv.width, H = cv.height;
    const clouds = Array.from({ length: 5 }, (_, i) => ({ x: Math.random() * W, y: 30 + Math.random() * 140, s: 0.4 + Math.random() * 0.8, v: 0.2 + Math.random() * 0.3 }));
    const loop = () => {
      const st = stateRef.current;
      if (!st) return;
      // The server round starts 6s in the future (startsAt = now + 6000):
      // clamp the elapsed time at 0 so the odds never read below ×1.00
      // and the balloon stays grounded until launch.
      const elapsedMs = Math.max(0, Date.now() - st.t0);
      setCountdown(Math.max(0, Math.ceil((st.t0 - Date.now()) / 1000)));
      const o = Math.min(50, Math.exp(0.00006 * elapsedMs) + st.bonus);
      setOdds(Math.round(o * 100) / 100);
      if (o >= 50) { void crash(); return; }
      // Balloon: climbs as the multiplier climbs, inflates with it.
      const t = Math.min(1, (o - 1) / 9);
      const by = H - 70 - t * (H - 170);
      const br = 26 + Math.min(26, o * 1.4);
      const wob = Math.sin(Date.now() / 300) * 3;
      drawSky(ctx, W, H, clouds);
      const flame = Date.now() - st.pumpAt < 350 && st.pumpAt > 0;
      drawBalloon(ctx, 150, by, br, wob, flame);
      // Multiplier badge on the envelope.
      ctx.fillStyle = "rgba(7,8,18,.55)";
      ctx.beginPath(); ctx.roundRect(150 + wob - 34, by - 11, 68, 22, 11); ctx.fill();
      ctx.fillStyle = "#FFF6D8";
      ctx.font = "900 15px Outfit, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`×${o.toFixed(2)}`, 150 + wob, by + 5);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, crash]);

  // Pre-start: draw the balloon resting on the ground.
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const W = 300, H = 420;
    const clouds = [
      { x: 40, y: 60, s: 0.8, v: 0 }, { x: 200, y: 100, s: 0.6, v: 0 }, { x: 120, y: 150, s: 1, v: 0 },
      { x: 260, y: 50, s: 0.5, v: 0 }, { x: 80, y: 200, s: 0.7, v: 0 },
    ];
    drawSky(ctx, W, H, clouds);
    if (popped) {
      drawPop(ctx, 150, 200);
    } else {
      drawBalloon(ctx, 150, 320, 26, 0, false);
    }
  }, [popped]);

  // Server crash: long-poll the reveal while the balloon climbs.
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

  return (
    <RoomShell game={game} subtitle="A gold balloon climbs as the multiplier grows — cash out before it pops. Tap the balloon to pump it (+0.05x a tap, max +0.50x)." stats={room.stats} history={room.history}>
      <div className="xg-controls">
        <StakeChips stake={stake} setStake={setStake} currency="cash" disabled={playing} />
        <div className="v18-stage">
          <div className="v18-hud"><span>ODDS <b>×{odds.toFixed(2)}</b></span><span>PUMPS <b>{pumps}</b></span><span>CASH OUT <b>{fmtCash(Math.round(stake * odds * 100) / 100)}</b></span></div>
          <canvas ref={canvasRef} width={300} height={420} className="v18-canvas" aria-label="Balloon Burst sky" onPointerDown={pump} />
          <p className="v18-aim">Tap the balloon to pump it · cash out before it pops</p>
        </div>
        {!playing && <button className="btn btn-gold xg-action" type="button" onClick={() => void start()}>Launch the balloon · {fmtCash(stake)}</button>}
        {playing && <button className="btn btn-gold xg-action" type="button" onClick={() => void cashOut()} disabled={countdown > 0}>{countdown > 0 ? `Launching in ${countdown}s…` : `CASH OUT · ${fmtCash(Math.round(stake * odds * 100) / 100)}`}</button>}
        <p className="bottle-msg xg-msg">{msg}</p>
        {reveal && (
          <div className="cr-reveal" aria-label="Provably fair reveal">
            <h4>Provably fair — round revealed</h4>
            <p>Crash point <b>×{reveal.crashPoint.toFixed(2)}</b> · hash <code>{reveal.hash.slice(0, 16)}…</code></p>
            <p>Server seed <code>{reveal.serverSeed.slice(0, 12)}…</code> · client <code>{reveal.clientSeed.slice(0, 12)}…</code> · nonce {reveal.nonce}</p>
          </div>
        )}
      </div>
    </RoomShell>
  );
}
