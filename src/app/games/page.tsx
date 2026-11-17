// Games page — all 31 games as horizontally scrollable rows, grouped by
// category (round 11). A category filter shows that one row; All / Cash /
// Coins / search group the survivors into their rows. The balance is a
// link to the wallet page. Search reads ?q= from the header search.

"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import GameTile from "../../components/GameTile";
import { GAMES_PAGE_GAMES, TILE_GAMES, type TileGame } from "../../lib/tiles";
import { useStore } from "../../lib/store";
import { fmtMoney, fmtCoins } from "../../lib/api";

type Filter = "all" | "cash" | "coins" | "crash" | "table" | "arcade" | "live" | "beginner" | "slots";

// One row per game: crash and live/table win over slots and beginner, so
// a game appears in exactly one row. (Row counts follow the live catalogue;
// do not hardcode a total here — the catalogue grows.)
function primaryCategory(g: TileGame): string {
  const m = g.meta ?? ({} as TileGame["meta"]);
  if (m.tag === "crash") return "crash";
  if (m.tag === "live") return "live";
  if (m.tag === "table") return "table";
  if (m.slots) return "slots";
  if (m.beginner) return "beginner";
  return "arcade";
}

const ROWS: { key: string; label: string }[] = [
  { key: "beginner", label: "Beginner" },
  { key: "crash", label: "Crash" },
  { key: "slots", label: "Slots" },
  { key: "table", label: "Table" },
  { key: "arcade", label: "Arcade" },
  { key: "live", label: "Live casino" },
];

// A category filter shows that one row, labelled with the filter's name.
const CATEGORY_FILTERS: Record<string, string> = {
  crash: "Crash",
  table: "Table",
  arcade: "Arcade",
  live: "Live casino",
  slots: "Slots",
  beginner: "Beginner",
};

function GamesInner() {
  const params = useSearchParams();
  const initial = (params.get("filter") as Filter) || "all";
  const [filter, setFilter] = useState<Filter>(["all", "cash", "coins", "crash", "table", "arcade", "live", "beginner", "slots"].includes(initial) ? initial : "all");
  const [q, setQ] = useState(params.get("q") || "");
  // Header nav / search navigate client-side to the same route with a
  // new ?filter= / ?q= — pick those up (the initial useState above only
  // runs on first mount, so a client-side nav would otherwise be ignored).
  useEffect(() => {
    const f = (params.get("filter") as Filter) || "all";
    if (["all", "cash", "coins", "crash", "table", "arcade", "live", "beginner", "slots"].includes(f)) setFilter(f);
    setQ(params.get("q") || "");
  }, [params]);
  const { user, wallet } = useStore();
  // P0 Batch 2 (O9): games the owner hid never render here. The config
  // is public; a failed fetch fails OPEN (all games show) — the server
  // still blocks play on a hidden game, so this is display only.
  const [hiddenSlugs, setHiddenSlugs] = useState<Set<string> | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/games/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!live || !j || !Array.isArray(j.games)) return;
        setHiddenSlugs(new Set(j.games.filter((g: { visible?: boolean }) => g.visible === false).map((g: { slug: string }) => g.slug)));
      })
      .catch(() => { /* fail open — all games show */ });
    return () => { live = false; };
  }, []);

  const list = useMemo(() => {
    return GAMES_PAGE_GAMES.filter((g) => {
      if (hiddenSlugs && hiddenSlugs.has(g.slug)) return false;
      if (filter === "cash" || filter === "coins") { if (g.currency !== filter) return false; }
      // Round 17: a category chip must show exactly the row of that name.
      // The old predicates read the raw tile flags (meta.beginner / meta.tag),
      // so Beginner showed 20 while its row holds 17, and Arcade showed 23
      // while its row holds 4. Route filters through primaryCategory, the
      // same routing the rows use, so chip and row always agree.
      else if (filter === "slots" || filter === "crash" || filter === "table" || filter === "arcade" || filter === "live" || filter === "beginner") { if (primaryCategory(g) !== filter) return false; }
      if (q && !g.name.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [filter, q, hiddenSlugs]);

  const rows = useMemo(() => {
    if (CATEGORY_FILTERS[filter]) {
      return [{ key: filter, label: CATEGORY_FILTERS[filter], games: list }];
    }
    return ROWS.map((r) => ({ ...r, games: list.filter((g) => primaryCategory(g) === r.key) })).filter((r) => r.games.length > 0);
  }, [list, filter]);

  const cash = wallet?.cash ?? user?.cash ?? 0;
  const coins = wallet?.coins ?? user?.coins ?? 0;

  return (
    <main className="gpage">
      <div className="gp-head">
        <div className="gp-bar">
          <div className="wrap gp-bar-in">
            <Link className="gp-back" href="/" aria-label="Back to homepage"><span className="gp-back-coin">←</span></Link>
            <div className="gp-title"><h2>All <em>games</em></h2></div>
            <Link href="/wallet" className="gp-bal" aria-label="Open wallet">{fmtMoney(cash, user?.currency ?? "GHS")} · {fmtCoins(coins)} coins</Link>
          </div>
          <span className="xg-ver" aria-hidden="true">v48</span>
        </div>
        <div className="wrap">
          <div className="gp-filters" role="group" aria-label="Filter games page">
            {(["all", "beginner", "slots", "crash", "table", "arcade", "live", "coins", "cash"] as Filter[]).map((f) => (
              <button key={f} type="button" className="fchip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f === "all" ? "All games" : f === "beginner" ? "Beginner" : f === "slots" ? "Slots" : f === "crash" ? "Crash" : f === "table" ? "Table" : f === "arcade" ? "Arcade" : f === "live" ? "Live casino" : f === "coins" ? "Coins" : "Cash"}
              </button>
            ))}
          </div>
          <div className="gp-search">
            <input type="search" placeholder="Search games…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search games" />
          </div>
          <p className="gp-count">{list.length} of {TILE_GAMES.length} games</p>
        </div>
      </div>
      <div className="wrap">
        {rows.map((r) => (
          <section key={r.key} className="gp-row-sec" aria-label={`${r.label} games`}>
            <h3 className="gp-row-title">{r.label} <span>{r.games.length}</span></h3>
            <div className="gp-row" role="list">
              {r.games.map((g) => (
                <GameTile key={g.slug} g={g} simple />
              ))}
            </div>
          </section>
        ))}
        {list.length === 0 && <p className="gp-empty">No games match that search.</p>}
      </div>
    </main>
  );
}

export default function GamesPage() {
  return (
    <Suspense fallback={<main className="gpage"><div className="wrap"><p>Loading games…</p></div></main>}>
      <GamesInner />
    </Suspense>
  );
}
