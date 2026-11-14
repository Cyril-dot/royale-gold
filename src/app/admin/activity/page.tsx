// Admin dashboard — Activity log (P0 Batch 3 A12). The admin's OWN
// actions only (from the AuditLog table, filtered to this admin) —
// action, target, detail, timestamp, newest first. Filterable by action.
// An admin can never see another admin's or the owner's rows.

"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "../../../lib/api";
import { useStore } from "../../../lib/store";
import { useAdminContext } from "../../../lib/admin-client";
import { canAccessSection } from "../../../lib/rbac";
import { AdminNav, AdminPreviewBanner, AdminLoginPrompt, AdminError, AdminDenied } from "../../../components/AdminNav";

interface ActivityRow {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  targetId: string | null;
  detail: string | null;
  createdAt: string;
}

export default function AdminActivityPage() {
  return (
    <main className="rg48-page-main rg23 admin-fb">
      <div className="wrap">
        <Suspense fallback={null}>
          <AdminActivityInner />
        </Suspense>
      </div>
    </main>
  );
}

function AdminActivityInner() {
  const { user } = useStore();
  const sp = useSearchParams();
  const previewId = sp.get("preview");
  const { ctx, err: ctxErr } = useAdminContext(previewId);
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  const [err, setErr] = useState("");
  const [action, setAction] = useState("");

  const load = useCallback(async () => {
    try {
      const base = previewId ? `/api/owner/audit-log?actor=${previewId}` : "/api/admin/activity";
      const qs = action ? `${base.includes("?") ? "&" : "?"}action=${encodeURIComponent(action)}` : base;
      const res = await api<{ rows: ActivityRow[] }>(qs);
      setRows(res.rows);
      setErr("");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not load activity.");
    }
  }, [previewId, action]);

  useEffect(() => { void load(); }, [load]);

  if (!user) return <AdminLoginPrompt />;
  if (ctxErr) return <AdminError err={ctxErr} />;
  if (!ctx) return <p>Loading admin panel…</p>;
  // P0 Batch 3 (O3): the server 403s this section too.
  if (!previewId && !canAccessSection(user, "activity")) return <AdminDenied section="activity" />;
  if (err) return <AdminError err={err} />;

  const actions = [...new Set((rows ?? []).map((r) => r.action))].sort();
  return (
    <>
      {previewId ? <AdminPreviewBanner name={ctx.admin.name} /> : null}
      <div className="rg48-hbar-in">
        <Link className="gp-back" href={previewId ? `/admin?preview=${previewId}` : "/admin"} aria-label="Back to admin overview"><span className="gp-back-coin">←</span></Link>
        <h2>Activity</h2>
      </div>
      <p className="rg48-sub">{ctx.admin.name} · {ctx.admin.email} · your actions only</p>
      <AdminNav />
      <section className="admin-sec">
        <h3>Your activity</h3>
        <label className="players-search">
          <select value={action} onChange={(e) => setAction(e.target.value)} aria-label="Filter by action">
            <option value="">All actions</option>
            {actions.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>
        {rows === null ? (
          <p>Loading activity…</p>
        ) : rows.length === 0 ? (
          <p>No actions yet.</p>
        ) : (
          <div className="rg48-twrap">
            <table className="dep-table">
              <thead><tr><th>Action</th><th>Detail</th><th>Time</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.action}</td>
                    <td>{r.detail || "—"}</td>
                    <td>{new Date(r.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
