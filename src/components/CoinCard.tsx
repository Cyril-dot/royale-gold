// CoinCard — the /wallet coins card (round 20), a proper card in the
// same premium style as the Visa WalletCard: same 3D tilt, same felt/gold
// feel, but coin-themed — gold-forward, a drawn coin disc, a "ROYALE
// COINS" wordmark. Shows the coins balance prominently. Tilt follows the
// VerbTilt pattern (copied from WalletCard): hover-capable pointers only,
// a gentle float on touch, nothing moves under prefers-reduced-motion.
// No overflow:hidden on the card — it would flatten the 3D depth; the
// sheen + felt overlays carry the radius instead.

"use client";

import { useEffect, useRef } from "react";

export default function CoinCard({ holder, coins }: { holder: string; coins: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const card = ref.current;
    if (!card) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !window.matchMedia("(hover: hover)").matches) return;
    let leaveTimer: ReturnType<typeof setTimeout> | null = null;
    card.style.transition = "transform .18s ease-out";
    const onMove = (e: PointerEvent) => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `rotateY(${(x * 12).toFixed(2)}deg) rotateX(${(-y * 12).toFixed(2)}deg)`;
      card.style.setProperty("--mx", `${((x + 0.5) * 100).toFixed(1)}%`);
      card.style.setProperty("--my", `${((y + 0.5) * 100).toFixed(1)}%`);
      card.style.setProperty("--shx", `${(-x * 18).toFixed(1)}px`);
      card.style.setProperty("--shy", `${(20 - y * 14).toFixed(1)}px`);
    };
    const onLeave = () => {
      card.style.transition = "transform .55s cubic-bezier(.2,.8,.3,1)";
      card.style.transform = "";
      card.style.setProperty("--mx", "50%");
      card.style.setProperty("--my", "40%");
      card.style.setProperty("--shx", "0px");
      card.style.setProperty("--shy", "20px");
      leaveTimer = setTimeout(() => { card.style.transition = "transform .18s ease-out"; }, 560);
    };
    card.addEventListener("pointermove", onMove);
    card.addEventListener("pointerleave", onLeave);
    return () => {
      if (leaveTimer) clearTimeout(leaveTimer);
      card.removeEventListener("pointermove", onMove);
      card.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div className="coin-card-wrap">
      <div className="coin-card" ref={ref} role="img" aria-label={`Royale Gold coins card for ${holder}, ${coins} coins`}>
        <span className="cc-ghost" aria-hidden="true">◉</span>
        <div className="cc-top">
          <span className="cc-coin" aria-hidden="true">◉</span>
          <span className="cc-brand">Royale Coins</span>
        </div>
        <div className="cc-bal">
          <small>Coins balance</small>
          <b>{coins} <span className="cc-coin-mark" aria-hidden="true">◉</span></b>
        </div>
        <div className="cc-bottom">
          <span className="cc-holder">
            <small>Card holder</small>
            <b>{holder}</b>
          </span>
          <span className="cc-mark" aria-hidden="true">◉</span>
        </div>
      </div>
    </div>
  );
}
