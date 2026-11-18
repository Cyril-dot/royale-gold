// Owner Tournaments & jackpots (Phase 2) — split out of the old one-page owner panel
// (src/app/owner/legacy/page.tsx). Same sections, same endpoints, same
// behaviour — now its own route, loading only its own data.
"use client";

import { useCallback, useEffect, useState } from "react";
import { api, fmtMoney } from "../../../../lib/api";
import { ALL_GAMES } from "../../../../lib/games";
import { useStore } from "../../../../lib/store";
import { useOwner } from "../../../../components/owner/OwnerContext";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";
import { JackpotPayForm } from "../../../../components/owner/JackpotPayForm";

export default function OwnerTournamentsPage() {
  const { user, toast } = useStore();
  const { fiat } = useOwner();
  // O29: tournaments & jackpots config — ALL tournaments platform-wide
  // (the owner ends any of them) + the jackpot system. The pot is
  // house-funded: contributionPct% of each cash stake in the jackpot's
  // game(s) feeds the pot — never taken from any payout.
  interface OwnerTournamentRow { id: string; name: string; gameSlug: string; gameName: string; startAt: string; endAt: string; prizePool: number; status: string; winnerId: string | null; winnerName: string | null; adminId: string; adminName: string; createdAt: string }
  interface JackpotRow { id: string; name: string; gameSlug: string; gameName: string; seedAmount: number; contributionPct: number; currentPot: number; active: boolean; createdBy: string; createdAt: string }
  const [ownerTournaments, setOwnerTournaments] = useState<OwnerTournamentRow[] | null>(null);
  const [endConfirmId, setEndConfirmId] = useState<string | null>(null);
  const [endBusy, setEndBusy] = useState<string | null>(null);
  const [jackpots, setJackpots] = useState<JackpotRow[] | null>(null);
  const [jkName, setJkName] = useState("");
  const [jkGame, setJkGame] = useState("all");
  const [jkSeed, setJkSeed] = useState("100");
  const [jkPct, setJkPct] = useState("1");
  const [jkBusy, setJkBusy] = useState(false);
  const [jkPayBusy, setJkPayBusy] = useState<string | null>(null);
  const [jkToggleBusy, setJkToggleBusy] = useState<string | null>(null);
  const loadOwnerTournaments = useCallback(async () => {
    try { setOwnerTournaments((await api<{ tournaments: OwnerTournamentRow[] }>("/api/owner/tournaments")).tournaments); } catch { setOwnerTournaments([]); }
  }, []);
  useEffect(() => { if (user) void loadOwnerTournaments(); }, [loadOwnerTournaments, user]);
  const loadJackpots = useCallback(async () => {
    try { setJackpots((await api<{ jackpots: JackpotRow[] }>("/api/owner/jackpots")).jackpots); } catch { setJackpots([]); }
  }, []);
  useEffect(() => { if (user) void loadJackpots(); }, [loadJackpots, user]);
  const endOwnerTournament = async (t: OwnerTournamentRow) => {
    setEndBusy(t.id);
    try {
      const r = await api<{ tournament: { winnerName: string; prizePool: number } }>(`/api/owner/tournaments/${t.id}/end`, { method: "POST", body: JSON.stringify({}) });
      toast(`Tournament ended — ${r.tournament.winnerName} won ${fmtMoney(r.tournament.prizePool, fiat)}`, "win");
      setEndConfirmId(null);
      await loadOwnerTournaments();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not end the tournament", "lose");
    } finally { setEndBusy(null); }
  };
  const createJackpot = async (e: React.FormEvent) => {
    e.preventDefault();
    setJkBusy(true);
    try {
      await api("/api/owner/jackpots", { method: "POST", body: JSON.stringify({ name: jkName.trim(), gameSlug: jkGame, seedAmount: Number(jkSeed), contributionPct: Number(jkPct) }) });
      toast(`Jackpot “${jkName.trim()}” created`, "win");
      setJkName("");
      await loadJackpots();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Jackpot failed", "lose");
    } finally { setJkBusy(false); }
  };
  const payJackpot = async (jackpotId: string, userId: string, reason: string) => {
    setJkPayBusy(jackpotId);
    try {
      const r = await api<{ winner: { name: string }; paid: number }>(`/api/owner/jackpots/${jackpotId}/pay`, { method: "POST", body: JSON.stringify({ userId, reason }) });
      toast(`Paid ${fmtMoney(r.paid, "GHS")} to ${r.winner.name} — pot reset to the seed`, "win");
      await loadJackpots();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Jackpot pay failed", "lose");
    } finally { setJkPayBusy(null); }
  };
  const toggleJackpot = async (j: JackpotRow) => {
    setJkToggleBusy(j.id);
    try {
      await api(`/api/owner/jackpots/${j.id}/toggle`, { method: "POST" });
      toast(`Jackpot “${j.name}” ${j.active ? "paused" : "resumed"}`, "win");
      await loadJackpots();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not toggle the jackpot", "lose");
    } finally { setJkToggleBusy(null); }
  };
  return (
    <div>
      <PageHeader title="Tournaments & jackpots" sub="Tournaments and the jackpot system." />
      <OwnerRangeBar />
      <section className="admin-sec">
      <h3>Tournaments &amp; jackpots</h3>
      {ownerTournaments === null ? <p>Loading tournaments…</p> : ownerTournaments.length === 0 ? (
        <p>No tournaments yet.</p>
      ) : (
        <div className="rg48-twrap">
          <table className="dep-table">
            <thead><tr><th>Tournament</th><th>Game</th><th>Admin</th><th>Status</th><th>Prize pool</th><th>Winner</th><th></th></tr></thead>
            <tbody>
              {ownerTournaments.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td>{t.gameName}</td>
                  <td>{t.adminName}</td>
                  <td>{t.status}</td>
                  <td>{fmtMoney(t.prizePool, fiat)}</td>
                  <td>{t.winnerName ?? "—"}</td>
                  <td>
                    {t.status !== "ended" && (
                      endConfirmId === t.id ? (
                        <button className="btn btn-gold btn-sm" type="button" disabled={endBusy === t.id} onClick={() => void endOwnerTournament(t)}>{endBusy === t.id ? "Ending…" : `Confirm end — pay ${fmtMoney(t.prizePool, fiat)}`}</button>
                      ) : (
                        <button className="btn btn-ghost btn-sm" type="button" onClick={() => setEndConfirmId(t.id)}>End</button>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h4>Jackpots</h4>
      <form className="owner-add ow-form-rows" onSubmit={createJackpot}>
        <div className="pd-adjust-row ow-stack">
          <label>Name
            <input type="text" value={jkName} onChange={(e) => setJkName(e.target.value)} maxLength={60} aria-label="Jackpot name" placeholder="e.g. Golden Hour Jackpot" />
          </label>
          <label>Game
            <select value={jkGame} onChange={(e) => setJkGame(e.target.value)} aria-label="Jackpot game">
              <option value="all">All games</option>
              {ALL_GAMES.map((g) => (<option key={g.slug} value={g.slug}>{g.name}</option>))}
            </select>
          </label>
          <label>Seed amount (GH₵)
            <input type="number" min={0} max={100000} step="0.01" inputMode="decimal" value={jkSeed} onChange={(e) => setJkSeed(e.target.value)} aria-label="Jackpot seed amount in GH₵" />
          </label>
          <label>Contribution (% of each stake)
            <input type="number" min={0} max={50} step="0.1" inputMode="decimal" value={jkPct} onChange={(e) => setJkPct(e.target.value)} aria-label="Jackpot contribution percent" />
          </label>
          <button className="btn btn-gold" type="submit" disabled={jkBusy}>{jkBusy ? "Creating…" : "Create jackpot"}</button>
        </div>
      </form>
      {jackpots === null ? <p>Loading jackpots…</p> : jackpots.length === 0 ? (
        <p>No jackpots yet.</p>
      ) : (
        <div className="ow-games">
          {jackpots.map((j) => (
            <div key={j.id} className="ow-game-row">
              <div className="ow-game-head">
                <b>{j.name}</b>
                <span className="ow-game-cur">{j.gameName}</span>
                <span className="ow-game-mult">Pot {fmtMoney(j.currentPot, "GHS")}</span>
                {j.active ? <span className="ow-game-flag">ACTIVE</span> : <span className="ow-game-flag">PAUSED</span>}
              </div>
              <p className="ow-game-note">Seed {fmtMoney(j.seedAmount, "GHS")} · {j.contributionPct}% of each cash stake feeds the pot · {j.active ? "growing" : "paused — not growing"}.</p>
              <JackpotPayForm jackpot={j} busy={jkPayBusy === j.id} onPay={payJackpot} />
              <div className="pd-adjust-row ow-stack">
                <button className="btn btn-ghost btn-sm" type="button" disabled={jkToggleBusy === j.id} onClick={() => void toggleJackpot(j)}>{jkToggleBusy === j.id ? "…" : j.active ? "Pause" : "Resume"}</button>
              </div>
            </div>
          ))}
        </div>
      )}
      </section>
    </div>
  );
}
