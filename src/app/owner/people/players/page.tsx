// Owner Player search (Phase 2) — split out of the old one-page owner panel
// (src/app/owner/legacy/page.tsx). Same sections, same endpoints, same
// behaviour — now its own route, loading only its own data.
"use client";

import { useState } from "react";
import { api, fmtMoney } from "../../../../lib/api";
import Link from "next/link";
import { useStore } from "../../../../lib/store";
import { useOwner } from "../../../../components/owner/OwnerContext";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";
import type { OwnerSearchPlayer } from "../../../../components/owner/owner-types";

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
  return (
    <div>
      <PageHeader title="Player search" sub="Every player, by name, email or phone." />
      <OwnerRangeBar />
      <section className="admin-sec" id="ow-sec-player-search">
      <h3>Player search</h3>
      <form className="b4-search" onSubmit={runPlayerSearch}>
        <input type="search" placeholder="Search players…" value={searchQ} onChange={(e) => setSearchQ(e.target.value)} aria-label="Search players by name, email or phone" />
        <button className="btn btn-gold" type="submit" disabled={searchBusy}>{searchBusy ? "Searching…" : "Search"}</button>
      </form>
      {searchResults === null ? null : searchResults.length === 0 ? (
        <p>No players match “{searchedQ}”.</p>
      ) : (
        <>
          <p className="rg48-sub">{searchCount} {searchCount === 1 ? "player" : "players"} found for “{searchedQ}”.</p>
          <div className="rg48-twrap">
            <table className="dep-table">
              <thead><tr><th>Player</th><th>Contact</th><th>Role</th><th>Referring admin</th><th>Deposited</th><th>Cash</th><th>Coins</th></tr></thead>
              <tbody>
                {searchResults.map((p) => (
                  <tr key={p.id}>
                    <td><Link href={playerDetailHref(p)}>{p.name}</Link></td>
                    <td>{p.email || p.phone || "—"}</td>
                    <td>{p.role}</td>
                    <td>{p.referringAdmin?.name || "—"}</td>
                    <td>{fmtMoney(p.totalDeposited, p.currency ?? fiat)}</td>
                    <td>{fmtMoney(p.cash, p.currency ?? fiat)}</td>
                    <td>{p.coins}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      </section>
    </div>
  );
}
