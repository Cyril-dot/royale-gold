// Admin dashboard — Tickets (Phase 5 restyle). Inbox on the shared
// DataTable + a two-state conversation view: the thread, a reply form
// with three canned-reply inserts, and close behind the shared
// ConfirmDialog. Close takes NO reason — the endpoint cannot record
// one, so none is asked. Tickets + replies only — no live chat.
"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "../../../lib/api";
import { useStore } from "../../../lib/store";
import { useStaffFetch } from "../../../components/staff-ui/useStaffFetch";
import { PageHeader } from "../../../components/staff-ui/PageHeader";
import { Card } from "../../../components/staff-ui/Card";
import { DataTable, type DataColumn } from "../../../components/staff-ui/DataTable";
import { StatusPill } from "../../../components/staff-ui/Badge";
import { ConfirmDialog } from "../../../components/staff-ui/Dialog";
import { Button } from "../../../components/staff-ui/Button";
import { Skeleton, EmptyState, ErrorState } from "../../../components/staff-ui/Feedback";
import { AdminContactValue } from "../../../components/admin/AdminReveal";
import { canAccessSection } from "../../../lib/rbac";

interface TicketRow {
  id: string;
  subject: string;
  status: string;
  userId: string;
  userName: string;
  userContact: string | null;
  messages: number;
  createdAt: string;
  updatedAt: string;
}

interface TicketMessage {
  id: string;
  senderRole: string;
  senderName: string | null;
  body: string;
  createdAt: string;
}

interface TicketDetail {
  id: string;
  subject: string;
  status: string;
  userId: string;
  userName: string;
  userContact: string | null;
  createdAt: string;
  updatedAt: string;
  messages: TicketMessage[];
}

interface TicketsResponse {
  tickets: TicketRow[];
}

const CANNED = [
  { label: "Looking into it", text: "Thanks for reaching out — I'm looking into this now and will update you shortly." },
  { label: "Need more detail", text: "Could you share a bit more detail — what happened, and when? A screenshot helps if you have one." },
  { label: "Resolved", text: "This should be sorted now — please let me know if it still isn't working on your side." },
];

const STATUS_FILTERS = [
  { id: "", label: "All" },
  { id: "open", label: "Open" },
  { id: "answered", label: "Answered" },
  { id: "closed", label: "Closed" },
];

export default function AdminTicketsPage() {
  return (
    <Suspense fallback={<Skeleton lines={6} title />}>
      <AdminTicketsInner />
    </Suspense>
  );
}

