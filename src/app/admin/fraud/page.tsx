// Admin dashboard — Fraud alerts (P1 Batch 2, A24). REAL signals
// computed live from the tables (see src/lib/fraud.ts) — no stored
// alert rows, so every alert can be checked against the DB from its
// reason. An admin sees only their own downline; the owner previews
// one admin's alerts with ?preview=<adminId>.
//
// Signals: a withdrawal with 2+ risk flags (HIGH); 3+ withdrawal
// requests in 24h (HIGH); GH₵ 1,000+ deposited in 24h with no play in
// 24h (MEDIUM); a withdrawal within 1 hour of a deposit (MEDIUM).
// Failed-login monitoring is NOT here: the login route writes no audit
// row on a failed attempt, so there is no real data to count from, and
// no login-attempt log is invented — the page says so plainly.

"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useStore } from "../../../lib/store";
import { useAdminContext, useAdminFraud } from "../../../lib/admin-client";
import { canAccessSection } from "../../../lib/rbac";
import { AdminNav, AdminPreviewBanner, AdminLoginPrompt, AdminError, AdminDenied } from "../../../components/AdminNav";

const SIGNAL_LABELS: Record<string, string> = {
  "withdrawal-flags": "Flagged withdrawal",
  "rapid-withdrawals": "Rapid withdrawals",
  "deposit-no-play": "Deposit, no play",
  "deposit-then-withdraw": "Deposit then withdraw",
};

function AdminFraudInner() {
  const { user } = useStore();
  const sp = useSearchParams();
  const previewId = sp.get("preview");
  const { ctx, err: ctxErr } = useAdminContext(previewId);
  const { data, err, load } = useAdminFraud(previewId);

  if (!user) return <AdminLoginPrompt />;
  if (ctxErr) return <AdminError err={ctxErr} />;
  if (!ctx) return <p>Loading admin panel…</p>;
  // P0 Batch 3 (O3): the server 403s this section too.
  if (!previewId && !canAccessSection(user, "fraud")) return <AdminDenied section="fraud" />;

  const alerts = data?.alerts ?? [];
  const counts = data?.counts ?? { high: 0, medium: 0 };
  const playerHref = (id: string) => (previewId ? `/admin/players/${id}?preview=${previewId}` : `/admin/players/${id}`);

  return (
    <>
      {previewId ? <AdminPreviewBanner name={ctx.admin.name} /> : null}
      <div className="rg48-hbar-in">
        <h2>Fraud <em>alerts</em></h2>
      </div>
      <p className="rg48-sub">Live signals from your downline — computed from the tables on every load, not stored. Tap a player to open their detail.</p>
      <AdminNav />

      <section className="admin-sec">
        <div className="sum-cards">
          <div className="sum-card"><span>High</span><b>{counts.high}</b></div>
          <div className="sum-card"><span>Medium</span><b>{counts.medium}</b></div>
          <div className="sum-card"><span>Total</span><b>{alerts.length}</b></div>
        </div>
        <button className="btn btn-ghost" type="button" onClick={() => void load()}>Refresh alerts</button>
        {err ? <p className="rg48-err">{err}</p> : null}
        {!data ? (
          <p>Loading alerts…</p>
        ) : alerts.length === 0 ? (
          <p>No fraud signals in your downline right now.</p>
        ) : (
          <div className="fraud-list">
            {alerts.map((a) => (
              <article key={a.id} className="fraud-row">
                <div className="fraud-head">
                  <span className={`sev-pill sev-${a.severity}`}>{a.severity === "high" ? "HIGH" : "MEDIUM"}</span>
                  <b>{SIGNAL_LABELS[a.signal] ?? a.signal}</b>
                </div>
                <p>{a.reason}</p>
                <p className="rg48-sub">
                  <Link href={playerHref(a.userId)}>{a.userName}</Link>
                  {a.userContact ? ` · ${a.userContact}` : ""} · {new Date(a.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              </article>
            ))}
          </div>
        )}
        <p className="rg48-mini">
          What counts: a withdrawal with 2+ risk flags is HIGH; 3+ withdrawal requests in 24 hours is HIGH; GH₵ 1,000+ deposited
          in 24 hours with no rounds played in 24 hours is MEDIUM; a withdrawal within 1 hour of a deposit is MEDIUM.
          Failed-login monitoring is not available — logins are not written to the audit log, so there is no real data to count
          failed attempts from.
        </p>
      </section>
    </>
  );
}

export default function AdminFraudPage() {
  return (
    <main className="rg48-page-main rg23 admin-fb">
      <div className="wrap">
        <Suspense fallback={<p>Loading admin panel…</p>}>
          <AdminFraudInner />
        </Suspense>
      </div>
    </main>
  );
}
