// v46/v47 result readouts: top-hover, NO background — bare text + light
// shadow only. Show fully 2s, fade ~0.3s, gone. A new result replaces the
// old one immediately — never two on screen (the store keeps one toast
// per call but we render only the latest).

"use client";

import { useStore } from "../lib/store";

export default function Toasts() {
  const { toasts } = useStore();
  const latest = toasts[toasts.length - 1];
  if (!latest) return null;
  return (
    <div className="rg-toasts" aria-live="polite">
      <div key={latest.id} className={`rg-toast ${latest.kind}`}>
        {latest.text}
      </div>
    </div>
  );
}
