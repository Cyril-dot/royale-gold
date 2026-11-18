// Owner Profit & loss (Phase 3 restyle) — split out of the old one-page
// owner panel (src/app/owner/legacy/page.tsx). Same endpoint, same
// behaviour, staff-ui throughout: Segmented presets, DateRange for
// custom, KPI tiles. A failed load now says so with a Retry instead of
// sitting on "Loading P&L…" forever (the old catch set pnl null).
"use client";

import { useMemo, useState } from "react";
import { todayStr } from "../../../../lib/admin-client";
import { useStore } from "../../../../lib/store";
import { useOwner } from "../../../../components/owner/OwnerContext";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";
import { Card, KpiTile } from "../../../../components/staff-ui/Card";
import { Skeleton, ErrorState } from "../../../../components/staff-ui/Feedback";
import { DateRange } from "../../../../components/staff-ui/Form";
import { Segmented } from "../../../../components/staff-ui/Tabs";
import { fmtStaffMoney } from "../../../../components/staff-ui/format";
import { useOwnerFetch } from "../../../../components/owner/useOwnerFetch";

// P0 Batch 2 (O1): global P&L — GGR, deposits, approved withdrawals,
// commissions owed, net profit, for a selectable period.
interface Pnl {
  from: string | null;
  to: string | null;
  roundsCash: number;
  stakesCash: number;
  payoutsCash: number;
  ggrCash: number;
  roundsCoins: number;
  stakesCoins: number;
  payoutsCoins: number;
  ggrCoins: number;
  deposits: number;
  depositsCount: number;
  withdrawals: number;
  withdrawalsCount: number;
  commissions: number;
  netProfit: number;
  formula: string;
}

type PnlPreset = "today" | "week" | "month" | "custom";

export default function OwnerPnlPage() {
  const { user } = useStore();
  const { fiat } = useOwner();
  const [pnlPreset, setPnlPreset] = useState<PnlPreset>("today");
  const [pnlFrom, setPnlFrom] = useState("");
  const [pnlTo, setPnlTo] = useState("");

  // The range is derived for the fetch URL only — never rendered — so
  // computing it during render cannot mismatch hydration.
  const url = useMemo(() => {
    if (!user) return null;
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
    return `/api/owner/pnl?from=${from}&to=${to}&currency=${fiat}`;
  }, [user, pnlPreset, pnlFrom, pnlTo, fiat]);
  const { data: pnl, err, loading, reload } = useOwnerFetch<Pnl>(url);

  return (
    <div>
      <PageHeader title="Profit & loss" sub="GGR, deposits, withdrawals, commissions and net profit." />
      <OwnerRangeBar />
      <Card title="Profit & loss">
        <Segmented
          label="P&L period"
          items={[
            { id: "today", label: "Today" },
            { id: "week", label: "Last 7 days" },
            { id: "month", label: "This month" },
            { id: "custom", label: "Custom" },
          ]}
          value={pnlPreset}
          onChange={(id) => setPnlPreset(id as PnlPreset)}
        />
        {pnlPreset === "custom" ? (
          <DateRange
            value={{ from: pnlFrom, to: pnlTo }}
            onChange={(v) => {
              setPnlFrom(v.from);
              setPnlTo(v.to);
            }}
            label="P&L period"
            max={todayStr()}
          />
        ) : null}
        {loading ? (
          <Skeleton lines={5} title />
        ) : err ? (
          <ErrorState text={err} onRetry={reload} />
        ) : pnl ? (
          <>
            <div>
              <KpiTile label="GGR (cash)" value={fmtStaffMoney(pnl.ggrCash, fiat)} />
              <KpiTile label="Deposits" value={fmtStaffMoney(pnl.deposits, fiat)} />
              <KpiTile label="Withdrawals (approved)" value={fmtStaffMoney(pnl.withdrawals, fiat)} />
              <KpiTile label="Commissions owed" value={fmtStaffMoney(pnl.commissions, fiat)} />
              <KpiTile label="Net profit" value={fmtStaffMoney(pnl.netProfit, fiat)} />
            </div>
            <p>
              {pnl.roundsCash} cash rounds ({fmtStaffMoney(pnl.stakesCash, fiat)} staked − {fmtStaffMoney(pnl.payoutsCash, fiat)} paid
              out) · {pnl.roundsCoins} coin rounds ({pnl.stakesCoins} staked − {pnl.payoutsCoins} paid out, GGR {pnl.ggrCoins} coins) ·{" "}
              {pnl.depositsCount} deposits · {pnl.withdrawalsCount} approved withdrawals.
            </p>
          </>
        ) : null}
        {pnl ? <p>{pnl.formula}</p> : null}
      </Card>
    </div>
  );
}
