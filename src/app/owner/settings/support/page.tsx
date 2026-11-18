// Owner Support oversight (Phase 2) — split out of the old one-page owner panel
// (src/app/owner/legacy/page.tsx). Same sections, same endpoints, same
// behaviour — now its own route, loading only its own data.
"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../../../lib/api";
import { useStore } from "../../../../lib/store";
import { useOwner } from "../../../../components/owner/OwnerContext";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";

export default function OwnerSupportPage() {
  const { user, toast } = useStore();
  const { admins: ctxAdmins, loadAdmins } = useOwner();
  const admins = ctxAdmins ?? [];
  useEffect(() => { if (user) void loadAdmins(); }, [loadAdmins, user]);

  // O23: support oversight — every open ticket + per-admin stats.
  interface SupportTicketRow { id: string; subject: string; status: string; userId: string; userName: string; userContact: string | null; adminId: string | null; adminName: string | null; messages: number; createdAt: string; updatedAt: string; ageHours: number }
  interface SupportAdminStats { adminId: string; adminName: string; open: number; answered: number; closed: number; unanswered: number; avgFirstResponseHours: number | null }
  const [support, setSupport] = useState<{ openTickets: SupportTicketRow[]; stats: SupportAdminStats[]; totals: { open: number; answered: number; closed: number; unanswered: number } } | null>(null);
  // Per-ticket reassign target (ticket id → admin id).
  const [reassignSel, setReassignSel] = useState<Record<string, string>>({});
  const [reassignBusy, setReassignBusy] = useState<string | null>(null);
  const loadSupport = useCallback(async () => {
    try {
      setSupport(await api<{ openTickets: SupportTicketRow[]; stats: SupportAdminStats[]; totals: { open: number; answered: number; closed: number; unanswered: number } }>("/api/owner/tickets"));
    } catch { setSupport(null); }
  }, []);
  useEffect(() => { if (user) void loadSupport(); }, [loadSupport, user]);

  // P1 Batch 4 (O23): reassign a ticket to a different admin.
  const reassignTicketTo = async (ticketId: string) => {
    const target = reassignSel[ticketId] ?? "";
    if (!target) { toast("Pick an admin to reassign to", "lose"); return; }
    setReassignBusy(ticketId);
    try {
      await api(`/api/owner/tickets/${ticketId}/reassign`, { method: "POST", body: JSON.stringify({ adminId: target }) });
      toast("Ticket reassigned — the history shows it", "win");
      setReassignSel((cur) => ({ ...cur, [ticketId]: "" }));
      await loadSupport();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not reassign ticket", "lose");
    } finally { setReassignBusy(null); }
  };
  return (
    <div>
      <PageHeader title="Support oversight" sub="Open tickets and per-admin stats." />
      <OwnerRangeBar />
      <section className="admin-sec">
      <h3>Support oversight</h3>
      {support === null ? <p>Loading support…</p> : (
        <>
          <div className="sum-cards">
            <div className="sum-card"><span>Open</span><b>{support.totals.open}</b></div>
            <div className="sum-card"><span>Answered</span><b>{support.totals.answered}</b></div>
            <div className="sum-card"><span>Closed</span><b>{support.totals.closed}</b></div>
            <div className="sum-card"><span>Unanswered</span><b>{support.totals.unanswered}</b></div>
          </div>
          {support.stats.length > 0 && (
            <div className="rg48-twrap">
              <table className="dep-table">
                <thead><tr><th>Admin</th><th>Open</th><th>Answered</th><th>Closed</th><th>Unanswered</th><th>Avg first response</th></tr></thead>
                <tbody>
                  {support.stats.map((s) => (
                    <tr key={s.adminId}>
                      <td>{s.adminName}</td>
                      <td>{s.open}</td>
                      <td>{s.answered}</td>
                      <td>{s.closed}</td>
                      <td>{s.unanswered}</td>
                      <td>{s.avgFirstResponseHours === null ? "—" : `${s.avgFirstResponseHours}h`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {support.openTickets.length === 0 ? <p>No open tickets.</p> : (
            <div className="rg48-twrap">
              <table className="dep-table">
                <thead><tr><th>Player</th><th>Subject</th><th>Admin</th><th>Status</th><th>Age</th><th>Reassign to</th></tr></thead>
                <tbody>
                  {support.openTickets.map((t) => (
                    <tr key={t.id}>
                      <td>{t.userName}</td>
                      <td>{t.subject}</td>
                      <td>{t.adminName ?? "—"}</td>
                      <td>{t.status}</td>
                      <td>{t.ageHours < 1 ? "< 1h" : `${t.ageHours}h`}</td>
                      <td>
                        <select value={reassignSel[t.id] ?? ""} onChange={(e) => setReassignSel((cur) => ({ ...cur, [t.id]: e.target.value }))} aria-label={`Reassign ticket ${t.subject}`}>
                          <option value="">Pick admin…</option>
                          {admins.filter((a) => a.id !== t.adminId).map((a) => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>{" "}
                        <button type="button" className="btn btn-ghost btn-sm" disabled={reassignBusy === t.id || !(reassignSel[t.id] ?? "")} onClick={() => void reassignTicketTo(t.id)}>Reassign</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      </section>
    </div>
  );
}
