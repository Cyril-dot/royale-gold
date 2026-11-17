// Admin dashboard — Overview (round 11). One job: the commission summary
// + at-a-glance + latest commission days. Referrals live at
// /admin/referrals, day detail + history at /admin/commission, and a
// player at /admin/players/[id]. Same endpoints and section markup as
// the old single-page panel — only re-housed.

"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useStore } from "../../lib/store";
import { api, fmtMoney } from "../../lib/api";
import CurrencyChips from "../../components/CurrencyChips";
import { useAdminOverview, useAdminDashboard, useAdminSentNotifications } from "../../lib/admin-client";
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
  const { user, toast } = useStore();
  const sp = useSearchParams();
  const previewId = sp.get("preview");
  // Phase 1 country-based (Nov 2026): the currency filter — the
  // commission + dashboard figures are in ONE fiat only. Defaults to
  // the admin's own currency; the chips switch it.
  const [fiatSel, setFiatSel] = useState<string | null>(null);
  const fiat = fiatSel ?? user?.currency ?? "GHS";
  const { ov, err } = useAdminOverview(previewId, fiat);
  // P0 Batch 4 (A1): the enhanced dashboard — "today so far", the last
  // 7 days of deposits, and the top 5 players by total deposited.
  const { dash, err: dashErr } = useAdminDashboard(previewId, fiat);
  // P1 Batch 2 (A23): broadcast — one notification to all my players.
  // The form is admin-only (hidden in preview); the sent list shows
  // for the owner too.
  const { data: sentData, load: loadSent } = useAdminSentNotifications(previewId);
  const [bcTitle, setBcTitle] = useState("");
  const [bcBody, setBcBody] = useState("");
  const [bcBusy, setBcBusy] = useState(false);

  if (!user) return <AdminLoginPrompt />;
  // P0 Batch 3 (O3): the server 403s this section too.
  if (!previewId && !canAccessSection(user, "overview")) return <AdminDenied section="overview" />;
  if (err) return <AdminError err={err} />;
  if (!ov) return <p>Loading admin panel…</p>;

  const submitBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (bcTitle.trim().length < 2 || bcBody.trim().length < 2) { toast("Write a title and a message first", "lose"); return; }
    setBcBusy(true);
    try {
      const r = await api<{ sent: number }>("/api/admin/notifications", {
        method: "POST",
        body: JSON.stringify({ title: bcTitle.trim(), body: bcBody.trim() }),
      });
      toast(`Notification sent to ${r.sent} players`, "win");
      setBcTitle("");
      setBcBody("");
      await loadSent();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Broadcast failed", "lose");
    } finally { setBcBusy(false); }
  };

  const c = ov.commission;
  const latest = ov.history.slice(0, 5);
  const commissionHref = (date: string) =>
    previewId ? `/admin/commission?preview=${previewId}&date=${date}&currency=${fiat}` : `/admin/commission?date=${date}&currency=${fiat}`;
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
      {/* Phase 1 country-based (Nov 2026): one fiat at a time — the
          figures below are in the selected currency. */}
      <CurrencyChips value={fiat} onChange={setFiatSel} label="Commission currency" />
      <section className="admin-sec">
        <h3>Commission summary</h3>
        <div className="sum-cards">
          {card("Today", fmtMoney(c.today, ov.currency ?? fiat))}
          {card("Yesterday", fmtMoney(c.yesterday, ov.currency ?? fiat))}
          {card("Last 7 days", fmtMoney(c.last7d, ov.currency ?? fiat))}
          {card("Last 30 days", fmtMoney(c.last30d, ov.currency ?? fiat))}
          {card("All time", fmtMoney(c.allTime, ov.currency ?? fiat))}
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
            {/* P1 Batch 4 (O24): when this admin has child admins, the
                figures above roll their downlines in — read-only. */}
            {dash.scope.childAdmins.length > 0 && (
              <p className="rg48-mini">
                Includes your child admins&apos; downlines: {dash.scope.childAdmins.map((c) => c.name).join(", ")}.
              </p>
            )}
            <div className="sum-cards">
              {card("Deposits today", String(dash.today.deposits))}
              {card("Deposited today", fmtMoney(dash.today.depositsTotal, dash.currency ?? fiat))}
              {card("New players", String(dash.today.newPlayers))}
              {card("Active players", String(dash.today.activePlayers))}
              {card("Commission today", fmtMoney(dash.today.commission, dash.currency ?? fiat))}
            </div>
          </section>
          <section className="admin-sec">
            <h3>Last 7 days — deposits ({dash.currency ?? fiat})</h3>
            <div className="b4-chart" role="img" aria-label={`Deposits by day for the last 7 days, totalling ${fmtMoney(dash.week.reduce((s, d) => s + d.total, 0), dash.currency ?? fiat)}`}>
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
                        <td>{fmtMoney(p.totalDeposited, dash.currency ?? fiat)}</td>
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
                    <td>{fmtMoney(d.totalCommission, d.fiatCurrency ?? ov.currency ?? fiat)}</td>
                    <td><Link href={commissionHref(d.date)}>View</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {/* P1 Batch 2 (A23): broadcast — one notification to all my
          players at once. The form is admin-only (hidden in preview);
          the sent list shows for the owner too. In-app only. */}
      <section className="admin-sec">
        <h3>Notify all my players</h3>
        <p className="rg48-sub">Send one message to every player you referred — it shows on their account page. In-app only, no email or SMS.</p>
        {!previewId && user.role === "admin" ? (
          <form className="pd-note-form" onSubmit={submitBroadcast}>
            <input type="text" placeholder="Title — e.g. Weekend bonus is live" value={bcTitle} onChange={(e) => setBcTitle(e.target.value)} aria-label="Broadcast title" maxLength={120} />
            <textarea placeholder="Message…" value={bcBody} onChange={(e) => setBcBody(e.target.value)} aria-label="Broadcast message" rows={2} maxLength={2000} />
            <button className="btn btn-gold" type="submit" disabled={bcBusy}>{bcBusy ? "Sending…" : "Send to all my players"}</button>
          </form>
        ) : null}
        {sentData && sentData.sent.length > 0 ? (
          <>
            <h4>Recently sent</h4>
            <div className="pd-notes">
              {sentData.sent.slice(0, 5).map((s) => (
                <div key={s.id} className="pd-note">
                  <p><b>{s.title}</b> — {s.body}</p>
                  <span>{s.userName} · {new Date(s.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{s.readAt ? " · read" : " · unread"}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="rg48-mini">No notifications sent yet.</p>
        )}
      </section>
    </>
  );
}
