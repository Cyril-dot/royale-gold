// Quick chance games — v48 room-factory games, payouts exactly as the
// export tiles / API contract state.
// Coin Flip ×2 · Dice exactly 7 ×5 · Lucky Wheel 12 segments (1×4, 2×2,
// 3×1, 1×0.5, 5 LOSE) · Hi-Lo chain ×1.9 · RPS ×2 · Limbo target×0.97
// (max ×19.4) · Red or Black chain to ×8 · War ×2 · Pick-a-Box ×1.8 ·
// Mini Roulette red/black ×2, green zero ×36 · Spin Da Bottle UP/DOWN ×2.

"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { fmtCash } from "../../lib/api";
import type { GameHistoryRow, GameStat } from "../../lib/api";
import { GameDef } from "../../lib/games";
import { RoomShell, StakeChips, useGameRoom } from "./shared";
import { PlayingCard, type Card } from "./table";
import { playSfx } from "../../lib/store";
import type { CoinFlipHandle } from "../three/CoinFlip3D";
import type { DiceHandle } from "../three/Dice3D";
import type { MiniRouletteHandle } from "../three/MiniRoulette2D";
import MiniRoulette2D from "../three/MiniRoulette2D";

// 3D scene mounts (restored from the v48 artifact): client-only, so
// Three.js never renders on the server. The DOM coin / dice stay as
// the no-WebGL fallbacks; Mini Roulette's wheel is a 2D canvas restore.
const CoinFlip3D = dynamic(() => import("../three/CoinFlip3D"), { ssr: false });
const Dice3D = dynamic(() => import("../three/Dice3D"), { ssr: false });

function useSimple(game: GameDef, subtitle: string, intro?: string) {
  const room = useGameRoom(game);
  const [stake, setStake] = useState(10);
  // The msg box carries the room's instruction copy — a DIFFERENT string
  // from the header subtitle (the v48 artifact's xg-msg). The old code
  // initialised msg with the subtitle, so the same line showed twice.
  const [msg, setMsg] = useState(intro ?? subtitle);
  return { room, stake, setStake, msg, setMsg };
}

function Shell({ game, subtitle, stake, setStake, msg, variant = "room", lockStake, stats, history, children }: {
  game: GameDef; subtitle: string; stake: number; setStake: (n: number) => void; msg: string; variant?: "room" | "home"; lockStake?: boolean; stats: GameStat | null; history: GameHistoryRow[]; children: React.ReactNode;
}) {
  // Shell renders the stats/history of the SAME useGameRoom instance the
  // room settles through (passed in as props). It must NOT create its own
  // useGameRoom: a second instance's stats only load on mount, so the strip
  // never refreshed after a settle (played/wins/streak stayed stale).
  return (
    <RoomShell game={game} subtitle={subtitle} stats={stats} history={history} bare={variant === "home"}>
      <div className="xg-controls">
        {/* Chain games lock the stake while a round is live (the
            artifact refuses stake changes mid-round) — otherwise the
            cash-out basis changes under a running chain. */}
        <StakeChips stake={stake} setStake={setStake} currency={game.currency} disabled={lockStake} />
        {children}
        <p className="bottle-msg xg-msg">{msg}</p>
      </div>
    </RoomShell>
  );
}

// A real playing card (rank + suit), as the artifact draws it —
// Hi-Lo, Red/Black and War all deal these, not bare rank strings.
const DRAW_SUITS = [{ s: "♠", red: false }, { s: "♥", red: true }, { s: "♦", red: true }, { s: "♣", red: false }];
function drawCardObj(): Card {
  const rank = 2 + Math.floor(Math.random() * 13);
  const si = Math.floor(Math.random() * 4);
  return { rank, suit: si, sym: DRAW_SUITS[si].s, red: DRAW_SUITS[si].red };
}
const cardLabel = (c: Card) => (c.rank === 11 ? "J" : c.rank === 12 ? "Q" : c.rank === 13 ? "K" : c.rank === 14 ? "A" : c.rank) + c.sym;

// ---------------- Coin Flip ----------------
// The artifact's DOM fallback faces: a star for Heads, a crown for
// Tails (the 3D coin's own textures). The port showed ₵ for heads
// and ★ for tails — the faces were swapped and the crown was missing.
const CF_STAR = "M12 1.8l3.1 6.7 7.3.8-5.4 5 1.5 7.2L12 17.9l-6.5 3.6L7 14.3 1.6 9.3l7.3-.8z";
const CF_CROWN = "M12 4.2l3.4 5.4 5.9-3.4-1.7 9.6H4.4L2.7 6.2l5.9 3.4zM4.6 17.6h14.8v2.2H4.6z";
export function CoinFlipRoom({ game }: { game: GameDef }) {
  const { room, stake, setStake, msg, setMsg } = useSimple(game, "Call it — heads or tails, pays ×2.", "Pick a side, set your stake, then flip. Heads is the star, Tails is the crown.");
  const [pick, setPick] = useState<"heads" | "tails">("heads");
  const [flipping, setFlipping] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  // 3D coin controller (null until the scene mounts / when WebGL is down).
  const flip3dRef = useRef<CoinFlipHandle | null>(null);
  const [flip3d, setFlip3d] = useState(false);
  const flip = async () => {
    if (flipping) return;
    setFlipping(true);
    setResult(null);
    setMsg("Coin is in the air…");
    playSfx("flip", room.muted);
    const out = Math.random() < 0.5 ? "heads" : "tails";
    const finish = async () => {
      setResult(out);
      setFlipping(false);
      const won = out === pick;
      setMsg(won ? `It landed ${out} — you called it! ${fmtCash(stake * 2)}` : `It landed ${out} — not your call.`);
      await room.settle(stake, won ? stake * 2 : 0, { pick, out });
    };
    // 3D: flip to the pre-decided face (2350ms artifact flip), then
    // settle. DOM: the 700ms flip it replaces.
    if (flip3dRef.current) {
      flip3dRef.current.flip(out === "heads" ? "HEADS" : "TAILS", () => void finish());
      return;
    }
    setTimeout(() => void finish(), 700);
  };
  return (
    <Shell game={game} subtitle="Call it — heads or tails, pays ×2." stake={stake} setStake={setStake} msg={msg} stats={room.stats} history={room.history}>
      <div className={`cf-stage${flip3d ? " has-3d" : ""}`}>
        <CoinFlip3D controllerRef={flip3dRef} onReady={setFlip3d} />
        <div className={`cf-coin ${flipping ? "spin" : ""}`} aria-label={result ? `Coin showing ${result}` : "Coin"}>
          {result ? (
            result === "heads" ? (
              <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d={CF_STAR} /></svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d={CF_CROWN} /></svg>
            )
          ) : "?"}
        </div>
        <div className="cf-picks">
          {(["heads", "tails"] as const).map((p) => (
            <button key={p} type="button" className="xg-pick" aria-pressed={pick === p} onClick={() => setPick(p)}>{p}</button>
          ))}
        </div>
      </div>
      <button className="btn btn-gold xg-action" type="button" onClick={() => void flip()} disabled={flipping}>{flipping ? "Flipping…" : `Flip · ${fmtCash(stake)}`}</button>
    </Shell>
  );
}

