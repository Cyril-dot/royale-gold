// Owner Withdrawals (Phase 3 restyle) — split out of the old one-page
// owner panel (src/app/owner/legacy/page.tsx). Same endpoints, same
// behaviour, staff-ui throughout: DataTable + CardList on phone, status
// chips, flagged-only filter, risk flags + KYC badges the list endpoint
// already returned (the Phase 2 split never displayed them), Approve /
// Reject through the shared ConfirmDialog (reject needs a reason), and
// the payout account behind the audited reveal endpoint.
"use client";

import { useMemo, useState, type ReactNode } from "react";
import { api } from "../../../../lib/api";
import { useStore } from "../../../../lib/store";
import { useOwner } from "../../../../components/owner/OwnerContext";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";
import { Card } from "../../../../components/staff-ui/Card";
import { Button } from "../../../../components/staff-ui/Button";
import { DataTable, type DataColumn, type DataRowAction } from "../../../../components/staff-ui/DataTable";
import { StatusPill, Badge } from "../../../../components/staff-ui/Badge";
import { ConfirmDialog } from "../../../../components/staff-ui/Dialog";
import { MaskedValue } from "../../../../components/staff-ui/MaskedValue";
import { Chip } from "../../../../components/staff-ui/Tabs";
import { fmtStaffMoney } from "../../../../components/staff-ui/format";
import { WITHDRAWAL_RISK_LABELS, type WithdrawalRiskFlag } from "../../../../lib/withdrawal-flags";
import { useOwnerFetch } from "../../../../components/owner/useOwnerFetch";

// P0 Batch 1 (O8): withdrawal oversight — every pending withdrawal
// platform-wide. Large ones an admin approved sit as "admin_approved"
// until the owner approves them second (maker-checker, GH₵ 500).
interface OwnerWdRow {
  id: string;
  userId: string;
  userName: string;
  userContact: string | null;
  adminId: string | null;
  adminName: string | null;
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

interface OwnerWdResponse {
  withdrawals: OwnerWdRow[];
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

function KycBadge({ w }: { w: OwnerWdRow }) {
  if (w.kycStatus === "approved") return <Badge variant="ok">KYC verified</Badge>;
  if (w.kycStatus === "pending") return <Badge variant="pending">KYC pending</Badge>;
  if (w.kycStatus === "rejected") return <Badge variant="rejected">KYC rejected</Badge>;
  if (w.kycRequired) return <Badge variant="warn">KYC required</Badge>;
  return <Badge variant="muted">No KYC</Badge>;
}

function FlagBadges({ w }: { w: OwnerWdRow }) {
  if (w.flags.length === 0) return <span>—</span>;
  return (
    <span>
      {w.flags.map((f) => (
        <Badge key={f} variant="warn">
          {WITHDRAWAL_RISK_LABELS[f]}
        </Badge>
      ))}
    </span>
  );
}

/** The payout account saved on the withdrawal — hidden until the owner
 *  taps Reveal, which calls the audited reveal endpoint once. The
 *  endpoint (not this component) writes the audit entry. */
function WithdrawalAccountReveal({ withdrawalId }: { withdrawalId: string }) {
  const [acct, setAcct] = useState<{ accountType: string | null; accountName: string | null; accountDetail: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const reveal = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ value: { accountType: string | null; accountName: string | null; accountDetail: string | null } }>(
        "/api/owner/reveal",
        { method: "POST", body: JSON.stringify({ kind: "withdrawal-account", id: withdrawalId }) },
      );
      setAcct(r.value);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Reveal failed.");
    } finally {
      setBusy(false);
    }
  };
  if (err) return <span role="alert">{err}</span>;
  if (!acct) {
    return (
      <Button variant="ghost" size="sm" loading={busy} onClick={() => void reveal()}>
        Reveal account
      </Button>
    );
  }
  if (!acct.accountType && !acct.accountName && !acct.accountDetail) {
    return <span>No account details saved on this withdrawal.</span>;
  }
  return (
    <span>
      {acct.accountType ? <span>{acct.accountType}</span> : null}
      {acct.accountName ? <span> · {acct.accountName}</span> : null}
      {acct.accountDetail ? (
        <span>
          {" · "}
          <MaskedValue value={acct.accountDetail} kind="account" label="Payout account" revealedValue={acct.accountDetail} onHide={() => setAcct(null)} />
        </span>
      ) : null}
    </span>
  );
}

