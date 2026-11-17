// Crash engine — shared by Aviator Gold and Jet Fly.
// Round comes from POST /api/games/crash/round (server-issued, hash
// commitment). Growth = exp(0.00006 * elapsedMs) since the server's
// startsAt; display/cash-out cap ×50. The crash point is the SERVER's:
// the client never draws one. While the round flies it polls
// GET /api/games/crash/reveal?roundId= — the server refuses (403) until
// the curve has reached the point, then returns the server seed, nonce
// and point, and the round crashes at exactly that point. The clients
// long-poll the reveal (?waitMs=25000) so a flying round costs a couple
// of 200s, never a 403 in the console. The reveal panel shows the seed
// so SHA-256(serverSeed) can be checked against the hash issued at
// round start. Cash-outs settle through
// /api/games/settle with the stopped multiplier; the server re-checks
// it against the stored crash point (see src/lib/settle.ts).

"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, fmtMoney } from "../../lib/api";
import { GameDef } from "../../lib/games";
import { playSfx, useStore } from "../../lib/store";
import type { CrashSceneState } from "../../lib/three/crash";
import { RoomShell, StakeChips, useGameRoom } from "./shared";

// Crash 3D scene (restored from the v48 artifact): client-only, so the
// Three.js scene never renders on the server. Aviator gets the Crash
// scene (red plane), Jet Fly gets the Jet scene (SAFE box + holding
// pattern). The 2D canvas stays as the no-WebGL fallback.
const CrashScene3D = dynamic(() => import("../three/CrashScene3D"), { ssr: false });

const GROWTH = 0.00006;
const DISPLAY_CAP = 50;

function multAt(elapsedMs: number) {
  return Math.exp(GROWTH * elapsedMs);
}

interface Bet { stake: number; auto: number | null; cashed: boolean; payout: number }

interface Reveal { serverSeed: string; clientSeed: string; nonce: number; crashPoint: number; hash: string }

const FAKE_NAMES = ["Kwame", "Ama", "Kofi", "Efua", "Yaw", "Adwoa", "Selasi", "Nana", "Akosua", "Mensah"];

/** Drawn craft for the 2D fallback canvas — a proper side-view plane
 *  (Aviator) or jet (Jet Fly), nose to the right, origin at its centre.
 *  `spin` drives the prop / flame flicker. No text glyphs: the old
 *  "➤"/"▲" markers are gone. */
