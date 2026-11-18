// Admin dashboard — Commission / History (Phase 6 restyle). Every
// commission day for this admin, newest first. Tapping a row opens that
// day's detail. Figures are shown exactly as the endpoint returns them.
"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { fmtStaffMoney } from "../../../../components/staff-ui/format";
import { useStore } from "../../../../lib/store";
import { useStaffFetch } from "../../../../components/staff-ui/useStaffFetch";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";
import { Card } from "../../../../components/staff-ui/Card";
import { DataTable, type DataColumn } from "../../../../components/staff-ui/DataTable";
import { Tabs } from "../../../../components/staff-ui/Tabs";
import { Skeleton, ErrorState } from "../../../../components/staff-ui/Feedback";
import CurrencyChips from "../../../../components/CurrencyChips";
import { canAccessSection } from "../../../../lib/rbac";
import type { AdminIdentity, AdminOverview } from "../../../../lib/admin-client";

type HistoryDay = AdminOverview["history"][number];

function modelLabel(h: HistoryDay): string {
  return h.model === "revshare"
    ? `RevShare ${h.rate}%`
    : h.model === "turnover"
      ? `Turnover ${h.rate}%`
      : h.model === "mixed"
        ? "Mixed"
        : "Legacy";
}

export default function AdminCommissionHistoryPage() {
  return (
    <Suspense fallback={<Skeleton lines={6} title />}>
      <AdminCommissionHistoryInner />
    </Suspense>
  );
}

function AdminCommissionHistoryInner() {
  const { user } = useStore();
  const router = useRouter();
  const sp = useSearchParams();
  const previewId = sp.get("preview");
  const [fiatSel, setFiatSel] = useState<string | null>(null);
  const fiat = fiatSel ?? sp.get("currency") ?? user?.currency ?? "GHS";
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const ctxUrl = useMemo(() => {
    if (!user) return null;
    return previewId ? `/api/owner/admins/${previewId}/preview` : "/api/admin/context";
  }, [user, previewId]);
  const ctx = useStaffFetch<{ admin: AdminIdentity }>(ctxUrl);
  const histUrl = useMemo(() => {
    if (!user) return null;
    const base = previewId ? `/api/owner/admins/${previewId}/preview` : "/api/admin/commission/history";
    return `${base}${base.includes("?") ? "&" : "?"}currency=${encodeURIComponent(fiat)}`;
  }, [user, previewId, fiat]);
  const hist = useStaffFetch<{ days?: HistoryDay[]; history?: HistoryDay[] }>(histUrl);
  const days = hist.data?.days ?? hist.data?.history ?? [];

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
  const admin = ctx.data?.admin;
  const totalPages = Math.max(1, Math.ceil(days.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = days.slice((safePage - 1) * pageSize, safePage * pageSize);

  const openDay = (h: HistoryDay) => {
    const params = new URLSearchParams();
    params.set("date", h.date);
    if (fiatSel) params.set("currency", fiatSel);
    if (previewId) params.set("preview", previewId);
    router.push(`/admin/commission?${params.toString()}`);
  };

  const columns: DataColumn<HistoryDay>[] = [
    {
      key: "date",
      label: "Date",
      render: (h) => h.date,
    },
    {
      key: "deposits",
      label: "Deposits",
      render: (h) => String(h.deposits),
      details: (h) => [["Deposits", String(h.deposits)]],
    },
    {
      key: "total",
      label: "Total deposited",
      render: (h) => fmtStaffMoney(h.totalAmount, h.fiatCurrency ?? fiat),
      details: (h) => [["Total deposited", fmtStaffMoney(h.totalAmount, h.fiatCurrency ?? fiat)]],
    },
    {
      key: "commission",
      label: "Commission",
      render: (h) => fmtStaffMoney(h.totalCommission, h.fiatCurrency ?? fiat),
      details: (h) => [["Commission", fmtStaffMoney(h.totalCommission, h.fiatCurrency ?? fiat)]],
    },
    {
      key: "model",
      label: "Model",
      render: (h) => modelLabel(h),
      details: (h) => [["Model", modelLabel(h)]],
    },
  ];

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
      <Card title="Commission history">
        <DataTable<HistoryDay & { id: string }>
          viewId="admin-commission-history"
          columns={columns as DataColumn<HistoryDay & { id: string }>[]}
          rows={pageRows.map((h) => ({ ...h, id: h.date }))}
          total={days.length}
          page={safePage}
          pageSize={pageSize}
          onPageChange={(p) => setPage(p)}
          loading={hist.loading}
          error={hist.err}
          onRetry={hist.reload}
          emptyTitle="No commission days yet."
          emptyText="Days with deposits from your downline show up here."
          selectedId={null}
          onSelect={openDay}
        />
      </Card>
    </div>
  );
}
