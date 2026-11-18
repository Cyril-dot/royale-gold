// Admin dashboard — Live players & bets feed (Phase 6 restyle). The 20
// most recent rounds from the admin's downline, newest first, plus the
// count of players active in the last 15 minutes. READ-ONLY: a row
// links to the player detail, nothing acts from the feed. The page
// polls every 15 seconds — no websocket, no server-sent events
// (polling is the design). Pause stops the polling; the game filter
// narrows the loaded feed. Restyle only — no new feed powers.
"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useStore } from "../../../lib/store";
import { fmtStaffMoney } from "../../../components/staff-ui/format";
import { useStaffFetch } from "../../../components/staff-ui/useStaffFetch";
import { PageHeader } from "../../../components/staff-ui/PageHeader";
import { Card, KpiTile } from "../../../components/staff-ui/Card";
import { DataTable, type DataColumn } from "../../../components/staff-ui/DataTable";
import { Button } from "../../../components/staff-ui/Button";
import { Select, FormField } from "../../../components/staff-ui/Form";
import { Skeleton, ErrorState } from "../../../components/staff-ui/Feedback";
import { canAccessSection } from "../../../lib/rbac";
import type { LiveFeedRow } from "../../../lib/admin-client";

export default function AdminLivePage() {
  return (
    <Suspense fallback={<Skeleton lines={6} title />}>
      <AdminLiveInner />
    </Suspense>
  );
}

function AdminLiveInner() {
  const { user } = useStore();
  const sp = useSearchParams();
  const previewId = sp.get("preview");
  const fiat = user?.currency ?? "GHS";
  const [paused, setPaused] = useState(false);
  const [game, setGame] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const feedUrl = useMemo(() => {
    if (!user) return null;
    return previewId ? `/api/owner/live-feed?adminId=${previewId}` : "/api/admin/live-feed";
  }, [user, previewId]);
  const feed = useStaffFetch<{ feed: LiveFeedRow[]; activePlayers: number; fetchedAt: string }>(feedUrl);
  const reloadFeed = feed.reload;

  // Poll every 15 seconds — the feed is a snapshot, not a stream.
  // Pausing stops the interval; the manual Refresh still works.
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => {
      reloadFeed();
    }, 15_000);
    return () => clearInterval(t);
  }, [paused, reloadFeed]);

  // Memoize the rows array itself: `feed.data?.feed ?? []` would be a
  // fresh array every render and defeat the memos below.
  const rows = useMemo(() => feed.data?.feed ?? [], [feed.data]);
  const games = useMemo(() => [...new Set(rows.map((r) => r.gameName))].sort(), [rows]);
  const needle = q.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      rows.filter(
        (r) => (!game || r.gameName === game) && (!needle || `${r.userName} ${r.gameName}`.toLowerCase().includes(needle)),
      ),
    [rows, game, needle],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  if (!user) return null;
  if (!previewId && !canAccessSection(user, "live")) {
    return (
      <ErrorState
        title="No access to this section."
        text="You do not have access to the Live section. Ask the owner to grant you access from the Owner panel."
      />
    );
  }

  const withPreview = (href: string) => (previewId ? `${href}?preview=${previewId}` : href);
  const playerHref = (id: string) => withPreview(`/admin/players/${id}`);

  const money = (r: LiveFeedRow, n: number, signed: boolean) => {
    if (r.currency === "coins") return `${signed && n > 0 ? "+" : ""}${n} coins`;
    const abs = fmtStaffMoney(Math.abs(n), r.fiatCurrency ?? fiat);
    if (!signed) return n < 0 ? `−${abs}` : abs;
    return n > 0 ? `+${abs}` : n < 0 ? `−${abs}` : abs;
  };

  const columns: DataColumn<LiveFeedRow>[] = [
    {
      key: "player",
      label: "Player",
      render: (r) => r.userName,
    },
    {
      key: "game",
      label: "Game",
      render: (r) => r.gameName,
      details: (r) => [["Game", r.gameName]],
    },
    {
      key: "stake",
      label: "Stake",
      render: (r) => money(r, r.stake, false),
      details: (r) => [["Stake", money(r, r.stake, false)]],
    },
    {
      key: "payout",
      label: "Payout",
      render: (r) => money(r, r.payout, false),
      details: (r) => [["Payout", money(r, r.payout, false)]],
    },
    {
      key: "net",
      label: "Net",
      render: (r) => <span className={r.net > 0 ? "st-ok-text" : r.net < 0 ? "st-bad-text" : undefined}>{money(r, r.net, true)}</span>,
      details: (r) => [["Net", money(r, r.net, true)]],
    },
    {
      key: "time",
      label: "Time",
      render: (r) => new Date(r.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      details: (r) => [
        ["Time", new Date(r.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })],
      ],
    },
  ];

  return (
    <div>
      <PageHeader
        title="Live feed"
        sub="The latest rounds from your downline, as they land. Auto-refreshes every 15 seconds — polling, not a live stream. Tap a player to open their detail."
        backHref={withPreview("/admin")}
        backLabel="Overview"
      />
      <Card title="Live now">
        <div className="st-kpi-grid">
          <KpiTile label="Active now (15 min)" value={feed.data ? String(feed.data.activePlayers) : "…"} />
          <KpiTile label="Rounds shown" value={String(filtered.length)} sub={game ? `Filtered: ${game}` : "All games"} />
        </div>
        <div className="st-form-row st-form-row-2">
          <FormField label="Game">
            <Select
              value={game}
              onChange={(e) => {
                setGame(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by game"
            >
              <option value="">All games</option>
              {games.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </Select>
          </FormField>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <Button variant={paused ? "primary" : "secondary"} onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
              {paused ? "Resume" : "Pause"}
            </Button>
            <Button variant="ghost" loading={feed.loading} onClick={() => feed.reload()}>
              Refresh now
            </Button>
          </div>
        </div>
        <p>
          {feed.data
            ? `Last updated ${new Date(feed.data.fetchedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}${paused ? " · Paused" : ""}`
            : "Loading feed…"}
        </p>
        <DataTable<LiveFeedRow>
          viewId="admin-live"
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
          searchPlaceholder="Search player or game…"
          loading={feed.loading}
          error={feed.err}
          onRetry={feed.reload}
          emptyTitle="No rounds from your downline yet."
          emptyText="The feed fills as your players play."
          rowHref={(r) => playerHref(r.userId)}
        />
      </Card>
    </div>
  );
}
