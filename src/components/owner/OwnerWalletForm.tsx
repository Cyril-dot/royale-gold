// OwnerWalletForm (Phase 3 restyle) — the platform wallet rules, staff-ui
// throughout. Same fields, same save (only changed fields are posted).
// Labels stay GH₵: these are the GHS platform values (the server syncs
// the GHS currency row with them); NGN values live in Currency settings.
import { useState } from "react";
import { Button } from "../staff-ui/Button";
import { FormField, AmountInput } from "../staff-ui/Form";

export function OwnerWalletForm({ w, onSave }: {
  w: { cashMinDeposit: number; cashMinStake: number; coinMinStake: number; conversionRate: number; coinsWithdrawable: boolean };
  onSave: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const [dep, setDep] = useState(String(w.cashMinDeposit));
  const [stake, setStake] = useState(String(w.cashMinStake));
  const [coin, setCoin] = useState(String(w.coinMinStake));
  const [rate, setRate] = useState(String(w.conversionRate));
  const [wd, setWd] = useState(w.coinsWithdrawable);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const patch: Record<string, unknown> = {};
    const a = Number(dep);
    const b = Number(stake);
    const c = Number(coin);
    const d = Number(rate);
    if (Number.isFinite(a) && a !== w.cashMinDeposit) patch.cashMinDeposit = a;
    if (Number.isFinite(b) && b !== w.cashMinStake) patch.cashMinStake = b;
    if (Number.isFinite(c) && c !== w.coinMinStake) patch.coinMinStake = c;
    if (Number.isFinite(d) && d !== w.conversionRate) patch.conversionRate = d;
    if (wd !== w.coinsWithdrawable) patch.coinsWithdrawable = wd;
    if (Object.keys(patch).length === 0) return;
    setBusy(true);
    try { await onSave(patch); } finally { setBusy(false); }
  };
  return (
    <div>
      <FormField label="Cash min deposit (GH₵)">
        <AmountInput value={dep} onChange={(e) => setDep(e.target.value)} aria-label="Cash minimum deposit" />
      </FormField>
      <FormField label="Cash min stake (GH₵)">
        <AmountInput value={stake} onChange={(e) => setStake(e.target.value)} aria-label="Cash minimum stake" />
      </FormField>
      <FormField label="Coin min stake (coins)">
        <AmountInput value={coin} onChange={(e) => setCoin(e.target.value)} aria-label="Coin minimum stake" />
      </FormField>
      <FormField label="Conversion rate (GH₵ = 1 coin)">
        <AmountInput value={rate} onChange={(e) => setRate(e.target.value)} aria-label="Conversion rate" />
      </FormField>
      <FormField label="Coins are withdrawable">
        <input type="checkbox" checked={wd} onChange={(e) => setWd(e.target.checked)} aria-label="Coins are withdrawable" />
      </FormField>
      <Button variant="primary" loading={busy} onClick={() => void save()}>
        Save wallet config
      </Button>
    </div>
  );
}
