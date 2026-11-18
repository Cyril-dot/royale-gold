// Owner Audit log (Phase 4 restyle) — split out of the old one-page owner
// panel (deleted in Phase 4). Same endpoint, same behaviour,
// staff-ui throughout: DataTable + CardList on phone, staff-ui filters,
// client-side search, and a CSV export of the rows on screen. Audit rows
// carry staff names and action text only — no email/phone fields exist
// to mask — but the export still carries the plain warning: the CSV
// lists names and details exactly as they appear in the log.
"use client";

import { useMemo, useState } from "react";
import { todayStr } from "../../../lib/admin-client";
import { useStore } from "../../../lib/store";
import { OwnerRangeBar } from "../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../components/staff-ui/PageHeader";
import { Card } from "../../../components/staff-ui/Card";
import { DataTable, type DataColumn } from "../../../components/staff-ui/DataTable";
import { FormField, Select, DateRange } from "../../../components/staff-ui/Form";
import { useOwnerFetch } from "../../../components/owner/useOwnerFetch";

// P0 Batch 3 (O14): the global audit log — every admin/owner action,
// append-only. Filter by actor, action, or date.
interface AuditRow {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  action: string;
  targetId: string | null;
  detail: string | null;
  createdAt: string;
}

interface AuditResponse {
  rows: AuditRow[];
  actions: { action: string; count: number }[];
  actors: { id: string; name: string; role: string }[];
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function csvCell(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

export default function OwnerAuditPage() {
  const { user } = useStore();
  const [auditActor, setAuditActor] = useState("");
  const [auditAction, setAuditAction] = useState("");
  const [auditFrom, setAuditFrom] = useState("");
  const [auditTo, setAuditTo] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const url = useMemo(() => {
    if (!user) return null;
    const p = new URLSearchParams();
    if (auditActor) p.set("actor", auditActor);
    if (auditAction) p.set("action", auditAction);
    if (auditFrom) p.set("from", auditFrom);
    if (auditTo) p.set("to", auditTo);
    const qs = p.toString();
    return `/api/owner/audit-log${qs ? `?${qs}` : ""}`;
  }, [user, auditActor, auditAction, auditFrom, auditTo]);
  const { data, err, loading, reload } = useOwnerFetch<AuditResponse>(url);
  const rows = useMemo(() => data?.rows ?? [], [data]);
  // The endpoint has no search param, so search filters the rows it
  // returned (same endpoint, same params as before).
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      `${r.actorName} ${r.action} ${r.detail ?? ""}`.toLowerCase().includes(needle),
    );
  }, [rows, q]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const exportCsv = () => {
    const head = ["Time", "Actor", "Role", "Action", "Detail"];
    const lines = filtered.map((r) =>
      [new Date(r.createdAt).toISOString(), r.actorName, r.actorRole, r.action, r.detail ?? ""]
        .map(csvCell)
        .join(","),
    );
    const blob = new Blob([[head.map(csvCell).join(","), ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `audit-log-${todayStr()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const columns: DataColumn<AuditRow>[] = [
    {
      key: "actor",
      label: "Actor",
      render: (r) => r.actorName,
      sub: (r) => r.actorRole,
      // NOTE: DataTable's phone CardList only reads `details` from
      // columns AFTER the first — details on the first column never
      // render. Every detail below lives on its own column.
    },
    {
      key: "action",
      label: "Action",
      render: (r) => r.action,
      details: (r) => [["Action", r.action]],
    },
    {
      key: "detail",
      label: "Detail",
      render: (r) => r.detail || "—",
      details: (r) => [["Detail", r.detail || "—"]],
    },
    {
      key: "time",
      label: "Time",
      render: (r) => fmtTime(r.createdAt),
      details: (r) => [["Time", fmtTime(r.createdAt)]],
    },
  ];

  return (
    <div>
      <PageHeader title="Audit log" sub="Every admin and owner action, append-only." />
      <OwnerRangeBar />
      <Card title="Audit log">
        <FormField label="Actor">
          <Select
            value={auditActor}
            onChange={(e) => {
              setAuditActor(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by actor"
          >
            <option value="">Everyone</option>
            {(data?.actors ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.role})
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Action">
          <Select
            value={auditAction}
            onChange={(e) => {
              setAuditAction(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by action"
          >
            <option value="">All actions</option>
            {(data?.actions ?? []).map((a) => (
              <option key={a.action} value={a.action}>
                {a.action} ({a.count})
              </option>
            ))}
          </Select>
        </FormField>
        <DateRange
          value={{ from: auditFrom, to: auditTo }}
          onChange={(v) => {
            setAuditFrom(v.from);
            setAuditTo(v.to);
            setPage(1);
          }}
          label="Audit period"
          max={todayStr()}
        />
        <p>
          The CSV lists names and details exactly as they appear in the log — it is not masked,
          so handle it like personal data.
        </p>
        {rows.length >= 100 ? (
          <p>Showing the latest 100 entries — narrow the dates to see older ones.</p>
        ) : null}
        <DataTable<AuditRow>
          viewId="owner-audit-log"
          columns={columns}
          rows={pageRows}
          total={filtered.length}
          page={safePage}
          pageSize={pageSize}
          onPageChange={(p) => setPage(p)}
          search={q}
          onSearchChange={(v) => {
            setQ(v);
            setPage(1);
          }}
          searchPlaceholder="Search actor, action or detail"
          onExportCsv={exportCsv}
          loading={loading}
          error={err}
          onRetry={reload}
          emptyTitle="No actions match."
          emptyText="No rows match the current filters."
        />
      </Card>
    </div>
  );
}
