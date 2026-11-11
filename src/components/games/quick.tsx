// Quick chance games — v48 room-factory games, payouts exactly as the
// export tiles / API contract state.
// Coin Flip ×2 · Dice exactly 7 ×5 · Lucky Wheel 12 segments (1×4, 2×2,
// 3×1, 1×0.5, 5 LOSE) · Hi-Lo chain ×1.9 · RPS ×2 · Limbo target×0.97
// (max ×19.4) · Red or Black chain to ×8 · War ×2 · Pick-a-Box ×1.8 ·
// Mini Roulette straight-up ×36 · Spin Da Bottle UP/DOWN ×2.

"use client";

import { useEffect, useRef, useState } from "react";
import { fmtCash } from "../../lib/api";
import { GameDef } from "../../lib/games";
import { RoomShell, StakeChips, useGameRoom } from "./shared";

function useSimple(game: GameDef, subtitle: string) {
  const room = useGameRoom(game);
  const [stake, setStake] = useState(10);
  const [msg, setMsg] = useState(subtitle);
  return { room, stake, setStake, msg, setMsg };
}

function Shell({ game, subtitle, stake, setStake, msg, children }: {
  game: GameDef; subtitle: string; stake: number; setStake: (n: number) => void; msg: string; children: React.ReactNode;
}) {
  const room = useGameRoom(game);
  return (
    <RoomShell game={game} subtitle={subtitle} stats={room.stats} history={room.history}>
      <div className="xg-controls">
        <StakeChips stake={stake} setStake={setStake} currency={game.currency} />
        {children}
        <p className="bottle-msg xg-msg">{msg}</p>
      </div>
    </RoomShell>
  );
}

// ---------------- Coin Flip ----------------
export function CoinFlipRoom({ game }: { game: GameDef }) {
  const { room, stake, setStake, msg, setMsg } = useSimple(game, "Call it — heads or tails, pays ×2.");
  const [pick, setPick] = useState<"heads" | "tails">("heads");
  const [flipping, setFlipping] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const flip = async () => {
    if (flipping) return;
    setFlipping(true);
    setResult(null);
    const out = Math.random() < 0.5 ? "heads" : "tails";
    setTimeout(async () => {
      setResult(out);
      setFlipping(false);
      const won = out === pick;
      setMsg(won ? `It landed ${out} — you called it! ${fmtCash(stake * 2)}` : `It landed ${out} — not your call.`);
      await room.settle(stake, won ? stake * 2 : 0, { pick, out });
    }, 700);
  };
  return (
    <Shell game={game} subtitle="Call it — heads or tails, pays ×2." stake={stake} setStake={setStake} msg={msg}>
      <div className="cf-stage">
        <div className={`cf-coin ${flipping ? "spin" : ""}`}>{result ? (result === "heads" ? "₵" : "★") : "?"}</div>
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
const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]], 2: [[30, 30], [70, 70]], 3: [[28, 28], [50, 50], [72, 72]],
  4: [[30, 30], [70, 30], [30, 70], [70, 70]], 5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[30, 28], [70, 28], [30, 50], [70, 50], [30, 72], [70, 72]],
};
function Die({ v }: { v: number }) {
  return (
    <div className="die" aria-label={`Die showing ${v}`}>
      {PIPS[v].map(([x, y], i) => <i key={i} style={{ left: `${x}%`, top: `${y}%` }} />)}
    </div>
  );
}
export function DiceRoom({ game }: { game: GameDef }) {
  const { room, stake, setStake, msg, setMsg } = useSimple(game, "Roll two dice — exactly 7 pays ×5.");
  const [dice, setDice] = useState<[number, number]>([3, 4]);
  const [rolling, setRolling] = useState(false);
  const roll = async () => {
    if (rolling) return;
    setRolling(true);
    const d1 = 1 + Math.floor(Math.random() * 6), d2 = 1 + Math.floor(Math.random() * 6);
    setTimeout(async () => {
      setDice([d1, d2]);
      setRolling(false);
      const total = d1 + d2;
      const won = total === 7;
      setMsg(won ? `Seven! ${d1} + ${d2} pays ×5 — ${fmtCash(stake * 5)}` : `${d1} + ${d2} = ${total} — not 7.`);
      await room.settle(stake, won ? stake * 5 : 0, { d1, d2, total });
    }, 600);
  };
  return (
    <Shell game={game} subtitle="Roll two dice — exactly 7 pays ×5." stake={stake} setStake={setStake} msg={msg}>
      <div className="dice-stage"><Die v={dice[0]} /><Die v={dice[1]} /></div>
      <button className="btn btn-gold xg-action" type="button" onClick={() => void roll()} disabled={rolling}>{rolling ? "Rolling…" : `Roll · ${fmtCash(stake)}`}</button>
    </Shell>
  );
}

