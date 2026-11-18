// Admin dashboard — CRM campaigns (Phase 6 restyle). An admin's named
// message to all their players, one segment, or hand-picked players.
// The recipient count is previewed from the real tables BEFORE the
// campaign is created or sent (same resolver as the send, so the number
// shown is the number that gets the message). Sending creates one
// in-app Notification row per recipient (in-app only — no email, SMS or
// push) + an AuditLog "campaign.send" row. A campaign sends ONCE — no
// resend, no edit after sending. Send goes through the shared
// ConfirmDialog; it takes no reason — the endpoint cannot record one.
"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useStore } from "../../../lib/store";
import { api } from "../../../lib/api";
import { useStaffFetch } from "../../../components/staff-ui/useStaffFetch";
import { PageHeader } from "../../../components/staff-ui/PageHeader";
import { Card } from "../../../components/staff-ui/Card";
import { DataTable, type DataColumn } from "../../../components/staff-ui/DataTable";
import { StatusPill } from "../../../components/staff-ui/Badge";
import { ConfirmDialog } from "../../../components/staff-ui/Dialog";
import { Button } from "../../../components/staff-ui/Button";
import { Input, Select, FormField } from "../../../components/staff-ui/Form";
import { Segmented } from "../../../components/staff-ui/Tabs";
import { Skeleton, ErrorState } from "../../../components/staff-ui/Feedback";
import { AdminContactValue } from "../../../components/admin/AdminReveal";
import { canAccessSection } from "../../../lib/rbac";
import type { CampaignRow, PlayerSegmentRow } from "../../../lib/admin-client";

const SEGMENT_OPTIONS = [
  { key: "new", label: "New" },
  { key: "active", label: "Active" },
  { key: "dormant", label: "Dormant" },
  { key: "high-roller", label: "High roller" },
  { key: "at-risk", label: "At risk" },
];

interface SegmentsData {
  players: PlayerSegmentRow[];
  counts: Record<string, number>;
  total: number;
}

export default function AdminCampaignsPage() {
  return (
    <Suspense fallback={<Skeleton lines={6} title />}>
      <AdminCampaignsInner />
    </Suspense>
  );
}

