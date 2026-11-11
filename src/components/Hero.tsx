// Hero — v48 headline: PLAY [live slot] WIN REAL MONEY.
// Slot: bet GH₵5 · pairs pay GH₵10 · triples pay GH₵120 · three 7s pay GH₵500.
// NOTE: there is no slot endpoint in API_CONTRACT.md, and v48's
// localStorage wallet must not be carried over — so the hero slot is a
// free demo spin: no money moves, the prize is announced in the win line.
// (See final report.)

"use client";

import { useCallback, useRef, useState } from "react";
import { useStore } from "../lib/store";
import { playSfx } from "../lib/store";

const SYMBOLS = ["7", "♠", "♥", "♦", "♣", "★"];
const PAYOUTS: Record<string, number> = {};

function prize(a: string, b: string, c: string): number {
  if (a === "7" && b === "7" && c === "7") return 500;
  if (a === b && b === c) return 120;
  if (a === b || b === c || a === c) return 10;
  return 0;
}
void PAYOUTS;

export default function Hero() {
  const { toast, muted } = useStore();
  const [reels, setReels] = useState(["7", "♠", "♥"]);
  const [spinning, setSpinning] = useState(false);
  const [msg, setMsg] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const spin = useCallback(() => {
    if (spinning) return;
    setSpinning(true);
    setMsg("");
    playSfx("tick", muted);
    let ticks = 0;
    timer.current = setInterval(() => {
      ticks++;
      setReels([SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)], SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)], SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]]);
      if (ticks > 14) {
        if (timer.current) clearInterval(timer.current);
        const final = [SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)], SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)], SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]];
        setReels(final);
        setSpinning(false);
        const p = prize(final[0], final[1], final[2]);
        if (p > 0) {
          setMsg(`You won GH₵ ${p}!`);
          toast(`Slot win — GH₵ ${p}`, "win");
          playSfx("cheer", muted);
        } else {
          setMsg("No win — spin again");
          playSfx("groan", muted);
        }
      }
    }, 70);
  }, [spinning, toast, muted]);

  return (
    <section className="hero">
      <div className="wrap">
        <span className="hero-kicker"><i /> 2,300+ games · Instant MoMo payouts</span>
        <h1 className="headline">Play
          <span className="slot-frame" id="slotStage" role="group" aria-label="Slot machine — press spin to play">
            <span className="slot-view">
              <span className="slot-reels" aria-hidden="true">
                {reels.map((r, i) => (
                  <span key={i} className="slot-reel">{r}</span>
                ))}
              </span>
            </span>
            <button className="slot-spin" id="slotSpin" aria-label="Spin the slot" onClick={spin} disabled={spinning}>{spinning ? "…" : "SPIN"}</button>
          </span>
          Win<br /><span className="rm"><span className="hollow">Real</span> <span className="gold-word">Money</span></span>
        </h1>
        <div className="slot-note">
          <span>Live demo slot · bet GH₵ 5 · three 7s pay GH₵ 500 · pairs pay GH₵ 10</span>
          <span className="win-msg" id="slotMsg" aria-live="polite">{msg}</span>
        </div>

        <div className="hero-lower">
          <div>
            <p className="hero-sub">Slots, roulette, crash games and live tables — plus arcade favourites for a breather. <b>Deposit with Mobile Money in seconds</b>, play from GH₵ 1, and cash out straight back to your phone.</p>
            <div className="hero-cta">
              <a className="btn btn-gold" href="#games">Play now <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 12h14M13 6l6 6-6 6" /></svg></a>
              <a className="btn btn-ghost" href="#stage">Watch the table</a>
              <button className="btn btn-ghost" type="button" onClick={() => toast("Welcome bonus — claim it on your first deposit", "info")}>Claim 100% bonus</button>
            </div>
            <div className="trust-row">
              <div>Built for licensed operators</div>
              <div>Payouts in under 5 minutes</div>
              <div>MoMo · Bank · Card</div>
            </div>
            <div className="hero-stats" aria-label="Platform highlights">
              <div><b>GH₵ 9.4M</b><span>PAID OUT · SAMPLE</span></div>
              <div><b>2,300+</b><span>GAMES ON THE FLOOR</span></div>
              <div><b>4 min</b><span>AVG CASH-OUT</span></div>
              <div><b>24/7</b><span>REAL-HUMAN SUPPORT</span></div>
            </div>
          </div>
          <div className="stage" id="stage">
            <img className="fox" src="/covers/hero-fox.webp" alt="Royale Gold fox mascot" />
          </div>
        </div>
      </div>
    </section>
  );
}
