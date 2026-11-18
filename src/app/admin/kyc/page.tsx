// Admin dashboard — KYC review (Phase 5 restyle). Queue on the shared
// DataTable + a side-by-side review panel: the document in-page where
// the host allows it (always with a plain "Open document" link), the
// masked contact behind the audited reveal, and the decision panel.
// Approve / Reject go through the shared ConfirmDialog (reject needs a
// reason of at least 3 characters — the endpoint enforces it; approve
// cannot record one). Keyboard: j/k moves the selection, a/r opens the
// decision — ignored while typing in a field. KYC is verification only
// — it never blocks deposits or play.
"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "../../../lib/api";
import { useStore } from "../../../lib/store";
import { useStaffFetch } from "../../../components/staff-ui/useStaffFetch";
import { PageHeader } from "../../../components/staff-ui/PageHeader";
import { Card } from "../../../components/staff-ui/Card";
import { DataTable, type DataColumn } from "../../../components/staff-ui/DataTable";
import { StatusPill, Badge } from "../../../components/staff-ui/Badge";
import { ConfirmDialog } from "../../../components/staff-ui/Dialog";
import { Button } from "../../../components/staff-ui/Button";
import { Skeleton, EmptyState, ErrorState } from "../../../components/staff-ui/Feedback";
import { AdminContactValue } from "../../../components/admin/AdminReveal";
import { KycDocumentViewer } from "../../../components/admin/KycDocumentViewer";
import { canAccessSection } from "../../../lib/rbac";

interface KycSubmission {
  id: string;
  userId: string;
  userName: string;
  userContact: string | null;
  documentType: string;
  documentTypeLabel: string;
  documentUrl: string;
  status: string;
  autoApproved: boolean;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  submittedAt: string;
}

interface KycResponse {
  submissions: KycSubmission[];
  counts: { pending: number; approved: number; rejected: number };
}

const STATUS_FILTERS = [
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "all", label: "All" },
];

export default function AdminKycPage() {
  return (
    <Suspense fallback={<Skeleton lines={6} title />}>
      <AdminKycInner />
    </Suspense>
  );
}

