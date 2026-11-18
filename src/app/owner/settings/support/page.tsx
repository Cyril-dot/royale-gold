// Owner Support oversight (Phase 4 restyle) — split out of the old one-page
// owner panel (deleted in Phase 4). Same endpoints, same
// behaviour, staff-ui throughout: KPI tiles for the totals, DataTable
// (cards on phone) for per-admin stats and open tickets. Player
// contacts stay masked until the owner taps Reveal, which calls the
// audited reveal endpoint (kind "user-contact").
"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../../../../lib/api";
import { useStore } from "../../../../lib/store";
import { useOwner } from "../../../../components/owner/OwnerContext";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";
import { Card, KpiTile } from "../../../../components/staff-ui/Card";
import { Button } from "../../../../components/staff-ui/Button";
import { Select } from "../../../../components/staff-ui/Form";
import { StatusPill } from "../../../../components/staff-ui/Badge";
import { DataTable, type DataColumn } from "../../../../components/staff-ui/DataTable";
import { MaskedValue } from "../../../../components/staff-ui/MaskedValue";
import { Skeleton, EmptyState, ErrorState } from "../../../../components/staff-ui/Feedback";
import { fmtStaffInt } from "../../../../components/staff-ui/format";
import { useOwnerFetch } from "../../../../components/owner/useOwnerFetch";

// O23: support oversight — every open ticket + per-admin stats.
interface SupportTicketRow {
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
  ageHours: number;
}
interface SupportAdminStats {
  adminId: string;
  adminName: string;
  open: number;
  answered: number;
  closed: number;
  unanswered: number;
  avgFirstResponseHours: number | null;
}
interface SupportResponse {
  openTickets: SupportTicketRow[];
  stats: SupportAdminStats[];
  totals: { open: number; answered: number; closed: number; unanswered: number };
}

function ageLabel(hours: number): string {
  return hours < 1 ? "< 1h" : `${hours}h`;
}

/** The per-ticket reassign control (admin picker + Reassign button).
 *  Rendered once as the column content (desktop) and once in the
 *  column details (phone cards) — both share the same selection state. */
function ReassignCell({
  ticket,
  admins,
  value,
  onChange,
  busy,
  onReassign,
}: {
  ticket: SupportTicketRow;
  admins: { id: string; name: string }[];
  value: string;
  onChange: (v: string) => void;
  busy: boolean;
  onReassign: () => void;
}) {
  return (
    <span>
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`Reassign ticket ${ticket.subject}`}
      >
        <option value="">Pick admin…</option>
        {admins
          .filter((a) => a.id !== ticket.adminId)
          .map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
      </Select>{" "}
      <Button variant="ghost" size="sm" loading={busy} disabled={!value} onClick={onReassign}>
        Reassign
      </Button>
    </span>
  );
}

