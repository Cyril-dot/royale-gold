// Admin dashboard — Money, Deposits (Phase 5 restyle). Same endpoints
// and behaviour as before (server-side method + search filters, one
// fiat at a time), staff-ui throughout: shared DataTable + CardList on
// phone, masked contacts with audited Reveal, totals tiles.
"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useStore } from "../../../../lib/store";
import { useStaffFetch } from "../../../../components/staff-ui/useStaffFetch";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";
import { Card, KpiTile } from "../../../../components/staff-ui/Card";
import { DataTable, type DataColumn } from "../../../../components/staff-ui/DataTable";
import { Skeleton, ErrorState } from "../../../../components/staff-ui/Feedback";
import { fmtStaffMoney } from "../../../../components/staff-ui/format";
import { AdminContactValue } from "../../../../components/admin/AdminReveal";
import CurrencyChips from "../../../../components/CurrencyChips";
import { canAccessSection } from "../../../../lib/rbac";

interface DepositRow {
  id: string;
  userId: string;
  userName: string;
  userContact: string | null;
  amount: number;
  method: string;
  fiatCurrency: string;
  pctInForce: number;
  commission: number;
  createdAt: string;
}

interface DepositsResponse {
  deposits: DepositRow[];
  totals: { deposits: number; totalAmount: number; totalCommission: number };
  currency: string;
}

const METHODS = ["MTN", "Telecel", "AirtelTigo", "card"];

export default function AdminMoneyDepositsPage() {
  return (
    <Suspense fallback={<Skeleton lines={6} title />}>
      <AdminMoneyDepositsInner />
    </Suspense>
  );
}

function AdminMoneyDepositsInner() {
  const { user } = useStore();
  const sp = useSearchParams();
  const previewId = sp.get("preview");
  const [fiatSel, setFiatSel] = useState<string | null>(null);
  const fiat = fiatSel ?? user?.currency ?? "GHS";
  const [depMethod, setDepMethod] = useState("");
  const [depQ, setDepQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // Debounce the search box (300ms) so typing does not fire a request
  // per keystroke. The timeout callback owns the setState — the
  // accepted shape, same as the owner palette.
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(depQ.trim()), 300);
    return () => window.clearTimeout(t);
  }, [depQ]);

  const url = useMemo(() => {
    if (!user) return null;
    const base = previewId ? `/api/owner/deposits?adminId=${previewId}` : "/api/admin/deposits";
    const p = new URLSearchParams();
    if (depMethod) p.set("method", depMethod);
    if (debouncedQ) p.set("q", debouncedQ);
    p.set("currency", fiat);
    p.set("limit", "100");
    return `${base}${base.includes("?") ? "&" : "?"}${p.toString()}`;
  }, [user, previewId, depMethod, debouncedQ, fiat]);
  const { data, err, loading, reload } = useStaffFetch<DepositsResponse>(url);
  const rows = data?.deposits ?? [];
  const totals = data?.totals ?? null;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);

  const columns: DataColumn<DepositRow>[] = [
    {
      key: "player",
      label: "Player",
      render: (d) => d.userName,
      sub: (d) => <AdminContactValue userId={d.userId} contact={d.userContact} preview={!!previewId} />,
    },
    {
      key: "amount",
      label: "Amount",
      render: (d) => fmtStaffMoney(d.amount, d.fiatCurrency ?? fiat),
    },
    {
      key: "method",
      label: "Method",
      render: (d) => d.method,
      details: (d) => [["Method", d.method]],
    },
    {
      key: "commission",
      label: "Commission",
      render: (d) => `${fmtStaffMoney(d.commission, d.fiatCurrency ?? fiat)} (${d.pctInForce}%)`,
      details: (d) => [["Commission", `${fmtStaffMoney(d.commission, d.fiatCurrency ?? fiat)} (${d.pctInForce}%)`]],
    },
    {
      key: "date",
      label: "Date",
      render: (d) =>
        new Date(d.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
      details: (d) => [
        ["Date", new Date(d.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })],
      ],
    },
  ];

  if (!user) return null;
  if (!previewId && !canAccessSection(user, "money")) {
    return (
      <ErrorState
        title="No access to this section."
        text="You do not have access to the Money section. Ask the owner to grant you access from the Owner panel."
      />
    );
  }

  const methodFilters = [
    { id: "", label: "All methods" },
    ...METHODS.map((m) => ({ id: m, label: m })),
  ];

  return (
    <div>
      <PageHeader
        title="Deposits"
        sub="Deposits from your players, in one fiat at a time."
        backHref={previewId ? `/admin?preview=${previewId}` : "/admin"}
        backLabel="Overview"
      />
      <CurrencyChips value={fiat} onChange={setFiatSel} label="Money currency" />
      {totals ? (
        <Card title="Totals">
          <div className="st-kpi-grid">
            <KpiTile label="Deposits" value={String(totals.deposits)} />
            <KpiTile label="Total deposited" value={fmtStaffMoney(totals.totalAmount, fiat)} />
            <KpiTile label="Commission" value={fmtStaffMoney(totals.totalCommission, fiat)} />
          </div>
        </Card>
      ) : null}
      <Card title="Deposits">
        <DataTable<DepositRow>
          viewId="admin-deposits"
          columns={columns}
          rows={pageRows}
          total={rows.length}
          page={safePage}
          pageSize={pageSize}
          onPageChange={(p) => setPage(p)}
          search={depQ}
          onSearchChange={(v) => {
            setDepQ(v);
            setPage(1);
          }}
          searchPlaceholder="Search by player, contact or receipt id"
          filters={methodFilters}
          activeFilter={depMethod}
          onFilterChange={(id) => {
            setDepMethod(id);
            setPage(1);
          }}
          loading={loading}
          error={err}
          onRetry={reload}
          emptyTitle="No deposits yet."
          emptyText="No rows match the current filters."
          rowHref={(d) => (previewId ? `/admin/players/${d.userId}?preview=${previewId}` : `/admin/players/${d.userId}`)}
        />
      </Card>
    </div>
  );
}
