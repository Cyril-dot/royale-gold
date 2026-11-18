import { useState } from "react";

// P0 Batch 2 — one game row: visibility + kill toggles and the four
// economics fields, saved per row. Number inputs hold text locally so
// an empty field means "clear the override" (back to the catalogue
// default) instead of 0.
export function OwnerGameRow({ g, onSave }: {
  g: { slug: string; name: string; currency: string; visible: boolean; killed: boolean; minBet: number | null; maxBet: number | null; maxPayout: number | null; maxMultiplier: number; note: string };
  onSave: (slug: string, patch: Record<string, unknown>) => Promise<void>;
}) {
  const [minBet, setMinBet] = useState(g.minBet == null ? "" : String(g.minBet));
  const [maxBet, setMaxBet] = useState(g.maxBet == null ? "" : String(g.maxBet));
  const [maxPayout, setMaxPayout] = useState(g.maxPayout == null ? "" : String(g.maxPayout));
  const [maxMult, setMaxMult] = useState(String(g.maxMultiplier));
  const [busy, setBusy] = useState(false);
  const unit = g.currency === "coins" ? "coins" : "GH₵";
  const numOrNull = (s: string): number | null => {
    const t = s.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : NaN;
  };
  const save = async () => {
    const patch: Record<string, unknown> = {};
    const a = numOrNull(minBet);
    const b = numOrNull(maxBet);
    const c = numOrNull(maxPayout);
    const d = numOrNull(maxMult);
    if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(c) || Number.isNaN(d)) return;
    if (a !== g.minBet) patch.minBet = a;
    if (b !== g.maxBet) patch.maxBet = b;
    if (c !== g.maxPayout) patch.maxPayout = c;
    if (d !== null && d !== g.maxMultiplier) patch.maxMultiplier = d;
    if (Object.keys(patch).length === 0) return;
    setBusy(true);
    try { await onSave(g.slug, patch); } finally { setBusy(false); }
  };
  return (
    <div className={`ow-game-row${g.killed ? " ow-game-killed" : ""}${!g.visible ? " ow-game-hidden" : ""}`}>
      <div className="ow-game-head">
        <b>{g.name}</b>
        <span className="ow-game-cur">{g.currency === "coins" ? "Coins" : "Cash"}</span>
        <span className="ow-game-mult">max ×{g.maxMultiplier}</span>
        {g.killed && <span className="ow-game-flag bad">KILLED</span>}
        {!g.visible && <span className="ow-game-flag">HIDDEN</span>}
      </div>
      <p className="ow-game-note">{g.note}</p>
      <div className="ow-game-toggles">
        <button
          type="button"
          className={`btn btn-sm ${g.visible ? "btn-gold" : "btn-ghost"}`}
          disabled={busy}
          onClick={() => void onSave(g.slug, { visible: !g.visible })}
          aria-pressed={g.visible}
        >{g.visible ? "Visible" : "Hidden"}</button>
        <button
          type="button"
          className={`btn btn-sm ${g.killed ? "btn-danger" : "btn-ghost"}`}
          disabled={busy}
          onClick={() => {
            if (!g.killed && !window.confirm(`Kill ${g.name}? No one can play it until you unkill it.`)) return;
            void onSave(g.slug, { killed: !g.killed });
          }}
          aria-pressed={g.killed}
        >{g.killed ? "Killed — tap to resume" : "Kill switch"}</button>
      </div>
      <div className="ow-game-econ">
        <label>Min bet ({unit}) <input type="number" min={0} step={g.currency === "coins" ? 1 : 0.01} value={minBet} onChange={(e) => setMinBet(e.target.value)} placeholder="Default" aria-label={`${g.name} minimum bet`} /></label>
        <label>Max bet ({unit}) <input type="number" min={0} step={g.currency === "coins" ? 1 : 0.01} value={maxBet} onChange={(e) => setMaxBet(e.target.value)} placeholder="No cap" aria-label={`${g.name} maximum bet`} /></label>
        <label>Max payout ({unit}) <input type="number" min={0} step={g.currency === "coins" ? 1 : 0.01} value={maxPayout} onChange={(e) => setMaxPayout(e.target.value)} placeholder="No cap" aria-label={`${g.name} maximum payout`} /></label>
        <label>Max × <input type="number" min={0.01} step={0.01} value={maxMult} onChange={(e) => setMaxMult(e.target.value)} aria-label={`${g.name} maximum multiplier`} /></label>
        <button className="btn btn-gold btn-sm" type="button" disabled={busy} onClick={() => void save()}>Save</button>
      </div>
    </div>
  );
}
