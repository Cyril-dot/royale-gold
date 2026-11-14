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
      </div>
    </main>
  );
}
