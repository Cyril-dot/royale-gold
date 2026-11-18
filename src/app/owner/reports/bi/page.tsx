// Owner BI & cohorts (Phase 4 restyle) — split out of the old one-page
// owner panel (deleted in Phase 4). Same endpoints, same
// behaviour — now its own route, loading only its own data. Staff-ui
// throughout: KPI tiles, Segmented period picker, staff-ui DateRange,
// DataTable + CardList on phone for every breakdown, and the shared
// BarChart (with its table alternative) for daily GGR. Money is
// per-currency via fmtStaffMoney; coin GGR stays in coins, never added
// to cash GGR.
"use client";

import { useMemo, useState } from "react";
import { todayStr } from "../../../../lib/admin-client";
import { useStore } from "../../../../lib/store";
import { useOwner } from "../../../../components/owner/OwnerContext";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";
import { Card, KpiTile } from "../../../../components/staff-ui/Card";
import { DataTable, type DataColumn } from "../../../../components/staff-ui/DataTable";
import { Button } from "../../../../components/staff-ui/Button";
import { Segmented } from "../../../../components/staff-ui/Tabs";
import { DateRange } from "../../../../components/staff-ui/Form";
import { BarChart, CHART_COLORS } from "../../../../components/staff-ui/Charts";
import { Skeleton, ErrorState } from "../../../../components/staff-ui/Feedback";
import { fmtStaffMoney, fmtStaffInt } from "../../../../components/staff-ui/format";
import { useOwnerFetch } from "../../../../components/owner/useOwnerFetch";

// P1 Batch 3 (O16/O17): revenue breakdowns + RTP monitor — one shared
// period, so the two sections always agree on the dates they show.
interface RevenueGameRow {
  game: string;
  name: string;
  currency: string;
  rounds: number;
  stakes: number;
  payouts: number;
  ggr: number;
}
interface RevenueAdminRow {
  adminId: string | null;
  adminName: string;
  deposits: number;
  totalDeposited: number;
  commission: number;
  ggr: number;
}
interface RevenueDayRow {
  date: string;
  ggr: number;
  deposits: number;
  totalDeposited: number;
  commission: number;
}
interface RevenueMethodRow {
  method: string;
  deposits: number;
  total: number;
}
interface RevenueData {
  from: string;
  to: string;
  byGameCash: RevenueGameRow[];
  byGameCoins: RevenueGameRow[];
  byAdmin: RevenueAdminRow[];
  byDay: RevenueDayRow[];
  byMethod: RevenueMethodRow[];
  totals: { ggrCash: number; ggrCoins: number; deposits: number; totalDeposited: number; commission: number };
}

// O26: advanced BI & cohorts — players by joining month, with
// activity, deposits, stakes, GGR, average deposit + a month-1/2/3
// retention curve. Read from the real tables, no analytics store.
interface CohortRow {
  cohort: string;
  players: number;
  activePct: number;
  totalDeposited: number;
  totalStaked: number;
  ggr: number;
  avgDeposit: number;
  retention: { m1: number | null; m2: number | null; m3: number | null };
}

type AnPreset = "today" | "week" | "month" | "custom";

const PRESET_ITEMS = [
  { id: "today", label: "Today" },
  { id: "week", label: "Last 7 days" },
  { id: "month", label: "This month" },
  { id: "custom", label: "Custom" },
];

/** Client-side pagination for the small breakdown tables — each table
 *  keeps its own page; the caller owns rows only. */
function PagedTable<T extends { id: string }>({
  viewId,
  columns,
  rows,
  emptyTitle,
  emptyText,
}: {
  viewId: string;
  columns: DataColumn<T>[];
  rows: T[];
  emptyTitle: string;
  emptyText: string;
}) {
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);
  return (
    <DataTable<T>
      viewId={viewId}
      columns={columns}
      rows={pageRows}
      total={rows.length}
      page={safePage}
      pageSize={pageSize}
      onPageChange={(p) => setPage(p)}
      emptyTitle={emptyTitle}
      emptyText={emptyText}
    />
  );
}

function retentionCell(v: number | null): string {
  return v === null ? "—" : `${v}%`;
}

