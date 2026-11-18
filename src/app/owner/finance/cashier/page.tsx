// Owner Cashier (Phase 2) — split out of the old one-page owner panel
// (src/app/owner/legacy/page.tsx). Same sections, same endpoints, same
// behaviour — now its own route, loading only its own data.
"use client";

import { useCallback, useEffect, useState } from "react";
import { api, fmtMoney } from "../../../../lib/api";
import { useStore } from "../../../../lib/store";
import { useOwner } from "../../../../components/owner/OwnerContext";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";

export default function OwnerCashierPage() {
  const { user } = useStore();
  const { fiat } = useOwner();
  // O25: cashier / gateway balances — per-method totals + reconciliation.
  interface CashierMethodRow { method: string; deposited: number; withdrawn: number; net: number }
  interface CashierData { perMethod: CashierMethodRow[]; totals: { deposited: number; withdrawn: number; net: number }; reconciliation: { totalDeposited: number; totalWithdrawn: number; totalCommissionPaid: number; expectedCashOnHand: number; actualWalletBalances: number; difference: number } }
  const [cashier, setCashier] = useState<CashierData | null>(null);
  const loadCashier = useCallback(async () => {
    try {
      setCashier(await api<CashierData>(`/api/owner/cashier?currency=${fiat}`));
    } catch { setCashier(null); }
  }, [fiat]);
  useEffect(() => { if (user) void loadCashier(); }, [loadCashier, user]);
  return (
    <div>
      <PageHeader title="Cashier" sub="Per-method totals and reconciliation." />
      <OwnerRangeBar />
      <section className="admin-sec cashier-sec">
      <h3>Cashier</h3>
      {cashier === null ? <p>Loading cashier…</p> : (
        <>
          <div className="rg48-twrap">
            <table className="dep-table">
              <thead><tr><th>Method</th><th>Deposited</th><th>Withdrawn</th><th>Net</th></tr></thead>
              <tbody>
                {cashier.perMethod.map((m) => (
                  <tr key={m.method}>
                    <td>{m.method}</td>
                    <td>{fmtMoney(m.deposited, fiat)}</td>
                    <td>{fmtMoney(m.withdrawn, fiat)}</td>
                    <td>{fmtMoney(m.net, fiat)}</td>
                  </tr>
                ))}
                <tr>
                  <td><b>Total</b></td>
                  <td><b>{fmtMoney(cashier.totals.deposited, fiat)}</b></td>
                  <td><b>{fmtMoney(cashier.totals.withdrawn, fiat)}</b></td>
                  <td><b>{fmtMoney(cashier.totals.net, fiat)}</b></td>
                </tr>
              </tbody>
            </table>
          </div>
          <h4>Reconciliation</h4>
          <div className="sum-cards ow-sum">
            <div className="sum-card"><span>Expected cash on hand</span><b>{fmtMoney(cashier.reconciliation.expectedCashOnHand, fiat)}</b></div>
            <div className="sum-card"><span>Actual wallet balances</span><b>{fmtMoney(cashier.reconciliation.actualWalletBalances, fiat)}</b></div>
            <div className="sum-card"><span>Difference</span><b>{fmtMoney(cashier.reconciliation.difference, fiat)}</b></div>
          </div>
        </>
      )}
      </section>
    </div>
  );
}
