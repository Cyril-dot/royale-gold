// Admin panel — own code(s) + create/share with copy, referred users,
// coins given, DAILY COMMISSION tab: summary cards (Today/Yesterday/7d/
// 30d/all-time), HISTORY table (every active day, newest first), DATE
// PICKER for any day (empty day shows zeros + "no deposits that day"),
// DAY DETAIL (every deposit: name, contact, amount, time, method,
// commission), USER DETAIL on tap.

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, fmtCash } from "../lib/api";
import { useStore } from "../lib/store";

export interface AdminOverview {
  admin: { id: string; name: string; email: string; commissionPct: number; active: boolean };
  codes: { id: string; code: string; active: boolean; createdAt: string }[];
  referredUsers: { id: string; name: string; email: string | null; phone: string | null; referralCodeUsed: string | null; createdAt: string }[];
  coinsGiven: number;
  redemptions: number;
  commission: { today: number; yesterday: number; last7d: number; last30d: number; allTime: number };
  history: { date: string; deposits: number; totalAmount: number; totalCommission: number }[];
}
interface DayDetail {
  date: string;
  deposits: { id: string; userId: string; userName: string; userContact: string; amount: number; method: string; pctInForce: number; commission: number; time: string }[];
  totals: { deposits: number; totalAmount: number; totalCommission: number };
}
interface UserDetail {
  user: { id: string; name: string; email: string | null; phone: string | null; role: string; cash: number; coins: number; joinedAt: string; referralCodeUsed: string | null; referringAdmin: { id: string; name: string; email: string } | null };
  deposits: { id: string; amount: number; method: string; pctInForce: number; commission: number; createdAt: string }[];
  totals: { deposits: number; totalDeposited: number; totalCommission: number; coinsGiven: number };
}

export function todayStr() { return new Date().toISOString().slice(0, 10); }

export function copyText(t: string) {
  if (navigator.clipboard) return navigator.clipboard.writeText(t);
  const ta = document.createElement("textarea");
  ta.value = t;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
  return Promise.resolve();
}

