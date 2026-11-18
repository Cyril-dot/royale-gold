// Owner Audit log (Phase 2) — split out of the old one-page owner panel
// (src/app/owner/legacy/page.tsx). Same sections, same endpoints, same
// behaviour — now its own route, loading only its own data.
"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { todayStr } from "../../../lib/admin-client";
import { useStore } from "../../../lib/store";
import { OwnerRangeBar } from "../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../components/staff-ui/PageHeader";

export default function OwnerAuditPage() {
  const { user } = useStore();
  // P0 Batch 3 (O14): the global audit log — every admin/owner action,
  // append-only. Filter by actor, action, or date.
  interface AuditRow { id: string; actorId: string; actorName: string; actorRole: string; action: string; targetId: string | null; detail: string | null; createdAt: string }
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [auditActions, setAuditActions] = useState<{ action: string; count: number }[]>([]);
  const [auditActors, setAuditActors] = useState<{ id: string; name: string; role: string }[]>([]);
  const [auditActor, setAuditActor] = useState("");
  const [auditAction, setAuditAction] = useState("");
  const [auditFrom, setAuditFrom] = useState("");
  const [auditTo, setAuditTo] = useState("");
  const loadAudit = useCallback(async () => {
    try {
      const p = new URLSearchParams();
      if (auditActor) p.set("actor", auditActor);
      if (auditAction) p.set("action", auditAction);
      if (auditFrom) p.set("from", auditFrom);
      if (auditTo) p.set("to", auditTo);
      const qs = p.toString();
      const r = await api<{ rows: AuditRow[]; actions: { action: string; count: number }[]; actors: { id: string; name: string; role: string }[] }>(`/api/owner/audit-log${qs ? `?${qs}` : ""}`);
      setAudit(r.rows);
      setAuditActions(r.actions);
      setAuditActors(r.actors);
    } catch { setAudit([]); }
  }, [auditActor, auditAction, auditFrom, auditTo]);
  useEffect(() => { if (user) void loadAudit(); }, [loadAudit, user]);
  return (
    <div>
      <PageHeader title="Audit log" sub="Every admin and owner action, append-only." />
      <OwnerRangeBar />
      <section className="admin-sec">
      <h3>Audit log</h3>
      <div className="money-filters">
        <div className="money-dates">
          <label>Actor
            <select value={auditActor} onChange={(e) => setAuditActor(e.target.value)} aria-label="Filter by actor">
              <option value="">Everyone</option>
              {auditActors.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.role})</option>
              ))}
            </select>
          </label>
          <label>Action
            <select value={auditAction} onChange={(e) => setAuditAction(e.target.value)} aria-label="Filter by action">
              <option value="">All actions</option>
              {auditActions.map((a) => (
                <option key={a.action} value={a.action}>{a.action} ({a.count})</option>
              ))}
            </select>
          </label>
          <label>From <input type="date" value={auditFrom} max={todayStr()} onChange={(e) => setAuditFrom(e.target.value)} /></label>
          <label>To <input type="date" value={auditTo} max={todayStr()} onChange={(e) => setAuditTo(e.target.value)} /></label>
        </div>
      </div>
      {audit === null ? <p>Loading audit log…</p> : audit.length === 0 ? (
        <p>No actions match.</p>
      ) : (
        <div className="rg48-twrap">
          <table className="dep-table">
            <thead><tr><th>Actor</th><th>Action</th><th>Detail</th><th>Time</th></tr></thead>
            <tbody>
              {audit.map((r) => (
                <tr key={r.id}>
                  <td>{r.actorName} ({r.actorRole})</td>
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
    </div>
  );
}
