// Owner Ledger (Phase 3 restyle) — split out of the old one-page owner
// panel (deleted in Phase 4). Same endpoint, same behaviour,
// staff-ui throughout: DataTable + CardList on phone, type chips, search,
// date range, admin filter, KPI tiles, masked contacts with audited
// Reveal, and a CSV export of the rows on screen (contacts masked —
// audit §4.7). The list endpoint caps at 100 rows (server pagination
// is a Phase 7 item); the table paginates client-side over what was
// fetched.
"use client";

import { useMemo, useState, type ReactNode } from "react";
import { api } from "../../../../lib/api";
import { todayStr } from "../../../../lib/admin-client";
import { useStore } from "../../../../lib/store";
import { useOwner } from "../../../../components/owner/OwnerContext";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";
import { Card, KpiTile } from "../../../../components/staff-ui/Card";
import { DataTable, type DataColumn } from "../../../../components/staff-ui/DataTable";
import { Badge } from "../../../../components/staff-ui/Badge";
import { FormField, Select, DateRange } from "../../../../components/staff-ui/Form";
import { MaskedValue } from "../../../../components/staff-ui/MaskedValue";
import { fmtStaffMoney, fmtStaffInt, maskEmail, maskPhone } from "../../../../components/staff-ui/format";
import { useOwnerFetch } from "../../../../components/owner/useOwnerFetch";
import type { AdminRow } from "../../../../components/owner/owner-types";

// P0 Batch 1 (O7): global transaction ledger — every money movement,
// platform-wide, searchable by type, period, amount, method and admin.
interface OwnerLedgerRow {
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
  status?: string;
  reason?: string;
  createdAt: string;
}

interface LedgerResponse {
  rows: OwnerLedgerRow[];
  totals: { rows: number; cashIn: number; cashOut: number };
}

const TYPE_FILTERS = [
  { id: "", label: "All types" },
  { id: "deposit", label: "Deposit" },
  { id: "bet", label: "Bet" },
  { id: "withdrawal", label: "Withdrawal" },
  { id: "adjustment", label: "Adjustment" },
  { id: "conversion", label: "Conversion" },
  { id: "payout", label: "Payout" },
];

function TypeBadge({ type }: { type: string }) {
  if (type === "deposit") return <Badge variant="ok">{type}</Badge>;
  if (type === "bet") return <Badge variant="info">{type}</Badge>;
  return <Badge variant="muted">{type}</Badge>;
}

function formatAmount(r: OwnerLedgerRow, fiat: string): string {
  const sign = r.amount > 0 ? "+" : r.amount < 0 ? "−" : "";
  const abs = Math.abs(r.amount);
  return r.wallet === "coins" ? `${sign}${Math.round(abs)} coins` : `${sign}${fmtStaffMoney(abs, r.fiatCurrency ?? fiat)}`;
}

