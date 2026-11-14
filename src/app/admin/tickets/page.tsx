// Admin dashboard — Tickets (P0 Batch 3 A11). The admin's inbox: tickets
// from their OWN players only (assigned at creation to the player's
// referring admin). List + open a ticket + reply + close. Tickets +
// replies only — no live chat.

"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "../../../lib/api";
import { useStore } from "../../../lib/store";
import { useAdminContext } from "../../../lib/admin-client";
import { canAccessSection } from "../../../lib/rbac";
import { AdminNav, AdminPreviewBanner, AdminLoginPrompt, AdminError, AdminDenied } from "../../../components/AdminNav";

interface TicketRow {
  id: string;
  subject: string;
  status: string;
  userId: string;
  userName: string;
  userContact: string | null;
  adminId: string | null;
  adminName: string | null;
  messages: number;
  createdAt: string;
  updatedAt: string;
}

interface TicketDetail {
  id: string;
  subject: string;
  status: string;
  userId: string;
  userName: string;
  userContact: string | null;
  adminId: string | null;
  adminName: string | null;
  messageCount?: number;
  createdAt: string;
  updatedAt: string;
  messages: { id: string; senderId: string; senderName: string; senderRole: string; body: string; createdAt: string }[];
}

export default function AdminTicketsPage() {
  return (
    <main className="rg48-page-main rg23 admin-fb">
      <div className="wrap">
        <Suspense fallback={null}>
          <AdminTicketsInner />
        </Suspense>
      </div>
    </main>
  );
}

function AdminTicketsInner() {
  const { user, toast } = useStore();
  const sp = useSearchParams();
  const previewId = sp.get("preview");
  const { ctx, err: ctxErr } = useAdminContext(previewId);
  const [tickets, setTickets] = useState<TicketRow[] | null>(null);
  const [err, setErr] = useState("");
  const [status, setStatus] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      // In preview the owner reads the same inbox through the owner
      // endpoints (the owner bypasses the admin's permissions there).
      const base = previewId ? `/api/owner/tickets?adminId=${previewId}` : "/api/admin/tickets";
      const qs = status ? `${base.includes("?") ? "&" : "?"}status=${encodeURIComponent(status)}` : "";
      const res = await api<{ tickets: TicketRow[] }>(`${base}${qs}`);
      setTickets(res.tickets);
      setErr("");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not load tickets.");
    }
  }, [previewId, status]);

  useEffect(() => { void load(); }, [load]);

  const openTicket = useCallback(async (id: string) => {
    setOpenId(id);
    setDetail(null);
    try {
      const url = previewId ? `/api/owner/tickets/${id}` : `/api/admin/tickets/${id}`;
      setDetail(await api<TicketDetail>(url));
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not open ticket", "lose");
      setOpenId(null);
    }
  }, [toast, previewId]);

  const sendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!openId || !reply.trim()) return;
    setBusy(true);
    try {
      const url = previewId ? `/api/owner/tickets/${openId}/reply` : `/api/admin/tickets/${openId}/reply`;
      const updated = await api<TicketDetail>(url, {
        method: "POST",
        body: JSON.stringify({ body: reply.trim() }),
      });
      setDetail(updated);
      setReply("");
      toast("Reply sent", "win");
      await load();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not send reply", "lose");
    } finally { setBusy(false); }
  };

  const closeTicket = async () => {
    if (!openId) return;
    setBusy(true);
    try {
      const url = previewId ? `/api/owner/tickets/${openId}/close` : `/api/admin/tickets/${openId}/close`;
      const updated = await api<TicketDetail>(url, { method: "POST" });
      setDetail(updated);
      toast("Ticket closed", "win");
      await load();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not close ticket", "lose");
    } finally { setBusy(false); }
  };

  if (!user) return <AdminLoginPrompt />;
  if (ctxErr) return <AdminError err={ctxErr} />;
  if (!ctx) return <p>Loading admin panel…</p>;
  // P0 Batch 3 (O3): the server 403s this section too.
  if (!previewId && !canAccessSection(user, "tickets")) return <AdminDenied section="tickets" />;
  if (err) return <AdminError err={err} />;

  const statusBadge = (s: string) => (
    <span className={`tk-status tk-${s}`}>{s}</span>
  );

  return (
    <>
      {previewId ? <AdminPreviewBanner name={ctx.admin.name} /> : null}
      <div className="rg48-hbar-in">
        <Link className="gp-back" href={previewId ? `/admin?preview=${previewId}` : "/admin"} aria-label="Back to admin overview"><span className="gp-back-coin">←</span></Link>
        <h2>Tickets</h2>
      </div>
      <p className="rg48-sub">{ctx.admin.name} · {ctx.admin.email} · tickets from your players</p>
      <AdminNav />
      {openId && detail ? (
        <section className="admin-sec">
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => { setOpenId(null); setDetail(null); }}>← Back to inbox</button>
          <h3>{detail.subject}</h3>
          <p className="rg48-sub">{detail.userName} · {detail.userContact || "—"} · {statusBadge(detail.status)}</p>
          <div className="tk-messages">
            {detail.messages.map((m) => (
              <div key={m.id} className={`tk-msg tk-msg-${m.senderRole}`}>
                <b>{m.senderRole === "admin" ? "You" : m.senderName}</b>
                <span>{m.body}</span>
                <small>{new Date(m.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</small>
              </div>
            ))}
          </div>
          {detail.status !== "closed" ? (
            <>
              <form className="tk-reply" onSubmit={sendReply}>
                <textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply…" rows={3} maxLength={2000} />
                <button className="btn btn-gold" type="submit" disabled={busy || !reply.trim()}>{busy ? "Sending…" : "Send reply"}</button>
              </form>
              <button className="btn btn-ghost btn-sm" type="button" onClick={closeTicket} disabled={busy}>Close ticket</button>
            </>
          ) : (
            <p className="bh-empty">This ticket is closed.</p>
          )}
        </section>
      ) : (
        <section className="admin-sec">
          <h3>Inbox ({tickets === null ? "…" : tickets.length})</h3>
          <label className="players-search">
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
              <option value="">All statuses</option>
              <option value="open">Open</option>
              <option value="answered">Answered</option>
              <option value="closed">Closed</option>
            </select>
          </label>
          {tickets === null ? (
            <p>Loading tickets…</p>
          ) : tickets.length === 0 ? (
            <p>No tickets yet — your players can open one from their account page.</p>
          ) : (
            <div className="user-list">
              {tickets.map((t) => (
                <button key={t.id} type="button" className="user-row tk-row" onClick={() => void openTicket(t.id)}>
                  <b>{t.subject}</b><span>{t.userName}</span>{statusBadge(t.status)}<span>{t.messages} {t.messages === 1 ? "message" : "messages"} · {new Date(t.updatedAt).toLocaleDateString("en-GB")}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}
