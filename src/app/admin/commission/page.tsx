// Admin dashboard — Commission (Phase 6 restyle). Day detail: one day's
// deposits with the rule that priced them (RevShare / Turnover / Legacy).
// The History view is its own route (/admin/commission/history) per
// Chuks's tab rule. The per-day figure and the rollup figure are shown
// exactly as the endpoints return them — the 2026-11-14 stamped-vs-rules
// disagreement is a pre-existing flag, not reconciled here.
"use client";

import { Suspense, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { fmtStaffMoney } from "../../../components/staff-ui/format";
import { useStore } from "../../../lib/store";
import { useStaffFetch } from "../../../components/staff-ui/useStaffFetch";
import { PageHeader } from "../../../components/staff-ui/PageHeader";
import { Card, KpiTile } from "../../../components/staff-ui/Card";
import { DataTable, type DataColumn } from "../../../components/staff-ui/DataTable";
import { Tabs } from "../../../components/staff-ui/Tabs";
import { Input, FormField } from "../../../components/staff-ui/Form";
import { Skeleton, ErrorState } from "../../../components/staff-ui/Feedback";
import { AdminContactValue } from "../../../components/admin/AdminReveal";
import CurrencyChips from "../../../components/CurrencyChips";
import { canAccessSection } from "../../../lib/rbac";
import { todayStr, type AdminIdentity, type DayDetail } from "../../../lib/admin-client";

type DayDeposit = DayDetail["deposits"][number];

export default function AdminCommissionPage() {
  return (
    <Suspense fallback={<Skeleton lines={6} title />}>
      <AdminCommissionInner />
    </Suspense>
  );
}

function AdminCommissionInner() {
  const { user } = useStore();
  const router = useRouter();
  const sp = useSearchParams();
  const previewId = sp.get("preview");
  const preview = !!previewId;
  const [fiatSel, setFiatSel] = useState<string | null>(null);
  const fiat = fiatSel ?? sp.get("currency") ?? user?.currency ?? "GHS";
  const date = sp.get("date") || todayStr();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const ctxUrl = useMemo(() => {
    if (!user) return null;
    return previewId ? `/api/owner/admins/${previewId}/preview` : "/api/admin/context";
  }, [user, previewId]);
  const ctx = useStaffFetch<{ admin: AdminIdentity }>(ctxUrl);
  const dayUrl = useMemo(() => {
    if (!user || !date) return null;
    const base = previewId
      ? `/api/owner/commission?adminId=${previewId}&date=${date}`
      : `/api/admin/commission?date=${date}`;
    return `${base}&currency=${encodeURIComponent(fiat)}`;
  }, [user, previewId, date, fiat]);
  const dayFetch = useStaffFetch<DayDetail>(dayUrl);
  const day = dayFetch.data;

  if (!user) return null;
  if (!previewId && !canAccessSection(user, "commission")) {
    return (
      <ErrorState
        title="No access to this section."
        text="You do not have access to the Commission section. Ask the owner to grant you access from the Owner panel."
      />
    );
  }

  const withPreview = (href: string) => (previewId ? `${href}?preview=${previewId}` : href);
  const playerHref = (id: string) => withPreview(`/admin/players/${id}`);
  const admin = ctx.data?.admin;
  const childAdmins = day?.scope.childAdmins ?? [];

  const pickDate = (v: string) => {
    if (!v) return;
    const params = new URLSearchParams(sp.toString());
    params.set("date", v);
    router.replace(`/admin/commission?${params.toString()}`);
    setPage(1);
  };

  const needle = q.trim().toLowerCase();
  const deposits = (day?.deposits ?? []).filter(
    (d) => !needle || `${d.userName} ${d.userContact} ${d.method}`.toLowerCase().includes(needle),
  );
  const totalPages = Math.max(1, Math.ceil(deposits.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = deposits.slice((safePage - 1) * pageSize, safePage * pageSize);

  const columns: DataColumn<DayDeposit>[] = [
    {
      key: "user",
      label: "User",
      render: (d) => d.userName,
    },
    {
      key: "contact",
      label: "Contact",
      render: (d) => <AdminContactValue userId={d.userId} contact={d.userContact} preview={preview} />,
      // The phone card renders details, not the cell — the masked
      // component (with audited Reveal) must live here too, never the
      // raw contact (D1: masked by default on every width).
      details: (d) => [
        ["Contact", <AdminContactValue key="contact-value" userId={d.userId} contact={d.userContact} preview={preview} />],
      ],
    },
    {
      key: "amount",
      label: "Amount",
      render: (d) => fmtStaffMoney(d.amount, d.fiatCurrency ?? fiat),
      details: (d) => [["Amount", fmtStaffMoney(d.amount, d.fiatCurrency ?? fiat)]],
    },
    {
      key: "time",
      label: "Time",
      render: (d) => new Date(d.time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
      details: (d) => [
        ["Time", new Date(d.time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })],
      ],
    },
    {
      key: "method",
      label: "Method",
      render: (d) => d.method,
      details: (d) => [["Method", d.method]],
    },
    {
      key: "commission",
      label: "Commission",
      render: (d) => `${fmtStaffMoney(d.commission, d.fiatCurrency ?? fiat)} (${d.pctInForce}%)`,
      details: (d) => [["Commission", `${fmtStaffMoney(d.commission, d.fiatCurrency ?? fiat)} (${d.pctInForce}%)`]],
    },
    ...(childAdmins.length > 0
      ? [
          {
            key: "admin",
            label: "Admin",
            render: (d: DayDeposit) => d.adminName || "—",
            details: (d: DayDeposit) => [["Admin", d.adminName || "—"]] as [string, ReactNode][],
          } as DataColumn<DayDeposit>,
        ]
      : []),
  ];

  const modelCaption = day
    ? day.totals.model === "revshare"
      ? `RevShare ${day.totals.rate}% of net loss · stakes ${fmtStaffMoney(day.totals.totalStakes ?? 0, day.fiatCurrency ?? fiat)} − payouts ${fmtStaffMoney(day.totals.totalPayouts ?? 0, day.fiatCurrency ?? fiat)}`
      : day.totals.model === "turnover"
        ? `Turnover ${day.totals.rate}% of stakes · stakes ${fmtStaffMoney(day.totals.totalStakes ?? 0, day.fiatCurrency ?? fiat)}`
        : day.totals.model === "mixed"
          ? "Mixed — your downline and child downlines priced on different rules"
          : "Legacy — flat % of deposits (no rule set)"
    : "";

  return (
    <div>
      <PageHeader
        title="Commission"
        sub={
          admin
            ? `${admin.name} · ${admin.commissionPct}% commission${admin.active ? "" : " · DEACTIVATED"}`
            : "Commission earned on your downline's deposits."
        }
        backHref={withPreview("/admin")}
        backLabel="Overview"
      />
      <Tabs
        label="Commission views"
        items={[
          { id: "day", label: "Day detail", href: withPreview("/admin/commission"), exact: true },
          { id: "history", label: "History", href: withPreview("/admin/commission/history") },
        ]}
      />
      <CurrencyChips value={fiat} onChange={setFiatSel} label="Commission currency" />
      {ctx.err ? (
        <ErrorState title="Could not load commission." text={ctx.err} onRetry={ctx.reload} />
      ) : dayFetch.err ? (
        <ErrorState title="Could not load this day." text={dayFetch.err} onRetry={dayFetch.reload} />
      ) : !day ? (
        <Skeleton lines={6} title />
      ) : (
        <Card title="Commission" sub={childAdmins.length > 0 ? `Includes your child admins' downlines: ${childAdmins.map((c) => c.name).join(", ")}.` : undefined}>
          <FormField label="Pick a day">
            <Input type="date" value={date} max={todayStr()} onChange={(e) => pickDate(e.target.value)} aria-label="Pick a day" />
          </FormField>
          <div className="st-kpi-grid">
            <KpiTile label="Deposits" value={String(day.totals.deposits)} />
            <KpiTile label="Total deposited" value={fmtStaffMoney(day.totals.totalAmount, day.fiatCurrency ?? fiat)} />
            <KpiTile label="Commission" value={fmtStaffMoney(day.totals.totalCommission, day.fiatCurrency ?? fiat)} />
          </div>
          <p>Commission on {day.date}</p>
          <p>{modelCaption}</p>
          <DataTable<DayDeposit>
            viewId="admin-commission-day"
            columns={columns}
            rows={pageRows}
            total={deposits.length}
            page={safePage}
            pageSize={pageSize}
            onPageChange={(p) => setPage(p)}
            search={q}
            onSearchChange={(v) => {
              setQ(v);
              setPage(1);
            }}
            searchPlaceholder="Search player, contact or method…"
            loading={dayFetch.loading}
            error={dayFetch.err}
            onRetry={dayFetch.reload}
            emptyTitle="No deposits that day."
            emptyText="No deposits from your downline on this day in this currency."
            rowHref={(d) => playerHref(d.userId)}
          />
        </Card>
      )}
    </div>
  );
}
