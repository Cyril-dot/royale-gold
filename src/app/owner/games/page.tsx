// Owner Games (Phase 2) — split out of the old one-page owner panel
// (src/app/owner/legacy/page.tsx). Same sections, same endpoints, same
// behaviour — now its own route, loading only its own data.
"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { useStore } from "../../../lib/store";
import { OwnerRangeBar } from "../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../components/staff-ui/PageHeader";
import { OwnerGameRow } from "../../../components/owner/OwnerGameRow";

export default function OwnerGamesPage() {
  const { user, toast } = useStore();
  // P0 Batch 2 (O9/O10/O11): game catalogue — visibility, kill switch,
  // and per-game economics for all 46 games.
  interface OwnerGameCfg { slug: string; name: string; currency: string; visible: boolean; killed: boolean; minBet: number | null; maxBet: number | null; maxPayout: number | null; maxMultiplier: number; note: string }
  const [ownerGames, setOwnerGames] = useState<OwnerGameCfg[] | null>(null);
  const [ownerGamesQ, setOwnerGamesQ] = useState("");
  const [globalKill, setGlobalKill] = useState(false);
  const loadOwnerGames = useCallback(async () => {
    try {
      const g = await api<{ globalKill: boolean; games: OwnerGameCfg[] }>("/api/games/config");
      setOwnerGames(g.games);
      setGlobalKill(g.globalKill);
    } catch { setOwnerGames([]); }
  }, []);
  useEffect(() => { if (user) void loadOwnerGames(); }, [loadOwnerGames, user]);
  const toggleGlobalKill = async () => {
    const next = !globalKill;
    if (next && !window.confirm("Pause ALL games? No one can play until you resume them.")) return;
    try {
      await api("/api/owner/platform/kill", { method: "POST", body: JSON.stringify({ killed: next }) });
      toast(next ? "All games paused" : "All games resumed", next ? "lose" : "win");
      await loadOwnerGames();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Kill switch failed", "lose");
    }
  };
  const saveOwnerGame = async (slug: string, patch: Partial<OwnerGameCfg>) => {
    try {
      await api(`/api/owner/games/${slug}`, { method: "POST", body: JSON.stringify(patch) });
      toast("Game updated", "win");
      await loadOwnerGames();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Update failed", "lose");
    }
  };
  return (
    <div>
      <PageHeader title="Games" sub="Visibility, kill switch and per-game economics." />
      <OwnerRangeBar />
      <section className="admin-sec">
      <h3>Games ({ownerGames ? ownerGames.length : "…"})</h3>
      <div className="ow-killbar">
        <div>
          <b>Global kill switch</b>
          <span>{globalKill ? " ALL games are paused right now." : " All games live."}</span>
        </div>
        <button type="button" className={`btn ${globalKill ? "btn-danger" : "btn-ghost"}`} onClick={() => void toggleGlobalKill()}>
          {globalKill ? "Resume all games" : "Pause all games"}
        </button>
      </div>
      <label className="players-search">
        <input type="search" placeholder="Search games…" value={ownerGamesQ} onChange={(e) => setOwnerGamesQ(e.target.value)} aria-label="Search games" />
      </label>
      {ownerGames === null ? <p>Loading games…</p> : (
        <div className="ow-games">
          {ownerGames
            .filter((g) => !ownerGamesQ.trim() || g.name.toLowerCase().includes(ownerGamesQ.trim().toLowerCase()))
            .map((g) => (
              <OwnerGameRow key={g.slug} g={g} onSave={saveOwnerGame} />
            ))}
          {ownerGames.filter((g) => !ownerGamesQ.trim() || g.name.toLowerCase().includes(ownerGamesQ.trim().toLowerCase())).length === 0 && (
            <p>No games match that search.</p>
          )}
        </div>
      )}
      </section>
    </div>
  );
}
