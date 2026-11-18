// Owner RTP monitor (Phase 4 restyle) — split out of the old one-page
// owner panel (deleted in Phase 4). Same endpoint, same
// behaviour, same flag thresholds (flagged only with 50+ rounds and 10+
// points off base — src/lib/rtp.ts; not re-derived here). Staff-ui
// throughout: Segmented period picker + DateRange, DataTable (search /
// status filter / sort / pagination, CardList on phone), StatusPill
// replaced by Badge so status is never colour-alone. The endpoint
// returns one period's aggregates only — no time series — so there is
// nothing to chart; the numbers stay a table, no chart is invented.
"use client";

import { useMemo, useState, type ReactNode } from "react";
import { todayStr } from "../../../../lib/admin-client";
import { useStore } from "../../../../lib/store";
import { useOwner } from "../../../../components/owner/OwnerContext";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";
import { Card } from "../../../../components/staff-ui/Card";
import { DataTable, type DataColumn } from "../../../../components/staff-ui/DataTable";
import { Badge } from "../../../../components/staff-ui/Badge";
import { Segmented } from "../../../../components/staff-ui/Tabs";
import { DateRange } from "../../../../components/staff-ui/Form";
import { fmtStaffMoney, fmtStaffInt } from "../../../../components/staff-ui/format";
import { useOwnerFetch } from "../../../../components/owner/useOwnerFetch";

interface RtpRow {
  slug: string;
  name: string;
  currency: string;
  rounds: number;
  stakes: number;
  payouts: number;
  actualRtp: number | null;
  baseRtp: number | null;
  status: string;
}

type RtpViewRow = RtpRow & { id: string };

const STATUS_FILTERS = [
  { id: "", label: "All" },
  { id: "flagged-over", label: "Over-paying" },
  { id: "flagged-under", label: "Under-paying" },
  { id: "ok", label: "OK" },
  { id: "small-sample", label: "Too few rounds" },
  { id: "no-base", label: "Skill — no base" },
];

function statusLabel(s: string): string {
  if (s === "flagged-over") return "Over-paying";
  if (s === "flagged-under") return "Under-paying";
  if (s === "ok") return "OK";
  if (s === "small-sample") return "Too few rounds";
  return "Skill — no base";
}

function StatusBadge({ status }: { status: string }) {
  if (status === "flagged-over") return <Badge variant="danger">{statusLabel(status)}</Badge>;
  if (status === "flagged-under") return <Badge variant="warn">{statusLabel(status)}</Badge>;
  if (status === "ok") return <Badge variant="ok">{statusLabel(status)}</Badge>;
  if (status === "small-sample") return <Badge variant="muted">{statusLabel(status)}</Badge>;
  return <Badge variant="info">{statusLabel(status)}</Badge>;
}

type Period = "today" | "week" | "month" | "custom";

