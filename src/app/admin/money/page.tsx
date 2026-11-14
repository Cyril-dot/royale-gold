// Admin dashboard — Money (P0 Batch 1). Deposits, Withdrawals and the
// transaction Ledger behind tabs on one page (/admin/money), reached from
// the AdminNav "Money" tab. Each tab fetches from its own endpoint.
// In owner preview (?preview=<adminId>) the data comes from the owner
// endpoints for that admin and the action buttons are hidden (POSTs
// would 403 — same rule as the create-code form in preview).
// Withdrawals are REQUESTS only — no real money moves.

"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, fmtCash, fmtCoins } from "../../../lib/api";
import { useStore } from "../../../lib/store";
import { useAdminContext, todayStr } from "../../../lib/admin-client";
import { canAccessSection } from "../../../lib/rbac";
import { AdminNav, AdminPreviewBanner, AdminLoginPrompt, AdminError, AdminDenied } from "../../../components/AdminNav";
import { WITHDRAWAL_RISK_LABELS, WITHDRAWAL_OWNER_THRESHOLD, type WithdrawalRiskFlag } from "../../../lib/withdrawal-flags";

interface DepositRow { id: string; userId: string; userName: string; userContact: string | null; amount: number; method: string; pctInForce: number; commission: number; createdAt: string }
interface WithdrawalRow { id: string; userId: string; userName: string; userContact: string | null; amount: number; method: string; status: string; reason: string | null; decidedBy: string | null; createdAt: string; decidedAt: string | null; flags: string[] }
interface LedgerRow { id: string; type: string; userId: string; userName: string; userContact: string | null; adminId: string | null; adminName: string | null; amount: number; wallet: string; detail: string; stake?: number; payout?: number; method?: string; status?: string; reason?: string; createdAt: string }

const METHODS = ["MTN", "Telecel", "AirtelTigo", "card"];
const LEDGER_TYPES = ["deposit", "bet", "withdrawal", "adjustment", "conversion", "payout"] as const;

export default function AdminMoneyPage() {
  return (
    <main className="rg48-page-main rg23 admin-fb">
      <div className="wrap">
        <Suspense fallback={null}>
          <AdminMoneyInner />
        </Suspense>
      </div>
    </main>
  );
}

