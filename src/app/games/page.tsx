// Games page — all 31 games, count says 31, Coins/Cash filter chips,
// search. (v48 games page, as a real route.)

"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import GameTile from "../../components/GameTile";
import { TILE_GAMES } from "../../lib/tiles";
import { useStore } from "../../lib/store";
import { fmtCash, fmtCoins } from "../../lib/api";

type Filter = "all" | "cash" | "coins" | "crash" | "table" | "arcade" | "live" | "beginner";

function GamesInner() {
  const params = useSearchParams();
  const initial = (params.get("filter") as Filter) || "all";
  const [filter, setFilter] = useState<Filter>(["all", "cash", "coins", "crash", "table", "arcade", "live", "beginner"].includes(initial) ? initial : "all");
  const [q, setQ] = useState("");
  const { user, wallet } = useStore();

  const list = useMemo(() => {
    return TILE_GAMES.filter((g) => {
      if (filter === "cash" || filter === "coins") { if (g.currency !== filter) return false; }
      else if (filter === "crash" || filter === "table" || filter === "arcade" || filter === "live") { if (g.meta.tag !== filter) return false; }
      else if (filter === "beginner") { if (!g.meta.beginner) return false; }
      if (q && !g.name.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [filter, q]);

  const cash = wallet?.cash ?? user?.cash ?? 0;
  const coins = wallet?.coins ?? user?.coins ?? 0;

  return (
    <main className="gpage">
      <div className="gp-head">
        <div className="gp-bar">
          <div className="wrap gp-bar-in">
            <Link className="gp-back" href="/" aria-label="Back to homepage"><span className="gp-back-coin">←</span></Link>
            <div className="gp-title"><h2>All <em>games</em></h2><small>{TILE_GAMES.length} games · every one playable</small></div>
            <span className="gp-bal">{fmtCash(cash)} · {fmtCoins(coins)} coins</span>
          </div>
          <span className="xg-ver" aria-hidden="true">v48</span>
        </div>
        <div className="wrap">
          <div className="gp-filters" role="group" aria-label="Filter games page">
            {(["all", "beginner", "crash", "table", "arcade", "live", "coins", "cash"] as Filter[]).map((f) => (
              <button key={f} type="button" className="fchip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f === "all" ? "All games" : f === "beginner" ? "Beginner" : f === "crash" ? "Crash" : f === "table" ? "Table" : f === "arcade" ? "Arcade" : f === "live" ? "Live casino" : f === "coins" ? "Coins" : "Cash"}
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
        <div className="games gp-grid">
          {list.map((g) => (
            <GameTile key={g.slug} g={g} />
          ))}
        </div>
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
