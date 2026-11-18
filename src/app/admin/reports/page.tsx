// Admin dashboard — Reports & export (Phase 6 restyle). Three CSV
// exports, generated from REAL tables, plus an on-screen preview of the
// first 10 rows of each. An admin's reports cover only their own
// downline; the owner previews one admin's reports with
// ?preview=<adminId>. ?preview=1 on the endpoint returns JSON for the
// preview; the plain URL downloads the CSV.
// The old page's loader called setState synchronously inside an effect
// (a lint error); this version uses the shared useStaffFetch hook.
// CSVs include player names, emails and phones in full — the header
// says so, and the previews show names only.
"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useStore } from "../../../lib/store";
import { fmtStaffMoney } from "../../../components/staff-ui/format";
import { todayStr } from "../../../lib/money";
import { useStaffFetch } from "../../../components/staff-ui/useStaffFetch";
import { PageHeader } from "../../../components/staff-ui/PageHeader";
import { Card } from "../../../components/staff-ui/Card";
import { DataTable, type DataColumn } from "../../../components/staff-ui/DataTable";
import { Button } from "../../../components/staff-ui/Button";
import { DateRange } from "../../../components/staff-ui/Form";
import { Skeleton, ErrorState } from "../../../components/staff-ui/Feedback";
import CurrencyChips from "../../../components/CurrencyChips";
import { canAccessSection } from "../../../lib/rbac";

type DepositRow = { date: string; player: string; contact: string; amount: number; method: string; referringAdmin: string; commission: number };
type PlayerRow = { name: string; contact: string; joined: string; totalDeposited: number; totalStaked: number; totalWon: number; commission: number };
type WithdrawalRow = { date: string; player: string; contact: string; amount: number; method: string; status: string; flags: string };

