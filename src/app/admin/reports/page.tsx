// Admin dashboard — Reports & export (P1 Batch 2, A22). Three CSV
// exports, generated from REAL tables, plus an on-screen preview of
// the first 10 rows of each. An admin's reports cover only their own
// downline; the owner previews one admin's reports with
// ?preview=<adminId>. ?preview=1 on the endpoint returns JSON for the
// preview; the plain URL downloads the CSV.

"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useStore } from "../../../lib/store";
import { api, fmtMoney } from "../../../lib/api";
import { todayStr } from "../../../lib/money";
import { useAdminContext } from "../../../lib/admin-client";
import { canAccessSection } from "../../../lib/rbac";
import { AdminNav, AdminPreviewBanner, AdminLoginPrompt, AdminError, AdminDenied } from "../../../components/AdminNav";
import CurrencyChips from "../../../components/CurrencyChips";

type DepositRow = { date: string; player: string; contact: string; amount: number; method: string; referringAdmin: string; commission: number };
type PlayerRow = { name: string; contact: string; joined: string; totalDeposited: number; totalStaked: number; totalWon: number; commission: number };
type WithdrawalRow = { date: string; player: string; contact: string; amount: number; method: string; status: string; flags: string };

function thirtyDaysAgo(): string {
  return new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function AdminReportsInner() {
  const { user } = useStore();
  const sp = useSearchParams();
  const previewId = sp.get("preview");
  const { ctx, err: ctxErr } = useAdminContext(previewId);
  const [from, setFrom] = useState(thirtyDaysAgo());
  const [to, setTo] = useState(todayStr());
  // Phase 1 country-based (Nov 2026): the currency filter — each
  // report is in ONE fiat only. Defaults to the admin's own currency.
  const [fiatSel, setFiatSel] = useState<string | null>(null);
  const fiat = fiatSel ?? user?.currency ?? "GHS";
  const [dep, setDep] = useState<{ total: number; rows: DepositRow[] } | null>(null);
  const [players, setPlayers] = useState<{ total: number; rows: PlayerRow[] } | null>(null);
  const [wd, setWd] = useState<{ total: number; rows: WithdrawalRow[] } | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const base = useCallback(
    (kind: string) => (previewId ? `/api/owner/reports/${kind}?adminId=${previewId}` : `/api/admin/reports/${kind}`),
    [previewId],
  );

  const loadPreviews = useCallback(async () => {
    setBusy(true);
    setErr("");
    try {
      const range = `from=${from}&to=${to}&currency=${fiat}`;
      const [d, p, w] = await Promise.all([
        api<{ total: number; rows: DepositRow[] }>(`${base("deposits")}?${range}&preview=1`),
        api<{ total: number; rows: PlayerRow[] }>(`${base("players")}?currency=${fiat}&preview=1`),
        api<{ total: number; rows: WithdrawalRow[] }>(`${base("withdrawals")}?${range}&preview=1`),
      ]);
      setDep(d);
      setPlayers(p);
      setWd(w);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not load the reports.");
    } finally {
      setBusy(false);
    }
  }, [base, from, to, fiat]);

  useEffect(() => { void loadPreviews(); }, [loadPreviews]);

  if (!user) return <AdminLoginPrompt />;
  if (ctxErr) return <AdminError err={ctxErr} />;
  if (!ctx) return <p>Loading admin panel…</p>;
  // P0 Batch 3 (O3): the server 403s this section too.
  if (!previewId && !canAccessSection(user, "reports")) return <AdminDenied section="reports" />;

  const csvHref = (kind: string) => {
    const range = kind === "players" ? "" : `from=${from}&to=${to}`;
    const qs = [range, `currency=${fiat}`].filter(Boolean).join("&");
    return `${base(kind)}${qs ? `?${qs}` : ""}`;
  };

  const previewTable = (
    headers: string[],
    rows: (string | number)[][],
    total: number,
  ) => (
    <>
      {rows.length === 0 ? (
        <p>No rows in this range.</p>
      ) : (
        <div className="rg48-twrap">
          <table className="dep-table">
            <thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="rg48-mini">Showing {rows.length} of {total} rows — download the CSV for the full report.</p>
    </>
  );

  return (
    <>
      {previewId ? <AdminPreviewBanner name={ctx.admin.name} /> : null}
      <div className="rg48-hbar-in">
        <h2>Reports <em>&amp; export</em></h2>
      </div>
      <p className="rg48-sub">Deposits, players and withdrawals as CSV — built from the live tables, for your downline only.</p>
      <AdminNav />
      <CurrencyChips value={fiat} onChange={setFiatSel} label="Report currency" />

      <section className="admin-sec">
        <h3>Date range</h3>
        <div className="lookup-form">
          <label>From <input type="date" value={from} max={todayStr()} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>To <input type="date" value={to} max={todayStr()} onChange={(e) => setTo(e.target.value)} /></label>
          <button className="btn btn-gold" type="button" disabled={busy} onClick={() => void loadPreviews()}>{busy ? "Loading…" : "Refresh previews"}</button>
        </div>
        <p className="rg48-mini">The range applies to the deposits and withdrawals reports. The players report is all-time per player.</p>
        {err ? <p className="rg48-err">{err}</p> : null}
      </section>

      <section className="admin-sec">
        <h3>Deposits report</h3>
        <p className="rg48-sub">Date, player, amount, method, referring admin and the commission stamped on each deposit.</p>
        {!dep ? <p>Loading preview…</p> : previewTable(
          ["Date", "Player", "Amount", "Method", "Commission"],
          dep.rows.map((r) => [r.date, r.player, fmtMoney(r.amount, fiat), r.method, fmtMoney(r.commission, fiat)]),
          dep.total,
        )}
        <a className="btn btn-gold" href={csvHref("deposits")} download>Download deposits CSV</a>
      </section>

      <section className="admin-sec">
        <h3>Players report</h3>
        <p className="rg48-sub">Every player: joined date, total deposited, total staked, total won back, and commission (stamped sum — the Commission page is the source of truth for the rules-engine figure).</p>
        {!players ? <p>Loading preview…</p> : previewTable(
          ["Player", "Joined", "Deposited", "Staked", "Won", "Commission"],
          players.rows.map((r) => [r.name, r.joined, fmtMoney(r.totalDeposited, fiat), fmtMoney(r.totalStaked, fiat), fmtMoney(r.totalWon, fiat), fmtMoney(r.commission, fiat)]),
          players.total,
        )}
        <a className="btn btn-gold" href={csvHref("players")} download>Download players CSV</a>
      </section>

      <section className="admin-sec">
        <h3>Withdrawals report</h3>
        <p className="rg48-sub">Date, player, amount, method, status and the risk flags on each request.</p>
        {!wd ? <p>Loading preview…</p> : previewTable(
          ["Date", "Player", "Amount", "Method", "Status", "Flags"],
          wd.rows.map((r) => [r.date, r.player, fmtMoney(r.amount, fiat), r.method, r.status, r.flags || "—"]),
          wd.total,
        )}
        <a className="btn btn-gold" href={csvHref("withdrawals")} download>Download withdrawals CSV</a>
      </section>
    </>
  );
}

export default function AdminReportsPage() {
  return (
    <main className="rg48-page-main rg23 admin-fb">
      <div className="wrap">
        <Suspense fallback={<p>Loading admin panel…</p>}>
          <AdminReportsInner />
        </Suspense>
      </div>
    </main>
  );
}
