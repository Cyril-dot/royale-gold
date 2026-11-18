// Admin dashboard — Money, Ledger (Phase 5 restyle). Same endpoints and
// behaviour as before (server-side type + search + date filters, one
// fiat at a time), staff-ui throughout: shared DataTable + CardList on
// phone, masked contacts, totals tiles. The ledger is a computed view
// capped at 200 rows per source — the page says so.
"use client";

import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { fmtMoney } from "../../../../lib/api";
import { useStore } from "../../../../lib/store";
import { useStaffFetch } from "../../../../components/staff-ui/useStaffFetch";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";
import { Card, KpiTile } from "../../../../components/staff-ui/Card";
import { DataTable, type DataColumn } from "../../../../components/staff-ui/DataTable";
import { DateRange } from "../../../../components/staff-ui/Form";
import { Skeleton, ErrorState } from "../../../../components/staff-ui/Feedback";
import { fmtStaffMoney } from "../../../../components/staff-ui/format";
import CurrencyChips from "../../../../components/CurrencyChips";
import { canAccessSection } from "../../../../lib/rbac";
import { todayStr } from "../../../../lib/admin-client";

interface LedgerRow {
  id: string;
  type: string;
  userId: string;
  userName: string;
  userContact: string | null;
  adminId: string | null;
  adminName: string | null;
  amount: number;
  wallet: string;
  fiatCurrency: string;
  detail: string;
  stake?: number;
  payout?: number;
  method?: string;
  status?: string;
  reason?: string;
  createdAt: string;
}

interface LedgerResponse {
  rows: LedgerRow[];
  totals: { rows: number; cashIn: number; cashOut: number };
}

const LEDGER_TYPES = ["deposit", "bet", "withdrawal", "adjustment", "conversion", "payout"] as const;

export default function AdminMoneyLedgerPage() {
  return (
    <Suspense fallback={<Skeleton lines={6} title />}>
      <AdminMoneyLedgerInner />
    </Suspense>
  );
}

function AdminMoneyLedgerInner() {
  const { user } = useStore();
  const sp = useSearchParams();
  const previewId = sp.get("preview");
  const [fiatSel, setFiatSel] = useState<string | null>(null);
  const fiat = fiatSel ?? user?.currency ?? "GHS";
  const [ledType, setLedType] = useState("");
  const [ledQ, setLedQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [range, setRange] = useState({ from: "", to: "" });
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // Debounce the search box (300ms) so typing does not fire a request
  // per keystroke. The timeout callback owns the setState — the
  // accepted shape, same as the owner palette.
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(ledQ.trim()), 300);
    return () => window.clearTimeout(t);
  }, [ledQ]);

  const url = useMemo(() => {
    if (!user) return null;
    const base = previewId ? `/api/owner/ledger?adminId=${previewId}` : "/api/admin/ledger";
    const p = new URLSearchParams();
    if (ledType) p.set("type", ledType);
    if (debouncedQ) p.set("q", debouncedQ);
    if (range.from) p.set("from", range.from);
    if (range.to) p.set("to", range.to);
    p.set("currency", fiat);
    return `${base}${base.includes("?") ? "&" : "?"}${p.toString()}`;
  }, [user, previewId, ledType, debouncedQ, range, fiat]);
  const { data, err, loading, reload } = useStaffFetch<LedgerResponse>(url);
  const rows = data?.rows ?? [];
  const totals = data?.totals ?? null;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);

  const fmtAmt = (amount: number, wallet: string, rowFiat: string) => {
    const sign = amount > 0 ? "+" : amount < 0 ? "−" : "";
    const abs = Math.abs(amount);
    return wallet === "coins" ? `${sign}${Math.round(abs)} coins` : `${sign}${fmtMoney(abs, rowFiat)}`;
  };

  const columns: DataColumn<LedgerRow>[] = [
    {
      key: "player",
      label: "Player",
      render: (r) => r.userName,
      sub: (r) => r.userContact ?? "—",
    },
    {
      key: "detail",
      label: "Movement",
      render: (r) => (
        <span>
          <span className="st-cell-primary">{r.detail}</span>
          <span className="st-cell-sub">
            {r.type}
            {r.reason ? ` — ${r.reason}` : ""}
            {r.status ? ` · ${r.status}` : ""}
          </span>
        </span>
      ),
      details: (r) => {
        const out: [string, ReactNode][] = [["Type", r.type]];
        if (r.reason) out.push(["Reason", r.reason]);
        if (r.status) out.push(["Status", r.status]);
        return out;
      },
    },
    {
      key: "amount",
      label: "Amount",
      render: (r) => fmtAmt(r.amount, r.wallet, r.fiatCurrency ?? fiat),
    },
    {
      key: "date",
      label: "Date",
      render: (r) =>
        new Date(r.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
      details: (r) => [
        ["Date", new Date(r.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })],
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

  const typeFilters = [
    { id: "", label: "All types" },
    ...LEDGER_TYPES.map((t) => ({ id: t, label: t[0].toUpperCase() + t.slice(1) })),
  ];

  return (
    <div>
      <PageHeader
        title="Ledger"
        sub="Every money movement for your players. Computed view — latest 200 rows per source."
        backHref={previewId ? `/admin?preview=${previewId}` : "/admin"}
        backLabel="Overview"
      />
      <CurrencyChips value={fiat} onChange={setFiatSel} label="Money currency" />
      {totals ? (
        <Card title="Totals">
          <div className="st-kpi-grid">
            <KpiTile label="Rows" value={String(totals.rows)} />
            <KpiTile label="Cash in" value={fmtStaffMoney(totals.cashIn, fiat)} />
            <KpiTile label="Cash out" value={fmtStaffMoney(totals.cashOut, fiat)} />
          </div>
        </Card>
      ) : null}
      <Card title="Ledger">
        <DateRange value={range} onChange={(v) => { setRange(v); setPage(1); }} label="Ledger date range" max={todayStr()} />
        <DataTable<LedgerRow>
          viewId="admin-ledger"
          columns={columns}
          rows={pageRows}
          total={rows.length}
          page={safePage}
          pageSize={pageSize}
          onPageChange={(p) => setPage(p)}
          search={ledQ}
          onSearchChange={(v) => {
            setLedQ(v);
            setPage(1);
          }}
          searchPlaceholder="Search by player or contact"
          filters={typeFilters}
          activeFilter={ledType}
          onFilterChange={(id) => {
            setLedType(id);
            setPage(1);
          }}
          loading={loading}
          error={err}
          onRetry={reload}
          emptyTitle="No money movements yet."
          emptyText="No rows match the current filters."
          rowHref={(r) => (previewId ? `/admin/players/${r.userId}?preview=${previewId}` : `/admin/players/${r.userId}`)}
        />
      </Card>
    </div>
  );
}