// ---------------- Lucky Wheel ----------------
const WHEEL_SEGS: { label: string; mult: number }[] = [
  { label: "×4", mult: 4 }, { label: "LOSE", mult: 0 }, { label: "×2", mult: 2 }, { label: "LOSE", mult: 0 },
  { label: "×1", mult: 1 }, { label: "LOSE", mult: 0 }, { label: "×2", mult: 2 }, { label: "LOSE", mult: 0 },
  { label: "×0.5", mult: 0.5 }, { label: "LOSE", mult: 0 }, { label: "×1", mult: 1 }, { label: "×1", mult: 1 },
];
export function WheelRoom({ game }: { game: GameDef }) {
  const { room, stake, setStake, msg, setMsg } = useSimple(game, "One ×4, two ×2, three ×1 stake-back, one ×0.5 half-back, five LOSE.");
  const [angle, setAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const W = cv.width, cx = W / 2, cy = W / 2, R = W / 2 - 6;
    ctx.clearRect(0, 0, W, W);
    WHEEL_SEGS.forEach((s, i) => {
      const a0 = (angle * Math.PI) / 180 + (i * 2 * Math.PI) / 12;
      const a1 = a0 + (2 * Math.PI) / 12;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a0, a1); ctx.closePath();
      ctx.fillStyle = s.mult === 4 ? "#F2C230" : s.mult === 2 ? "#3ED97E" : s.mult === 1 ? "#2DD4BF" : s.mult === 0.5 ? "#FFD964" : "#141828";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,246,216,.35)"; ctx.stroke();
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(a0 + Math.PI / 12);
      ctx.fillStyle = s.mult === 0 ? "#E5322D" : "#231600";
      ctx.font = "bold 13px sans-serif"; ctx.textAlign = "right";
      ctx.fillText(s.label, R - 12, 5);
      ctx.restore();
    });
    ctx.fillStyle = "#F2C230";
    ctx.beginPath(); ctx.moveTo(cx - 10, 4); ctx.lineTo(cx + 10, 4); ctx.lineTo(cx, 26); ctx.closePath(); ctx.fill();
  }, [angle]);

  const spin = async () => {
    if (spinning) return;
    setSpinning(true);
    const seg = Math.floor(Math.random() * 12);
    // pointer at top: winning segment centre must land at -90deg
    const target = 360 * 5 + (360 - (seg * 30 + 15) - 90);
    const start = angle;
    const t0 = Date.now();
    const dur = 2600;
    const tick = () => {
      const p = Math.min(1, (Date.now() - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setAngle(start + (target - start) * eased);
      if (p < 1) requestAnimationFrame(tick);
      else {
        setSpinning(false);
        const w = WHEEL_SEGS[seg];
        setResult(w.label);
        const payout = Math.round(stake * w.mult * 100) / 100;
        setMsg(w.mult > 1 ? `Landed ${w.label} — ${fmtCash(payout)}!` : w.mult === 1 ? `Landed ×1 — stake back.` : w.mult === 0.5 ? `Landed ×0.5 — half back.` : "Landed LOSE — stake gone.");
        void room.settle(stake, payout, { segment: seg, mult: w.mult });
      }
    };
    tick();
  };
  return (
    <Shell game={game} subtitle="One ×4, two ×2, three ×1 stake-back, one ×0.5 half-back, five LOSE." stake={stake} setStake={setStake} msg={msg}>
      <div className="wheel-wrap"><canvas ref={canvasRef} width={340} height={340} className="wheel-canvas" /><div className="lw-result">{result ? `Landed ${result}` : "Place your stake and spin"}</div></div>
      <button className="btn btn-gold xg-action" type="button" onClick={() => void spin()} disabled={spinning}>{spinning ? "Spinning…" : `Spin · ${fmtCash(stake)}`}</button>
    </Shell>
  );
}

// ---------------- Hi-Lo ----------------
const CARD_RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const CARD_VAL: Record<string, number> = { "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13, A: 14 };
function drawCard() { return CARD_RANKS[Math.floor(Math.random() * CARD_RANKS.length)]; }
export function HiLoRoom({ game }: { game: GameDef }) {
  const { room, stake, setStake, msg, setMsg } = useSimple(game, "Guess higher or lower — every right call chains ×1.9. Cash out anytime.");
  const [card, setCard] = useState("7");
  useEffect(() => { setCard(drawCard()); }, []);
  const [chain, setChain] = useState(0);
  const [playing, setPlaying] = useState(false);
  const mult = Math.pow(1.9, chain);
  const start = () => { setCard(drawCard()); setChain(0); setPlaying(true); setMsg("Higher or lower than " + card + "?"); };
  const guess = async (dir: "hi" | "lo") => {
    if (!playing) return;
    const next = drawCard();
    const ok = dir === "hi" ? CARD_VAL[next] > CARD_VAL[card] : CARD_VAL[next] < CARD_VAL[card];
    setCard(next);
    if (ok) {
      const c = chain + 1;
      setChain(c);
      setMsg(`Right — ${next}! Chain ×${Math.pow(1.9, c).toFixed(2)} = ${fmtCash(Math.round(stake * Math.pow(1.9, c) * 100) / 100)}. Cash out or keep going.`);
    } else {
      setPlaying(false);
      setMsg(`Wrong — drew ${next}. The chain is gone.`);
      await room.settle(stake, 0, { chain, next });
    }
  };
  const cashOut = async () => {
    if (!playing || chain === 0) return;
    const payout = Math.round(stake * mult * 100) / 100;
    setPlaying(false);
    setMsg(`Cashed out at ×${mult.toFixed(2)} — ${fmtCash(payout)}.`);
    await room.settle(stake, payout, { chain });
  };
  return (
    <Shell game={game} subtitle="Guess higher or lower — every right call chains ×1.9. Cash out anytime." stake={stake} setStake={setStake} msg={msg}>
      <div className="hl-stage">
        <div className="hl-card">{card}<span>{CARD_VAL[card] >= 11 ? "♠" : "♥"}</span></div>
        <div className="hl-mult">Chain ×{mult.toFixed(2)} · {chain} right</div>
      </div>
      {!playing && <button className="btn btn-gold xg-action" type="button" onClick={start}>Start round</button>}
      {playing && (
        <div className="hl-btns">
          <button className="btn btn-gold" type="button" onClick={() => void guess("hi")}>Higher ↑</button>
          <button className="btn btn-ghost" type="button" onClick={() => void guess("lo")}>Lower ↓</button>
          <button className="btn btn-gold" type="button" onClick={() => void cashOut()} disabled={chain === 0}>Cash out {chain > 0 ? fmtCash(Math.round(stake * mult * 100) / 100) : ""}</button>
        </div>
      )}
    </Shell>
  );
}

// ---------------- Rock Paper Scissors ----------------
export function RpsRoom({ game }: { game: GameDef }) {
  const { room, stake, setStake, msg, setMsg } = useSimple(game, "Win the throw, ×2. A draw returns your stake.");
  const [you, setYou] = useState("");
  const [cpu, setCpu] = useState("");
  const throwHand = async (pick: string) => {
    const c = ["rock", "paper", "scissors"][Math.floor(Math.random() * 3)];
    setYou(pick); setCpu(c);
    const beats: Record<string, string> = { rock: "scissors", paper: "rock", scissors: "paper" };
    if (pick === c) { setMsg(`Draw — ${pick} vs ${c}. Stake back.`); await room.settle(stake, stake, { pick, cpu: c, draw: true }); }
    else if (beats[pick] === c) { setMsg(`${pick} beats ${c} — ×2, ${fmtCash(stake * 2)}!`); await room.settle(stake, stake * 2, { pick, cpu: c }); }
    else { setMsg(`${c} beats ${pick} — stake gone.`); await room.settle(stake, 0, { pick, cpu: c }); }
  };
  const glyph = (h: string) => (h === "rock" ? "✊" : h === "paper" ? "✋" : h === "scissors" ? "✌" : "?");
  return (
    <Shell game={game} subtitle="Win the throw, ×2. A draw returns your stake." stake={stake} setStake={setStake} msg={msg}>
      <div className="rps-stage"><span className="rps-hand">{glyph(you)}</span><span className="rps-versus">VS</span><span className="rps-hand">{glyph(cpu)}</span></div>
      <div className="rps-btns">
        {(["rock", "paper", "scissors"] as const).map((p) => (
          <button key={p} type="button" className="btn btn-gold" onClick={() => void throwHand(p)}>{glyph(p)} {p}</button>
        ))}
      </div>
    </Shell>
  );
}

// ---------------- Limbo ----------------
export function LimboRoom({ game }: { game: GameDef }) {
  const { room, stake, setStake, msg, setMsg } = useSimple(game, "Pick a target multiplier — the roll must clear it. Pays target × 0.97.");
  const [target, setTarget] = useState(2);
  const [rolled, setRolled] = useState<number | null>(null);
  const roll = async () => {
    // Roll a multiplier from the house curve; win iff roll >= target.
    const u = Math.random();
    const rollVal = Math.round((0.97 / Math.max(u, 0.001)) * 100) / 100;
    const capped = Math.min(rollVal, 100);
    setRolled(capped);
    const won = capped >= target;
    const payout = won ? Math.round(stake * target * 0.97 * 100) / 100 : 0;
    setMsg(won ? `Rolled ×${capped} — clears ×${target}! Pays ×${(target * 0.97).toFixed(2)} = ${fmtCash(payout)}` : `Rolled ×${capped} — under ×${target}.`);
    await room.settle(stake, payout, { target, rolled: capped });
  };
  return (
    <Shell game={game} subtitle="Pick a target multiplier — the roll must clear it. Pays target × 0.97." stake={stake} setStake={setStake} msg={msg}>
      <div className="lm-stage">
        <div className="lm-need">Target <b>×{target.toFixed(2)}</b> · pays <b>×{(target * 0.97).toFixed(2)}</b></div>
        <div className="lm-slider"><input type="range" min={1.1} max={20} step={0.1} value={target} onChange={(e) => setTarget(Number(e.target.value))} aria-label="Target multiplier" /><span className="lm-target">×{target.toFixed(1)}</span></div>
        <div className="lm-roll">{rolled !== null ? <>Rolled <b>×{rolled}</b></> : "No roll yet"}</div>
      </div>
      <button className="btn btn-gold xg-action" type="button" onClick={() => void roll()}>Roll · {fmtCash(stake)}</button>
    </Shell>
  );
}

// ---------------- Red or Black ----------------
export function RedBlackRoom({ game }: { game: GameDef }) {
  const { room, stake, setStake, msg, setMsg } = useSimple(game, "Call red or black — each right call doubles. Chain to ×8, cash out anytime.");
  const [chain, setChain] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [last, setLast] = useState("");
  const mult = Math.pow(2, chain);
  const start = () => { setChain(0); setPlaying(true); setLast(""); setMsg("Red or black?"); };
  const guess = async (pick: "red" | "black") => {
    if (!playing) return;
    const out = Math.random() < 0.5 ? "red" : "black";
    setLast(out);
    if (out === pick) {
      const c = chain + 1;
      setChain(c);
      if (c >= 3) {
        const payout = Math.round(stake * 8 * 100) / 100;
        setPlaying(false);
        setMsg(`Three in a row — ×8! ${fmtCash(payout)}`);
        await room.settle(stake, payout, { chain: c });
      } else setMsg(`Right — ${out}! Chain ×${Math.pow(2, c)}. Cash out or keep going.`);
    } else {
      setPlaying(false);
      setMsg(`Wrong — it was ${out}. The chain is gone.`);
      await room.settle(stake, 0, { chain, out });
    }
  };
  const cashOut = async () => {
    if (!playing || chain === 0) return;
    const payout = Math.round(stake * mult * 100) / 100;
    setPlaying(false);
    setMsg(`Cashed out at ×${mult} — ${fmtCash(payout)}.`);
    await room.settle(stake, payout, { chain });
  };
  return (
    <Shell game={game} subtitle="Call red or black — each right call doubles. Chain to ×8, cash out anytime." stake={stake} setStake={setStake} msg={msg}>
      <div className="rb-stage"><div className={`rb-card ${last}`}>{last ? (last === "red" ? "♥ RED" : "♠ BLACK") : "?"}</div><div className="rb-mult">Chain ×{mult} · {chain} right</div></div>
      {!playing && <button className="btn btn-gold xg-action" type="button" onClick={start}>Start round</button>}
      {playing && (
        <div className="rb-btns">
          <button className="btn rb-red" type="button" onClick={() => void guess("red")}>Red ♥</button>
          <button className="btn rb-black" type="button" onClick={() => void guess("black")}>Black ♠</button>
          <button className="btn btn-gold" type="button" onClick={() => void cashOut()} disabled={chain === 0}>Cash out {chain > 0 ? fmtCash(Math.round(stake * mult * 100) / 100) : ""}</button>
        </div>
      )}
    </Shell>
  );
}

// ---------------- War ----------------
export function WarRoom({ game }: { game: GameDef }) {
  const { room, stake, setStake, msg, setMsg } = useSimple(game, "Higher card wins ×2. A tie returns your stake.");
  const [you, setYou] = useState("?");
  const [dealer, setDealer] = useState("?");
  const deal = async () => {
    const y = drawCard(), d = drawCard();
    setYou(y); setDealer(d);
    if (CARD_VAL[y] > CARD_VAL[d]) { setMsg(`${y} beats ${d} — ×2, ${fmtCash(stake * 2)}!`); await room.settle(stake, stake * 2, { you: y, dealer: d }); }
    else if (CARD_VAL[y] < CARD_VAL[d]) { setMsg(`${d} beats ${y} — stake gone.`); await room.settle(stake, 0, { you: y, dealer: d }); }
    else { setMsg(`Tie on ${y} — stake back.`); await room.settle(stake, stake, { you: y, dealer: d, draw: true }); }
  };
  return (
    <Shell game={game} subtitle="Higher card wins ×2. A tie returns your stake." stake={stake} setStake={setStake} msg={msg}>
      <div className="wr-stage"><div className="hl-card">{you}</div><span className="rps-versus">VS</span><div className="hl-card">{dealer}</div></div>
      <button className="btn btn-gold xg-action" type="button" onClick={() => void deal()}>Deal · {fmtCash(stake)}</button>
    </Shell>
  );
}

// ---------------- Pick-a-Box ----------------
export function PickBoxRoom({ game }: { game: GameDef }) {
  const { room, stake, setStake, msg, setMsg } = useSimple(game, "Three boxes, one gold. Find it — ×1.8.");
  const [gold, setGold] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [round, setRound] = useState(0);
  const pick = async (i: number) => {
    if (picked !== null) return;
    setPicked(i);
    const won = i === gold;
    setMsg(won ? `Gold! ×1.8 — ${fmtCash(Math.round(stake * 1.8 * 100) / 100)}` : `Empty — the gold was box ${gold + 1}.`);
    await room.settle(stake, won ? Math.round(stake * 1.8 * 100) / 100 : 0, { picked: i, gold });
  };
  const next = () => { setGold(Math.floor(Math.random() * 3)); setPicked(null); setRound((r) => r + 1); };
  return (
    <Shell game={game} subtitle="Three boxes, one gold. Find it — ×1.8." stake={stake} setStake={setStake} msg={msg}>
      <div className="pb-stage" key={round}>
        {[0, 1, 2].map((i) => (
          <button key={i} type="button" className={`pb-box ${picked !== null ? (i === gold ? "gold" : i === picked ? "empty" : "") : ""}`} onClick={() => void pick(i)} disabled={picked !== null}>
            {picked !== null ? (i === gold ? "★ GOLD" : "empty") : `Box ${i + 1}`}
          </button>
        ))}
      </div>
      {picked !== null && <button className="btn btn-ghost xg-action" type="button" onClick={next}>Play again</button>}
    </Shell>
  );
}

// ---------------- Mini Roulette ----------------
export function MiniRouletteRoom({ game }: { game: GameDef }) {
  const { room, stake, setStake, msg, setMsg } = useSimple(game, "Pick a number 0–36 — a straight hit pays ×36.");
  const [pick, setPick] = useState(7);
  const [spun, setSpun] = useState<number | null>(null);
  const [spinning, setSpinning] = useState(false);
  const spin = async () => {
    if (spinning) return;
    setSpinning(true);
    const out = Math.floor(Math.random() * 37);
    setTimeout(async () => {
      setSpun(out);
      setSpinning(false);
      const won = out === pick;
      setMsg(won ? `Number ${out} — straight hit! ×36 = ${fmtCash(stake * 36)}` : `Landed ${out} — not ${pick}.`);
      await room.settle(stake, won ? stake * 36 : 0, { pick, out });
    }, 900);
  };
  return (
    <Shell game={game} subtitle="Pick a number 0–36 — a straight hit pays ×36." stake={stake} setStake={setStake} msg={msg}>
      <div className="mr-stage">
        <div className="mr-wheel">{spun !== null ? spun : spinning ? "…" : "?"}</div>
        <div className="mr-nums">
          {Array.from({ length: 37 }, (_, n) => (
            <button key={n} type="button" className={pick === n ? "on" : ""} onClick={() => setPick(n)}>{n}</button>
          ))}
        </div>
      </div>
      <button className="btn btn-gold xg-action" type="button" onClick={() => void spin()} disabled={spinning}>{spinning ? "Spinning…" : `Spin on ${pick} · ${fmtCash(stake)}`}</button>
    </Shell>
  );
}

// ---------------- Spin Da Bottle ----------------
export function BottleRoom({ game }: { game: GameDef }) {
  const { room, stake, setStake, msg, setMsg } = useSimple(game, "UP or DOWN — the bottle decides. Right call pays ×2.");
  const [pick, setPick] = useState<"up" | "down">("up");
  const [angle, setAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [out, setOut] = useState("");
  const spin = async () => {
    if (spinning) return;
    setSpinning(true);
    const result = Math.random() < 0.5 ? "up" : "down";
    const target = angle + 720 + (result === "up" ? 0 : 180);
    setAngle(target);
    setTimeout(async () => {
      setOut(result);
      setSpinning(false);
      const won = result === pick;
      setMsg(won ? `Bottle points ${result.toUpperCase()} — you called it! ×2 = ${fmtCash(stake * 2)}` : `Bottle points ${result.toUpperCase()} — not your call.`);
      await room.settle(stake, won ? stake * 2 : 0, { pick, out: result });
    }, 1200);
  };
  return (
    <Shell game={game} subtitle="UP or DOWN — the bottle decides. Right call pays ×2." stake={stake} setStake={setStake} msg={msg}>
      <div className="bottle-stage">
        <img src="/covers/spin-da-bottle-art.png" alt="Spin Da Bottle art" className="bottle-art" />
        <div className="bottle-pointer" style={{ transform: `rotate(${angle}deg)` }}>↑</div>
        <div className="bottle-out">{out ? `Points ${out.toUpperCase()}` : "Spin the bottle"}</div>
        <div className="cf-picks">
          {(["up", "down"] as const).map((p) => (
            <button key={p} type="button" className="xg-pick" aria-pressed={pick === p} onClick={() => setPick(p)}>{p.toUpperCase()}</button>
          ))}
        </div>
      </div>
      <button className="btn btn-gold xg-action" type="button" onClick={() => void spin()} disabled={spinning}>{spinning ? "Spinning…" : `Spin · ${fmtCash(stake)}`}</button>
    </Shell>
  );
}
