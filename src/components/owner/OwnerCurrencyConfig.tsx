import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { symbolFor } from "../../lib/country";
import type { CurrencyConfigShape } from "../../lib/game-config";
import { useStore } from "../../lib/store";

// Phase 1 country-based (Nov 2026): the CurrencyConfig editor —
// per-currency min deposit / min stake / conversion rate (fiat per
// 1 coin) / LIVE decay step / owner-approval threshold / enabled.
// The owner sets his own NGN numbers here without a code change;
// GHS rows stay in sync with Wallet config (the server syncs them).
export function OwnerCurrencyConfig() {
  const { toast } = useStore();
  const [rows, setRows] = useState<CurrencyConfigShape[] | null>(null);
  const [draft, setDraft] = useState<Record<string, Partial<CurrencyConfigShape>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setRows((await api<{ currencies: CurrencyConfigShape[] }>("/api/owner/currency-config")).currencies);
      setDraft({});
    } catch { setRows([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const set = (code: string, patch: Partial<CurrencyConfigShape>) => {
    setDraft((d) => ({ ...d, [code]: { ...(d[code] ?? {}), ...patch } }));
  };
  const save = async (row: CurrencyConfigShape) => {
    const d = draft[row.currency] ?? {};
    const body = {
      currency: row.currency,
      symbol: row.symbol,
      minDeposit: d.minDeposit ?? row.minDeposit,
      minStake: d.minStake ?? row.minStake,
      conversionRate: d.conversionRate ?? row.conversionRate,
      decayStep: d.decayStep ?? row.decayStep,
      withdrawalOwnerThreshold: d.withdrawalOwnerThreshold ?? row.withdrawalOwnerThreshold,
      enabled: d.enabled ?? row.enabled,
    };
    setBusy(row.currency);
    try {
      await api("/api/owner/currency-config", { method: "POST", body: JSON.stringify(body) });
      toast(`${row.currency} currency settings saved`, "win");
      await load();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Save failed", "lose");
    } finally { setBusy(null); }
  };
  if (rows === null) return <p>Loading currency settings…</p>;
  if (rows.length === 0) return <p>No currency settings yet.</p>;
  const val = (row: CurrencyConfigShape, key: keyof CurrencyConfigShape) =>
    String((draft[row.currency] as Record<string, unknown> | undefined)?.[key as string] ?? row[key]);
  return (
    <div className="ow-games">
      {rows.map((row) => (
        <div key={row.currency} className="ow-game-row">
          <div className="ow-game-head">
            <b>{row.currency} ({row.symbol})</b>
            {!row.enabled && <span className="ow-game-flag bad">DISABLED</span>}
          </div>
          <p className="ow-game-note">1 coin = {symbolFor(row.currency)} {val(row, "conversionRate")} · LIVE decay step {val(row, "decayStep")} · owner approval above {symbolFor(row.currency)} {val(row, "withdrawalOwnerThreshold")}.</p>
          <div className="ow-game-econ">
            <label>Min deposit ({row.symbol}) <input type="number" min={0} step={0.01} value={val(row, "minDeposit")} onChange={(e) => set(row.currency, { minDeposit: Number(e.target.value) })} aria-label={`${row.currency} minimum deposit`} /></label>
            <label>Min stake ({row.symbol}) <input type="number" min={0} step={0.01} value={val(row, "minStake")} onChange={(e) => set(row.currency, { minStake: Number(e.target.value) })} aria-label={`${row.currency} minimum stake`} /></label>
            <label>Conversion rate ({row.symbol} per coin) <input type="number" min={0} step={0.01} value={val(row, "conversionRate")} onChange={(e) => set(row.currency, { conversionRate: Number(e.target.value) })} aria-label={`${row.currency} conversion rate`} /></label>
            <label>LIVE decay step <input type="number" min={1} step={1} value={val(row, "decayStep")} onChange={(e) => set(row.currency, { decayStep: Number(e.target.value) })} aria-label={`${row.currency} LIVE decay step`} /></label>
            <label>Owner-approval threshold ({row.symbol}) <input type="number" min={0} step={1} value={val(row, "withdrawalOwnerThreshold")} onChange={(e) => set(row.currency, { withdrawalOwnerThreshold: Number(e.target.value) })} aria-label={`${row.currency} owner approval threshold`} /></label>
            <label className="ow-game-toggle">Enabled <input type="checkbox" checked={draft[row.currency]?.enabled ?? row.enabled} onChange={(e) => set(row.currency, { enabled: e.target.checked })} aria-label={`${row.currency} enabled`} /></label>
            <button className="btn btn-gold btn-sm" type="button" disabled={busy === row.currency} onClick={() => void save(row)}>{busy === row.currency ? "Saving…" : "Save"}</button>
          </div>
        </div>
      ))}
    </div>
  );
}
