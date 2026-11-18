// Owner Cashier (Phase 3 restyle) — split out of the old one-page owner
// panel (src/app/owner/legacy/page.tsx). Same endpoint, same behaviour,
// staff-ui throughout: per-method table (totals as a row and as tiles)
// plus the reconciliation tiles. No explainer note is re-added.
"use client";

import { useMemo } from "react";
import { useStore } from "../../../../lib/store";
import { useOwner } from "../../../../components/owner/OwnerContext";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";
import { Card, KpiTile } from "../../../../components/staff-ui/Card";
import { DataTable, type DataColumn } from "../../../../components/staff-ui/DataTable";
import { Skeleton, ErrorState } from "../../../../components/staff-ui/Feedback";
import { fmtStaffMoney } from "../../../../components/staff-ui/format";
import { useOwnerFetch } from "../../../../components/owner/useOwnerFetch";

export default function OwnerCashierPage() {
  const { user } = useStore();
  const { fiat } = useOwner();
  // O25: cashier / gateway balances — per-method totals + reconciliation.
  interface CashierMethodRow { method: string; deposited: number; withdrawn: number; net: number }
  interface CashierData { perMethod: CashierMethodRow[]; totals: { deposited: number; withdrawn: number; net: number }; reconciliation: { totalDeposited: number; totalWithdrawn: number; totalCommissionPaid: number; expectedCashOnHand: number; actualWalletBalances: number; difference: number } }
  const url = useMemo(() => (user ? `/api/owner/cashier?currency=${fiat}` : null), [user, fiat]);
  const { data: cashier, err, loading, reload } = useOwnerFetch<CashierData>(url);

  const rows: (CashierMethodRow & { id: string })[] = useMemo(() => {
    if (!cashier) return [];
    return [
      ...cashier.perMethod.map((m) => ({ ...m, id: m.method })),
      { id: "total", method: "Total", deposited: cashier.totals.deposited, withdrawn: cashier.totals.withdrawn, net: cashier.totals.net },
    ];
  }, [cashier]);

  // NOTE: DataTable's phone CardList only reads `details` from columns
  // AFTER the first — details on the first column never render.
  const columns: DataColumn<CashierMethodRow>[] = [
    { key: "method", label: "Method", render: (m) => (m.method === "Total" ? <b>Total</b> : m.method) },
    {
      key: "deposited",
      label: "Deposited",
      render: (m) => (m.method === "Total" ? <b>{fmtStaffMoney(m.deposited, fiat)}</b> : fmtStaffMoney(m.deposited, fiat)),
      details: (m) => [["Deposited", fmtStaffMoney(m.deposited, fiat)]],
    },
    {
      key: "withdrawn",
      label: "Withdrawn",
      render: (m) => (m.method === "Total" ? <b>{fmtStaffMoney(m.withdrawn, fiat)}</b> : fmtStaffMoney(m.withdrawn, fiat)),
      details: (m) => [["Withdrawn", fmtStaffMoney(m.withdrawn, fiat)]],
    },
    {
      key: "net",
      label: "Net",
      render: (m) => (m.method === "Total" ? <b>{fmtStaffMoney(m.net, fiat)}</b> : fmtStaffMoney(m.net, fiat)),
      details: (m) => [["Net", fmtStaffMoney(m.net, fiat)]],
    },
  ];

  return (
    <div>
      <PageHeader title="Cashier" sub="Per-method totals and reconciliation." />
      <OwnerRangeBar />
      <Card title="Cashier">
        {loading ? (
          <Skeleton lines={5} title />
        ) : err ? (
          <ErrorState text={err} onRetry={reload} />
        ) : cashier ? (
          <>
            <div>
              <KpiTile label="Deposited" value={fmtStaffMoney(cashier.totals.deposited, fiat)} />
              <KpiTile label="Withdrawn" value={fmtStaffMoney(cashier.totals.withdrawn, fiat)} />
              <KpiTile label="Net" value={fmtStaffMoney(cashier.totals.net, fiat)} />
            </div>
            <DataTable<CashierMethodRow & { id: string }>
              viewId="owner-cashier"
              columns={columns}
              rows={rows}
              total={rows.length}
              page={1}
              pageSize={rows.length || 1}
              onPageChange={() => {}}
              emptyTitle="No cashier data."
              emptyText="No per-method totals yet."
            />
            <h4>Reconciliation</h4>
            <div>
              <KpiTile label="Expected cash on hand" value={fmtStaffMoney(cashier.reconciliation.expectedCashOnHand, fiat)} />
              <KpiTile label="Actual wallet balances" value={fmtStaffMoney(cashier.reconciliation.actualWalletBalances, fiat)} />
              <KpiTile label="Difference" value={fmtStaffMoney(cashier.reconciliation.difference, fiat)} />
            </div>
          </>
        ) : null}
      </Card>
    </div>
  );
}
