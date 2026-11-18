// Owner Commission (Phase 3 restyle) — split out of the old one-page
// owner panel (src/app/owner/legacy/page.tsx). Same endpoints, same
// behaviour, staff-ui throughout: rules form + table, per-day viewer /
// rollup switch (a Segmented choice, not navigation — the page stays
// one route), settlement table + Record payout through the shared
// ConfirmDialog. The per-day / rollup figures are shown exactly as the
// endpoints return them (the stamped per-day pct and the rules-engine
// rollup can disagree for a day a rule was created mid-day — that
// pre-existing gap is NOT reconciled here).
"use client";

import { useMemo, useState, type FormEvent } from "react";
import { api } from "../../../../lib/api";
import { todayStr } from "../../../../lib/admin-client";
import { useStore } from "../../../../lib/store";
import { useOwner } from "../../../../components/owner/OwnerContext";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";
import { Card, KpiTile } from "../../../../components/staff-ui/Card";
import { Button } from "../../../../components/staff-ui/Button";
import { DataTable, type DataColumn } from "../../../../components/staff-ui/DataTable";
import { FormField, Input, Select, AmountInput, DateRange } from "../../../../components/staff-ui/Form";
import { Segmented } from "../../../../components/staff-ui/Tabs";
import { ConfirmDialog } from "../../../../components/staff-ui/Dialog";
import { MaskedValue } from "../../../../components/staff-ui/MaskedValue";
import { fmtStaffMoney, fmtStaffInt } from "../../../../components/staff-ui/format";
import { useOwnerFetch } from "../../../../components/owner/useOwnerFetch";
import type { AdminRow, OwnerDayAdmin, RollupDay } from "../../../../components/owner/owner-types";

// P0 Batch 3 (O4): commission rules — the rules engine. A rule is a
// model (RevShare = % of net loss, Turnover = % of stakes) + a rate,
// for one admin or as the global default, from an effective date.
interface CommissionRuleRow {
  id: string;
  adminId: string | null;
  adminName: string | null;
  model: string;
  rate: number;
  parentSharePct: number;
  effectiveFrom: string;
  createdAt: string;
}

// P0 Batch 3 (O5): commission settlement — owed / paid / balance per
// admin for a period, and recording a payout (which writes to the
// ledger + audit log and drops the balance).
interface SettlementRow {
  adminId: string;
  adminName: string;
  adminEmail: string | null;
  active: boolean;
  owed: number;
  paid: number;
  balance: number;
  parentAdminId: string | null;
  parentName: string | null;
  parentShare: number;
}

interface DayResponse {
  date: string;
  admins: OwnerDayAdmin[];
  totals: { deposits: number; totalAmount: number; totalCommission: number };
}

interface RollupResponse {
  days: RollupDay[];
  totals: { deposits: number; totalAmount: number; totalCommission: number };
}

interface SettlementResponse {
  from: string;
  to: string;
  rows: SettlementRow[];
  totals: { owed: number; paid: number; balance: number; parentShare: number };
}

