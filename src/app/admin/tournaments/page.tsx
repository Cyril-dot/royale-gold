// Admin dashboard — Tournaments & leaderboards (Phase 6 restyle). A
// tournament is a named contest over one game (or all games) in a time
// window, with a prize pool paid as a bonus credit to the winner. The
// leaderboard is computed LIVE from GameResult while it runs — points =
// total staked in the window — never stored per bet. Ending freezes the
// final standings and pays the prize once (the prize uses the
// bonus-grant path, so it is audit-logged as a bonus grant). The admin
// picks the winner from the leaderboard (default rank 1). End goes
// through the shared ConfirmDialog; it takes no reason — the endpoint
// accepts only the winner.
"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useStore } from "../../../lib/store";
import { api } from "../../../lib/api";
import { fmtStaffMoney } from "../../../components/staff-ui/format";
import { symbolFor } from "../../../lib/country";
import { ALL_GAMES } from "../../../lib/games";
import { useStaffFetch } from "../../../components/staff-ui/useStaffFetch";
import { PageHeader } from "../../../components/staff-ui/PageHeader";
import { Card } from "../../../components/staff-ui/Card";
import { DataTable, type DataColumn } from "../../../components/staff-ui/DataTable";
import { Badge } from "../../../components/staff-ui/Badge";
import { ConfirmDialog } from "../../../components/staff-ui/Dialog";
import { Button } from "../../../components/staff-ui/Button";
import { Input, Select, FormField } from "../../../components/staff-ui/Form";
import { Skeleton, ErrorState } from "../../../components/staff-ui/Feedback";
import { canAccessSection } from "../../../lib/rbac";
import type { LeaderboardRow, TournamentRow } from "../../../lib/admin-client";

function statusBadge(status: string) {
  if (status === "active") return <Badge variant="paid">Active</Badge>;
  if (status === "upcoming") return <Badge variant="info">Upcoming</Badge>;
  if (status === "closed") return <Badge variant="warn">Window closed</Badge>;
  if (status === "ended") return <Badge variant="muted">Ended</Badge>;
  return <Badge variant="muted">{status}</Badge>;
}

export default function AdminTournamentsPage() {
  return (
    <Suspense fallback={<Skeleton lines={6} title />}>
      <AdminTournamentsInner />
    </Suspense>
  );
}

