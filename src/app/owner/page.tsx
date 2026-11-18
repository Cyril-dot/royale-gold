// Owner Command Center (Phase 2) — the /owner home page. One call,
// GET /api/owner/command-center, for everything on this screen: KPIs +
// deltas vs the previous period + charts + alert strip + pending
// queues + top admins + recent activity. The range bar drives it
// (default Last 7 days, PRIME carry-over); refetch on window focus so
// the live numbers never sit stale. Tiles drill down to the real
// routes (never dead numbers).
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../lib/api";
import { useOwner } from "../../components/owner/OwnerContext";
import { OwnerRangeBar } from "../../components/owner/OwnerRangeBar";
import { ACT_VERB, FIN_SERIES, relTime, type FinSeries } from "../../components/owner/owner-helpers";
import { PageHeader } from "../../components/staff-ui/PageHeader";
import { Card, KpiTile } from "../../components/staff-ui/Card";
import { Badge } from "../../components/staff-ui/Badge";
import { BarChart, CHART_COLORS, type ChartSeries } from "../../components/staff-ui/Charts";
import { ErrorState, Skeleton, SkeletonCard } from "../../components/staff-ui/Feedback";
import { fmtStaffInt, fmtStaffMoney } from "../../components/staff-ui/format";

interface FinBucket {
  label: string;
  from: string;
  to: string;
  deposits: number;
  depositsCount: number;
  payouts: number;
  payoutsCount: number;
  commGen: number;
  commPaid: number;
}
interface GrowthBucket {
  label: string;
  from: string;
  to: string;
  newUsers: number;
  cumulative: number;
}
interface ActivityItem {
  kind: "deposit" | "withdrawal" | "signup" | "commission";
  name: string;
  amount: number | null;
  detail: string | null;
  at: string;
}
interface TopAdmin {
  adminId: string;
  adminName: string;
  earned: number;
  paid: number;
  unpaid: number;
}
interface CommandCenterData {
  currency: string;
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
  usersTotal: number;
  usersToday: number;
  usersRange: number;
  usersPrev: number;
  depositedTotal: number;
  depositedToday: number;
  depositedRange: number;
  depositedPrev: number;
  paidOutTotal: number;
  paidOutToday: number;
  paidOutRange: number;
  paidOutPrev: number;
  commissionToday: number;
  commissionRange: number;
  commissionPrev: number;
  ggrRange: number;
  ggrPrev: number;
  activePlayersRange: number;
  activePlayersPrev: number;
  finChart: { grouping: string; buckets: FinBucket[] };
  growthChart: { grouping: string; buckets: GrowthBucket[] };
  activity: ActivityItem[];
  deposits7d: { date: string; total: number }[];
  topAdmins: TopAdmin[];
  alerts: { id: string; severity: "high" | "medium" | "info"; label: string; href: string }[];
  pending: {
    withdrawalsPending: number;
    withdrawalsAwaitingOwner: number;
    withdrawalsOverThreshold: number;
    payoutsDueAdmins: number;
    payoutsDueAmount: number;
    kycPending: number;
    ticketsOpen: number;
    fraudHigh: number;
    fraudMedium: number;
    anomaliesHigh: number;
    anomaliesMedium: number;
  };
}

/** Delta vs the previous equivalent period. "new" when the previous
 *  period was zero and this one is not; null when both are zero. */
function delta(cur: number, prev: number): { text: string; up: boolean } | null {
  if (prev === 0) return cur > 0 ? { text: "new", up: true } : null;
  const pct = Math.round(((cur - prev) / Math.abs(prev)) * 100);
  if (pct === 0) return { text: "±0%", up: true };
  return { text: `${pct > 0 ? "+" : ""}${pct}%`, up: pct >= 0 };
}

const FIN_COLORS: Record<FinSeries, string> = {
  deposits: CHART_COLORS.gold,
  payouts: CHART_COLORS.muted,
  commGen: CHART_COLORS.green,
  commPaid: CHART_COLORS.goldLight,
};

