// Admin dashboard — Tournaments & leaderboards (P2 Batch 1, A27). A
// tournament is a named contest over one game (or all games) in a time
// window, with a GH₵ prize pool paid as a bonus credit to the winner.
// The leaderboard is computed LIVE from GameResult while it runs —
// points = total staked in the window — never stored per bet. Ending
// freezes the final standings and pays the prize once. The admin
// picks the winner from the leaderboard (default rank 1).

"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useStore } from "../../../lib/store";
import { api, fmtCash } from "../../../lib/api";
import { ALL_GAMES } from "../../../lib/games";
import { useAdminContext, useAdminTournaments, useAdminTournament } from "../../../lib/admin-client";
import { canAccessSection } from "../../../lib/rbac";
import { AdminNav, AdminPreviewBanner, AdminLoginPrompt, AdminError, AdminDenied } from "../../../components/AdminNav";

const STATUS_LABEL: Record<string, string> = {
  upcoming: "Upcoming",
  active: "Active",
  closed: "Window closed",
  ended: "Ended",
};

function AdminTournamentsInner() {
  const { user, toast } = useStore();
  const sp = useSearchParams();
  const previewId = sp.get("preview");
  const { ctx, err: ctxErr } = useAdminContext(previewId);
  const { data, err, load } = useAdminTournaments(previewId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: detail, err: detailErr, load: loadDetail } = useAdminTournament(previewId, selectedId);

  const [name, setName] = useState("");
  const [gameSlug, setGameSlug] = useState("all");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [prizePool, setPrizePool] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [winnerId, setWinnerId] = useState("");
  const [endBusy, setEndBusy] = useState(false);

  if (!user) return <AdminLoginPrompt />;
  if (ctxErr) return <AdminError err={ctxErr} />;
  if (!ctx) return <p>Loading admin panel…</p>;
  if (!previewId && !canAccessSection(user, "tournaments")) return <AdminDenied section="tournaments" />;

  const tournaments = data?.tournaments ?? [];
  const playerHref = (id: string) => (previewId ? `/admin/players/${id}?preview=${previewId}` : `/admin/players/${id}`);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const prize = Number(prizePool);
    if (name.trim().length < 2) { toast("Give the tournament a name", "lose"); return; }
    if (!startAt || !endAt) { toast("Give a start and an end date", "lose"); return; }
    if (!Number.isFinite(prize) || prize <= 0) { toast("Prize pool must be above GH₵ 0", "lose"); return; }
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
      await load();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Tournament failed", "lose");
    } finally { setCreateBusy(false); }
  };

  const end = async () => {
    if (!detail) return;
    setEndBusy(true);
    try {
      const r = await api<{ winner: { name: string }; tournament: { prizePool: number } }>(
        `/api/admin/tournaments/${detail.tournament.id}/end`,
        { method: "POST", body: JSON.stringify({ winnerId: winnerId || undefined }) },
      );
      toast(`"${detail.tournament.name}" ended — ${fmtCash(r.tournament.prizePool)} paid to ${r.winner.name}`, "win");
      setWinnerId("");
      await load();
      await loadDetail();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "End failed", "lose");
    } finally { setEndBusy(false); }
  };

  const open = (id: string) => {
    if (selectedId === id) {
      setSelectedId(null);
      return;
    }
    setSelectedId(id);
    setWinnerId("");
  };

  return (
    <>
      {previewId ? <AdminPreviewBanner name={ctx.admin.name} /> : null}
      <div className="rg48-hbar-in">
        <h2>Tourna<em>ments</em></h2>
      </div>
      <p className="rg48-sub">A contest over one game — or all games — in a time window. Points = total staked in the window, read live from real rounds. The prize is paid once, as a bonus credit, when you end the tournament.</p>
      <AdminNav />

      {!previewId && (
        <section className="admin-sec">
          <h3>New tournament</h3>
          <form className="pd-note-form" onSubmit={create}>
            <input type="text" placeholder="Tournament name — e.g. Weekend Coin Flip Cup" value={name} onChange={(e) => setName(e.target.value)} aria-label="Tournament name" maxLength={120} />
            <label className="pd-adjust-reason">Game
              <select value={gameSlug} onChange={(e) => setGameSlug(e.target.value)} aria-label="Game">
                <option value="all">All games</option>
                {ALL_GAMES.map((g) => (
                  <option key={g.slug} value={g.slug}>{g.name} ({g.currency === "cash" ? "GH₵" : "coins"})</option>
                ))}
              </select>
            </label>
            <div className="pd-adjust-row">
              <label>Starts
                <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} aria-label="Starts" required />
              </label>
              <label>Ends
                <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} aria-label="Ends" required />
              </label>
              <label>Prize pool (GH₵)
                <input type="number" min={0} step="0.01" inputMode="decimal" placeholder="0.00" value={prizePool} onChange={(e) => setPrizePool(e.target.value)} aria-label="Prize pool" required />
              </label>
            </div>
            <button className="btn btn-gold" type="submit" disabled={createBusy}>{createBusy ? "Creating…" : "Create tournament"}</button>
          </form>
        </section>
      )}

      <section className="admin-sec">
        <h3>Tournaments ({tournaments.length})</h3>
        {err ? <p className="rg48-err">{err}</p> : null}
        {!data ? (
          <p>Loading tournaments…</p>
        ) : tournaments.length === 0 ? (
          <p>No tournaments yet — create one above.</p>
        ) : (
          <div className="cmp-list">
            {tournaments.map((t) => (
              <article key={t.id} className="cmp-row">
                <div className="cmp-head">
                  <b>{t.name}</b>
                  <span className={`tk-status tk-${t.status === "ended" ? "closed" : t.status === "active" ? "answered" : "open"}`}>{STATUS_LABEL[t.status] ?? t.status}</span>
                </div>
                <p className="rg48-sub">{t.gameName} · {new Date(t.startAt).toLocaleDateString("en-GB")} – {new Date(t.endAt).toLocaleDateString("en-GB")} · Prize {fmtCash(t.prizePool)}{t.winnerName ? ` · Winner: ${t.winnerName}` : ""}</p>
                <button className="btn btn-ghost" type="button" onClick={() => open(t.id)}>
                  {selectedId === t.id ? "Hide leaderboard" : "Leaderboard"}
                </button>
                {selectedId === t.id && (
                  <div className="tn-detail">
                    {detailErr ? <p className="rg48-err">{detailErr}</p> : null}
                    {!detail ? (
                      <p>Loading leaderboard…</p>
                    ) : detail.leaderboard.length === 0 ? (
                      <p>No rounds in this tournament yet — the leaderboard fills as your players stake in the window.</p>
                    ) : (
                      <div className="rg48-twrap">
                        <table className="dep-table">
                          <thead><tr><th>#</th><th>Player</th><th>Staked</th></tr></thead>
                          <tbody>
                            {detail.leaderboard.map((r) => (
                              <tr key={r.userId}>
                                <td>{r.rank}</td>
                                <td><Link href={playerHref(r.userId)}>{r.userName}</Link></td>
                                <td>{fmtCash(r.points)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {detail && detail.tournament.status !== "ended" && !previewId && detail.leaderboard.length > 0 && (
                      <>
                        <label className="pd-adjust-reason">Winner
                          <select value={winnerId} onChange={(e) => setWinnerId(e.target.value)} aria-label="Winner">
                            <option value="">Rank 1 — {detail.leaderboard[0].userName} ({fmtCash(detail.leaderboard[0].points)})</option>
                            {detail.leaderboard.slice(1, 5).map((r) => (
                              <option key={r.userId} value={r.userId}>Rank {r.rank} — {r.userName} ({fmtCash(r.points)})</option>
                            ))}
                          </select>
                        </label>
                        <button className="btn btn-gold" type="button" disabled={endBusy} onClick={() => void end()}>
                          {endBusy ? "Paying…" : `End + pay ${fmtCash(detail.tournament.prizePool)} to the winner`}
                        </button>
                        <p className="rg48-mini">The prize is paid once as a bonus credit, and the final standings are frozen — a tournament ends once.</p>
                      </>
                    )}
                    {detail && detail.tournament.status === "closed" && !previewId && (
                      <p className="rg48-mini">The window has closed and the prize is still unpaid — end it to pay the winner.</p>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

export default function AdminTournamentsPage() {
  return (
    <main className="rg48-page-main rg23 admin-fb">
      <div className="wrap">
        <Suspense fallback={<p>Loading admin panel…</p>}>
          <AdminTournamentsInner />
        </Suspense>
      </div>
    </main>
  );
}