export default function OwnerCommissionPage() {
  const { user, toast } = useStore();
  const { fiat } = useOwner();
  const [tab, setTab] = useState<"per-day" | "rollup">("per-day");

  // Dates start empty and are filled on the first client render (the
  // supported render-phase adjustment — a mount effect is what the
  // lint rule forbids, and a useState initializer calling new Date()
  // would bake the build date into the prerender).
  const [date, setDate] = useState("");
  if (date === "" && typeof window !== "undefined") setDate(todayStr());

  const [ruleFrom, setRuleFrom] = useState("");
  if (ruleFrom === "" && typeof window !== "undefined") setRuleFrom(todayStr());

  const [settleFrom, setSettleFrom] = useState("");
  const [settleTo, setSettleTo] = useState("");
  if (settleFrom === "" && typeof window !== "undefined") {
    const t = todayStr();
    setSettleFrom(`${t.slice(0, 8)}01`);
    setSettleTo(t);
  }

  const adminsUrl = user ? "/api/owner/admins" : null;
  const { data: adminsData } = useOwnerFetch<{ admins: AdminRow[] }>(adminsUrl);
  const admins = adminsData?.admins ?? [];

  const dayUrl = useMemo(
    () => (user && date ? `/api/owner/commission?date=${date}&currency=${fiat}` : null),
    [user, date, fiat],
  );
  const { data: day, err: dayErr, loading: dayLoading, reload: reloadDay } = useOwnerFetch<DayResponse>(dayUrl);

  const rulesUrl = user ? "/api/owner/commission/rules" : null;
  const { data: rulesData, err: rulesErr, loading: rulesLoading, reload: reloadRules } =
    useOwnerFetch<{ rules: CommissionRuleRow[] }>(rulesUrl);
  const rules = rulesData?.rules ?? [];

  const rollupUrl = user ? `/api/owner/rollup?currency=${fiat}` : null;
  const { data: rollup, err: rollupErr, loading: rollupLoading, reload: reloadRollup } =
    useOwnerFetch<RollupResponse>(rollupUrl);

  const settleUrl = useMemo(
    () =>
      user && settleFrom && settleTo
        ? `/api/owner/commission/settlement?from=${settleFrom}&to=${settleTo}&currency=${fiat}`
        : null,
    [user, settleFrom, settleTo, fiat],
  );
  const { data: settlement, err: settleErr, loading: settleLoading, reload: reloadSettlement } =
    useOwnerFetch<SettlementResponse>(settleUrl);

  const [ruleAdmin, setRuleAdmin] = useState("");
  const [ruleModel, setRuleModel] = useState<"revshare" | "turnover">("revshare");
  const [ruleRate, setRuleRate] = useState("10");
  // P1 Batch 4 (O24): the parent's share % of this admin's commission —
  // a REPORTING line on the settlement, never a deduction.
  const [ruleParentShare, setRuleParentShare] = useState("0");
  const [ruleBusy, setRuleBusy] = useState(false);
  const saveRule = async (e: FormEvent) => {
    e.preventDefault();
    setRuleBusy(true);
    try {
      await api("/api/owner/commission/rules", {
        method: "POST",
        body: JSON.stringify({
          adminId: ruleAdmin || null,
          model: ruleModel,
          rate: Number(ruleRate),
          parentSharePct: Number(ruleParentShare),
          effectiveFrom: ruleFrom,
        }),
      });
      toast("Commission rule saved — it applies from its effective date", "win");
      reloadRules();
      reloadRollup();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not save rule", "lose");
    } finally {
      setRuleBusy(false);
    }
  };

  const [payAdmin, setPayAdmin] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("MTN");
  const [payRef, setPayRef] = useState("");
  const [payBusy, setPayBusy] = useState(false);
  const [payConfirm, setPayConfirm] = useState(false);
  const recordPayout = async () => {
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
      setPayConfirm(false);
      reloadSettlement();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not record payout", "lose");
    } finally {
      setPayBusy(false);
    }
  };

  const [rollupPage, setRollupPage] = useState(1);
  const rollupPageSize = 25;
  const rollupRows = rollup?.days ?? [];
  const rollupTotalPages = Math.max(1, Math.ceil(rollupRows.length / rollupPageSize));
  const rollupSafePage = Math.min(rollupPage, rollupTotalPages);
  const rollupPageRows = rollupRows
    .slice((rollupSafePage - 1) * rollupPageSize, rollupSafePage * rollupPageSize)
    .map((d, i) => ({ ...d, id: `${d.date}-${d.adminId}-${i}` }));

  // NOTE (all tables below): DataTable's phone CardList only reads
  // `details` from columns AFTER the first — details on the first
  // column never render. Every detail lives on its own column.
  const ruleColumns: DataColumn<CommissionRuleRow>[] = [
    { key: "applies", label: "Applies to", render: (r) => r.adminName ?? "Global default" },
    {
      key: "model",
      label: "Model",
      render: (r) => (r.model === "revshare" ? "RevShare" : "Turnover"),
      details: (r) => [["Model", r.model === "revshare" ? "RevShare" : "Turnover"]],
    },
    { key: "rate", label: "Rate", render: (r) => `${r.rate}%`, details: (r) => [["Rate", `${r.rate}%`]] },
    {
      key: "parent",
      label: "Parent share",
      render: (r) => (r.parentSharePct > 0 ? `${r.parentSharePct}%` : "—"),
      details: (r) => [["Parent share", r.parentSharePct > 0 ? `${r.parentSharePct}%` : "—"]],
    },
    { key: "from", label: "From", render: (r) => r.effectiveFrom, details: (r) => [["From", r.effectiveFrom]] },
  ];

  const rollupColumns: DataColumn<RollupDay>[] = [
    { key: "date", label: "Date", render: (d) => d.date },
    { key: "admin", label: "Admin", render: (d) => d.adminName, details: (d) => [["Admin", d.adminName]] },
    { key: "deposits", label: "Deposits", render: (d) => fmtStaffInt(d.deposits), details: (d) => [["Deposits", fmtStaffInt(d.deposits)]] },
    {
      key: "total",
      label: "Total deposited",
      render: (d) => fmtStaffMoney(d.totalAmount, d.fiatCurrency ?? fiat),
      details: (d) => [["Total deposited", fmtStaffMoney(d.totalAmount, d.fiatCurrency ?? fiat)]],
    },
    {
      key: "commission",
      label: "Commission",
      render: (d) => fmtStaffMoney(d.totalCommission, d.fiatCurrency ?? fiat),
      details: (d) => [["Commission", fmtStaffMoney(d.totalCommission, d.fiatCurrency ?? fiat)]],
    },
  ];

  const settlementColumns: DataColumn<SettlementRow>[] = [
    {
      key: "admin",
      label: "Admin",
      render: (r) => `${r.adminName}${r.active ? "" : " (deactivated)"}${r.parentName ? ` · parent: ${r.parentName}` : ""}`,
    },
    { key: "owed", label: "Owed", render: (r) => fmtStaffMoney(r.owed, fiat), details: (r) => [["Owed", fmtStaffMoney(r.owed, fiat)]] },
    { key: "paid", label: "Paid", render: (r) => fmtStaffMoney(r.paid, fiat), details: (r) => [["Paid", fmtStaffMoney(r.paid, fiat)]] },
    {
      key: "balance",
      label: "Balance",
      render: (r) => fmtStaffMoney(r.balance, fiat),
      details: (r) => [["Balance", fmtStaffMoney(r.balance, fiat)]],
    },
    {
      key: "parent",
      label: "Parent share",
      render: (r) => (r.parentShare > 0 ? fmtStaffMoney(r.parentShare, fiat) : "—"),
      details: (r) => [["Parent share", r.parentShare > 0 ? fmtStaffMoney(r.parentShare, fiat) : "—"]],
    },
  ];

  const payAdminName = admins.find((a) => a.id === payAdmin)?.name ?? payAdmin;

  return (
    <div>
      <PageHeader title="Commission" sub="Rules, per-day viewer, rollup and settlement." />
      <OwnerRangeBar />

      <Card title="Commission rules">
        <form onSubmit={saveRule}>
          <FormField label="Admin (blank = global default)">
            <Select value={ruleAdmin} onChange={(e) => setRuleAdmin(e.target.value)} aria-label="Admin (blank = global default)">
              <option value="">Global default (every admin)</option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Model">
            <Select value={ruleModel} onChange={(e) => setRuleModel(e.target.value as "revshare" | "turnover")} aria-label="Model">
              <option value="revshare">RevShare — % of net loss</option>
              <option value="turnover">Turnover — % of stakes</option>
            </Select>
          </FormField>
          <FormField label="Rate %">
            <AmountInput value={ruleRate} onChange={(e) => setRuleRate(e.target.value)} aria-label="Rate percent" />
          </FormField>
          <FormField label="Parent share %" hint="Reporting line on the settlement, never a deduction.">
            <AmountInput value={ruleParentShare} onChange={(e) => setRuleParentShare(e.target.value)} aria-label="Parent share percent" />
          </FormField>
          <FormField label="From">
            <Input type="date" value={ruleFrom} max={todayStr()} onChange={(e) => setRuleFrom(e.target.value)} aria-label="Effective from" />
          </FormField>
          <Button variant="primary" type="submit" loading={ruleBusy}>
            Save rule
          </Button>
        </form>
        <DataTable<CommissionRuleRow>
          viewId="owner-commission-rules"
          columns={ruleColumns}
          rows={rules}
          total={rules.length}
          page={1}
          pageSize={rules.length || 1}
          onPageChange={() => {}}
          loading={rulesLoading}
          error={rulesErr}
          onRetry={reloadRules}
          emptyTitle="No rules yet."
          emptyText="Every admin is on the legacy flat % of deposits."
        />
      </Card>

      <Card title="Commission">
        <Segmented
          label="Commission views"
          items={[
            { id: "per-day", label: "Per-day" },
            { id: "rollup", label: "All-admins rollup" },
          ]}
          value={tab}
          onChange={(id) => setTab(id as "per-day" | "rollup")}
        />
        {tab === "per-day" ? (
          <div>
            <FormField label="Pick a day">
              <Input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} aria-label="Pick a day" />
            </FormField>
            {dayLoading ? (
              <p>Loading commission…</p>
            ) : dayErr ? (
              <p role="alert">Could not load commission. <Button variant="secondary" size="sm" onClick={reloadDay}>Retry</Button></p>
            ) : day ? (
              <>
                <div>
                  <KpiTile label="Deposits" value={fmtStaffInt(day.totals.deposits)} />
                  <KpiTile label="Total deposited" value={fmtStaffMoney(day.totals.totalAmount, fiat)} />
                  <KpiTile label="Commission" value={fmtStaffMoney(day.totals.totalCommission, fiat)} />
                </div>
                <p>Commission on {day.date}</p>
                {day.admins.length === 0 ? <p>No deposits that day.</p> : null}
                {day.admins.map((da) => (
                  <Card
                    key={da.admin.id}
                    title={`${da.admin.name} — ${fmtStaffMoney(da.totalAmount, fiat)} · ${fmtStaffMoney(da.totalCommission, fiat)} commission`}
                  >
                    <DataTable
                      viewId={`owner-commission-day-${da.admin.id}`}
                      columns={[
                        { key: "user", label: "User", render: (d) => d.userName },
                        {
                          key: "contact",
                          label: "Contact",
                          render: (d) => (
                            <MaskedValue
                              value={d.userContact}
                              kind={d.userContact.includes("@") ? "email" : "phone"}
                              label="Player contact"
                              onReveal={async () => {
                                const r = await api<{ value: { email: string | null; phone: string | null } }>("/api/owner/reveal", {
                                  method: "POST",
                                  body: JSON.stringify({ kind: "user-contact", id: d.userId }),
                                });
                                return d.userContact.includes("@") ? r.value.email : r.value.phone;
                              }}
                            />
                          ),
                          details: (d) => [
                            [
                              "Contact",
                              <MaskedValue
                                key="c"
                                value={d.userContact}
                                kind={d.userContact.includes("@") ? "email" : "phone"}
                                label="Player contact"
                                onReveal={async () => {
                                  const r = await api<{ value: { email: string | null; phone: string | null } }>("/api/owner/reveal", {
                                    method: "POST",
                                    body: JSON.stringify({ kind: "user-contact", id: d.userId }),
                                  });
                                  return d.userContact.includes("@") ? r.value.email : r.value.phone;
                                }}
                              />,
                            ],
                          ],
                        },
                        { key: "amount", label: "Amount", render: (d) => fmtStaffMoney(d.amount, d.fiatCurrency ?? fiat) },
                        {
                          key: "time",
                          label: "Time",
                          render: (d) => new Date(d.time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
                          details: (d) => [
                            ["Time", new Date(d.time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })],
                          ],
                        },
                        { key: "method", label: "Method", render: (d) => d.method, details: (d) => [["Method", d.method]] },
                        {
                          key: "commission",
                          label: "Commission",
                          render: (d) => `${fmtStaffMoney(d.commission, d.fiatCurrency ?? fiat)} (${d.pctInForce}%)`,
                          details: (d) => [
                            ["Commission", `${fmtStaffMoney(d.commission, d.fiatCurrency ?? fiat)} (${d.pctInForce}%)`],
                          ],
                        },
                      ]}
                      rows={da.deposits}
                      total={da.deposits.length}
                      page={1}
                      pageSize={da.deposits.length || 1}
                      onPageChange={() => {}}
                      emptyTitle="No deposits."
                      emptyText="No deposits for this admin that day."
                    />
                  </Card>
                ))}
              </>
            ) : null}
          </div>
        ) : (
          <DataTable<RollupDay & { id: string }>
            viewId="owner-commission-rollup"
            columns={rollupColumns}
            rows={rollupPageRows}
            total={rollupRows.length}
            page={rollupSafePage}
            pageSize={rollupPageSize}
            onPageChange={(p) => setRollupPage(p)}
            loading={rollupLoading}
            error={rollupErr}
            onRetry={reloadRollup}
            emptyTitle="No commission days yet."
            emptyText="No commission days yet."
          />
        )}
      </Card>

      <Card title="Settlement">
        <DateRange
          value={{ from: settleFrom, to: settleTo }}
          onChange={(v) => {
            setSettleFrom(v.from);
            setSettleTo(v.to);
          }}
          label="Settlement period"
          max={todayStr()}
        />
        {settleLoading ? (
          <p>Loading settlement…</p>
        ) : settleErr ? (
          <p role="alert">Could not load settlement. <Button variant="secondary" size="sm" onClick={reloadSettlement}>Retry</Button></p>
        ) : settlement ? (
          <>
            <div>
              <KpiTile label="Owed" value={fmtStaffMoney(settlement.totals.owed, fiat)} />
              <KpiTile label="Paid" value={fmtStaffMoney(settlement.totals.paid, fiat)} />
              <KpiTile label="Balance" value={fmtStaffMoney(settlement.totals.balance, fiat)} />
              <KpiTile label="Parent shares" value={fmtStaffMoney(settlement.totals.parentShare, fiat)} />
            </div>
            {settlement.rows.length === 0 ? (
              <p>No admins yet.</p>
            ) : (
              <DataTable<SettlementRow & { id: string }>
                viewId="owner-commission-settlement"
                columns={settlementColumns}
                rows={settlement.rows.map((r) => ({ ...r, id: r.adminId }))}
                total={settlement.rows.length}
                page={1}
                pageSize={settlement.rows.length || 1}
                onPageChange={() => {}}
                emptyTitle="No admins yet."
                emptyText="No admins yet."
              />
            )}
          </>
        ) : null}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (payAdmin && payAmount) setPayConfirm(true);
          }}
        >
          <FormField label="Pay admin">
            <Select value={payAdmin} onChange={(e) => setPayAdmin(e.target.value)} aria-label="Admin to pay" required>
              <option value="">Pay admin…</option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={`Amount (${fiat})`}>
            <AmountInput value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="0.00" required aria-label="Payout amount" />
          </FormField>
          <FormField label="Method">
            <Select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} aria-label="Method">
              {["MTN", "Telecel", "AirtelTigo", "bank", "cash"].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Reference (optional)">
            <Input type="text" placeholder="Reference (optional)" value={payRef} onChange={(e) => setPayRef(e.target.value)} aria-label="Reference" />
          </FormField>
          <Button variant="primary" type="submit" disabled={payBusy || !payAdmin || !payAmount}>
            Record payout
          </Button>
        </form>
      </Card>

      <ConfirmDialog
        open={payConfirm}
        onClose={() => setPayConfirm(false)}
        onConfirm={() => void recordPayout()}
        title="Record payout"
        body="This writes to the ledger and the audit log, and drops the admin's settlement balance."
        facts={[
          { label: "Admin", value: payAdminName },
          { label: "Amount", value: fmtStaffMoney(Number(payAmount) || 0, fiat) },
          { label: "Method", value: payMethod },
          { label: "Period", value: `${settleFrom} to ${settleTo}` },
          ...(payRef.trim() ? [{ label: "Reference", value: payRef.trim() }] : []),
        ]}
        confirmLabel="Record payout"
        busy={payBusy}
      />
    </div>
  );
}
