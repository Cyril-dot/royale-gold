// Owner Tournaments & jackpots (Phase 4 restyle) — split out of the old
// one-page owner panel (deleted in Phase 4). Same endpoints,
// same behaviour, staff-ui throughout: tournaments as a DataTable
// (cards on phone) with search + status filter, jackpots as Cards with
// the restyled JackpotPayForm. Ending a tournament is irreversible
// (it pays the prize pool to the leader), so it goes through the
// shared ConfirmDialog — the endpoint takes no reason, so none is
// asked for. Paying a jackpot is confirmed inside JackpotPayForm.
"use client";

import { useMemo, useState } from "react";
import { api } from "../../../../lib/api";
import { ALL_GAMES } from "../../../../lib/games";
import { useStore } from "../../../../lib/store";
import { useOwner } from "../../../../components/owner/OwnerContext";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";
import { Card } from "../../../../components/staff-ui/Card";
import { Button } from "../../../../components/staff-ui/Button";
import { DataTable, type DataColumn, type DataRowAction } from "../../../../components/staff-ui/DataTable";
import { StatusPill, Badge } from "../../../../components/staff-ui/Badge";
import { ConfirmDialog } from "../../../../components/staff-ui/Dialog";
import { FormField, Input, Select } from "../../../../components/staff-ui/Form";
import { Skeleton, ErrorState } from "../../../../components/staff-ui/Feedback";
import { fmtStaffMoney } from "../../../../components/staff-ui/format";
import { useOwnerFetch } from "../../../../components/owner/useOwnerFetch";
import { JackpotPayForm } from "../../../../components/owner/JackpotPayForm";

// O29: tournaments & jackpots config — ALL tournaments platform-wide
// (the owner ends any of them) + the jackpot system. The pot is
// house-funded: contributionPct% of each cash stake in the jackpot's
// game(s) feeds the pot — never taken from any payout.
interface OwnerTournamentRow {
  id: string;
  name: string;
  gameSlug: string;
  gameName: string;
  startAt: string;
  endAt: string;
  prizePool: number;
  status: string;
  winnerId: string | null;
  winnerName: string | null;
  adminId: string;
  adminName: string;
  createdAt: string;
}
interface JackpotRow {
  id: string;
  name: string;
  gameSlug: string;
  gameName: string;
  seedAmount: number;
  contributionPct: number;
  currentPot: number;
  active: boolean;
  createdBy: string;
  createdAt: string;
}

const TOURNAMENT_FILTERS = [
  { id: "", label: "All" },
  { id: "open", label: "Open" },
  { id: "ended", label: "Ended" },
];

