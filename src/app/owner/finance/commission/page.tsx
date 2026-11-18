// Owner Commission (Phase 2) — split out of the old one-page owner panel
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
import type { OwnerDayAdmin, RollupDay } from "../../../../components/owner/owner-types";

export default function OwnerCommissionPage() {
  const { user, toast } = useStore();
  const { fiat } = useOwner();
  const { admins: ctxAdmins, loadAdmins } = useOwner();
  const admins = ctxAdmins ?? [];
  useEffect(() => { if (user) void loadAdmins(); }, [loadAdmins, user]);

  const [tab, setTab] = useState<"per-day" | "rollup">("per-day");

  const [date, setDate] = useState("");
  useEffect(() => { setDate(todayStr()); }, []);

  const [dayAdmins, setDayAdmins] = useState<OwnerDayAdmin[] | null>(null);
  const [dayTotals, setDayTotals] = useState<{ deposits: number; totalAmount: number; totalCommission: number } | null>(null);

  const loadDay = useCallback(async (d: string) => {
    try {
      const r = await api<{ date: string; admins: OwnerDayAdmin[]; totals: { deposits: number; totalAmount: number; totalCommission: number } }>(`/api/owner/commission?date=${d}&currency=${fiat}`);
      setDayAdmins(r.admins);
      setDayTotals(r.totals);
    } catch {
      setDayAdmins(null);
      setDayTotals(null);
    }
  }, [fiat]);

  useEffect(() => { if (user && date) void loadDay(date); }, [date, loadDay, user]);

  // Overview dashboard (Nov 2026): the 7-stat dashboard — one call,
  // per selected fiat, reloaded with the currency chips.

  // P0 Batch 3 (O4): commission rules — the rules engine. A rule is a
  // model (RevShare = % of net loss, Turnover = % of stakes) + a rate,
  // for one admin or as the global default, from an effective date.
  interface CommissionRuleRow { id: string; adminId: string | null; adminName: string | null; model: string; rate: number; parentSharePct: number; effectiveFrom: string; createdAt: string }
  const [rules, setRules] = useState<CommissionRuleRow[] | null>(null);
  const [ruleAdmin, setRuleAdmin] = useState("");
  const [ruleModel, setRuleModel] = useState<"revshare" | "turnover">("revshare");
  const [ruleRate, setRuleRate] = useState(10);
  // P1 Batch 4 (O24): the parent's share % of this admin's commission —
  // a REPORTING line on the settlement, never a deduction.
  const [ruleParentShare, setRuleParentShare] = useState(0);
  // Dates start empty and are set on mount (calling new Date() during
  // render breaks the prerender — the same rule as the commission date
  // picker above).
  const [ruleFrom, setRuleFrom] = useState("");
  useEffect(() => { setRuleFrom(todayStr()); }, []);
  const [ruleBusy, setRuleBusy] = useState(false);
  const loadRules = useCallback(async () => {
    try {
      const r = await api<{ rules: CommissionRuleRow[] }>("/api/owner/commission/rules");
      setRules(r.rules);
    } catch { setRules([]); }
  }, []);
  useEffect(() => { if (user) void loadRules(); }, [loadRules, user]);
  const saveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setRuleBusy(true);
    try {
      await api("/api/owner/commission/rules", {
        method: "POST",
        body: JSON.stringify({ adminId: ruleAdmin || null, model: ruleModel, rate: ruleRate, parentSharePct: ruleParentShare, effectiveFrom: ruleFrom }),
      });
      toast("Commission rule saved — it applies from its effective date", "win");
      await loadRules();
      await loadRollup();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not save rule", "lose");
    } finally { setRuleBusy(false); }
  };

  // P0 Batch 3 (O5): commission settlement — owed / paid / balance per
  // admin for a period, and recording a payout (which writes to the
  // ledger + audit log and drops the balance).
  interface SettlementRow { adminId: string; adminName: string; adminEmail: string | null; active: boolean; owed: number; paid: number; balance: number; parentAdminId: string | null; parentName: string | null; parentShare: number }
  const [settleFrom, setSettleFrom] = useState("");
  const [settleTo, setSettleTo] = useState("");
  useEffect(() => {
    const today = todayStr();
    setSettleFrom(`${today.slice(0, 8)}01`);
    setSettleTo(today);
  }, []);
  const [settlement, setSettlement] = useState<{ from: string; to: string; rows: SettlementRow[]; totals: { owed: number; paid: number; balance: number; parentShare: number } } | null>(null);
  const loadSettlement = useCallback(async () => {
    if (!settleFrom || !settleTo) return;
    try {
      const r = await api<{ from: string; to: string; rows: SettlementRow[]; totals: { owed: number; paid: number; balance: number; parentShare: number } }>(`/api/owner/commission/settlement?from=${settleFrom}&to=${settleTo}&currency=${fiat}`);
      setSettlement(r);
    } catch { setSettlement(null); }
  }, [settleFrom, settleTo, fiat]);
  useEffect(() => { if (user) void loadSettlement(); }, [loadSettlement, user]);
  const [payAdmin, setPayAdmin] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("MTN");
  const [payRef, setPayRef] = useState("");
  const [payBusy, setPayBusy] = useState(false);
  const recordPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payAdmin || !payAmount) return;
    setPayBusy(true);
    try {
      await api("/api/owner/commission/settlement", {
        method: "POST",
        body: JSON.stringify({
          adminId: payAdmin,
          amount: Number(payAmount),
          method: payMethod,
          reference: payRef.trim() || undefined,
          periodFrom: settleFrom,
          periodTo: settleTo,
          // Phase 1 country-based (Nov 2026): the payout is in the
          // fiat of the settlement view.
          currency: fiat,
        }),
      });
      toast("Payout recorded — ledger and audit log updated", "win");
      setPayAmount("");
      setPayRef("");
      await loadSettlement();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not record payout", "lose");
    } finally { setPayBusy(false); }
  };

  const [rollup, setRollup] = useState<{ days: RollupDay[]; totals: { deposits: number; totalAmount: number; totalCommission: number } } | null>(null);
  const loadRollup = useCallback(async () => {
    try {
      setRollup(await api<{ days: RollupDay[]; totals: { deposits: number; totalAmount: number; totalCommission: number } }>(`/api/owner/rollup?currency=${fiat}`));
    } catch { setRollup(null); }
  }, [fiat]);
  useEffect(() => { if (user) void loadRollup(); }, [loadRollup, user]);
  return (
    <div>
      <PageHeader title="Commission" sub="Rules, per-day viewer, rollup and settlement." />
      <OwnerRangeBar />
      <section className="admin-sec">
      <h3>Commission rules</h3>
      <form className="owner-add ow-form" onSubmit={saveRule}>
        <select value={ruleAdmin} onChange={(e) => setRuleAdmin(e.target.value)} aria-label="Admin (blank = global default)">
          <option value="">Global default (every admin)</option>
          {admins.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <select value={ruleModel} onChange={(e) => setRuleModel(e.target.value as "revshare" | "turnover")} aria-label="Model">
          <option value="revshare">RevShare — % of net loss</option>
          <option value="turnover">Turnover — % of stakes</option>
        </select>
        <label>Rate % <input type="number" min={0} max={100} step={0.5} value={ruleRate} onChange={(e) => setRuleRate(Number(e.target.value))} /></label>
        <label>Parent share % <input type="number" min={0} max={100} step={0.5} value={ruleParentShare} onChange={(e) => setRuleParentShare(Number(e.target.value))} /></label>
        <label>From <input type="date" value={ruleFrom} max={todayStr()} onChange={(e) => setRuleFrom(e.target.value)} /></label>
        <button className="btn btn-gold" type="submit" disabled={ruleBusy}>{ruleBusy ? "Saving…" : "Save rule"}</button>
      </form>
      {rules === null ? <p>Loading rules…</p> : rules.length === 0 ? (
        <p>No rules yet — every admin is on the legacy flat % of deposits.</p>
      ) : (
        <div className="rg48-twrap">
          <table className="dep-table">
            <thead><tr><th>Applies to</th><th>Model</th><th>Rate</th><th>Parent share</th><th>From</th></tr></thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td>{r.adminName ?? "Global default"}</td>
                  <td>{r.model === "revshare" ? "RevShare" : "Turnover"}</td>
                  <td>{r.rate}%</td>
                  <td>{r.parentSharePct > 0 ? `${r.parentSharePct}%` : "—"}</td>
                  <td>{r.effectiveFrom}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </section>

      <section className="admin-sec ow-commission" id="ow-sec-commission">
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
              <div className="sum-cards ow-sum">
                <div className="sum-card"><span>Deposits</span><b>{dayTotals.deposits}</b></div>
                <div className="sum-card"><span>Total deposited</span><b>{fmtMoney(dayTotals.totalAmount, fiat)}</b></div>
                <div className="sum-card"><span>Commission</span><b>{fmtMoney(dayTotals.totalCommission, fiat)}</b></div>
              </div>
              <p className="ow-day-cap">Commission on {date}</p>
            </>
          )}
          {dayAdmins && dayAdmins.length === 0 && <p className="bh-empty">No deposits that day.</p>}
          {dayAdmins?.map((da) => (
            <div key={da.admin.id} className="day-admin">
              <h4>{da.admin.name} — {fmtMoney(da.totalAmount, fiat)} · {fmtMoney(da.totalCommission, fiat)} commission</h4>
              <div className="rg48-twrap">
                <table className="dep-table">
                  <thead><tr><th>User</th><th>Contact</th><th>Amount</th><th>Time</th><th>Method</th><th>Commission</th></tr></thead>
                  <tbody>
                    {da.deposits.map((d) => (
                      <tr key={d.id}><td>{d.userName}</td><td>{d.userContact}</td><td>{fmtMoney(d.amount, d.fiatCurrency ?? fiat)}</td><td>{new Date(d.time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</td><td>{d.method}</td><td>{fmtMoney(d.commission, d.fiatCurrency ?? fiat)} ({d.pctInForce}%)</td></tr>
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
                    <tr key={`${d.date}-${d.adminId}-${i}`}><td>{d.date}</td><td>{d.adminName}</td><td>{d.deposits}</td><td>{fmtMoney(d.totalAmount, d.fiatCurrency ?? fiat)}</td><td>{fmtMoney(d.totalCommission, d.fiatCurrency ?? fiat)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      </section>

      <section className="admin-sec">
      <h3>Settlement</h3>
      <div className="money-dates ow-dates">
        <label>From <input type="date" value={settleFrom} max={todayStr()} onChange={(e) => setSettleFrom(e.target.value)} /></label>
        <label>To <input type="date" value={settleTo} max={todayStr()} onChange={(e) => setSettleTo(e.target.value)} /></label>
      </div>
      {settlement === null ? <p>Loading settlement…</p> : (
        <>
          <div className="sum-cards ow-sum">
            <div className="sum-card"><span>Owed</span><b>{fmtMoney(settlement.totals.owed, fiat)}</b></div>
            <div className="sum-card"><span>Paid</span><b>{fmtMoney(settlement.totals.paid, fiat)}</b></div>
            <div className="sum-card"><span>Balance</span><b>{fmtMoney(settlement.totals.balance, fiat)}</b></div>
            <div className="sum-card"><span>Parent shares</span><b>{fmtMoney(settlement.totals.parentShare, fiat)}</b></div>
          </div>
          {settlement.rows.length === 0 ? <p>No admins yet.</p> : (
            <div className="rg48-twrap">
              <table className="dep-table">
                <thead><tr><th>Admin</th><th>Owed</th><th>Paid</th><th>Balance</th><th>Parent share</th></tr></thead>
                <tbody>
                  {settlement.rows.map((r) => (
                    <tr key={r.adminId}>
                      <td>{r.adminName}{r.active ? "" : " (deactivated)"}{r.parentName ? ` · parent: ${r.parentName}` : ""}</td>
                      <td>{fmtMoney(r.owed, fiat)}</td>
                      <td>{fmtMoney(r.paid, fiat)}</td>
                      <td>{fmtMoney(r.balance, fiat)}</td>
                      <td>{r.parentShare > 0 ? fmtMoney(r.parentShare, fiat) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <form className="owner-add ow-form" onSubmit={recordPayout}>
        <select value={payAdmin} onChange={(e) => setPayAdmin(e.target.value)} aria-label="Admin to pay" required>
          <option value="">Pay admin…</option>
          {admins.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <label>Amount GH₵ <input type="number" min={0.01} step={0.01} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="0.00" required /></label>
        <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} aria-label="Method">
          {["MTN", "Telecel", "AirtelTigo", "bank", "cash"].map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <input type="text" placeholder="Reference (optional)" value={payRef} onChange={(e) => setPayRef(e.target.value)} />
        <button className="btn btn-gold" type="submit" disabled={payBusy || !payAdmin || !payAmount}>{payBusy ? "Recording…" : "Record payout"}</button>
      </form>
      </section>
    </div>
  );
}
