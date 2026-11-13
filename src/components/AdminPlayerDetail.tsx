// Admin dashboard — Player detail (client part, round 11). One player as
// a real page: name, contact, balances, totals, full deposit history.
// Reached from the referred-users list and from day-detail rows. Same
// endpoint as the old user-detail overlay (/api/admin/users/[id]).
// The route wrapper (src/app/admin/players/[id]/page.tsx) is a server
// component that passes the id in — this file stays a client component
// because it reads ?preview= and the store.

"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, fmtCash } from "../lib/api";
import { useStore } from "../lib/store";
import { useAdminOverview, type UserDetail } from "../lib/admin-client";
import { AdminNav, AdminPreviewBanner, AdminLoginPrompt, AdminError } from "./AdminNav";

export default function AdminPlayerDetail({ id }: { id: string }) {
  const { user } = useStore();
  const router = useRouter();
  const sp = useSearchParams();
  const previewId = sp.get("preview");
  const { ov, err } = useAdminOverview(previewId);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [detailErr, setDetailErr] = useState("");

  useEffect(() => {
    let live = true;
    api<UserDetail>(`/api/admin/users/${id}`)
      .then((d) => { if (live) setDetail(d); })
      .catch((ex) => { if (live) setDetailErr(ex instanceof Error ? ex.message : "Could not load this player."); });
    return () => { live = false; };
  }, [id]);

  if (!user) return <AdminLoginPrompt />;
  if (err) return <AdminError err={err} />;

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
      {previewId && ov ? <AdminPreviewBanner name={ov.admin.name} /> : null}
      <div className="rg48-hbar-in">{back}<h2>{u.name}</h2></div>
      <p className="rg48-sub">{u.email || u.phone || "—"} · Joined {new Date(u.joinedAt).toLocaleDateString("en-GB")} · Code used: {u.referralCodeUsed || "—"} · Referring admin: {u.referringAdmin?.name || "—"}</p>
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
