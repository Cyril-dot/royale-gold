// Admin dashboard — Money, Withdrawals queue (Phase 5 restyle). The
// guided flow: every row carries the KYC badge, the risk flags and the
// destination account behind the audited reveal; the expanded row shows
// previous withdrawals from the same player and the next item in the
// queue. Approve / Reject go through the shared ConfirmDialog (reject
// needs a reason; approve cannot record one — the endpoint ignores it,
// so none is asked). Withdrawals are REQUESTS only — no real money
// moves. "Approved" stays the derived status it is today (no status
// column — Chuks's decision still pending). Same endpoints as before.
"use client";

import { Suspense, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "../../../../lib/api";
import { useStore } from "../../../../lib/store";
import { useFiat } from "../../../../lib/use-fiat";
import { useStaffFetch } from "../../../../components/staff-ui/useStaffFetch";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";
import { Card } from "../../../../components/staff-ui/Card";
import { DataTable, type DataColumn, type DataRowAction } from "../../../../components/staff-ui/DataTable";
import { StatusPill, Badge } from "../../../../components/staff-ui/Badge";
import { ConfirmDialog } from "../../../../components/staff-ui/Dialog";
import { Button } from "../../../../components/staff-ui/Button";
import { Chip } from "../../../../components/staff-ui/Tabs";
import { Skeleton, ErrorState } from "../../../../components/staff-ui/Feedback";
import { fmtStaffMoney } from "../../../../components/staff-ui/format";
import { AdminContactValue, AdminWithdrawalAccountReveal } from "../../../../components/admin/AdminReveal";
import CurrencyChips from "../../../../components/CurrencyChips";
import { canAccessSection } from "../../../../lib/rbac";
import { WITHDRAWAL_RISK_LABELS, type WithdrawalRiskFlag } from "../../../../lib/withdrawal-flags";

interface WithdrawalRow {
  id: string;
  userId: string;
  userName: string;
  userContact: string | null;
  amount: number;
  method: string;
  fiatCurrency: string;
  status: string;
  reason: string | null;
  decidedBy: string | null;
  createdAt: string;
  decidedAt: string | null;
  flags: WithdrawalRiskFlag[];
  kycStatus: string;
  kycRequired: boolean;
}

interface WithdrawalsResponse {
  withdrawals: WithdrawalRow[];
  pending: number;
  currency: string;
}

const STATUS_FILTERS = [
  { id: "", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "held", label: "Held" },
  { id: "admin_approved", label: "Awaiting owner" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

function statusLabel(status: string): string {
  if (status === "admin_approved") return "Awaiting owner";
  return status[0].toUpperCase() + status.slice(1);
}

function KycBadge({ w }: { w: WithdrawalRow }) {
  if (w.kycStatus === "approved") return <Badge variant="ok">KYC verified</Badge>;
  if (w.kycStatus === "pending") return <Badge variant="pending">KYC pending</Badge>;
  if (w.kycStatus === "rejected") return <Badge variant="rejected">KYC rejected</Badge>;
  if (w.kycRequired) return <Badge variant="warn">KYC required</Badge>;
  return <Badge variant="muted">No KYC</Badge>;
}

function FlagBadges({ w }: { w: WithdrawalRow }) {
  if (w.flags.length === 0) return <span>—</span>;
  return (
    <span>
      {w.flags.map((f) => (
        <Badge key={f} variant="warn">
          {WITHDRAWAL_RISK_LABELS[f] ?? f}
        </Badge>
      ))}
    </span>
  );
}

export default function AdminMoneyWithdrawalsPage() {
  return (
    <Suspense fallback={<Skeleton lines={6} title />}>
      <AdminMoneyWithdrawalsInner />
    </Suspense>
  );
}

function AdminMoneyWithdrawalsInner() {
  const { user, toast } = useStore();
  const sp = useSearchParams();
  const previewId = sp.get("preview");
  const [fiatSel, setFiatSel] = useState<string | null>(null);
  const fiat = fiatSel ?? user?.currency ?? "GHS";
  const { cfg: fiatCfg } = useFiat(fiat);
  const [status, setStatus] = useState("");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [advanceNext, setAdvanceNext] = useState(false);
  const [decidedId, setDecidedId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ w: WithdrawalRow; decision: "approve" | "reject" } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const url = useMemo(() => {
    if (!user) return null;
    // Load the latest 100 unfiltered and filter client-side: the
    // expanded row shows previous withdrawals from the same player,
    // which a status-filtered fetch would not return.
    const base = previewId ? `/api/owner/withdrawals?adminId=${previewId}` : "/api/admin/withdrawals";
    return `${base}${base.includes("?") ? "&" : "?"}currency=${encodeURIComponent(fiat)}&limit=100`;
  }, [user, previewId, fiat]);
  const { data, err, loading, reload } = useStaffFetch<WithdrawalsResponse>(url);
  const rows = data?.withdrawals ?? [];
  const pending = data?.pending ?? 0;

  const actionable = (w: WithdrawalRow) => w.status === "pending" || w.status === "held";
  const filtered = rows.filter((w) => {
    if (status && w.status !== status) return false;
    if (flaggedOnly && w.flags.length === 0) return false;
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const actionableRows = filtered.filter(actionable);

  // After a decision, advance to the next actionable row in the queue
  // (render-phase adjustment — the supported pattern, one shot). The
  // just-decided row is skipped by id: the list is stale until the
  // reload lands, and it would otherwise re-expand the row just
  // decided.
  if (advanceNext && data) {
    const next = actionableRows.find((x) => x.id !== decidedId) ?? null;
    setAdvanceNext(false);
    setDecidedId(null);
    setExpandedId(next ? next.id : null);
  }

  const decide = async (reason: string) => {
    if (!confirm) return;
    const { w, decision } = confirm;
    setBusyId(w.id);
    try {
      const r = await api<{ note?: string }>(`/api/admin/withdrawals/${w.id}/decide`, {
        method: "POST",
        body: JSON.stringify({ decision, ...(decision === "reject" ? { reason } : {}) }),
      });
      toast(
        decision === "approve" ? "Withdrawal approved" : "Withdrawal rejected",
        decision === "approve" ? "win" : "lose",
      );
      if (r.note) toast(r.note, "info");
      setConfirm(null);
      setDecidedId(w.id);
      setAdvanceNext(true);
      reload();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Decision failed", "lose");
    } finally {
      setBusyId(null);
    }
  };

  const nextInQueue = (w: WithdrawalRow) => {
    const idx = actionableRows.findIndex((x) => x.id === w.id);
    const next = idx >= 0 ? actionableRows[idx + 1] : actionableRows[0];
    if (next) setExpandedId(next.id);
  };

  const rowActions: DataRowAction<WithdrawalRow>[] = previewId
    ? []
    : [
        {
          label: "Approve",
          onClick: (w) => setConfirm({ w, decision: "approve" }),
          disabled: (w) => !actionable(w) || busyId === w.id,
        },
        {
          label: "Reject",
          danger: true,
          onClick: (w) => setConfirm({ w, decision: "reject" }),
          disabled: (w) => !actionable(w) || busyId === w.id,
        },
      ];

  const columns: DataColumn<WithdrawalRow>[] = [
    {
      key: "player",
      label: "Player",
      render: (w) => w.userName,
      sub: (w) => <AdminContactValue userId={w.userId} contact={w.userContact} preview={!!previewId} />,
    },
    {
      key: "amount",
      label: "Amount",
      render: (w) => fmtStaffMoney(w.amount, w.fiatCurrency ?? fiat),
    },
    {
      key: "method",
      label: "Method",
      render: (w) => w.method,
      details: (w) => [["Method", w.method]],
    },
    {
      key: "status",
      label: "Status",
      render: (w) => <StatusPill status={statusLabel(w.status)} />,
      details: (w) => [["Status", statusLabel(w.status)]],
    },
    {
      key: "kyc",
      label: "KYC",
      render: (w) => <KycBadge w={w} />,
      details: (w) => [["KYC", <KycBadge key="kyc" w={w} />]],
    },
    {
      key: "flags",
      label: "Flags",
      render: (w) => <FlagBadges w={w} />,
      details: (w) => [["Flags", <FlagBadges key="flags" w={w} />]],
    },
    {
      key: "date",
      label: "Date",
      render: (w) =>
        new Date(w.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
      details: (w) => {
        const out: [string, ReactNode][] = [
          ["Date", new Date(w.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })],
        ];
        if (w.reason) out.push(["Reason", w.reason]);
        return out;
      },
    },
    {
      key: "account",
      label: "Payout account",
      render: (w) => <AdminWithdrawalAccountReveal withdrawalId={w.id} preview={!!previewId} />,
      details: (w) => [["Payout account", <AdminWithdrawalAccountReveal key={`acct-${w.id}`} withdrawalId={w.id} preview={!!previewId} />]],
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

  return (
    <div>
      <PageHeader
        title="Withdrawals"
        sub="Requests only — no real money moves. Nothing pays out without an admin action."
        backHref={previewId ? `/admin?preview=${previewId}` : "/admin"}
        backLabel="Overview"
      />
      <CurrencyChips value={fiat} onChange={setFiatSel} label="Money currency" />
      <p>
        Over {fmtStaffMoney(fiatCfg?.withdrawalOwnerThreshold ?? 500, fiat)} also needs the owner&apos;s approval.
        {pending > 0 ? ` ${pending} pending.` : ""}
      </p>
      <Card title={`Withdrawals${pending > 0 ? ` — ${pending} pending` : ""}`}>
        <div className="st-chip-row" role="group" aria-label="Flagged only">
          <Chip label="Flagged only" active={flaggedOnly} onClick={() => { setFlaggedOnly(!flaggedOnly); setPage(1); }} />
        </div>
        <DataTable<WithdrawalRow>
          viewId="admin-withdrawals"
          columns={columns}
          rows={pageRows}
          total={filtered.length}
          page={safePage}
          pageSize={pageSize}
          onPageChange={(p) => setPage(p)}
          filters={STATUS_FILTERS}
          activeFilter={status}
          onFilterChange={(id) => { setStatus(id); setPage(1); }}
          loading={loading}
          error={err}
          onRetry={reload}
          emptyTitle="No withdrawal requests."
          emptyText="No rows match the current filters."
          rowActions={rowActions}
          rowHref={(w) => (previewId ? `/admin/players/${w.userId}?preview=${previewId}` : `/admin/players/${w.userId}`)}
          expandable
          expandedId={expandedId}
          onExpandedChange={setExpandedId}
          expandRender={(w) => {
            const previous = rows.filter((x) => x.userId === w.userId && x.id !== w.id).slice(0, 3);
            const hasNext = actionableRows.some((x) => x.id !== w.id);
            return (
              <div>
                {w.reason ? <p>Reason: {w.reason}</p> : null}
                {w.decidedAt ? <p>Decided {new Date(w.decidedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.</p> : null}
                {w.status === "admin_approved" ? <p>Approved by admin — waiting on the owner.</p> : null}
                {w.status === "held" ? <p>Held by a risk rule — review the flags before deciding.</p> : null}
                {w.kycRequired ? (
                  <p>KYC required — this player&apos;s KYC is {w.kycStatus === "not_submitted" ? "not submitted" : w.kycStatus}.</p>
                ) : null}
                {previous.length > 0 ? (
                  <>
                    <p>Previous withdrawals from this player:</p>
                    <ul>
                      {previous.map((p) => (
                        <li key={p.id}>
                          {fmtStaffMoney(p.amount, p.fiatCurrency ?? fiat)} · {statusLabel(p.status)} ·{" "}
                          {new Date(p.createdAt).toLocaleDateString("en-GB")}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p>No previous withdrawals from this player.</p>
                )}
                {actionable(w) && hasNext ? (
                  <div className="st-btn-row" style={{ marginTop: 12 }}>
                    <Button variant="secondary" size="sm" onClick={() => nextInQueue(w)}>
                      Next in queue
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          }}
        />
      </Card>
      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={(reason) => void decide(reason)}
        title={confirm?.decision === "reject" ? "Reject withdrawal" : "Approve withdrawal"}
        body={
          confirm?.w.status === "held"
            ? "This withdrawal was held by a risk rule — review the flags before deciding."
            : confirm && confirm.w.amount >= (fiatCfg?.withdrawalOwnerThreshold ?? 500)
              ? "Over the owner-approval threshold — your approval sends it to the owner, it does not finish it."
              : undefined
        }
        facts={
          confirm
            ? [
                { label: "Player", value: confirm.w.userName },
                { label: "Amount", value: fmtStaffMoney(confirm.w.amount, confirm.w.fiatCurrency ?? fiat) },
                { label: "Method", value: confirm.w.method },
                { label: "Status", value: statusLabel(confirm.w.status) },
                { label: "KYC", value: confirm.w.kycStatus === "approved" ? "Verified" : confirm.w.kycStatus },
              ]
            : []
        }
        reasonRequired={confirm?.decision === "reject"}
        reasonLabel="Reason for rejection (required)"
        confirmLabel={confirm?.decision === "reject" ? "Reject" : "Approve"}
        danger={confirm?.decision === "reject"}
        busy={busyId !== null}
      />
    </div>
  );
}
