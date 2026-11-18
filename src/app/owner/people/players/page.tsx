// Owner Player search (Phase 4 restyle) — split out of the old one-page
// owner panel (deleted in Phase 4). Same endpoint, same
// behaviour, staff-ui throughout: the submit search stays (the search
// runs on submit, not on mount), results render in the shared DataTable
// (cards on phone, pagination, client-side filter over the result set),
// contacts are masked with audited reveal, money is per-player currency
// via fmtStaffMoney. The search box itself is unchanged behaviour —
// at least 2 characters, name / email / phone.
"use client";

import { useMemo, useState } from "react";
import { api } from "../../../../lib/api";
import { useStore } from "../../../../lib/store";
import { useOwner } from "../../../../components/owner/OwnerContext";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";
import { Card } from "../../../../components/staff-ui/Card";
import { Button } from "../../../../components/staff-ui/Button";
import { Input, FormField } from "../../../../components/staff-ui/Form";
import { DataTable, type DataColumn } from "../../../../components/staff-ui/DataTable";
import { Badge } from "../../../../components/staff-ui/Badge";
import { MaskedValue } from "../../../../components/staff-ui/MaskedValue";
import { EmptyState } from "../../../../components/staff-ui/Feedback";
import { fmtStaffMoney, fmtStaffInt } from "../../../../components/staff-ui/format";
import type { OwnerSearchPlayer } from "../../../../components/owner/owner-types";

/** One player's masked contact — email or phone, whichever the search
 *  row carries. Reveal calls the audited endpoint (kind "user-contact",
 *  keyed by user id), exactly like the withdrawals queue. */
function PlayerContact({ p }: { p: OwnerSearchPlayer }) {
  const contact = p.email || p.phone;
  if (!contact) return <>—</>;
  const kind = contact.includes("@") ? "email" : "phone";
  return (
    <MaskedValue
      value={contact}
      kind={kind}
      label="Player contact"
      onReveal={async () => {
        const r = await api<{ value: { email: string | null; phone: string | null } }>("/api/owner/reveal", {
          method: "POST",
          body: JSON.stringify({ kind: "user-contact", id: p.id }),
        });
        return kind === "email" ? r.value.email : r.value.phone;
      }}
    />
  );
}

export default function OwnerPlayersPage() {
  const { toast } = useStore();
  const { fiat } = useOwner();
  // P0 Batch 4 (O6): global player search state. These hooks MUST live
  // above the early returns below — hooks after `if (!user) return`
  // change the hook count between renders and crash the page (React #310).
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<OwnerSearchPlayer[] | null>(null);
  const [searchCount, setSearchCount] = useState(0);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchedQ, setSearchedQ] = useState("");
  const [tableQ, setTableQ] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // P0 Batch 4 (O6): global player search — every player platform-wide
  // by name, email, or phone. The search runs on submit, not on mount.
  const runPlayerSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQ.trim();
    if (q.length < 2) { toast("Type at least 2 characters to search", "lose"); return; }
    setSearchBusy(true);
    try {
      const r = await api<{ q: string; count: number; players: OwnerSearchPlayer[] }>(`/api/owner/players/search?q=${encodeURIComponent(q)}`);
      setSearchResults(r.players);
      setSearchCount(r.count);
      setSearchedQ(r.q);
      setTableQ("");
      setPage(1);
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Search failed", "lose");
      setSearchResults([]);
    } finally { setSearchBusy(false); }
  };
  // A referred player opens in the owner's preview of that admin's
  // panel; a player with no referring admin opens directly (the player
  // detail tolerates an owner with no preview).
  const playerDetailHref = (p: OwnerSearchPlayer) =>
    p.referringAdmin ? `/admin/players/${p.id}?preview=${p.referringAdmin.id}` : `/admin/players/${p.id}`;

  const filtered = useMemo(() => {
    const rows = searchResults ?? [];
    const needle = tableQ.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (p) =>
        p.name.toLowerCase().includes(needle) ||
        (p.email ?? "").toLowerCase().includes(needle) ||
        (p.phone ?? "").includes(needle),
    );
  }, [searchResults, tableQ]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const columns: DataColumn<OwnerSearchPlayer>[] = [
    {
      key: "player",
      label: "Player",
      render: (p) => p.name,
      sub: (p) => <PlayerContact p={p} />,
      // NOTE: DataTable's phone CardList only reads `details` from
      // columns AFTER the first — details on the first column never
      // render. Every detail below lives on its own column.
    },
    {
      key: "amount",
      label: "Deposited",
      render: (p) => fmtStaffMoney(p.totalDeposited, p.currency ?? fiat),
      details: (p) => [["Deposited", fmtStaffMoney(p.totalDeposited, p.currency ?? fiat)]],
    },
    {
      key: "cash",
      label: "Cash",
      render: (p) => fmtStaffMoney(p.cash, p.currency ?? fiat),
      details: (p) => [["Cash", fmtStaffMoney(p.cash, p.currency ?? fiat)]],
    },
    {
      key: "coins",
      label: "Coins",
      render: (p) => fmtStaffInt(p.coins),
      details: (p) => [["Coins", fmtStaffInt(p.coins)]],
    },
    {
      key: "role",
      label: "Role",
      render: (p) => <Badge variant={p.role === "admin" ? "info" : "muted"}>{p.role}</Badge>,
      details: (p) => [["Role", p.role]],
    },
    {
      key: "referring",
      label: "Referring admin",
      render: (p) => p.referringAdmin?.name || "—",
      details: (p) => [["Referring admin", p.referringAdmin?.name || "—"]],
    },
    {
      key: "joined",
      label: "Joined",
      render: (p) =>
        p.joinedAt ? new Date(p.joinedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—",
      details: (p) => [
        [
          "Joined",
          p.joinedAt
            ? new Date(p.joinedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
            : "—",
        ],
      ],
    },
  ];

  return (
    <div>
      <PageHeader title="Player search" sub="Every player, by name, email or phone." />
      <OwnerRangeBar />
      <Card title="Player search">
        <form
          onSubmit={runPlayerSearch}
        >
          <FormField label="Search players" hint="Name, email or phone — at least 2 characters.">
            <Input
              type="search"
              placeholder="Search players…"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              aria-label="Search players by name, email or phone"
              enterKeyHint="search"
            />
          </FormField>
          <Button variant="primary" type="submit" loading={searchBusy}>
            {searchBusy ? "Searching…" : "Search"}
          </Button>
        </form>
      </Card>
      {searchResults === null ? (
        <EmptyState
          title="Search for a player."
          text="Results appear here — tap a player to open their detail in the admin panel."
        />
      ) : (
        <Card
          title="Results"
          sub={`${searchCount} ${searchCount === 1 ? "player" : "players"} found for “${searchedQ}”.`}
        >
          <DataTable<OwnerSearchPlayer>
            viewId="owner-player-search"
            columns={columns}
            rows={pageRows}
            total={filtered.length}
            page={safePage}
            pageSize={pageSize}
            onPageChange={(p) => setPage(p)}
            search={tableQ}
            onSearchChange={(v) => { setTableQ(v); setPage(1); }}
            searchPlaceholder="Filter these results…"
            loading={searchBusy}
            emptyTitle={`No players match “${searchedQ}”.`}
            emptyText="Try a different name, email or phone number."
            rowHref={playerDetailHref}
          />
        </Card>
      )}
    </div>
  );
}
