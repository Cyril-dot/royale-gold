// Admin dashboard — Bet lookup + provably-fair verify (P1 Batch 1,
// A16). Three tools on one page:
//   1. Look up ANY round by its id (game, stake, payout, result, date).
//   2. Look up a player's rounds in a date range.
//   3. Verify a crash round: recompute the crash point from the
//      revealed server seed and compare the seed hash — the seed is
//      returned only for a FINISHED round, never a live one.
// An admin sees only their own players' rounds; the owner previews one
// admin's rounds with ?preview=<adminId>. The round id is the
// GameResult id (shown on the player detail bet history).

"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useStore } from "../../../lib/store";
import { api, fmtMoney } from "../../../lib/api";
import { todayStr } from "../../../lib/money";
import { useAdminContext, useAdminPlayers } from "../../../lib/admin-client";
import { canAccessSection } from "../../../lib/rbac";
import { AdminNav, AdminPreviewBanner, AdminLoginPrompt, AdminError, AdminDenied } from "../../../components/AdminNav";

interface LookupRound {
  id: string;
  userId: string;
  userName: string;
  userContact: string | null;
  game: string;
  gameName: string;
  currency: string;
  fiatCurrency: string;
  stake: number;
  payout: number;
  net: number;
  result: unknown;
  createdAt: string;
}

interface VerifyResult {
  roundId: string;
  hash: string;
  clientSeed: string;
  nonce: number;
  finished: boolean;
  serverSeed?: string;
  crashPoint?: number;
  recomputedPoint?: number;
  pointMatch?: boolean;
  hashMatch?: boolean;
}

interface RecentRound {
  roundId: string;
  hash: string;
  crashPoint: number;
  createdAt: string;
  finished: boolean;
}