export default function AdminPanel({ previewAdminId, previewName }: { previewAdminId?: string; previewName?: string }) {
  const { user, openAuth, toast } = useStore();
  const [ov, setOv] = useState<AdminOverview | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"codes" | "commission">("codes");
  const [date, setDate] = useState("");
  useEffect(() => { setDate(todayStr()); }, []);
  const [day, setDay] = useState<DayDetail | null>(null);
  const [userDetail, setUserDetail] = useState<UserDetail | null>(null);
  const [newCode, setNewCode] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const url = previewAdminId ? `/api/owner/admins/${previewAdminId}/preview` : "/api/admin/overview";
      setOv(await api<AdminOverview>(url));
      setErr("");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not load admin panel.");
    }
  }, [previewAdminId]);

  const loadDay = useCallback(async (d: string) => {
    try {
      const url = previewAdminId ? `/api/owner/commission?adminId=${previewAdminId}&date=${d}` : `/api/admin/commission?date=${d}`;
      setDay(await api<DayDetail>(url));
    } catch {
      setDay(null);
    }
  }, [previewAdminId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (tab === "commission" && date) void loadDay(date); }, [tab, date, loadDay]);

  const createCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/admin/codes", { method: "POST", body: JSON.stringify({ code: newCode.trim() || undefined }) });
      setNewCode("");
      toast("Referral code created", "win");
      await load();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not create code", "lose");
    } finally { setBusy(false); }
  };

  const openUser = async (id: string) => {
    try {
      setUserDetail(await api<UserDetail>(`/api/admin/users/${id}`));
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not load user", "lose");
    }
  };

  if (!user) {
    return (
      <main className="rg48-page-main">
        <div className="wrap">
          <h2>Admin <em>panel</em></h2>
          <p>Log in as an admin or the owner to see this panel.</p>
          <button className="btn btn-gold" type="button" onClick={() => openAuth("login")}>Log in</button>
        </div>
      </main>
    );
  }
  if (err) {
    return (
      <main className="rg48-page-main">
        <div className="wrap"><h2>Admin <em>panel</em></h2><p className="rg48-err">{err}</p><p>Only admins can open this panel. The owner previews any admin from the Owner panel.</p></div>
      </main>
    );
  }
  if (!ov) return <main className="rg48-page-main"><div className="wrap"><p>Loading admin panel…</p></div></main>;

  const shareLink = (code: string) => `${typeof window !== "undefined" ? window.location.origin : ""}/register?ref=${code}`;

  return (
    <main className="rg48-page-main">
      <div className="wrap">
        <div className="rg48-hbar-in">
          <Link className="gp-back" href="/" aria-label="Back"><span className="gp-back-coin">←</span></Link>
          <h2>Admin <em>panel</em></h2>
          {previewName && <span className="rg48-mini">Previewing {previewName}</span>}
        </div>
        <p className="rg48-sub">{ov.admin.name} · {ov.admin.email} · {ov.admin.commissionPct}% commission {ov.admin.active ? "" : "· DEACTIVATED"}</p>

        <div className="rg48-tabs" role="group" aria-label="Admin panel tabs">
          <button type="button" aria-pressed={tab === "codes"} onClick={() => setTab("codes")}>Codes &amp; referrals</button>
          <button type="button" aria-pressed={tab === "commission"} onClick={() => setTab("commission")}>Daily commission</button>
        </div>

        {tab === "codes" && (
          <>
            <section className="admin-sec">
              <h3>Your referral codes</h3>
              {ov.codes.length === 0 && <p>No codes yet — create one below.</p>}
              {ov.codes.map((c) => (
                <div key={c.id} className="code-row">
                  <b className="code-chip">{c.code}</b>
                  <span className="code-state">{c.active ? "Active" : "Inactive"}</span>
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => { void copyText(shareLink(c.code)); toast("Share link copied", "win"); }}>Copy share link</button>
                  <span className="code-link">{shareLink(c.code)}</span>
                </div>
              ))}
              <form className="code-form" onSubmit={createCode}>
                <input type="text" placeholder="Custom code e.g. RG-GOLD1 (blank = auto)" value={newCode} onChange={(e) => setNewCode(e.target.value.toUpperCase())} pattern="RG-[A-Z0-9]{4,12}" title="RG- followed by 4–12 letters or digits" />
                <button className="btn btn-gold" type="submit" disabled={busy}>{busy ? "Creating…" : "Create code"}</button>
              </form>
            </section>
            <section className="admin-sec">
              <h3>Referred users ({ov.referredUsers.length}) · {ov.coinsGiven} coins given · {ov.redemptions} redemptions</h3>
              {ov.referredUsers.length === 0 ? <p>No referred users yet — share a code to start.</p> : (
                <div className="user-list">
                  {ov.referredUsers.map((u) => (
                    <button key={u.id} type="button" className="user-row" onClick={() => void openUser(u.id)}>
                      <b>{u.name}</b><span>{u.email || u.phone || "—"}</span><span className="code-chip sm">{u.referralCodeUsed || ""}</span><span>Joined {new Date(u.createdAt).toLocaleDateString("en-GB")}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {tab === "commission" && (
          <>
            <section className="admin-sec">
              <h3>Commission summary</h3>
              <div className="sum-cards">
                <div className="sum-card"><span>Today</span><b>{fmtCash(ov.commission.today)}</b></div>
                <div className="sum-card"><span>Yesterday</span><b>{fmtCash(ov.commission.yesterday)}</b></div>
                <div className="sum-card"><span>Last 7 days</span><b>{fmtCash(ov.commission.last7d)}</b></div>
                <div className="sum-card"><span>Last 30 days</span><b>{fmtCash(ov.commission.last30d)}</b></div>
                <div className="sum-card"><span>All time</span><b>{fmtCash(ov.commission.allTime)}</b></div>
              </div>
            </section>
            <section className="admin-sec">
              <h3>Day detail</h3>
              <label className="date-pick">Pick a day <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} /></label>
              {day ? (
                <>
                  <p className="day-totals">{day.totals.deposits} deposits · {fmtCash(day.totals.totalAmount)} deposited · {fmtCash(day.totals.totalCommission)} commission on {day.date}</p>
                  {day.deposits.length === 0 ? (
                    <p className="bh-empty">No deposits that day.</p>
                  ) : (
                    <table className="dep-table">
                      <thead><tr><th>User</th><th>Contact</th><th>Amount</th><th>Time</th><th>Method</th><th>Commission</th></tr></thead>
                      <tbody>
                        {day.deposits.map((d) => (
                          <tr key={d.id} onClick={() => void openUser(d.userId)} className="clickable">
                            <td>{d.userName}</td><td>{d.userContact}</td><td>{fmtCash(d.amount)}</td><td>{new Date(d.time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</td><td>{d.method}</td><td>{fmtCash(d.commission)} ({d.pctInForce}%)</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              ) : <p>Loading day…</p>}
            </section>
            <section className="admin-sec">
              <h3>History — every active day</h3>
              {ov.history.length === 0 ? <p>No commission days yet.</p> : (
                <table className="dep-table">
                  <thead><tr><th>Date</th><th>Deposits</th><th>Total deposited</th><th>Commission</th></tr></thead>
                  <tbody>
                    {ov.history.map((h) => (
                      <tr key={h.date} onClick={() => { setDate(h.date); }} className="clickable">
                        <td>{h.date}</td><td>{h.deposits}</td><td>{fmtCash(h.totalAmount)}</td><td>{fmtCash(h.totalCommission)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </>
        )}

        {userDetail && (
          <section className="admin-sec user-detail" role="dialog" aria-label="User detail">
            <button className="icon-btn" type="button" aria-label="Close user detail" onClick={() => setUserDetail(null)}>✕</button>
            <h3>{userDetail.user.name}</h3>
            <p>{userDetail.user.email || userDetail.user.phone || "—"} · Joined {new Date(userDetail.user.joinedAt).toLocaleDateString("en-GB")} · Code used: {userDetail.user.referralCodeUsed || "—"} · Referring admin: {userDetail.user.referringAdmin?.name || "—"}</p>
            <p>Cash {fmtCash(userDetail.user.cash)} · Coins {userDetail.user.coins} · Role {userDetail.user.role}</p>
            <p>Totals: {userDetail.totals.deposits} deposits · {fmtCash(userDetail.totals.totalDeposited)} deposited · {fmtCash(userDetail.totals.totalCommission)} commission · {userDetail.totals.coinsGiven} coins given</p>
            <h4>Full deposit history</h4>
            {userDetail.deposits.length === 0 ? <p>No deposits yet.</p> : (
              <table className="dep-table">
                <thead><tr><th>Amount</th><th>Method</th><th>%</th><th>Commission</th><th>Date</th></tr></thead>
                <tbody>
                  {userDetail.deposits.map((d) => (
                    <tr key={d.id}><td>{fmtCash(d.amount)}</td><td>{d.method}</td><td>{d.pctInForce}%</td><td>{fmtCash(d.commission)}</td><td>{new Date(d.createdAt).toLocaleDateString("en-GB")}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