// ---------------- Dice Roll ----------------
// The artifact's DOM fallback dice are gold 3×3-grid dice (.fb-die);
// the port's were plain white tiles. Pip maps are 3×3 grid indices.
const DIE_PIPS: Record<number, number[]> = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};
function Die({ v }: { v: number }) {
  return (
    <div className="fb-die" aria-label={`Die showing ${v}`}>
      {Array.from({ length: 9 }, (_, i) => <i key={i} className={DIE_PIPS[v].includes(i) ? "on" : ""} />)}
    </div>
  );
}
type DicePick = "under" | "exact" | "over";
export function DiceRoom({ game }: { game: GameDef }) {
  const { room, stake, setStake, msg, setMsg } = useSimple(game, "Two 3D dice · Over/Under ×2 · Exactly 7 ×5.", "Call the total, set your stake, then roll. The dice settle where physics leaves them — the pips decide.");
  const [dice, setDice] = useState<[number, number]>([3, 4]);
  const [rolling, setRolling] = useState(false);
  // Last roll, for the big TOTAL readout (clear result moment).
  const [last, setLast] = useState<{ d1: number; d2: number; total: number; won: boolean; payout: number; stake: number } | null>(null);
  // The artifact's pick row — Under 7 ×2, Exactly 7 ×5, Over 7 ×2.
  // The port dropped Over/Under entirely and only paid exactly 7.
  const [pick, setPick] = useState<DicePick>("exact");
  // 3D dice controller (null until the scene mounts / when WebGL is down).
  const dice3dRef = useRef<DiceHandle | null>(null);
  const [dice3d, setDice3d] = useState(false);
  const roll = async () => {
    if (rolling) return;
    setRolling(true);
    playSfx("blip", room.muted);
    const d1 = 1 + Math.floor(Math.random() * 6), d2 = 1 + Math.floor(Math.random() * 6);
    const finish = async () => {
      setDice([d1, d2]);
      setRolling(false);
      const total = d1 + d2;
      const won = pick === "over" ? total > 7 : pick === "under" ? total < 7 : total === 7;
      const mult = pick === "exact" ? 5 : 2;
      const payout = won ? stake * mult : 0;
      setLast({ d1, d2, total, won, payout, stake });
      const call = pick === "over" ? "Over 7" : pick === "under" ? "Under 7" : "Exactly 7";
      setMsg(won ? `${d1} + ${d2} = ${total} — ${call}! ${fmtCash(stake * mult)} paid to your balance.` : `${d1} + ${d2} = ${total} — you called ${call}. The ${fmtCash(stake)} stake is gone; roll again.`);
      await room.settle(stake, payout, { d1, d2, total, pick });
    };
    // 3D: the physics throw lands on the pre-decided values, then
    // settle. DOM: the 600ms roll it replaces.
    if (dice3dRef.current) {
      dice3dRef.current.roll([d1, d2], () => void finish());
      return;
    }
    setTimeout(() => void finish(), 600);
  };
  return (
    <Shell game={game} subtitle="Two 3D dice · Over/Under ×2 · Exactly 7 ×5." stake={stake} setStake={setStake} msg={msg} stats={room.stats} history={room.history}>
      <div className={`dice-stage${dice3d ? " has-3d" : ""}`}><Dice3D controllerRef={dice3dRef} onReady={setDice3d} /><div className={`fb-dice${rolling ? " rolling" : ""}`}><Die v={dice[0]} /><Die v={dice[1]} /></div></div>
      {last && (
        <div className={`dr-total${last.won ? " win" : " lose"}`} aria-live="polite">
          <span className="dr-total-label">TOTAL</span>
          <span className="dr-total-num">{last.total}</span>
          <span className="dr-total-sub">{last.d1} + {last.d2} · {last.won ? `Won ${fmtCash(last.payout)}` : `Lost ${fmtCash(last.stake)}`}</span>
        </div>
      )}
      <div className="xg-pickrow" role="group" aria-label="Pick the total">
        {(["under", "exact", "over"] as DicePick[]).map((p) => (
          <button key={p} type="button" className="xg-pick" aria-pressed={pick === p} onClick={() => setPick(p)} disabled={rolling}>
            <span className="xg-pick-txt">{p === "under" ? "Under 7" : p === "exact" ? "Exactly 7" : "Over 7"}<small>{p === "under" ? "2–6 · pays ×2" : p === "exact" ? "pays ×5" : "8–12 · pays ×2"}</small></span>
          </button>
        ))}
      </div>
      <button className="btn btn-gold xg-action" type="button" onClick={() => void roll()} disabled={rolling}>{rolling ? "Rolling…" : `Roll · ${fmtCash(stake)}`}</button>
    </Shell>
  );
}

