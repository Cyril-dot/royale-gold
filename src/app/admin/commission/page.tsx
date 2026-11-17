// Admin dashboard — Commission (round 11). Day detail (date picker +
// deposits table) and history (every active day) behind tabs (Round 31:
// same treatment as the owner commission tabs, Round 30). A deposit row opens
// the player as a real page (/admin/players/[id]); a history row picks
// that day. Same endpoints as the old commission tab.

"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { fmtMoney } from "../../../lib/api";
import CurrencyChips from "../../../components/CurrencyChips";
import { useStore } from "../../../lib/store";
import { useAdminContext, useAdminDay, useAdminHistory, todayStr } from "../../../lib/admin-client";
import { canAccessSection } from "../../../lib/rbac";
import { AdminNav, AdminPreviewBanner, AdminLoginPrompt, AdminError, AdminDenied } from "../../../components/AdminNav";

export default function AdminCommissionPage() {
  return (
    <main className="rg48-page-main rg23 admin-fb">
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
  const { ctx, err: ctxErr } = useAdminContext(previewId);
  // Phase 1 country-based (Nov 2026): the currency filter — the day +
  // history figures are in ONE fiat only. Defaults to the admin's own
  // currency (or ?currency= from the overview link).
  const [fiatSel, setFiatSel] = useState<string | null>(null);
  const fiat = fiatSel ?? sp.get("currency") ?? user?.currency ?? "GHS";
  const { days: history, err: histErr } = useAdminHistory(previewId, fiat);
  const [date, setDate] = useState(() => sp.get("date") || todayStr());
  const { day } = useAdminDay(previewId, date, fiat);
  // Round 31: the Day detail and History views were stacked cards on one
  // long page; now a tab bar switches between them (same treatment as
  // the owner commission tabs, Round 30). The other view unmounts.
  const [tab, setTab] = useState<"day" | "history">("day");

  if (!user) return <AdminLoginPrompt />;
  if (ctxErr) return <AdminError err={ctxErr} />;
  if (!ctx) return <p>Loading admin panel…</p>;
  // P0 Batch 3 (O3): the server 403s this section too.
  if (!previewId && !canAccessSection(user, "commission")) return <AdminDenied section="commission" />;
  if (histErr) return <AdminError err={histErr} />;
  if (!history) return <p>Loading admin panel…</p>;

  const ov = { admin: ctx.admin, history };

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
      <CurrencyChips value={fiat} onChange={setFiatSel} label="Commission currency" />
      <section className="admin-sec ac-commission">
        <h3>Commission</h3>
        {/* P1 Batch 4 (O24): when this admin has child admins, the
            figures below roll their downlines in — read-only. */}
        {day && day.scope.childAdmins.length > 0 && (
          <p className="rg48-mini">
            Includes your child admins&apos; downlines: {day.scope.childAdmins.map((c) => c.name).join(", ")}.
          </p>
        )}
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
                  <div className="sum-card"><span>Total deposited</span><b>{fmtMoney(day.totals.totalAmount, day.fiatCurrency ?? fiat)}</b></div>
                  <div className="sum-card"><span>Commission</span><b>{fmtMoney(day.totals.totalCommission, day.fiatCurrency ?? fiat)}</b></div>
                </div>
                <p className="ac-day-cap">Commission on {day.date}</p>
                {/* P0 Batch 3 (O4): the rule that priced this day — RevShare
                    pays on net loss (stakes − payouts), Turnover on stakes,
                    Legacy is the old flat % of deposits. */}
                <p className="ac-model-cap">
                  {day.totals.model === "revshare"
                    ? `RevShare ${day.totals.rate}% of net loss · stakes ${fmtMoney(day.totals.totalStakes ?? 0, day.fiatCurrency ?? fiat)} − payouts ${fmtMoney(day.totals.totalPayouts ?? 0, day.fiatCurrency ?? fiat)}`
                    : day.totals.model === "turnover"
                      ? `Turnover ${day.totals.rate}% of stakes · stakes ${fmtMoney(day.totals.totalStakes ?? 0, day.fiatCurrency ?? fiat)}`
                      : day.totals.model === "mixed"
                        ? "Mixed — your downline and child downlines priced on different rules"
                        : "Legacy — flat % of deposits (no rule set)"}
                </p>
                {day.deposits.length === 0 ? (
                  <p className="bh-empty">No deposits that day.</p>
                ) : (
                  <div className="rg48-twrap">
                    <table className="dep-table">
                      <thead><tr><th>User</th><th>Contact</th><th>Amount</th><th>Time</th><th>Method</th><th>Commission</th>{day.scope.childAdmins.length > 0 && <th>Admin</th>}</tr></thead>
                      <tbody>
                        {day.deposits.map((d) => (
                          <tr key={d.id} onClick={() => goPlayer(d.userId)} onKeyDown={(e) => { if (e.key === "Enter") goPlayer(d.userId); }} tabIndex={0} className="clickable">
                            <td>{d.userName}</td><td>{d.userContact}</td><td>{fmtMoney(d.amount, d.fiatCurrency ?? fiat)}</td><td>{new Date(d.time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</td><td>{d.method}</td><td>{fmtMoney(d.commission, d.fiatCurrency ?? fiat)} ({d.pctInForce}%)</td>{day.scope.childAdmins.length > 0 && <td>{d.adminName || "—"}</td>}
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
                  <thead><tr><th>Date</th><th>Deposits</th><th>Total deposited</th><th>Commission</th><th>Model</th></tr></thead>
                  <tbody>
                    {ov.history.map((h) => (
                      <tr key={h.date} onClick={() => { setDate(h.date); setTab("day"); }} onKeyDown={(e) => { if (e.key === "Enter") { setDate(h.date); setTab("day"); } }} tabIndex={0} className="clickable">
                        <td>{h.date}</td><td>{h.deposits}</td><td>{fmtMoney(h.totalAmount, h.fiatCurrency ?? fiat)}</td><td>{fmtMoney(h.totalCommission, h.fiatCurrency ?? fiat)}</td><td>{h.model === "revshare" ? `RevShare ${h.rate}%` : h.model === "turnover" ? `Turnover ${h.rate}%` : h.model === "mixed" ? "Mixed" : "Legacy"}</td>
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