export default function OwnerWithdrawalsPage() {
  const { user, toast } = useStore();
  const { fiat } = useOwner();
  const [status, setStatus] = useState("");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [confirm, setConfirm] = useState<{ w: OwnerWdRow; decision: "approve" | "reject" } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const url = useMemo(() => {
    if (!user) return null;
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (flaggedOnly) p.set("flagged", "1");
    p.set("currency", fiat);
    p.set("limit", "100");
    return `/api/owner/withdrawals?${p.toString()}`;
  }, [user, status, flaggedOnly, fiat]);
  const { data, err, loading, reload } = useOwnerFetch<OwnerWdResponse>(url);
  const rows = data?.withdrawals ?? [];
  const pending = data?.pending ?? 0;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);

  const decide = async (reason: string) => {
    if (!confirm) return;
    const { w, decision } = confirm;
    setBusyId(w.id);
    try {
      await api(`/api/owner/withdrawals/${w.id}/decide`, {
        method: "POST",
        body: JSON.stringify({ decision, ...(decision === "reject" ? { reason } : {}) }),
      });
      toast(decision === "approve" ? "Withdrawal approved" : "Withdrawal rejected", decision === "approve" ? "win" : "lose");
      setConfirm(null);
      reload();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Decision failed", "lose");
    } finally {
      setBusyId(null);
    }
  };

  const actionable = (w: OwnerWdRow) => w.status === "pending" || w.status === "admin_approved" || w.status === "held";
  const rowActions: DataRowAction<OwnerWdRow>[] = [
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

  const columns: DataColumn<OwnerWdRow>[] = [
    {
      key: "player",
      label: "Player",
      render: (w) => w.userName,
      sub: (w) => {
        const contact = w.userContact;
        if (!contact) return "—";
        return (
          <MaskedValue
            value={contact}
            kind={contact.includes("@") ? "email" : "phone"}
            label="Player contact"
            onReveal={async () => {
              const r = await api<{ value: { email: string | null; phone: string | null } }>("/api/owner/reveal", {
                method: "POST",
                body: JSON.stringify({ kind: "user-contact", id: w.userId }),
              });
              return contact.includes("@") ? r.value.email : r.value.phone;
            }}
          />
        );
      },
      // NOTE: DataTable's phone CardList only reads `details` from
      // columns AFTER the first — details on the first column never
      // render. Every detail below lives on its own column.
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
      sub: (w) => (w.adminName ? `via ${w.adminName}` : ""),
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
      render: (w) => <WithdrawalAccountReveal withdrawalId={w.id} />,
      details: (w) => [["Payout account", <WithdrawalAccountReveal key={`acct-${w.id}`} withdrawalId={w.id} />]],
    },
  ];

  return (
    <div>
      <PageHeader title="Withdrawals" sub="Every withdrawal request, platform-wide." />
      <OwnerRangeBar />
      <Card title={`Withdrawals${pending > 0 ? ` — ${pending} pending` : ""}`}>
        <div className="st-chip-row" role="group" aria-label="Flagged only">
          <Chip label="Flagged only" active={flaggedOnly} onClick={() => { setFlaggedOnly(!flaggedOnly); setPage(1); }} />
        </div>
        <DataTable<OwnerWdRow>
          viewId="owner-withdrawals"
          columns={columns}
          rows={pageRows}
          total={rows.length}
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
          expandable
          expandRender={(w) => (
            <div>
              {w.reason ? <p>Reason: {w.reason}</p> : null}
              {w.decidedAt ? <p>Decided {new Date(w.decidedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.</p> : null}
              {w.status === "admin_approved" ? <p>Admin approved — your approval makes it final.</p> : null}
              {w.status === "held" ? <p>Held by a risk rule — review before deciding.</p> : null}
            </div>
          )}
        />
      </Card>
      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={(reason) => void decide(reason)}
        title={confirm?.decision === "reject" ? "Reject withdrawal" : "Approve withdrawal"}
        body={
          confirm?.w.status === "admin_approved"
            ? "An admin already approved this — your approval makes it final."
            : confirm?.w.status === "held"
              ? "This withdrawal was held by a risk rule — review the flags before deciding."
              : undefined
        }
        facts={
          confirm
            ? [
                { label: "Player", value: confirm.w.userName },
                { label: "Amount", value: fmtStaffMoney(confirm.w.amount, confirm.w.fiatCurrency ?? fiat) },
                { label: "Method", value: confirm.w.method },
                { label: "Status", value: statusLabel(confirm.w.status) },
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
