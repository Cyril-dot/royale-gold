// Owner Games (Phase 4 restyle) — split out of the old one-page owner
// panel (deleted in Phase 4). Same endpoints, same behaviour:
// game list, per-game kill/visibility + economics (OwnerGameRow), and the
// global kill switch. Staff-ui throughout: the global kill goes through
// the shared ConfirmDialog (typed PAUSE to pause; the kill endpoint
// takes no reason, so none is collected), loading / error / empty states
// from Feedback, search via the staff-ui Input. Loads through
// useOwnerFetch — the one client-fetch pattern.
"use client";

import { useMemo, useState } from "react";
import { api } from "../../../lib/api";
import { useStore } from "../../../lib/store";
import { OwnerRangeBar } from "../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../components/staff-ui/PageHeader";
import { Card } from "../../../components/staff-ui/Card";
import { Button } from "../../../components/staff-ui/Button";
import { Badge } from "../../../components/staff-ui/Badge";
import { Input } from "../../../components/staff-ui/Form";
import { ConfirmDialog } from "../../../components/staff-ui/Dialog";
import { Skeleton, EmptyState, ErrorState } from "../../../components/staff-ui/Feedback";
import { OwnerGameRow } from "../../../components/owner/OwnerGameRow";
import { useOwnerFetch } from "../../../components/owner/useOwnerFetch";

interface OwnerGameCfg {
  slug: string;
  name: string;
  currency: string;
  visible: boolean;
  killed: boolean;
  minBet: number | null;
  maxBet: number | null;
  maxPayout: number | null;
  maxMultiplier: number;
  note: string;
}

export default function OwnerGamesPage() {
  const { user, toast } = useStore();
  const [q, setQ] = useState("");
  const [killAction, setKillAction] = useState<"pause" | "resume" | null>(null);
  const [killBusy, setKillBusy] = useState(false);

  const url = useMemo(() => (user ? "/api/games/config" : null), [user]);
  const { data, err, loading, reload } = useOwnerFetch<{ globalKill: boolean; games: OwnerGameCfg[] }>(url);
  const games = useMemo(() => data?.games ?? [], [data]);
  const globalKill = data?.globalKill ?? false;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return games;
    return games.filter((g) => g.name.toLowerCase().includes(needle));
  }, [games, q]);

  const toggleGlobalKill = async () => {
    if (!killAction) return;
    const next = killAction === "pause";
    setKillBusy(true);
    try {
      await api("/api/owner/platform/kill", { method: "POST", body: JSON.stringify({ killed: next }) });
      toast(next ? "All games paused" : "All games resumed", next ? "lose" : "win");
      setKillAction(null);
      reload();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Kill switch failed", "lose");
    } finally {
      setKillBusy(false);
    }
  };

  const saveOwnerGame = async (slug: string, patch: Partial<OwnerGameCfg>) => {
    try {
      await api(`/api/owner/games/${slug}`, { method: "POST", body: JSON.stringify(patch) });
      toast("Game updated", "win");
      reload();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Update failed", "lose");
    }
  };

  return (
    <div>
      <PageHeader title="Games" sub="Visibility, kill switch and per-game economics." />
      <OwnerRangeBar />
      <Card title="Global kill switch" sub="Pauses or resumes every game at once.">
        <div className="st-chip-row" role="group" aria-label="Global kill switch state">
          {globalKill ? (
            <Badge variant="danger">Paused — all games stopped</Badge>
          ) : (
            <Badge variant="ok">All games live</Badge>
          )}
        </div>
        <Button
          variant={globalKill ? "secondary" : "danger"}
          disabled={loading || killBusy}
          onClick={() => setKillAction(globalKill ? "resume" : "pause")}
        >
          {globalKill ? "Resume all games" : "Pause all games"}
        </Button>
      </Card>
      <Card title={`Games (${games.length})`} sub="Search, then edit one game at a time. Saving sends only the fields you changed.">
        <Input
          type="search"
          placeholder="Search games…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search games"
          enterKeyHint="search"
        />
        {loading || (data === null && !err) ? (
          <Skeleton lines={5} />
        ) : err ? (
          <ErrorState text={err} onRetry={reload} />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={games.length === 0 ? "No games yet." : "No games match that search."}
            text={games.length === 0 ? "The game catalogue returned no games." : "Try a different search."}
          />
        ) : (
          <div>
            {filtered.map((g) => (
              <OwnerGameRow key={g.slug} g={g} onSave={saveOwnerGame} />
            ))}
          </div>
        )}
      </Card>
      <ConfirmDialog
        open={killAction !== null}
        onClose={() => setKillAction(null)}
        onConfirm={() => void toggleGlobalKill()}
        title={killAction === "pause" ? "Pause all games" : "Resume all games"}
        body={
          killAction === "pause"
            ? "No one can play any game until you resume them."
            : "All games return to live immediately."
        }
        facts={[{ label: "Current state", value: globalKill ? "Paused" : "Live" }]}
        typedConfirm={killAction === "pause" ? "PAUSE" : undefined}
        confirmLabel={killAction === "pause" ? "Pause all games" : "Resume all games"}
        danger={killAction === "pause"}
        busy={killBusy}
      />
    </div>
  );
}
