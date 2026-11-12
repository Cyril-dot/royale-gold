// VerbTilt — the v48 artifact's steps-3d module, ported faithfully.
// Wraps one how-it-works card's inner .verb-tilt (the <article class="verb">
// is the parent). Entrance: the card is visible by default; when the
// scroll observer fires, a one-shot fold-in runs via element.animate()
// and the card settles back to its natural visible state. Tilt: on
// hover-capable pointers the inner .verb-tilt follows the mouse, and the
// gold sheen hot spot plus the drop shadow shift with it via CSS vars.
// Touch never gets the tilt — v48.css gives those cards a gentle idle
// float (verbFloat) instead. Reduced motion: no entrance, nothing moves.
// Also exports useGameCardTilt — the artifact's applyTilt/clearTilt/
// releaseTilt for premium game cards (.ez-card, .game.g-beginner,
// .gp-card[data-beginner]): a document-level pointer handler that tilts
// the card under the pointer and releases it 150ms after pointerup.

"use client";

import { useEffect, useRef } from "react";

export default function VerbTilt({ index, children }: { index: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tilt = ref.current;
    if (!tilt) return;
    const card = tilt.closest("article.verb") as HTMLElement | null;
    if (!card) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let io: IntersectionObserver | null = null;
    let leaveTimer: ReturnType<typeof setTimeout> | null = null;

    // Entrance: one-shot fold-in, only when the observer actually fires.
    if (!reduced && "IntersectionObserver" in window) {
      io = new IntersectionObserver((entries) => {
        for (const en of entries) {
          if (!en.isIntersecting) continue;
          const c = en.target as HTMLElement;
          io?.unobserve(c);
          if (!c.animate) continue; // no animation API: card stays visible
          c.animate(
            [
              { opacity: 0, transform: "perspective(1100px) rotateX(42deg) translateY(52px)", transformOrigin: "50% 100%" },
              { opacity: 1, transform: "perspective(1100px) rotateX(0deg) translateY(0px)", transformOrigin: "50% 100%" },
            ],
            { duration: 1000, delay: index * 140, easing: "cubic-bezier(.16,.84,.3,1)", fill: "backwards" },
          );
        }
      }, { threshold: 0.25 });
      io.observe(card);
    }

    // Tilt: hover-capable pointers only.
    if (reduced || !window.matchMedia("(hover: hover)").matches) {
      return () => { io?.disconnect(); };
    }
    tilt.style.transition = "transform .18s ease-out";
    const onMove = (e: PointerEvent) => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      tilt.style.transform = `rotateY(${x * 11}deg) rotateX(${-y * 11}deg)`;
      tilt.style.setProperty("--mx", `${(x + 0.5) * 100}%`);
      tilt.style.setProperty("--my", `${(y + 0.5) * 100}%`);
      tilt.style.setProperty("--shx", `${-x * 20}px`);
      tilt.style.setProperty("--shy", `${22 - y * 16}px`);
    };
    const onLeave = () => {
      tilt.style.transition = "transform .55s cubic-bezier(.2,.8,.3,1)";
      tilt.style.transform = "";
      tilt.style.setProperty("--mx", "50%");
      tilt.style.setProperty("--my", "40%");
      tilt.style.setProperty("--shx", "0px");
      tilt.style.setProperty("--shy", "22px");
      leaveTimer = setTimeout(() => { tilt.style.transition = "transform .18s ease-out"; }, 560);
    };
    card.addEventListener("pointermove", onMove);
    card.addEventListener("pointerleave", onLeave);
    return () => {
      io?.disconnect();
      if (leaveTimer) clearTimeout(leaveTimer);
      card.removeEventListener("pointermove", onMove);
      card.removeEventListener("pointerleave", onLeave);
    };
  }, [index]);

  return (
    <div className="verb-tilt" ref={ref}>
      {children}
    </div>
  );
}

// ---- game-card tilt (artifact applyTilt / clearTilt / releaseTilt) ----
let tiltEl: HTMLElement | null = null;
let gameTiltAttached = false;

function premiumCard(el: Element | null): el is HTMLElement {
  return !!el && (
    el.classList.contains("ez-card") ||
    el.classList.contains("g-beginner") ||
    (el.classList.contains("gp-card") && el.hasAttribute("data-beginner"))
  );
}

function applyTilt(el: HTMLElement, x: number, y: number) {
  const r = el.getBoundingClientRect();
  if (!r.width) return;
  const px = (x - r.left) / r.width - 0.5;
  const py = (y - r.top) / r.height - 0.5;
  el.classList.add("tilting");
  el.style.transform = `perspective(900px) rotateX(${(-py * 10).toFixed(2)}deg) rotateY(${(px * 12).toFixed(2)}deg) translateY(-4px) scale(1.02)`;
}

function clearTilt(el: HTMLElement | null) {
  if (!el) return;
  el.classList.remove("tilting");
  el.style.transform = "";
}

function releaseTilt() {
  if (!tiltEl) return;
  const el = tiltEl;
  setTimeout(() => { clearTilt(el); if (tiltEl === el) tiltEl = null; }, 150);
}

export function useGameCardTilt() {
  useEffect(() => {
    if (gameTiltAttached) return;
    gameTiltAttached = true;
    let reduceM = false;
    try { reduceM = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { /* ignore */ }
    const onMove = (e: PointerEvent) => {
      if (reduceM) return;
      const c = (e.target as Element)?.closest?.(".ez-card, .gp-card, .game");
      if (!premiumCard(c)) { if (tiltEl) { clearTilt(tiltEl); tiltEl = null; } return; }
      if (tiltEl && tiltEl !== c) clearTilt(tiltEl);
      tiltEl = c;
      applyTilt(c, e.clientX, e.clientY);
    };
    const onDown = (e: PointerEvent) => {
      const c = (e.target as Element)?.closest?.(".ez-card, .gp-card, .game");
      if (premiumCard(c)) { tiltEl = c; applyTilt(c, e.clientX, e.clientY); }
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerdown", onDown, { passive: true });
    document.addEventListener("pointerup", releaseTilt, { passive: true });
    document.addEventListener("pointercancel", releaseTilt, { passive: true });
    // Attached once for the page lifetime (tiles never unmount); no
    // cleanup removes the listeners while other tiles still exist.
  }, []);
}
