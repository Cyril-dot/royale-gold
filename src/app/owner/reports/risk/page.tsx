// Owner Risk (Phase 4 restyle) — split out of the old one-page owner panel
// (deleted in Phase 4). Same endpoints, same behaviour, now
// its own route, loading only its own data. Staff-ui throughout: KPI
// tiles, DataTable + CardList on phone for the alert lists and the
// per-admin rollup, severity filter chips, masked player contacts with
// the audited reveal, and player links. Fraud alerts and anomalies are
// computed live and never stored — there is NO triage state, so no
// acknowledge / assign / resolve actions exist here.
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { api } from "../../../../lib/api";
import { useStore } from "../../../../lib/store";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";
import { Card, KpiTile } from "../../../../components/staff-ui/Card";
import { Button } from "../../../../components/staff-ui/Button";
import { DataTable, type DataColumn } from "../../../../components/staff-ui/DataTable";
import { Badge } from "../../../../components/staff-ui/Badge";
import { MaskedValue } from "../../../../components/staff-ui/MaskedValue";
import { Skeleton, ErrorState } from "../../../../components/staff-ui/Feedback";
import { fmtStaffInt } from "../../../../components/staff-ui/format";
import { useOwnerFetch } from "../../../../components/owner/useOwnerFetch";

// P1 Batch 3 (O18): the global fraud console — same signals as the
// admin fraud pages, over every player, with per-admin rollups.
interface OwnerFraudAlert {
  id: string;
  severity: string;
  signal: string;
  userId: string;
  userName: string;
  userContact: string | null;
  reason: string;
  createdAt: string;
}
interface OwnerFraudRollup {
  adminId: string | null;
  adminName: string;
  high: number;
  medium: number;
  total: number;
}
interface OwnerFraudData {
  alerts: OwnerFraudAlert[];
  counts: { high: number; medium: number };
  byAdmin: OwnerFraudRollup[];
}

// O32: anomaly alerts — rule-based, computed live from the real
// tables. No stored rows, no ML model, no AI — just thresholds.
interface AnomalyRow {
  id: string;
  type: string;
  severity: string;
  userId: string | null;
  userName: string | null;
  game: string | null;
  gameName: string | null;
  reason: string;
  createdAt: string;
}
interface AnomalyData {
  anomalies: AnomalyRow[];
  counts: { high: number; medium: number };
}

// P1 Batch 3 (O18): the same signal labels as the admin fraud page.
const FRAUD_SIGNAL_LABELS: Record<string, string> = {
  "withdrawal-flags": "Flagged withdrawal",
  "rapid-withdrawals": "Rapid withdrawals",
  "deposit-no-play": "Deposit, no play",
  "deposit-then-withdraw": "Deposit then withdraw",
};

const ANOMALY_TYPE_LABELS: Record<string, string> = {
  "win-rate": "Win rate",
  "stake-jump": "Stake jump",
  "rtp-spike": "RTP spike",
  "deposit-then-withdraw": "Deposit then withdraw",
};

const SEVERITY_FILTERS = [
  { id: "", label: "All severities" },
  { id: "high", label: "High" },
  { id: "medium", label: "Medium" },
];

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SeverityBadge({ severity }: { severity: string }) {
  if (severity === "high") return <Badge variant="danger">High</Badge>;
  return <Badge variant="warn">Medium</Badge>;
}

/** A player's masked contact, with the audited reveal (user-contact
 *  kind, same as the withdrawals queue). The endpoint — not this page —
 *  writes the audit entry. */
function PlayerContact({ userId, contact }: { userId: string; contact: string | null }) {
  if (!contact) return <span>—</span>;
  return (
    <MaskedValue
      value={contact}
      kind={contact.includes("@") ? "email" : "phone"}
      label="Player contact"
      onReveal={async () => {
        const r = await api<{ value: { email: string | null; phone: string | null } }>("/api/owner/reveal", {
          method: "POST",
          body: JSON.stringify({ kind: "user-contact", id: userId }),
        });
        return contact.includes("@") ? r.value.email : r.value.phone;
      }}
    />
  );
}

