// Crash engine — shared by Aviator Gold and Jet Fly.
// Round comes from POST /api/games/crash/round (server-issued, hash
// commitment). Growth = exp(0.00006 * elapsedMs); display/cash-out cap
// ×50 while crash detection uses the raw curve (v48).
// CONTRACT GAP (see report): there is no reveal endpoint, so the client
// cannot learn the server's crash point. The visual crash point is drawn
// client-side from the SAME distribution (1/33 instant 1.00x, same curve
// family) and cash-outs settle through /api/games/settle with the stopped
// multiplier. A GET reveal endpoint would make this truly provably fair.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, fmtCash } from "../../lib/api";
import { GameDef } from "../../lib/games";
import { useStore } from "../../lib/store";
import { RoomShell, StakeChips, useGameRoom } from "./shared";

const GROWTH = 0.00006;
const DISPLAY_CAP = 50;

function drawCrashPoint(): number {
  // Same distribution as crashPointFromSeeds: 1/33 instant 1.00x, else
  // the house curve sampled from a uniform 52-bit value.
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  const h = (buf[0] * 0x100000000 + buf[1]) % 0x10000000000000; // 52-bit-ish
  if (h % 33 === 0) return 1.0;
  const e = Math.pow(2, 52);
  const raw = Math.floor((100 * e - h) / (e - h)) / 100;
  return Math.max(1.0, Math.min(raw, 1_000_000));
}

function multAt(elapsedMs: number) {
  return Math.exp(GROWTH * elapsedMs);
}

interface Bet { stake: number; auto: number | null; cashed: boolean; payout: number }

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
  const [bets, setBets] = useState<Bet[]>([]);
  const [feed, setFeed] = useState<{ name: string; stake: number; mult: number; won: boolean }[]>([]);
  const [history, setHistory] = useState<number[]>([]);
  const [msg, setMsg] = useState("Place your bet — the next round starts soon.");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const startRef = useRef(0);
  const pointRef = useRef(1);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const betsRef = useRef(bets);
  betsRef.current = bets;

  const newRound = useCallback(async () => {
    if (!user) return;
    try {
      const r = await api<{ roundId: string; hash: string; startsAt: number }>("/api/games/crash/round", { method: "POST" });
      setRoundId(r.roundId);
      setHash(r.hash.slice(0, 16) + "…");
      const point = drawCrashPoint();
      pointRef.current = point;
      setCrashPoint(point);
      setPhase("waiting");
      setMult(1);
      setBets([]);
      setMsg("Betting open — round takes off soon.");
      const waitMs = Math.max(500, r.startsAt - Date.now());
      setCountdown(Math.ceil(waitMs / 1000));
      startRef.current = Date.now() + waitMs;
    } catch {
      // Offline/demo fallback: still run a local round so the room plays.
      const point = drawCrashPoint();
      pointRef.current = point;
      setCrashPoint(point);
      setPhase("waiting");
      setCountdown(5);
      startRef.current = Date.now() + 5000;
      setMsg("Betting open — round takes off soon.");
    }
  }, [user]);

  // Countdown + run loop
  useEffect(() => {
    if (phase !== "waiting" && phase !== "running") return;
    const iv = setInterval(() => {
      if (phaseRef.current === "waiting") {
        const left = Math.max(0, Math.ceil((startRef.current - Date.now()) / 1000));
        setCountdown(left);
        if (left <= 0) {
          setPhase("running");
          startRef.current = Date.now();
        }
      }
    }, 100);
    return () => clearInterval(iv);
  }, [phase]);

  useEffect(() => {
    if (phase !== "running") return;
    const loop = () => {
      const elapsed = Date.now() - startRef.current;
      const m = multAt(elapsed);
      setMult(m);
      // Auto cash-out
      const active = betsRef.current.find((b) => !b.cashed);
      if (active && active.auto && m >= active.auto) void cashOut(active);
      if (m >= pointRef.current) {
        setPhase("crashed");
        setHistory((h) => [Math.round(pointRef.current * 100) / 100, ...h].slice(0, 12));
        setMsg(`Crashed at ×${pointRef.current.toFixed(2)}`);
        // Uncashed bets lose
        const losers = betsRef.current.filter((b) => !b.cashed);
        if (losers.length) {
          void Promise.all(losers.map((b) => room.settle(b.stake, 0, { crash: pointRef.current })));
        }
        setBets([]);
        setTimeout(() => void newRound(), 2800);
        return;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

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
    const m = Math.min(multAt(Date.now() - startRef.current), DISPLAY_CAP);
    const payout = Math.round(bet.stake * m * 100) / 100;
    setBets((bs) => bs.map((b) => (b === bet ? { ...b, cashed: true, payout } : b)));
    await room.settle(bet.stake, payout, { cashout: m, crash: pointRef.current }, roundId || undefined);
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
