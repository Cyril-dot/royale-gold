// Owner Promotions (Phase 4 restyle) — split out of the old one-page
// owner panel (deleted in Phase 4). Same endpoints, same
// behaviour, staff-ui throughout: create form in a Card, promotions and
// recent grants as DataTables (cards on phone), Pause/Resume and Pay
// cashback through the shared ConfirmDialog (cashback shows the date
// and the consequence — the endpoint takes no reason, so none is asked
// for). Contacts are not shown here; grants show player names only,
// exactly as the list endpoint returns them.
"use client";

import { useMemo, useState } from "react";
import { api } from "../../../../lib/api";
import { todayStr } from "../../../../lib/admin-client";
import { useStore } from "../../../../lib/store";
import { useOwner } from "../../../../components/owner/OwnerContext";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";
import { Card } from "../../../../components/staff-ui/Card";
import { Button } from "../../../../components/staff-ui/Button";
import { DataTable, type DataColumn, type DataRowAction } from "../../../../components/staff-ui/DataTable";
import { StatusPill } from "../../../../components/staff-ui/Badge";
import { ConfirmDialog } from "../../../../components/staff-ui/Dialog";
import { FormField, Input, Select, AmountInput } from "../../../../components/staff-ui/Form";
import { fmtStaffMoney } from "../../../../components/staff-ui/format";
import { useOwnerFetch } from "../../../../components/owner/useOwnerFetch";
import type { AdminRow } from "../../../../components/owner/owner-types";

// P1 Batch 3 (O19): the promotion engine — the owner's campaigns.
interface PromoRow {
  id: string;
  name: string;
  type: string;
  percent: number;
  cap: number | null;
  coinAmount: number | null;
  trigger: string | null;
  startAt: string;
  endAt: string | null;
  targetAdminId: string | null;
  targetAdminName: string | null;
  active: boolean;
  grants: number;
  createdAt: string;
}
interface PromoGrantRow {
  id: string;
  promotionId: string;
  promotionName: string;
  userId: string;
  userName: string;
  amount: number;
  wallet: string;
  fiatCurrency: string;
  day: string;
  createdAt: string;
}
interface PromoResponse {
  promotions: PromoRow[];
  recentGrants: PromoGrantRow[];
}

const PROMO_FILTERS = [
  { id: "", label: "All" },
  { id: "active", label: "Active" },
  { id: "paused", label: "Paused" },
];

function rewardText(p: PromoRow): string {
  if (p.type === "deposit_match") return `Match ${p.percent}%`;
  if (p.type === "free_coins") return `${p.coinAmount} coins`;
  return `Cashback ${p.percent}%`;
}

function typeLine(p: PromoRow): string {
  if (p.type === "free_coins") return `On ${p.trigger === "first_deposit" ? "first deposit" : "signup"}`;
  if (p.type === "cashback") return "Paid by hand, one day at a time";
  return "On every deposit, once per player";
}