function csvCell(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

export default function OwnerLedgerPage() {
  const { user } = useStore();
  const { fiat } = useOwner();
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [adminId, setAdminId] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const { data: adminsData } = useOwnerFetch<{ admins: AdminRow[] }>(user ? "/api/owner/admins" : null);
  const admins = adminsData?.admins ?? [];

  const url = useMemo(() => {
    if (!user) return null;
    const p = new URLSearchParams();
    if (type) p.set("type", type);
    if (q.trim()) p.set("q", q.trim());
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (adminId) p.set("adminId", adminId);
    p.set("currency", fiat);
    p.set("limit", "100");
    return `/api/owner/ledger?${p.toString()}`;
  }, [user, type, q, from, to, adminId, fiat]);
  const { data, err, loading, reload } = useOwnerFetch<LedgerResponse>(url);
  const rows = data?.rows ?? [];
  const totals = data?.totals ?? null;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);

  const exportCsv = () => {
    const head = ["Date", "Player", "Contact (masked)", "Type", "Detail", "Amount", "Wallet", "Admin"];
    const lines = rows.map((r) => {
      const contact = r.userContact
        ? r.userContact.includes("@")
          ? maskEmail(r.userContact)
          : maskPhone(r.userContact)
        : "";
      return [
        new Date(r.createdAt).toISOString(),
        r.userName,
        contact,
        r.type,
        r.detail,
        formatAmount(r, fiat),
        r.wallet,
        r.adminName ?? "",
      ]
        .map(csvCell)
        .join(",");
    });
    const blob = new Blob([[head.map(csvCell).join(","), ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ledger-${todayStr()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const columns: DataColumn<OwnerLedgerRow>[] = [
    {
      key: "player",
      label: "Player",
      render: (r) => r.userName,
      sub: (r) => {
        const contact = r.userContact;
        if (!contact) return "—";
        return (
          <MaskedValue
            value={contact}
            kind={contact.includes("@") ? "email" : "phone"}
            label="Player contact"
            onReveal={async () => {
              const res = await api<{ value: { email: string | null; phone: string | null } }>("/api/owner/reveal", {
                method: "POST",
                body: JSON.stringify({ kind: "user-contact", id: r.userId }),
              });
              return contact.includes("@") ? res.value.email : res.value.phone;
            }}
          />
        );
      },
      // NOTE: DataTable's phone CardList only reads `details` from
      // columns AFTER the first — details on the first column never
      // render. Every detail below lives on its own column.
    },
    {
      key: "type",
      label: "Type",
      render: (r) => <TypeBadge type={r.type} />,
      details: (r) => [["Type", <TypeBadge key="t" type={r.type} />]],
    },
    {
      key: "detail",
      label: "Detail",
      render: (r) => (
        <span>
          {r.detail}
          {r.reason ? ` — ${r.reason}` : ""}
          {r.status ? ` · ${r.status}` : ""}
          {r.adminName ? ` · ${r.adminName}` : ""}
        </span>
      ),
      details: (r) => {
        const out: [string, ReactNode][] = [["Detail", r.detail]];
        if (r.reason) out.push(["Reason", r.reason]);
        if (r.status) out.push(["Status", r.status]);
        if (r.adminName) out.push(["Admin", r.adminName]);
        return out;
      },
    },
    {
      key: "amount",
      label: "Amount",
      render: (r) => formatAmount(r, fiat),
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

  return (
    <div>
      <PageHeader title="Ledger" sub="Every money movement, platform-wide." />
      <OwnerRangeBar />
      <Card title="Ledger">
        <DateRange
          value={{ from, to }}
          onChange={(v) => {
            setFrom(v.from);
            setTo(v.to);
            setPage(1);
          }}
          label="Ledger period"
          max={todayStr()}
        />
        <FormField label="Admin">
          <Select value={adminId} onChange={(e) => { setAdminId(e.target.value); setPage(1); }} aria-label="Filter by admin">
            <option value="">All admins</option>
            {admins.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </FormField>
        {totals ? (
          <div>
            <KpiTile label="Rows" value={fmtStaffInt(totals.rows)} />
            <KpiTile label="Cash in" value={fmtStaffMoney(totals.cashIn, fiat)} />
            <KpiTile label="Cash out" value={fmtStaffMoney(totals.cashOut, fiat)} />
          </div>
        ) : null}
        <DataTable<OwnerLedgerRow>
          viewId="owner-ledger"
          columns={columns}
          rows={pageRows}
          total={rows.length}
          page={safePage}
          pageSize={pageSize}
          onPageChange={(p) => setPage(p)}
          search={q}
          onSearchChange={(v) => { setQ(v); setPage(1); }}
          searchPlaceholder="Search by player or contact"
          filters={TYPE_FILTERS}
          activeFilter={type}
          onFilterChange={(id) => { setType(id); setPage(1); }}
          onExportCsv={exportCsv}
          loading={loading}
          error={err}
          onRetry={reload}
          emptyTitle="No money movements yet."
          emptyText="No rows match the current filters."
          expandable
          expandRender={(r) => (
            <div>
              <p>{r.detail}</p>
              {r.reason ? <p>Reason: {r.reason}</p> : null}
              {r.status ? <p>Status: {r.status}</p> : null}
              {r.adminName ? <p>Admin: {r.adminName}</p> : null}
              <p>Wallet: {r.wallet} · {r.fiatCurrency}</p>
            </div>
          )}
        />
      </Card>
    </div>
  );
}