function AdminLookupInner() {
  const { user } = useStore();
  const sp = useSearchParams();
  const previewId = sp.get("preview");
  const { ctx, err: ctxErr } = useAdminContext(previewId);
  const { players, err: playersErr } = useAdminPlayers(previewId);

  const [roundId, setRoundId] = useState("");
  const [round, setRound] = useState<LookupRound | null>(null);
  const [roundErr, setRoundErr] = useState("");
  const [roundBusy, setRoundBusy] = useState(false);

  const [lookupUser, setLookupUser] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [playerRounds, setPlayerRounds] = useState<LookupRound[] | null>(null);
  const [playerName, setPlayerName] = useState("");
  const [playerErr, setPlayerErr] = useState("");
  const [playerBusy, setPlayerBusy] = useState(false);

  const [verifyId, setVerifyId] = useState("");
  const [verify, setVerify] = useState<VerifyResult | null>(null);
  const [verifyErr, setVerifyErr] = useState("");
  const [verifyBusy, setVerifyBusy] = useState(false);

  const [recent, setRecent] = useState<RecentRound[] | null>(null);
  const [recentErr, setRecentErr] = useState("");

  if (!user) return <AdminLoginPrompt />;
  if (ctxErr) return <AdminError err={ctxErr} />;
  if (!ctx) return <p>Loading admin panel…</p>;
  // P0 Batch 3 (O3): the server 403s this section too.
  if (!previewId && !canAccessSection(user, "lookup")) return <AdminDenied section="lookup" />;
  if (playersErr) return <AdminError err={playersErr} />;

  const adminSuffix = previewId ? `&adminId=${previewId}` : "";

  const lookupRound = async () => {
    const id = roundId.trim();
    if (!id) { setRoundErr("Enter a round id."); return; }
    setRoundBusy(true);
    setRoundErr("");
    try {
      const r = await api<{ round: LookupRound }>(`/api/admin/lookup?roundId=${encodeURIComponent(id)}${adminSuffix}`);
      setRound(r.round);
    } catch (ex) {
      setRound(null);
      setRoundErr(ex instanceof Error ? ex.message : "Lookup failed.");
    } finally { setRoundBusy(false); }
  };

  const lookupPlayer = async () => {
    if (!lookupUser) { setPlayerErr("Pick a player."); return; }
    setPlayerBusy(true);
    setPlayerErr("");
    try {
      const p = new URLSearchParams();
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      const qs = p.toString();
      const r = await api<{ player: { id: string; name: string }; rounds: LookupRound[] }>(
        `/api/admin/lookup?userId=${lookupUser}${qs ? `&${qs}` : ""}${adminSuffix}`,
      );
      setPlayerRounds(r.rounds);
      setPlayerName(r.player.name);
    } catch (ex) {
      setPlayerRounds(null);
      setPlayerErr(ex instanceof Error ? ex.message : "Lookup failed.");
    } finally { setPlayerBusy(false); }
  };

  const verifyRound = async (id?: string) => {
    const rid = (id ?? verifyId).trim();
    if (!rid) { setVerifyErr("Enter a crash round id."); return; }
    setVerifyBusy(true);
    setVerifyErr("");
    try {
      setVerifyId(rid);
      const r = await api<VerifyResult>(`/api/admin/lookup/verify?roundId=${encodeURIComponent(rid)}`);
      setVerify(r);
    } catch (ex) {
      setVerify(null);
      setVerifyErr(ex instanceof Error ? ex.message : "Verify failed.");
    } finally { setVerifyBusy(false); }
  };

  const loadRecent = async () => {
    setRecentErr("");
    try {
      const r = await api<{ rounds: RecentRound[] }>("/api/admin/lookup/recent-rounds");
      setRecent(r.rounds);
    } catch (ex) {
      setRecentErr(ex instanceof Error ? ex.message : "Could not load recent rounds.");
    }
  };

  const roundRows = (r: LookupRound) => (
    <>
      <div className="sum-cards">
        <div className="sum-card"><span>Game</span><b>{r.gameName}</b></div>
        <div className="sum-card"><span>Stake</span><b>{r.currency === "coins" ? `${Math.round(r.stake)} coins` : fmtMoney(r.stake, r.fiatCurrency ?? user?.currency ?? "GHS")}</b></div>
        <div className="sum-card"><span>Payout</span><b>{r.currency === "coins" ? `${Math.round(r.payout)} coins` : fmtMoney(r.payout, r.fiatCurrency ?? user?.currency ?? "GHS")}</b></div>
        <div className="sum-card"><span>Net</span><b>{r.currency === "coins" ? `${r.net >= 0 ? "+" : ""}${Math.round(r.net)} coins` : `${r.net >= 0 ? "+" : "−"}${fmtMoney(Math.abs(r.net), r.fiatCurrency ?? user?.currency ?? "GHS")}`}</b></div>
      </div>
      <p className="rg48-sub">Player: {r.userName}{r.userContact ? ` · ${r.userContact}` : ""} · {new Date(r.createdAt).toLocaleString("en-GB")}</p>
      <p className="rg48-sub">Round id: <code>{r.id}</code></p>
      <pre className="lookup-pre">{JSON.stringify(r.result, null, 2)}</pre>
    </>
  );

  return (
    <>
      {previewId ? <AdminPreviewBanner name={ctx.admin.name} /> : null}
      <div className="rg48-hbar-in">
        <h2>Bet lookup</h2>
      </div>
      <p className="rg48-sub">Look up any round by its id, or a player’s rounds by date. Crash rounds can be verified against their seed hash below.</p>
      <AdminNav />

      <section className="admin-sec">
        <h3>Look up a round</h3>
        <div className="lookup-form">
          <input
            type="text"
            placeholder="Round id (from the player’s bet history)"
            value={roundId}
            onChange={(e) => setRoundId(e.target.value)}
            aria-label="Round id"
          />
          <button className="btn btn-gold" type="button" disabled={roundBusy} onClick={() => void lookupRound()}>Look up</button>
        </div>
        {roundErr ? <p className="rg48-err">{roundErr}</p> : null}
        {round ? roundRows(round) : null}
      </section>

      <section className="admin-sec">
        <h3>Look up a player’s rounds</h3>
        <div className="lookup-form">
          <select value={lookupUser} onChange={(e) => setLookupUser(e.target.value)} aria-label="Player">
            <option value="">Pick a player…</option>
            {(players ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.name}{p.email ? ` — ${p.email}` : ""}</option>
            ))}
          </select>
          <label>From <input type="date" value={from} max={todayStr()} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>To <input type="date" value={to} max={todayStr()} onChange={(e) => setTo(e.target.value)} /></label>
          <button className="btn btn-gold" type="button" disabled={playerBusy} onClick={() => void lookupPlayer()}>Look up</button>
        </div>
        {playerErr ? <p className="rg48-err">{playerErr}</p> : null}
        {playerRounds !== null ? (
          playerRounds.length === 0 ? (
            <p>No rounds for {playerName} in that range.</p>
          ) : (
            <div className="user-list">
              {playerRounds.map((r) => (
                <button key={r.id} type="button" className="user-row" onClick={() => { setRoundId(r.id); setRound(r); setRoundErr(""); }}>
                  <b>{r.gameName}</b><span>{r.currency === "coins" ? `${Math.round(r.stake)} coins` : fmtMoney(r.stake, r.fiatCurrency ?? user?.currency ?? "GHS")}</span><span className={r.net >= 0 ? "lk-win" : "lk-lose"}>{r.net >= 0 ? "+" : "−"}{r.currency === "coins" ? `${Math.round(Math.abs(r.net))} coins` : fmtMoney(Math.abs(r.net), r.fiatCurrency ?? user?.currency ?? "GHS")}</span><span>{new Date(r.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                </button>
              ))}
            </div>
          )
        ) : null}
      </section>

      <section className="admin-sec">
        <h3>Provably-fair verify (crash games)</h3>
        <p className="rg48-sub">The seed is revealed only for a finished round — a live round’s seed stays secret.</p>
        <div className="lookup-form">
          <input
            type="text"
            placeholder="Crash round id"
            value={verifyId}
            onChange={(e) => setVerifyId(e.target.value)}
            aria-label="Crash round id"
          />
          <button className="btn btn-gold" type="button" disabled={verifyBusy} onClick={() => void verifyRound()}>Verify</button>
        </div>
        {verifyErr ? <p className="rg48-err">{verifyErr}</p> : null}
        {verify ? (
          <div className="verify-box">
            <p>Round id: <code>{verify.roundId}</code></p>
            <p>Issued hash: <code>{verify.hash}</code></p>
            <p>Client seed: <code>{verify.clientSeed}</code> · Nonce: {verify.nonce}</p>
            {!verify.finished ? (
              <p><b>This round is still live</b> — the seed is revealed only after it finishes.</p>
            ) : (
              <>
                <p>Server seed: <code>{verify.serverSeed}</code></p>
                <p>Crash point: ×{verify.crashPoint?.toFixed(2)} · Recomputed: ×{verify.recomputedPoint?.toFixed(2)}</p>
                <p className={verify.pointMatch ? "lk-win" : "lk-lose"}>Crash point: {verify.pointMatch ? "MATCHES — the round was fair" : "DOES NOT MATCH"}</p>
                <p className={verify.hashMatch ? "lk-win" : "lk-lose"}>Seed hash: {verify.hashMatch ? "MATCHES — the seed is the one issued" : "DOES NOT MATCH"}</p>
              </>
            )}
          </div>
        ) : null}
        <h4>Recent crash rounds</h4>
        {recent === null ? (
          <button className="btn btn-ghost" type="button" onClick={() => void loadRecent()}>Load recent rounds</button>
        ) : recent.length === 0 ? (
          <p>No crash rounds issued yet — play a crash game (Aviator Gold, Jet Fly, Car Crash, Balloon Burst) and come back.</p>
        ) : (
          <div className="user-list">
            {recent.map((r) => (
              <button key={r.roundId} type="button" className="user-row" onClick={() => void verifyRound(r.roundId)}>
                <b>×{r.crashPoint.toFixed(2)}</b><span>{r.finished ? "Finished" : "Live"}</span><span><code>{r.roundId.slice(0, 12)}…</code></span><span>{new Date(r.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              </button>
            ))}
          </div>
        )}
        {recentErr ? <p className="rg48-err">{recentErr}</p> : null}
      </section>
    </>
  );
}

export default function AdminLookupPage() {
  return (
    <Suspense fallback={<p>Loading admin panel…</p>}>
      <AdminLookupInner />
    </Suspense>
  );
}
