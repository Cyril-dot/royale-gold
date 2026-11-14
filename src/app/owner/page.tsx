// Owner panel — add/edit/deactivate admins, set %, all admins with
// codes / referral counts / coins given / daily commission per admin per
// day with date picker, overall totals, per-day per-admin table,
// all-admins rollup, preview any admin's panel.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, fmtCash } from "../../lib/api";
import { useStore } from "../../lib/store";
import { copyText, todayStr } from "../../lib/admin-client";

interface AdminRow {
  id: string; name: string; email: string; role: string; commissionPct: number | null; active: boolean;
  codes: { id: string; code: string; active: boolean }[];
  referralCount: number; coinsGiven: number; commissionAllTime: number; createdAt: string;
}
interface RollupDay { date: string; adminId: string; adminName: string; deposits: number; totalAmount: number; totalCommission: number }
interface OwnerDayAdmin { admin: { id: string; name: string }; deposits: { id: string; userId: string; userName: string; userContact: string; amount: number; method: string; pctInForce: number; commission: number; time: string }[]; totalAmount: number; totalCommission: number }

export default function OwnerPage() {
  const { user, openAuth, toast } = useStore();
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [rollup, setRollup] = useState<{ days: RollupDay[]; totals: { deposits: number; totalAmount: number; totalCommission: number } } | null>(null);
  const [err, setErr] = useState("");
  const [date, setDate] = useState("");
  useEffect(() => { setDate(todayStr()); }, []);
  const [tab, setTab] = useState<"per-day" | "rollup">("per-day");
  const [dayAdmins, setDayAdmins] = useState<OwnerDayAdmin[] | null>(null);
  const [dayTotals, setDayTotals] = useState<{ deposits: number; totalAmount: number; totalCommission: number } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // P0 Batch 1 (O8): withdrawal oversight — every pending withdrawal
  // platform-wide. Large ones an admin approved sit as "admin_approved"
  // until the owner approves them second (maker-checker, GH₵ 500).
  interface OwnerWdRow { id: string; userId: string; userName: string; userContact: string | null; adminId: string | null; adminName: string | null; amount: number; method: string; status: string; reason: string | null; createdAt: string; decidedAt: string | null }
  const [ownerWd, setOwnerWd] = useState<OwnerWdRow[] | null>(null);
  const [ownerWdPending, setOwnerWdPending] = useState(0);
  const [ownerWdStatus, setOwnerWdStatus] = useState("");
  const [ownerRejectId, setOwnerRejectId] = useState<string | null>(null);
  const [ownerRejectReason, setOwnerRejectReason] = useState("");
  const [ownerWdBusy, setOwnerWdBusy] = useState<string | null>(null);
  const loadOwnerWd = useCallback(async () => {
    try {
      const r = await api<{ withdrawals: OwnerWdRow[]; pending: number }>(`/api/owner/withdrawals${ownerWdStatus ? `?status=${ownerWdStatus}` : ""}`);
      setOwnerWd(r.withdrawals);
      setOwnerWdPending(r.pending);
    } catch { setOwnerWd([]); }
  }, [ownerWdStatus]);
  useEffect(() => { void loadOwnerWd(); }, [loadOwnerWd]);
  const decideOwnerWd = async (w: OwnerWdRow, decision: "approve" | "reject") => {
    if (decision === "reject" && ownerRejectId !== w.id) { setOwnerRejectId(w.id); setOwnerRejectReason(""); return; }
    if (decision === "reject" && ownerRejectReason.trim().length < 3) { toast("A reason is required to reject", "lose"); return; }
    setOwnerWdBusy(w.id);
    try {
      await api(`/api/owner/withdrawals/${w.id}/decide`, {
        method: "POST",
        body: JSON.stringify({ decision, ...(decision === "reject" ? { reason: ownerRejectReason.trim() } : {}) }),
      });
      toast(decision === "approve" ? "Withdrawal approved" : "Withdrawal rejected", decision === "approve" ? "win" : "lose");
      setOwnerRejectId(null);
      setOwnerRejectReason("");
      await loadOwnerWd();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Decision failed", "lose");
    } finally { setOwnerWdBusy(null); }
  };

  // P0 Batch 1 (O7): global transaction ledger — every money movement,
  // platform-wide, searchable by type, period, amount, method and admin.
  interface OwnerLedgerRow { id: string; type: string; userId: string; userName: string; userContact: string | null; adminId: string | null; adminName: string | null; amount: number; wallet: string; detail: string; status?: string; reason?: string; createdAt: string }
  const [ownerLedger, setOwnerLedger] = useState<OwnerLedgerRow[] | null>(null);
  const [ownerLedTotals, setOwnerLedTotals] = useState<{ rows: number; cashIn: number; cashOut: number } | null>(null);
  const [ownerLedType, setOwnerLedType] = useState("");
  const [ownerLedQ, setOwnerLedQ] = useState("");
  const [ownerLedFrom, setOwnerLedFrom] = useState("");
  const [ownerLedTo, setOwnerLedTo] = useState("");
  const [ownerLedAdmin, setOwnerLedAdmin] = useState("");
  const loadOwnerLedger = useCallback(async () => {
    try {
      const p = new URLSearchParams();
      if (ownerLedType) p.set("type", ownerLedType);
      if (ownerLedQ.trim()) p.set("q", ownerLedQ.trim());
      if (ownerLedFrom) p.set("from", ownerLedFrom);
      if (ownerLedTo) p.set("to", ownerLedTo);
      if (ownerLedAdmin) p.set("adminId", ownerLedAdmin);
      const qs = p.toString();
      const r = await api<{ rows: OwnerLedgerRow[]; totals: { rows: number; cashIn: number; cashOut: number } }>(`/api/owner/ledger${qs ? `?${qs}` : ""}`);
      setOwnerLedger(r.rows);
      setOwnerLedTotals(r.totals);
    } catch { setOwnerLedger([]); }
  }, [ownerLedType, ownerLedQ, ownerLedFrom, ownerLedTo, ownerLedAdmin]);
  useEffect(() => { void loadOwnerLedger(); }, [loadOwnerLedger]);

  // Per-admin referral link copy (first active code) — the admin's own
  // panel lives on the /admin routes; "Preview panel" links there with
  // ?preview=<adminId>.
  const copyAdminLink = (a: AdminRow) => {
    const c = a.codes.find((x) => x.active) ?? a.codes[0];
    if (!c) return;
    const link = `${window.location.origin}/?ref=${c.code}`;
    void copyText(link).then(() => {
      setCopiedId(a.id);
      toast("Referral link copied", "win");
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopiedId(null), 1600);
    }).catch(() => toast("Copy failed — long-press the link to copy it", "lose"));
  };
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pct, setPct] = useState(10);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    try {
      const a = await api<{ admins: AdminRow[] }>("/api/owner/admins");
      setAdmins(a.admins);
      setRollup(await api<{ days: RollupDay[]; totals: { deposits: number; totalAmount: number; totalCommission: number } }>("/api/owner/rollup"));
      setErr("");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not load owner panel.");
    }
  }, []);

  const loadDay = useCallback(async (d: string) => {
    try {
      const r = await api<{ date: string; admins: OwnerDayAdmin[]; totals: { deposits: number; totalAmount: number; totalCommission: number } }>(`/api/owner/commission?date=${d}`);
      setDayAdmins(r.admins);
      setDayTotals(r.totals);
    } catch {
      setDayAdmins(null);
      setDayTotals(null);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (date) void loadDay(date); }, [date, loadDay]);

  if (!user) {
    return (
      <main className="rg48-page-main"><div className="wrap">
        <h2>Owner <em>panel</em></h2>
        <p>Log in as the owner to see this panel.</p>
        <button className="btn btn-gold" type="button" onClick={() => openAuth("login")}>Log in</button>
      </div></main>
    );
  }
  if (err) {
    return (
      <main className="rg48-page-main"><div className="wrap">
        <h2>Owner <em>panel</em></h2>
        <p className="rg48-err">{err}</p>
        <p>Only the owner can open this panel.</p>
      </div></main>
    );
  }

  const addAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/owner/admins", { method: "POST", body: JSON.stringify({ name: name.trim(), email: email.trim(), password, commissionPct: pct }) });
      setName(""); setEmail(""); setPassword(""); setPct(10);
      toast("Admin added", "win");
      await load();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not add admin", "lose");
    } finally { setBusy(false); }
  };

  const savePct = async (id: string) => {
    const v = editing[id];
    if (v === undefined) return;
    try {
      await api(`/api/owner/admins/${id}`, { method: "PATCH", body: JSON.stringify({ commissionPct: v }) });
      toast("Commission % updated — future deposits only", "win");
      await load();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Update failed", "lose");
    }
  };
  const toggleActive = async (a: AdminRow) => {
    try {
      await api(`/api/owner/admins/${a.id}`, { method: "PATCH", body: JSON.stringify({ active: !a.active }) });
      toast(a.active ? "Admin deactivated" : "Admin reactivated", "win");
      await load();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Update failed", "lose");
    }
  };

  return (
    <main className="rg48-page-main">
      <div className="wrap">
        <div className="rg48-hbar-in">
          <Link className="gp-back" href="/" aria-label="Back"><span className="gp-back-coin">←</span></Link>
          <h2>Owner <em>panel</em></h2>
        </div>

        <section className="admin-sec">
          <h3>Overall totals</h3>
          {/* Round 31: was one plain sentence; now 3 stat tiles, same
              .sum-card style as the commission tiles below. */}
          {rollup && (
            <div className="sum-cards">
              <div className="sum-card"><span>Deposits</span><b>{rollup.totals.deposits}</b></div>
              <div className="sum-card"><span>Total deposited</span><b>{fmtCash(rollup.totals.totalAmount)}</b></div>
              <div className="sum-card"><span>Commission</span><b>{fmtCash(rollup.totals.totalCommission)}</b></div>
            </div>
          )}
        </section>

        <section className="admin-sec">
          <h3>Add admin</h3>
          <form className="owner-add" onSubmit={addAdmin}>
            <input type="text" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            <label>Commission % <input type="number" min={0} max={100} value={pct} onChange={(e) => setPct(Number(e.target.value))} /></label>
            <button className="btn btn-gold" type="submit" disabled={busy}>{busy ? "Adding…" : "Add admin"}</button>
          </form>
        </section>

        <section className="admin-sec">
          <h3>All admins ({admins.length})</h3>
          {admins.map((a) => (
            <div key={a.id} className="admin-row">
              <div>
                <b>{a.name}</b> <span>{a.email}</span> <span className={a.active ? "ok" : "bad"}>{a.active ? "Active" : "Deactivated"}</span>
                <div className="admin-meta">Codes: {a.codes.map((c) => c.code).join(", ") || "—"} · Referrals: {a.referralCount} · Coins given: {a.coinsGiven} · Commission all-time: {fmtCash(a.commissionAllTime)}</div>
              </div>
              <div className="admin-edit">
                <label>% <input type="number" min={0} max={100} defaultValue={a.commissionPct ?? 0} onChange={(e) => setEditing((ed) => ({ ...ed, [a.id]: Number(e.target.value) }))} /></label>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => void savePct(a.id)}>Save %</button>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => void toggleActive(a)}>{a.active ? "Deactivate" : "Reactivate"}</button>
                {a.codes.length > 0 && (
                  <button className={`btn btn-ghost btn-sm${copiedId === a.id ? " done" : ""}`} type="button" onClick={() => copyAdminLink(a)}>
                    {copiedId === a.id ? "Copied ✓" : "Copy referral link"}
                  </button>
                )}
                <Link className="btn btn-gold btn-sm" href={`/admin?preview=${a.id}`}>Preview panel</Link>
              </div>
            </div>
          ))}
        </section>

        <section className="admin-sec">
          <h3>Withdrawals{ownerWdPending > 0 ? ` (${ownerWdPending} pending)` : ""}</h3>
          <p className="rg48-sub">Every pending withdrawal, platform-wide. Requests only — no real money moves. Large amounts (over GH₵ 500) need your second approval after the admin’s.</p>
          <div className="money-chips" role="group" aria-label="Filter by status">
            <button type="button" className={!ownerWdStatus ? "on" : ""} onClick={() => setOwnerWdStatus("")}>All</button>
            {["pending", "admin_approved", "approved", "rejected"].map((s) => (
              <button key={s} type="button" className={ownerWdStatus === s ? "on" : ""} onClick={() => setOwnerWdStatus(s)}>{s === "admin_approved" ? "Awaiting owner" : s[0].toUpperCase() + s.slice(1)}</button>
            ))}
          </div>
          {ownerWd === null ? <p>Loading withdrawals…</p> : ownerWd.length === 0 ? (
            <p>No withdrawal requests.</p>
          ) : (
            <div className="wd-list">
              {ownerWd.map((w) => (
                <div key={w.id} className="wd-row">
                  <div className="wd-main">
                    <b>{w.userName}</b><span>{w.userContact || ""}</span>
                    <span className="wd-amt">{fmtCash(w.amount)} · {w.method}</span>
                    <span className="wd-date">{w.adminName ? `via ${w.adminName} · ` : ""}{new Date(w.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <span className={`wd-status wd-${w.status}`}>{w.status === "admin_approved" ? "Awaiting owner" : w.status}</span>
                  {w.reason ? <p className="wd-reason">Reason: {w.reason}</p> : null}
                  {(w.status === "pending" || w.status === "admin_approved") && (
                    <div className="wd-actions">
                      {w.status === "admin_approved" ? <span className="wd-note">Admin approved — your approval makes it final.</span> : null}
                      <button className="btn btn-gold btn-sm" type="button" disabled={ownerWdBusy === w.id} onClick={() => void decideOwnerWd(w, "approve")}>Approve</button>
                      <button className="btn btn-ghost btn-sm" type="button" disabled={ownerWdBusy === w.id} onClick={() => void decideOwnerWd(w, "reject")}>Reject</button>
                    </div>
                  )}
                  {ownerRejectId === w.id && (
                    <div className="wd-reject">
                      <input type="text" placeholder="Reason for rejection (required)" value={ownerRejectReason} onChange={(e) => setOwnerRejectReason(e.target.value)} aria-label="Rejection reason" />
                      <button className="btn btn-gold btn-sm" type="button" disabled={ownerWdBusy === w.id} onClick={() => void decideOwnerWd(w, "reject")}>Confirm reject</button>
                      <button className="btn btn-ghost btn-sm" type="button" onClick={() => { setOwnerRejectId(null); setOwnerRejectReason(""); }}>Cancel</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="admin-sec ow-commission">
          <h3>Commission</h3>
          <div className="ow-tabs" role="tablist" aria-label="Commission views">
            <button type="button" role="tab" id="ow-tab-per-day" aria-selected={tab === "per-day"} aria-controls="ow-panel-per-day" className={`ow-tab${tab === "per-day" ? " ow-tab-active" : ""}`} onClick={() => setTab("per-day")}>Per-day</button>
            <button type="button" role="tab" id="ow-tab-rollup" aria-selected={tab === "rollup"} aria-controls="ow-panel-rollup" className={`ow-tab${tab === "rollup" ? " ow-tab-active" : ""}`} onClick={() => setTab("rollup")}>All-admins rollup</button>
          </div>
          {tab === "per-day" ? (
            <div role="tabpanel" id="ow-panel-per-day" aria-labelledby="ow-tab-per-day">
              <label className="date-pick">Pick a day <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} /></label>
              {dayTotals && (
                <>
                  <div className="sum-cards">
                    <div className="sum-card"><span>Deposits</span><b>{dayTotals.deposits}</b></div>
                    <div className="sum-card"><span>Total deposited</span><b>{fmtCash(dayTotals.totalAmount)}</b></div>
                    <div className="sum-card"><span>Commission</span><b>{fmtCash(dayTotals.totalCommission)}</b></div>
                  </div>
                  <p className="ow-day-cap">Commission on {date}</p>
                </>
              )}
              {dayAdmins && dayAdmins.length === 0 && <p className="bh-empty">No deposits that day.</p>}
              {dayAdmins?.map((da) => (
                <div key={da.admin.id} className="day-admin">
                  <h4>{da.admin.name} — {fmtCash(da.totalAmount)} · {fmtCash(da.totalCommission)} commission</h4>
                  <div className="rg48-twrap">
                    <table className="dep-table">
                      <thead><tr><th>User</th><th>Contact</th><th>Amount</th><th>Time</th><th>Method</th><th>Commission</th></tr></thead>
                      <tbody>
                        {da.deposits.map((d) => (
                          <tr key={d.id}><td>{d.userName}</td><td>{d.userContact}</td><td>{fmtCash(d.amount)}</td><td>{new Date(d.time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</td><td>{d.method}</td><td>{fmtCash(d.commission)} ({d.pctInForce}%)</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div role="tabpanel" id="ow-panel-rollup" aria-labelledby="ow-tab-rollup">
              {!rollup || rollup.days.length === 0 ? <p>No commission days yet.</p> : (
                <div className="rg48-twrap">
                  <table className="dep-table">
                    <thead><tr><th>Date</th><th>Admin</th><th>Deposits</th><th>Total deposited</th><th>Commission</th></tr></thead>
                    <tbody>
                      {rollup.days.map((d, i) => (
                        <tr key={`${d.date}-${d.adminId}-${i}`}><td>{d.date}</td><td>{d.adminName}</td><td>{d.deposits}</td><td>{fmtCash(d.totalAmount)}</td><td>{fmtCash(d.totalCommission)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="admin-sec">
          <h3>Ledger</h3>
          <p className="rg48-sub">Every money movement, platform-wide — deposits, bets, withdrawals, adjustments, conversions. Built only from rows the tables actually hold.</p>
          <div className="money-filters">
            <label className="players-search">
              <input type="search" placeholder="Search by player or contact" value={ownerLedQ} onChange={(e) => setOwnerLedQ(e.target.value)} aria-label="Search ledger" />
            </label>
            <div className="money-chips" role="group" aria-label="Filter by type">
              <button type="button" className={!ownerLedType ? "on" : ""} onClick={() => setOwnerLedType("")}>All types</button>
              {["deposit", "bet", "withdrawal", "adjustment", "conversion"].map((t) => (
                <button key={t} type="button" className={ownerLedType === t ? "on" : ""} onClick={() => setOwnerLedType(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
              ))}
            </div>
            <div className="money-dates">
              <label>From <input type="date" value={ownerLedFrom} max={todayStr()} onChange={(e) => setOwnerLedFrom(e.target.value)} /></label>
              <label>To <input type="date" value={ownerLedTo} max={todayStr()} onChange={(e) => setOwnerLedTo(e.target.value)} /></label>
              <label>Admin
                <select value={ownerLedAdmin} onChange={(e) => setOwnerLedAdmin(e.target.value)} aria-label="Filter by admin">
                  <option value="">All admins</option>
                  {admins.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          {ownerLedTotals && (
            <div className="sum-cards">
              <div className="sum-card"><span>Rows</span><b>{ownerLedTotals.rows}</b></div>
              <div className="sum-card"><span>Cash in</span><b>{fmtCash(ownerLedTotals.cashIn)}</b></div>
              <div className="sum-card"><span>Cash out</span><b>{fmtCash(ownerLedTotals.cashOut)}</b></div>
            </div>
          )}
          {ownerLedger === null ? <p>Loading ledger…</p> : ownerLedger.length === 0 ? (
            <p>No money movements yet.</p>
          ) : (
            <div className="ledger-list">
              {ownerLedger.map((r) => {
                const sign = r.amount > 0 ? "+" : r.amount < 0 ? "−" : "";
                const abs = Math.abs(r.amount);
                const amt = r.wallet === "coins" ? `${sign}${Math.round(abs)} coins` : `${sign}${fmtCash(abs)}`;
                return (
                  <div key={r.id} className="ledger-row">
                    <span className="ledger-txt">
                      <b>{r.userName} <span className={`ledger-type ledger-${r.type}`}>{r.type}</span></b>
                      <span>{r.detail}{r.reason ? ` — ${r.reason}` : ""}{r.status ? ` · ${r.status}` : ""}{r.adminName ? ` · ${r.adminName}` : ""}</span>
                      <span>{new Date(r.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    </span>
                    <b className={r.amount >= 0 ? "ledger-in" : "ledger-out"}>{amt}</b>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