function AdminCampaignsInner() {
  const { user, toast } = useStore();
  const sp = useSearchParams();
  const previewId = sp.get("preview");
  const preview = !!previewId;

  const listUrl = useMemo(() => {
    if (!user) return null;
    return previewId ? `/api/owner/campaigns?adminId=${previewId}` : "/api/admin/campaigns";
  }, [user, previewId]);
  const list = useStaffFetch<{ campaigns: CampaignRow[] }>(listUrl);
  const segUrl = useMemo(() => {
    if (!user) return null;
    return previewId ? `/api/admin/players/segments?adminId=${previewId}` : "/api/admin/players/segments";
  }, [user, previewId]);
  const seg = useStaffFetch<SegmentsData>(segUrl);

  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState<"all" | "segment" | "players">("all");
  const [segment, setSegment] = useState("active");
  const [picked, setPicked] = useState<string[]>([]);
  const [pickerQ, setPickerQ] = useState("");
  const [previewCount, setPreviewCount] = useState<{ count: number; sample: { id: string; name: string; contact: string | null }[] } | null>(null);
  const [previewErr, setPreviewErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmSend, setConfirmSend] = useState<CampaignRow | null>(null);
  const [sendBusy, setSendBusy] = useState(false);

  // The recipient preview — re-resolved from the real tables whenever
  // the audience changes, so the count shown is the count that sends.
  // setState happens only inside the async callback (the shape the
  // lint rule accepts), never synchronously in the effect body.
  useEffect(() => {
    if (previewId) return;
    let live = true;
    const qs = new URLSearchParams({ audience });
    if (audience === "segment") qs.set("segment", segment);
    if (audience === "players") qs.set("players", picked.join(","));
    api<{ count: number; sample: { id: string; name: string; contact: string | null }[] }>(`/api/admin/campaigns/preview?${qs.toString()}`)
      .then((r) => {
        if (live) {
          setPreviewCount(r);
          setPreviewErr("");
        }
      })
      .catch((ex) => {
        if (live) {
          setPreviewCount(null);
          setPreviewErr(ex instanceof Error ? ex.message : "Preview failed");
        }
      });
    return () => {
      live = false;
    };
  }, [previewId, audience, segment, picked]);

  if (!user) return null;
  if (!previewId && !canAccessSection(user, "campaigns")) {
    return (
      <ErrorState
        title="No access to this section."
        text="You do not have access to the Campaigns section. Ask the owner to grant you access from the Owner panel."
      />
    );
  }

  const withPreview = (href: string) => (previewId ? `${href}?preview=${previewId}` : href);
  const campaigns = list.data?.campaigns ?? [];
  const drafts = campaigns.filter((c) => c.status === "draft");
  const sent = campaigns.filter((c) => c.status === "sent");
  const players = seg.data?.players ?? [];
  const needle = pickerQ.trim().toLowerCase();
  const pickerList = players.filter(
    (p) => !needle || [p.name, p.email || "", p.phone || ""].join(" ").toLowerCase().includes(needle),
  );

  const togglePicked = (id: string) => {
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2 || message.trim().length < 2) {
      toast("Write a name and a message first", "lose");
      return;
    }
    if (audience === "players" && picked.length === 0) {
      toast("Pick at least one player", "lose");
      return;
    }
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
      toast(`Draft created — reaches ${previewCount?.count ?? "?"} players`, "win");
      setName("");
      setMessage("");
      setPicked([]);
      list.reload();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Campaign failed", "lose");
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (!confirmSend) return;
    setSendBusy(true);
    try {
      const r = await api<{ campaign: { recipientCount: number } }>(`/api/admin/campaigns/${confirmSend.id}/send`, { method: "POST" });
      toast(`"${confirmSend.name}" sent to ${r.campaign.recipientCount} players`, "win");
      setConfirmSend(null);
      list.reload();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Send failed", "lose");
    } finally {
      setSendBusy(false);
    }
  };

  const draftColumns: DataColumn<CampaignRow>[] = [
    {
      key: "name",
      label: "Draft",
      render: (c) => c.name,
      sub: (c) => `${c.audienceLabel} · created ${new Date(c.createdAt).toLocaleDateString("en-GB")}`,
    },
    {
      key: "recipients",
      label: "Recipients",
      render: (c) => String(c.recipientCount),
      details: (c) => [["Recipients", String(c.recipientCount)]],
    },
    {
      key: "status",
      label: "Status",
      render: () => <StatusPill status="draft" />,
      details: () => [["Status", "draft"]],
    },
  ];
  const sentColumns: DataColumn<CampaignRow>[] = [
    {
      key: "name",
      label: "Campaign",
      render: (c) => c.name,
      sub: (c) =>
        `${c.audienceLabel} · sent ${c.sentAt ? new Date(c.sentAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}`,
    },
    {
      key: "recipients",
      label: "Recipients",
      render: (c) => String(c.recipientCount),
      details: (c) => [["Recipients", String(c.recipientCount)]],
    },
    {
      key: "status",
      label: "Status",
      render: () => <StatusPill status="sent" />,
      details: () => [["Status", "sent"]],
    },
  ];
  const messageExpand = (c: CampaignRow) => <p>{c.message}</p>;

  return (
    <div>
      <PageHeader
        title="CRM campaigns"
        sub="Message your players in-app — all of them, one segment, or hand-picked players. A campaign sends once: no resend, no edit after sending. In-app only — no email, SMS or push."
        backHref={withPreview("/admin")}
        backLabel="Overview"
      />

      {!preview ? (
        <Card title="New campaign">
          <form onSubmit={create}>
            <div className="st-form-row">
              <FormField label="Campaign name" required>
                <Input
                  type="text"
                  placeholder="Campaign name — e.g. Weekend boost"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-label="Campaign name"
                  maxLength={120}
                />
              </FormField>
              <FormField label="Message" required>
                <textarea
                  className="st-input"
                  placeholder="Message — what do your players need to hear?"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  aria-label="Campaign message"
                  rows={3}
                  maxLength={2000}
                />
              </FormField>
            </div>
            <Segmented
              label="Audience"
              value={audience}
              onChange={(id) => setAudience(id as "all" | "segment" | "players")}
              items={[
                { id: "all", label: "All my players" },
                { id: "segment", label: "One segment" },
                { id: "players", label: "Hand-picked players" },
              ]}
            />
            {audience === "segment" ? (
              <div style={{ marginTop: 12 }}>
                <FormField label="Segment">
                  <Select value={segment} onChange={(e) => setSegment(e.target.value)} aria-label="Segment">
                    {SEGMENT_OPTIONS.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label} ({seg.data?.counts[s.key] ?? 0})
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
            ) : null}
            {audience === "players" ? (
              <div style={{ marginTop: 12 }}>
                <FormField label="Search players to pick">
                  <Input
                    type="search"
                    placeholder="Search players to pick"
                    value={pickerQ}
                    onChange={(e) => setPickerQ(e.target.value)}
                    aria-label="Search players"
                  />
                </FormField>
                <div>
                  {pickerList.length === 0 ? (
                    <p>No players match.</p>
                  ) : (
                    pickerList.map((p) => (
                      <label key={p.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 0" }}>
                        <input type="checkbox" checked={picked.includes(p.id)} onChange={() => togglePicked(p.id)} />
                        <span>
                          <b>{p.name}</b>{" "}
                          <AdminContactValue userId={p.id} contact={p.email || p.phone} preview={preview} />
                        </span>
                      </label>
                    ))
                  )}
                </div>
                <p>{picked.length} picked.</p>
              </div>
            ) : null}
            {previewErr ? (
              <p className="st-field-error" role="alert">
                {previewErr}
              </p>
            ) : previewCount ? (
              <p>
                Reaches <b>{previewCount.count} {previewCount.count === 1 ? "player" : "players"}</b>
                {previewCount.sample.length > 0
                  ? ` — ${previewCount.sample.map((s) => s.name).join(", ")}${previewCount.count > previewCount.sample.length ? ", …" : ""}`
                  : ""}
                .
              </p>
            ) : (
              <p>Counting recipients…</p>
            )}
            <Button type="submit" loading={busy}>
              Create draft
            </Button>
          </form>
        </Card>
      ) : null}

      <Card title={`Drafts (${drafts.length})`}>
        <DataTable<CampaignRow>
          viewId="admin-campaigns-drafts"
          columns={draftColumns}
          rows={drafts}
          total={drafts.length}
          page={1}
          pageSize={25}
          onPageChange={() => {}}
          loading={list.loading}
          error={list.err}
          onRetry={list.reload}
          emptyTitle="No drafts."
          emptyText="Create one above — a draft sends once, then it cannot be edited or resent."
          expandable
          expandRender={messageExpand}
          rowActions={
            preview
              ? []
              : [{ label: "Send", onClick: (c) => setConfirmSend(c) }]
          }
        />
      </Card>

      <Card title={`Sent (${sent.length})`} sub="Sent campaigns cannot be resent or edited — create a new one to message again.">
        <DataTable<CampaignRow>
          viewId="admin-campaigns-sent"
          columns={sentColumns}
          rows={sent}
          total={sent.length}
          page={1}
          pageSize={25}
          onPageChange={() => {}}
          loading={list.loading}
          error={list.err}
          onRetry={list.reload}
          emptyTitle="Nothing sent yet."
          emptyText="Sent campaigns show up here."
          expandable
          expandRender={messageExpand}
        />
      </Card>

      <ConfirmDialog
        open={confirmSend !== null}
        onClose={() => setConfirmSend(null)}
        onConfirm={() => void send()}
        title="Send campaign"
        body="This sends once to every recipient's in-app inbox. It cannot be resent, edited or unsent. In-app only — no email, SMS or push."
        facts={
          confirmSend
            ? [
                { label: "Campaign", value: confirmSend.name },
                { label: "Recipients", value: `${confirmSend.recipientCount} ${confirmSend.recipientCount === 1 ? "player" : "players"}` },
                { label: "Audience", value: confirmSend.audienceLabel },
              ]
            : []
        }
        confirmLabel="Send now"
        busy={sendBusy}
      />
    </div>
  );
}
