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
import { useAdminOverview } from "../../lib/admin-client";
import { AdminNav, AdminPreviewBanner, AdminLoginPrompt, AdminError } from "../../components/AdminNav";

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

  if (!user) return <AdminLoginPrompt />;
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
