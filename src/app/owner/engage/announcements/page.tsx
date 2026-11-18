// Owner Announcements (Phase 4 restyle) — split out of the old one-page
// owner panel (deleted in Phase 4). Same endpoints, same
// behaviour, staff-ui throughout: create form in a Card, announcements
// as a DataTable (cards on phone) with search + status filter, full
// message in the expandable row. Activate / Deactivate is reversible
// and not money-moving, so it stays a direct action (no confirm).
"use client";

import { useMemo, useState } from "react";
import { api } from "../../../../lib/api";
import { todayStr } from "../../../../lib/admin-client";
import { useStore } from "../../../../lib/store";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";
import { Card } from "../../../../components/staff-ui/Card";
import { Button } from "../../../../components/staff-ui/Button";
import { DataTable, type DataColumn, type DataRowAction } from "../../../../components/staff-ui/DataTable";
import { StatusPill } from "../../../../components/staff-ui/Badge";
import { FormField, Input, Select } from "../../../../components/staff-ui/Form";
import { useOwnerFetch } from "../../../../components/owner/useOwnerFetch";

// O20: announcements & banners (text only — no images, no links).
interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  audience: string;
  active: boolean;
  startsAt: string;
  endsAt: string | null;
  createdByName: string | null;
  createdAt: string;
}

const ANN_FILTERS = [
  { id: "", label: "All" },
  { id: "active", label: "Active" },
  { id: "inactive", label: "Inactive" },
];

function audienceLabel(a: string): string {
  if (a === "players") return "Players only";
  if (a === "admins") return "Admins only";
  return "Everyone";
}

