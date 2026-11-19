// Owner analytics (Nov 2026) — income vs losses + when income rises.
// Owner-only, per fiat, driven by the shared OwnerRangeBar (range +
// currency). Data from GET /api/owner/analytics. Labels follow
// docs/FINANCIAL_METRIC_DEFINITIONS.md exactly: "Net position" is
// deposits in − payouts out (decided withdrawals + game payouts) —
// NEVER "profit". "Payouts out" counts Withdrawal.status IN
// ("approved", "rejected") — the amount leaves the balance on the
// decision, approve or reject (approval ≠ payment off-platform).
// Charts are the hand-rolled SVG staff-ui charts (D5) with their table
// alternative; per-game tables are the shared DataTable (+ CardList on
// phone), cash and coins apart — coins never added to cash figures.
"use client";

import { useMemo, useState } from "react";
import { useStore } from "../../../../lib/store";
import { useOwner } from "../../../../components/owner/OwnerContext";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";
import { Card, KpiTile } from "../../../../components/staff-ui/Card";
import { DataTable, type DataColumn } from "../../../../components/staff-ui/DataTable";
import { BarChart, LineChart, CHART_COLORS } from "../../../../components/staff-ui/Charts";
import { Skeleton, ErrorState, EmptyState } from "../../../../components/staff-ui/Feedback";
import { fmtStaffMoney, fmtStaffInt } from "../../../../components/staff-ui/format";
import { useOwnerFetch } from "../../../../components/owner/useOwnerFetch";
import type { AnalyticsData } from "../../../../lib/analytics";
import type { RevenueGameRow } from "../../../../lib/revenue";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-12" → "12 Nov" (short chart label, UTC). */
function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "2026-11-12" → "12 Nov 2026". */
function longDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** 0–23 → "00:00"–"23:00" (UTC). */
function hourLabel(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

function gameCashColumns(fiat: string): DataColumn<RevenueGameRow & { id: string }>[] {
  return [
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
}

function gameCoinsColumns(): DataColumn<RevenueGameRow & { id: string }>[] {
  return [
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
}

/** Static client-side paging around DataTable (same helper as the BI
 *  page): the per-game tables are ≤ 46 rows, one page at 25. */
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

export default function OwnerAnalyticsPage() {
  const { user } = useStore();
  const { fiat, range } = useOwner();
  const url = useMemo(
    () => (user && range ? `/api/owner/analytics?from=${range.from}&to=${range.to}&currency=${fiat}` : null),
    [user, range, fiat],
  );
  const { data, err, loading, reload } = useOwnerFetch<AnalyticsData>(url);

  const dailyLabels = useMemo(() => (data?.daily ?? []).map((d) => shortDate(d.date)), [data]);
  const peakHour = useMemo(() => {
    const hours = data?.hourly ?? [];
    let best: { hour: number; deposits: number } | null = null;
    for (const h of hours) {
      if (best === null || h.deposits > best.deposits) best = { hour: h.hour, deposits: h.deposits };
    }
    return best !== null && best.deposits > 0 ? best : null;
  }, [data]);

  return (
    <div>
      <PageHeader title="Analytics" sub="Income vs payouts, and when income rises." />
      <OwnerRangeBar />
      {loading ? (
        <Skeleton lines={6} title />
      ) : err ? (
        <ErrorState text={err} onRetry={reload} />
      ) : !data ? (
        <EmptyState title="No analytics yet." text="No analytics yet." />
      ) : (
        <>
          <div className="st-kpis">
            <KpiTile label="Total deposits" value={fmtStaffMoney(data.totals.deposits, fiat)} sub={`${fmtStaffInt(data.totals.depositsCount)} deposits`} />
            <KpiTile label="Payouts out" value={fmtStaffMoney(data.totals.paidOut, fiat)} sub={`${fmtStaffInt(data.totals.paidOutCount)} decided`} />
            <KpiTile label="GGR (cash)" value={fmtStaffMoney(data.totals.ggrCash, fiat)} sub="Stakes − payouts" />
            <KpiTile
              label="Net position"
              value={fmtStaffMoney(data.totals.netPosition, fiat)}
              sub="Deposits in − payouts out · not profit"
            />
          </div>

          <Card
            title="Income vs payouts over time"
            sub="Deposits in, payouts out (decided withdrawals + game payouts), and the net line. Net position is cash flow, not profit."
          >
            {data.daily.length === 0 ? (
              <EmptyState title="No days in this range." text="No days in this range." />
            ) : (
              <LineChart
                labels={dailyLabels}
                series={[
                  { label: "Deposits in", color: CHART_COLORS.gold, values: data.daily.map((d) => d.deposits) },
                  { label: "Payouts out", color: CHART_COLORS.redText, values: data.daily.map((d) => d.payoutsOut) },
                  { label: "Net", color: CHART_COLORS.green, values: data.daily.map((d) => d.net) },
                ]}
                formatValue={(v) => fmtStaffMoney(v, fiat)}
              />
            )}
          </Card>

          <Card title="When income rises" sub="Deposits by hour of day (UTC), and the trend against the previous period.">
            <p>
              {data.trend.direction === "rising"
                ? `Income is rising — deposits up ${data.trend.depositsPct === null ? "from zero" : `${data.trend.depositsPct}%`} vs the previous ${data.daily.length} days.`
                : data.trend.direction === "falling"
                  ? `Income is falling — deposits down ${data.trend.depositsPct === null ? "to zero" : `${Math.abs(data.trend.depositsPct)}%`} vs the previous ${data.daily.length} days.`
                  : "Income is flat vs the previous period."}
            </p>
            {data.bestDay ? (
              <p>
                Best day: {longDate(data.bestDay.date)} — {fmtStaffMoney(data.bestDay.deposits, fiat)} deposited.
              </p>
            ) : (
              <p>No deposits in this range yet.</p>
            )}
            {peakHour ? (
              <p>
                Peak hour: {hourLabel(peakHour.hour)} UTC — {fmtStaffMoney(peakHour.deposits, fiat)} deposited in that hour.
              </p>
            ) : null}
            <BarChart
              labels={data.hourly.map((h) => String(h.hour).padStart(2, "0"))}
              series={[{ label: "Deposits", color: CHART_COLORS.gold, values: data.hourly.map((h) => h.deposits) }]}
              formatValue={(v) => fmtStaffMoney(v, fiat)}
            />
          </Card>

          <Card title="Per game (cash)" sub="Stakes, payouts and GGR per game in this range.">
            {data.byGameCash.length === 0 ? (
              <EmptyState title="No cash rounds in this range." text="No cash rounds in this range." />
            ) : (
              <PagedTable
                viewId="owner-analytics-games-cash"
                columns={gameCashColumns(fiat)}
                rows={data.byGameCash.map((g) => ({ ...g, id: g.game }))}
                emptyTitle="No cash rounds in this range."
                emptyText="No cash rounds in this range."
              />
            )}
          </Card>

          {data.byGameCoins.length > 0 ? (
            <Card title="Per game (coins)" sub="Coin stakes, payouts and GGR — play-only, never added to cash figures.">
              <PagedTable
                viewId="owner-analytics-games-coins"
                columns={gameCoinsColumns()}
                rows={data.byGameCoins.map((g) => ({ ...g, id: g.game }))}
                emptyTitle="No coin rounds in this range."
                emptyText="No coin rounds in this range."
              />
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