function drawCraft(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  skin: "aviator" | "jet",
  spin: number,
  scale = 1,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  if (skin === "jet") {
    // Afterburner flame (flickers with spin)
    const fl = 13 + Math.sin(spin * 6) * 3;
    const fg = ctx.createLinearGradient(-14, 0, -14 - fl, 0);
    fg.addColorStop(0, "rgba(255,158,44,.95)");
    fg.addColorStop(1, "rgba(255,80,20,0)");
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(-14, -3);
    ctx.lineTo(-14 - fl, 0);
    ctx.lineTo(-14, 3);
    ctx.closePath();
    ctx.fill();
    // Fuselage: shaded metal — bright spine, darker belly.
    const fg2 = ctx.createLinearGradient(0, -5.5, 0, 5.5);
    fg2.addColorStop(0, "#F2F6FF");
    fg2.addColorStop(0.45, "#C7D2E8");
    fg2.addColorStop(1, "#5A6E96");
    ctx.fillStyle = fg2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 20, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Nose
    const ng = ctx.createLinearGradient(12, -5, 24, 0);
    ng.addColorStop(0, "#3D7BD1");
    ng.addColorStop(1, "#1D4E8F");
    ctx.fillStyle = ng;
    ctx.beginPath();
    ctx.moveTo(12, -5);
    ctx.quadraticCurveTo(24, 0, 12, 5);
    ctx.closePath();
    ctx.fill();
    // Gold stripe
    const sg = ctx.createLinearGradient(0, -1.2, 0, 1.2);
    sg.addColorStop(0, "#FFE89A");
    sg.addColorStop(1, "#C99612");
    ctx.fillStyle = sg;
    ctx.fillRect(-14, -1.2, 26, 2.4);
    // Swept wings (near + far) — shaded blue with a bright leading edge.
    const wg = ctx.createLinearGradient(0, -13, 0, 13);
    wg.addColorStop(0, "#4A86D8");
    wg.addColorStop(1, "#1D4E8F");
    ctx.fillStyle = wg;
    ctx.beginPath();
    ctx.moveTo(-2, -2); ctx.lineTo(-12, -13); ctx.lineTo(-6, -13); ctx.lineTo(4, -3);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-2, 2); ctx.lineTo(-12, 13); ctx.lineTo(-6, 13); ctx.lineTo(4, 3);
    ctx.closePath();
    ctx.fill();
    // Tail fin
    ctx.beginPath();
    ctx.moveTo(-18, 0); ctx.lineTo(-24, -9); ctx.lineTo(-19, -9); ctx.lineTo(-14, 0);
    ctx.closePath();
    ctx.fill();
    // Cockpit: glass with a radial glare.
    const cg = ctx.createRadialGradient(6, -4, 0.5, 8, -2.5, 6);
    cg.addColorStop(0, "#E8F6FF");
    cg.addColorStop(0.6, "#8FD0FF");
    cg.addColorStop(1, "#3D7BD1");
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.ellipse(8, -2.5, 5, 2.6, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.85)";
    ctx.beginPath();
    ctx.ellipse(6.5, -3.6, 1.8, 1, -0.3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Spinning prop (blur cross)
    ctx.save();
    ctx.translate(23, 0);
    ctx.rotate(spin);
    ctx.strokeStyle = "rgba(20,33,61,.55)";
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(0, 11); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(11, 0); ctx.stroke();
    ctx.restore();
    // Fuselage: shaded red — bright spine, darker belly.
    const afg = ctx.createLinearGradient(0, -6, 0, 6);
    afg.addColorStop(0, "#FF8A7A");
    afg.addColorStop(0.45, "#E5322D");
    afg.addColorStop(1, "#7A0F0B");
    ctx.fillStyle = afg;
    ctx.beginPath();
    ctx.ellipse(0, 0, 20, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    // Gold nose cone
    const ang2 = ctx.createLinearGradient(14, -5.5, 24, 0);
    ang2.addColorStop(0, "#FFE89A");
    ang2.addColorStop(1, "#C99612");
    ctx.fillStyle = ang2;
    ctx.beginPath();
    ctx.moveTo(14, -5.5);
    ctx.quadraticCurveTo(24, 0, 14, 5.5);
    ctx.closePath();
    ctx.fill();
    // Main wings (near + far) — shaded red with a bright leading edge.
    const awg = ctx.createLinearGradient(0, -14, 0, 14);
    awg.addColorStop(0, "#D84034");
    awg.addColorStop(1, "#8F1712");
    ctx.fillStyle = awg;
    ctx.beginPath();
    ctx.moveTo(-2, -3); ctx.lineTo(-8, -14); ctx.lineTo(-2, -14); ctx.lineTo(5, -3);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-2, 3); ctx.lineTo(-8, 14); ctx.lineTo(-2, 14); ctx.lineTo(5, 3);
    ctx.closePath();
    ctx.fill();
    // Tail fin
    ctx.beginPath();
    ctx.moveTo(-18, -2); ctx.lineTo(-24, -11); ctx.lineTo(-18, -11); ctx.lineTo(-14, -2);
    ctx.closePath();
    ctx.fill();
    // Cockpit window: glass with a glare.
    const acg = ctx.createRadialGradient(4, -5, 0.5, 6, -3, 6);
    acg.addColorStop(0, "#FFFFFF");
    acg.addColorStop(0.6, "#BFE3FF");
    acg.addColorStop(1, "#5E93B8");
    ctx.fillStyle = acg;
    ctx.beginPath();
    ctx.ellipse(6, -3, 5.5, 3, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.85)";
    ctx.beginPath();
    ctx.ellipse(4.5, -4.2, 1.8, 1, -0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export default function CrashRoom({ game, skin }: { game: GameDef; skin: "aviator" | "jet" }) {
  const room = useGameRoom(game);
  const { user, mode } = useStore();
  const [stake, setStake] = useState(10);
  const [auto, setAuto] = useState<number | null>(null);
  const [phase, setPhase] = useState<"idle" | "waiting" | "running" | "crashed">("idle");
  const [countdown, setCountdown] = useState(0);
  const [mult, setMult] = useState(1);
  const [crashPoint, setCrashPoint] = useState<number | null>(null);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [hash, setHash] = useState("");
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [bets, setBets] = useState<Bet[]>([]);
  const [feed, setFeed] = useState<{ name: string; stake: number; mult: number; won: boolean }[]>([]);
  const [history, setHistory] = useState<number[]>([]);
  const [msg, setMsg] = useState("Place your bet — the next round starts soon.");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const startRef = useRef(0); // server startsAt (epoch ms) — the curve anchor
  // 3D scene state (mutable ref, read by the scene's own rAF loop — no
  // React re-render per frame). vehT0 is in the performance.now()
  // domain: the moment the current vehState began.
  const sceneStateRef = useRef<CrashSceneState>({ mult: 1, elapsed: 0, phase: "idle", vehState: "idle", vehT0: 0 });
  const cashT0Ref = useRef(0); // performance.now() of the first cash-out this round (0 = none)
  const [has3d, setHas3d] = useState(false);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const betsRef = useRef(bets);
  betsRef.current = bets;
  const roundIdRef = useRef<string | null>(null);
  roundIdRef.current = roundId;
  const revealRef = useRef<Reveal | null>(null);
  revealRef.current = reveal;

  const doCrash = useCallback(async (rv: Reveal) => {
    if (phaseRef.current === "crashed") return;
    playSfx("boom", room.muted);
    setReveal(rv);
    setCrashPoint(rv.crashPoint);
    setMult(rv.crashPoint);
    setPhase("crashed");
    // 3D: freeze the curve at the crash point; the vehicle falls
    // (Aviator) or levels into its holding pattern (Jet Fly).
    sceneStateRef.current = {
      mult: rv.crashPoint,
      elapsed: (Date.now() - startRef.current) / 1000,
      phase: "crashed",
      vehState: skin === "jet" ? "away" : "crash",
      vehT0: performance.now(),
    };
    setHistory((h) => [Math.round(rv.crashPoint * 100) / 100, ...h].slice(0, 12));
    setMsg(`Crashed at ×${rv.crashPoint.toFixed(2)} — server seed revealed below.`);
    const losers = betsRef.current.filter((b) => !b.cashed);
    if (losers.length) {
      void Promise.all(losers.map((b) => room.settle(b.stake, 0, { crash: rv.crashPoint }, roundIdRef.current || undefined)));
    }
    setBets([]);
    setTimeout(() => void newRound(), 5000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  // Poll the reveal endpoint with a long-poll (?waitMs=25000): the
  // server holds the request until the round finishes, so a flying
  // round costs a couple of 200s instead of a 403 every few hundred ms.
  // A plain GET (no waitMs) still 403s a live round — see the route.
  const pollReveal = useCallback(async (): Promise<Reveal | null> => {
    const id = roundIdRef.current;
    if (!id) return null;
    try {
      const res = await fetch(`/api/games/crash/reveal?roundId=${encodeURIComponent(id)}&waitMs=25000`);
      if (!res.ok) return null;
      const data = await res.json();
      if (data.finished === false) return null;
      return data as Reveal;
    } catch {
      return null;
    }
  }, []);

  const newRound = useCallback(async () => {
    if (!user) { setMsg("Log in to play crash."); return; }
    try {
      const r = await api<{ roundId: string; hash: string; startsAt: number }>("/api/games/crash/round", { method: "POST" });
      setRoundId(r.roundId);
      setHash(r.hash.slice(0, 16) + "…");
      setCrashPoint(null);
      setReveal(null);
      setPhase("waiting");
      setMult(1);
      setBets([]);
      cashT0Ref.current = 0;
      sceneStateRef.current = { mult: 1, elapsed: 0, phase: "waiting", vehState: "idle", vehT0: 0 };
      setMsg("Betting open — round takes off soon.");
      const waitMs = Math.max(500, r.startsAt - Date.now());
      setCountdown(Math.ceil(waitMs / 1000));
      startRef.current = r.startsAt;
    } catch {
      setMsg("Could not start a server round — check your connection and try again.");
    }
  }, [user]);

  // Countdown + run loop
  useEffect(() => {
    if (phase !== "waiting" && phase !== "running") return;
    const iv = setInterval(() => {
      if (phaseRef.current === "waiting") {
        const left = Math.max(0, Math.ceil((startRef.current - Date.now()) / 1000));
        setCountdown(left);
        if (left <= 0) setPhase("running");
      }
    }, 100);
    return () => clearInterval(iv);
  }, [phase]);

  // Flying: animate the shared curve; the round ends when the server
  // reveal succeeds — that instant IS the server's crash point. The
  // reveal is long-polled sequentially (one request at a time).
  useEffect(() => {
    if (phase !== "running") return;
    let stopped = false;
    (async () => {
      while (!stopped && phaseRef.current === "running") {
        const rv = await pollReveal();
        if (rv) { void doCrash(rv); return; }
      }
    })();
    const loop = () => {
      if (phaseRef.current !== "running") return;
      const elapsed = Date.now() - startRef.current;
      const m = multAt(elapsed);
      setMult(m);
      // 3D: drive the vehicle from the live multiplier. A cashed bet
      // lifts the plane (Aviator only — Jet Fly has no cash state and
      // keeps flying after a cash-out, as in the artifact).
      const cashedAny = betsRef.current.some((b) => b.cashed);
      sceneStateRef.current = {
        mult: m,
        elapsed: elapsed / 1000,
        phase: "running",
        vehState: skin === "aviator" && cashedAny ? "cash" : "fly",
        vehT0: cashT0Ref.current,
      };
      // Auto cash-out
      const active = betsRef.current.find((b) => !b.cashed);
      if (active && active.auto && m >= active.auto) void cashOut(active);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { stopped = true; cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // If a crash was detected but the reveal had not landed yet (clock
  // skew), keep long-polling until the seed + point arrive.
  useEffect(() => {
    if (phase !== "crashed" || reveal) return;
    let stopped = false;
    (async () => {
      while (!stopped) {
        const rv = await pollReveal();
        if (rv) { setReveal(rv); setCrashPoint(rv.crashPoint); setMult(rv.crashPoint); return; }
      }
    })();
    return () => { stopped = true; };
  }, [phase, reveal, pollReveal]);

  // Fake live-bets feed per round (v48 genFakes behaviour)
  useEffect(() => {
    if (phase !== "running") return;
    const iv = setInterval(() => {
      const name = FAKE_NAMES[Math.floor(Math.random() * FAKE_NAMES.length)];
      const stake = [1, 5, 10, 25, 50][Math.floor(Math.random() * 5)];
      const m = Math.round((1 + Math.random() * 4) * 100) / 100;
      setFeed((f) => [{ name, stake, mult: m, won: Math.random() > 0.4 }, ...f].slice(0, 8));
    }, 2500);
    return () => clearInterval(iv);
  }, [phase]);

  // 2D fallback — Aviator-style flight scene (no-WebGL only; the 3D
  // scene hides this canvas when it initialises). Same exponential
  // curve as the 3D scene — mult = exp(GROWTH * elapsedMs) — so the
  // 2D and 3D flights agree exactly: altitude grid with × labels, a
  // runway the craft rolls on, a glowing curve with a filled area,
  // a drawn plane/jet banked to the curve tangent, a fading trail,
  // and a crash pose (plane dives + smoke / jet climbs away).
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = cv.clientWidth || 640;
    const ch = cv.clientHeight || 260;
    const bw = Math.round(cw * dpr);
    const bh = Math.round(ch * dpr);
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = cw, H = ch;
    ctx.clearRect(0, 0, W, H);
    const padL = 46, padR = 16, padT = 16, padB = 26;
    const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
    const m = Math.max(1, mult);
    const elapsed = Math.log(m) / GROWTH / 1000; // seconds since takeoff
    const span = Math.max(10, elapsed * 1.15);
    const maxLog = Math.log(Math.max(m * 1.35, 2.2));
    const pt = (t: number): [number, number] => {
      const x = x0 + (x1 - x0) * (t / span);
      const y = y1 - (y1 - y0) * ((GROWTH * t * 1000) / maxLog);
      return [x, Math.max(y, y0 - 2)];
    };
    // Dusk sky behind the chart: deep navy overhead warming to amber
    // at the horizon, a glowing moon, fixed stars, and slow-drifting
    // clouds (drift keyed to elapsed, so the sky is stable frame to
    // frame). The grid + curve draw over it.
    const sky = ctx.createLinearGradient(0, 0, 0, y1);
    sky.addColorStop(0, "#0A1230");
    sky.addColorStop(0.55, "#1B2A5E");
    sky.addColorStop(0.82, "#5A3A6E");
    sky.addColorStop(1, "#C97A2E");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, y1);
    ctx.fillStyle = "rgba(255,246,216,.8)";
    for (let s = 0; s < 26; s++) {
      const sx = ((s * 97.3) % 100) / 100 * W;
      const sy = ((s * 57.7) % 100) / 100 * y1 * 0.55;
      const sr = 0.6 + ((s * 13) % 10) / 10 * 1.1;
      ctx.globalAlpha = 0.35 + ((s * 7) % 10) / 10 * 0.55;
      ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const mg = ctx.createRadialGradient(W - 62, 32, 3, W - 62, 32, 44);
    mg.addColorStop(0, "rgba(255,246,216,.85)");
    mg.addColorStop(0.35, "rgba(255,232,154,.28)");
    mg.addColorStop(1, "rgba(255,232,154,0)");
    ctx.fillStyle = mg;
    ctx.beginPath(); ctx.arc(W - 62, 32, 44, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#FFF6D8";
    ctx.beginPath(); ctx.arc(W - 62, 32, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(180,160,110,.5)";
    ctx.beginPath(); ctx.arc(W - 66, 29, 2.5, 0, Math.PI * 2); ctx.arc(W - 58, 36, 1.8, 0, Math.PI * 2); ctx.fill();
    const cloud = (cx: number, cy: number, s: number, a: number) => {
      const cg2 = ctx.createRadialGradient(cx, cy, 1, cx, cy, 34 * s);
      cg2.addColorStop(0, `rgba(255,235,210,${a})`);
      cg2.addColorStop(1, "rgba(255,235,210,0)");
      ctx.fillStyle = cg2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 34 * s, 11 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    const drift = (elapsed * 9) % (W + 220);
    cloud(W * 0.3 - drift + 110, y1 * 0.3, 1.1, 0.16);
    cloud(W * 0.75 - drift + 110, y1 * 0.18, 0.9, 0.13);
    cloud(W * 0.55 + drift - 110, y1 * 0.5, 1.3, 0.1);
    // Altitude grid + × labels (left axis)
    ctx.font = "600 10px Outfit, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    [1, 2, 3, 5, 10, 20, 50].forEach((gm) => {
      const gy = y1 - (y1 - y0) * (Math.log(gm) / maxLog);
      if (gy < y0 - 1 || gy > y1) return;
      ctx.strokeStyle = "rgba(255,246,216,.08)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, gy); ctx.lineTo(x1, gy); ctx.stroke();
      ctx.fillStyle = "rgba(255,246,216,.45)";
      ctx.fillText(`×${gm}`, x0 - 6, gy);
    });
    for (let i = 1; i < 8; i++) {
      const gx = x0 + ((x1 - x0) * i) / 8;
      ctx.strokeStyle = "rgba(255,246,216,.05)";
      ctx.beginPath(); ctx.moveTo(gx, y0); ctx.lineTo(gx, y1); ctx.stroke();
    }
    // Runway strip along the bottom
    ctx.fillStyle = "#0A0F24";
    ctx.fillRect(0, y1, W, H - y1);
    ctx.strokeStyle = "rgba(242,194,48,.55)";
    ctx.setLineDash([8, 8]);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, y1 + (H - y1) / 2); ctx.lineTo(W, y1 + (H - y1) / 2); ctx.stroke();
    ctx.setLineDash([]);
    // Flight curve (glowing stroke + filled area under it)
    const N = 120;
    const pts: [number, number][] = [];
    for (let i = 0; i <= N; i++) pts.push(pt((elapsed * i) / N));
    if (elapsed > 0.02) {
      const grad = ctx.createLinearGradient(x0, 0, x1, 0);
      grad.addColorStop(0, "#F2C230");
      grad.addColorStop(1, "#FFE9A8");
      ctx.save();
      ctx.shadowColor = "rgba(242,194,48,.8)";
      ctx.shadowBlur = 14;
      ctx.strokeStyle = grad;
      ctx.lineWidth = 3;
      ctx.lineJoin = "round";
      ctx.beginPath();
      pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
      ctx.stroke();
      ctx.restore();
      const fill = ctx.createLinearGradient(0, y0, 0, y1);
      fill.addColorStop(0, "rgba(242,194,48,.20)");
      fill.addColorStop(1, "rgba(242,194,48,0)");
      ctx.fillStyle = fill;
      ctx.beginPath();
      pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
      ctx.lineTo(pts[N][0], y1);
      ctx.lineTo(pts[0][0], y1);
      ctx.closePath();
      ctx.fill();
      // Fading trail dots behind the craft
      for (let k = 1; k <= 18; k++) {
        const p = pts[Math.max(0, N - k)];
        const f = 1 - k / 18;
        ctx.fillStyle = `rgba(255,217,100,${(0.7 * f).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(p[0], p[1], 1 + 2.4 * f, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const head = pt(elapsed);
    const prev = pt(Math.max(0, elapsed - 0.4));
    const ang = Math.max(-0.15, Math.min(0.6, Math.atan2(head[1] - prev[1], head[0] - prev[0])));
    const spin = phase === "running" ? performance.now() / 90 : countdown * 1.3;
    if (phase === "crashed") {
      if (skin === "jet") {
        // Flew away: climbing steeply off the curve head, smaller
        drawCraft(ctx, head[0] + 14, head[1] - 12, ang + 0.3, "jet", spin, 0.85);
      } else {
        // Crashed: nose-down dive below the curve head + smoke puffs
        drawCraft(ctx, head[0], head[1] + 16, ang - 1.0, "aviator", spin, 0.95);
        for (let s2 = 0; s2 < 3; s2++) {
          ctx.fillStyle = `rgba(200,200,210,${0.35 - s2 * 0.1})`;
          ctx.beginPath();
          ctx.arc(head[0] - 18 - s2 * 14, head[1] - 6 - s2 * 8, 7 + s2 * 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (phase === "running") {
      drawCraft(ctx, head[0], head[1], ang, skin, spin);
    } else {
      // Parked on the runway: takeoff roll position, gentle bob
      const bob = Math.sin(performance.now() / 480) * 1.5;
      drawCraft(ctx, x0 + 26, y1 - 4 + bob, 0, skin, spin);
    }
  }, [mult, phase, crashPoint, skin, countdown]);

  const placeBet = (panel: number) => {
    if (phase !== "waiting") { setMsg("Wait for the next round to bet."); return; }
    if (bets.length >= (skin === "jet" ? 2 : 1)) return;
    if (room.balance < stake) { setMsg("Not enough balance for that stake."); return; }
    setBets((b) => [...b, { stake, auto, cashed: false, payout: 0 }]);
    setMsg(`Bet placed — GH₵ ${stake}. Good luck.`);
  };

  const cashOut = useCallback(async (bet: Bet) => {
    // Never above the server's crash point: while the round is live the
    // curve is below it, and the server re-checks on settle anyway.
    const m = Math.min(multAt(Date.now() - startRef.current), DISPLAY_CAP);
    const payout = Math.round(bet.stake * m * 100) / 100;
    playSfx("blip", room.muted);
    // 3D: the first cash-out of the round starts the cash lift.
    if (!cashT0Ref.current) cashT0Ref.current = performance.now();
    setBets((bs) => bs.map((b) => (b === bet ? { ...b, cashed: true, payout } : b)));
    await room.settle(bet.stake, payout, { cashout: m }, roundId || undefined);
    setMsg(`Cashed out at ×${m.toFixed(2)} — ${fmtMoney(payout, room.user?.currency ?? "GHS")}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, roundId]);

  const activeBet = bets.find((b) => !b.cashed);
  const cashedAny = bets.some((b) => b.cashed);
  const dispMult = Math.min(mult, DISPLAY_CAP);
  const multLabel =
    phase === "crashed"
      ? skin === "jet" ? "FLEW AWAY" : "CRASHED"
      : phase === "running"
        ? cashedAny ? "CASHED OUT" : "FLYING"
        : phase === "waiting"
          ? "PLACE YOUR BETS"
          : "READY FOR TAKEOFF";

  return (
    <RoomShell game={game} subtitle={skin === "jet" ? "Jet Fly — proper Aviator: 5-second betting window, dual bets, auto cash-out, live feed." : "Aviator Gold — watch the multiplier climb and cash out before it crashes. Display cap ×50."} stats={room.stats} history={room.history}>
      <div className={`cr-stage cr-stage--${skin}${has3d ? " has-3d" : ""}${phase === "crashed" ? " is-crashed" : ""}`}>
        <div className={`cr-mult${phase === "crashed" ? " crashed" : ""}${cashedAny && phase !== "crashed" ? " cashed" : ""}${phase === "running" ? " flying" : ""}`}><b>×{dispMult.toFixed(2)}</b><span>{multLabel}</span></div>
        {phase === "crashed" && <div className="cr-flash on" aria-hidden="true" />}
        {phase === "crashed" && (
          <div className={skin === "jet" ? "jf-flew" : "cr-flew"} aria-hidden="true">
            {skin === "jet" ? "FLEW AWAY" : "CRASHED"}<b>×{(crashPoint ?? 1).toFixed(2)}</b>
          </div>
        )}
        <CrashScene3D skin={skin} stateRef={sceneStateRef} onReady={setHas3d} />
        <canvas ref={canvasRef} width={640} height={260} className="cr-canvas" aria-label="Crash multiplier chart" />
      </div>
      {/* Round status + provably-fair line sit BELOW the stage: inside it
          the in-flow hash ran under the multiplier, and the status text
          was clipped to an 8px bar by the old progress-bar styling. */}
      <div className="cr-meta">
        <div className="cr-hash">Provably fair · hash {hash || "—"} · round {roundId ? roundId.slice(0, 8) : "—"}</div>
        <div className="cr-count">{phase === "waiting" ? `Takes off in ${countdown}s` : phase === "running" ? "Flying…" : phase === "crashed" ? "Crashed" : "Press Start round"}</div>
      </div>
      <div className="xg-controls">
        <StakeChips stake={stake} setStake={setStake} currency="cash" disabled={phase === "running"} />
        <label className="auto-cash">Auto cash-out ×
          <input type="number" min={1.1} step={0.1} value={auto ?? ""} placeholder="—" onChange={(e) => setAuto(e.target.value ? Number(e.target.value) : null)} />
        </label>
        {phase === "idle" && <button className="btn btn-gold xg-action" type="button" onClick={() => void newRound()}>Start round</button>}
        {phase === "waiting" && (
          <button className="btn btn-gold xg-action" type="button" onClick={() => placeBet(0)}>
            Place bet · {fmtMoney(stake, room.user?.currency ?? "GHS")} {skin === "jet" && bets.length === 1 ? "(2nd panel)" : ""}
          </button>
        )}
        {phase === "running" && activeBet && (
          <button className="btn btn-gold xg-action cr-cash" type="button" onClick={() => void cashOut(activeBet)}>
            CASH OUT · {fmtMoney(Math.round(activeBet.stake * dispMult * 100) / 100, room.user?.currency ?? "GHS")}
          </button>
        )}
        {phase === "running" && !activeBet && <button className="btn btn-ghost xg-action" type="button" disabled>Watching — no active bet</button>}
        <p className="xg-msg">{msg}</p>
        {bets.length > 0 && <p className="xg-msg">Active bets: {bets.map((b) => `${fmtMoney(b.stake, room.user?.currency ?? "GHS")}${b.cashed ? ` → cashed ${fmtMoney(b.payout, room.user?.currency ?? "GHS")}` : b.auto ? ` (auto ×${b.auto})` : ""}`).join(" · ")}</p>}
      </div>
      {phase === "crashed" && (
        <div className="cr-reveal" aria-label="Provably fair reveal">
          <h4>Provably fair — round revealed</h4>
          {reveal ? (
            <>
              <p>Crashed at <b>×{reveal.crashPoint.toFixed(2)}</b>. Check it: SHA-256 of the server seed below must equal the hash shown when the round started.</p>
              <dl>
                <div><dt>Server seed</dt><dd><code>{reveal.serverSeed}</code></dd></div>
                <div><dt>Client seed</dt><dd><code>{reveal.clientSeed}</code></dd></div>
                <div><dt>Nonce</dt><dd><code>{reveal.nonce}</code></dd></div>
                <div><dt>Crash point</dt><dd><code>×{reveal.crashPoint.toFixed(2)}</code></dd></div>
              </dl>
            </>
          ) : (
            <p>Fetching the server seed…</p>
          )}
        </div>
      )}
      {skin === "jet" && (
        <>
          <div className="jf-feed" aria-label="Live bets feed">
            <h4>Live bets</h4>
            {feed.length === 0 ? <p className="bh-empty">Bets will appear here once the round is flying.</p> : feed.map((f, i) => (
              <div key={i} className="jf-feed-row"><span>{f.name}</span><span>{fmtMoney(f.stake, room.user?.currency ?? "GHS")}</span><span>×{f.mult.toFixed(2)}</span><span className={f.won ? "win" : "lose"}>{f.won ? "won" : "lost"}</span></div>
            ))}
          </div>
          <div className="xg-history"><span className="bh-lab">ROUND HISTORY</span>{history.length === 0 ? <span className="bh-empty">No rounds yet.</span> : history.map((h, i) => <span key={i} className={`bh-item ${h >= 2 ? "win" : "lose"}`}>×{h.toFixed(2)}</span>)}</div>
        </>
      )}
      {skin === "aviator" && history.length > 0 && (
        <div className="xg-history"><span className="bh-lab">ROUND HISTORY</span>{history.map((h, i) => <span key={i} className={`bh-item ${h >= 2 ? "win" : "lose"}`}>×{h.toFixed(2)}</span>)}</div>
      )}
      <p className="xg-note">Mode: {mode} · {room.simMode ? "SIM play is play-money only and never touches your real cash." : "Real cash settles server-side."}</p>
    </RoomShell>
  );
}