export default function OwnerSupportPage() {
  const { user, toast } = useStore();
  const { admins: ctxAdmins, adminsErr, loadAdmins } = useOwner();
  const admins = ctxAdmins ?? [];
  // The shared admin list lives in OwnerContext; this effect only
  // triggers its loader (the loader itself owns the setState).
  useEffect(() => {
    if (user) void loadAdmins();
  }, [loadAdmins, user]);

  const url = useMemo(() => (user ? "/api/owner/tickets" : null), [user]);
  const { data, err, loading, reload } = useOwnerFetch<SupportResponse>(url);
  const support = data ?? null;
  // Per-ticket reassign target (ticket id → admin id).
  const [reassignSel, setReassignSel] = useState<Record<string, string>>({});
  const [reassignBusy, setReassignBusy] = useState<string | null>(null);
  const [statsPage, setStatsPage] = useState(1);
  const [ticketsPage, setTicketsPage] = useState(1);

  // P1 Batch 4 (O23): reassign a ticket to a different admin.
  const reassignTicketTo = async (ticketId: string) => {
    const target = reassignSel[ticketId] ?? "";
    if (!target) {
      toast("Pick an admin to reassign to", "lose");
      return;
    }
    setReassignBusy(ticketId);
    try {
      await api(`/api/owner/tickets/${ticketId}/reassign`, {
        method: "POST",
        body: JSON.stringify({ adminId: target }),
      });
      toast("Ticket reassigned — the history shows it", "win");
      setReassignSel((cur) => ({ ...cur, [ticketId]: "" }));
      reload();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not reassign ticket", "lose");
    } finally {
      setReassignBusy(null);
    }
  };

  const statsRows = (support?.stats ?? []).map((s) => ({ ...s, id: s.adminId }));
  const statsPageSize = 10;
  const statsTotalPages = Math.max(1, Math.ceil(statsRows.length / statsPageSize));
  const safeStatsPage = Math.min(statsPage, statsTotalPages);
  const statsPageRows = statsRows.slice((safeStatsPage - 1) * statsPageSize, safeStatsPage * statsPageSize);

  const tickets = support?.openTickets ?? [];
  const ticketsPageSize = 25;
  const ticketsTotalPages = Math.max(1, Math.ceil(tickets.length / ticketsPageSize));
  const safeTicketsPage = Math.min(ticketsPage, ticketsTotalPages);
  const ticketsPageRows = tickets.slice((safeTicketsPage - 1) * ticketsPageSize, safeTicketsPage * ticketsPageSize);

  const reassignCell = (t: SupportTicketRow): ReactNode => (
    <ReassignCell
      ticket={t}
      admins={admins}
      value={reassignSel[t.id] ?? ""}
      onChange={(v) => setReassignSel((cur) => ({ ...cur, [t.id]: v }))}
      busy={reassignBusy === t.id}
      onReassign={() => void reassignTicketTo(t.id)}
    />
  );

  const statsColumns: DataColumn<(typeof statsRows)[number]>[] = [
    { key: "admin", label: "Admin", render: (s) => s.adminName },
    {
      key: "open",
      label: "Open",
      render: (s) => fmtStaffInt(s.open),
      details: (s) => [["Open", fmtStaffInt(s.open)]],
    },
    {
      key: "answered",
      label: "Answered",
      render: (s) => fmtStaffInt(s.answered),
      details: (s) => [["Answered", fmtStaffInt(s.answered)]],
    },
    {
      key: "closed",
      label: "Closed",
      render: (s) => fmtStaffInt(s.closed),
      details: (s) => [["Closed", fmtStaffInt(s.closed)]],
    },
    {
      key: "unanswered",
      label: "Unanswered",
      render: (s) => fmtStaffInt(s.unanswered),
      details: (s) => [["Unanswered", fmtStaffInt(s.unanswered)]],
    },
    {
      key: "avg",
      label: "Avg first response",
      render: (s) => (s.avgFirstResponseHours === null ? "—" : `${s.avgFirstResponseHours}h`),
      details: (s) => [
        ["Avg first response", s.avgFirstResponseHours === null ? "—" : `${s.avgFirstResponseHours}h`],
      ],
    },
  ];

  const ticketColumns: DataColumn<SupportTicketRow>[] = [
    {
      key: "player",
      label: "Player",
      render: (t) => t.userName,
      sub: (t) => {
        if (!t.userContact) return "—";
        const contact = t.userContact;
        return (
          <MaskedValue
            value={contact}
            kind={contact.includes("@") ? "email" : "phone"}
            label="Player contact"
            onReveal={async () => {
              const r = await api<{ value: { email: string | null; phone: string | null } }>("/api/owner/reveal", {
                method: "POST",
                body: JSON.stringify({ kind: "user-contact", id: t.userId }),
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
      key: "subject",
      label: "Subject",
      render: (t) => t.subject,
      details: (t) => [["Subject", t.subject]],
    },
    {
      key: "admin",
      label: "Admin",
      render: (t) => t.adminName ?? "—",
      details: (t) => [["Admin", t.adminName ?? "—"]],
    },
    {
      key: "status",
      label: "Status",
      render: (t) => <StatusPill status={t.status} />,
      details: (t) => [["Status", <StatusPill key={`st-${t.id}`} status={t.status} />]],
    },
    {
      key: "age",
      label: "Age",
      render: (t) => ageLabel(t.ageHours),
      details: (t) => [["Age", ageLabel(t.ageHours)]],
    },
    {
      key: "reassign",
      label: "Reassign to",
      render: (t) => reassignCell(t),
      details: (t) => [["Reassign to", reassignCell(t)]],
    },
  ];

  return (
    <div>
      <PageHeader title="Support oversight" sub="Open tickets and per-admin stats." />
      <OwnerRangeBar />
      {loading ? (
        <Skeleton lines={5} title />
      ) : err ? (
        <ErrorState text={err} onRetry={reload} />
      ) : support ? (
        <>
          <div className="st-kpi-grid">
            <KpiTile label="Open" value={fmtStaffInt(support.totals.open)} />
            <KpiTile label="Answered" value={fmtStaffInt(support.totals.answered)} />
            <KpiTile label="Closed" value={fmtStaffInt(support.totals.closed)} />
            <KpiTile label="Unanswered" value={fmtStaffInt(support.totals.unanswered)} />
          </div>
          <Card title="Per-admin stats">
            {statsRows.length === 0 ? (
              <EmptyState title="No support stats yet." text="No admin has handled a ticket yet." />
            ) : (
              <DataTable
                viewId="owner-support-stats"
                columns={statsColumns}
                rows={statsPageRows}
                total={statsRows.length}
                page={safeStatsPage}
                pageSize={statsPageSize}
                onPageChange={setStatsPage}
                loading={false}
                error={null}
                emptyTitle="No support stats yet."
                emptyText="No admin has handled a ticket yet."
              />
            )}
          </Card>
          <Card title="Open tickets">
            {adminsErr ? (
              <p role="alert">The admin list failed to load — reassign is unavailable until it loads.</p>
            ) : null}
            <DataTable<SupportTicketRow>
              viewId="owner-support-tickets"
              columns={ticketColumns}
              rows={ticketsPageRows}
              total={tickets.length}
              page={safeTicketsPage}
              pageSize={ticketsPageSize}
              onPageChange={setTicketsPage}
              loading={false}
              error={null}
              emptyTitle="No open tickets."
              emptyText="Every ticket is answered or closed."
            />
          </Card>
        </>
      ) : null}
    </div>
  );
}
