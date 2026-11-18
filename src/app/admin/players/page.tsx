// Admin dashboard — Players list (Phase 5 restyle). Same data source
// as before (segments endpoint + VIP tiers + responsible-gambling list),
// staff-ui throughout: shared DataTable + CardList on phone, masked
// contacts with audited Reveal, segment + VIP filters, search. Rows link
// to the tabbed player detail.
"use client";

import { Suspense, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useStore } from "../../../lib/store";
import { useStaffFetch } from "../../../components/staff-ui/useStaffFetch";
import { PageHeader } from "../../../components/staff-ui/PageHeader";
import { Card } from "../../../components/staff-ui/Card";
import { DataTable, type DataColumn } from "../../../components/staff-ui/DataTable";
import { Badge } from "../../../components/staff-ui/Badge";
import { Chip } from "../../../components/staff-ui/Tabs";
import { Skeleton, ErrorState } from "../../../components/staff-ui/Feedback";
import { AdminContactValue } from "../../../components/admin/AdminReveal";
import { canAccessSection } from "../../../lib/rbac";
import type { PlayerSegmentKey, PlayerSegmentRow, ResponsibleRow } from "../../../lib/admin-client";

const SEGMENTS: { key: PlayerSegmentKey; label: string }[] = [
  { key: "new", label: "New" },
  { key: "active", label: "Active" },
  { key: "dormant", label: "Dormant" },
  { key: "high-roller", label: "High roller" },
  { key: "at-risk", label: "At risk" },
];

interface SegmentsResponse {
  players: PlayerSegmentRow[];
  counts: Record<PlayerSegmentKey, number>;
  total: number;
  scope: { childAdmins: { id: string; name: string }[] };
}

interface VipResponse {
  tiers: { id: string; name: string; minDeposited: number; perks: string[]; sortOrder: number; createdAt: string }[];
  players: { id: string; name: string; contact: string | null; totalDeposited: number; tier: { id: string; name: string; minDeposited: number; perks: string[] } | null }[];
}

export default function AdminPlayersPage() {
  return (
    <Suspense fallback={<Skeleton lines={6} title />}>
      <AdminPlayersInner />
    </Suspense>
  );
}