// ---------------- Lucky Wheel ----------------
// The artifact's segment order and colours (Winwheel model): ×2 green,
// LOSE dark red, ×1 blue, ×0.5 purple, ×4 gold — 12 segments, pointer
// at 12 o'clock. The port reordered the segments and flattened the
// colours to four flat fills, and dropped the rim bulbs, the gold hub,
// the pointer flick + tick per segment, the 4600ms spin and the
// winner highlight. All restored.
const WHEEL_SEGS: { label: string; mult: number; fill: string; txt: string }[] = [
  { label: "×2", mult: 2, fill: "#14663F", txt: "#FFF6D8" },
  { label: "LOSE", mult: 0, fill: "#40101A", txt: "#FFB3AC" },
  { label: "×1", mult: 1, fill: "#1D3468", txt: "#FFF6D8" },
  { label: "×0.5", mult: 0.5, fill: "#4B3566", txt: "#FFF6D8" },
  { label: "LOSE", mult: 0, fill: "#40101A", txt: "#FFB3AC" },
  { label: "×1", mult: 1, fill: "#1D3468", txt: "#FFF6D8" },
  { label: "×4", mult: 4, fill: "#F2C230", txt: "#231600" },
  { label: "LOSE", mult: 0, fill: "#40101A", txt: "#FFB3AC" },
  { label: "×1", mult: 1, fill: "#1D3468", txt: "#FFF6D8" },
  { label: "LOSE", mult: 0, fill: "#40101A", txt: "#FFB3AC" },
  { label: "×2", mult: 2, fill: "#14663F", txt: "#FFF6D8" },
  { label: "LOSE", mult: 0, fill: "#40101A", txt: "#FFB3AC" },
];
export function WheelRoom({ game }: { game: GameDef }) {
  const { room, stake, setStake, msg, setMsg } = useSimple(game, "One ×4, two ×2, three ×1 stake-back, one ×0.5 half-back, five LOSE.", "Set your stake and spin. The wheel pays the segment under the pointer: ×4 top prize · ×2 · ×1 returns your stake · ×0.5 returns half · LOSE pays nothing.");
  const [angle, setAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<{ text: string; cls: string }>({ text: "Place your stake and spin", cls: "" });
  const [winIdx, setWinIdx] = useState(-1);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef<HTMLDivElement>(null);

  // The winner is READ from the settled wheel (Winwheel's
  // getIndicatedSegmentNumber math) — the tween is never trusted.
  const indicatedIndex = (rotation: number) => {
    const rel = ((0 - (rotation % 360)) % 360 + 360) % 360;
    for (let i = 0; i < 12; i++) if (rel >= i * 30 && rel < i * 30 + 30) return i;
    return 11;
  };

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const W = cv.width, cx = W / 2, cy = W / 2;
    ctx.clearRect(0, 0, W, W);
    // gold rim + 24 bulbs
    ctx.beginPath(); ctx.arc(cx, cy, 274, 0, 7); ctx.fillStyle = "#8A5A16"; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, 268, 0, 7); ctx.fillStyle = "#C99612"; ctx.fill();
    for (let b = 0; b < 24; b++) {
      const ba = ((b * 15 - 90) * Math.PI) / 180;
      ctx.beginPath(); ctx.arc(cx + Math.cos(ba) * 256, cy + Math.sin(ba) * 256, 7, 0, 7);
      ctx.fillStyle = b % 2 ? "#FFE89A" : "#F2C230"; ctx.fill();
      ctx.lineWidth = 1.4; ctx.strokeStyle = "rgba(90,67,3,.8)"; ctx.stroke();
    }
    WHEEL_SEGS.forEach((s, i) => {
      const a0 = ((angle + i * 30 - 90) * Math.PI) / 180;
      const a1 = ((angle + (i + 1) * 30 - 90) * Math.PI) / 180;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, 240, a0, a1); ctx.closePath();
      ctx.fillStyle = s.fill; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = "rgba(242,194,48,.4)"; ctx.stroke();
      if (!spinning && i === winIdx) {
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, 240, a0, a1); ctx.closePath();
        ctx.fillStyle = "rgba(255,232,154,.3)"; ctx.fill();
        ctx.lineWidth = 5; ctx.strokeStyle = "#FFE89A"; ctx.stroke();
      }
      const mid = ((angle + i * 30 + 15 - 90) * Math.PI) / 180;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(mid); ctx.translate(172, 0); ctx.rotate(Math.PI / 2);
      ctx.font = `${s.mult === 0 ? "800 21px" : "900 27px"} Outfit, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = s.txt; ctx.fillText(s.label, 0, 0);
      ctx.restore();
    });
    // gold hub
    const hg = ctx.createRadialGradient(cx - 22, cy - 26, 8, cx, cy, 74);
    hg.addColorStop(0, "#FFEFA8"); hg.addColorStop(0.55, "#F2C230"); hg.addColorStop(1, "#9A7410");
    ctx.beginPath(); ctx.arc(cx, cy, 70, 0, 7); ctx.fillStyle = hg; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = "rgba(90,67,3,.65)"; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 52, 0, 7);
    ctx.lineWidth = 2; ctx.strokeStyle = "rgba(255,246,216,.75)"; ctx.stroke();
    ctx.font = "900 34px Outfit, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#7A5200"; ctx.fillText("₵", cx, cy + 2);
  }, [angle, spinning, winIdx]);

  const flick = () => {
    const el = pointerRef.current;
    if (!el) return;
    el.style.transform = "translateX(-50%) rotate(-15deg)";
    setTimeout(() => { el.style.transform = "translateX(-50%) rotate(0deg)"; }, 62);
  };

  const spin = async () => {
    if (spinning) return;
    setSpinning(true);
    setWinIdx(-1);
    setResult({ text: "Spinning…", cls: "" });
    setMsg("The wheel is flying — the pointer decides where it stops.");
    // Outcome decided FIRST, weighted by arc width (all 12 equal 30°).
    const seg = Math.floor(Math.random() * 12);
    const centre = seg * 30 + 15;
    const curMod = ((angle % 360) + 360) % 360;
    const need = ((0 - centre) % 360 + 360) % 360;
    const delta = ((need - curMod) % 360 + 360) % 360;
    const start = angle;
    const target = angle + 5 * 360 + delta;
    const t0 = Date.now();
    const dur = 4600;
    let lastSeg = Math.floor(angle / 30);
    const tick = () => {
      const p = Math.min(1, (Date.now() - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      const rot = start + (target - start) * eased;
      setAngle(rot);
      const s = Math.floor(rot / 30);
      if (s !== lastSeg) { lastSeg = s; flick(); playSfx("tick", room.muted); }
      if (p < 1) requestAnimationFrame(tick);
      else {
        setAngle(target);
        setSpinning(false);
        // Read the winner off the settled wheel, never the tween.
        const idx = indicatedIndex(target);
        const w = WHEEL_SEGS[idx];
        setWinIdx(idx);
        const payout = Math.round(stake * w.mult * 100) / 100;
        if (w.mult === 0) {
          setResult({ text: "LOSE — no payout", cls: "lose" });
          setMsg("LOSE — the pointer stopped on a losing segment. The " + fmtCash(stake) + " stake is gone.");
        } else if (w.mult === 0.5) {
          setResult({ text: `×0.5 — ${fmtCash(payout)} back`, cls: "lose" });
          setMsg(`×0.5 — half back: ${fmtCash(payout)} returned to your balance.`);
        } else if (w.mult === 1) {
          setResult({ text: `×1 — stake back ${fmtCash(payout)}`, cls: "" });
          setMsg(`×1 — your ${fmtCash(stake)} stake comes straight back. Spin again.`);
        } else {
          setResult({ text: `${w.label} — ${fmtCash(payout)} paid`, cls: "win" });
          setMsg(`${w.label}! ${fmtCash(payout)} paid to your balance.`);
        }
        void room.settle(stake, payout, { segment: idx, mult: w.mult });
      }
    };
    tick();
  };
  return (
    <Shell game={game} subtitle="One ×4, two ×2, three ×1 stake-back, one ×0.5 half-back, five LOSE." stake={stake} setStake={setStake} msg={msg} stats={room.stats} history={room.history}>
      <div className="lw-stage"><canvas ref={canvasRef} width={560} height={560} className="wheel-canvas" aria-label="Lucky Wheel — a 12-segment prize wheel: one ×4, two ×2, three ×1 stake-back, one ×0.5 half-back and five LOSE segments, with a gold pointer at the top" /><div className="lw-pointer" ref={pointerRef} aria-hidden="true" /><div className={`lw-result${result.cls ? ` ${result.cls}` : ""}`}>{result.text}</div></div>
      <button className="btn btn-gold xg-action" type="button" onClick={() => void spin()} disabled={spinning}>{spinning ? "Spinning…" : `Spin · ${fmtCash(stake)}`}</button>
    </Shell>
  );
}

// ---------------- Hi-Lo ----------------
// Restored vs the artifact: the card is a real playing card (flip
// animation); Higher/Lower are pick buttons with sublabels; the chain
// readout is the artifact's "CHAIN ×N / Worth GH₵X" line; cash-out is
// its own button, hidden until a chain exists. And the TIE rule the
// port dropped: same rank is a FREE re-deal — the chain rides on.
// The port paid the tie out as a loss, which is simply wrong.
export function HiLoRoom({ game }: { game: GameDef }) {
  const { room, stake, setStake, msg, setMsg } = useSimple(game, "Guess higher or lower — every right call chains ×1.9. Cash out anytime.", "Call the next card higher or lower than the one showing. Every right call chains ×1.9 — cash out anytime before a wrong call ends it. Same rank is a free re-deal.");
  // Prerender-safe: first render shows a fixed placeholder card; the
  // real random deal happens in an effect — Math.random() in a
  // render-time useState initializer breaks the production prerender
  // of /games/hi-lo (Next 16 "unstable value" fatal).
  const [card, setCard] = useState<Card>({ rank: 7, suit: 0, sym: "♠", red: false });
  useEffect(() => { setCard(drawCardObj()); }, []);
  const [chain, setChain] = useState(0);
  const [playing, setPlaying] = useState(false);
  const mult = Math.pow(1.9, chain);
  const start = () => { const c = drawCardObj(); setCard(c); setChain(0); setPlaying(true); setMsg(`You're looking at the ${cardLabel(c)}. Higher or lower for the next card? First right guess pays ×1.90.`); };
  const guess = async (dir: "hi" | "lo") => {
    if (!playing) return;
    const next = drawCardObj();
    if (next.rank === card.rank) {
      // Push — same rank, no harm done: free re-deal, chain rides on.
      setCard(next);
      setMsg(`Push — another ${cardLabel(next)}. Same rank, no harm done: the card is re-dealt free and your chain ×${mult.toFixed(2)} rides on.`);
      return;
    }
    const ok = dir === "hi" ? next.rank > card.rank : next.rank < card.rank;
    const diff = Math.abs(next.rank - card.rank);
    const prev = card;
    setCard(next);
    if (ok) {
      const c = chain + 1;
      setChain(c);
      setMsg(`Right — ${cardLabel(prev)} to ${cardLabel(next)}! Chain ×${Math.pow(1.9, c).toFixed(2)} (${fmtCash(Math.round(stake * Math.pow(1.9, c) * 100) / 100)}). Go again or cash out.`);
    } else {
      setPlaying(false);
      setMsg(`${diff === 1 ? "So close — one rank away! " : ""}${cardLabel(next)} beats your call. The chain dies and the ${fmtCash(stake)} stake is gone.`);
      await room.settle(stake, 0, { chain, next: cardLabel(next) });
    }
  };
  const cashOut = async () => {
    if (!playing || chain === 0) return;
    const payout = Math.round(stake * mult * 100) / 100;
    setPlaying(false);
    setMsg(`Cashed out — ${chain} ${chain === 1 ? "card" : "cards"} chained at ×${mult.toFixed(2)}: ${fmtCash(payout)} to your balance.`);
    await room.settle(stake, payout, { chain });
  };
  return (
    <Shell game={game} subtitle="Guess higher or lower — every right call chains ×1.9. Cash out anytime." stake={stake} setStake={setStake} msg={msg} stats={room.stats} history={room.history} lockStake={playing}>
      <div className="qg-stage">
        <div className="qg-cardrow"><PlayingCard c={card} flip key={`${card.rank}-${card.sym}-${chain}`} /></div>
        <div className="qg-mult">CHAIN ×{mult.toFixed(2)}<small>{chain ? `Worth ${fmtCash(Math.round(stake * mult * 100) / 100)} — cash out or ride it` : "Cash out any time after a right guess"}</small></div>
      </div>
      <div className="xg-pickrow">
        <button className="xg-pick" type="button" onClick={() => void guess("lo")} disabled={!playing}><span className="xg-pick-txt">Lower<small>next card is lower</small></span></button>
        <button className="xg-pick" type="button" onClick={() => void guess("hi")} disabled={!playing}><span className="xg-pick-txt">Higher<small>next card is higher</small></span></button>
      </div>
      {!playing && <button className="btn btn-gold xg-action" type="button" onClick={start}>Start — deal a card</button>}
      {playing && chain > 0 && <button className="btn btn-gold xg-action cr-cash" type="button" onClick={() => void cashOut()}>Cash out {fmtCash(Math.round(stake * mult * 100) / 100)}</button>}
    </Shell>
  );
}

