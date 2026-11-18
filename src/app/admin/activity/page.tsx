// Admin dashboard — Activity log (Phase 6 restyle). The admin's OWN
// actions only (from the AuditLog table, filtered to this admin) —
// action, target, detail, timestamp, newest first. An admin can never
// see another admin's or the owner's rows. The action filter options
// come from the loaded rows (max 100) — the endpoint has no action list
// of its own, so a rare action outside the latest 100 will not appear
// as a filter until it is in the loaded set.
// The old page's loader called setState synchronously inside an effect
// (a lint error); this version uses the shared useStaffFetch hook.
"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useStore } from "../../../lib/store";
import { useStaffFetch } from "../../../components/staff-ui/useStaffFetch";
import { PageHeader } from "../../../components/staff-ui/PageHeader";
import { Card } from "../../../components/staff-ui/Card";
import { DataTable, type DataColumn, type DataFilter } from "../../../components/staff-ui/DataTable";
import { Skeleton, ErrorState } from "../../../components/staff-ui/Feedback";
import { canAccessSection } from "../../../lib/rbac";
import type { AdminIdentity } from "../../../lib/admin-client";

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
    <Suspense fallback={<Skeleton lines={6} title />}>
      <AdminActivityInner />
    </Suspense>
  );
}

function AdminActivityInner() {
  const { user } = useStore();
  const sp = useSearchParams();
  const previewId = sp.get("preview");
  const [action, setAction] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const ctxUrl = useMemo(() => {
    if (!user) return null;
    return previewId ? `/api/owner/admins/${previewId}/preview` : "/api/admin/context";
  }, [user, previewId]);
  const ctx = useStaffFetch<{ admin: AdminIdentity }>(ctxUrl);
  const listUrl = useMemo(() => {
    if (!user) return null;
    const base = previewId ? `/api/owner/audit-log?actor=${previewId}` : "/api/admin/activity";
    const withLimit = `${base}${base.includes("?") ? "&" : "?"}limit=100`;
    return action ? `${withLimit}&action=${encodeURIComponent(action)}` : withLimit;
  }, [user, previewId, action]);
  const list = useStaffFetch<{ rows: ActivityRow[] }>(listUrl);
  // Memoize the rows array itself: `list.data?.rows ?? []` would be a
  // fresh array every render and defeat the memos below.
  const rows = useMemo(() => list.data?.rows ?? [], [list.data]);

  // Filter options from the loaded rows (the endpoint lists no actions
  // of its own). Counts are the loaded set, not the whole log.
  const actions = useMemo(() => [...new Set(rows.map((r) => r.action))].sort(), [rows]);
  const filters: DataFilter[] = useMemo(
    () => [{ id: "", label: "All actions" }, ...actions.map((a) => ({ id: a, label: a }))],
    [actions],
  );
  const needle = q.trim().toLowerCase();
  const filtered = useMemo(
    () => rows.filter((r) => !needle || `${r.action} ${r.detail ?? ""}`.toLowerCase().includes(needle)),
    [rows, needle],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  if (!user) return null;
  if (!previewId && !canAccessSection(user, "activity")) {
    return (
      <ErrorState
        title="No access to this section."
        text="You do not have access to the Activity section. Ask the owner to grant you access from the Owner panel."
      />
    );
  }

  const withPreview = (href: string) => (previewId ? `${href}?preview=${previewId}` : href);
  const admin = ctx.data?.admin;

  const columns: DataColumn<ActivityRow>[] = [
    {
      key: "action",
      label: "Action",
      render: (r) => <span className="st-mono">{r.action}</span>,
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
      render: (r) =>
        new Date(r.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
      details: (r) => [
        [
          "Time",
          new Date(r.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
        ],
      ],
    },
  ];

  return (
    <div>
      <PageHeader
        title="Activity"
        sub={
          admin
            ? `${admin.name} · your actions only`
            : "Your actions only — the newest first."
        }
        backHref={withPreview("/admin")}
        backLabel="Overview"
      />
      <Card title="Your activity">
        <DataTable<ActivityRow>
          viewId="admin-activity"
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
          searchPlaceholder="Search actions…"
          filters={filters}
          activeFilter={action}
          onFilterChange={(id) => {
            setAction(id);
            setPage(1);
          }}
          loading={list.loading}
          error={list.err}
          onRetry={list.reload}
          emptyTitle="No actions yet."
          emptyText="Actions you take in this panel show up here."
        />
      </Card>
    </div>
  );
}
