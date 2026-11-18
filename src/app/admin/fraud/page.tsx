// Admin dashboard — Fraud alerts (Phase 5 restyle). REAL signals
// computed live from the tables (see src/lib/fraud.ts) — no stored
// alert rows, so every alert can be checked against the DB from its
// reason. READ-ONLY: there is no acknowledge / assign / resolve —
// nothing is stored, so there is nothing to mark. Failed-login
// monitoring is NOT here: the login route writes no audit row on a
// failed attempt, so there is no real data to count from, and no
// login-attempt log is invented — the page says so plainly.
"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useStore } from "../../../lib/store";
import { useStaffFetch } from "../../../components/staff-ui/useStaffFetch";
import { PageHeader } from "../../../components/staff-ui/PageHeader";
import { Card, KpiTile } from "../../../components/staff-ui/Card";
import { DataTable, type DataColumn } from "../../../components/staff-ui/DataTable";
import { StatusPill } from "../../../components/staff-ui/Badge";
import { Button } from "../../../components/staff-ui/Button";
import { Skeleton, ErrorState } from "../../../components/staff-ui/Feedback";
import { AdminContactValue } from "../../../components/admin/AdminReveal";
import { canAccessSection } from "../../../lib/rbac";

interface FraudAlert {
  id: string;
  severity: "high" | "medium";
  signal: string;
  userId: string;
  userName: string;
  userContact: string | null;
  reason: string;
  createdAt: string;
}

interface FraudResponse {
  alerts: FraudAlert[];
  counts: { high: number; medium: number };
}

const SIGNAL_LABELS: Record<string, string> = {
  "withdrawal-flags": "Withdrawal flags",
  "rapid-withdrawals": "Rapid withdrawals",
  "deposit-no-play": "Deposit, no play",
  "deposit-then-withdraw": "Deposit then withdraw",
};

const SEVERITY_FILTERS = [
  { id: "", label: "All" },
  { id: "high", label: "High" },
  { id: "medium", label: "Medium" },
];

export default function AdminFraudPage() {
  return (
    <Suspense fallback={<Skeleton lines={6} title />}>
      <AdminFraudInner />
    </Suspense>
  );
}

function AdminFraudInner() {
  const { user } = useStore();
  const sp = useSearchParams();
  const previewId = sp.get("preview");
  const [severity, setSeverity] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const url = useMemo(() => {
    if (!user) return null;
    return previewId ? `/api/owner/fraud?adminId=${previewId}` : "/api/admin/fraud";
  }, [user, previewId]);
  const { data, err, loading, reload } = useStaffFetch<FraudResponse>(url);
  const rows = data?.alerts ?? [];
  const counts = data?.counts ?? { high: 0, medium: 0 };
  const filtered = severity ? rows.filter((a) => a.severity === severity) : rows;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const columns: DataColumn<FraudAlert>[] = [
    {
      key: "signal",
      label: "Signal",
      render: (a) => SIGNAL_LABELS[a.signal] ?? a.signal,
      details: (a) => [["Signal", SIGNAL_LABELS[a.signal] ?? a.signal]],
    },
    {
      key: "player",
      label: "Player",
      render: (a) => a.userName,
      sub: (a) => <AdminContactValue userId={a.userId} contact={a.userContact} preview={!!previewId} />,
    },
    {
      key: "reason",
      label: "Reason",
      render: (a) => a.reason,
    },
    {
      key: "severity",
      label: "Severity",
      render: (a) => <StatusPill status={a.severity === "high" ? "High" : "Medium"} />,
      details: (a) => [["Severity", a.severity === "high" ? "High" : "Medium"]],
    },
    {
      key: "date",
      label: "Raised",
      render: (a) =>
        new Date(a.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
      details: (a) => [
        ["Raised", new Date(a.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })],
      ],
    },
  ];

  if (!user) return null;
  if (!previewId && !canAccessSection(user, "fraud")) {
    return (
      <ErrorState
        title="No access to this section."
        text="You do not have access to the Fraud section. Ask the owner to grant you access from the Owner panel."
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Fraud alerts"
        sub="Computed live from the tables every time you open this page — no alerts are stored, so there is nothing to acknowledge or resolve."
        backHref={previewId ? `/admin?preview=${previewId}` : "/admin"}
        backLabel="Overview"
      />
      <div className="st-kpi-grid">
        <KpiTile label="High severity" value={String(counts.high)} />
        <KpiTile label="Medium severity" value={String(counts.medium)} />
        <KpiTile label="Total alerts" value={String(counts.high + counts.medium)} />
      </div>
      <Card title="Alerts">
        <div className="st-btn-row" style={{ marginBottom: 12 }}>
          <Button variant="secondary" size="sm" onClick={reload}>
            Refresh
          </Button>
        </div>
        <DataTable<FraudAlert>
          viewId="admin-fraud"
          columns={columns}
          rows={pageRows}
          total={filtered.length}
          page={safePage}
          pageSize={pageSize}
          onPageChange={(p) => setPage(p)}
          filters={SEVERITY_FILTERS}
          activeFilter={severity}
          onFilterChange={(id) => {
            setSeverity(id);
            setPage(1);
          }}
          loading={loading}
          error={err}
          onRetry={reload}
          emptyTitle="No fraud alerts."
          emptyText="No signals fired for your players right now."
          rowHref={(a) => (previewId ? `/admin/players/${a.userId}?preview=${previewId}` : `/admin/players/${a.userId}`)}
        />
      </Card>
      <p>
        Failed-login monitoring is not available: the login route writes no audit row on a failed attempt, so there is no real
        data to count from.
      </p>
    </div>
  );
}