/** Client-side pagination for one alert list — the caller owns rows and
 *  filters; this owns the page. */
function PagedTable<T extends { id: string }>({
  viewId,
  columns,
  rows,
  emptyTitle,
  emptyText,
  filters,
  activeFilter,
  onFilterChange,
}: {
  viewId: string;
  columns: DataColumn<T>[];
  rows: T[];
  emptyTitle: string;
  emptyText: string;
  filters?: { id: string; label: string }[];
  activeFilter?: string;
  onFilterChange?: (id: string) => void;
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
      filters={filters}
      activeFilter={activeFilter}
      onFilterChange={onFilterChange}
      emptyTitle={emptyTitle}
      emptyText={emptyText}
    />
  );
}

export default function OwnerRiskPage() {
  const { user } = useStore();
  const [fraudSev, setFraudSev] = useState("");

  const fraudUrl = useMemo(() => (user ? "/api/owner/fraud" : null), [user]);
  const { data: ownerFraud, err: fraudErr, loading: fraudLoading, reload: reloadFraud } =
    useOwnerFetch<OwnerFraudData>(fraudUrl);
  const anomalyUrl = useMemo(() => (user ? "/api/owner/anomalies" : null), [user]);
  const { data: anomalies, err: anomalyErr, loading: anomalyLoading, reload: reloadAnomalies } =
    useOwnerFetch<AnomalyData>(anomalyUrl);

  const fraudAlerts = useMemo(() => {
    const all = ownerFraud?.alerts ?? [];
    if (!fraudSev) return all;
    return all.filter((a) => a.severity === fraudSev);
  }, [ownerFraud, fraudSev]);

  const fraudColumns: DataColumn<OwnerFraudAlert>[] = [
    {
      key: "signal",
      label: "Signal",
      render: (a) => FRAUD_SIGNAL_LABELS[a.signal] ?? a.signal,
      sub: (a) => fmtTime(a.createdAt),
      // NOTE: DataTable's phone CardList only reads `details` from
      // columns AFTER the first — details on the first column never
      // render. Every detail below lives on its own column.
    },
    {
      key: "severity",
      label: "Severity",
      render: (a) => <SeverityBadge severity={a.severity} />,
      details: (a) => [["Severity", <SeverityBadge key="sev" severity={a.severity} />]],
    },
    {
      key: "player",
      label: "Player",
      render: (a) => <Link href={`/admin/players/${a.userId}`}>{a.userName}</Link>,
      sub: (a) => <PlayerContact userId={a.userId} contact={a.userContact} />,
      details: (a) => [
        ["Player", <Link key="p" href={`/admin/players/${a.userId}`}>{a.userName}</Link>],
        ["Contact", <PlayerContact key="c" userId={a.userId} contact={a.userContact} />],
      ],
    },
    {
      key: "evidence",
      label: "Evidence",
      render: (a) => a.reason,
      details: (a) => [["Evidence", a.reason]],
    },
    {
      key: "time",
      label: "Time",
      render: (a) => fmtTime(a.createdAt),
      details: (a) => [["Time", fmtTime(a.createdAt)]],
    },
  ];
  const rollupColumns: DataColumn<OwnerFraudRollup & { id: string }>[] = [
    { key: "admin", label: "Admin", render: (r) => r.adminName },
    {
      key: "high",
      label: "High",
      render: (r) => fmtStaffInt(r.high),
      details: (r) => [["High", fmtStaffInt(r.high)]],
    },
    {
      key: "medium",
      label: "Medium",
      render: (r) => fmtStaffInt(r.medium),
      details: (r) => [["Medium", fmtStaffInt(r.medium)]],
    },
    { key: "total", label: "Total", render: (r) => fmtStaffInt(r.total) },
  ];
  const anomalyColumns: DataColumn<AnomalyRow>[] = [
    {
      key: "type",
      label: "Type",
      render: (a) => ANOMALY_TYPE_LABELS[a.type] ?? a.type,
      sub: (a) => fmtTime(a.createdAt),
    },
    {
      key: "severity",
      label: "Severity",
      render: (a) => <SeverityBadge severity={a.severity} />,
      details: (a) => [["Severity", <SeverityBadge key="sev" severity={a.severity} />]],
    },
    {
      key: "subject",
      label: "Subject",
      render: (a) =>
        a.userId ? (
          <Link href={`/admin/players/${a.userId}`}>{a.userName}</Link>
        ) : (
          (a.gameName ?? a.game ?? "—")
        ),
      sub: (a) =>
        a.userId ? (
          "Player"
        ) : (
          <span>
            Game — see the <Link href="/owner/games/rtp">RTP monitor</Link>
          </span>
        ),
      details: (a) => [
        [
          "Subject",
          a.userId ? (
            <Link key="p" href={`/admin/players/${a.userId}`}>{a.userName}</Link>
          ) : (
            (a.gameName ?? a.game ?? "—")
          ),
        ],
      ],
    },
    {
      key: "evidence",
      label: "Evidence",
      render: (a) => a.reason,
      details: (a) => [["Evidence", a.reason]],
    },
    {
      key: "time",
      label: "Time",
      render: (a) => fmtTime(a.createdAt),
      details: (a) => [["Time", fmtTime(a.createdAt)]],
    },
  ];

  return (
    <div>
      <PageHeader title="Risk" sub="Fraud console and anomaly alerts." />
      <OwnerRangeBar />
      <Card
        title="Fraud console"
        sub="Computed live from the real tables — never stored, so there is nothing to acknowledge or resolve. Failed logins is not built: there is no login-attempt data, so that signal cannot fire."
      >
        {fraudLoading ? (
          <Skeleton lines={5} />
        ) : fraudErr ? (
          <ErrorState text={fraudErr} onRetry={reloadFraud} />
        ) : ownerFraud ? (
          <>
            <div>
              <KpiTile label="High" value={fmtStaffInt(ownerFraud.counts.high)} />
              <KpiTile label="Medium" value={fmtStaffInt(ownerFraud.counts.medium)} />
              <KpiTile label="Total" value={fmtStaffInt(ownerFraud.alerts.length)} />
            </div>
            <Button variant="ghost" onClick={() => void reloadFraud()}>
              Refresh alerts
            </Button>
            <h4>By admin</h4>
            <PagedTable
              viewId="owner-fraud-by-admin"
              columns={rollupColumns}
              rows={ownerFraud.byAdmin.map((r) => ({ ...r, id: r.adminId ?? "none" }))}
              emptyTitle="No fraud signals by admin."
              emptyText="No rollup rows."
            />
            <h4>Alerts</h4>
            <PagedTable
              viewId="owner-fraud-alerts"
              columns={fraudColumns}
              rows={fraudAlerts}
              emptyTitle="No fraud signals platform-wide right now."
              emptyText="No alerts match the current filter."
              filters={SEVERITY_FILTERS}
              activeFilter={fraudSev}
              onFilterChange={(id) => setFraudSev(id)}
            />
          </>
        ) : null}
      </Card>

      <Card title="Anomaly alerts" sub="Rule-based, computed live — no stored rows, no model.">
        {anomalyLoading ? (
          <Skeleton lines={5} />
        ) : anomalyErr ? (
          <ErrorState text={anomalyErr} onRetry={reloadAnomalies} />
        ) : anomalies ? (
          <>
            <div>
              <KpiTile label="High" value={fmtStaffInt(anomalies.counts.high)} />
              <KpiTile label="Medium" value={fmtStaffInt(anomalies.counts.medium)} />
            </div>
            <Button variant="ghost" size="sm" onClick={() => void reloadAnomalies()}>
              Refresh anomalies
            </Button>
            <PagedTable
              viewId="owner-anomalies"
              columns={anomalyColumns}
              rows={anomalies.anomalies}
              emptyTitle="No anomalies right now."
              emptyText="No anomalies right now."
            />
          </>
        ) : null}
      </Card>
    </div>
  );
}