function thirtyDaysAgo(): string {
  return new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export default function AdminReportsPage() {
  return (
    <Suspense fallback={<Skeleton lines={6} title />}>
      <AdminReportsInner />
    </Suspense>
  );
}

function AdminReportsInner() {
  const { user } = useStore();
  const sp = useSearchParams();
  const previewId = sp.get("preview");
  const [from, setFrom] = useState(thirtyDaysAgo());
  const [to, setTo] = useState(todayStr());
  const [fiatSel, setFiatSel] = useState<string | null>(null);
  const fiat = fiatSel ?? user?.currency ?? "GHS";

  const base = useCallback(
    (kind: string) => (previewId ? `/api/owner/reports/${kind}?adminId=${previewId}` : `/api/admin/reports/${kind}`),
    [previewId],
  );

  const depUrl = useMemo(() => {
    if (!user) return null;
    return `${base("deposits")}${base("deposits").includes("?") ? "&" : "?"}from=${from}&to=${to}&currency=${fiat}&preview=1`;
  }, [user, base, from, to, fiat]);
  const playersUrl = useMemo(() => {
    if (!user) return null;
    return `${base("players")}${base("players").includes("?") ? "&" : "?"}currency=${fiat}&preview=1`;
  }, [user, base, fiat]);
  const wdUrl = useMemo(() => {
    if (!user) return null;
    return `${base("withdrawals")}${base("withdrawals").includes("?") ? "&" : "?"}from=${from}&to=${to}&currency=${fiat}&preview=1`;
  }, [user, base, from, to, fiat]);
  const dep = useStaffFetch<{ total: number; rows: DepositRow[] }>(depUrl);
  const players = useStaffFetch<{ total: number; rows: PlayerRow[] }>(playersUrl);
  const wd = useStaffFetch<{ total: number; rows: WithdrawalRow[] }>(wdUrl);
  const busy = dep.loading || players.loading || wd.loading;

  const refresh = () => {
    dep.reload();
    players.reload();
    wd.reload();
  };

  if (!user) return null;
  if (!previewId && !canAccessSection(user, "reports")) {
    return (
      <ErrorState
        title="No access to this section."
        text="You do not have access to the Reports section. Ask the owner to grant you access from the Owner panel."
      />
    );
  }

  const withPreview = (href: string) => (previewId ? `${href}?preview=${previewId}` : href);
  const err = dep.err || players.err || wd.err;

  const csvHref = (kind: string) => {
    const range = kind === "players" ? "" : `from=${from}&to=${to}`;
    const qs = [range, `currency=${fiat}`].filter(Boolean).join("&");
    const b = base(kind);
    return `${b}${qs ? `${b.includes("?") ? "&" : "?"}${qs}` : ""}`;
  };

  const depColumns: DataColumn<DepositRow>[] = [
    { key: "player", label: "Player", render: (r) => r.player, sub: (r) => r.date },
    { key: "date", label: "Date", render: (r) => r.date, details: (r) => [["Date", r.date]] },
    {
      key: "amount",
      label: "Amount",
      render: (r) => fmtStaffMoney(r.amount, fiat),
      details: (r) => [["Amount", fmtStaffMoney(r.amount, fiat)]],
    },
    { key: "method", label: "Method", render: (r) => r.method, details: (r) => [["Method", r.method]] },
    {
      key: "commission",
      label: "Commission",
      render: (r) => fmtStaffMoney(r.commission, fiat),
      details: (r) => [["Commission", fmtStaffMoney(r.commission, fiat)]],
    },
  ];
  const playerColumns: DataColumn<PlayerRow>[] = [
    { key: "player", label: "Player", render: (r) => r.name, sub: (r) => `Joined ${r.joined}` },
    {
      key: "deposited",
      label: "Deposited",
      render: (r) => fmtStaffMoney(r.totalDeposited, fiat),
      details: (r) => [["Deposited", fmtStaffMoney(r.totalDeposited, fiat)]],
    },
    {
      key: "staked",
      label: "Staked",
      render: (r) => fmtStaffMoney(r.totalStaked, fiat),
      details: (r) => [["Staked", fmtStaffMoney(r.totalStaked, fiat)]],
    },
    {
      key: "won",
      label: "Won",
      render: (r) => fmtStaffMoney(r.totalWon, fiat),
      details: (r) => [["Won", fmtStaffMoney(r.totalWon, fiat)]],
    },
    {
      key: "commission",
      label: "Commission",
      render: (r) => fmtStaffMoney(r.commission, fiat),
      details: (r) => [["Commission", fmtStaffMoney(r.commission, fiat)]],
    },
  ];
  const wdColumns: DataColumn<WithdrawalRow>[] = [
    { key: "player", label: "Player", render: (r) => r.player, sub: (r) => r.date },
    { key: "date", label: "Date", render: (r) => r.date, details: (r) => [["Date", r.date]] },
    {
      key: "amount",
      label: "Amount",
      render: (r) => fmtStaffMoney(r.amount, fiat),
      details: (r) => [["Amount", fmtStaffMoney(r.amount, fiat)]],
    },
    { key: "method", label: "Method", render: (r) => r.method, details: (r) => [["Method", r.method]] },
    { key: "status", label: "Status", render: (r) => r.status, details: (r) => [["Status", r.status]] },
    { key: "flags", label: "Flags", render: (r) => r.flags || "—", details: (r) => [["Flags", r.flags || "—"]] },
  ];

  const previewNote = (shown: number, total: number) => (
    <p>
      Showing {shown} of {total} rows — download the CSV for the full report.
    </p>
  );

  return (
    <div>
      <PageHeader
        title="Reports & export"
        sub="Deposits, players and withdrawals as CSV — built from the live tables, for your downline only. CSVs include player names, emails and phones in full — share them carefully."
        backHref={withPreview("/admin")}
        backLabel="Overview"
      />
      <CurrencyChips value={fiat} onChange={setFiatSel} label="Report currency" />
      <Card title="Date range" sub="The range applies to the deposits and withdrawals reports. The players report is all-time per player.">
        <DateRange value={{ from, to }} onChange={(v) => { setFrom(v.from); setTo(v.to); }} max={todayStr()} />
        <div style={{ marginTop: 12 }}>
          <Button loading={busy} onClick={() => void refresh()}>
            Refresh previews
          </Button>
        </div>
        {err ? (
          <p className="st-field-error" role="alert">
            {err}
          </p>
        ) : null}
      </Card>

      <Card title="Deposits report" sub="Date, player, amount, method, referring admin and the commission stamped on each deposit.">
        <DataTable<DepositRow & { id: string }>
          viewId="admin-reports-deposits"
          columns={depColumns as DataColumn<DepositRow & { id: string }>[]}
          rows={(dep.data?.rows ?? []).map((r, i) => ({ ...r, id: `dep-${i}` }))}
          total={dep.data?.rows.length ?? 0}
          page={1}
          pageSize={10}
          onPageChange={() => {}}
          loading={dep.loading}
          error={dep.err}
          onRetry={dep.reload}
          emptyTitle="No rows in this range."
          emptyText="No deposits from your downline in this range."
        />
        {dep.data ? previewNote(dep.data.rows.length, dep.data.total) : null}
        <a className="st-btn st-btn-primary" href={csvHref("deposits")} download>
          Download deposits CSV
        </a>
      </Card>

      <Card
        title="Players report"
        sub="Every player: joined date, total deposited, total staked, total won back, and commission (stamped sum — the Commission page is the source of truth for the rules-engine figure)."
      >
        <DataTable<PlayerRow & { id: string }>
          viewId="admin-reports-players"
          columns={playerColumns as DataColumn<PlayerRow & { id: string }>[]}
          rows={(players.data?.rows ?? []).map((r, i) => ({ ...r, id: `player-${i}` }))}
          total={players.data?.rows.length ?? 0}
          page={1}
          pageSize={10}
          onPageChange={() => {}}
          loading={players.loading}
          error={players.err}
          onRetry={players.reload}
          emptyTitle="No rows."
          emptyText="No players in your downline yet."
        />
        {players.data ? previewNote(players.data.rows.length, players.data.total) : null}
        <a className="st-btn st-btn-primary" href={csvHref("players")} download>
          Download players CSV
        </a>
      </Card>

      <Card title="Withdrawals report" sub="Date, player, amount, method, status and the risk flags on each request.">
        <DataTable<WithdrawalRow & { id: string }>
          viewId="admin-reports-withdrawals"
          columns={wdColumns as DataColumn<WithdrawalRow & { id: string }>[]}
          rows={(wd.data?.rows ?? []).map((r, i) => ({ ...r, id: `wd-${i}` }))}
          total={wd.data?.rows.length ?? 0}
          page={1}
          pageSize={10}
          onPageChange={() => {}}
          loading={wd.loading}
          error={wd.err}
          onRetry={wd.reload}
          emptyTitle="No rows in this range."
          emptyText="No withdrawals from your downline in this range."
        />
        {wd.data ? previewNote(wd.data.rows.length, wd.data.total) : null}
        <a className="st-btn st-btn-primary" href={csvHref("withdrawals")} download>
          Download withdrawals CSV
        </a>
      </Card>
    </div>
  );
}
