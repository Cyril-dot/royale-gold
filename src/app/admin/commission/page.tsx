// Admin dashboard — Commission (round 11). Day detail (date picker +
// deposits table) and history (every active day) behind tabs (Round 31:
// same treatment as the owner commission tabs, Round 30). A deposit row opens
// the player as a real page (/admin/players/[id]); a history row picks
// that day. Same endpoints as the old commission tab.

"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { fmtCash } from "../../../lib/api";
import { useStore } from "../../../lib/store";
import { useAdminOverview, useAdminDay, todayStr } from "../../../lib/admin-client";
import { AdminNav, AdminPreviewBanner, AdminLoginPrompt, AdminError } from "../../../components/AdminNav";

export default function AdminCommissionPage() {
  return (
    <main className="rg48-page-main rg23">
      <div className="wrap">
        <Suspense fallback={null}>
          <AdminCommissionInner />
        </Suspense>
      </div>
    </main>
  );
}

function AdminCommissionInner() {
  const { user } = useStore();
  const router = useRouter();
  const sp = useSearchParams();
  const previewId = sp.get("preview");
  const { ov, err } = useAdminOverview(previewId);
  const [date, setDate] = useState(() => sp.get("date") || todayStr());
  const { day } = useAdminDay(previewId, date);
  // Round 31: the Day detail and History views were stacked cards on one
  // long page; now a tab bar switches between them (same treatment as
  // the owner commission tabs, Round 30). The other view unmounts.
  const [tab, setTab] = useState<"day" | "history">("day");

  if (!user) return <AdminLoginPrompt />;
  if (err) return <AdminError err={err} />;
  if (!ov) return <p>Loading admin panel…</p>;

  const playerHref = (id: string) => (previewId ? `/admin/players/${id}?preview=${previewId}` : `/admin/players/${id}`);
  const goPlayer = (id: string) => router.push(playerHref(id));

  return (
    <>
      {previewId ? <AdminPreviewBanner name={ov.admin.name} /> : null}
      <div className="rg48-hbar-in">
        <Link className="gp-back" href={previewId ? `/admin?preview=${previewId}` : "/admin"} aria-label="Back to admin overview"><span className="gp-back-coin">←</span></Link>
        <h2>Commission</h2>
      </div>
      <p className="rg48-sub">{ov.admin.name} · {ov.admin.email} · {ov.admin.commissionPct}% commission{ov.admin.active ? "" : " · DEACTIVATED"}</p>
      <AdminNav />
      <section className="admin-sec ac-commission">
        <h3>Commission</h3>
        <div className="ac-tabs" role="tablist" aria-label="Commission views">
          <button type="button" role="tab" id="ac-tab-day" aria-selected={tab === "day"} aria-controls="ac-panel-day" className={`ac-tab${tab === "day" ? " ac-tab-active" : ""}`} onClick={() => setTab("day")}>Day detail</button>
          <button type="button" role="tab" id="ac-tab-history" aria-selected={tab === "history"} aria-controls="ac-panel-history" className={`ac-tab${tab === "history" ? " ac-tab-active" : ""}`} onClick={() => setTab("history")}>History</button>
        </div>
        {tab === "day" ? (
          <div role="tabpanel" id="ac-panel-day" aria-labelledby="ac-tab-day">
            <label className="date-pick">Pick a day <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} /></label>
            {day ? (
              <>
                <div className="sum-cards">
                  <div className="sum-card"><span>Deposits</span><b>{day.totals.deposits}</b></div>
                  <div className="sum-card"><span>Total deposited</span><b>{fmtCash(day.totals.totalAmount)}</b></div>
                  <div className="sum-card"><span>Commission</span><b>{fmtCash(day.totals.totalCommission)}</b></div>
                </div>
                <p className="ac-day-cap">Commission on {day.date}</p>
                {day.deposits.length === 0 ? (
                  <p className="bh-empty">No deposits that day.</p>
                ) : (
                  <div className="rg48-twrap">
                    <table className="dep-table">
                      <thead><tr><th>User</th><th>Contact</th><th>Amount</th><th>Time</th><th>Method</th><th>Commission</th></tr></thead>
                      <tbody>
                        {day.deposits.map((d) => (
                          <tr key={d.id} onClick={() => goPlayer(d.userId)} onKeyDown={(e) => { if (e.key === "Enter") goPlayer(d.userId); }} tabIndex={0} className="clickable">
                            <td>{d.userName}</td><td>{d.userContact}</td><td>{fmtCash(d.amount)}</td><td>{new Date(d.time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</td><td>{d.method}</td><td>{fmtCash(d.commission)} ({d.pctInForce}%)</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : <p>Loading day…</p>}
          </div>
        ) : (
          <div role="tabpanel" id="ac-panel-history" aria-labelledby="ac-tab-history">
            {ov.history.length === 0 ? <p>No commission days yet.</p> : (
              <div className="rg48-twrap">
                <table className="dep-table">
                  <thead><tr><th>Date</th><th>Deposits</th><th>Total deposited</th><th>Commission</th></tr></thead>
                  <tbody>
                    {ov.history.map((h) => (
                      <tr key={h.date} onClick={() => { setDate(h.date); setTab("day"); }} onKeyDown={(e) => { if (e.key === "Enter") { setDate(h.date); setTab("day"); } }} tabIndex={0} className="clickable">
                        <td>{h.date}</td><td>{h.deposits}</td><td>{fmtCash(h.totalAmount)}</td><td>{fmtCash(h.totalCommission)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>
    </>
  );
}
