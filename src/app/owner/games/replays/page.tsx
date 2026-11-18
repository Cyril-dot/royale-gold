// Owner Game replays (Phase 2) — split out of the old one-page owner panel
// (src/app/owner/legacy/page.tsx). Same sections, same endpoints, same
// behaviour — now its own route, loading only its own data.
"use client";

import { useCallback, useEffect, useState } from "react";
import { api, fmtMoney } from "../../../../lib/api";
import { useStore } from "../../../../lib/store";
import { useOwner } from "../../../../components/owner/OwnerContext";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";

export default function OwnerReplaysPage() {
  const { user, toast } = useStore();
  const { fiat } = useOwner();
  // O27: game replays — the 50 most recent GameResult rows + a detail
  // view (the round's outcome + the provably-fair verify for crash
  // rounds). No per-bet event log exists, so a replay shows the
  // outcome + the verify result, not a step-by-step animation.
  interface ReplayRow { id: string; userId: string; userName: string; game: string; gameName: string; currency: string; fiatCurrency: string; stake: number; payout: number; net: number; roundId: string | null; createdAt: string }
  interface ReplayVerify { roundId: string; hash: string; clientSeed: string; nonce: number; finished: boolean; serverSeed?: string; crashPoint?: number; recomputedPoint?: number; pointMatch?: boolean; hashMatch?: boolean }
  interface ReplayDetail { replay: ReplayRow & { userContact: string | null }; verify: ReplayVerify | null }
  const [replays, setReplays] = useState<ReplayRow[] | null>(null);
  const [replayDetail, setReplayDetail] = useState<ReplayDetail | null>(null);
  const [replayBusy, setReplayBusy] = useState<string | null>(null);
  const loadReplays = useCallback(async () => {
    try { setReplays((await api<{ replays: ReplayRow[] }>("/api/owner/replays")).replays); } catch { setReplays([]); }
  }, []);
  useEffect(() => { if (user) void loadReplays(); }, [loadReplays, user]);
  const openReplay = async (id: string) => {
    setReplayBusy(id);
    try { setReplayDetail(await api<ReplayDetail>(`/api/owner/replays/${id}`)); }
    catch (ex) { toast(ex instanceof Error ? ex.message : "Could not open the replay", "lose"); }
    finally { setReplayBusy(null); }
  };
  return (
    <div>
      <PageHeader title="Game replays" sub="The 50 most recent rounds." />
      <OwnerRangeBar />
      <section className="admin-sec">
      <h3>Game replays</h3>
      {replays === null ? <p>Loading replays…</p> : replays.length === 0 ? (
        <p>No rounds yet.</p>
      ) : (
        <>
          <div className="rg48-twrap">
            <table className="dep-table">
              <thead><tr><th>Time</th><th>Player</th><th>Game</th><th>Stake</th><th>Payout</th><th>Net</th><th></th></tr></thead>
              <tbody>
                {replays.map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                    <td>{r.userName}</td>
                    <td>{r.gameName}</td>
                    <td>{r.currency === "coins" ? `${r.stake} coins` : fmtMoney(r.stake, r.fiatCurrency ?? fiat)}</td>
                    <td>{r.currency === "coins" ? `${r.payout} coins` : fmtMoney(r.payout, r.fiatCurrency ?? fiat)}</td>
                    <td>{r.currency === "coins" ? `${r.net > 0 ? "+" : ""}${r.net} coins` : `${r.net > 0 ? "+" : ""}${fmtMoney(r.net, r.fiatCurrency ?? fiat)}`}</td>
                    <td><button className="btn btn-ghost btn-sm" type="button" disabled={replayBusy === r.id} onClick={() => void openReplay(r.id)}>{replayBusy === r.id ? "Opening…" : "View"}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {replayDetail && (
            <div className="ow-game-row">
              <div className="ow-game-head">
                <b>{replayDetail.replay.gameName}</b>
                <span className="ow-game-cur">{replayDetail.replay.userName}{replayDetail.replay.userContact ? ` · ${replayDetail.replay.userContact}` : ""}</span>
                <span className="ow-game-mult">{new Date(replayDetail.replay.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <p className="ow-game-note">Stake {replayDetail.replay.currency === "coins" ? `${replayDetail.replay.stake} coins` : fmtMoney(replayDetail.replay.stake, replayDetail.replay.fiatCurrency ?? fiat)} · Payout {replayDetail.replay.currency === "coins" ? `${replayDetail.replay.payout} coins` : fmtMoney(replayDetail.replay.payout, replayDetail.replay.fiatCurrency ?? fiat)} · Net {replayDetail.replay.currency === "coins" ? `${replayDetail.replay.net} coins` : fmtMoney(replayDetail.replay.net, replayDetail.replay.fiatCurrency ?? fiat)}{replayDetail.replay.roundId ? ` · Round ${replayDetail.replay.roundId.slice(0, 8)}…` : ""}</p>
              {replayDetail.verify ? (
                <p className="ow-game-note">
                  Provably-fair verify: crash point ×{replayDetail.verify.crashPoint} · recomputed ×{replayDetail.verify.recomputedPoint} · point {replayDetail.verify.pointMatch ? "MATCHES ✓" : "DOES NOT MATCH ✗"} · hash {replayDetail.verify.hashMatch ? "MATCHES ✓" : "DOES NOT MATCH ✗"}
                  {replayDetail.verify.finished ? "" : " · Round still live — the seed is revealed only once it finishes."}
                </p>
              ) : (
                <p className="ow-game-note">No provably-fair verify for this round — only crash rounds carry a seed + hash.</p>
              )}
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => setReplayDetail(null)}>Close replay</button>
            </div>
          )}
        </>
      )}
      </section>
    </div>
  );
}
