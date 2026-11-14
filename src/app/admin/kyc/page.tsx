// Admin dashboard — KYC review queue (P1 Batch 2, A21). Submissions
// from the admin's own downline only; the owner previews one admin's
// queue with ?preview=<adminId> and reviews as that admin. Approve, or
// reject with a mandatory reason. KYC is informational ONLY — the
// decision never blocks deposits or play.

"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useStore } from "../../../lib/store";
import { api } from "../../../lib/api";
import { useAdminContext, useAdminKyc, type KycRow } from "../../../lib/admin-client";
import { canAccessSection } from "../../../lib/rbac";
import { AdminNav, AdminPreviewBanner, AdminLoginPrompt, AdminError, AdminDenied } from "../../../components/AdminNav";

type KycFilter = "pending" | "approved" | "rejected" | "all";

const FILTERS: { key: KycFilter; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

function kycLabel(status: string): string {
  if (status === "pending") return "Pending review";
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  return "Not submitted";
}

function AdminKycInner() {
  const { user, toast } = useStore();
  const sp = useSearchParams();
  const previewId = sp.get("preview");
  const { ctx, err: ctxErr } = useAdminContext(previewId);
  const [filter, setFilter] = useState<KycFilter>("pending");
  const { data, err, load } = useAdminKyc(previewId, filter);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!user) return <AdminLoginPrompt />;
  if (ctxErr) return <AdminError err={ctxErr} />;
  if (!ctx) return <p>Loading admin panel…</p>;
  // P0 Batch 3 (O3): the server 403s this section too.
  if (!previewId && !canAccessSection(user, "kyc")) return <AdminDenied section="kyc" />;

  const decide = async (row: KycRow, decision: "approved" | "rejected") => {
    const reason = decision === "rejected" ? rejectReason.trim() : "";
    if (decision === "rejected" && reason.length < 3) {
      toast("A reason is required to reject", "lose");
      return;
    }
    setBusyId(row.id);
    try {
      await api(`/api/admin/kyc/${row.id}/decide`, {
        method: "POST",
        body: JSON.stringify({ decision, ...(decision === "rejected" ? { reason } : {}) }),
      });
      toast(decision === "approved" ? `Approved ${row.userName}'s KYC` : `Rejected ${row.userName}'s KYC`, decision === "approved" ? "win" : "lose");
      setRejectId(null);
      setRejectReason("");
      await load();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Decision failed", "lose");
    } finally {
      setBusyId(null);
    }
  };

  const counts = data?.counts ?? { pending: 0, approved: 0, rejected: 0 };
  const rows = data?.submissions ?? [];

  return (
    <>
      {previewId ? <AdminPreviewBanner name={ctx.admin.name} /> : null}
      <div className="rg48-hbar-in">
        <h2>KYC <em>queue</em></h2>
      </div>
      <p className="rg48-sub">Identity documents from your players. Reviewing a document never blocks deposits or play — KYC is verification only.</p>
      <AdminNav />

      <section className="admin-sec">
        <div className="sum-cards">
          <div className="sum-card"><span>Pending</span><b>{counts.pending}</b></div>
          <div className="sum-card"><span>Approved</span><b>{counts.approved}</b></div>
          <div className="sum-card"><span>Rejected</span><b>{counts.rejected}</b></div>
        </div>
        <div className="ac-tabs" role="tablist" aria-label="KYC status filter">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} className={filter === f.key ? "on" : ""} onClick={() => setFilter(f.key)}>
              {f.label}{f.key !== "all" ? ` (${counts[f.key] ?? 0})` : ""}
            </button>
          ))}
        </div>
        {err ? <p className="rg48-err">{err}</p> : null}
        {!data ? (
          <p>Loading the queue…</p>
        ) : rows.length === 0 ? (
          <p>No {filter === "all" ? "" : `${filter} `}submissions{filter === "pending" ? " — nothing waiting for review." : "."}</p>
        ) : (
          <div className="kyc-list">
            {rows.map((r) => (
              <article key={r.id} className="kyc-row">
                <div className="kyc-head">
                  <Link href={previewId ? `/admin/players/${r.userId}?preview=${previewId}` : `/admin/players/${r.userId}`}><b>{r.userName}</b></Link>
                  <span className={`kyc-pill kyc-${r.status}`}>{kycLabel(r.status)}</span>
                  {/* P1 Batch 4 (O22): auto-approved by the URL-host
                      allow-list — a host check, not a document check. */}
                  {r.autoApproved ? <span className="kyc-pill kyc-auto">Auto-approved</span> : null}
                </div>
                <p className="rg48-sub">{r.userContact ?? "—"} · {r.documentTypeLabel} · Submitted {new Date(r.submittedAt).toLocaleDateString("en-GB")}</p>
                <p className="kyc-doc">
                  <a href={r.documentUrl} target="_blank" rel="noreferrer">View document ↗</a>
                  <span className="rg48-mini"> {r.documentUrl}</span>
                </p>
                {r.status === "rejected" && r.rejectionReason ? <p className="rg48-err">Rejection reason: {r.rejectionReason}</p> : null}
                {r.status !== "pending" && r.reviewedBy ? (
                  <p className="rg48-mini">Reviewed by {r.reviewedBy}{r.reviewedAt ? ` · ${new Date(r.reviewedAt).toLocaleDateString("en-GB")}` : ""}</p>
                ) : null}
                {r.status === "pending" ? (
                  <div className="kyc-actions">
                    <button className="btn btn-gold" type="button" disabled={busyId === r.id} onClick={() => void decide(r, "approved")}>
                      {busyId === r.id ? "Saving…" : "Approve"}
                    </button>
                    {rejectId === r.id ? (
                      <span className="kyc-reject">
                        <input
                          type="text"
                          placeholder="Reason for rejection (required)"
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          aria-label="Rejection reason"
                          maxLength={500}
                        />
                        <button className="btn btn-ghost" type="button" disabled={busyId === r.id} onClick={() => void decide(r, "rejected")}>Confirm reject</button>
                        <button className="btn btn-ghost" type="button" onClick={() => { setRejectId(null); setRejectReason(""); }}>Cancel</button>
                      </span>
                    ) : (
                      <button className="btn btn-ghost" type="button" onClick={() => { setRejectId(r.id); setRejectReason(""); }}>Reject…</button>
                    )}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

export default function AdminKycPage() {
  return (
    <main className="rg48-page-main rg23 admin-fb">
      <div className="wrap">
        <Suspense fallback={<p>Loading admin panel…</p>}>
          <AdminKycInner />
        </Suspense>
      </div>
    </main>
  );
}