export default function OwnerRtpPage() {
  const { user } = useStore();
  const { fiat } = useOwner();
  const [preset, setPreset] = useState<Period>("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState("rounds");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const pageSize = 25;

  // Same period math as the Phase 2 page (UTC days).
  const range = useMemo(() => {
    const today = todayStr();
    if (preset === "week") {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - 6);
      return { from: d.toISOString().slice(0, 10), to: today };
    }
    if (preset === "month") return { from: `${today.slice(0, 8)}01`, to: today };
    if (preset === "custom") return { from: from || today, to: to || today };
    return { from: today, to: today };
  }, [preset, from, to]);

  const url = useMemo(
    () => (user ? `/api/owner/rtp?from=${range.from}&to=${range.to}` : null),
    [user, range],
  );
  const { data, err, loading, reload } = useOwnerFetch<{ from: string; to: string; rows: RtpRow[] }>(url);

  const money = (r: RtpRow, n: number) =>
    r.currency === "coins" ? `${fmtStaffInt(n)} coins` : fmtStaffMoney(n, fiat);

  const rows = useMemo<RtpViewRow[]>(() => {
    const all: RtpViewRow[] = (data?.rows ?? []).map((r) => ({ ...r, id: r.slug }));
    const needle = search.trim().toLowerCase();
    const kept = all.filter(
      (r) =>
        (!status || r.status === status) &&
        (!needle || r.name.toLowerCase().includes(needle)),
    );
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (r: RtpViewRow): number => {
      if (sortKey === "stakes") return r.stakes;
      if (sortKey === "payouts") return r.payouts;
      if (sortKey === "actualRtp") return r.actualRtp ?? -Infinity;
      return r.rounds;
    };
    return [...kept].sort((a, b) => (val(a) - val(b)) * dir);
  }, [data, status, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);

  const onSort = (key: string) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
    setPage(1);
  };

  const columns: DataColumn<RtpViewRow>[] = [
    {
      key: "game",
      label: "Game",
      render: (r) => r.name,
      sub: (r) => (r.currency === "coins" ? "Coins" : "Cash"),
    },
    {
      key: "rounds",
      label: "Rounds",
      sortable: true,
      render: (r) => fmtStaffInt(r.rounds),
      details: (r) => [["Rounds", fmtStaffInt(r.rounds)]],
    },
    {
      key: "stakes",
      label: "Stakes",
      sortable: true,
      render: (r) => money(r, r.stakes),
      details: (r) => [["Stakes", money(r, r.stakes)]],
    },
    {
      key: "payouts",
      label: "Payouts",
      sortable: true,
      render: (r) => money(r, r.payouts),
      details: (r) => [["Payouts", money(r, r.payouts)]],
    },
    {
      key: "actualRtp",
      label: "Actual RTP",
      sortable: true,
      render: (r) => (r.actualRtp === null ? "—" : `${r.actualRtp.toFixed(1)}%`),
      details: (r): [string, ReactNode][] => [["Actual RTP", r.actualRtp === null ? "—" : `${r.actualRtp.toFixed(1)}%`]],
    },
    {
      key: "baseRtp",
      label: "Base RTP",
      render: (r) => (r.baseRtp === null ? "Skill" : `${r.baseRtp}%`),
      details: (r): [string, ReactNode][] => [["Base RTP", r.baseRtp === null ? "Skill" : `${r.baseRtp}%`]],
    },
    {
      key: "status",
      label: "Status",
      render: (r) => <StatusBadge status={r.status} />,
      details: (r): [string, ReactNode][] => [["Status", <StatusBadge key="s" status={r.status} />]],
    },
  ];

  return (
    <div>
      <PageHeader title="RTP monitor" sub="Actual vs base RTP per game." />
      <OwnerRangeBar />
      <Card
        title="RTP monitor"
        sub={`Showing ${data ? `${data.from} – ${data.to}` : `${range.from} – ${range.to}`} (UTC days). Flagged when actual RTP is 10+ points off base with 50+ rounds; below 50 rounds the sample is too small to flag.`}
      >
        <Segmented
          label="Analytics period"
          items={[
            { id: "today", label: "Today" },
            { id: "week", label: "Last 7 days" },
            { id: "month", label: "This month" },
            { id: "custom", label: "Custom" },
          ]}
          value={preset}
          onChange={(id) => { setPreset(id as Period); setPage(1); }}
        />
        {preset === "custom" ? (
          <DateRange value={{ from, to }} onChange={(v) => { setFrom(v.from); setTo(v.to); setPage(1); }} max={todayStr()} />
        ) : null}
        <DataTable<RtpViewRow>
          viewId="owner-rtp"
          columns={columns}
          rows={pageRows}
          total={rows.length}
          page={safePage}
          pageSize={pageSize}
          onPageChange={(p) => setPage(p)}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={onSort}
          search={search}
          onSearchChange={(q) => { setSearch(q); setPage(1); }}
          searchPlaceholder="Search games…"
          filters={STATUS_FILTERS}
          activeFilter={status}
          onFilterChange={(id) => { setStatus(id); setPage(1); }}
          loading={loading}
          error={err}
          onRetry={reload}
          emptyTitle="No RTP rows."
          emptyText="No games match the current filters."
        />
      </Card>
    </div>
  );
}