// ---------------- Rock Paper Scissors ----------------
// Restored vs the artifact: the drawn SVG hand icons (the port showed
// the words ROCK/PAPER/SCISSORS as text), the shake on both hands
// while the throw flies, the 520ms reveal, and the BEST OF 3 score
// line that resets at two wins. The SVGs are the artifact's own.
const RPS_ICONS: Record<string, string> = {
  rock: '<svg viewBox="0 0 120 120" aria-hidden="true"><rect x="35" y="26" width="13" height="36" rx="6.5" fill="#D9A05F" stroke="#6E451D" stroke-width="3"/><rect x="50" y="20" width="13" height="40" rx="6.5" fill="#EDBE82" stroke="#6E451D" stroke-width="3"/><rect x="65" y="22" width="13" height="38" rx="6.5" fill="#D9A05F" stroke="#6E451D" stroke-width="3"/><rect x="79" y="30" width="12" height="32" rx="6" fill="#C98F4B" stroke="#6E451D" stroke-width="3"/><rect x="32" y="50" width="62" height="42" rx="13" fill="#D9A05F" stroke="#6E451D" stroke-width="3"/><path d="M38 58h50M40 67h46" stroke="#B57F3E" stroke-width="3" stroke-linecap="round" fill="none"/><ellipse cx="90" cy="72" rx="10" ry="17" transform="rotate(22 90 72)" fill="#EDBE82" stroke="#6E451D" stroke-width="3"/><path d="M84 62q7 8 3 19" stroke="#B57F3E" stroke-width="3" fill="none" stroke-linecap="round"/><rect x="42" y="90" width="40" height="13" rx="6" fill="#B57F3E" stroke="#6E451D" stroke-width="3"/><path d="M18 30l2 5.4 5.4 2-5.4 2-2 5.4-2-5.4-5.4-2 5.4-2z" fill="#FFD964"/><path d="M104 22l1.6 4.2 4.2 1.6-4.2 1.6-1.6 4.2-1.6-4.2-4.2-1.6z" fill="#FFD964"/></svg>',
  paper: '<svg viewBox="0 0 120 120" aria-hidden="true"><rect x="33" y="14" width="12" height="42" rx="6" fill="#D9A05F" stroke="#6E451D" stroke-width="3"/><rect x="47" y="7" width="12" height="49" rx="6" fill="#EDBE82" stroke="#6E451D" stroke-width="3"/><rect x="61" y="9" width="12" height="47" rx="6" fill="#D9A05F" stroke="#6E451D" stroke-width="3"/><rect x="75" y="17" width="11" height="39" rx="5.5" fill="#C98F4B" stroke="#6E451D" stroke-width="3"/><rect x="31" y="46" width="58" height="46" rx="13" fill="#D9A05F" stroke="#6E451D" stroke-width="3"/><path d="M31 64q-15 1-18 12q-1.4 7 5 9q9 2.4 16-6Z" fill="#EDBE82" stroke="#6E451D" stroke-width="3"/><path d="M41 68h38M43 79h32" stroke="#B57F3E" stroke-width="3" stroke-linecap="round" fill="none"/><rect x="41" y="90" width="40" height="13" rx="6" fill="#B57F3E" stroke="#6E451D" stroke-width="3"/><path d="M102 40l1.8 4.8 4.8 1.8-4.8 1.8-1.8 4.8-1.8-4.8-4.8-1.8z" fill="#FFD964"/></svg>',
  scissors: '<svg viewBox="0 0 120 120" aria-hidden="true"><g transform="rotate(-15 56 58)"><rect x="49" y="8" width="14" height="52" rx="7" fill="#EDBE82" stroke="#6E451D" stroke-width="3"/></g><g transform="rotate(15 72 58)"><rect x="65" y="8" width="14" height="52" rx="7" fill="#D9A05F" stroke="#6E451D" stroke-width="3"/></g><circle cx="50" cy="56" r="9" fill="#B57F3E" stroke="#6E451D" stroke-width="3"/><circle cx="70" cy="56" r="9" fill="#B57F3E" stroke="#6E451D" stroke-width="3"/><rect x="36" y="52" width="54" height="40" rx="13" fill="#D9A05F" stroke="#6E451D" stroke-width="3"/><path d="M90 62q13 3 13 12q0 7-7 8q-7 .8-12-5Z" fill="#EDBE82" stroke="#6E451D" stroke-width="3"/><path d="M44 70h34M46 80h26" stroke="#B57F3E" stroke-width="3" stroke-linecap="round" fill="none"/><rect x="44" y="90" width="40" height="13" rx="6" fill="#B57F3E" stroke="#6E451D" stroke-width="3"/><path d="M16 22l1.8 4.8 4.8 1.8-4.8 1.8L16 35.2l-1.8-4.8-4.8-1.8 4.8-1.8z" fill="#FFD964"/></svg>',
};
const RPS_NAMES: Record<string, string> = { rock: "Rock", paper: "Paper", scissors: "Scissors" };
export function RpsRoom({ game }: { game: GameDef }) {
  const { room, stake, setStake, msg, setMsg } = useSimple(game, "Win the throw, ×2. A draw returns your stake.", "Pick rock, paper or scissors and throw. Win the throw and it pays ×2 — a draw returns your stake.");
  const [you, setYou] = useState("rock");
  const [cpu, setCpu] = useState("rock");
  const [throwing, setThrowing] = useState(false);
  const [youWins, setYouWins] = useState(0);
  const [cpuWins, setCpuWins] = useState(0);
  const throwHand = async (pick: string) => {
    if (throwing) return;
    setThrowing(true);
    const c = ["rock", "paper", "scissors"][Math.floor(Math.random() * 3)];
    setYou(pick); setCpu("rock");
    const beats: Record<string, string> = { rock: "scissors", paper: "rock", scissors: "paper" };
    setTimeout(async () => {
      setCpu(c);
      setThrowing(false);
      let yw = youWins, cw = cpuWins;
      let roundMsg = "";
      if (pick === c) {
        roundMsg = `Draw — ${RPS_NAMES[pick]} meets ${RPS_NAMES[c]}. Your ${fmtCash(stake)} stake comes straight back.`;
        await room.settle(stake, stake, { pick, cpu: c, draw: true });
      } else if (beats[pick] === c) {
        yw++;
        setYouWins(yw);
        roundMsg = `${RPS_NAMES[pick]} beats ${RPS_NAMES[c]} — ${fmtCash(stake * 2)} paid to your balance.`;
        await room.settle(stake, stake * 2, { pick, cpu: c });
      } else {
        cw++;
        setCpuWins(cw);
        roundMsg = `${RPS_NAMES[c]} beats ${RPS_NAMES[pick]} — the ${fmtCash(stake)} stake is gone. Throw again.`;
        await room.settle(stake, 0, { pick, cpu: c });
      }
      if (yw >= 2 || cw >= 2) {
        roundMsg += yw >= 2 ? " MATCH — you take the best-of-3!" : " MATCH — the CPU takes this best-of-3. New match starts now.";
        setYouWins(0); setCpuWins(0);
      }
      setMsg(roundMsg);
    }, 520);
  };
  return (
    <Shell game={game} subtitle="Win the throw, ×2. A draw returns your stake." stake={stake} setStake={setStake} msg={msg} stats={room.stats} history={room.history}>
      <div className="qg-stage">
        <div className="rps-hands">
          <div className={`rps-hand${throwing ? " shake" : ""}`} dangerouslySetInnerHTML={{ __html: RPS_ICONS[you] }} />
          <span className="rps-versus">VS</span>
          <div className={`rps-hand${throwing ? " shake" : ""}`} dangerouslySetInnerHTML={{ __html: RPS_ICONS[cpu] }} />
        </div>
        <div className="rps-score">BEST OF 3 — YOU <b>{youWins}</b> · CPU <b>{cpuWins}</b> · STREAK <b>{room.stats?.streak ?? 0}</b></div>
      </div>
      <div className="xg-pickrow">
        {(["rock", "paper", "scissors"] as const).map((p) => (
          <button key={p} type="button" className="xg-pick" onClick={() => void throwHand(p)} disabled={throwing}>
            <span className="xg-pick-txt">{RPS_NAMES[p]}<small>{p === "rock" ? "crushes scissors" : p === "paper" ? "covers rock" : "cut paper"}</small></span>
          </button>
        ))}
      </div>
    </Shell>
  );
}