function AdminMoneyInner() {
  const { user, toast } = useStore();
  const router = useRouter();
  const sp = useSearchParams();
  const previewId = sp.get("preview");
  const { ctx, err } = useAdminContext(previewId);
  const [tab, setTab] = useState<"deposits" | "withdrawals" | "ledger">("deposits");

  // --- Deposits state ---
  const [depMethod, setDepMethod] = useState("");
  const [depQ, setDepQ] = useState("");
  const [deposits, setDeposits] = useState<DepositRow[] | null>(null);
  const [depTotals, setDepTotals] = useState<{ deposits: number; totalAmount: number; totalCommission: number } | null>(null);

  // --- Withdrawals state ---
  const [wdStatus, setWdStatus] = useState("");
  // P1 Batch 1 (A15): show flagged withdrawal requests only.
  const [wdFlaggedOnly, setWdFlaggedOnly] = useState(false);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[] | null>(null);
  const [wdPending, setWdPending] = useState(0);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  // --- Ledger state ---
  const [ledType, setLedType] = useState("");
  const [ledQ, setLedQ] = useState("");
  const [ledFrom, setLedFrom] = useState("");
  const [ledTo, setLedTo] = useState("");
  const [ledger, setLedger] = useState<LedgerRow[] | null>(null);
  const [ledTotals, setLedTotals] = useState<{ rows: number; cashIn: number; cashOut: number } | null>(null);

  const depUrl = useCallback(() => {
    const base = previewId ? `/api/owner/deposits?adminId=${previewId}` : "/api/admin/deposits";
    const p = new URLSearchParams();
    if (depMethod) p.set("method", depMethod);
    if (depQ.trim()) p.set("q", depQ.trim());
    const qs = p.toString();
    return qs ? `${base}${base.includes("?") ? "&" : "?"}${qs}` : base;
  }, [previewId, depMethod, depQ]);
  const wdUrl = useCallback(() => {
    const base = previewId ? `/api/owner/withdrawals?adminId=${previewId}` : "/api/admin/withdrawals";
    const p = new URLSearchParams();
    if (wdStatus) p.set("status", wdStatus);
    // P1 Batch 1 (A15): flagged-only filter.
    if (wdFlaggedOnly) p.set("flagged", "1");
    const qs = p.toString();
    return qs ? `${base}${base.includes("?") ? "&" : "?"}${qs}` : base;
  }, [previewId, wdStatus, wdFlaggedOnly]);
  const ledUrl = useCallback(() => {
    const base = previewId ? `/api/owner/ledger?adminId=${previewId}` : "/api/admin/ledger";
    const p = new URLSearchParams();
    if (ledType) p.set("type", ledType);
    if (ledQ.trim()) p.set("q", ledQ.trim());
    if (ledFrom) p.set("from", ledFrom);
    if (ledTo) p.set("to", ledTo);
    const qs = p.toString();
    return qs ? `${base}${base.includes("?") ? "&" : "?"}${qs}` : base;
  }, [previewId, ledType, ledQ, ledFrom, ledTo]);

  const loadDeposits = useCallback(async () => {
    try {
      const r = await api<{ deposits: DepositRow[]; totals: { deposits: number; totalAmount: number; totalCommission: number } }>(depUrl());
      setDeposits(r.deposits);
      setDepTotals(r.totals);
    } catch { setDeposits([]); }
  }, [depUrl]);
  const loadWithdrawals = useCallback(async () => {
    try {
      const r = await api<{ withdrawals: WithdrawalRow[]; pending: number }>(wdUrl());
      setWithdrawals(r.withdrawals);
      setWdPending(r.pending);
    } catch { setWithdrawals([]); }
  }, [wdUrl]);
  const loadLedger = useCallback(async () => {
    try {
      const r = await api<{ rows: LedgerRow[]; totals: { rows: number; cashIn: number; cashOut: number } }>(ledUrl());
      setLedger(r.rows);
      setLedTotals(r.totals);
    } catch { setLedger([]); }
  }, [ledUrl]);

  useEffect(() => { if (tab === "deposits") void loadDeposits(); }, [tab, loadDeposits]);
  useEffect(() => { if (tab === "withdrawals") void loadWithdrawals(); }, [tab, loadWithdrawals]);
  useEffect(() => { if (tab === "ledger") void loadLedger(); }, [tab, loadLedger]);
  // The Withdrawals tab shows the pending count — load it once on mount
  // so the badge is there before the tab is opened.
  useEffect(() => { void loadWithdrawals(); }, [loadWithdrawals]);

  if (!user) return <AdminLoginPrompt />;
  if (err) return <AdminError err={err} />;
  if (!ctx) return <p>Loading admin panel…</p>;
  // P0 Batch 3 (O3): the server 403s this section too.
  if (!previewId && !canAccessSection(user, "money")) return <AdminDenied section="money" />;

  const ov = { admin: ctx.admin };

  const playerHref = (id: string) => (previewId ? `/admin/players/${id}?preview=${previewId}` : `/admin/players/${id}`);
  const goPlayer = (id: string) => router.push(playerHref(id));
  const card = (label: string, value: string) => (
    <div className="sum-card"><span>{label}</span><b>{value}</b></div>
  );
  const fmtAmt = (amount: number, wallet: string) => {
    const sign = amount > 0 ? "+" : amount < 0 ? "−" : "";
    const abs = Math.abs(amount);
    return wallet === "coins" ? `${sign}${Math.round(abs)} coins` : `${sign}${fmtCash(abs)}`;
  };
  const decide = async (w: WithdrawalRow, decision: "approve" | "reject") => {
    if (decision === "reject" && rejectId !== w.id) { setRejectId(w.id); setRejectReason(""); return; }
    if (decision === "reject" && rejectReason.trim().length < 3) { toast("A reason is required to reject", "lose"); return; }
    setBusyId(w.id);
    try {
      await api(`/api/admin/withdrawals/${w.id}/decide`, {
        method: "POST",
        body: JSON.stringify({ decision, ...(decision === "reject" ? { reason: rejectReason.trim() } : {}) }),
      });
      toast(decision === "approve" ? "Withdrawal approved" : "Withdrawal rejected", decision === "approve" ? "win" : "lose");
      setRejectId(null);
      setRejectReason("");
      await loadWithdrawals();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Decision failed", "lose");
    } finally { setBusyId(null); }
  };

  return (
    <>
      {previewId ? <AdminPreviewBanner name={ov.admin.name} /> : null}
      <div className="rg48-hbar-in">
        <Link className="gp-back" href={previewId ? `/admin?preview=${previewId}` : "/admin"} aria-label="Back to admin overview"><span className="gp-back-coin">←</span></Link>
        <h2>Money</h2>
      </div>
      <p className="rg48-sub">{ov.admin.name} · {ov.admin.email} · {ov.admin.commissionPct}% commission{ov.admin.active ? "" : " · DEACTIVATED"}</p>
      <AdminNav />
      {previewId ? <p className="rg48-sub">Preview — actions are disabled.</p> : null}
      <section className="admin-sec">
        <h3>Money</h3>
        <div className="ac-tabs" role="tablist" aria-label="Money views">
          <button type="button" role="tab" aria-selected={tab === "deposits"} className={`ac-tab${tab === "deposits" ? " ac-tab-active" : ""}`} onClick={() => setTab("deposits")}>Deposits</button>
          <button type="button" role="tab" aria-selected={tab === "withdrawals"} className={`ac-tab${tab === "withdrawals" ? " ac-tab-active" : ""}`} onClick={() => setTab("withdrawals")}>Withdrawals{wdPending > 0 ? ` (${wdPending})` : ""}</button>
          <button type="button" role="tab" aria-selected={tab === "ledger"} className={`ac-tab${tab === "ledger" ? " ac-tab-active" : ""}`} onClick={() => setTab("ledger")}>Ledger</button>
        </div>

        {tab === "deposits" && (
          <div role="tabpanel" aria-label="Deposits">
            <div className="money-filters">
              <label className="players-search">
                <input type="search" placeholder="Search by player, contact or receipt id" value={depQ} onChange={(e) => setDepQ(e.target.value)} aria-label="Search deposits" />
              </label>
              <div className="money-chips" role="group" aria-label="Filter by method">
                <button type="button" className={!depMethod ? "on" : ""} onClick={() => setDepMethod("")}>All methods</button>
                {METHODS.map((m) => (
                  <button key={m} type="button" className={depMethod === m ? "on" : ""} onClick={() => setDepMethod(m)}>{m}</button>
                ))}
              </div>
            </div>
            {depTotals && (
              <div className="sum-cards">
                {card("Deposits", String(depTotals.deposits))}
                {card("Total deposited", fmtCash(depTotals.totalAmount))}
                {card("Commission", fmtCash(depTotals.totalCommission))}
              </div>
            )}
            {deposits === null ? <p>Loading deposits…</p> : deposits.length === 0 ? (
              <p>No deposits yet.</p>
            ) : (
              <div className="rg48-twrap">
                <table className="dep-table">
                  <thead><tr><th>Player</th><th>Amount</th><th>Method</th><th>Commission</th><th>Date</th></tr></thead>
                  <tbody>
                    {deposits.map((d) => (
                      <tr key={d.id} onClick={() => goPlayer(d.userId)} onKeyDown={(e) => { if (e.key === "Enter") goPlayer(d.userId); }} tabIndex={0} className="clickable">
                        <td>{d.userName}<span className="td-sub">{d.userContact || ""}</span></td>
                        <td>{fmtCash(d.amount)}</td>
                        <td>{d.method}</td>
                        <td>{fmtCash(d.commission)} ({d.pctInForce}%)</td>
                        <td>{new Date(d.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === "withdrawals" && (
          <div role="tabpanel" aria-label="Withdrawals">
            <p className="rg48-sub">Requests only — no real money moves. Nothing pays out without an admin action. Over {fmtCash(WITHDRAWAL_OWNER_THRESHOLD)} also needs the owner’s approval.</p>
            <div className="money-chips" role="group" aria-label="Filter by status">
              <button type="button" className={!wdStatus ? "on" : ""} onClick={() => setWdStatus("")}>All</button>
              {["pending", "admin_approved", "approved", "rejected"].map((s) => (
                <button key={s} type="button" className={wdStatus === s ? "on" : ""} onClick={() => setWdStatus(s)}>{s === "admin_approved" ? "Awaiting owner" : s[0].toUpperCase() + s.slice(1)}</button>
              ))}
              <button type="button" className={wdFlaggedOnly ? "on" : ""} onClick={() => setWdFlaggedOnly(!wdFlaggedOnly)}>Flagged only</button>
            </div>
            {withdrawals === null ? <p>Loading withdrawals…</p> : withdrawals.length === 0 ? (
              <p>No withdrawal requests.</p>
            ) : (
              <div className="wd-list">
                {withdrawals.map((w) => (
                  <div key={w.id} className="wd-row">
                    <div className="wd-main">
                      <b>{w.userName}</b><span>{w.userContact || ""}</span>
                      <span className="wd-amt">{fmtCash(w.amount)} · {w.method}</span>
                      <span className="wd-date">{new Date(w.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <span className={`wd-status wd-${w.status}`}>{w.status === "admin_approved" ? "Awaiting owner" : w.status}</span>
                    {w.flags && w.flags.length > 0 ? (
                      <span className="wd-flags">{w.flags.map((f) => <span key={f} className="risk-flag">{WITHDRAWAL_RISK_LABELS[f as WithdrawalRiskFlag] ?? f}</span>)}</span>
                    ) : null}
                    {w.reason ? <p className="wd-reason">Reason: {w.reason}</p> : null}
                    {!previewId && (w.status === "pending" || w.status === "admin_approved") && (
                      <div className="wd-actions">
                        {w.status === "pending" ? (
                          <>
                            <button className="btn btn-gold btn-sm" type="button" disabled={busyId === w.id} onClick={() => void decide(w, "approve")}>Approve</button>
                            <button className="btn btn-ghost btn-sm" type="button" disabled={busyId === w.id} onClick={() => void decide(w, "reject")}>Reject</button>
                          </>
                        ) : (
                          <span className="wd-note">Approved by admin — waiting on the owner.</span>
                        )}
                      </div>
                    )}
                    {rejectId === w.id && (
                      <div className="wd-reject">
                        <input type="text" placeholder="Reason for rejection (required)" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} aria-label="Rejection reason" />
                        <button className="btn btn-gold btn-sm" type="button" disabled={busyId === w.id} onClick={() => void decide(w, "reject")}>Confirm reject</button>
                        <button className="btn btn-ghost btn-sm" type="button" onClick={() => { setRejectId(null); setRejectReason(""); }}>Cancel</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "ledger" && (
          <div role="tabpanel" aria-label="Ledger">
            <div className="money-filters">
              <label className="players-search">
                <input type="search" placeholder="Search by player or contact" value={ledQ} onChange={(e) => setLedQ(e.target.value)} aria-label="Search ledger" />
              </label>
              <div className="money-chips" role="group" aria-label="Filter by type">
                <button type="button" className={!ledType ? "on" : ""} onClick={() => setLedType("")}>All types</button>
                {LEDGER_TYPES.map((t) => (
                  <button key={t} type="button" className={ledType === t ? "on" : ""} onClick={() => setLedType(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
                ))}
              </div>
              <div className="money-dates">
                <label>From <input type="date" value={ledFrom} max={todayStr()} onChange={(e) => setLedFrom(e.target.value)} /></label>
                <label>To <input type="date" value={ledTo} max={todayStr()} onChange={(e) => setLedTo(e.target.value)} /></label>
              </div>
            </div>
            {ledTotals && (
              <div className="sum-cards">
                {card("Rows", String(ledTotals.rows))}
                {card("Cash in", fmtCash(ledTotals.cashIn))}
                {card("Cash out", fmtCash(ledTotals.cashOut))}
              </div>
            )}
            {ledger === null ? <p>Loading ledger…</p> : ledger.length === 0 ? (
              <p>No money movements yet.</p>
            ) : (
              <div className="ledger-list">
                {ledger.map((r) => (
                  <div key={r.id} className="ledger-row" onClick={() => goPlayer(r.userId)} onKeyDown={(e) => { if (e.key === "Enter") goPlayer(r.userId); }} tabIndex={0} role="button">
                    <span className="ledger-txt">
                      <b>{r.userName} <span className={`ledger-type ledger-${r.type}`}>{r.type}</span></b>
                      <span>{r.detail}{r.reason ? ` — ${r.reason}` : ""}{r.status ? ` · ${r.status}` : ""}</span>
                      <span>{new Date(r.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    </span>
                    <b className={r.amount >= 0 ? "ledger-in" : "ledger-out"}>{fmtAmt(r.amount, r.wallet)}</b>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </>
  );
}