export default function OwnerTournamentsPage() {
  const { user, toast } = useStore();
  const { fiat } = useOwner();
  const tournUrl = user ? "/api/owner/tournaments" : null;
  const { data: tournData, err: tournErr, loading: tournLoading, reload: reloadTournaments } =
    useOwnerFetch<{ tournaments: OwnerTournamentRow[] }>(tournUrl);
  const ownerTournaments = useMemo(() => tournData?.tournaments ?? [], [tournData]);
  const jkUrl = user ? "/api/owner/jackpots" : null;
  const { data: jkData, err: jkErr, loading: jkLoading, reload: reloadJackpots } =
    useOwnerFetch<{ jackpots: JackpotRow[] }>(jkUrl);
  const jackpots = jkData?.jackpots ?? [];

  const [endConfirm, setEndConfirm] = useState<OwnerTournamentRow | null>(null);
  const [endBusy, setEndBusy] = useState<string | null>(null);
  const [jkName, setJkName] = useState("");
  const [jkGame, setJkGame] = useState("all");
  const [jkSeed, setJkSeed] = useState("100");
  const [jkPct, setJkPct] = useState("1");
  const [jkBusy, setJkBusy] = useState(false);
  const [jkPayBusy, setJkPayBusy] = useState<string | null>(null);
  const [jkToggleBusy, setJkToggleBusy] = useState<string | null>(null);

  const endOwnerTournament = async (t: OwnerTournamentRow) => {
    setEndBusy(t.id);
    try {
      const r = await api<{ tournament: { winnerName: string; prizePool: number } }>(`/api/owner/tournaments/${t.id}/end`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      toast(`Tournament ended — ${r.tournament.winnerName} won ${fmtStaffMoney(r.tournament.prizePool, fiat)}`, "win");
      setEndConfirm(null);
      reloadTournaments();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not end the tournament", "lose");
    } finally {
      setEndBusy(null);
    }
  };
  const createJackpot = async (e: React.FormEvent) => {
    e.preventDefault();
    setJkBusy(true);
    try {
      await api("/api/owner/jackpots", {
        method: "POST",
        body: JSON.stringify({ name: jkName.trim(), gameSlug: jkGame, seedAmount: Number(jkSeed), contributionPct: Number(jkPct) }),
      });
      toast(`Jackpot “${jkName.trim()}” created`, "win");
      setJkName("");
      reloadJackpots();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Jackpot failed", "lose");
    } finally {
      setJkBusy(false);
    }
  };
  const payJackpot = async (jackpotId: string, userId: string, reason: string) => {
    setJkPayBusy(jackpotId);
    try {
      const r = await api<{ winner: { name: string }; paid: number }>(`/api/owner/jackpots/${jackpotId}/pay`, {
        method: "POST",
        body: JSON.stringify({ userId, reason }),
      });
      toast(`Paid ${fmtStaffMoney(r.paid, "GHS")} to ${r.winner.name} — pot reset to the seed`, "win");
      reloadJackpots();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Jackpot pay failed", "lose");
    } finally {
      setJkPayBusy(null);
    }
  };
  const toggleJackpot = async (j: JackpotRow) => {
    setJkToggleBusy(j.id);
    try {
      await api(`/api/owner/jackpots/${j.id}/toggle`, { method: "POST" });
      toast(`Jackpot “${j.name}” ${j.active ? "paused" : "resumed"}`, "win");
      reloadJackpots();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not toggle the jackpot", "lose");
    } finally {
      setJkToggleBusy(null);
    }
  };

  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ownerTournaments.filter((t) => {
      if (filter === "ended" && t.status !== "ended") return false;
      if (filter === "open" && t.status === "ended") return false;
      if (q && !`${t.name} ${t.gameName} ${t.adminName} ${t.winnerName ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [ownerTournaments, filter, search]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const columns: DataColumn<OwnerTournamentRow>[] = [
    {
      key: "tournament",
      label: "Tournament",
      render: (t) => t.name,
      sub: (t) => t.gameName,
      // NOTE: DataTable's phone CardList only reads `details` from
      // columns AFTER the first — details on the first column never
      // render. Every detail below lives on its own column.
    },
    {
      key: "admin",
      label: "Admin",
      render: (t) => t.adminName,
      details: (t) => [["Admin", t.adminName]],
    },
    {
      key: "status",
      label: "Status",
      render: (t) => <StatusPill status={t.status} />,
      details: (t) => [["Status", t.status]],
    },
    {
      key: "prize",
      label: "Prize pool",
      render: (t) => fmtStaffMoney(t.prizePool, fiat),
      details: (t) => [["Prize pool", fmtStaffMoney(t.prizePool, fiat)]],
    },
    {
      key: "winner",
      label: "Winner",
      render: (t) => t.winnerName ?? "—",
      details: (t) => [["Winner", t.winnerName ?? "—"]],
    },
  ];
  const rowActions: DataRowAction<OwnerTournamentRow>[] = [
    {
      label: "End",
      danger: true,
      onClick: (t) => setEndConfirm(t),
      disabled: (t) => t.status === "ended" || endBusy === t.id,
    },
  ];

  return (
    <div>
      <PageHeader title="Tournaments & jackpots" sub="Tournaments and the jackpot system." />
      <OwnerRangeBar />

      <Card title="Tournaments">
        <DataTable<OwnerTournamentRow>
          viewId="owner-tournaments"
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
          searchPlaceholder="Search tournaments…"
          filters={TOURNAMENT_FILTERS}
          activeFilter={filter}
          onFilterChange={(id) => {
            setFilter(id);
            setPage(1);
          }}
          loading={tournLoading}
          error={tournErr}
          onRetry={reloadTournaments}
          emptyTitle="No tournaments yet."
          emptyText="Tournaments created by admins appear here."
          rowActions={rowActions}
        />
      </Card>

      <Card title="New jackpot" sub="The pot is house-funded: a % of each cash stake in the jackpot's game(s) feeds it — never taken from any payout.">
        <form onSubmit={createJackpot}>
          <FormField label="Name" required>
            <Input
              type="text"
              value={jkName}
              onChange={(e) => setJkName(e.target.value)}
              maxLength={60}
              aria-label="Jackpot name"
              placeholder="e.g. Golden Hour Jackpot"
              required
            />
          </FormField>
          <FormField label="Game">
            <Select value={jkGame} onChange={(e) => setJkGame(e.target.value)} aria-label="Jackpot game">
              <option value="all">All games</option>
              {ALL_GAMES.map((g) => (
                <option key={g.slug} value={g.slug}>
                  {g.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Seed amount (GH₵)">
            <Input
              type="number"
              min={0}
              max={100000}
              step="0.01"
              inputMode="decimal"
              value={jkSeed}
              onChange={(e) => setJkSeed(e.target.value)}
              aria-label="Jackpot seed amount in GH₵"
            />
          </FormField>
          <FormField label="Contribution (% of each stake)">
            <Input
              type="number"
              min={0}
              max={50}
              step="0.1"
              inputMode="decimal"
              value={jkPct}
              onChange={(e) => setJkPct(e.target.value)}
              aria-label="Jackpot contribution percent"
            />
          </FormField>
          <Button variant="primary" type="submit" loading={jkBusy}>
            Create jackpot
          </Button>
        </form>
      </Card>

      <Card title="Jackpots">
        {jkLoading ? (
          <Skeleton lines={3} />
        ) : jkErr ? (
          <ErrorState text={jkErr} onRetry={reloadJackpots} />
        ) : jackpots.length === 0 ? (
          <p>No jackpots yet.</p>
        ) : (
          jackpots.map((j) => (
            <Card
              key={j.id}
              title={j.name}
              sub={`${j.gameName} · Seed ${fmtStaffMoney(j.seedAmount, "GHS")} · ${j.contributionPct}% of each cash stake feeds the pot · ${j.active ? "growing" : "paused — not growing"}`}
            >
              <p>
                Pot <span className="st-amount">{fmtStaffMoney(j.currentPot, "GHS")}</span>{" "}
                {j.active ? <Badge variant="ok">Active</Badge> : <Badge variant="muted">Paused</Badge>}
              </p>
              <JackpotPayForm jackpot={j} busy={jkPayBusy === j.id} onPay={payJackpot} />
              <Button variant="ghost" size="sm" loading={jkToggleBusy === j.id} onClick={() => void toggleJackpot(j)}>
                {j.active ? "Pause" : "Resume"}
              </Button>
            </Card>
          ))
        )}
      </Card>

      <ConfirmDialog
        open={endConfirm !== null}
        onClose={() => setEndConfirm(null)}
        onConfirm={() => (endConfirm ? void endOwnerTournament(endConfirm) : undefined)}
        title="End tournament"
        body="Ending pays the prize pool to the current leader as a bonus credit and freezes entries. This cannot be undone."
        facts={
          endConfirm
            ? [
                { label: "Tournament", value: endConfirm.name },
                { label: "Game", value: endConfirm.gameName },
                { label: "Prize pool", value: fmtStaffMoney(endConfirm.prizePool, fiat) },
                { label: "Admin", value: endConfirm.adminName },
                { label: "Status", value: endConfirm.status },
              ]
            : []
        }
        confirmLabel="End tournament"
        danger
        busy={endBusy !== null}
      />
    </div>
  );
}