function AdminTicketsInner() {
  const { user, toast } = useStore();
  const sp = useSearchParams();
  const previewId = sp.get("preview");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [openId, setOpenId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const [busy, setBusy] = useState(false);

  const listUrl = useMemo(() => {
    if (!user) return null;
    const base = previewId ? `/api/owner/tickets?adminId=${previewId}` : "/api/admin/tickets";
    return status ? `${base}${base.includes("?") ? "&" : "?"}status=${status}` : base;
  }, [user, previewId, status]);
  const { data, err, loading, reload } = useStaffFetch<TicketsResponse>(listUrl);
  const rows = data?.tickets ?? [];
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const openRow = rows.find((t) => t.id === openId) ?? null;

  const detailUrl = useMemo(() => {
    if (!user || !openId) return null;
    return previewId ? `/api/owner/tickets/${openId}` : `/api/admin/tickets/${openId}`;
  }, [user, previewId, openId]);
  const detail = useStaffFetch<TicketDetail>(detailUrl);
  const ticket = detail.data;

  const sendReply = async () => {
    const text = replyText.trim();
    if (!openId || text.length < 1) return;
    if (text.length > 2000) {
      toast("Reply is too long (max 2000 characters)", "lose");
      return;
    }
    setBusy(true);
    try {
      const url = previewId ? `/api/owner/tickets/${openId}/reply` : `/api/admin/tickets/${openId}/reply`;
      await api(url, { method: "POST", body: JSON.stringify({ body: text }) });
      setReplyText("");
      toast("Reply sent", "win");
      detail.reload();
      reload();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Reply failed", "lose");
    } finally {
      setBusy(false);
    }
  };

  const closeTicket = async () => {
    if (!openId) return;
    setBusy(true);
    try {
      const url = previewId ? `/api/owner/tickets/${openId}/close` : `/api/admin/tickets/${openId}/close`;
      await api(url, { method: "POST" });
      toast("Ticket closed", "win");
      setConfirmClose(false);
      setOpenId(null);
      reload();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Close failed", "lose");
    } finally {
      setBusy(false);
    }
  };

  const columns: DataColumn<TicketRow>[] = [
    {
      key: "subject",
      label: "Subject",
      render: (t) => t.subject,
      sub: (t) => t.userName,
    },
    {
      key: "player",
      label: "Player",
      render: (t) => t.userName,
      sub: (t) => <AdminContactValue userId={t.userId} contact={t.userContact} preview={!!previewId} />,
    },
    {
      key: "status",
      label: "Status",
      render: (t) => (
        <StatusPill status={t.status === "open" ? "Open" : t.status === "answered" ? "Answered" : "Closed"} />
      ),
      details: (t) => [["Status", t.status]],
    },
    {
      key: "messages",
      label: "Messages",
      render: (t) => String(t.messages),
      details: (t) => [["Messages", String(t.messages)]],
    },
    {
      key: "updated",
      label: "Updated",
      render: (t) =>
        new Date(t.updatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
      details: (t) => [
        ["Updated", new Date(t.updatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })],
      ],
    },
  ];

  if (!user) return null;
  if (!previewId && !canAccessSection(user, "tickets")) {
    return (
      <ErrorState
        title="No access to this section."
        text="You do not have access to the Tickets section. Ask the owner to grant you access from the Owner panel."
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Tickets"
        sub="Support tickets from your players. Tickets + replies only — no live chat."
        backHref={previewId ? `/admin?preview=${previewId}` : "/admin"}
        backLabel="Overview"
      />
      <Card title="Inbox">
        <DataTable<TicketRow>
          viewId="admin-tickets"
          columns={columns}
          rows={pageRows}
          total={rows.length}
          page={safePage}
          pageSize={pageSize}
          onPageChange={(p) => setPage(p)}
          filters={STATUS_FILTERS}
          activeFilter={status}
          onFilterChange={(id) => {
            setStatus(id);
            setPage(1);
          }}
          loading={loading}
          error={err}
          onRetry={reload}
          emptyTitle="No tickets."
          emptyText="No rows match the current filter."
          selectedId={openId}
          onSelect={(t) => {
            setOpenId(t.id === openId ? null : t.id);
            setReplyText("");
          }}
          rowHref={(t) => (previewId ? `/admin/players/${t.userId}?preview=${previewId}` : `/admin/players/${t.userId}`)}
        />
      </Card>
      {openRow ? (
        <Card title={`${openRow.subject} — ${openRow.userName}`}>
          {detail.loading ? (
            <Skeleton lines={4} />
          ) : detail.err || !ticket ? (
            <ErrorState title="Could not open this ticket." text={detail.err ?? "Try again."} onRetry={detail.reload} />
          ) : (
            <div>
              <div className="st-tk-thread">
                {ticket.messages.map((m) => (
                  <div key={m.id} className={`st-tk-msg${m.senderRole === "admin" ? " st-tk-msg-admin" : ""}`}>
                    <p>
                      <strong>{m.senderRole === "admin" ? "You" : ticket.userName}</strong> ·{" "}
                      {new Date(m.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                    <p>{m.body}</p>
                  </div>
                ))}
                {ticket.messages.length === 0 ? <EmptyState title="No messages yet." text="The ticket has no messages." /> : null}
              </div>
              {ticket.status !== "closed" && !previewId ? (
                <div style={{ marginTop: 12 }}>
                  <div className="st-btn-row" style={{ marginBottom: 8 }}>
                    {CANNED.map((c) => (
                      <Button
                        key={c.label}
                        variant="secondary"
                        size="sm"
                        onClick={() => setReplyText((prev) => (prev ? `${prev}\n${c.text}` : c.text))}
                      >
                        {c.label}
                      </Button>
                    ))}
                  </div>
                  <textarea
                    className="st-input"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Write a reply…"
                    aria-label="Reply"
                    rows={3}
                    maxLength={2000}
                  />
                  <div className="st-btn-row" style={{ marginTop: 8 }}>
                    <Button onClick={() => void sendReply()} disabled={busy || replyText.trim().length < 1}>
                      Send reply
                    </Button>
                    <Button variant="secondary" onClick={() => setConfirmClose(true)} disabled={busy}>
                      Close ticket
                    </Button>
                  </div>
                </div>
              ) : null}
              {ticket.status === "closed" ? <p>This ticket is closed.</p> : null}
              {previewId ? <p>Preview only — replies and closing are done from the admin&apos;s own panel.</p> : null}
            </div>
          )}
        </Card>
      ) : null}
      <ConfirmDialog
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        onConfirm={() => void closeTicket()}
        title="Close ticket"
        body="The player will see the ticket as closed. This cannot be undone from here."
        facts={openRow ? [{ label: "Subject", value: openRow.subject }] : []}
        confirmLabel="Close ticket"
        busy={busy}
      />
    </div>
  );
}
