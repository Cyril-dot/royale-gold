// Owner Loyalty (Phase 4 restyle) — split out of the old one-page owner
// panel (deleted in Phase 4). Same endpoints, same
// behaviour, staff-ui throughout: settings form in a Card, tier
// thresholds / birthdays today / latest players as DataTables (cards
// on phone). Birthday contacts are masked with an audited Reveal
// (POST /api/owner/reveal, kind user-contact). Paying the birthday
// bonuses is money-moving, so it goes through the shared ConfirmDialog
// (bonus each, how many unpaid today, consequence) — the endpoint
// takes no body, so no reason is asked for.
"use client";

import { useMemo, useState } from "react";
import { api } from "../../../../lib/api";
import { useStore } from "../../../../lib/store";
import { useOwner } from "../../../../components/owner/OwnerContext";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";
import { Card } from "../../../../components/staff-ui/Card";
import { Button } from "../../../../components/staff-ui/Button";
import { DataTable, type DataColumn } from "../../../../components/staff-ui/DataTable";
import { Badge } from "../../../../components/staff-ui/Badge";
import { ConfirmDialog } from "../../../../components/staff-ui/Dialog";
import { FormField, Input } from "../../../../components/staff-ui/Form";
import { MaskedValue } from "../../../../components/staff-ui/MaskedValue";
import { Skeleton, ErrorState } from "../../../../components/staff-ui/Feedback";
import { fmtStaffMoney, fmtStaffInt } from "../../../../components/staff-ui/format";
import { useOwnerFetch } from "../../../../components/owner/useOwnerFetch";

// O28: loyalty / VIP config — the points rule (a read-only display
// rule: points are computed live from total staked, no ledger), the
// tier thresholds (read-only, from the VIP tiers above) and the
// birthday bonus, paid ONCE per year by a manual button (no cron).
interface LoyaltyData {
  settings: { pointsPerGhs: number; birthdayBonus: number };
  tiers: { id: string; name: string; minDeposited: number; perks: string[] }[];
  birthdaysToday: { userId: string; userName: string; userContact: string | null; birthday: string; paidThisYear: boolean }[];
  players: { id: string; name: string; totalDeposited: number; totalStaked: number; fiatCurrency: string; points: number; tier: string | null }[];
}

