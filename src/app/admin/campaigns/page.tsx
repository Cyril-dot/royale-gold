// Admin dashboard — CRM campaigns (P2 Batch 1, A25). An admin's named
// message to all their players, one segment, or hand-picked players.
// The recipient count is previewed from the real tables BEFORE the
// campaign is created or sent (same resolver as the send, so the
// number shown is the number that gets the message). Sending creates
// one in-app Notification row per recipient (in-app only — no email,
// SMS or push) + an AuditLog "campaign.send" row. A campaign sends
// ONCE — no resend, no edit after sending.

"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useStore } from "../../../lib/store";
import { api } from "../../../lib/api";
import { useAdminContext, useAdminCampaigns, useAdminSegments } from "../../../lib/admin-client";
import { canAccessSection } from "../../../lib/rbac";
import { AdminNav, AdminPreviewBanner, AdminLoginPrompt, AdminError, AdminDenied } from "../../../components/AdminNav";

const SEGMENT_OPTIONS = [
  { key: "new", label: "New" },
  { key: "active", label: "Active" },
  { key: "dormant", label: "Dormant" },
  { key: "high-roller", label: "High roller" },
  { key: "at-risk", label: "At risk" },
];

function AdminCampaignsInner() {
  const { user, toast } = useStore();
  const sp = useSearchParams();
  const previewId = sp.get("preview");
  const { ctx, err: ctxErr } = useAdminContext(previewId);
  const { data, err, load } = useAdminCampaigns(previewId);
  const { data: seg } = useAdminSegments(previewId);

  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState<"all" | "segment" | "players">("all");
  const [segment, setSegment] = useState("active");
  const [picked, setPicked] = useState<string[]>([]);
  const [pickerQ, setPickerQ] = useState("");
  const [preview, setPreview] = useState<{ count: number; sample: { id: string; name: string; contact: string | null }[] } | null>(null);
  const [previewErr, setPreviewErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [sendBusy, setSendBusy] = useState("");

  // The recipient preview — re-resolved from the real tables whenever
  // the audience changes, so the count shown is the count that sends.
  useEffect(() => {
    if (previewId) return;
    let live = true;
    const qs = new URLSearchParams({ audience });
    if (audience === "segment") qs.set("segment", segment);
    if (audience === "players") qs.set("players", picked.join(","));
    api<{ count: number; sample: { id: string; name: string; contact: string | null }[] }>(`/api/admin/campaigns/preview?${qs.toString()}`)
      .then((r) => { if (live) { setPreview(r); setPreviewErr(""); } })
      .catch((ex) => { if (live) { setPreview(null); setPreviewErr(ex instanceof Error ? ex.message : "Preview failed"); } });
    return () => { live = false; };
  }, [previewId, audience, segment, picked]);

  if (!user) return <AdminLoginPrompt />;
  if (ctxErr) return <AdminError err={ctxErr} />;
  if (!ctx) return <p>Loading admin panel…</p>;
  if (!previewId && !canAccessSection(user, "campaigns")) return <AdminDenied section="campaigns" />;

  const campaigns = data?.campaigns ?? [];
  const drafts = campaigns.filter((c) => c.status === "draft");
  const sent = campaigns.filter((c) => c.status === "sent");
  const players = seg?.players ?? [];
  const needle = pickerQ.trim().toLowerCase();
  const pickerList = players.filter((p) =>
    !needle || [p.name, p.email || "", p.phone || ""].join(" ").toLowerCase().includes(needle),
  );

  const togglePicked = (id: string) => {
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2 || message.trim().length < 2) { toast("Write a name and a message first", "lose"); return; }
    if (audience === "players" && picked.length === 0) { toast("Pick at least one player", "lose"); return; }
    setBusy(true);
    try {
      await api("/api/admin/campaigns", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          message: message.trim(),
          audience,
          ...(audience === "segment" ? { segment } : {}),
          ...(audience === "players" ? { targetPlayerIds: picked } : {}),
        }),
      });
      toast(`Draft created — reaches ${preview?.count ?? "?"} players`, "win");
      setName("");
      setMessage("");
      setPicked([]);
      await load();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Campaign failed", "lose");
    } finally { setBusy(false); }
  };

  const send = async (id: string, cname: string) => {
    setSendBusy(id);
    try {
      const r = await api<{ campaign: { recipientCount: number } }>(`/api/admin/campaigns/${id}/send`, { method: "POST" });
      toast(`"${cname}" sent to ${r.campaign.recipientCount} players`, "win");
      await load();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Send failed", "lose");
    } finally { setSendBusy(""); }
  };

  return (
    <>
      {previewId ? <AdminPreviewBanner name={ctx.admin.name} /> : null}
      <div className="rg48-hbar-in">
        <h2>CRM <em>campaigns</em></h2>
      </div>
      <p className="rg48-sub">Message your players in-app — all of them, one segment, or hand-picked players. A campaign sends once: no resend, no edit after sending. In-app only — no email, SMS or push.</p>
      <AdminNav />

      {!previewId && (
        <section className="admin-sec">
          <h3>New campaign</h3>
          <form className="pd-note-form" onSubmit={create}>
            <input type="text" placeholder="Campaign name — e.g. Weekend boost" value={name} onChange={(e) => setName(e.target.value)} aria-label="Campaign name" maxLength={120} />
            <textarea placeholder="Message — what do your players need to hear?" value={message} onChange={(e) => setMessage(e.target.value)} aria-label="Campaign message" rows={3} maxLength={2000} />
            <div className="money-chips" role="group" aria-label="Audience">
              <button type="button" className={audience === "all" ? "on" : ""} onClick={() => setAudience("all")}>All my players</button>
              <button type="button" className={audience === "segment" ? "on" : ""} onClick={() => setAudience("segment")}>One segment</button>
              <button type="button" className={audience === "players" ? "on" : ""} onClick={() => setAudience("players")}>Hand-picked players</button>
            </div>
            {audience === "segment" && (
              <label className="pd-adjust-reason">Segment
                <select value={segment} onChange={(e) => setSegment(e.target.value)} aria-label="Segment">
                  {SEGMENT_OPTIONS.map((s) => (
                    <option key={s.key} value={s.key}>{s.label} ({seg?.counts[s.key as keyof typeof seg.counts] ?? 0})</option>
                  ))}
                </select>
              </label>
            )}
            {audience === "players" && (
              <>
                <label className="players-search">
                  <input type="search" placeholder="Search players to pick" value={pickerQ} onChange={(e) => setPickerQ(e.target.value)} aria-label="Search players" />
                </label>
                <div className="cmp-picker">
                  {pickerList.length === 0 ? (
                    <p>No players match.</p>
                  ) : (
                    pickerList.map((p) => (
                      <label key={p.id} className="cmp-pick">
                        <input type="checkbox" checked={picked.includes(p.id)} onChange={() => togglePicked(p.id)} />
                        <span><b>{p.name}</b> {p.email || p.phone || ""}</span>
                      </label>
                    ))
                  )}
                </div>
                <p className="rg48-mini">{picked.length} picked.</p>
              </>
            )}
            {previewErr ? (
              <p className="rg48-err">{previewErr}</p>
            ) : preview ? (
              <p className="rg48-sub">
                Reaches <b>{preview.count} {preview.count === 1 ? "player" : "players"}</b>
                {preview.sample.length > 0 ? ` — ${preview.sample.map((s) => s.name).join(", ")}${preview.count > preview.sample.length ? ", …" : ""}` : ""}.
              </p>
            ) : (
              <p className="rg48-sub">Counting recipients…</p>
            )}
            <button className="btn btn-gold" type="submit" disabled={busy}>{busy ? "Creating…" : "Create draft"}</button>
          </form>
        </section>
      )}

      <section className="admin-sec">
        <h3>Drafts ({drafts.length})</h3>
        {err ? <p className="rg48-err">{err}</p> : null}
        {!data ? (
          <p>Loading campaigns…</p>
        ) : drafts.length === 0 ? (
          <p>No drafts — create one above.</p>
        ) : (
          <div className="cmp-list">
            {drafts.map((c) => (
              <article key={c.id} className="cmp-row">
                <div className="cmp-head"><b>{c.name}</b><span className="tk-status tk-open">draft</span></div>
                <p>{c.message}</p>
                <p className="rg48-sub">{c.audienceLabel} · created {new Date(c.createdAt).toLocaleDateString("en-GB")}</p>
                {!previewId && (
                  <button className="btn btn-gold" type="button" disabled={sendBusy === c.id} onClick={() => void send(c.id, c.name)}>
                    {sendBusy === c.id ? "Sending…" : `Send to ${c.recipientCount} ${c.recipientCount === 1 ? "player" : "players"}`}
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="admin-sec">
        <h3>Sent ({sent.length})</h3>
        {sent.length === 0 ? (
          <p>Nothing sent yet.</p>
        ) : (
          <div className="cmp-list">
            {sent.map((c) => (
              <article key={c.id} className="cmp-row">
                <div className="cmp-head"><b>{c.name}</b><span className="tk-status tk-closed">sent</span></div>
                <p>{c.message}</p>
                <p className="rg48-sub">{c.audienceLabel} · sent {c.sentAt ? new Date(c.sentAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}</p>
              </article>
            ))}
          </div>
        )}
        <p className="rg48-mini">Sent campaigns cannot be resent or edited — create a new one to message again.</p>
      </section>
    </>
  );
}

export default function AdminCampaignsPage() {
  return (
    <main className="rg48-page-main rg23 admin-fb">
      <div className="wrap">
        <Suspense fallback={<p>Loading admin panel…</p>}>
          <AdminCampaignsInner />
        </Suspense>
      </div>
    </main>
  );
}
