// WalletCard — the /wallet card, styled like a VISA card (the user's
// reference), 3D-based. Dark felt/gold to match the site. The number is
// the wallet id's last 4 — never a real payment-card number. The card
// shows the cash balance for the active mode (round 20): REAL = cash,
// SIM = SIM balance labelled SIM. Tilt follows the VerbTilt pattern:
// hover-capable pointers only, a gentle float on touch, nothing moves
// under prefers-reduced-motion.

"use client";

import { useEffect, useRef } from "react";

export default function WalletCard({ holder, last4, balance, balanceLabel }: { holder: string; last4: string; balance: string; balanceLabel: string }) {
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
    <div className="wallet-card-wrap">
      <div className="wallet-card" ref={ref} role="img" aria-label={`Royale Gold wallet card for ${holder}, ${balanceLabel} ${balance}, ending ${last4}`}>
        <div className="wc-top">
          <svg className="wc-chip" viewBox="0 0 46 34" aria-hidden="true">
            <defs>
              <linearGradient id="wcChipGold" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#FFE89A" />
                <stop offset=".55" stopColor="#F2C230" />
                <stop offset="1" stopColor="#C99612" />
              </linearGradient>
            </defs>
            <rect x="1" y="1" width="44" height="32" rx="7" fill="url(#wcChipGold)" stroke="#8A6A10" strokeWidth="1" />
            <path d="M1 12h12M1 22h12M45 12H33M45 22H33M14 1v9M14 24v9M32 1v9M32 24v9" stroke="#8A6A10" strokeWidth="1.4" fill="none" />
            <rect x="14" y="12" width="18" height="10" rx="2" fill="none" stroke="#8A6A10" strokeWidth="1.4" />
          </svg>
          <span className="wc-brand">Royale Gold</span>
        </div>
        <div className="wc-bal">
          <small>{balanceLabel}</small>
          <b>{balance}</b>
        </div>
        <div className="wc-num">•••• •••• •••• {last4}</div>
        <div className="wc-bottom">
          <span className="wc-holder">
            <small>Card holder</small>
            <b>{holder}</b>
          </span>
          <span className="wc-visa" aria-hidden="true">VISA</span>
        </div>
      </div>
    </div>
  );
}
