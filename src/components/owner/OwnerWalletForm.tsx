import { useState } from "react";

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
    <div className="ow-wallet">
      <label>Cash min deposit (GH₵)
        <input type="number" min={0} step={0.01} value={dep} onChange={(e) => setDep(e.target.value)} aria-label="Cash minimum deposit" />
      </label>
      <label>Cash min stake (GH₵)
        <input type="number" min={0.01} step={0.01} value={stake} onChange={(e) => setStake(e.target.value)} aria-label="Cash minimum stake" />
      </label>
      <label>Coin min stake (coins)
        <input type="number" min={1} step={1} value={coin} onChange={(e) => setCoin(e.target.value)} aria-label="Coin minimum stake" />
      </label>
      <label>Conversion rate (GH₵ = 1 coin)
        <input type="number" min={1} step={0.01} value={rate} onChange={(e) => setRate(e.target.value)} aria-label="Conversion rate" />
      </label>
      <label className="ow-check">
        <input type="checkbox" checked={wd} onChange={(e) => setWd(e.target.checked)} />
        Coins are withdrawable
      </label>
      <button className="btn btn-gold" type="button" disabled={busy} onClick={() => void save()}>Save wallet config</button>
    </div>
  );
}