export default function OwnerLoyaltyPage() {
  const { user, toast } = useStore();
  const { fiat } = useOwner();
  const url = user ? "/api/owner/loyalty-settings" : null;
  const { data: loyalty, err, loading, reload } = useOwnerFetch<LoyaltyData>(url);

  // Phase 1 country-based (Nov 2026): a run that pays players in
  // more than one fiat has no honest single total — show the per-fiat
  // split instead ("GH₵12.00 + ₦500.00").
  const fmtSplit = (totals: Record<string, number> | undefined, fallback: number) => {
    if (!totals || Object.keys(totals).length === 0) return fmtStaffMoney(fallback, fiat);
    return Object.entries(totals)
      .map(([c, v]) => fmtStaffMoney(v, c))
      .join(" + ");
  };

  // Editable copy of the fetched settings, synced during render
  // whenever a NEW fetch lands (reference comparison, so typing in
  // the form never gets clobbered by a re-render).
  const fetchedSettings = loyalty?.settings ?? null;
  const [loyPoints, setLoyPoints] = useState<string | null>(null);
  const [loyBonus, setLoyBonus] = useState<string | null>(null);
  const [syncedSettings, setSyncedSettings] = useState<LoyaltyData["settings"] | null>(null);
  if (fetchedSettings !== null && syncedSettings !== fetchedSettings) {
    setSyncedSettings(fetchedSettings);
    setLoyPoints(String(fetchedSettings.pointsPerGhs));
    setLoyBonus(String(fetchedSettings.birthdayBonus));
  }

  const [loyBusy, setLoyBusy] = useState(false);
  const [bdayPayBusy, setBdayPayBusy] = useState(false);
  const [payConfirm, setPayConfirm] = useState(false);
  const [payResult, setPayResult] = useState<{
    count: number;
    total: number;
    totalsByCurrency: Record<string, number>;
    alreadyPaid: number;
  } | null>(null);

  const saveLoyalty = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoyBusy(true);
    try {
      await api("/api/owner/loyalty-settings", {
        method: "POST",
        body: JSON.stringify({ pointsPerGhs: Number(loyPoints), birthdayBonus: Number(loyBonus) }),
      });
      toast("Loyalty settings saved", "win");
      reload();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Loyalty settings failed", "lose");
    } finally {
      setLoyBusy(false);
    }
  };
  const payBirthdays = async () => {
    setBdayPayBusy(true);
    try {
      const r = await api<{
        paid: { userId: string; userName: string; amount: number }[];
        total: number;
        totalsByCurrency: Record<string, number>;
        count: number;
        alreadyPaid: number;
      }>("/api/owner/loyalty/pay-birthdays", { method: "POST" });
      setPayResult({ count: r.count, total: r.total, totalsByCurrency: r.totalsByCurrency ?? {}, alreadyPaid: r.alreadyPaid });
      toast(
        r.count === 0 ? "Nobody to pay today" : `Paid ${fmtSplit(r.totalsByCurrency, r.total)} to ${r.count} ${r.count === 1 ? "player" : "players"}`,
        "win",
      );
      setPayConfirm(false);
      reload();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Birthday pay failed", "lose");
    } finally {
      setBdayPayBusy(false);
    }
  };

  const tiers = loyalty?.tiers ?? [];
  const birthdays = useMemo(
    () => (loyalty?.birthdaysToday ?? []).map((b) => ({ ...b, id: b.userId })),
    [loyalty],
  );
  const unpaidToday = birthdays.filter((b) => !b.paidThisYear).length;

  const [bdayPage, setBdayPage] = useState(1);
  const bdayPageSize = 10;
  const bdayTotalPages = Math.max(1, Math.ceil(birthdays.length / bdayPageSize));
  const bdaySafePage = Math.min(bdayPage, bdayTotalPages);
  const bdayPageRows = birthdays.slice((bdaySafePage - 1) * bdayPageSize, bdaySafePage * bdayPageSize);

  const [playerSearch, setPlayerSearch] = useState("");
  const [playerPage, setPlayerPage] = useState(1);
  const playerPageSize = 10;
  const players = useMemo(() => loyalty?.players ?? [], [loyalty]);
  const filteredPlayers = useMemo(() => {
    const q = playerSearch.trim().toLowerCase();
    if (!q) return players;
    return players.filter((p) => `${p.name} ${p.tier ?? ""}`.toLowerCase().includes(q));
  }, [players, playerSearch]);
  const playerTotalPages = Math.max(1, Math.ceil(filteredPlayers.length / playerPageSize));
  const playerSafePage = Math.min(playerPage, playerTotalPages);
  const playerPageRows = filteredPlayers.slice((playerSafePage - 1) * playerPageSize, playerSafePage * playerPageSize);

  const tierColumns: DataColumn<LoyaltyData["tiers"][number]>[] = [
    { key: "tier", label: "Tier", render: (t) => t.name },
    {
      key: "min",
      label: "Min deposited",
      render: (t) => fmtStaffMoney(t.minDeposited, "GHS"),
      details: (t) => [["Min deposited", fmtStaffMoney(t.minDeposited, "GHS")]],
    },
    {
      key: "perks",
      label: "Perks",
      render: (t) => (t.perks.length === 0 ? "—" : t.perks.join(", ")),
      details: (t) => [["Perks", t.perks.length === 0 ? "—" : t.perks.join(", ")]],
    },
  ];
  // Birthday contact, masked by default with an audited Reveal —
  // the same cell is used on desktop and in the phone card details,
  // so the full contact never leaks through the card view.
  const contactCell = (b: (typeof birthdays)[number]) => {
    const contact = b.userContact;
    if (!contact) return "—";
    return (
      <MaskedValue
        value={contact}
        kind={contact.includes("@") ? "email" : "phone"}
        label="Player contact"
        onReveal={async () => {
          const r = await api<{ value: { email: string | null; phone: string | null } }>("/api/owner/reveal", {
            method: "POST",
            body: JSON.stringify({ kind: "user-contact", id: b.userId }),
          });
          return contact.includes("@") ? r.value.email : r.value.phone;
        }}
      />
    );
  };
  const bdayColumns: DataColumn<(typeof birthdays)[number]>[] = [
    { key: "player", label: "Player", render: (b) => b.userName },
    {
      key: "contact",
      label: "Contact",
      render: (b) => contactCell(b),
      details: (b) => [["Contact", contactCell(b)]],
    },
    {
      key: "birthday",
      label: "Birthday",
      render: (b) => b.birthday,
      details: (b) => [["Birthday", b.birthday]],
    },
    {
      key: "paid",
      label: "Paid this year",
      render: (b) => (b.paidThisYear ? <Badge variant="ok">Paid</Badge> : <Badge variant="pending">Unpaid</Badge>),
      details: (b) => [["Paid this year", b.paidThisYear ? "Yes" : "No"]],
    },
  ];
  const playerColumns: DataColumn<LoyaltyData["players"][number]>[] = [
    { key: "player", label: "Player", render: (p) => p.name },
    {
      key: "tier",
      label: "Tier",
      render: (p) => p.tier ?? "—",
      details: (p) => [["Tier", p.tier ?? "—"]],
    },
    {
      key: "staked",
      label: "Total staked",
      render: (p) => fmtStaffMoney(p.totalStaked, p.fiatCurrency ?? fiat),
      details: (p) => [["Total staked", fmtStaffMoney(p.totalStaked, p.fiatCurrency ?? fiat)]],
    },
    {
      key: "points",
      label: "Points",
      render: (p) => fmtStaffInt(p.points),
      details: (p) => [["Points", fmtStaffInt(p.points)]],
    },
  ];

  const bonus = loyalty?.settings.birthdayBonus ?? 0;

  return (
    <div>
      <PageHeader title="Loyalty" sub="Points, tiers and birthday bonuses." />
      <OwnerRangeBar />
      {loading && loyalty === null ? (
        <Card title="Loyalty">
          <Skeleton lines={5} />
        </Card>
      ) : err ? (
        <Card title="Loyalty">
          <ErrorState text={err} onRetry={reload} />
        </Card>
      ) : loyalty === null ? null : (
        <>
          <Card title="Loyalty settings">
            <form onSubmit={saveLoyalty}>
              <FormField label="Points per GH₵ staked">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  inputMode="decimal"
                  value={loyPoints ?? ""}
                  onChange={(e) => setLoyPoints(e.target.value)}
                  aria-label="Points per GH₵ staked"
                />
              </FormField>
              <FormField label="Birthday bonus (GH₵)">
                <Input
                  type="number"
                  min={0}
                  max={10000}
                  step="0.01"
                  inputMode="decimal"
                  value={loyBonus ?? ""}
                  onChange={(e) => setLoyBonus(e.target.value)}
                  aria-label="Birthday bonus in GH₵"
                />
              </FormField>
              <Button variant="primary" type="submit" loading={loyBusy}>
                Save loyalty settings
              </Button>
            </form>
          </Card>

          <Card title="Tier thresholds" sub="Read-only — edit in VIP tiers.">
            <DataTable<LoyaltyData["tiers"][number]>
              viewId="owner-loyalty-tiers"
              columns={tierColumns}
              rows={tiers}
              total={tiers.length}
              page={1}
              pageSize={25}
              onPageChange={() => {}}
              emptyTitle="No tiers yet."
              emptyText="Create tiers on the VIP tiers page."
            />
          </Card>

          <Card title="Birthdays today">
            <DataTable<(typeof birthdays)[number]>
              viewId="owner-loyalty-birthdays"
              columns={bdayColumns}
              rows={bdayPageRows}
              total={birthdays.length}
              page={bdaySafePage}
              pageSize={bdayPageSize}
              onPageChange={(p) => setBdayPage(p)}
              emptyTitle="No player has a birthday today."
              emptyText="Check back tomorrow."
            />
            <Button
              variant="primary"
              loading={bdayPayBusy}
              disabled={bonus <= 0}
              onClick={() => setPayConfirm(true)}
            >
              {`Pay birthday bonuses for today (${fmtStaffMoney(bonus, "GHS")} each)`}
            </Button>
            {bonus <= 0 ? <p>The birthday bonus is GH₵ 0 — set an amount above to pay anything.</p> : null}
            {payResult ? (
              <p>
                Last run: paid {payResult.count} {payResult.count === 1 ? "player" : "players"} (
                {fmtSplit(payResult.totalsByCurrency, payResult.total)})
                {payResult.alreadyPaid > 0 ? ` · ${payResult.alreadyPaid} already paid this year, skipped` : ""}. A second run
                today pays nobody.
              </p>
            ) : null}
          </Card>

          <Card title="Players (latest 10) — live points">
            <DataTable<LoyaltyData["players"][number]>
              viewId="owner-loyalty-players"
              columns={playerColumns}
              rows={playerPageRows}
              total={filteredPlayers.length}
              page={playerSafePage}
              pageSize={playerPageSize}
              onPageChange={(p) => setPlayerPage(p)}
              search={playerSearch}
              onSearchChange={(q) => {
                setPlayerSearch(q);
                setPlayerPage(1);
              }}
              searchPlaceholder="Search players…"
              emptyTitle="No players yet."
              emptyText="Players appear here once they have staked."
            />
          </Card>
        </>
      )}

      <ConfirmDialog
        open={payConfirm}
        onClose={() => setPayConfirm(false)}
        onConfirm={() => void payBirthdays()}
        title="Pay birthday bonuses"
        body="Pays the birthday bonus once to every player whose birthday is today and who has not already been paid this year. A second run today pays nobody."
        facts={[
          { label: "Bonus each", value: fmtStaffMoney(bonus, "GHS") },
          { label: "Unpaid today", value: `${unpaidToday} ${unpaidToday === 1 ? "player" : "players"}` },
          ...(birthdays.length - unpaidToday > 0
            ? [{ label: "Already paid", value: `${birthdays.length - unpaidToday} skipped` }]
            : []),
        ]}
        confirmLabel="Pay birthdays"
        busy={bdayPayBusy}
      />
    </div>
  );
}