function AdminPlayersInner() {
  const { user } = useStore();
  const sp = useSearchParams();
  const previewId = sp.get("preview");
  const [q, setQ] = useState("");
  const [segment, setSegment] = useState<PlayerSegmentKey | "">("");
  const [vipFilter, setVipFilter] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const segUrl = useMemo(
    () => (user ? (previewId ? `/api/admin/players/segments?adminId=${previewId}` : "/api/admin/players/segments") : null),
    [user, previewId],
  );
  const vipUrl = useMemo(
    () => (user ? (previewId ? `/api/admin/vip-tiers?adminId=${previewId}` : "/api/admin/vip-tiers") : null),
    [user, previewId],
  );
  const rgUrl = useMemo(
    () => (user ? (previewId ? `/api/admin/players/responsible?adminId=${previewId}` : "/api/admin/players/responsible") : null),
    [user, previewId],
  );
  const { data: seg, err: segErr, loading: segLoading, reload } = useStaffFetch<SegmentsResponse>(segUrl);
  const { data: vip } = useStaffFetch<VipResponse>(vipUrl);
  const { data: rg } = useStaffFetch<{ players: ResponsibleRow[] }>(rgUrl);

  if (!user) return null;
  if (!previewId && !canAccessSection(user, "players")) {
    return (
      <ErrorState
        title="No access to this section."
        text="You do not have access to the Players section. Ask the owner to grant you access from the Owner panel."
      />
    );
  }
  if (segErr) return <ErrorState text={segErr} onRetry={reload} />;
  if (segLoading || !seg) return <Skeleton lines={6} title />;

  const href = (p: string) => (previewId ? `${p}?preview=${previewId}` : p);
  const playerHref = (id: string) => href(`/admin/players/${id}`);
  const tierById = new Map((vip?.players ?? []).map((p) => [p.id, p.tier?.name ?? null]));
  const needle = q.trim().toLowerCase();
  const users = seg.players.filter((u) => {
    if (segment && !u.segments.includes(segment)) return false;
    if (vipFilter && tierById.get(u.id) !== vipFilter) return false;
    if (!needle) return true;
    return [u.name, u.email || "", u.phone || "", u.referralCodeUsed || "", u.tags.join(" ")]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });
  const totalPages = Math.max(1, Math.ceil(users.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = users.slice((safePage - 1) * pageSize, safePage * pageSize);
  const rgPlayers = rg?.players ?? [];

  const segmentLabel = (s: PlayerSegmentKey) => SEGMENTS.find((x) => x.key === s)?.label ?? s;

  const columns: DataColumn<PlayerSegmentRow>[] = [
    {
      key: "player",
      label: "Player",
      render: (u) => u.name,
      sub: (u) => <AdminContactValue userId={u.id} contact={u.email || u.phone} preview={!!previewId} />,
    },
    {
      key: "segments",
      label: "Segments",
      render: (u) =>
        u.segments.length === 0 ? (
          <span>—</span>
        ) : (
          <span>
            {u.segments.map((s) => (
              <Badge key={s} variant={s === "at-risk" ? "warn" : "muted"}>
                {segmentLabel(s)}
              </Badge>
            ))}
          </span>
        ),
      details: (u) => [["Segments", u.segments.map(segmentLabel).join(", ") || "—"]],
    },
    {
      key: "vip",
      label: "VIP",
      render: (u) => tierById.get(u.id) ?? "—",
      details: (u) => [["VIP tier", tierById.get(u.id) ?? "—"]],
    },
    {
      key: "code",
      label: "Code used",
      render: (u) => u.referralCodeUsed ?? "—",
      details: (u) => [["Code used", u.referralCodeUsed ?? "—"]],
    },
    {
      key: "joined",
      label: "Joined",
      render: (u) => new Date(u.createdAt).toLocaleDateString("en-GB"),
      details: (u) => [
        ["Joined", new Date(u.createdAt).toLocaleDateString("en-GB")],
        ...(seg.scope.childAdmins.length > 0 && u.referredByAdminName ? [["Via", u.referredByAdminName] as [string, ReactNode]] : []),
        ...(u.tags.length > 0 ? [["Tags", u.tags.join(", ")] as [string, ReactNode]] : []),
      ],
    },
  ];

  const rgColumns: DataColumn<ResponsibleRow>[] = [
    {
      key: "player",
      label: "Player",
      render: (p) => p.name,
      sub: (p) => p.contact ?? "—",
    },
    {
      key: "type",
      label: "Type",
      render: (p) => (p.selfExcludedUntil ? <Badge variant="danger">Self-excluded</Badge> : <Badge variant="warn">Cool-off</Badge>),
    },
    {
      key: "until",
      label: "Until",
      render: (p) =>
        [
          p.selfExcludedUntil ? `self-excluded until ${new Date(p.selfExcludedUntil).toLocaleDateString("en-GB")}` : "",
          p.coolOffUntil ? `cool-off until ${new Date(p.coolOffUntil).toLocaleDateString("en-GB")}` : "",
        ]
          .filter(Boolean)
          .join(" · ") || "—",
      details: (p) => [
        ["Until", [p.selfExcludedUntil, p.coolOffUntil].filter(Boolean).join(" · ") || "—"],
        ...(p.selfExclusionReason ? [["Reason", p.selfExclusionReason] as [string, ReactNode]] : []),
      ],
    },
  ];

  const filters = [
    { id: "", label: `All (${seg.total})` },
    ...SEGMENTS.map((s) => ({ id: s.key, label: `${s.label} (${seg.counts[s.key]})` })),
  ];

  return (
    <div>
      <PageHeader title="Players" sub="Every referred player in your downline." />
      <Card title={`Referred players (${seg.players.length})`}>
        {seg.scope.childAdmins.length > 0 ? (
          <p>
            Includes your child admins&apos; downlines: {seg.scope.childAdmins.map((c) => c.name).join(", ")}.
          </p>
        ) : null}
        {vip && vip.tiers.length > 0 ? (
          <div className="st-chip-row" role="group" aria-label="Filter by VIP tier">
            <Chip label="All tiers" active={!vipFilter} onClick={() => setVipFilter("")} />
            {vip.tiers.map((t) => (
              <Chip
                key={t.id}
                label={`${t.name} (${vip.players.filter((p) => p.tier?.name === t.name).length})`}
                active={vipFilter === t.name}
                onClick={() => setVipFilter(vipFilter === t.name ? "" : t.name)}
              />
            ))}
          </div>
        ) : null}
        <DataTable<PlayerSegmentRow>
          viewId="admin-players"
          columns={columns}
          rows={pageRows}
          total={users.length}
          page={safePage}
          pageSize={pageSize}
          onPageChange={(p) => setPage(p)}
          search={q}
          onSearchChange={(v) => {
            setQ(v);
            setPage(1);
          }}
          searchPlaceholder="Search by name, email or phone"
          filters={filters}
          activeFilter={segment}
          onFilterChange={(id) => {
            setSegment(id as PlayerSegmentKey | "");
            setPage(1);
          }}
          emptyTitle="No players match."
          emptyText="No players match the current filters."
          rowHref={(u) => playerHref(u.id)}
        />
      </Card>

      <Card title={`Responsible gambling (${rgPlayers.length})`} sub="Players on a break right now — a cool-off or a self-exclusion. While it runs they cannot deposit, play or settle.">
        {rgPlayers.length === 0 ? (
          <p>No players on a break right now.</p>
        ) : (
          <DataTable<ResponsibleRow>
            viewId="admin-players-rg"
            columns={rgColumns}
            rows={rgPlayers}
            total={rgPlayers.length}
            page={1}
            pageSize={10}
            onPageChange={() => undefined}
            rowHref={(p) => playerHref(p.id)}
          />
        )}
      </Card>
    </div>
  );
}
