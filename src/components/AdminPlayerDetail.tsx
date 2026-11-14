// Admin dashboard — Player detail (client part, round 11). One player as
// a real page: name, contact, balances, totals, full deposit history.
// Reached from the referred-users list and from day-detail rows. Same
// endpoint as the old user-detail overlay (/api/admin/users/[id]).
// The route wrapper (src/app/admin/players/[id]/page.tsx) is a server
// component that passes the id in — this file stays a client component
// because it reads ?preview= and the store.

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, fmtCash } from "../lib/api";
import { useStore } from "../lib/store";
import { useAdminContext, type UserDetail } from "../lib/admin-client";
import { canAccessSection } from "../lib/rbac";
import { AdminNav, AdminPreviewBanner, AdminLoginPrompt, AdminError, AdminDenied } from "./AdminNav";

export default function AdminPlayerDetail({ id }: { id: string }) {
  const { user } = useStore();
  const router = useRouter();
  const sp = useSearchParams();
  const previewId = sp.get("preview");
  const { ctx, err } = useAdminContext(previewId);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [detailErr, setDetailErr] = useState("");
  const { toast } = useStore();

  // P0 Batch 1 (A7/A8): balance adjustment + block/unblock for this player
  // (own downline only — the endpoints enforce it; hidden in preview).
  const [adjWallet, setAdjWallet] = useState<"cash" | "coins">("cash");
  const [adjDir, setAdjDir] = useState<"credit" | "debit">("credit");
  const [adjAmount, setAdjAmount] = useState("");
  const [adjReason, setAdjReason] = useState("");
  const [adjBusy, setAdjBusy] = useState(false);
  const [blockReason, setBlockReason] = useState("");
  const [blockBusy, setBlockBusy] = useState(false);

  const loadDetail = useCallback(async () => {
    try {
      const d = await api<UserDetail>(`/api/admin/users/${id}`);
      setDetail(d);
      setDetailErr("");
    } catch (ex) {
      setDetailErr(ex instanceof Error ? ex.message : "Could not load this player.");
    }
  }, [id]);

  useEffect(() => { void loadDetail(); }, [loadDetail]);

  const submitAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(adjAmount);
    if (!Number.isFinite(amount) || amount <= 0) { toast("Enter an amount above 0", "lose"); return; }
    if (adjReason.trim().length < 3) { toast("A reason is required", "lose"); return; }
    setAdjBusy(true);
    try {
      const r = await api<{ balances: { cash: number; coins: number } }>(`/api/admin/users/${id}/adjust`, {
        method: "POST",
        body: JSON.stringify({ wallet: adjWallet, direction: adjDir, amount, reason: adjReason.trim() }),
      });
      toast(`${adjDir === "credit" ? "Credited" : "Debited"} ${adjWallet === "cash" ? fmtCash(amount) : `${amount} coins`} — recorded in the ledger`, "win");
      setAdjAmount("");
      setAdjReason("");
      await loadDetail();
      void r;
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Adjustment failed", "lose");
    } finally { setAdjBusy(false); }
  };

  const submitBlock = async () => {
    const blocked = !detail?.user.blockedAt;
    if (blocked && blockReason.trim().length < 3) { toast("A reason is required to block", "lose"); return; }
    setBlockBusy(true);
    try {
      await api(`/api/admin/users/${id}/block`, {
        method: "POST",
        body: JSON.stringify({ blocked, ...(blocked ? { reason: blockReason.trim() } : {}) }),
      });
      toast(blocked ? "Player blocked — betting and deposits suspended" : "Player unblocked", blocked ? "lose" : "win");
      setBlockReason("");
      await loadDetail();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Block failed", "lose");
    } finally { setBlockBusy(false); }
  };

  if (!user) return <AdminLoginPrompt />;
  if (err) return <AdminError err={err} />;
  // P0 Batch 3 (O3): the server 403s this section too.
  if (!previewId && ctx && !canAccessSection(user, "players")) return <AdminDenied section="players" />;

  const back = (
    <button className="gp-back" type="button" onClick={() => router.back()} aria-label="Back"><span className="gp-back-coin">←</span></button>
  );

  if (!detail) {
    return (
      <>
        <div className="rg48-hbar-in">{back}<h2>Player</h2></div>
        {detailErr ? <p className="rg48-err">{detailErr}</p> : <p>Loading player…</p>}
      </>
    );
  }

  const u = detail.user;
  const card = (label: string, value: string) => (
    <div className="sum-card"><span>{label}</span><b>{value}</b></div>
  );

  return (
    <>
      {previewId && ctx ? <AdminPreviewBanner name={ctx.admin.name} /> : null}
      <div className="rg48-hbar-in">{back}<h2>{u.name}</h2>{u.blockedAt ? <span className="pd-blocked-badge">BLOCKED</span> : null}</div>
      <p className="rg48-sub">{u.email || u.phone || "—"} · Joined {new Date(u.joinedAt).toLocaleDateString("en-GB")}</p>
      {u.blockedAt ? <p className="pd-blocked-note">Blocked {new Date(u.blockedAt).toLocaleDateString("en-GB")} — {u.blockedReason || "no reason recorded"}. Betting and deposits are suspended.</p> : null}
      <div className="pd-meta">
        <span className="pd-meta-item"><span className="pd-meta-label">Code used</span>{u.referralCodeUsed ? <b className="code-chip sm">{u.referralCodeUsed}</b> : <b>—</b>}</span>
        <span className="pd-meta-item"><span className="pd-meta-label">Referring admin</span><b>{u.referringAdmin?.name || "—"}</b></span>
      </div>
      <AdminNav />
      <section className="admin-sec">
        <h3>Balances</h3>
        <div className="sum-cards">
          {card("Cash", fmtCash(u.cash))}
          {card("Coins", String(u.coins))}
          {card("Role", u.role)}
        </div>
      </section>
      <section className="admin-sec">
        <h3>Totals</h3>
        <div className="sum-cards">
          {card("Deposits", String(detail.totals.deposits))}
          {card("Deposited", fmtCash(detail.totals.totalDeposited))}
          {card("Commission", fmtCash(detail.totals.totalCommission))}
          {card("Coins given", String(detail.totals.coinsGiven))}
        </div>
      </section>
      {!previewId && (
        <>
          <section className="admin-sec">
            <h3>Balance adjustment</h3>
            <p className="rg48-sub">Credit or debit this player’s cash or coins. A reason is required — the adjustment is written to the ledger and the audit log.</p>
            <form className="pd-adjust" onSubmit={submitAdjust}>
              <div className="pd-adjust-row">
                <label>Wallet
                  <select value={adjWallet} onChange={(e) => setAdjWallet(e.target.value as "cash" | "coins")} aria-label="Wallet">
                    <option value="cash">Cash (GH₵)</option>
                    <option value="coins">Coins</option>
                  </select>
                </label>
                <label>Direction
                  <select value={adjDir} onChange={(e) => setAdjDir(e.target.value as "credit" | "debit")} aria-label="Direction">
                    <option value="credit">Credit</option>
                    <option value="debit">Debit</option>
                  </select>
                </label>
                <label>Amount
                  <input type="number" min={0} step={adjWallet === "cash" ? "0.01" : "1"} inputMode="decimal" placeholder={adjWallet === "cash" ? "0.00" : "0"} value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)} aria-label="Amount" required />
                </label>
              </div>
              <label className="pd-adjust-reason">Reason (required)
                <input type="text" placeholder="Why is this balance changing?" value={adjReason} onChange={(e) => setAdjReason(e.target.value)} aria-label="Reason" required minLength={3} />
              </label>
              <button className="btn btn-gold" type="submit" disabled={adjBusy}>{adjBusy ? "Saving…" : `${adjDir === "credit" ? "Credit" : "Debit"} ${adjWallet === "cash" ? "cash" : "coins"}`}</button>
            </form>
          </section>
          <section className="admin-sec">
            <h3>Block / Unblock</h3>
            <p className="rg48-sub">{u.blockedAt ? "This player is blocked — they cannot place bets or deposit." : "Blocking suspends this player’s betting and deposits immediately."}</p>
            {u.blockedAt ? null : (
              <label className="pd-adjust-reason">Reason (required to block)
                <input type="text" placeholder="Why is this player being blocked?" value={blockReason} onChange={(e) => setBlockReason(e.target.value)} aria-label="Block reason" />
              </label>
            )}
            <button className={`btn ${u.blockedAt ? "btn-gold" : "btn-ghost"}`} type="button" disabled={blockBusy} onClick={() => void submitBlock()}>
              {blockBusy ? "Saving…" : u.blockedAt ? "Unblock player" : "Block player"}
            </button>
          </section>
        </>
      )}
      <section className="admin-sec">
        <h3>Full deposit history</h3>
        {detail.deposits.length === 0 ? <p>No deposits yet.</p> : (
          <div className="rg48-twrap">
            <table className="dep-table">
              <thead><tr><th>Amount</th><th>Method</th><th>%</th><th>Commission</th><th>Date</th></tr></thead>
              <tbody>
                {detail.deposits.map((d) => (
                  <tr key={d.id}><td>{fmtCash(d.amount)}</td><td>{d.method}</td><td>{d.pctInForce}%</td><td>{fmtCash(d.commission)}</td><td>{new Date(d.createdAt).toLocaleDateString("en-GB")}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
