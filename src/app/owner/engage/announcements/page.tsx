// Owner Announcements (Phase 2) — split out of the old one-page owner panel
// (src/app/owner/legacy/page.tsx). Same sections, same endpoints, same
// behaviour — now its own route, loading only its own data.
"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../../../lib/api";
import { todayStr } from "../../../../lib/admin-client";
import { useStore } from "../../../../lib/store";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";

export default function OwnerAnnouncementsPage() {
  const { user, toast } = useStore();
  // P1 Batch 4 (O20–O25): owner platform — announcements, platform
  // settings & branding, KYC/AML settings, support oversight, agent
  // hierarchy, cashier. These hooks MUST live above the early returns
  // below — hooks after `if (!user) return` change the hook count
  // between renders and crash the page (React #310).
  // O20: announcements & banners (text only — no images, no links).
  interface AnnouncementRow { id: string; title: string; body: string; audience: string; active: boolean; startsAt: string; endsAt: string | null; createdByName: string | null; createdAt: string }
  const [announcements, setAnnouncements] = useState<AnnouncementRow[] | null>(null);
  const [annTitle, setAnnTitle] = useState("");
  const [annBody, setAnnBody] = useState("");
  const [annAudience, setAnnAudience] = useState<"all" | "players" | "admins">("all");
  const [annStartsAt, setAnnStartsAt] = useState("");
  const [annEndsAt, setAnnEndsAt] = useState("");
  const [annBusy, setAnnBusy] = useState(false);
  const [annToggleBusy, setAnnToggleBusy] = useState<string | null>(null);
  const loadAnnouncements = useCallback(async () => {
    try {
      const r = await api<{ announcements: AnnouncementRow[] }>("/api/owner/announcements");
      setAnnouncements(r.announcements);
    } catch { setAnnouncements([]); }
  }, []);
  useEffect(() => { if (user) void loadAnnouncements(); }, [loadAnnouncements, user]);
  useEffect(() => { setAnnStartsAt(todayStr()); }, []);

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
      await loadAnnouncements();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not create announcement", "lose");
    } finally { setAnnBusy(false); }
  };
  const toggleAnnouncement = async (a: AnnouncementRow) => {
    setAnnToggleBusy(a.id);
    try {
      await api(`/api/owner/announcements/${a.id}/toggle`, { method: "POST" });
      toast(a.active ? "Announcement deactivated — it no longer shows" : "Announcement activated", "win");
      await loadAnnouncements();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not toggle announcement", "lose");
    } finally { setAnnToggleBusy(null); }
  };
  return (
    <div>
      <PageHeader title="Announcements" sub="Banners and announcements." />
      <OwnerRangeBar />
      <section className="admin-sec">
      <h3>Announcements</h3>
      <form className="owner-add ann-form ow-form" onSubmit={createAnnouncement}>
        <input type="text" placeholder="Title" value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} required minLength={1} maxLength={120} />
        <input type="text" placeholder="Message" value={annBody} onChange={(e) => setAnnBody(e.target.value)} required minLength={1} maxLength={1000} />
        <select value={annAudience} onChange={(e) => setAnnAudience(e.target.value as "all" | "players" | "admins")} aria-label="Audience">
          <option value="all">Everyone</option>
          <option value="players">Players only</option>
          <option value="admins">Admins only</option>
        </select>
        <label>From <input type="date" value={annStartsAt} onChange={(e) => setAnnStartsAt(e.target.value)} /></label>
        <label>To <input type="date" value={annEndsAt} onChange={(e) => setAnnEndsAt(e.target.value)} /></label>
        <button className="btn btn-gold" type="submit" disabled={annBusy}>{annBusy ? "Creating…" : "Create announcement"}</button>
      </form>
      {announcements === null ? <p>Loading announcements…</p> : announcements.length === 0 ? <p>No announcements yet.</p> : (
        <div className="rg48-twrap">
          <table className="dep-table ann-table">
            <thead><tr><th>Title</th><th>Audience</th><th>Dates</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {announcements.map((a) => (
                <tr key={a.id}>
                  <td><b>{a.title}</b><br /><span className="rg48-mini">{a.body}</span></td>
                  <td>{a.audience}</td>
                  <td>{a.startsAt.slice(0, 10)} to {a.endsAt ? a.endsAt.slice(0, 10) : "open"}</td>
                  <td>{a.active ? "Active" : "Inactive"}</td>
                  <td><button type="button" className="btn btn-ghost btn-sm" disabled={annToggleBusy === a.id} onClick={() => void toggleAnnouncement(a)}>{a.active ? "Deactivate" : "Activate"}</button></td>
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
