// Hero — v48 headline: PLAY [live slot] WIN REAL MONEY.
// Slot: bet 5 · pairs pay 10 · triples pay 120 · three 7s pay 500
// (all in GHS terms — scaled to the player's fiat by conversionRate/5,
// Phase 1 country-based, Nov 2026).
// NOTE: there is no slot endpoint in API_CONTRACT.md, and v48's
// localStorage wallet must not be carried over — so the hero slot is a
// free demo spin: no money moves, the prize is announced in the win line.
// (See final report.)

"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, fmtMoney } from "../lib/api";
import { useJackpot } from "../lib/jackpot";
import { useStore } from "../lib/store";
import { playSfx } from "../lib/store";
import { LIVE_WINS } from "../lib/tiles";
import type { HeroSlotHandle } from "./three/HeroSlot3D";

// Hero 3D slot (restored from the v48 artifact): client-only, so the
// Three.js scene never renders on the server. If WebGL is unavailable
// the DOM fallback/reels below show instead.
const HeroSlot3D = dynamic(() => import("./three/HeroSlot3D"), { ssr: false });

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
  const { toast, muted, user } = useStore();
  const { jackpotText, onlineText } = useJackpot();
  const [reels, setReels] = useState(["7", "♠", "♥"]);
  const [spun, setSpun] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [msg, setMsg] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  // 3D slot controller (null until the scene mounts / when WebGL is down).
  const slot3dRef = useRef<HeroSlotHandle | null>(null);
  const [slot3d, setSlot3d] = useState(false);
  // Phase 1 country-based (Nov 2026): the demo slot's bet + prizes are
  // GHS-term numbers scaled to the viewer's fiat (NGN: bet ₦500).
  const fiat = user?.currency ?? "GHS";
  const [factor, setFactor] = useState(1);
  const [minStake, setMinStake] = useState(1);
  useEffect(() => {
    let cancelled = false;
    api<{ currencies: { currency: string; conversionRate: number; minStake: number }[] }>("/api/games/config")
      .then((r) => {
        if (cancelled) return;
        const row = r.currencies?.find((c) => c.currency === fiat);
        if (row) {
          setFactor((row.conversionRate || 5) / 5);
          setMinStake(row.minStake || 1);
        }
      })
      .catch(() => { /* GHS defaults stay */ });
    return () => { cancelled = true; };
  }, [fiat]);
  const bet = 5 * factor;

  const finishSpin = useCallback((final: string[]) => {
    setReels(final);
    setSpinning(false);
    const p = prize(final[0], final[1], final[2]) * factor;
    if (p > 0) {
      setMsg(`You won ${fmtMoney(p, fiat)}!`);
      toast(`Slot win — ${fmtMoney(p, fiat)}`, "win");
      playSfx("cheer", muted);
    } else {
      setMsg("No win — spin again");
      playSfx("groan", muted);
    }
  }, [toast, muted, factor, fiat]);

  const spin = useCallback(() => {
    if (spinning) return;
    setSpinning(true);
    setSpun(true);
    setMsg("");
    playSfx("tick", muted);
    // Finals are picked up front: the 3D drums spin TO them (artifact
    // RGspin), and the DOM path settles on the same values.
    const finals = [0, 1, 2].map(() => Math.floor(Math.random() * SYMBOLS.length));
    const finalSymbols = finals.map((i) => SYMBOLS[i]);
    if (slot3dRef.current) {
      slot3dRef.current.spin(finals as [number, number, number], () => finishSpin(finalSymbols));
      return;
    }
    let ticks = 0;
    timer.current = setInterval(() => {
      ticks++;
      setReels([SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)], SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)], SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]]);
      if (ticks > 14) {
        if (timer.current) clearInterval(timer.current);
        finishSpin(finalSymbols);
      }
    }, 70);
  }, [spinning, muted, finishSpin]);

  // Dock play button (mobile bottom nav) spins the headline slot.
  useEffect(() => {
    const h = () => spin();
    window.addEventListener("rg:spin-slot", h);
    return () => window.removeEventListener("rg:spin-slot", h);
  }, [spin]);

  return (
    <section className="hero">
      <div className="wrap">
        <span className="hero-kicker"><i /> 2,300+ games · Instant MoMo payouts</span>
        <h1 className="headline">Play
          <span className="slot-frame" id="slotStage" role="group" aria-label="Slot machine — press spin to play">
            <span className={`slot-view${slot3d ? " has-3d" : ""}`}>
              <HeroSlot3D controllerRef={slot3dRef} onReady={setSlot3d} />
              {!spun ? (
                <span className="slot-fallback" aria-hidden="true">
                  <span className="fb-coin"><svg viewBox="0 0 24 24" width="26" height="26"><path fill="currentColor" d="M12 2C9 7 4 9 4 13a8 8 0 0 0 16 0c0-4-5-6-8-11z" /></svg></span>
                  <span>3D SLOT</span>
                </span>
              ) : (
                <span className="slot-reels" aria-hidden="true">
                  {reels.map((r, i) => (
                    <span key={i} className="slot-reel">{r}</span>
                  ))}
                </span>
              )}
            </span>
            <button className="slot-spin" id="slotSpin" aria-label="Spin the slot" onClick={spin} disabled={spinning}>{spinning ? "…" : "SPIN"}</button>
          </span>
          Win<br /><span className="rm"><span className="hollow">Real</span> <span className="gold-word">Money</span></span>
        </h1>
        <div className="slot-note">
          <span>Live slot · bet {fmtMoney(bet, fiat)} · three 7s pay {fmtMoney(500 * factor, fiat)} · pairs pay {fmtMoney(10 * factor, fiat)}</span>
          <span className="win-msg" id="slotMsg" aria-live="polite">{msg}</span>
        </div>

        <div className="hero-lower">
          <div>
            <p className="hero-sub">Slots, roulette, crash games and live tables — plus arcade favourites for a breather. <b>Deposit with Mobile Money in seconds</b>, play from {fmtMoney(minStake, fiat)}, and cash out straight back to your phone.</p>
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
              <div><b>GH₵ 9.4M</b><span>PAID OUT</span></div>
              <div><b>2,300+</b><span>GAMES ON THE FLOOR</span></div>
              <div><b>4 min</b><span>AVG CASH-OUT</span></div>
              <div><b>24/7</b><span>REAL-HUMAN SUPPORT</span></div>
            </div>
          </div>
          <div className="stage" id="stage">
            <img className="fox" src="/covers/hero-fox.webp" alt="Royale Gold fox mascot" />
            <div className="jackpot">
              <small><i /> MEGA JACKPOT · DROPS BEFORE GH₵ 500K</small>
              <strong className="jp-val">{jackpotText}</strong>
            </div>
            <div className="online-chip"><i /><span>{onlineText}</span>&nbsp;playing now</div>
            <div className="stage-caption">
              <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2C9 7 4 9 4 13a8 8 0 0 0 16 0c0-4-5-6-8-11z" /></svg>
              Your croupier deals a fresh hand every few seconds
            </div>
            <button className="btn btn-gold stage-spin" type="button" onClick={spin} disabled={spinning}>Spin the 3D slot · {fmtMoney(bet, fiat)}</button>
          </div>
        </div>
        {/* Phone-only jackpot strip: the export hides BOTH jackpot spots at
            ≤640px (header ticker + the .stage card), so no phone user could
            see the counter. This slim strip surfaces the same shared live
            counter under the hero on phone only — the heavy 3D stage / fox
            art stays hidden per the ≤640px lighten rules. */}
        <div className="jackpot-strip" aria-label="Mega jackpot">
          <small><i /> MEGA JACKPOT</small>
          <strong className="jp-val">{jackpotText}</strong>
        </div>
      </div>
      <div className="marquee" aria-label="Latest wins">
        <div className="marquee-track" id="winsTrack">
          <span className="mq-item mq-live"><i />LIVE WINS</span>
          {LIVE_WINS.map((w) => (
            <span key={w.name + w.amount} className="mq-item"><span className="mq-dot" />{w.name} won <b>{fmtMoney(w.amount * factor, fiat)}</b> on {w.game}</span>
          ))}
          <span className="mq-item mq-live"><i />LIVE WINS</span>
          {LIVE_WINS.map((w) => (
            <span key={w.name + w.amount + "-dup"} className="mq-item"><span className="mq-dot" />{w.name} won <b>{fmtMoney(w.amount * factor, fiat)}</b> on {w.game}</span>
          ))}
        </div>
      </div>
    </section>
  );
}