export default function OwnerBiPage() {
  const { user } = useStore();
  const { fiat } = useOwner();
  const [anPreset, setAnPreset] = useState<AnPreset>("month");
  const [anFrom, setAnFrom] = useState("");
  const [anTo, setAnTo] = useState("");

  const revenueUrl = useMemo(() => {
    if (!user) return null;
    const today = todayStr();
    let from = today;
    let to = today;
    if (anPreset === "week") {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - 6);
      from = d.toISOString().slice(0, 10);
    } else if (anPreset === "month") {
      from = `${today.slice(0, 8)}01`;
    } else if (anPreset === "custom") {
      from = anFrom || today;
      to = anTo || today;
    }
    return `/api/owner/revenue?from=${from}&to=${to}&currency=${fiat}`;
  }, [user, anPreset, anFrom, anTo, fiat]);
  const { data: revenue, err: revenueErr, loading: revenueLoading, reload: reloadRevenue } =
    useOwnerFetch<RevenueData>(revenueUrl);

  const biUrl = useMemo(() => (user ? `/api/owner/bi?currency=${fiat}` : null), [user, fiat]);
  const { data: bi, err: biErr, loading: biLoading, reload: reloadBi } =
    useOwnerFetch<{ cohorts: CohortRow[]; totalPlayers: number }>(biUrl);

  const gameCashColumns: DataColumn<RevenueGameRow & { id: string }>[] = [
    {
      key: "game",
      label: "Game",
      render: (g) => g.name,
      // NOTE: DataTable's phone CardList only reads `details` from
      // columns AFTER the first — details on the first column never
      // render. Every detail below lives on its own column.
    },
    {
      key: "rounds",
      label: "Rounds",
      render: (g) => fmtStaffInt(g.rounds),
      details: (g) => [["Rounds", fmtStaffInt(g.rounds)]],
    },
    {
      key: "stakes",
      label: "Stakes",
      render: (g) => fmtStaffMoney(g.stakes, fiat),
      details: (g) => [["Stakes", fmtStaffMoney(g.stakes, fiat)]],
    },
    {
      key: "payouts",
      label: "Payouts",
      render: (g) => fmtStaffMoney(g.payouts, fiat),
      details: (g) => [["Payouts", fmtStaffMoney(g.payouts, fiat)]],
    },
    {
      key: "ggr",
      label: "GGR",
      render: (g) => fmtStaffMoney(g.ggr, fiat),
    },
  ];
  const gameCoinsColumns: DataColumn<RevenueGameRow & { id: string }>[] = [
    { key: "game", label: "Game", render: (g) => g.name },
    {
      key: "rounds",
      label: "Rounds",
      render: (g) => fmtStaffInt(g.rounds),
      details: (g) => [["Rounds", fmtStaffInt(g.rounds)]],
    },
    {
      key: "stakes",
      label: "Stakes",
      render: (g) => `${fmtStaffInt(g.stakes)} coins`,
      details: (g) => [["Stakes", `${fmtStaffInt(g.stakes)} coins`]],
    },
    {
      key: "payouts",
      label: "Payouts",
      render: (g) => `${fmtStaffInt(g.payouts)} coins`,
      details: (g) => [["Payouts", `${fmtStaffInt(g.payouts)} coins`]],
    },
    { key: "ggr", label: "GGR", render: (g) => `${fmtStaffInt(g.ggr)} coins` },
  ];
  const adminColumns: DataColumn<RevenueAdminRow & { id: string }>[] = [
    { key: "admin", label: "Admin", render: (a) => a.adminName },
    {
      key: "deposits",
      label: "Deposits",
      render: (a) => fmtStaffInt(a.deposits),
      details: (a) => [["Deposits", fmtStaffInt(a.deposits)]],
    },
    {
      key: "deposited",
      label: "Deposited",
      render: (a) => fmtStaffMoney(a.totalDeposited, fiat),
      details: (a) => [["Deposited", fmtStaffMoney(a.totalDeposited, fiat)]],
    },
    {
      key: "commission",
      label: "Commission",
      render: (a) => fmtStaffMoney(a.commission, fiat),
      details: (a) => [["Commission", fmtStaffMoney(a.commission, fiat)]],
    },
    { key: "ggr", label: "GGR", render: (a) => fmtStaffMoney(a.ggr, fiat) },
  ];
  const dayColumns: DataColumn<RevenueDayRow & { id: string }>[] = [
    { key: "date", label: "Date", render: (d) => d.date },
    {
      key: "ggr",
      label: "GGR",
      render: (d) => fmtStaffMoney(d.ggr, fiat),
      details: (d) => [["GGR", fmtStaffMoney(d.ggr, fiat)]],
    },
    {
      key: "deposits",
      label: "Deposits",
      render: (d) => fmtStaffInt(d.deposits),
      details: (d) => [["Deposits", fmtStaffInt(d.deposits)]],
    },
    {
      key: "deposited",
      label: "Deposited",
      render: (d) => fmtStaffMoney(d.totalDeposited, fiat),
      details: (d) => [["Deposited", fmtStaffMoney(d.totalDeposited, fiat)]],
    },
    {
      key: "commission",
      label: "Commission",
      render: (d) => fmtStaffMoney(d.commission, fiat),
      details: (d) => [["Commission", fmtStaffMoney(d.commission, fiat)]],
    },
  ];
  const methodColumns: DataColumn<RevenueMethodRow & { id: string }>[] = [
    { key: "method", label: "Method", render: (m) => m.method },
    {
      key: "deposits",
      label: "Deposits",
      render: (m) => fmtStaffInt(m.deposits),
      details: (m) => [["Deposits", fmtStaffInt(m.deposits)]],
    },
    { key: "total", label: "Total", render: (m) => fmtStaffMoney(m.total, fiat) },
  ];
  const cohortColumns: DataColumn<CohortRow & { id: string }>[] = [
    { key: "cohort", label: "Cohort", render: (c) => c.cohort },
    {
      key: "players",
      label: "Players",
      render: (c) => fmtStaffInt(c.players),
      details: (c) => [["Players", fmtStaffInt(c.players)]],
    },
    {
      key: "active",
      label: "Active (30d)",
      render: (c) => `${c.activePct}%`,
      details: (c) => [["Active (30d)", `${c.activePct}%`]],
    },
    {
      key: "deposited",
      label: "Deposited",
      render: (c) => fmtStaffMoney(c.totalDeposited, fiat),
      details: (c) => [["Deposited", fmtStaffMoney(c.totalDeposited, fiat)]],
    },
    {
      key: "staked",
      label: "Staked",
      render: (c) => fmtStaffMoney(c.totalStaked, fiat),
      details: (c) => [["Staked", fmtStaffMoney(c.totalStaked, fiat)]],
    },
    {
      key: "ggr",
      label: "GGR",
      render: (c) => fmtStaffMoney(c.ggr, fiat),
      details: (c) => [["GGR", fmtStaffMoney(c.ggr, fiat)]],
    },
    {
      key: "avg",
      label: "Avg deposit",
      render: (c) => fmtStaffMoney(c.avgDeposit, fiat),
      details: (c) => [["Avg deposit", fmtStaffMoney(c.avgDeposit, fiat)]],
    },
  ];
  const retentionColumns: DataColumn<CohortRow & { id: string }>[] = [
    { key: "cohort", label: "Cohort", render: (c) => c.cohort },
    {
      key: "m1",
      label: "Month 1",
      render: (c) => retentionCell(c.retention.m1),
      details: (c) => [["Month 1", retentionCell(c.retention.m1)]],
    },
    {
      key: "m2",
      label: "Month 2",
      render: (c) => retentionCell(c.retention.m2),
      details: (c) => [["Month 2", retentionCell(c.retention.m2)]],
    },
    {
      key: "m3",
      label: "Month 3",
      render: (c) => retentionCell(c.retention.m3),
      details: (c) => [["Month 3", retentionCell(c.retention.m3)]],
    },
  ];

  return (
    <div>
      <PageHeader title="BI & cohorts" sub="Revenue breakdowns and player cohorts." />
      <OwnerRangeBar />
      <Card
        title="Revenue breakdowns"
        sub={revenue ? `${revenue.from} to ${revenue.to} · UTC days` : undefined}
      >
        <Segmented
          label="Analytics period"
          items={PRESET_ITEMS}
          value={anPreset}
          onChange={(id) => setAnPreset(id as AnPreset)}
        />
        {anPreset === "custom" ? (
          <DateRange
            value={{ from: anFrom, to: anTo }}
            onChange={(v) => {
              setAnFrom(v.from);
              setAnTo(v.to);
            }}
            label="Custom period"
            max={todayStr()}
          />
        ) : null}
        {revenueLoading ? (
          <Skeleton lines={5} />
        ) : revenueErr ? (
          <ErrorState text={revenueErr} onRetry={reloadRevenue} />
        ) : revenue ? (
          <>
            <div>
              <KpiTile label="GGR (cash)" value={fmtStaffMoney(revenue.totals.ggrCash, fiat)} />
              <KpiTile label="GGR (coins)" value={`${fmtStaffInt(revenue.totals.ggrCoins)} coins`} />
              <KpiTile label="Deposits" value={fmtStaffMoney(revenue.totals.totalDeposited, fiat)} />
              <KpiTile label="Commission" value={fmtStaffMoney(revenue.totals.commission, fiat)} />
            </div>
            <h4>By game — cash</h4>
            <p>Top 5 by GGR are the first five rows.</p>
            <PagedTable
              viewId="owner-revenue-game-cash"
              columns={gameCashColumns}
              rows={revenue.byGameCash.map((g) => ({ ...g, id: g.game }))}
              emptyTitle="No cash rounds in this period."
              emptyText="No cash rounds in this period."
            />
            <h4>By game — coins</h4>
            <PagedTable
              viewId="owner-revenue-game-coins"
              columns={gameCoinsColumns}
              rows={revenue.byGameCoins.map((g) => ({ ...g, id: g.game }))}
              emptyTitle="No coin rounds in this period."
              emptyText="No coin rounds in this period."
            />
            <h4>By admin</h4>
            <PagedTable
              viewId="owner-revenue-admin"
              columns={adminColumns}
              rows={revenue.byAdmin.map((a) => ({ ...a, id: a.adminId ?? "none" }))}
              emptyTitle="No admins in this period."
              emptyText="No admin revenue in this period."
            />
            <h4>By day</h4>
            {revenue.byDay.length === 0 ? (
              <p>No days in this period.</p>
            ) : (
              <>
                <BarChart
                  labels={revenue.byDay.map((d) => d.date.slice(5))}
                  series={[{ label: "GGR", color: CHART_COLORS.gold, values: revenue.byDay.map((d) => d.ggr) }]}
                  formatValue={(v) => fmtStaffMoney(v, fiat)}
                />
                <PagedTable
                  viewId="owner-revenue-day"
                  columns={dayColumns}
                  rows={revenue.byDay.map((d) => ({ ...d, id: d.date }))}
                  emptyTitle="No days in this period."
                  emptyText="No days in this period."
                />
              </>
            )}
            <h4>By payment method</h4>
            <PagedTable
              viewId="owner-revenue-method"
              columns={methodColumns}
              rows={revenue.byMethod.map((m) => ({ ...m, id: m.method }))}
              emptyTitle="No deposits in this period."
              emptyText="No deposits in this period."
            />
          </>
        ) : null}
      </Card>

      <Card title="BI & cohorts">
        {biLoading ? (
          <Skeleton lines={5} />
        ) : biErr ? (
          <ErrorState text={biErr} onRetry={reloadBi} />
        ) : bi ? (
          <>
            <div>
              <KpiTile label="Players" value={fmtStaffInt(bi.totalPlayers)} />
              <KpiTile label="Cohorts" value={fmtStaffInt(bi.cohorts.length)} />
            </div>
            <PagedTable
              viewId="owner-cohorts"
              columns={cohortColumns}
              rows={bi.cohorts.map((c) => ({ ...c, id: c.cohort }))}
              emptyTitle="No players yet."
              emptyText="No cohorts yet."
            />
            <h4>Retention curve</h4>
            <PagedTable
              viewId="owner-retention"
              columns={retentionColumns}
              rows={bi.cohorts.map((c) => ({ ...c, id: c.cohort }))}
              emptyTitle="No players yet."
              emptyText="No retention data yet."
            />
            <Button variant="ghost" size="sm" onClick={() => void reloadBi()}>
              Refresh cohorts
            </Button>
          </>
        ) : null}
      </Card>
    </div>
  );
}