export default function OwnerCommandCenterPage() {
  const { fiat, range } = useOwner();
  const [data, setData] = useState<CommandCenterData | null>(null);
  const [err, setErr] = useState(false);
  const [finOn, setFinOn] = useState<Record<FinSeries, boolean>>({
    deposits: true,
    payouts: true,
    commGen: true,
    commPaid: true,
  });

  const load = useCallback(async () => {
    if (!range) return;
    try {
      setErr(false);
      setData(
        await api<CommandCenterData>(
          `/api/owner/command-center?currency=${fiat}&from=${range.from}&to=${range.to}`,
        ),
      );
    } catch {
      setErr(true);
    }
  }, [fiat, range]);

  useEffect(() => {
    void load();
  }, [load]);

  // Live numbers: refetch when the owner comes back to the tab.
  useEffect(() => {
    const onFocus = () => {
      void load();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const toggleFin = (id: FinSeries) => setFinOn((cur) => ({ ...cur, [id]: !cur[id] }));

  if (data === null) {
    return (
      <div>
        <PageHeader title="Command Center" sub="Platform at a glance" />
        <OwnerRangeBar />
        {err ? (
          <ErrorState onRetry={() => void load()} />
        ) : (
          <>
            <Skeleton title lines={2} />
            <SkeletonCard />
            <SkeletonCard />
          </>
        )}
      </div>
    );
  }

  const d = data;
  const net = d.depositedRange - d.paidOutRange;
  const netPrev = d.depositedPrev - d.paidOutPrev;
  const netDelta = delta(net, netPrev);
  const depDelta = delta(d.depositedRange, d.depositedPrev);
  const wdDelta = delta(d.paidOutRange, d.paidOutPrev);
  const ggrDelta = delta(d.ggrRange, d.ggrPrev);
  const commDelta = delta(d.commissionRange, d.commissionPrev);
  const activeDelta = delta(d.activePlayersRange, d.activePlayersPrev);
  const pendingTotal =
    d.pending.withdrawalsPending + d.pending.payoutsDueAdmins + d.pending.kycPending + d.pending.ticketsOpen;

  const finSeries: ChartSeries[] = FIN_SERIES.filter((s) => finOn[s.id]).map((s) => ({
    label: s.label,
    color: FIN_COLORS[s.id],
    values: d.finChart.buckets.map((b) =>
      s.id === "deposits" ? b.deposits : s.id === "payouts" ? b.payouts : s.id === "commGen" ? b.commGen : b.commPaid,
    ),
  }));
  const finEmpty =
    d.finChart.buckets.length === 0 ||
    d.finChart.buckets.every((b) => b.deposits === 0 && b.payouts === 0 && b.commGen === 0 && b.commPaid === 0);
  const growthEmpty = d.growthChart.buckets.every((b) => b.newUsers === 0);
  const lastCumulative = d.growthChart.buckets[d.growthChart.buckets.length - 1]?.cumulative ?? d.usersTotal;

  return (
    <div>
      <PageHeader title="Command Center" sub="Platform at a glance" />
      <OwnerRangeBar />

      {d.alerts.length > 0 ? (
        <Card title="Needs attention">
          {d.alerts.map((a) => (
            <Link key={a.id} href={a.href} className="st-alert-row">
              <Badge variant={a.severity === "high" ? "danger" : a.severity === "medium" ? "warn" : "info"}>
                {a.severity === "high" ? "Urgent" : a.severity === "medium" ? "Check" : "Note"}
              </Badge>
              <span>{a.label}</span>
            </Link>
          ))}
        </Card>
      ) : null}

      <div className="st-kpi-grid" role="group" aria-label="Key figures">
        <KpiTile
          label="Deposits"
          value={fmtStaffMoney(d.depositedRange, fiat)}
          sub={`+${fmtStaffMoney(d.depositedToday, fiat)} today`}
          delta={depDelta?.text}
          deltaUp={depDelta?.up}
          href="/owner/finance/ledger"
        />
        <KpiTile
          label="Paid out"
          value={fmtStaffMoney(d.paidOutRange, fiat)}
          sub={`+${fmtStaffMoney(d.paidOutToday, fiat)} today`}
          delta={wdDelta?.text}
          deltaUp={wdDelta ? !wdDelta.up : undefined}
          href="/owner/finance/withdrawals"
        />
        <KpiTile
          label="Net"
          value={fmtStaffMoney(net, fiat)}
          sub="Deposits − approved payouts"
          delta={netDelta?.text}
          deltaUp={netDelta?.up}
          href="/owner/finance/pnl"
        />
        <KpiTile
          label="GGR"
          value={fmtStaffMoney(d.ggrRange, fiat)}
          sub="Stakes − payouts (cash)"
          delta={ggrDelta?.text}
          deltaUp={ggrDelta?.up}
          href="/owner/finance/pnl"
        />
        <KpiTile
          label="Commission owed"
          value={fmtStaffMoney(d.commissionRange, fiat)}
          sub={`${fmtStaffMoney(d.commissionToday, fiat)} today`}
          delta={commDelta?.text}
          deltaUp={commDelta ? !commDelta.up : undefined}
          href="/owner/payouts"
        />
        <KpiTile
          label="Active players"
          value={fmtStaffInt(d.activePlayersRange)}
          sub={`+${fmtStaffInt(d.usersToday)} joined today`}
          delta={activeDelta?.text}
          deltaUp={activeDelta?.up}
          href="/owner/people/players"
        />
        <KpiTile
          label="Pending actions"
          value={fmtStaffInt(pendingTotal)}
          sub={`${d.pending.withdrawalsPending} withdrawals · ${d.pending.payoutsDueAdmins} payouts due`}
          href="/owner/finance/withdrawals"
        />
      </div>

      <Card title="Pending queues" sub="One tap takes you to the queue.">
        <div>
          <Link href="/owner/finance/withdrawals" className="st-cardlist-row st-queue-row">
            <div className="st-cardlist-top">
              <span className="st-cardlist-title">Withdrawals waiting</span>
              <span className="st-cardlist-amount">
                {d.pending.withdrawalsPending}
                {d.pending.withdrawalsAwaitingOwner > 0 ? ` · ${d.pending.withdrawalsAwaitingOwner} need owner approval` : ""}
              </span>
            </div>
          </Link>
          <Link href="/owner/payouts" className="st-cardlist-row st-queue-row">
            <div className="st-cardlist-top">
              <span className="st-cardlist-title">Payouts due today</span>
              <span className="st-cardlist-amount">
                {d.pending.payoutsDueAdmins} admin{d.pending.payoutsDueAdmins === 1 ? "" : "s"} ·{" "}
                {fmtStaffMoney(d.pending.payoutsDueAmount, fiat)}
              </span>
            </div>
          </Link>
          <Link href="/owner/settings/kyc" className="st-cardlist-row st-queue-row">
            <div className="st-cardlist-top">
              <span className="st-cardlist-title">KYC submissions waiting</span>
              <span className="st-cardlist-amount">{d.pending.kycPending}</span>
            </div>
          </Link>
          <Link href="/owner/settings/support" className="st-cardlist-row st-queue-row">
            <div className="st-cardlist-top">
              <span className="st-cardlist-title">Open support tickets</span>
              <span className="st-cardlist-amount">{d.pending.ticketsOpen}</span>
            </div>
          </Link>
          {d.pending.fraudHigh + d.pending.fraudMedium + d.pending.anomaliesHigh + d.pending.anomaliesMedium > 0 ? (
            <Link href="/owner/reports/risk" className="st-cardlist-row st-queue-row">
              <div className="st-cardlist-top">
                <span className="st-cardlist-title">Risk signals open</span>
                <span className="st-cardlist-amount">
                  {d.pending.fraudHigh + d.pending.anomaliesHigh} high ·{" "}
                  {d.pending.fraudMedium + d.pending.anomaliesMedium} medium
                </span>
              </div>
            </Link>
          ) : null}
        </div>
      </Card>

      <Card title={`Financial performance · ${fiat}`} sub={d.finChart.grouping === "daily" ? "Daily" : d.finChart.grouping === "weekly" ? "Weekly" : "Monthly"}>
        {finEmpty ? (
          <p>No activity in this range.</p>
        ) : (
          <>
            <div className="st-chart-toggles" role="group" aria-label="Chart series">
              {FIN_SERIES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={finOn[s.id]}
                  className={`st-chart-toggle${finOn[s.id] ? " st-chart-toggle-on" : ""}`}
                  onClick={() => toggleFin(s.id)}
                >
                  <span className="st-chart-toggle-dot" style={{ background: FIN_COLORS[s.id] }} aria-hidden="true" />
                  {s.label}
                </button>
              ))}
            </div>
            {finSeries.length > 0 ? (
              <BarChart
                labels={d.finChart.buckets.map((b) => b.label)}
                series={finSeries}
                formatValue={(v) => fmtStaffMoney(v, fiat)}
              />
            ) : (
              <p>Turn a series on to see the chart.</p>
            )}
          </>
        )}
      </Card>

      <Card title="User growth" sub={`New registrations · ${fmtStaffInt(lastCumulative)} users total`}>
        {growthEmpty ? (
          <p>No new users in this range.</p>
        ) : (
          <BarChart
            labels={d.growthChart.buckets.map((b) => b.label)}
            series={[{ label: "New users", color: CHART_COLORS.green, values: d.growthChart.buckets.map((b) => b.newUsers) }]}
            formatValue={(v) => `+${fmtStaffInt(v)}`}
          />
        )}
      </Card>

      <Card title="Deposits — last 7 days">
        <BarChart
          labels={d.deposits7d.map((x) => x.date.slice(5))}
          series={[{ label: "Deposits", color: CHART_COLORS.gold, values: d.deposits7d.map((x) => x.total) }]}
          formatValue={(v) => fmtStaffMoney(v, fiat)}
        />
      </Card>

      <Card title="Recent activity">
        {d.activity.length === 0 ? (
          <p>No activity yet.</p>
        ) : (
          <div>
            {d.activity.map((a, i) => (
              <div key={`${a.kind}-${a.at}-${i}`} className="st-cardlist-row">
                <div className="st-cardlist-top">
                  <span className="st-cardlist-title">{a.name}</span>
                  {a.amount !== null ? <span className="st-cardlist-amount">{fmtStaffMoney(a.amount, fiat)}</span> : null}
                </div>
                <p className="st-cardlist-meta">
                  <span>
                    {ACT_VERB[a.kind] ?? a.kind}
                    {a.detail ? ` · ${a.detail}` : ""} · {relTime(a.at)}
                  </span>
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Top admins">
        {d.topAdmins.length === 0 ? (
          <p>No commission earned yet.</p>
        ) : (
          <div>
            {d.topAdmins.map((t, i) => (
              <Link key={t.adminId} href="/owner/payouts" className="st-cardlist-row st-queue-row">
                <div className="st-cardlist-top">
                  <span className="st-cardlist-title">
                    {i + 1}. {t.adminName}
                  </span>
                  <span className="st-cardlist-amount">{fmtStaffMoney(t.earned, fiat)}</span>
                </div>
                <p className="st-cardlist-meta">
                  <span>
                    {t.unpaid > 0
                      ? `Paid ${fmtStaffMoney(t.paid, fiat)} · ${fmtStaffMoney(t.unpaid, fiat)} owing`
                      : `Fully paid · ${fmtStaffMoney(t.paid, fiat)}`}
                  </span>
                </p>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