// ---------------- Limbo ----------------
// Restored to the artifact's game: the roll is a number 0–100 and it
// must land UNDER the line (100 ÷ target) to pay target × 0.97. The
// port replaced it with a multiplier roll ("must clear the target"),
// which changed the odds (0.97/target instead of 1/target) and
// dropped the track, the fill, the threshold line, the animated roll
// number, the quick-pick targets and the near-miss line. Payout
// formula (target × 0.97) is unchanged; the win chance is the
// artifact's 1/target.
export function LimboRoom({ game }: { game: GameDef }) {
  const { room, stake, setStake, msg, setMsg } = useSimple(game, "Set a target · roll under the line · pays target × 0.97.", "Set your target, then roll. The lower the roll the better: land under the line and you win stake × target × 0.97. Bigger targets move the line down — riskier, richer.");
  const [target, setTarget] = useState(2);
  const [rolled, setRolled] = useState<number | null>(null);
  const [rolling, setRolling] = useState(false);
  const threshold = 100 / target;
  const syncTarget = (t: number) => setTarget(t);
  const roll = async () => {
    if (rolling) return;
    setRolling(true);
    const r = Math.random() * 100;
    const th = 100 / target;
    const t0 = Date.now();
    const dur = 550;
    const anim = () => {
      const p = Math.min(1, (Date.now() - t0) / dur);
      setRolled(Math.random() * 100);
      if (p < 1) requestAnimationFrame(anim);
      else {
        setRolled(r);
        setRolling(false);
        const won = r < th;
        const payout = won ? Math.round(stake * target * 0.97 * 100) / 100 : 0;
        setMsg(won ? `${r.toFixed(2)} — under the ${th.toFixed(2)} line! ${fmtCash(payout)} paid to your balance.` : `${r - th <= 5 ? `So close — just ${(r - th).toFixed(2)} over the line! ` : ""}${r.toFixed(2)} is over the ${th.toFixed(2)} line. The ${fmtCash(stake)} stake is gone.`);
        void room.settle(stake, payout, { target, rolled: Math.round(r * 100) / 100 });
      }
    };
    anim();
  };
  return (
    <Shell game={game} subtitle="Set a target · roll under the line · pays target × 0.97." stake={stake} setStake={setStake} msg={msg} stats={room.stats} history={room.history}>
      <div className="qg-stage">
        <div className={`lm-roll${rolled !== null && !rolling ? (rolled < threshold ? " win" : " lose") : ""}`}>{rolled !== null ? rolled.toFixed(2) : "—"}</div>
        <div className="lm-track"><div className="lm-fill" style={{ width: `${rolled !== null ? Math.min(100, rolled) : 0}%` }} /><span className="lm-line" style={{ left: `${threshold.toFixed(2)}%` }} /></div>
        <p className="lm-need">Roll under <b>{threshold.toFixed(2)}</b> to win <b>{fmtCash(Math.round(stake * target * 0.97 * 100) / 100)}</b> (stake × ×{target.toFixed(1)} × 0.97)</p>
      </div>
      <div className="lm-slider"><span className="stake-lab">Target</span><input type="range" min={1.5} max={20} step={0.1} value={target} onChange={(e) => syncTarget(Number(e.target.value))} aria-label="Target multiplier" /><span className="lm-target">×{target.toFixed(1)}</span></div>
      <div className="xg-pickrow">
        {[1.5, 2, 5, 10].map((q) => (
          <button key={q} type="button" className="xg-pick" aria-pressed={target === q} onClick={() => syncTarget(q)} disabled={rolling}><span className="xg-pick-txt">×{q}</span></button>
        ))}
      </div>
      <button className="btn btn-gold xg-action" type="button" onClick={() => void roll()} disabled={rolling}>{rolling ? "Rolling…" : "Roll"}</button>
    </Shell>
  );
}

