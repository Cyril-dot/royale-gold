// Round 18 — Golden Reels. A proper 3-reel slot machine: drawn SVG
// symbols on spinning reels, a payline, and a paytable. Three of a kind
// pays (777 ×20, BAR ×10, Bell ×5, Cherry ×3, Lemon/Coin ×2); any pair
// pays the stake back. Reels spin one after another and settle left to
// right, like a real machine.
// Ref: johakr/html5-slot-machine (reel strip + Web Animations spin).

"use client";

import { useId, useRef, useState } from "react";
import { fmtMoney } from "../../lib/api";
import { GameDef } from "../../lib/games";
import { playSfx } from "../../lib/store";
import { RoomShell, StakeChips, useGameRoom } from "./shared";

type Sym = "seven" | "bar" | "bell" | "cherry" | "lemon" | "coin";
const SYMS: Sym[] = ["seven", "bar", "bell", "cherry", "cherry", "lemon", "lemon", "coin"];
const PAY: Record<Sym, number> = { seven: 20, bar: 10, bell: 5, cherry: 3, lemon: 2, coin: 2 };

function SymArt({ s }: { s: Sym }) {
  // Real drawn symbols: gradients, shading and highlights on every
  // face — no flat text tiles. Gradient ids are namespaced per
  // instance (three reels render the same symbol) via useId.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  if (s === "seven") return (
    <svg viewBox="0 0 60 60" aria-hidden="true">
      <defs><linearGradient id={`g7-${uid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFE9A8" /><stop offset=".45" stopColor="#F2C230" /><stop offset="1" stopColor="#B8860B" /></linearGradient></defs>
      <text x="30" y="45" textAnchor="middle" fontSize="40" fontWeight="900" fontFamily="Georgia, serif" fill={`url(#g7-${uid})`} stroke="#7A5200" strokeWidth="1.6" strokeLinejoin="round">7</text>
      <path d="M22 16 L28 14 L24 26" fill="none" stroke="#FFF6D8" strokeWidth="2" strokeLinecap="round" opacity=".85" />
    </svg>
  );
  if (s === "bar") return (
    <svg viewBox="0 0 60 60" aria-hidden="true">
      <defs><linearGradient id={`gb-${uid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3A2E00" /><stop offset=".5" stopColor="#1E1600" /><stop offset="1" stopColor="#0A0600" /></linearGradient>
      <linearGradient id={`gbt-${uid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFE9A8" /><stop offset="1" stopColor="#C99612" /></linearGradient></defs>
      <rect x="6" y="20" width="48" height="20" rx="5" fill={`url(#gb-${uid})`} stroke={`url(#gbt-${uid})`} strokeWidth="2.5" />
      <rect x="10" y="23" width="40" height="3" rx="1.5" fill="#FFD964" opacity=".5" />
      <text x="30" y="36" textAnchor="middle" fontSize="12" fontWeight="900" letterSpacing="2" fill="#FFD964" stroke="#7A5200" strokeWidth=".4">BAR</text>
    </svg>
  );
  if (s === "bell") return (
    <svg viewBox="0 0 60 60" aria-hidden="true">
      <defs><linearGradient id={`gl-${uid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFF3C4" /><stop offset=".45" stopColor="#F2C230" /><stop offset="1" stopColor="#B8860B" /></linearGradient></defs>
      <rect x="26" y="7" width="8" height="6" rx="2.5" fill="#B8860B" stroke="#7A5200" strokeWidth="1" />
      <path d="M30 12 C19 20 13 28 13 38 a4 4 0 0 0 4 4 h26 a4 4 0 0 0 4-4 C47 28 41 20 30 12z" fill={`url(#gl-${uid})`} stroke="#7A5200" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M19 20 C15 27 13 32 13 37" fill="none" stroke="#FFF6D8" strokeWidth="2.5" strokeLinecap="round" opacity=".8" />
      <circle cx="30" cy="47" r="4.5" fill="#B8860B" stroke="#7A5200" strokeWidth="1" />
      <circle cx="28.5" cy="45.5" r="1.2" fill="#FFF6D8" opacity=".9" />
    </svg>
  );
  if (s === "cherry") return (
    <svg viewBox="0 0 60 60" aria-hidden="true">
      <defs><radialGradient id={`gc-${uid}`} cx=".35" cy=".3" r=".95"><stop offset="0" stopColor="#FF8A85" /><stop offset=".5" stopColor="#E5322D" /><stop offset="1" stopColor="#7A0F0F" /></radialGradient></defs>
      <path d="M30 12 C28 22 22 28 17 32 M30 12 C32 22 38 28 43 32" fill="none" stroke="#2E7D32" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M30 12 q11-7 16-1 q-7 7-16 1z" fill="#3ED97E" stroke="#1E6B2E" strokeWidth="1" />
      <circle cx="17" cy="41" r="11.5" fill={`url(#gc-${uid})`} stroke="#7A0F0F" strokeWidth="1.4" />
      <circle cx="43" cy="41" r="11.5" fill={`url(#gc-${uid})`} stroke="#7A0F0F" strokeWidth="1.4" />
      <circle cx="13" cy="37" r="3" fill="#FFB3B0" opacity=".9" />
      <circle cx="39" cy="37" r="3" fill="#FFB3B0" opacity=".9" />
    </svg>
  );
  if (s === "lemon") return (
    <svg viewBox="0 0 60 60" aria-hidden="true">
      <defs><linearGradient id={`gm-${uid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFF3C4" /><stop offset=".5" stopColor="#FFD964" /><stop offset="1" stopColor="#D9A41C" /></linearGradient></defs>
      <ellipse cx="30" cy="32" rx="21" ry="13.5" fill={`url(#gm-${uid})`} stroke="#8A6D1B" strokeWidth="1.8" transform="rotate(-18 30 32)" />
      <ellipse cx="24" cy="27" rx="9" ry="4" fill="#FFF6D8" opacity=".55" transform="rotate(-18 24 27)" />
      <circle cx="11" cy="41" r="3.2" fill="#C99612" />
      <circle cx="49" cy="23" r="3.2" fill="#C99612" />
      <path d="M49 23 q5-4 7-1" fill="none" stroke="#2E7D32" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
  return (
    <svg viewBox="0 0 60 60" aria-hidden="true">
      <defs><radialGradient id={`gn-${uid}`} cx=".35" cy=".3" r=".95"><stop offset="0" stopColor="#FFE9A8" /><stop offset=".5" stopColor="#F2C230" /><stop offset="1" stopColor="#B8860B" /></radialGradient></defs>
      <circle cx="30" cy="30" r="20" fill={`url(#gn-${uid})`} stroke="#7A5200" strokeWidth="2.2" />
      <circle cx="30" cy="30" r="14.5" fill="none" stroke="#7A5200" strokeWidth="1.4" strokeDasharray="3 2.5" />
      <circle cx="30" cy="30" r="11" fill="#C99612" opacity=".35" />
      <text x="30" y="36.5" textAnchor="middle" fontSize="15" fontWeight="900" fill="#231600">₵</text>
      <path d="M18 20 A15 15 0 0 1 30 15" fill="none" stroke="#FFF6D8" strokeWidth="2.5" strokeLinecap="round" opacity=".8" />
    </svg>
  );
}

function randSym(): Sym { return SYMS[Math.floor(Math.random() * SYMS.length)]; }

export function GoldenReelsRoom({ game }: { game: GameDef }) {
  const room = useGameRoom(game);
  const [stake, setStake] = useState(10);
  const [reels, setReels] = useState<Sym[]>(["seven", "bar", "cherry"]);
  const [spinning, setSpinning] = useState(false);
  const [win, setWin] = useState<number | null>(null);
  const [msg, setMsg] = useState("Spin the reels — three of a kind pays, 777 pays ×20. Any pair pays your stake back.");
  const timersRef = useRef<number[]>([]);

  const spin = async () => {
    if (spinning) return;
    if (room.balance < stake) { setMsg("Balance too low for that stake."); return; }
    setSpinning(true);
    setWin(null);
    playSfx("spin", room.muted);
    const result: Sym[] = [randSym(), randSym(), randSym()];
    // Reels cycle fast, then stop left → right.
    const iv = window.setInterval(() => {
      setReels([randSym(), randSym(), randSym()]);
    }, 70);
    timersRef.current.push(iv);
    const stopAt = (idx: number, ms: number) => {
      const t = window.setTimeout(() => {
        setReels((prev) => { const n = [...prev]; n[idx] = result[idx]; return n; });
      }, ms);
      timersRef.current.push(t);
    };
    stopAt(0, 600);
    stopAt(1, 1000);
    stopAt(2, 1400);
    const fin = window.setTimeout(() => {
      window.clearInterval(iv);
      setReels(result);
      setSpinning(false);
      const [a, b, c] = result;
      let mult = 0;
      let label = "";
      if (a === b && b === c) { mult = PAY[a]; label = `Three ${a === "seven" ? "7s" : a === "bar" ? "BARs" : a + "s"} — ×${mult}!`; }
      else if (a === b || b === c || a === c) { mult = 1; label = "A pair — stake back."; }
      const payout = Math.round(stake * mult * 100) / 100;
      setWin(mult > 0 ? mult : null);
      setMsg(mult > 0 ? `${label} ${fmtMoney(payout, room.user?.currency ?? "GHS")}` : "No match — spin again.");
      void room.settle(stake, payout, { reels: result, mult });
    }, 1450);
    timersRef.current.push(fin);
  };

  return (
    <RoomShell game={game} subtitle="Three reels, one payline — 777 pays ×20, any pair pays your stake back." stats={room.stats} history={room.history}>
      <div className="xg-controls">
        <StakeChips stake={stake} setStake={setStake} currency="cash" disabled={spinning} />
        <div className="v18-stage">
          <div className="v18-reels" aria-label="Slot reels">
            {reels.map((s, i) => (
              <div key={i} className={`v18-reel${spinning ? " spinning" : ""}`}>
                <div className="v18-reel-strip"><div className="v18-sym"><SymArt s={s} /></div></div>
              </div>
            ))}
            <div className="v18-payline" aria-hidden="true" />
          </div>
          <p className="v18-sub">{win ? `Last spin paid ×${win}` : "Match three on the red line to win"}</p>
          <div className="v18-paytable" aria-label="Paytable">
            <span>Three 7s <b>×20</b></span><span>Three BARs <b>×10</b></span>
            <span>Three Bells <b>×5</b></span><span>Three Cherries <b>×3</b></span>
            <span>Three Lemons <b>×2</b></span><span>Three Coins <b>×2</b></span>
            <span>Any pair <b>×1</b></span><span>No match <b>×0</b></span>
          </div>
        </div>
        <button className="btn btn-gold xg-action" type="button" onClick={() => void spin()} disabled={spinning}>{spinning ? "Spinning…" : `Spin · ${fmtMoney(stake, room.user?.currency ?? "GHS")}`}</button>
        <p className="bottle-msg xg-msg">{msg}</p>
      </div>
    </RoomShell>
  );
}