export default function OwnerAnnouncementsPage() {
  const { user, toast } = useStore();
  const url = user ? "/api/owner/announcements" : null;
  const { data, err, loading, reload } = useOwnerFetch<{ announcements: AnnouncementRow[] }>(url);
  const announcements = useMemo(() => data?.announcements ?? [], [data]);

  const [annTitle, setAnnTitle] = useState("");
  const [annBody, setAnnBody] = useState("");
  const [annAudience, setAnnAudience] = useState<"all" | "players" | "admins">("all");
  // Dates start empty and are filled on the first client render (the
  // supported render-phase adjustment — a mount effect is what the
  // lint rule forbids, and a useState initializer calling new Date()
  // would bake the build date into the prerender).
  const [annStartsAt, setAnnStartsAt] = useState("");
  if (annStartsAt === "" && typeof window !== "undefined") setAnnStartsAt(todayStr());
  const [annEndsAt, setAnnEndsAt] = useState("");
  const [annBusy, setAnnBusy] = useState(false);
  const [annToggleBusy, setAnnToggleBusy] = useState<string | null>(null);

  // P1 Batch 4 (O20): create an announcement / toggle one active.
  const createAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    setAnnBusy(true);
    try {
      await api("/api/owner/announcements", {
        method: "POST",
        body: JSON.stringify({
          title: annTitle.trim(),
          body: annBody.trim(),
          audience: annAudience,
          startsAt: annStartsAt || undefined,
          endsAt: annEndsAt || undefined,
        }),
      });
      toast("Announcement created — it shows on the homepage while it is live", "win");
      setAnnTitle("");
      setAnnBody("");
      setAnnEndsAt("");
      reload();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not create announcement", "lose");
    } finally {
      setAnnBusy(false);
    }
  };
  const toggleAnnouncement = async (a: AnnouncementRow) => {
    setAnnToggleBusy(a.id);
    try {
      await api(`/api/owner/announcements/${a.id}/toggle`, { method: "POST" });
      toast(a.active ? "Announcement deactivated — it no longer shows" : "Announcement activated", "win");
      reload();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not toggle announcement", "lose");
    } finally {
      setAnnToggleBusy(null);
    }
  };

  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return announcements.filter((a) => {
      if (filter === "active" && !a.active) return false;
      if (filter === "inactive" && a.active) return false;
      if (q && !`${a.title} ${a.body}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [announcements, filter, search]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const columns: DataColumn<AnnouncementRow>[] = [
    {
      key: "title",
      label: "Title",
      render: (a) => a.title,
      sub: (a) => (a.body.length > 140 ? `${a.body.slice(0, 140)}…` : a.body),
      // NOTE: DataTable's phone CardList only reads `details` from
      // columns AFTER the first — details on the first column never
      // render. Every detail below lives on its own column.
    },
    {
      key: "audience",
      label: "Audience",
      render: (a) => audienceLabel(a.audience),
      details: (a) => [["Audience", audienceLabel(a.audience)]],
    },
    {
      key: "dates",
      label: "Dates",
      render: (a) => `${a.startsAt.slice(0, 10)} to ${a.endsAt ? a.endsAt.slice(0, 10) : "open"}`,
      details: (a) => [["Dates", `${a.startsAt.slice(0, 10)} to ${a.endsAt ? a.endsAt.slice(0, 10) : "open"}`]],
    },
    {
      key: "status",
      label: "Status",
      render: (a) => <StatusPill status={a.active ? "Active" : "Inactive"} />,
      details: (a) => [["Status", a.active ? "Active" : "Inactive"]],
    },
  ];
  const rowActions: DataRowAction<AnnouncementRow>[] = [
    {
      label: "Deactivate",
      onClick: (a) => void toggleAnnouncement(a),
      disabled: (a) => !a.active || annToggleBusy === a.id,
    },
    {
      label: "Activate",
      onClick: (a) => void toggleAnnouncement(a),
      disabled: (a) => a.active || annToggleBusy === a.id,
    },
  ];

  return (
    <div>
      <PageHeader title="Announcements" sub="Banners and announcements." />
      <OwnerRangeBar />
      <Card title="New announcement">
        <form onSubmit={createAnnouncement}>
          <FormField label="Title" required>
            <Input
              type="text"
              placeholder="Title"
              value={annTitle}
              onChange={(e) => setAnnTitle(e.target.value)}
              required
              minLength={1}
              maxLength={120}
            />
          </FormField>
          <FormField label="Message" required>
            <Input
              type="text"
              placeholder="Message"
              value={annBody}
              onChange={(e) => setAnnBody(e.target.value)}
              required
              minLength={1}
              maxLength={1000}
            />
          </FormField>
          <FormField label="Audience">
            <Select
              value={annAudience}
              onChange={(e) => setAnnAudience(e.target.value as "all" | "players" | "admins")}
              aria-label="Audience"
            >
              <option value="all">Everyone</option>
              <option value="players">Players only</option>
              <option value="admins">Admins only</option>
            </Select>
          </FormField>
          <FormField label="From">
            <Input type="date" value={annStartsAt} onChange={(e) => setAnnStartsAt(e.target.value)} aria-label="Start date" />
          </FormField>
          <FormField label="To">
            <Input type="date" value={annEndsAt} onChange={(e) => setAnnEndsAt(e.target.value)} aria-label="End date" />
          </FormField>
          <Button variant="primary" type="submit" loading={annBusy}>
            Create announcement
          </Button>
        </form>
      </Card>

      <Card title="Announcements">
        <DataTable<AnnouncementRow>
          viewId="owner-announcements"
          columns={columns}
          rows={pageRows}
          total={filtered.length}
          page={safePage}
          pageSize={pageSize}
          onPageChange={(p) => setPage(p)}
          search={search}
          onSearchChange={(q) => {
            setSearch(q);
            setPage(1);
          }}
          searchPlaceholder="Search announcements…"
          filters={ANN_FILTERS}
          activeFilter={filter}
          onFilterChange={(id) => {
            setFilter(id);
            setPage(1);
          }}
          loading={loading}
          error={err}
          onRetry={reload}
          emptyTitle="No announcements yet."
          emptyText="Create the first announcement above."
          rowActions={rowActions}
          expandable
          expandRender={(a) => (
            <div>
              <p>{a.body}</p>
              {a.createdByName ? <p>Created by {a.createdByName}.</p> : null}
            </div>
          )}
        />
      </Card>
    </div>
  );
}