// ---------------- Red or Black ----------------
// Restored vs the artifact: the drawn card is a real playing card
// (flip) — the port showed a "♥ RED"/"♠ BLACK" text tile; the chain
// readout is the artifact's "CHAIN ×N / Worth GH₵X" line; Red/Black
// are pick buttons with sublabels; cash-out is its own button, hidden
// until a chain exists; the card starts face-down.
export function RedBlackRoom({ game }: { game: GameDef }) {
  const { room, stake, setStake, msg, setMsg } = useSimple(game, "Call red or black — each right call doubles. Chain to ×8, cash out anytime.", "Call the colour of the next card. Each right call doubles the chain — three in a row pays ×8. Cash out anytime.");
  const [chain, setChain] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [last, setLast] = useState<Card | null>(null);
  const mult = Math.min(8, Math.pow(2, chain));
  const start = () => { setChain(0); setPlaying(true); setLast(null); setMsg("The next card is face down. Call it — red or black?"); };
  const guess = async (pick: "red" | "black") => {
    if (!playing) return;
    const c = drawCardObj();
    setLast(c);
    const out = c.red ? "red" : "black";
    if (out === pick) {
      const n = chain + 1;
      setChain(n);
      if (n >= 3) {
        const payout = Math.round(stake * 8 * 100) / 100;
        setPlaying(false);
        setMsg(`${cardLabel(c)} — ${out}! That's the ×8 cap: ${fmtCash(payout)} paid automatically. Top of the ladder!`);
        await room.settle(stake, payout, { chain: n });
      } else setMsg(`${cardLabel(c)} — ${out}, called it! Chain ×${Math.pow(2, n)} (${fmtCash(stake * Math.pow(2, n))}). Call the next card or cash out.`);
    } else {
      setPlaying(false);
      setMsg(`${cardLabel(c)} — that's ${out}, not your call. The chain breaks and the ${fmtCash(stake)} stake is gone.`);
      await room.settle(stake, 0, { chain, out });
    }
  };
  const cashOut = async () => {
    if (!playing || chain === 0) return;
    const payout = Math.round(stake * mult * 100) / 100;
    setPlaying(false);
    setMsg(`Cashed out — ${chain} ${chain === 1 ? "call" : "calls"} chained at ×${mult}: ${fmtCash(payout)} to your balance.`);
    await room.settle(stake, payout, { chain });
  };
  return (
    <Shell game={game} subtitle="Call red or black — each right call doubles. Chain to ×8, cash out anytime." stake={stake} setStake={setStake} msg={msg} stats={room.stats} history={room.history} lockStake={playing}>
      <div className="qg-stage">
        <div className="qg-cardrow">{last ? <PlayingCard c={last} flip key={`${last.rank}-${last.sym}-${chain}`} /> : <PlayingCard back />}</div>
        <div className="qg-mult">CHAIN ×{mult}<small>{chain ? `Worth ${fmtCash(stake * mult)} — cash out or call the next card` : "Each right call doubles it — cash out any time"}</small></div>
      </div>
      <div className="xg-pickrow">
        <button className="xg-pick" type="button" onClick={() => void guess("red")} disabled={!playing}><span className="xg-pick-txt">Red<small>hearts · diamonds</small></span></button>
        <button className="xg-pick" type="button" onClick={() => void guess("black")} disabled={!playing}><span className="xg-pick-txt">Black<small>spades · clubs</small></span></button>
      </div>
      {!playing && <button className="btn btn-gold xg-action" type="button" onClick={start}>Start</button>}
      {playing && chain > 0 && <button className="btn btn-gold xg-action cr-cash" type="button" onClick={() => void cashOut()}>Cash out {fmtCash(stake * mult)}</button>}
    </Shell>
  );
}

// ---------------- War ----------------
// Restored vs the artifact: real playing cards (flip) instead of bare
// rank text; the winning card glows (both glow on a tie); the result
// lands 380ms after the deal, not instantly; "one rank in it" near
// miss; the "ACES HIGH" subline.
export function WarRoom({ game }: { game: GameDef }) {
  const { room, stake, setStake, msg, setMsg } = useSimple(game, "Higher card wins ×2. A tie returns your stake.", "You and the dealer each draw a card. Higher card wins ×2 — a tie returns your stake.");
  const [you, setYou] = useState<Card | null>(null);
  const [dealer, setDealer] = useState<Card | null>(null);
  const [dealing, setDealing] = useState(false);
  // Glow only lands with the result (380ms), not on the deal itself.
  const [revealed, setRevealed] = useState(false);
  const deal = async () => {
    if (dealing) return;
    setDealing(true);
    setRevealed(false);
    const y = drawCardObj(), d = drawCardObj();
    setYou(y); setDealer(d);
    setTimeout(async () => {
      setDealing(false);
      setRevealed(true);
      if (y.rank > d.rank) { setMsg(`Your ${cardLabel(y)} beats the dealer's ${cardLabel(d)} — ${fmtCash(stake * 2)} paid to your balance.`); await room.settle(stake, stake * 2, { you: cardLabel(y), dealer: cardLabel(d) }); }
      else if (y.rank < d.rank) { setMsg(`${d.rank - y.rank === 1 ? "So close — one rank in it! " : ""}The dealer's ${cardLabel(d)} beats your ${cardLabel(y)}. The ${fmtCash(stake)} stake is gone.`); await room.settle(stake, 0, { you: cardLabel(y), dealer: cardLabel(d) }); }
      else { setMsg(`Tie — ${cardLabel(y)} apiece. No harm done: your stake is back and the re-deal is free. Deal again.`); await room.settle(stake, stake, { you: cardLabel(y), dealer: cardLabel(d), draw: true }); }
    }, 380);
  };
  const outcome = revealed && you && dealer ? (you.rank > dealer.rank ? "you" : you.rank < dealer.rank ? "dealer" : "tie") : null;
  return (
    <Shell game={game} subtitle="Higher card wins ×2. A tie returns your stake." stake={stake} setStake={setStake} msg={msg} stats={room.stats} history={room.history}>
      <div className="qg-stage">
        <div className="qg-cardrow">
          <PlayingCard c={you} flip={!!you} glow={outcome === "you" || outcome === "tie"} key={you ? `y-${you.rank}-${you.sym}` : "y-back"} />
          <span className="rps-versus">VS</span>
          <PlayingCard c={dealer} flip={!!dealer} glow={outcome === "dealer" || outcome === "tie"} key={dealer ? `d-${dealer.rank}-${dealer.sym}` : "d-back"} />
        </div>
        <div className="qg-mult"><small>YOUR CARD · DEALER CARD — ACES HIGH</small></div>
      </div>
      <button className="btn btn-gold xg-action" type="button" onClick={() => void deal()} disabled={dealing}>{dealing ? "Dealing…" : `Deal the cards · ${fmtCash(stake)}`}</button>
    </Shell>
  );
}

