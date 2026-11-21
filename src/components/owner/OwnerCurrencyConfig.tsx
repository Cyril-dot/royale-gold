// Phase 1 country-based (Nov 2026), Phase 3 restyle: the CurrencyConfig
// editor — per-currency min deposit / min stake / conversion rate (fiat
// per 1 coin) / LIVE decay step / owner-approval threshold / enabled.
// The owner sets his own NGN numbers here without a code change;
// GHS rows stay in sync with Wallet config (the server syncs them).
// Edits are drafts until Save is tapped per currency.
import { useState } from "react";
import { api } from "../../lib/api";
import { symbolFor } from "../../lib/country";
import type { CurrencyConfigShape } from "../../lib/game-config";
import { useStore } from "../../lib/store";
import { Badge } from "../staff-ui/Badge";
import { Button } from "../staff-ui/Button";
import { Card } from "../staff-ui/Card";
import { FormField, AmountInput } from "../staff-ui/Form";
import { Skeleton, ErrorState, EmptyState } from "../staff-ui/Feedback";
import { useOwnerFetch } from "./useOwnerFetch";

export function OwnerCurrencyConfig() {
  const { user, toast } = useStore();
  const [draft, setDraft] = useState<Record<string, Partial<CurrencyConfigShape>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const { data, err, loading, reload } = useOwnerFetch<{ currencies: CurrencyConfigShape[] }>(
    user ? "/api/owner/currency-config" : null,
  );
  const rows = data?.currencies ?? [];
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
      // Max withdrawal is sent ONLY when the owner edited it this
      // save (set or cleared). Any other save must not touch the
      // column — on a prod DB without it yet, writing it would 503
      // an unrelated edit.
      ...(d.withdrawalMax !== undefined ? { withdrawalMax: d.withdrawalMax } : {}),
    };
    setBusy(row.currency);
    try {
      await api("/api/owner/currency-config", { method: "POST", body: JSON.stringify(body) });
      toast(`${row.currency} currency settings saved`, "win");
      setDraft((cur) => {
        const next = { ...cur };
        delete next[row.currency];
        return next;
      });
      reload();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Save failed", "lose");
    } finally {
      setBusy(null);
    }
  };
  if (loading) return <Skeleton lines={5} title />;
  if (err) return <ErrorState text={err} onRetry={reload} />;
  if (rows.length === 0) return <EmptyState title="No currency settings yet." text="No currency settings yet." />;
  const val = (row: CurrencyConfigShape, key: keyof CurrencyConfigShape) =>
    String((draft[row.currency] as Record<string, unknown> | undefined)?.[key as string] ?? row[key]);
  // Max withdrawal input value: "" when unset (null) — the plain val()
  // helper would render "null". A cleared draft (null) must stay ""
  // and not fall through to the saved value.
  const valMax = (row: CurrencyConfigShape) => {
    const d = draft[row.currency];
    const v = d && "withdrawalMax" in d ? d.withdrawalMax : row.withdrawalMax;
    return v == null ? "" : String(v);
  };
  return (
    <div>
      {rows.map((row) => (
        <Card key={row.currency} title={`${row.currency} (${row.symbol})`}>
          {!row.enabled ? <Badge variant="muted">Disabled</Badge> : null}
          <p>
            1 coin = {symbolFor(row.currency)} {val(row, "conversionRate")} · LIVE decay step {val(row, "decayStep")} · owner
            approval above {symbolFor(row.currency)} {val(row, "withdrawalOwnerThreshold")} · max withdrawal{" "}
            {valMax(row) === "" ? "none" : `${symbolFor(row.currency)} ${valMax(row)}`}.
          </p>
          <FormField label={`Min deposit (${row.symbol})`}>
            <AmountInput value={val(row, "minDeposit")} onChange={(e) => set(row.currency, { minDeposit: Number(e.target.value) })} aria-label={`${row.currency} minimum deposit`} />
          </FormField>
          <FormField label={`Min stake (${row.symbol})`}>
            <AmountInput value={val(row, "minStake")} onChange={(e) => set(row.currency, { minStake: Number(e.target.value) })} aria-label={`${row.currency} minimum stake`} />
          </FormField>
          <FormField label={`Conversion rate (${row.symbol} per coin)`}>
            <AmountInput value={val(row, "conversionRate")} onChange={(e) => set(row.currency, { conversionRate: Number(e.target.value) })} aria-label={`${row.currency} conversion rate`} />
          </FormField>
          <FormField label="LIVE decay step">
            <AmountInput value={val(row, "decayStep")} onChange={(e) => set(row.currency, { decayStep: Number(e.target.value) })} aria-label={`${row.currency} LIVE decay step`} />
          </FormField>
          <FormField label={`Owner-approval threshold (${row.symbol})`}>
            <AmountInput value={val(row, "withdrawalOwnerThreshold")} onChange={(e) => set(row.currency, { withdrawalOwnerThreshold: Number(e.target.value) })} aria-label={`${row.currency} owner approval threshold`} />
          </FormField>
          <FormField label={`Max withdrawal (${row.symbol}) — blank = no max`}>
            <AmountInput value={valMax(row)} onChange={(e) => set(row.currency, { withdrawalMax: e.target.value === "" ? null : Number(e.target.value) })} aria-label={`${row.currency} max withdrawal`} />
          </FormField>
          <FormField label="Enabled">
            <input type="checkbox" checked={draft[row.currency]?.enabled ?? row.enabled} onChange={(e) => set(row.currency, { enabled: e.target.checked })} aria-label={`${row.currency} enabled`} />
          </FormField>
          <Button variant="primary" size="sm" loading={busy === row.currency} onClick={() => void save(row)}>
            Save
          </Button>
        </Card>
      ))}
    </div>
  );
}