function AdminTournamentsInner() {
  const { user, toast } = useStore();
  const sp = useSearchParams();
  const previewId = sp.get("preview");
  const preview = !!previewId;
  const fiat = user?.currency ?? "GHS";

  const listUrl = useMemo(() => {
    if (!user) return null;
    return previewId ? `/api/owner/tournaments?adminId=${previewId}` : "/api/admin/tournaments";
  }, [user, previewId]);
  const list = useStaffFetch<{ tournaments: TournamentRow[] }>(listUrl);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detailUrl = useMemo(() => {
    if (!user || !selectedId) return null;
    return previewId ? `/api/owner/tournaments/${selectedId}` : `/api/admin/tournaments/${selectedId}`;
  }, [user, previewId, selectedId]);
  const detail = useStaffFetch<{ tournament: TournamentRow; leaderboard: LeaderboardRow[] }>(detailUrl);

  const [name, setName] = useState("");
  const [gameSlug, setGameSlug] = useState("all");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [prizePool, setPrizePool] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [winnerId, setWinnerId] = useState("");
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [endBusy, setEndBusy] = useState(false);

  if (!user) return null;
  if (!previewId && !canAccessSection(user, "tournaments")) {
    return (
      <ErrorState
        title="No access to this section."
        text="You do not have access to the Tournaments section. Ask the owner to grant you access from the Owner panel."
      />
    );
  }

  const withPreview = (href: string) => (previewId ? `${href}?preview=${previewId}` : href);
  const playerHref = (id: string) => withPreview(`/admin/players/${id}`);
  const tournaments = list.data?.tournaments ?? [];
  const t = detail.data?.tournament;
  const leaderboard = detail.data?.leaderboard ?? [];

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const prize = Number(prizePool);
    if (name.trim().length < 2) {
      toast("Give the tournament a name", "lose");
      return;
    }
    if (!startAt || !endAt) {
      toast("Give a start and an end date", "lose");
      return;
    }
    if (!Number.isFinite(prize) || prize <= 0) {
      toast(`Prize pool must be above ${symbolFor(fiat)} 0`, "lose");
      return;
    }
    setCreateBusy(true);
    try {
      await api("/api/admin/tournaments", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), gameSlug, startAt, endAt, prizePool: prize }),
      });
      toast(`Tournament "${name.trim()}" created`, "win");
      setName("");
      setGameSlug("all");
      setStartAt("");
      setEndAt("");
      setPrizePool("");
      list.reload();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Tournament failed", "lose");
    } finally {
      setCreateBusy(false);
    }
  };

  const end = async () => {
    if (!t) return;
    setEndBusy(true);
    try {
      const r = await api<{ winner: { name: string }; tournament: { prizePool: number } }>(
        `/api/admin/tournaments/${t.id}/end`,
        { method: "POST", body: JSON.stringify({ winnerId: winnerId || undefined }) },
      );
      toast(`"${t.name}" ended — ${fmtStaffMoney(r.tournament.prizePool, fiat)} paid to ${r.winner.name}`, "win");
      setWinnerId("");
      setConfirmEnd(false);
      list.reload();
      detail.reload();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "End failed", "lose");
    } finally {
      setEndBusy(false);
    }
  };

  const open = (id: string) => {
    if (selectedId === id) {
      setSelectedId(null);
      return;
    }
    setSelectedId(id);
    setWinnerId("");
  };

  const columns: DataColumn<TournamentRow>[] = [
    {
      key: "name",
      label: "Tournament",
      render: (row) => row.name,
      sub: (row) =>
        `${row.gameName} · ${new Date(row.startAt).toLocaleDateString("en-GB")} – ${new Date(row.endAt).toLocaleDateString("en-GB")}`,
    },
    {
      key: "status",
      label: "Status",
      render: (row) => statusBadge(row.status),
      details: (row) => [["Status", row.status]],
    },
    {
      key: "prize",
      label: "Prize",
      render: (row) => fmtStaffMoney(row.prizePool, fiat),
      details: (row) => [["Prize", fmtStaffMoney(row.prizePool, fiat)]],
    },
    {
      key: "winner",
      label: "Winner",
      render: (row) => row.winnerName ?? "—",
      details: (row) => [["Winner", row.winnerName ?? "—"]],
    },
  ];

  const boardColumns: DataColumn<LeaderboardRow>[] = [
    {
      key: "player",
      label: "Player",
      render: (r) => r.userName,
      sub: (r) => `Rank ${r.rank}`,
    },
    {
      key: "rank",
      label: "#",
      render: (r) => String(r.rank),
      details: (r) => [["Rank", String(r.rank)]],
    },
    {
      key: "staked",
      label: "Staked",
      render: (r) => fmtStaffMoney(r.points, r.fiatCurrency ?? fiat),
      details: (r) => [["Staked", fmtStaffMoney(r.points, r.fiatCurrency ?? fiat)]],
    },
  ];

  return (
    <div>
      <PageHeader
        title="Tournaments"
        sub="A contest over one game — or all games — in a time window. Points = total staked in the window, read live from real rounds. The prize is paid once, as a bonus credit, when you end the tournament."
        backHref={withPreview("/admin")}
        backLabel="Overview"
      />

      {!preview ? (
        <Card title="New tournament">
          <form onSubmit={create}>
            <div className="st-form-row">
              <FormField label="Tournament name" required>
                <Input
                  type="text"
                  placeholder="Tournament name — e.g. Weekend Coin Flip Cup"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-label="Tournament name"
                  maxLength={120}
                />
              </FormField>
              <FormField label="Game">
                <Select value={gameSlug} onChange={(e) => setGameSlug(e.target.value)} aria-label="Game">
                  <option value="all">All games</option>
                  {ALL_GAMES.map((g) => (
                    <option key={g.slug} value={g.slug}>
                      {g.name} ({g.currency === "cash" ? symbolFor(fiat) : "coins"})
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
            <div className="st-form-row st-form-row-3">
              <FormField label="Starts" required>
                <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} aria-label="Starts" required />
              </FormField>
              <FormField label="Ends" required>
                <Input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} aria-label="Ends" required />
              </FormField>
              <FormField label={`Prize pool (${symbolFor(fiat)})`} required>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={prizePool}
                  onChange={(e) => setPrizePool(e.target.value)}
                  aria-label="Prize pool"
                  required
                />
              </FormField>
            </div>
            <Button type="submit" loading={createBusy}>
              Create tournament
            </Button>
          </form>
        </Card>
      ) : null}

      <Card title={`Tournaments (${tournaments.length})`}>
        <DataTable<TournamentRow>
          viewId="admin-tournaments"
          columns={columns}
          rows={tournaments}
          total={tournaments.length}
          page={1}
          pageSize={25}
          onPageChange={() => {}}
          loading={list.loading}
          error={list.err}
          onRetry={list.reload}
          emptyTitle="No tournaments yet."
          emptyText="Create one above — a contest over one game, or all games, in a time window."
          expandable
          expandedId={selectedId}
          onExpandedChange={(id) => {
            if (id) open(id);
            else setSelectedId(null);
          }}
          expandRender={(row) => {
            // The detail fetch is keyed to the expanded row; while the new
            // row's detail loads, the previous row's data is still cached
            // — never render it under the wrong tournament.
            const isCurrent = detail.data?.tournament.id === row.id;
            const board = isCurrent ? detail.data!.leaderboard : [];
            return (
            <div>
              {detail.err ? (
                <p className="st-field-error" role="alert">
                  {detail.err}
                </p>
              ) : detail.loading || !isCurrent || !detail.data ? (
                <p>Loading leaderboard…</p>
              ) : board.length === 0 ? (
                <p>No rounds in this tournament yet — the leaderboard fills as your players stake in the window.</p>
              ) : (
                <DataTable<LeaderboardRow & { id: string }>
                  viewId={`admin-tournament-${row.id}`}
                  columns={boardColumns as DataColumn<LeaderboardRow & { id: string }>[]}
                  rows={board.map((r) => ({ ...r, id: r.userId }))}
                  total={board.length}
                  page={1}
                  pageSize={10}
                  onPageChange={() => {}}
                  emptyTitle="No rounds yet."
                  emptyText="The leaderboard fills as your players stake in the window."
                  rowHref={(r) => playerHref(r.userId)}
                />
              )}
              {isCurrent && detail.data && t && t.status !== "ended" && !preview && board.length > 0 ? (
                <div style={{ marginTop: 12 }}>
                  <FormField label="Winner">
                    <Select value={winnerId} onChange={(e) => setWinnerId(e.target.value)} aria-label="Winner">
                      <option value="">
                        Rank 1 — {board[0].userName} ({fmtStaffMoney(board[0].points, board[0].fiatCurrency ?? fiat)})
                      </option>
                      {board.slice(1, 5).map((r) => (
                        <option key={r.userId} value={r.userId}>
                          Rank {r.rank} — {r.userName} ({fmtStaffMoney(r.points, r.fiatCurrency ?? fiat)})
                        </option>
                      ))}
                    </Select>
                  </FormField>
                  <Button loading={endBusy} onClick={() => setConfirmEnd(true)}>
                    {`End + pay ${fmtStaffMoney(t.prizePool, fiat)} to the winner`}
                  </Button>
                  <p>The prize is paid once as a bonus credit, and the final standings are frozen — a tournament ends once.</p>
                </div>
              ) : null}
              {isCurrent && detail.data && t && t.status === "closed" && !preview ? (
                <p>The window has closed and the prize is still unpaid — end it to pay the winner.</p>
              ) : null}
            </div>
            );
          }}
        />
      </Card>

      <ConfirmDialog
        open={confirmEnd}
        onClose={() => setConfirmEnd(false)}
        onConfirm={() => void end()}
        title="End tournament + pay prize"
        body="The prize is paid once as a bonus credit to the winner and the final standings are frozen. A tournament ends once — this cannot be undone."
        facts={
          t
            ? [
                { label: "Tournament", value: t.name },
                { label: "Prize", value: fmtStaffMoney(t.prizePool, fiat) },
                {
                  label: "Winner",
                  value: winnerId
                    ? (leaderboard.find((r) => r.userId === winnerId)?.userName ?? winnerId)
                    : leaderboard[0]
                      ? `Rank 1 — ${leaderboard[0].userName}`
                      : "—",
                },
              ]
            : []
        }
        confirmLabel="End + pay prize"
        busy={endBusy}
      />
    </div>
  );
}