// ---------------- Pick-a-Box ----------------
// Restored to the artifact's CHAIN game: every find banks ×1.8 and
// the gold jumps to a new chest — open another or cash out; one empty
// chest ends it. The port was a one-shot pick (win ×1.8 or lose),
// which took the whole chain, the cash-out and the chest art out.
// The chest SVG and the "BANKED ×N / Worth GH₵X" line are the
// artifact's own. Per-find multiplier ×1.8 is unchanged.
const PB_CHEST = '<svg viewBox="0 0 56 46" aria-hidden="true"><path d="M4 18a24 13 0 0 1 48 0z" fill="#B57F3E"/><path d="M8 15a24 13 0 0 1 20-8" stroke="#E3B77E" stroke-width="2.6" fill="none" stroke-linecap="round" opacity=".8"/><path d="M4 18h48" stroke="#6E451D" stroke-width="1.6"/><rect x="4" y="18" width="48" height="24" rx="4" fill="#8A5A2B"/><path d="M6 25h44M6 33h44" stroke="#6E451D" stroke-width="1.5" opacity=".7"/><rect x="8" y="18" width="6" height="24" fill="#C99612" opacity=".85"/><rect x="42" y="18" width="6" height="24" fill="#C99612" opacity=".85"/><rect x="24.5" y="7" width="7" height="35" fill="#D9A41C" stroke="#9A7410" stroke-width=".9"/><rect x="22" y="21" width="12" height="12" rx="2.4" fill="#F2C230" stroke="#9A7410" stroke-width="1.6"/><path d="M28 24l3.2 3-3.2 3-3.2-3z" fill="#35C26E" stroke="#0C6B38" stroke-width=".9"/><circle cx="9" cy="21" r="1.4" fill="#FFE89A"/><circle cx="47" cy="21" r="1.4" fill="#FFE89A"/><circle cx="9" cy="39" r="1.4" fill="#FFE89A"/><circle cx="47" cy="39" r="1.4" fill="#FFE89A"/></svg>';
export function PickBoxRoom({ game }: { game: GameDef }) {
  const { room, stake, setStake, msg, setMsg } = useSimple(game, "One chest hides the gold · every find pays ×1.8 · cash out any time.", "Three chests, one gold. Every find multiplies your stake by ×1.8 and the gold hides again — cash out after any find, or one empty chest ends it.");
  const [step, setStep] = useState(0);
  const [gold, setGold] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [phase, setPhase] = useState<"idle" | "gold" | "dust">("idle");
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [round, setRound] = useState(0);
  const mult = Math.pow(1.8, step);
  const start = () => {
    setPlaying(true); setStep(0); setGold(Math.floor(Math.random() * 3));
    setPicked(null); setPhase("idle"); setBusy(false);
    setMsg("Three chests, one hides the gold. Open one — a find pays ×1.80 and the gold jumps to a new chest.");
  };
  const pick = async (i: number) => {
    if (!playing || busy) return;
    setBusy(true);
    setPicked(i);
    if (i === gold) {
      const s = step + 1;
      setStep(s);
      setPhase("gold");
      setMsg(`Gold in chest ${i + 1}! That's ×${Math.pow(1.8, s).toFixed(2)} banked (${fmtCash(Math.round(stake * Math.pow(1.8, s) * 100) / 100)}). The gold moves — open another or cash out.`);
      setTimeout(() => {
        setGold(Math.floor(Math.random() * 3));
        setPicked(null); setPhase("idle"); setBusy(false); setRound((r) => r + 1);
      }, 500);
    } else {
      setPhase("dust");
      setMsg(`Dust — the gold was in chest ${gold + 1}. The round ends and the ${fmtCash(stake)} stake is gone.`);
      setTimeout(async () => {
        setBusy(false);
        setPlaying(false);
        await room.settle(stake, 0, { step });
      }, 500);
    }
  };
  const cashOut = async () => {
    if (!playing || step < 1) return;
    const pay = Math.round(stake * mult * 100) / 100;
    setPlaying(false);
    setMsg(`Cashed out — ${step} ${step === 1 ? "find" : "finds"} at ×${mult.toFixed(2)}: ${fmtCash(pay)} to your balance.`);
    await room.settle(stake, pay, { step });
  };
  const chestLabel = (i: number): { text: string; color?: string } => {
    if (playing && picked === i && phase === "gold") return { text: "GOLD!", color: "#3ED97E" };
    if (playing && picked === i && phase === "dust") return { text: "EMPTY", color: "#FF8580" };
    if (playing && phase === "dust" && i === gold) return { text: "IT WAS HERE", color: "#3ED97E" };
    return { text: `CHEST ${i + 1}` };
  };
  return (
    <Shell game={game} subtitle="One chest hides the gold · every find pays ×1.8 · cash out any time." stake={stake} setStake={setStake} msg={msg} stats={room.stats} history={room.history} lockStake={playing}>
      <div className="qg-stage">
        <div className="qg-grid3" key={round}>
          {[0, 1, 2].map((i) => {
            const lab = chestLabel(i);
            const openGold = (playing && picked === i && phase === "gold") || (playing && phase === "dust" && i === gold);
            const openDust = playing && picked === i && phase === "dust";
            return (
              <button key={i} type="button" className={`chest${openGold ? " open-gold" : ""}${openDust ? " open-dust" : ""}`} onClick={() => void pick(i)} disabled={!playing || busy} aria-label={`Chest ${i + 1}`}>
                <span dangerouslySetInnerHTML={{ __html: PB_CHEST }} />
                <span className="chest-state" style={{ fontWeight: 800, fontSize: 12, color: lab.color ?? "var(--muted)" }}>{lab.text}</span>
              </button>
            );
          })}
        </div>
        <div className="qg-mult">{step ? `BANKED ×${mult.toFixed(2)}` : "NEXT FIND ×1.80"}<small>{step ? `Worth ${fmtCash(Math.round(stake * mult * 100) / 100)} — cash out or open another chest` : "Cash out any time after a find"}</small></div>
      </div>
      {!playing && <button className="btn btn-gold xg-action" type="button" onClick={start}>Start</button>}
      {playing && step > 0 && <button className="btn btn-gold xg-action cr-cash" type="button" onClick={() => void cashOut()} disabled={busy}>Cash out {fmtCash(Math.round(stake * mult * 100) / 100)}</button>}
    </Shell>
  );
}

// ---------------- Mini Roulette ----------------
// v48 export: European wheel (0–36). Bet red or black (pays ×2) or green
// zero (pays ×36). No straight-up number betting.
const MR_RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
type MrBet = "red" | "black" | "green";
export function MiniRouletteRoom({ game }: { game: GameDef }) {
  const { room, stake, setStake, msg, setMsg } = useSimple(game, "European wheel, 0–36. Red or black pays ×2, green zero pays ×36.", "Bet red, black or green zero, set your stake and spin. Red or black pays ×2, green zero pays ×36.");
  const [bet, setBet] = useState<MrBet>("red");
  const [spun, setSpun] = useState<number | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<{ text: string; cls: string }>({ text: "Pick a colour and spin", cls: "" });
  // 2D canvas wheel controller (null until the canvas mounts).
  const mrRef = useRef<MiniRouletteHandle | null>(null);
  const [mrReady, setMrReady] = useState(false);
  const spin = async () => {
    if (spinning) return;
    setSpinning(true);
    setResult({ text: "No more bets…", cls: "" });
    const out = Math.floor(Math.random() * 37);
    const finish = async () => {
      setSpun(out);
      setSpinning(false);
      const colour = out === 0 ? "green" : MR_RED.has(out) ? "red" : "black";
      const mult = (bet === "red" && colour === "red") || (bet === "black" && colour === "black") ? 2 : bet === "green" && colour === "green" ? 36 : 0;
      const payout = Math.round(stake * mult * 100) / 100;
      if (mult > 0) {
        setResult({ text: `${out} ${colour.toUpperCase()} — ×${mult} · ${fmtCash(payout)}`, cls: "win" });
        setMsg(`It lands on ${out} ${colour} — your colour! ×${mult}: ${fmtCash(payout)} paid to your balance.`);
      } else {
        setResult({ text: `${out} ${colour.toUpperCase()} — no payout`, cls: "lose" });
        setMsg(`It lands on ${out} ${colour} — you were on ${bet}. The ${fmtCash(stake)} stake is gone.`);
      }
      await room.settle(stake, payout, { bet, out, colour });
    };
    // Canvas: the wheel spins 4400ms and lands on the pre-decided
    // pocket, then settles. DOM: the 900ms spin it replaces.
    if (mrRef.current) {
      mrRef.current.spin(out, () => void finish());
      return;
    }
    setTimeout(() => void finish(), 900);
  };
  const landedColour = spun === null ? null : spun === 0 ? "green" : MR_RED.has(spun) ? "red" : "black";
  return (
    <Shell game={game} subtitle="European wheel, 0–36. Red or black pays ×2, green zero pays ×36." stake={stake} setStake={setStake} msg={msg} stats={room.stats} history={room.history}>
      <div className={`mr-stage${mrReady ? " has-2d" : ""}`}>
        <MiniRoulette2D controllerRef={mrRef} onReady={setMrReady} />
        <div className={`mr-wheel${landedColour ? ` ${landedColour}` : ""}`}>{spun !== null ? spun : spinning ? "…" : "?"}</div>
        <div className={`mr-result${result.cls ? ` ${result.cls}` : ""}`}>{result.text}</div>
        <div className="mr-bets" role="group" aria-label="Bet on red, black or green">
          {(["red", "black", "green"] as MrBet[]).map((b) => (
            <button key={b} type="button" className={`xg-pick mr-bet-${b}`} aria-pressed={bet === b} onClick={() => setBet(b)}>
              <span className="xg-pick-txt">{b === "red" ? "Red" : b === "black" ? "Black" : "Green"}<small>{b === "green" ? "zero · pays ×36" : "pays ×2"}</small></span>
            </button>
          ))}
        </div>
      </div>
      <button className="btn btn-gold xg-action" type="button" onClick={() => void spin()} disabled={spinning}>{spinning ? "Spinning…" : `Spin on ${bet} · ${fmtCash(stake)}`}</button>
    </Shell>
  );
}

