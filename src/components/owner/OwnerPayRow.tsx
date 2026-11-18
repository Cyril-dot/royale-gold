import { useState } from "react";
import { symbolFor } from "../../lib/country";

export function OwnerPayRow({ m, onSave }: {
  m: { method: string; enabled: boolean; minDeposit: number | null; maxDeposit: number | null; fiatCurrency: string; gateway?: string | null };
  onSave: (method: string, patch: Record<string, unknown>) => Promise<void>;
}) {
  const [minDep, setMinDep] = useState(m.minDeposit == null ? "" : String(m.minDeposit));
  const [maxDep, setMaxDep] = useState(m.maxDeposit == null ? "" : String(m.maxDeposit));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const patch: Record<string, unknown> = {};
    const a = minDep.trim() === "" ? null : Number(minDep);
    const b = maxDep.trim() === "" ? null : Number(maxDep);
    if (a !== m.minDeposit) patch.minDeposit = a;
    if (b !== m.maxDeposit) patch.maxDeposit = b;
    if (Object.keys(patch).length === 0) return;
    setBusy(true);
    try { await onSave(m.method, patch); } finally { setBusy(false); }
  };
  return (
    <div className={`ow-pay-row${!m.enabled ? " ow-pay-off" : ""}`}>
      <div className="ow-game-head">
        <b>{m.method}</b>
        {!m.enabled && <span className="ow-game-flag bad">DISABLED</span>}
      </div>
      <div className="ow-game-toggles">
        <button
          type="button"
          className={`btn btn-sm ${m.enabled ? "btn-gold" : "btn-ghost"}`}
          disabled={busy}
          onClick={() => void onSave(m.method, { enabled: !m.enabled })}
          aria-pressed={m.enabled}
        >{m.enabled ? "Enabled" : "Disabled"}</button>
      </div>
      <div className="ow-game-econ">
        <label>Min deposit ({symbolFor(m.fiatCurrency ?? "GHS")}) <input type="number" min={0} step={0.01} value={minDep} onChange={(e) => setMinDep(e.target.value)} placeholder="Platform min" aria-label={`${m.method} minimum deposit`} /></label>
        <label>Max deposit ({symbolFor(m.fiatCurrency ?? "GHS")}) <input type="number" min={0} step={0.01} value={maxDep} onChange={(e) => setMaxDep(e.target.value)} placeholder="No cap" aria-label={`${m.method} maximum deposit`} /></label>
        <button className="btn btn-gold btn-sm" type="button" disabled={busy} onClick={() => void save()}>Save</button>
      </div>
    </div>
  );
}