function AdminKycInner() {
  const { user, toast } = useStore();
  const sp = useSearchParams();
  const previewId = sp.get("preview");
  const [status, setStatus] = useState("pending");
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ s: KycSubmission; decision: "approved" | "rejected" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [advanceAfter, setAdvanceAfter] = useState(false);
  const [decidedId, setDecidedId] = useState<string | null>(null);

  const url = useMemo(() => {
    if (!user) return null;
    const base = previewId ? `/api/owner/kyc?adminId=${previewId}` : "/api/admin/kyc";
    return `${base}${base.includes("?") ? "&" : "?"}status=${status}&limit=100`;
  }, [user, previewId, status]);
  const { data, err, loading, reload } = useStaffFetch<KycResponse>(url);
  const rows = data?.submissions ?? [];
  const counts = data?.counts ?? { pending: 0, approved: 0, rejected: 0 };
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const selected = rows.find((s) => s.id === selectedId) ?? pageRows[0] ?? null;
  const pendingRows = rows.filter((s) => s.status === "pending");

  // Auto-select the first row when the list loads, and after a decision
  // advance to the next pending submission (render-phase adjustment —
  // the supported pattern, one shot). The just-decided row is skipped
  // by id: the list is stale until the reload lands, and it would
  // otherwise re-select the row just decided.
  if (selectedId === null && pageRows.length > 0) setSelectedId(pageRows[0].id);
  if (advanceAfter && data) {
    setAdvanceAfter(false);
    const next = pendingRows.find((s) => s.id !== decidedId) ?? null;
    setDecidedId(null);
    setSelectedId(next ? next.id : null);
    if (next && status !== "pending") setStatus("pending");
  }

  const decide = async (reason: string) => {
    if (!confirm) return;
    const { s, decision } = confirm;
    setBusy(true);
    try {
      await api(`/api/admin/kyc/${s.id}/decide`, {
        method: "POST",
        body: JSON.stringify({ decision, ...(decision === "rejected" ? { reason } : {}) }),
      });
      toast(decision === "approved" ? "KYC approved" : "KYC rejected", decision === "approved" ? "win" : "lose");
      setConfirm(null);
      setDecidedId(s.id);
      setAdvanceAfter(true);
      reload();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Decision failed", "lose");
    } finally {
      setBusy(false);
    }
  };

  // Keyboard shortcuts: j/k move the selection, a/r open the decision.
  // Ignored while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (!selected) return;
      if (e.key === "j" || e.key === "k") {
        const idx = pendingRows.findIndex((s) => s.id === selected.id);
        const next = e.key === "j" ? pendingRows[idx + 1] : pendingRows[idx - 1];
        if (next) setSelectedId(next.id);
      }
      if (selected.status === "pending" && !previewId) {
        if (e.key === "a") setConfirm({ s: selected, decision: "approved" });
        if (e.key === "r") setConfirm({ s: selected, decision: "rejected" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, pendingRows, previewId]);

  const columns: DataColumn<KycSubmission>[] = [
    {
      key: "player",
      label: "Player",
      render: (s) => s.userName,
      sub: (s) => <AdminContactValue userId={s.userId} contact={s.userContact} preview={!!previewId} />,
    },
    {
      key: "document",
      label: "Document",
      render: (s) => s.documentTypeLabel,
      details: (s) => [["Document", s.documentTypeLabel]],
    },
    {
      key: "status",
      label: "Status",
      render: (s) => <StatusPill status={s.status === "approved" ? "Approved" : s.status === "rejected" ? "Rejected" : "Pending"} />,
      details: (s) => [["Status", s.status]],
    },
    {
      key: "submitted",
      label: "Submitted",
      render: (s) =>
        new Date(s.submittedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
      details: (s) => [
        ["Submitted", new Date(s.submittedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })],
      ],
    },
  ];

  if (!user) return null;
  if (!previewId && !canAccessSection(user, "kyc")) {
    return (
      <ErrorState
        title="No access to this section."
        text="You do not have access to the KYC section. Ask the owner to grant you access from the Owner panel."
      />
    );
  }

  const filters = STATUS_FILTERS.map((f) => ({
    id: f.id,
    label: `${f.label} (${f.id === "all" ? counts.pending + counts.approved + counts.rejected : counts[f.id as keyof typeof counts]})`,
  }));

  return (
    <div>
      <PageHeader
        title="KYC review"
        sub="Verification only — it never blocks deposits or play."
        backHref={previewId ? `/admin?preview=${previewId}` : "/admin"}
        backLabel="Overview"
      />
      <Card title="Queue">
        <DataTable<KycSubmission>
          viewId="admin-kyc"
          columns={columns}
          rows={pageRows}
          total={rows.length}
          page={safePage}
          pageSize={pageSize}
          onPageChange={(p) => setPage(p)}
          filters={filters}
          activeFilter={status}
          onFilterChange={(id) => {
            setStatus(id);
            setPage(1);
            setSelectedId(null);
          }}
          loading={loading}
          error={err}
          onRetry={reload}
          emptyTitle="No submissions in this queue."
          emptyText="No rows match the current filter."
          selectedId={selected?.id ?? null}
          onSelect={(s) => setSelectedId(s.id)}
          rowHref={(s) => (previewId ? `/admin/players/${s.userId}?preview=${previewId}` : `/admin/players/${s.userId}`)}
        />
      </Card>
      {selected ? (
        <div className="st-split">
          <Card title="Document">
            <KycDocumentViewer
              documentUrl={selected.documentUrl}
              documentTypeLabel={selected.documentTypeLabel}
              playerName={selected.userName}
            />
          </Card>
          <Card title="Decision">
            <dl className="st-meta-grid">
              <div className="st-meta-item">
                <dt>Player</dt>
                <dd>{selected.userName}</dd>
              </div>
              <div className="st-meta-item">
                <dt>Contact</dt>
                <dd>
                  <AdminContactValue userId={selected.userId} contact={selected.userContact} preview={!!previewId} />
                </dd>
              </div>
              <div className="st-meta-item">
                <dt>Document</dt>
                <dd>{selected.documentTypeLabel}</dd>
              </div>
              <div className="st-meta-item">
                <dt>Status</dt>
                <dd>
                  <StatusPill
                    status={selected.status === "approved" ? "Approved" : selected.status === "rejected" ? "Rejected" : "Pending"}
                  />
                </dd>
              </div>
              <div className="st-meta-item">
                <dt>Submitted</dt>
                <dd>{new Date(selected.submittedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</dd>
              </div>
              {selected.autoApproved ? (
                <div className="st-meta-item">
                  <dt>Auto-approved</dt>
                  <dd>
                    <Badge variant="ok">Auto-approved</Badge>
                  </dd>
                </div>
              ) : null}
              {selected.reviewedBy ? (
                <div className="st-meta-item">
                  <dt>Reviewed by</dt>
                  <dd>{selected.reviewedBy}</dd>
                </div>
              ) : null}
              {selected.rejectionReason ? (
                <div className="st-meta-item">
                  <dt>Rejection reason</dt>
                  <dd>{selected.rejectionReason}</dd>
                </div>
              ) : null}
            </dl>
            {selected.status === "pending" && !previewId ? (
              <div className="st-btn-row" style={{ marginTop: 12 }}>
                <Button onClick={() => setConfirm({ s: selected, decision: "approved" })}>Approve</Button>
                <Button variant="danger" onClick={() => setConfirm({ s: selected, decision: "rejected" })}>
                  Reject
                </Button>
                {pendingRows.length > 1 ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const idx = pendingRows.findIndex((s) => s.id === selected.id);
                      const next = pendingRows[idx + 1] ?? pendingRows[0];
                      if (next) setSelectedId(next.id);
                    }}
                  >
                    Next
                  </Button>
                ) : null}
              </div>
            ) : null}
            {selected.status === "pending" && !previewId ? (
              <p className="st-kbd-hint">Keys: j / k move, a approve, r reject.</p>
            ) : null}
            {previewId ? <p>Preview only — decisions are made from the admin&apos;s own panel.</p> : null}
          </Card>
        </div>
      ) : (
        <EmptyState title="Nothing to review." text="Select a submission from the queue above." />
      )}
      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={(reason) => void decide(reason)}
        title={confirm?.decision === "rejected" ? "Reject KYC" : "Approve KYC"}
        facts={
          confirm
            ? [
                { label: "Player", value: confirm.s.userName },
                { label: "Document", value: confirm.s.documentTypeLabel },
                {
                  label: "Submitted",
                  value: new Date(confirm.s.submittedAt).toLocaleString("en-GB", { day: "numeric", month: "short" }),
                },
              ]
            : []
        }
        reasonRequired={confirm?.decision === "rejected"}
        reasonLabel="Reason for rejection (required, at least 3 characters)"
        confirmLabel={confirm?.decision === "rejected" ? "Reject" : "Approve"}
        danger={confirm?.decision === "rejected"}
        busy={busy}
      />
    </div>
  );
}