// ---------------- Spin Da Bottle ----------------
// v48 room, restored: the stage is the artifact's playable wheel —
// wood table, floating deco chips/coins, the saloon sub-line, and the
// wheel (conic UP/DOWN disc + gold hub) with the green glass bottle
// (the artifact's own SVG) spinning on it. The neck decides: it lands
// exactly up (+90°) or down (270°) after 4–6 full turns over 3.4s.
// The old room rendered the tile cover art as a small img on a bare
// orange stage, with a text "↑" for a bottle.
export function BottleRoom({ game, variant = "room" }: { game: GameDef; variant?: "room" | "home" }) {
  const { room, stake, setStake, msg, setMsg } = useSimple(game, "UP or DOWN — the bottle decides. Right call pays ×2.", "Pick a side, then spin — the bottle decides.");
  const [pick, setPick] = useState<"up" | "down">("up");
  const [angle, setAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [lost, setLost] = useState(false);
  const [knocked, setKnocked] = useState(false);
  const [history, setHistory] = useState<{ out: "up" | "down"; won: boolean }[]>([]);
  const [isPhone, setIsPhone] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  // Phone tier (artifact): the button never carries the win amount —
  // it reads just "Spin". Desktop keeps "Spin — win GH₵ X".
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const f = () => setIsPhone(mq.matches);
    f();
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);

  const burst = (stage: HTMLDivElement | null) => {
    if (!stage || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const wrap = stage.querySelector(".wheel-wrap");
    const r = wrap ? wrap.getBoundingClientRect() : stage.getBoundingClientRect();
    const sr = stage.getBoundingClientRect();
    for (let i = 0; i < 12; i++) {
      const c = document.createElement("span");
      c.className = "burst-coin";
      c.textContent = "₵";
      c.style.left = `${r.left - sr.left + r.width / 2 - 16}px`;
      c.style.top = `${r.top - sr.top + r.height / 2 - 16}px`;
      stage.appendChild(c);
      const ang = (i / 12) * Math.PI * 2, dist = 90 + Math.random() * 110;
      c.animate([
        { transform: "translate(0,0) scale(.6)", opacity: 1 },
        { transform: `translate(${Math.cos(ang) * dist}px,${Math.sin(ang) * dist - 40}px) scale(1.05)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${Math.cos(ang) * dist * 1.08}px,${Math.sin(ang) * dist + 90}px) scale(.9)`, opacity: 0 },
      ], { duration: 1050 + Math.random() * 350, easing: "cubic-bezier(.2,.8,.3,1)", fill: "forwards" });
      setTimeout(() => c.remove(), 1500);
    }
  };

  const spin = async () => {
    if (spinning) return;
    setSpinning(true);
    setLost(false);
    setKnocked(false);
    setMsg("Spinning… the bottle is flying round the wheel.");
    const result: "up" | "down" = Math.random() < 0.5 ? "up" : "down";
    // Land the neck exactly up (+90°) or down (270°) after 4–6 turns.
    const targetMod = result === "up" ? 90 : 270;
    const curMod = ((angle % 360) + 360) % 360;
    let delta = targetMod - curMod;
    if (delta <= 0) delta += 360;
    setAngle(angle + 360 * (4 + Math.floor(Math.random() * 3)) + delta);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTimeout(async () => {
      const won = result === pick;
      setSpinning(false);
      setHistory((h) => [{ out: result, won }, ...h].slice(0, 20));
      if (won) {
        setMsg(`${result.toUpperCase()}! You called it — +${fmtCash(stake * 2).replace(".00", "")} paid to your balance. Bottle stands tall.`);
        burst(stageRef.current);
      } else {
        setLost(true);
        setKnocked(true);
        setMsg(`${result.toUpperCase()} — not your side. The bottle's knocked over; spin again.`);
      }
      await room.settle(stake, won ? stake * 2 : 0, { pick, out: result });
    }, reduced ? 120 : 3450);
  };
  return (
    <Shell game={game} subtitle="UP or DOWN — the bottle decides. Right call pays ×2." stake={stake} setStake={setStake} msg={msg} stats={room.stats} history={room.history} variant={variant}>
      <div className={`bottle-stage${lost ? " lost" : ""}`} ref={stageRef}>
        <div className="wood-table" aria-hidden="true" />
        <span className="deco-chip" style={{ left: "3.5%", top: "14%", width: 44, height: 44, background: "#6D28B8" }} aria-hidden="true" />
        <span className="deco-chip" style={{ right: "4%", top: "16%", width: 38, height: 38, background: "#0E7A6D", animationDelay: "-2s" }} aria-hidden="true" />
        <span className="deco-chip" style={{ left: "7%", top: "34%", width: 34, height: 34, background: "#C22828", animationDelay: "-3.4s" }} aria-hidden="true" />
        <span className="deco-chip" style={{ right: "8%", top: "32%", width: 46, height: 46, background: "#17503C", animationDelay: "-1.2s" }} aria-hidden="true" />
        <span className="deco-coin" style={{ left: "14%", top: "20%", width: 32, height: 32, fontSize: 13 }} aria-hidden="true">₵</span>
        <span className="deco-coin" style={{ right: "15%", top: "23%", width: 28, height: 28, fontSize: 12, animationDelay: "-2.6s" }} aria-hidden="true">₵</span>
        <p className="bottle-sub">The saloon game · bottle pays ×2 — pick a side below and spin the playable wheel.</p>
        <div className="wheel-wrap">
          <div className="wheel-disc" aria-hidden="true" />
          <span className="wheel-label up" aria-hidden="true">UP</span>
          <span className="wheel-label down" aria-hidden="true">DOWN</span>
          <div className="wheel-hub" aria-hidden="true" />
          <div
            className={`bottle-el${knocked ? " knocked" : ""}`}
            style={{
              transform: `translate(-50%, -50%) rotate(${angle}deg)`,
              transition: spinning ? "transform 3.4s cubic-bezier(.12,.72,.08,1)" : undefined,
            }}
          >
            <img src="/covers/bottle-el.svg" alt="Glossy green glass bottle" style={{ width: "100%", height: "100%", display: "block" }} />
          </div>
        </div>
      </div>
      <div className="bottle-controls">
        <div className="pick-row" role="group" aria-label="Pick a side">
          <button className="pick-btn pick-up" type="button" aria-pressed={pick === "up"} onClick={() => setPick("up")}>▲ UP</button>
          <button className="pick-btn pick-down" type="button" aria-pressed={pick === "down"} onClick={() => setPick("down")}>▼ DOWN</button>
        </div>
        <button className="btn btn-gold xg-action bottle-spin-btn" type="button" onClick={() => void spin()} disabled={spinning}>
          {spinning ? "Spinning…" : isPhone ? "Spin" : `Spin — win ${fmtCash(stake * 2).replace(".00", "")}`}
        </button>
      </div>
      <div className="bottle-history" aria-label="Last spins">
        <span className="bh-lab">LAST SPINS</span>
        {history.length === 0 ? (
          <span className="bh-empty">No spins yet — yours will land here.</span>
        ) : (
          history.map((h, i) => (
            <span key={i} className={`bh-item${h.out === "down" ? " dn" : ""}${h.won ? " won" : " lost"}`} title={`${h.out.toUpperCase()} — ${h.won ? "won" : "lost"}`}>{h.out === "up" ? "U" : "D"}</span>
          ))
        )}
      </div>
    </Shell>
  );
}
