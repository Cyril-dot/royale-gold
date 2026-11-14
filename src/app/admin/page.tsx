// Admin dashboard — Overview (round 11). One job: the commission summary
// + at-a-glance + latest commission days. Referrals live at
// /admin/referrals, day detail + history at /admin/commission, and a
// player at /admin/players/[id]. Same endpoints and section markup as
// the old single-page panel — only re-housed.

"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useStore } from "../../lib/store";
import { fmtCash } from "../../lib/api";
import { useAdminOverview, useAdminDashboard } from "../../lib/admin-client";
import { canAccessSection } from "../../lib/rbac";
import { AdminNav, AdminPreviewBanner, AdminLoginPrompt, AdminError, AdminDenied } from "../../components/AdminNav";

export default function AdminOverviewPage() {
  return (
    <main className="rg48-page-main rg23 admin-fb">
      <div className="wrap">
        <Suspense fallback={null}>
          <AdminOverviewInner />
        </Suspense>
      </div>
    </main>
  );
}

function AdminOverviewInner() {
  const { user } = useStore();
  const sp = useSearchParams();
  const previewId = sp.get("preview");
  const { ov, err } = useAdminOverview(previewId);
  // P0 Batch 4 (A1): the enhanced dashboard — "today so far", the last
  // 7 days of deposits, and the top 5 players by total deposited.
  const { dash, err: dashErr } = useAdminDashboard(previewId);

  if (!user) return <AdminLoginPrompt />;
  // P0 Batch 3 (O3): the server 403s this section too.
  if (!previewId && !canAccessSection(user, "overview")) return <AdminDenied section="overview" />;
  if (err) return <AdminError err={err} />;
  if (!ov) return <p>Loading admin panel…</p>;

  const c = ov.commission;
  const latest = ov.history.slice(0, 5);
  const commissionHref = (date: string) =>
    previewId ? `/admin/commission?preview=${previewId}&date=${date}` : `/admin/commission?date=${date}`;
  const card = (label: string, value: string) => (
    <div className="sum-card"><span>{label}</span><b>{value}</b></div>
  );

  return (
    <>
      {previewId ? <AdminPreviewBanner name={ov.admin.name} /> : null}
      <div className="rg48-hbar-in">
        <h2>Admin <em>panel</em></h2>
      </div>
      <p className="rg48-sub">{ov.admin.name} · {ov.admin.email} · {ov.admin.commissionPct}% commission{ov.admin.active ? "" : " · DEACTIVATED"}</p>
      <AdminNav />
      <section className="admin-sec">
        <h3>Commission summary</h3>
        <div className="sum-cards">
          {card("Today", fmtCash(c.today))}
          {card("Yesterday", fmtCash(c.yesterday))}
          {card("Last 7 days", fmtCash(c.last7d))}
          {card("Last 30 days", fmtCash(c.last30d))}
          {card("All time", fmtCash(c.allTime))}
        </div>
      </section>
      <section className="admin-sec">
        <h3>At a glance</h3>
        <div className="sum-cards">
          {card("Active codes", String(ov.codes.filter((x) => x.active).length))}
          {card("Referred users", String(ov.referredUsers.length))}
          {card("Coins given", String(ov.coinsGiven))}
        </div>
      </section>
      {/* P0 Batch 4 (A1): "today so far", the 7-day deposits chart, and
          the top 5 players by total deposited — all from the real
          tables, nothing invented. */}
      {dash ? (
        <>
          <section className="admin-sec">
            <h3>Today so far</h3>
            <div className="sum-cards">
              {card("Deposits today", String(dash.today.deposits))}
              {card("Deposited today", fmtCash(dash.today.depositsTotal))}
              {card("New players", String(dash.today.newPlayers))}
              {card("Active players", String(dash.today.activePlayers))}
              {card("Commission today", fmtCash(dash.today.commission))}
            </div>
          </section>
          <section className="admin-sec">
            <h3>Last 7 days — deposits (GH₵)</h3>
            <div className="b4-chart" role="img" aria-label={`Deposits by day for the last 7 days, totalling ${fmtCash(dash.week.reduce((s, d) => s + d.total, 0))}`}>
              {(() => {
                const max = Math.max(1, ...dash.week.map((d) => d.total));
                return dash.week.map((d) => (
                  <div key={d.date} className="b4-bar-col">
                    <span className="b4-bar-val">{d.total > 0 ? d.total.toFixed(2) : "—"}</span>
                    <div className="b4-bar-track">
                      <div className="b4-bar" style={{ height: `${Math.max(3, Math.round((d.total / max) * 100))}%` }} />
                    </div>
                    <span className="b4-bar-day">{new Date(d.date + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric" })}</span>
                  </div>
                ));
              })()}
            </div>
          </section>
          <section className="admin-sec">
            <h3>Top players by deposits</h3>
            {dash.topPlayers.length === 0 ? (
              <p>No deposits from your players yet.</p>
            ) : (
              <div className="rg48-twrap">
                <table className="dep-table">
                  <thead><tr><th>Player</th><th>Deposits</th><th>Total deposited</th></tr></thead>
                  <tbody>
                    {dash.topPlayers.map((p, i) => (
                      <tr key={p.id}>
                        <td>{i + 1}. <Link href={previewId ? `/admin/players/${p.id}?preview=${previewId}` : `/admin/players/${p.id}`}>{p.name}</Link></td>
                        <td>{p.deposits}</td>
                        <td>{fmtCash(p.totalDeposited)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : dashErr ? (
        <p className="rg48-sub">Could not load today’s figures.</p>
      ) : null}
      <section className="admin-sec">
        <h3>Latest commission days</h3>
        {latest.length === 0 ? (
          <p>No commission days yet.</p>
        ) : (
          <div className="rg48-twrap">
            <table className="dep-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Deposits</th>
                  <th>Commission</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {latest.map((d) => (
                  <tr key={d.date}>
                    <td>{d.date}</td>
                    <td>{d.deposits}</td>
                    <td>{fmtCash(d.totalCommission)}</td>
                    <td><Link href={commissionHref(d.date)}>View</Link></td>
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
