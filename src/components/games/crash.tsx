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

import { useCallback, useEffect, useRef, useState } from "react";
import { api, fmtCash } from "../../lib/api";
import { GameDef } from "../../lib/games";
import { useStore } from "../../lib/store";
import { RoomShell, StakeChips, useGameRoom } from "./shared";

const GROWTH = 0.00006;
const DISPLAY_CAP = 50;

function multAt(elapsedMs: number) {
  return Math.exp(GROWTH * elapsedMs);
}

interface Bet { stake: number; auto: number | null; cashed: boolean; payout: number }

interface Reveal { serverSeed: string; clientSeed: string; nonce: number; crashPoint: number; hash: string }

const FAKE_NAMES = ["Kwame", "Ama", "Kofi", "Efua", "Yaw", "Adwoa", "Selasi", "Nana", "Akosua", "Mensah"];

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
    setReveal(rv);
    setCrashPoint(rv.crashPoint);
    setMult(rv.crashPoint);
    setPhase("crashed");
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

  // Canvas curve
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(242,194,48,.9)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(20, H - 20);
    const t = Math.min(1, Math.log(Math.max(1, mult)) / Math.log(DISPLAY_CAP));
    const x = 20 + t * (W - 60);
    const y = H - 20 - t * (H - 70);
    ctx.quadraticCurveTo(20 + (x - 20) * 0.5, H - 20, x, y);
    ctx.stroke();
    // craft
    ctx.font = "34px serif";
    ctx.fillText(skin === "jet" ? "➤" : "▲", x - 12, y - 8);
    if (phase === "crashed") {
      ctx.font = "bold 22px sans-serif";
      ctx.fillStyle = "#E5322D";
      ctx.fillText(`CRASHED ×${(crashPoint ?? 1).toFixed(2)}`, 24, 40);
    }
  }, [mult, phase, crashPoint, skin]);

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
    setBets((bs) => bs.map((b) => (b === bet ? { ...b, cashed: true, payout } : b)));
    await room.settle(bet.stake, payout, { cashout: m }, roundId || undefined);
    setMsg(`Cashed out at ×${m.toFixed(2)} — ${fmtCash(payout)}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, roundId]);

  const activeBet = bets.find((b) => !b.cashed);
  const dispMult = Math.min(mult, DISPLAY_CAP);

  return (
    <RoomShell game={game} subtitle={skin === "jet" ? "Jet Fly — proper Aviator: 5-second betting window, dual bets, auto cash-out, live feed." : "Aviator Gold — watch the multiplier climb and cash out before it crashes. Display cap ×50."} stats={room.stats} history={room.history}>
      <div className="cr-stage">
        <div className="cr-mult" style={{ color: phase === "crashed" ? "#E5322D" : undefined }}>×{dispMult.toFixed(2)}</div>
        <canvas ref={canvasRef} width={640} height={260} className="cr-canvas" aria-label="Crash multiplier chart" />
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
            Place bet · {fmtCash(stake)} {skin === "jet" && bets.length === 1 ? "(2nd panel)" : ""}
          </button>
        )}
        {phase === "running" && activeBet && (
          <button className="btn btn-gold xg-action cr-cash" type="button" onClick={() => void cashOut(activeBet)}>
            CASH OUT · {fmtCash(Math.round(activeBet.stake * dispMult * 100) / 100)}
          </button>
        )}
        {phase === "running" && !activeBet && <button className="btn btn-ghost xg-action" type="button" disabled>Watching — no active bet</button>}
        <p className="xg-msg">{msg}</p>
        {bets.length > 0 && <p className="xg-msg">Active bets: {bets.map((b) => `${fmtCash(b.stake)}${b.cashed ? ` → cashed ${fmtCash(b.payout)}` : b.auto ? ` (auto ×${b.auto})` : ""}`).join(" · ")}</p>}
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
              <div key={i} className="jf-feed-row"><span>{f.name}</span><span>{fmtCash(f.stake)}</span><span>×{f.mult.toFixed(2)}</span><span className={f.won ? "win" : "lose"}>{f.won ? "won" : "lost"}</span></div>
            ))}
          </div>
          <div className="xg-history"><span className="bh-lab">ROUND HISTORY</span>{history.length === 0 ? <span className="bh-empty">No rounds yet.</span> : history.map((h, i) => <span key={i} className={`bh-item ${h >= 2 ? "win" : "lose"}`}>×{h.toFixed(2)}</span>)}</div>
        </>
      )}
      {skin === "aviator" && history.length > 0 && (
        <div className="xg-history"><span className="bh-lab">ROUND HISTORY</span>{history.map((h, i) => <span key={i} className={`bh-item ${h >= 2 ? "win" : "lose"}`}>×{h.toFixed(2)}</span>)}</div>
      )}
      <p className="xg-note">Mode: {mode} · {room.simMode ? "SIM play is demo-only and never touches your real cash." : "Real cash settles server-side."}</p>
    </RoomShell>
  );
}