function fmtDateTime(s: string): string {
  return new Date(s).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function OwnerPromotionsPage() {
  const { user, toast } = useStore();
  const { fiat } = useOwner();

  const promosUrl = user ? "/api/owner/promotions" : null;
  const { data, err, loading, reload } = useOwnerFetch<PromoResponse>(promosUrl);
  const promos = useMemo(() => data?.promotions ?? [], [data]);
  const promoGrants = useMemo(() => data?.recentGrants ?? [], [data]);
  const adminsUrl = user ? "/api/owner/admins" : null;
  const { data: adminsData } = useOwnerFetch<{ admins: AdminRow[] }>(adminsUrl);
  const admins = adminsData?.admins ?? [];

  // Phase 1 country-based (Nov 2026): a run that pays players in
  // more than one fiat has no honest single total — show the per-fiat
  // split instead ("GH₵12.00 + ₦500.00").
  const fmtSplit = (totals: Record<string, number> | undefined, fallback: number) => {
    if (!totals || Object.keys(totals).length === 0) return fmtStaffMoney(fallback, fiat);
    return Object.entries(totals)
      .map(([c, v]) => fmtStaffMoney(v, c))
      .join(" + ");
  };

  const [promoName, setPromoName] = useState("");
  const [promoType, setPromoType] = useState<"deposit_match" | "free_coins" | "cashback">("deposit_match");
  const [promoPercent, setPromoPercent] = useState(50);
  const [promoCap, setPromoCap] = useState("");
  const [promoCoins, setPromoCoins] = useState(25);
  const [promoTrigger, setPromoTrigger] = useState<"signup" | "first_deposit">("signup");
  // Dates start empty and are filled on the first client render (the
  // supported render-phase adjustment — a mount effect is what the
  // lint rule forbids, and a useState initializer calling new Date()
  // would bake the build date into the prerender).
  const [promoStart, setPromoStart] = useState("");
  if (promoStart === "" && typeof window !== "undefined") setPromoStart(todayStr());
  const [promoEnd, setPromoEnd] = useState("");
  const [promoTarget, setPromoTarget] = useState("");
  const [promoBusy, setPromoBusy] = useState(false);
  const [cbDate, setCbDate] = useState("");
  if (cbDate === "" && typeof window !== "undefined") setCbDate(todayStr());
  const [cbBusy, setCbBusy] = useState<string | null>(null);
  const [cbResult, setCbResult] = useState<{
    promotionId: string;
    date: string;
    paid: number;
    total: number;
    totalsByCurrency: Record<string, number>;
  } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "toggle" | "cashback"; p: PromoRow } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // P1 Batch 3 (O19): create / pause-resume / manual cashback.
  const createPromo = async (e: React.FormEvent) => {
    e.preventDefault();
    setPromoBusy(true);
    try {
      await api("/api/owner/promotions", {
        method: "POST",
        body: JSON.stringify({
          name: promoName.trim(),
          type: promoType,
          percent: promoType === "free_coins" ? undefined : promoPercent,
          cap: promoCap.trim() === "" ? null : Number(promoCap),
          coinAmount: promoType === "free_coins" ? promoCoins : undefined,
          trigger: promoType === "free_coins" ? promoTrigger : undefined,
          startAt: promoStart,
          endAt: promoEnd || undefined,
          targetAdminId: promoTarget || undefined,
        }),
      });
      toast("Promotion created", "win");
      setPromoName("");
      setPromoCap("");
      setPromoEnd("");
      setPromoTarget("");
      reload();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not create promotion", "lose");
    } finally {
      setPromoBusy(false);
    }
  };
  const doTogglePromo = async () => {
    if (!confirm) return;
    const p = confirm.p;
    setConfirmBusy(true);
    try {
      await api(`/api/owner/promotions/${p.id}/toggle`, { method: "POST", body: JSON.stringify({ active: !p.active }) });
      toast(p.active ? "Promotion paused — it grants nothing new" : "Promotion resumed", "win");
      setConfirm(null);
      reload();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not toggle promotion", "lose");
    } finally {
      setConfirmBusy(false);
    }
  };
  const doPayCashback = async () => {
    if (!confirm) return;
    const p = confirm.p;
    if (!cbDate) {
      toast("Pick a date to pay cashback for", "lose");
      return;
    }
    setCbBusy(p.id);
    try {
      const r = await api<{
        promotionId: string;
        date: string;
        paid: number;
        total: number;
        totalsByCurrency: Record<string, number>;
      }>(`/api/owner/promotions/${p.id}/pay-cashback`, {
        method: "POST",
        body: JSON.stringify({ date: cbDate }),
      });
      setCbResult(r);
      toast(`Cashback paid — ${r.paid} ${r.paid === 1 ? "player" : "players"}, ${fmtSplit(r.totalsByCurrency, r.total)}`, "win");
      setConfirm(null);
      reload();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Cashback payment failed", "lose");
    } finally {
      setCbBusy(null);
    }
  };
  const runConfirm = async () => {
    if (!confirm) return;
    if (confirm.kind === "toggle") await doTogglePromo();
    else await doPayCashback();
  };

  const [promoFilter, setPromoFilter] = useState("");
  const [promoSearch, setPromoSearch] = useState("");
  const [promoPage, setPromoPage] = useState(1);
  const promoPageSize = 10;
  const filteredPromos = useMemo(() => {
    const q = promoSearch.trim().toLowerCase();
    return promos.filter((p) => {
      if (promoFilter === "active" && !p.active) return false;
      if (promoFilter === "paused" && p.active) return false;
      if (q && !`${p.name} ${p.type} ${p.targetAdminName ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [promos, promoFilter, promoSearch]);
  const promoTotalPages = Math.max(1, Math.ceil(filteredPromos.length / promoPageSize));
  const promoSafePage = Math.min(promoPage, promoTotalPages);
  const promoPageRows = filteredPromos.slice((promoSafePage - 1) * promoPageSize, promoSafePage * promoPageSize);

  const [grantSearch, setGrantSearch] = useState("");
  const [grantPage, setGrantPage] = useState(1);
  const grantPageSize = 10;
  const filteredGrants = useMemo(() => {
    const q = grantSearch.trim().toLowerCase();
    if (!q) return promoGrants;
    return promoGrants.filter((g) => `${g.promotionName} ${g.userName}`.toLowerCase().includes(q));
  }, [promoGrants, grantSearch]);
  const grantTotalPages = Math.max(1, Math.ceil(filteredGrants.length / grantPageSize));
  const grantSafePage = Math.min(grantPage, grantTotalPages);
  const grantPageRows = filteredGrants.slice((grantSafePage - 1) * grantPageSize, grantSafePage * grantPageSize);

  const hasCashback = promos.some((p) => p.type === "cashback");

  const promoColumns: DataColumn<PromoRow>[] = [
    {
      key: "promotion",
      label: "Promotion",
      render: (p) => p.name,
      sub: (p) => typeLine(p),
      // NOTE: DataTable's phone CardList only reads `details` from
      // columns AFTER the first — details on the first column never
      // render. Every detail below lives on its own column.
    },
    {
      key: "reward",
      label: "Reward",
      render: (p) => rewardText(p),
      sub: (p) => (p.cap !== null ? `Cap ${fmtStaffMoney(p.cap, fiat)}` : ""),
      details: (p) => [
        ["Reward", rewardText(p)],
        ...(p.cap !== null ? ([["Cap", fmtStaffMoney(p.cap, fiat)]] as [string, string][]) : []),
      ],
    },
    {
      key: "status",
      label: "Status",
      render: (p) => <StatusPill status={p.active ? "Active" : "Paused"} />,
      details: (p) => [["Status", p.active ? "Active" : "Paused"]],
    },
    {
      key: "dates",
      label: "Dates",
      render: (p) => `${p.startAt.slice(0, 10)} to ${p.endAt ? p.endAt.slice(0, 10) : "open"}`,
      details: (p) => [["Dates", `${p.startAt.slice(0, 10)} to ${p.endAt ? p.endAt.slice(0, 10) : "open"}`]],
    },
    {
      key: "target",
      label: "Target",
      render: (p) => (p.targetAdminName ? `${p.targetAdminName}'s downline` : "Every player"),
      details: (p) => [
        ["Target", p.targetAdminName ? `${p.targetAdminName}'s downline` : "Every player"],
        ["Grants", `${p.grants} ${p.grants === 1 ? "grant" : "grants"}`],
      ],
    },
  ];
  const promoActions: DataRowAction<PromoRow>[] = [
    {
      label: "Pause",
      onClick: (p) => setConfirm({ kind: "toggle", p }),
      disabled: (p) => !p.active || confirmBusy,
    },
    {
      label: "Resume",
      onClick: (p) => setConfirm({ kind: "toggle", p }),
      disabled: (p) => p.active || confirmBusy,
    },
    {
      label: "Pay cashback",
      onClick: (p) => setConfirm({ kind: "cashback", p }),
      disabled: (p) => p.type !== "cashback" || !cbDate || cbBusy === p.id,
    },
  ];

  const grantColumns: DataColumn<PromoGrantRow>[] = [
    { key: "promotion", label: "Promotion", render: (g) => g.promotionName },
    {
      key: "player",
      label: "Player",
      render: (g) => g.userName,
      details: (g) => [["Player", g.userName]],
    },
    {
      key: "amount",
      label: "Amount",
      render: (g) => (g.wallet === "coins" ? `${Math.round(g.amount)} coins` : fmtStaffMoney(g.amount, g.fiatCurrency ?? fiat)),
      details: (g) => [
        ["Amount", g.wallet === "coins" ? `${Math.round(g.amount)} coins` : fmtStaffMoney(g.amount, g.fiatCurrency ?? fiat)],
      ],
    },
    {
      key: "day",
      label: "Day",
      render: (g) => g.day || "—",
      details: (g) => [["Day", g.day || "—"]],
    },
    {
      key: "granted",
      label: "Granted",
      render: (g) => fmtDateTime(g.createdAt),
      details: (g) => [["Granted", fmtDateTime(g.createdAt)]],
    },
  ];

  return (
    <div>
      <PageHeader title="Promotions" sub="Campaigns, grants and cashback." />
      <OwnerRangeBar />
      <Card title="New promotion">
        <form onSubmit={createPromo}>
          <FormField label="Promotion name" required>
            <Input
              type="text"
              placeholder="Promotion name"
              value={promoName}
              onChange={(e) => setPromoName(e.target.value)}
              required
              minLength={3}
            />
          </FormField>
          <FormField label="Type">
            <Select
              value={promoType}
              onChange={(e) => setPromoType(e.target.value as "deposit_match" | "free_coins" | "cashback")}
              aria-label="Promotion type"
            >
              <option value="deposit_match">Deposit match — % of a deposit</option>
              <option value="free_coins">Free coins — on signup / first deposit</option>
              <option value="cashback">Cashback — % of a day&apos;s net loss</option>
            </Select>
          </FormField>
          {promoType !== "free_coins" ? (
            <FormField label="Percent %">
              <Input
                type="number"
                min={0.5}
                max={100}
                step={0.5}
                inputMode="decimal"
                value={promoPercent}
                onChange={(e) => setPromoPercent(Number(e.target.value))}
                aria-label="Percent"
              />
            </FormField>
          ) : (
            <>
              <FormField label="Coins">
                <Input
                  type="number"
                  min={1}
                  step={1}
                  inputMode="decimal"
                  value={promoCoins}
                  onChange={(e) => setPromoCoins(Number(e.target.value))}
                  aria-label="Coins"
                />
              </FormField>
              <FormField label="When the coins land">
                <Select
                  value={promoTrigger}
                  onChange={(e) => setPromoTrigger(e.target.value as "signup" | "first_deposit")}
                  aria-label="When the coins land"
                >
                  <option value="signup">On signup</option>
                  <option value="first_deposit">On first deposit</option>
                </Select>
              </FormField>
            </>
          )}
          <FormField label={`Cap (${fiat})`} hint="Empty = no cap.">
            <AmountInput value={promoCap} onChange={(e) => setPromoCap(e.target.value)} placeholder="No cap" aria-label="Cap" />
          </FormField>
          <FormField label="From">
            <Input type="date" value={promoStart} max={todayStr()} onChange={(e) => setPromoStart(e.target.value)} aria-label="Start date" />
          </FormField>
          <FormField label="To">
            <Input type="date" value={promoEnd} onChange={(e) => setPromoEnd(e.target.value)} aria-label="End date" />
          </FormField>
          <FormField label="Target (blank = every player)">
            <Select value={promoTarget} onChange={(e) => setPromoTarget(e.target.value)} aria-label="Target (blank = every player)">
              <option value="">Every player</option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}&apos;s downline
                </option>
              ))}
            </Select>
          </FormField>
          <Button variant="primary" type="submit" loading={promoBusy}>
            Create promotion
          </Button>
        </form>
      </Card>

      <Card title="Promotions">
        {hasCashback ? (
          <FormField label="Cashback date" hint="One date is shared by every cashback promotion.">
            <Input type="date" value={cbDate} max={todayStr()} onChange={(e) => setCbDate(e.target.value)} aria-label="Cashback date" />
          </FormField>
        ) : null}
        <DataTable<PromoRow>
          viewId="owner-promotions"
          columns={promoColumns}
          rows={promoPageRows}
          total={filteredPromos.length}
          page={promoSafePage}
          pageSize={promoPageSize}
          onPageChange={(p) => setPromoPage(p)}
          search={promoSearch}
          onSearchChange={(q) => {
            setPromoSearch(q);
            setPromoPage(1);
          }}
          searchPlaceholder="Search promotions…"
          filters={PROMO_FILTERS}
          activeFilter={promoFilter}
          onFilterChange={(id) => {
            setPromoFilter(id);
            setPromoPage(1);
          }}
          loading={loading}
          error={err}
          onRetry={reload}
          emptyTitle="No promotions yet."
          emptyText="Create the first promotion above."
          rowActions={promoActions}
        />
        {cbResult ? (
          <p>
            Paid {cbResult.paid} {cbResult.paid === 1 ? "player" : "players"} {fmtSplit(cbResult.totalsByCurrency, cbResult.total)}{" "}
            cashback for {cbResult.date}.
          </p>
        ) : null}
      </Card>

      <Card title="Recent grants">
        <DataTable<PromoGrantRow>
          viewId="owner-promo-grants"
          columns={grantColumns}
          rows={grantPageRows}
          total={filteredGrants.length}
          page={grantSafePage}
          pageSize={grantPageSize}
          onPageChange={(p) => setGrantPage(p)}
          search={grantSearch}
          onSearchChange={(q) => {
            setGrantSearch(q);
            setGrantPage(1);
          }}
          searchPlaceholder="Search grants by promotion or player…"
          loading={loading}
          error={err}
          onRetry={reload}
          emptyTitle="No grants yet."
          emptyText="Grants appear here once a promotion pays a player."
        />
      </Card>

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => void runConfirm()}
        title={
          confirm?.kind === "cashback"
            ? "Pay cashback"
            : confirm?.p.active
              ? "Pause promotion"
              : "Resume promotion"
        }
        body={
          confirm?.kind === "cashback"
            ? `Pays every eligible player ${confirm.p.percent}% of their net loss for ${cbDate} (capped). Paying the same day twice grants nothing new. The amount is worked out per player when you confirm.`
            : confirm?.p.active
              ? "Pausing stops the promotion granting anything new. Players already granted keep what they have."
              : "Resuming lets the promotion grant again from now."
        }
        facts={
          confirm
            ? [
                { label: "Promotion", value: confirm.p.name },
                { label: "Reward", value: rewardText(confirm.p) },
                ...(confirm.kind === "cashback" ? [{ label: "Date", value: cbDate }] : []),
                { label: "Status", value: confirm.p.active ? "Active" : "Paused" },
              ]
            : []
        }
        confirmLabel={confirm?.kind === "cashback" ? "Pay cashback" : confirm?.p.active ? "Pause" : "Resume"}
        busy={confirmBusy || cbBusy !== null}
      />
    </div>
  );
}
