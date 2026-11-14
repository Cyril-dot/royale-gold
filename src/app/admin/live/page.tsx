// Admin dashboard — Live players & bets feed (P2 Batch 1, A28). The 20
// most recent rounds from the admin's downline, newest first, plus the
// count of players active in the last 15 minutes. READ-ONLY: a row
// links to the player detail, nothing acts from the feed. The page
// polls every 15 seconds — no websocket, no server-sent events
// (polling is the design).

"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useStore } from "../../../lib/store";
import { fmtCash } from "../../../lib/api";
import { useAdminContext, useAdminLiveFeed } from "../../../lib/admin-client";
import { canAccessSection } from "../../../lib/rbac";
import { AdminNav, AdminPreviewBanner, AdminLoginPrompt, AdminError, AdminDenied } from "../../../components/AdminNav";

function AdminLiveInner() {
  const { user } = useStore();
  const sp = useSearchParams();
  const previewId = sp.get("preview");
  const { ctx, err: ctxErr } = useAdminContext(previewId);
  const { data, err, load } = useAdminLiveFeed(previewId);

  // Poll every 15 seconds — the feed is a snapshot, not a stream.
  useEffect(() => {
    const t = setInterval(() => { void load(); }, 15_000);
    return () => clearInterval(t);
  }, [load]);

  if (!user) return <AdminLoginPrompt />;
  if (ctxErr) return <AdminError err={ctxErr} />;
  if (!ctx) return <p>Loading admin panel…</p>;
  if (!previewId && !canAccessSection(user, "live")) return <AdminDenied section="live" />;

  const feed = data?.feed ?? [];
  const playerHref = (id: string) => (previewId ? `/admin/players/${id}?preview=${previewId}` : `/admin/players/${id}`);

  return (
    <>
      {previewId ? <AdminPreviewBanner name={ctx.admin.name} /> : null}
      <div className="rg48-hbar-in">
        <h2>Live <em>feed</em></h2>
      </div>
      <p className="rg48-sub">The latest rounds from your downline, as they land. Auto-refreshes every 15 seconds — polling, not a live stream. Tap a player to open their detail.</p>
      <AdminNav />

      <section className="admin-sec">
        <div className="sum-cards">
          <div className="sum-card"><span>Active now (15 min)</span><b>{data?.activePlayers ?? "…"}</b></div>
          <div className="sum-card"><span>Rounds shown</span><b>{feed.length}</b></div>
        </div>
        <p className="rg48-sub">
          {data ? `Last updated ${new Date(data.fetchedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Loading feed…"}
          {" · "}
          <button className="linklike" type="button" onClick={() => void load()}>Refresh now</button>
        </p>
        {err ? <p className="rg48-err">{err}</p> : null}
        {!data ? (
          <p>Loading feed…</p>
        ) : feed.length === 0 ? (
          <p>No rounds from your downline yet — the feed fills as your players play.</p>
        ) : (
          <div className="rg48-twrap">
            <table className="dep-table">
              <thead><tr><th>Player</th><th>Game</th><th>Stake</th><th>Payout</th><th>Net</th><th>Time</th></tr></thead>
              <tbody>
                {feed.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={playerHref(r.userId)}>{r.userName}</Link></td>
                    <td>{r.gameName}</td>
                    <td>{r.currency === "coins" ? `${r.stake} coins` : fmtCash(r.stake)}</td>
                    <td>{r.currency === "coins" ? `${r.payout} coins` : fmtCash(r.payout)}</td>
                    <td className={r.net > 0 ? "ok" : r.net < 0 ? "bad" : ""}>
                      {r.currency === "coins"
                        ? `${r.net > 0 ? "+" : ""}${r.net} coins`
                        : r.net > 0 ? `+${fmtCash(r.net)}` : fmtCash(r.net)}
                    </td>
                    <td>{new Date(r.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

export default function AdminLivePage() {
  return (
    <main className="rg48-page-main rg23 admin-fb">
      <div className="wrap">
        <Suspense fallback={<p>Loading admin panel…</p>}>
          <AdminLiveInner />
        </Suspense>
      </div>
    </main>
  );
}
