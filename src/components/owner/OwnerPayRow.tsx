// OwnerPayRow (Phase 3 restyle) — one payment method's enable toggle +
// max deposit, staff-ui throughout. Nov 2026 (Chuks): the per-method
// MIN deposit field is gone — only the general platform minimum
// (Wallet config → CASH MIN DEPOSIT) applies, so nothing per-method
// can block a deposit. The toggle posts immediately (reversible in one
// tap, same as before); Save only posts fields that changed. No confirm
// dialog: this is a reversible config toggle, not a money movement —
// the gateway flip (which reroutes live money) is the one that confirms.
import { useState } from "react";
import { symbolFor } from "../../lib/country";
import { Card } from "../staff-ui/Card";
import { Button } from "../staff-ui/Button";
import { Badge } from "../staff-ui/Badge";
import { FormField, AmountInput } from "../staff-ui/Form";

export function OwnerPayRow({ m, onSave }: {
  m: { method: string; enabled: boolean; minDeposit: number | null; maxDeposit: number | null; fiatCurrency: string; gateway?: string | null };
  onSave: (method: string, patch: Record<string, unknown>) => Promise<void>;
}) {
  const [maxDep, setMaxDep] = useState(m.maxDeposit == null ? "" : String(m.maxDeposit));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const patch: Record<string, unknown> = {};
    const b = maxDep.trim() === "" ? null : Number(maxDep);
    if (b !== m.maxDeposit) patch.maxDeposit = b;
    if (Object.keys(patch).length === 0) return;
    setBusy(true);
    try { await onSave(m.method, patch); } finally { setBusy(false); }
  };
  return (
    <Card title={m.method}>
      {!m.enabled ? <Badge variant="muted">Disabled</Badge> : null}
      {m.gateway ? <Badge variant="info">{m.gateway}</Badge> : null}
      <Button
        variant={m.enabled ? "primary" : "secondary"}
        size="sm"
        disabled={busy}
        onClick={() => void onSave(m.method, { enabled: !m.enabled })}
        aria-pressed={m.enabled}
      >
        {m.enabled ? "Enabled" : "Disabled"}
      </Button>
      <FormField label={`Max deposit (${symbolFor(m.fiatCurrency ?? "GHS")})`}>
        <AmountInput value={maxDep} onChange={(e) => setMaxDep(e.target.value)} placeholder="No cap" aria-label={`${m.method} maximum deposit`} />
      </FormField>
      <div className="st-pay-save">
        <Button variant="primary" size="sm" loading={busy} onClick={() => void save()}>
          Save
        </Button>
      </div>
    </Card>
  );
}
