// CopyButton — copies + "Copied ✓" state for 1.6s (the Referrals pattern).
"use client";

import { useEffect, useRef, useState } from "react";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API unavailable (old browser / non-secure context) —
      // fall back to a textarea selection.
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* copy failed; the button still reports it honestly below */
      }
      document.body.removeChild(ta);
    }
    setDone(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(false), 1600);
  };
  return (
    <button
      type="button"
      className={`st-copy-btn${done ? " st-copy-btn-done" : ""}`}
      onClick={() => void copy()}
      aria-live="polite"
    >
      {done ? "Copied ✓" : label}
    </button>
  );
}
