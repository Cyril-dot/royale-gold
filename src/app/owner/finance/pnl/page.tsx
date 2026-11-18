// Owner Profit & loss (Phase 2) — split out of the old one-page owner panel
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

export default function OwnerPnlPage() {
  const { user } = useStore();
  const { fiat } = useOwner();
  // P0 Batch 2 (O1): global P&L — GGR, deposits, approved withdrawals,
  // commissions owed, net profit, for a selectable period.
  interface Pnl { from: string | null; to: string | null; roundsCash: number; stakesCash: number; payoutsCash: number; ggrCash: number; roundsCoins: number; stakesCoins: number; payoutsCoins: number; ggrCoins: number; deposits: number; depositsCount: number; withdrawals: number; withdrawalsCount: number; commissions: number; netProfit: number; formula: string }
  const [pnlPreset, setPnlPreset] = useState<"today" | "week" | "month" | "custom">("today");
  const [pnlFrom, setPnlFrom] = useState("");
  const [pnlTo, setPnlTo] = useState("");
  const [pnl, setPnl] = useState<Pnl | null>(null);
  const loadPnl = useCallback(async () => {
    const today = todayStr();
    let from = today;
    let to = today;
    if (pnlPreset === "week") {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - 6);
      from = d.toISOString().slice(0, 10);
    } else if (pnlPreset === "month") {
      from = `${today.slice(0, 8)}01`;
    } else if (pnlPreset === "custom") {
      from = pnlFrom || today;
      to = pnlTo || today;
    }
    try {
      setPnl(await api<Pnl>(`/api/owner/pnl?from=${from}&to=${to}&currency=${fiat}`));
    } catch { setPnl(null); }
  }, [pnlPreset, pnlFrom, pnlTo, fiat]);
  useEffect(() => { if (user) void loadPnl(); }, [loadPnl, user]);
  return (
    <div>
      <PageHeader title="Profit & loss" sub="GGR, deposits, withdrawals, commissions and net profit." />
      <OwnerRangeBar />
      <section className="admin-sec">
      <h3>Profit &amp; loss</h3>
      <div className="money-chips" role="group" aria-label="P&L period">
        {(["today", "week", "month", "custom"] as const).map((p) => (
          <button key={p} type="button" className={pnlPreset === p ? "on" : ""} onClick={() => setPnlPreset(p)}>
            {p === "today" ? "Today" : p === "week" ? "Last 7 days" : p === "month" ? "This month" : "Custom"}
          </button>
        ))}
      </div>
      {pnlPreset === "custom" && (
        <div className="money-dates ow-dates">
          <label>From <input type="date" value={pnlFrom} max={todayStr()} onChange={(e) => setPnlFrom(e.target.value)} /></label>
          <label>To <input type="date" value={pnlTo} max={todayStr()} onChange={(e) => setPnlTo(e.target.value)} /></label>
        </div>
      )}
      {pnl === null ? <p>Loading P&amp;L…</p> : (
        <>
          <div className="sum-cards ow-sum">
            <div className="sum-card"><span>GGR (cash)</span><b>{fmtMoney(pnl.ggrCash, fiat)}</b></div>
            <div className="sum-card"><span>Deposits</span><b>{fmtMoney(pnl.deposits, fiat)}</b></div>
            <div className="sum-card"><span>Withdrawals (approved)</span><b>{fmtMoney(pnl.withdrawals, fiat)}</b></div>
            <div className="sum-card"><span>Commissions owed</span><b>{fmtMoney(pnl.commissions, fiat)}</b></div>
            <div className="sum-card"><span>Net profit</span><b>{fmtMoney(pnl.netProfit, fiat)}</b></div>
          </div>
          <p className="ow-day-cap">
            {pnl.roundsCash} cash rounds ({fmtMoney(pnl.stakesCash, fiat)} staked − {fmtMoney(pnl.payoutsCash, fiat)} paid out) · {pnl.roundsCoins} coin rounds ({pnl.stakesCoins} staked − {pnl.payoutsCoins} paid out, GGR {pnl.ggrCoins} coins) · {pnl.depositsCount} deposits · {pnl.withdrawalsCount} approved withdrawals.
          </p>
        </>
      )}
      </section>
    </div>
  );
}
