// Owner BI & cohorts (Phase 2) — split out of the old one-page owner panel
// (src/app/owner/legacy/page.tsx). Same sections, same endpoints, same
// behaviour — now its own route, loading only its own data.
"use client";

import { useCallback, useEffect, useState } from "react";
import { api, fmtMoney } from "../../../../lib/api";
import { todayStr } from "../../../../lib/admin-client";
import { useStore } from "../../../../lib/store";
import { useOwner } from "../../../../components/owner/OwnerContext";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";

export default function OwnerBiPage() {
  const { user } = useStore();
  const { fiat } = useOwner();
  // P1 Batch 3 (O16/O17): revenue breakdowns + RTP monitor — one shared
  // period, so the two sections always agree on the dates they show.
  interface RevenueGameRow { game: string; name: string; currency: string; rounds: number; stakes: number; payouts: number; ggr: number }
  interface RevenueAdminRow { adminId: string | null; adminName: string; deposits: number; totalDeposited: number; commission: number; ggr: number }
  interface RevenueDayRow { date: string; ggr: number; deposits: number; totalDeposited: number; commission: number }
  interface RevenueMethodRow { method: string; deposits: number; total: number }
  interface RevenueData { from: string; to: string; byGameCash: RevenueGameRow[]; byGameCoins: RevenueGameRow[]; byAdmin: RevenueAdminRow[]; byDay: RevenueDayRow[]; byMethod: RevenueMethodRow[]; totals: { ggrCash: number; ggrCoins: number; deposits: number; totalDeposited: number; commission: number } }
  const [anPreset, setAnPreset] = useState<"today" | "week" | "month" | "custom">("month");
  const [anFrom, setAnFrom] = useState("");
  const [anTo, setAnTo] = useState("");
  const [revenue, setRevenue] = useState<RevenueData | null>(null);

  // O26: advanced BI & cohorts — players by joining month, with
  // activity, deposits, stakes, GGR, average deposit + a month-1/2/3
  // retention curve. Read from the real tables, no analytics store.
  interface CohortRow { cohort: string; players: number; activePct: number; totalDeposited: number; totalStaked: number; ggr: number; avgDeposit: number; retention: { m1: number | null; m2: number | null; m3: number | null } }
  const [bi, setBi] = useState<{ cohorts: CohortRow[]; totalPlayers: number } | null>(null);
  const loadBi = useCallback(async () => {
    try { setBi(await api<{ cohorts: CohortRow[]; totalPlayers: number }>(`/api/owner/bi?currency=${fiat}`)); } catch { setBi(null); }
  }, [fiat]);
  useEffect(() => { if (user) void loadBi(); }, [loadBi, user]);

  const loadSplit = useCallback(async () => {
    const today = todayStr();
    let from = today;
    let to = today;
    if (anPreset === "week") {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - 6);
      from = d.toISOString().slice(0, 10);
    } else if (anPreset === "month") {
      from = `${today.slice(0, 8)}01`;
    } else if (anPreset === "custom") {
      from = anFrom || today;
      to = anTo || today;
    }
    try {
      setRevenue(await api<RevenueData>(`/api/owner/revenue?from=${from}&to=${to}&currency=${fiat}`));
    } catch { setRevenue(null); }
  }, [anPreset, anFrom, anTo, fiat]);
  useEffect(() => { if (user) void loadSplit(); }, [loadSplit, user]);
  return (
    <div>
      <PageHeader title="BI & cohorts" sub="Revenue breakdowns and player cohorts." />
      <OwnerRangeBar />
      <section className="admin-sec">
      <h3>Revenue breakdowns</h3>
      <div className="money-chips" role="group" aria-label="Analytics period">
        {(["today", "week", "month", "custom"] as const).map((p) => (
          <button key={p} type="button" className={anPreset === p ? "on" : ""} onClick={() => setAnPreset(p)}>
            {p === "today" ? "Today" : p === "week" ? "Last 7 days" : p === "month" ? "This month" : "Custom"}
          </button>
        ))}
      </div>
      {anPreset === "custom" && (
        <div className="money-dates">
          <label>From <input type="date" value={anFrom} max={todayStr()} onChange={(e) => setAnFrom(e.target.value)} /></label>
          <label>To <input type="date" value={anTo} max={todayStr()} onChange={(e) => setAnTo(e.target.value)} /></label>
        </div>
      )}
      {revenue === null ? <p>Loading revenue…</p> : (
        <>
          <div className="sum-cards">
            <div className="sum-card"><span>GGR (cash)</span><b>{fmtMoney(revenue.totals.ggrCash, fiat)}</b></div>
            <div className="sum-card"><span>GGR (coins)</span><b>{revenue.totals.ggrCoins} coins</b></div>
            <div className="sum-card"><span>Deposits</span><b>{fmtMoney(revenue.totals.totalDeposited, fiat)}</b></div>
            <div className="sum-card"><span>Commission</span><b>{fmtMoney(revenue.totals.commission, fiat)}</b></div>
          </div>
          <h4>By game — cash (top 5 by GGR are the first five rows)</h4>
          {revenue.byGameCash.length === 0 ? <p>No cash rounds in this period.</p> : (
            <div className="rg48-twrap">
              <table className="dep-table">
                <thead><tr><th>Game</th><th>Rounds</th><th>Stakes</th><th>Payouts</th><th>GGR</th></tr></thead>
                <tbody>
                  {revenue.byGameCash.map((g) => (
                    <tr key={g.game}><td>{g.name}</td><td>{g.rounds}</td><td>{fmtMoney(g.stakes, fiat)}</td><td>{fmtMoney(g.payouts, fiat)}</td><td>{fmtMoney(g.ggr, fiat)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <h4>By game — coins</h4>
          {revenue.byGameCoins.length === 0 ? <p>No coin rounds in this period.</p> : (
            <div className="rg48-twrap">
              <table className="dep-table">
                <thead><tr><th>Game</th><th>Rounds</th><th>Stakes</th><th>Payouts</th><th>GGR</th></tr></thead>
                <tbody>
                  {revenue.byGameCoins.map((g) => (
                    <tr key={g.game}><td>{g.name}</td><td>{g.rounds}</td><td>{g.stakes} coins</td><td>{g.payouts} coins</td><td>{g.ggr} coins</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <h4>By admin</h4>
          <div className="rg48-twrap">
            <table className="dep-table">
              <thead><tr><th>Admin</th><th>Deposits</th><th>Deposited</th><th>Commission</th><th>GGR</th></tr></thead>
              <tbody>
                {revenue.byAdmin.map((a) => (
                  <tr key={a.adminId ?? "none"}><td>{a.adminName}</td><td>{a.deposits}</td><td>{fmtMoney(a.totalDeposited, fiat)}</td><td>{fmtMoney(a.commission, fiat)}</td><td>{fmtMoney(a.ggr, fiat)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <h4>By day</h4>
          {revenue.byDay.length === 0 ? <p>No days in this period.</p> : (
            <>
              <div className="p1b3-bars" aria-label="Daily GGR bar chart">
                {revenue.byDay.map((d) => {
                  const max = Math.max(0, ...revenue.byDay.map((x) => x.ggr));
                  const w = max > 0 && d.ggr > 0 ? Math.round((d.ggr / max) * 100) : 0;
                  return (
                    <div key={d.date} className="p1b3-bar-row">
                      <span className="p1b3-bar-label">{d.date.slice(5)}</span>
                      <span className="p1b3-bar-track"><span className="p1b3-bar-fill" style={{ width: `${w}%` }} /></span>
                      <b className="p1b3-bar-val">{fmtMoney(d.ggr, fiat)}</b>
                    </div>
                  );
                })}
              </div>
              <div className="rg48-twrap">
                <table className="dep-table">
                  <thead><tr><th>Date</th><th>GGR</th><th>Deposits</th><th>Deposited</th><th>Commission</th></tr></thead>
                  <tbody>
                    {revenue.byDay.map((d) => (
                      <tr key={d.date}><td>{d.date}</td><td>{fmtMoney(d.ggr, fiat)}</td><td>{d.deposits}</td><td>{fmtMoney(d.totalDeposited, fiat)}</td><td>{fmtMoney(d.commission, fiat)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <h4>By payment method</h4>
          {revenue.byMethod.length === 0 ? <p>No deposits in this period.</p> : (
            <div className="rg48-twrap">
              <table className="dep-table">
                <thead><tr><th>Method</th><th>Deposits</th><th>Total</th></tr></thead>
                <tbody>
                  {revenue.byMethod.map((m) => (
                    <tr key={m.method}><td>{m.method}</td><td>{m.deposits}</td><td>{fmtMoney(m.total, fiat)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      </section>

      <section className="admin-sec">
      <h3>BI &amp; cohorts</h3>
      {bi === null ? <p>Loading cohorts…</p> : bi.cohorts.length === 0 ? (
        <p>No players yet.</p>
      ) : (
        <>
          <div className="sum-cards">
            <div className="sum-card"><span>Players</span><b>{bi.totalPlayers}</b></div>
            <div className="sum-card"><span>Cohorts</span><b>{bi.cohorts.length}</b></div>
          </div>
          <div className="rg48-twrap">
            <table className="dep-table">
              <thead><tr><th>Cohort</th><th>Players</th><th>Active (30d)</th><th>Deposited</th><th>Staked</th><th>GGR</th><th>Avg deposit</th></tr></thead>
              <tbody>
                {bi.cohorts.map((c) => (
                  <tr key={c.cohort}>
                    <td>{c.cohort}</td>
                    <td>{c.players}</td>
                    <td>{c.activePct}%</td>
                    <td>{fmtMoney(c.totalDeposited, fiat)}</td>
                    <td>{fmtMoney(c.totalStaked, fiat)}</td>
                    <td>{fmtMoney(c.ggr, fiat)}</td>
                    <td>{fmtMoney(c.avgDeposit, fiat)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h4>Retention curve</h4>
          <div className="rg48-twrap">
            <table className="dep-table">
              <thead><tr><th>Cohort</th><th>Month 1</th><th>Month 2</th><th>Month 3</th></tr></thead>
              <tbody>
                {bi.cohorts.map((c) => (
                  <tr key={c.cohort}>
                    <td>{c.cohort}</td>
                    <td>{c.retention.m1 === null ? "—" : `${c.retention.m1}%`}</td>
                    <td>{c.retention.m2 === null ? "—" : `${c.retention.m2}%`}</td>
                    <td>{c.retention.m3 === null ? "—" : `${c.retention.m3}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => void loadBi()}>Refresh cohorts</button>
        </>
      )}
      </section>
    </div>
  );
}
