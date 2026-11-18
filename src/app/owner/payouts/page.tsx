// Owner Payouts (Phase 3 restyle) — split out of the old one-page owner
// panel (src/app/owner/legacy/page.tsx). Same endpoints, same behaviour,
// staff-ui throughout, plus the Phase 3 depth: a month calendar and a
// list view beyond the 14-day strip, a per-admin commission-center view
// (that admin's deposits that day + payout history) inside Details, and
// beneficiary contact/account masked by default with one audited Reveal
// per person. Mark paid / Not paid / Reject go through the shared
// ConfirmDialog (Reject needs a reason, recorded in the audit detail).
// Paid stays DERIVED (see the API route's header) — no schema change.
"use client";

import { useMemo, useState } from "react";
import { api } from "../../../lib/api";
import { todayStr } from "../../../lib/admin-client";
import { useStore } from "../../../lib/store";
import { useOwner } from "../../../components/owner/OwnerContext";
import { OwnerRangeBar } from "../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../components/staff-ui/PageHeader";
import { Card, KpiTile } from "../../../components/staff-ui/Card";
import { Button } from "../../../components/staff-ui/Button";
import { DataTable, type DataColumn } from "../../../components/staff-ui/DataTable";
import { Badge } from "../../../components/staff-ui/Badge";
import { ConfirmDialog } from "../../../components/staff-ui/Dialog";
import { MaskedValue } from "../../../components/staff-ui/MaskedValue";
import { Segmented } from "../../../components/staff-ui/Tabs";
import { Skeleton, ErrorState } from "../../../components/staff-ui/Feedback";
import { FormField, Input } from "../../../components/staff-ui/Form";
import { fmtStaffMoney, fmtStaffInt } from "../../../components/staff-ui/format";
import { useOwnerFetch } from "../../../components/owner/useOwnerFetch";
import type { OwnerDayAdmin } from "../../../components/owner/owner-types";

// Payouts tab (Nov 2026): the people owed commission each day.
// One call per day selection; actions POST back to the same endpoint.
interface PayoutAccount { type: string; bankName: string | null; accountNumber: string | null; network: string | null; phoneNumber: string | null; accountName: string }
interface PayoutPerson {
  adminId: string; adminName: string; adminEmail: string | null; adminPhone: string | null;
  active: boolean; referralCode: string | null;
  owed: number; paid: number; paidAt: string | null;
  status: "paid" | "unpaid" | "rejected";
  account: PayoutAccount | null;
}
interface PayoutDay { date: string; hasOwed: boolean; allPaid: boolean }
interface CalendarDay { date: string; owed: number; paid: number; people: number; allPaid: boolean; hasOwed: boolean }
interface PayoutHistoryRow { id: string; amount: number; method: string; reference: string | null; periodFrom: string | null; periodTo: string | null; createdAt: string }
interface PayoutsData {
  day: string; currency: string; people: PayoutPerson[]; days: PayoutDay[];
  totals: { owed: number; paid: number; unpaid: number; paidCount: number; rejectedCount: number };
  calendar: { from: string; to: string; days: CalendarDay[] };
  history?: PayoutHistoryRow[];
}

interface RevealBundle {
  adminId: string;
  email: string | null;
  phone: string | null;
  account: PayoutAccount | null;
}

function StatusBadge({ status }: { status: PayoutPerson["status"] }) {
  if (status === "paid") return <Badge variant="paid">PAID</Badge>;
  if (status === "rejected") return <Badge variant="rejected">REJECTED</Badge>;
  return <Badge variant="held">UNPAID</Badge>;
}

/** The commission-center view for one admin on one day: that admin's
 *  deposits (from the Commission per-day endpoint) + payout history
 *  (from the payouts endpoint's ?adminId=). Mounted only while the
 *  person's Details is open. */
function PayoutPersonDetails({
  person,
  day,
  fiat,
  history,
  revealed,
  onReveal,
  onHide,
  revealBusy,
}: {
  person: PayoutPerson;
  day: string;
  fiat: string;
  history: PayoutHistoryRow[] | undefined;
  revealed: RevealBundle | null;
  onReveal: () => void;
  onHide: () => void;
  revealBusy: boolean;
}) {
  const { user } = useStore();
  const depositsUrl = useMemo(
    () => (user ? `/api/owner/commission?date=${day}&currency=${fiat}` : null),
    [user, day, fiat],
  );
  const { data: dayData, err: dayErr, loading: dayLoading } = useOwnerFetch<{
    date: string;
    admins: OwnerDayAdmin[];
    totals: { deposits: number; totalAmount: number; totalCommission: number };
  }>(depositsUrl);
  const mine = dayData?.admins.find((a) => a.admin.id === person.adminId);
  const deposits = mine?.deposits ?? [];
  const isRevealed = revealed?.adminId === person.adminId;
  const acctValue = person.account
    ? person.account.type === "momo"
      ? person.account.phoneNumber
      : person.account.accountNumber
    : null;
  const revealedAcctValue = isRevealed
    ? revealed.account
      ? revealed.account.type === "momo"
        ? revealed.account.phoneNumber
        : revealed.account.accountNumber
      : null
    : null;
  return (
    <div>
      <p>
        {person.adminName}
        {person.active ? "" : " (deactivated)"}
        {person.referralCode ? ` · Code ${person.referralCode}` : ""}
      </p>
      <p>
        Email:{" "}
        {person.adminEmail ? (
          <MaskedValue
            value={person.adminEmail}
            kind="email"
            label="Admin email"
            revealedValue={isRevealed ? revealed.email : null}
            onHide={onHide}
          />
        ) : (
          "—"
        )}
      </p>
      <p>
        Phone:{" "}
        {person.adminPhone ? (
          <MaskedValue
            value={person.adminPhone}
            kind="phone"
            label="Admin phone"
            revealedValue={isRevealed ? revealed.phone : null}
            onHide={onHide}
          />
        ) : (
          "—"
        )}
      </p>
      {person.account ? (
        <p>
          {person.account.type === "momo"
            ? `MoMo · ${person.account.network ?? ""} · `
            : `Bank · ${person.account.bankName ?? ""} · `}
          {acctValue ? (
            <MaskedValue
              value={acctValue}
              kind="account"
              label="Payout account"
              revealedValue={isRevealed ? revealedAcctValue : null}
              onHide={onHide}
            />
          ) : (
            "—"
          )}
          {` · ${person.account.accountName}`}
        </p>
      ) : (
        <p>No payout account saved.</p>
      )}
      {isRevealed ? (
        <Button variant="ghost" size="sm" onClick={onHide}>
          Hide details
        </Button>
      ) : (
        <Button variant="secondary" size="sm" loading={revealBusy} onClick={onReveal}>
          Reveal details
        </Button>
      )}
      <h4>Deposits {day}</h4>
      {dayLoading ? (
        <p>Loading deposits…</p>
      ) : dayErr ? (
        <p role="alert">Could not load deposits.</p>
      ) : deposits.length === 0 ? (
        <p>No deposits that day.</p>
      ) : (
        <DataTable
          viewId={`owner-payouts-deposits-${person.adminId}`}
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
              details: (d) => [["Time", new Date(d.time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })]],
            },
            { key: "method", label: "Method", render: (d) => d.method, details: (d) => [["Method", d.method]] },
            {
              key: "commission",
              label: "Commission",
              render: (d) => `${fmtStaffMoney(d.commission, d.fiatCurrency ?? fiat)} (${d.pctInForce}%)`,
              details: (d) => [["Commission", `${fmtStaffMoney(d.commission, d.fiatCurrency ?? fiat)} (${d.pctInForce}%)`]],
            },
          ]}
          rows={deposits}
          total={deposits.length}
          page={1}
          pageSize={deposits.length || 1}
          onPageChange={() => {}}
          emptyTitle="No deposits."
          emptyText="No deposits for this admin that day."
        />
      )}
      <h4>Payout history</h4>
      {!history ? (
        <p>Loading history…</p>
      ) : history.length === 0 ? (
        <p>No payouts recorded for this admin.</p>
      ) : (
        <DataTable<PayoutHistoryRow>
          viewId={`owner-payouts-history-${person.adminId}`}
          columns={[
            {
              key: "date",
              label: "Date",
              render: (r) => new Date(r.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
            },
            {
              key: "amount",
              label: "Amount",
              render: (r) => fmtStaffMoney(r.amount, fiat),
              details: (r) => [["Amount", fmtStaffMoney(r.amount, fiat)]],
            },
            { key: "method", label: "Method", render: (r) => r.method, details: (r) => [["Method", r.method]] },
            { key: "ref", label: "Reference", render: (r) => r.reference ?? "—", details: (r) => [["Reference", r.reference ?? "—"]] },
            {
              key: "period",
              label: "Period",
              render: (r) => (r.periodFrom && r.periodTo ? (r.periodFrom === r.periodTo ? r.periodFrom : `${r.periodFrom} → ${r.periodTo}`) : "—"),
              details: (r) => [
                ["Period", r.periodFrom && r.periodTo ? (r.periodFrom === r.periodTo ? r.periodFrom : `${r.periodFrom} → ${r.periodTo}`) : "—"],
              ],
            },
          ]}
          rows={history}
          total={history.length}
          page={1}
          pageSize={history.length || 1}
          onPageChange={() => {}}
          emptyTitle="No payouts."
          emptyText="No payouts recorded for this admin."
        />
      )}
    </div>
  );
}

export default function OwnerPayoutsPage() {
  const { user, toast } = useStore();
  const { fiat } = useOwner();
  const [payoutDay, setPayoutDay] = useState("");
  if (payoutDay === "" && typeof window !== "undefined") setPayoutDay(todayStr());
  const [calView, setCalView] = useState<"strip" | "month" | "list">("strip");
  const [calOffset, setCalOffset] = useState(0);
  const [payoutDetail, setPayoutDetail] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<RevealBundle | null>(null);
  const [revealBusy, setRevealBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ person: PayoutPerson; action: "paid" | "unpaid" | "rejected" } | null>(null);
  const [payoutBusy, setPayoutBusy] = useState<string | null>(null);

  // The calendar window follows the month offset (0 = current month).
  // Computed for the fetch URL only — never rendered.
  const calRange = useMemo(() => {
    const t = todayStr();
    const base = new Date(`${t.slice(0, 8)}01T00:00:00Z`);
    base.setUTCMonth(base.getUTCMonth() + calOffset);
    const from = base.toISOString().slice(0, 10);
    const end = new Date(base);
    end.setUTCMonth(end.getUTCMonth() + 1);
    end.setUTCDate(end.getUTCDate() - 1);
    let to = end.toISOString().slice(0, 10);
    if (to > t) to = t;
    return { from, to };
  }, [calOffset]);

  const url = useMemo(() => {
    if (!user || !payoutDay) return null;
    const p = new URLSearchParams({ day: payoutDay, currency: fiat, from: calRange.from, to: calRange.to });
    if (payoutDetail) p.set("adminId", payoutDetail);
    return `/api/owner/payouts?${p.toString()}`;
  }, [user, payoutDay, fiat, calRange, payoutDetail]);
  const { data: payouts, err, loading, reload } = useOwnerFetch<PayoutsData>(url);
  const people = payouts?.people ?? [];
  const totals = payouts?.totals ?? null;
  const calendar = payouts?.calendar;

  const openDetail = (adminId: string) => {
    setPayoutDetail((cur) => (cur === adminId ? null : adminId));
    setRevealed(null);
  };

  const revealDetails = async (person: PayoutPerson) => {
    setRevealBusy(true);
    try {
      const r = await api<{ value: { email: string | null; phone: string | null; account: PayoutAccount | null } }>(
        "/api/owner/reveal",
        { method: "POST", body: JSON.stringify({ kind: "payout-account", id: person.adminId }) },
      );
      setRevealed({ adminId: person.adminId, email: r.value.email, phone: r.value.phone, account: r.value.account });
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Reveal failed", "lose");
    } finally {
      setRevealBusy(false);
    }
  };

  const markPayout = async (reason: string) => {
    if (!confirm) return;
    const { person, action } = confirm;
    setPayoutBusy(person.adminId);
    try {
      await api("/api/owner/payouts", {
        method: "POST",
        body: JSON.stringify({
          day: payoutDay,
          adminId: person.adminId,
          action,
          currency: fiat,
          ...(action === "rejected" && reason ? { reason } : {}),
        }),
      });
      toast(action === "paid" ? "Marked paid" : action === "rejected" ? "Marked rejected" : "Marked unpaid", "win");
      setConfirm(null);
      reload();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not update payout", "lose");
    } finally {
      setPayoutBusy(null);
    }
  };

  // NOTE: DataTable's phone CardList only reads `details` from columns
  // AFTER the first — details on the first column never render.
  const calColumns: DataColumn<CalendarDay>[] = [
    {
      key: "date",
      label: "Date",
      render: (d) => (
        <Button variant="ghost" size="sm" onClick={() => setPayoutDay(d.date)}>
          {new Date(`${d.date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
        </Button>
      ),
    },
    {
      key: "owed",
      label: "Owed",
      render: (d) => fmtStaffMoney(d.owed, fiat),
      details: (d) => [["Owed", fmtStaffMoney(d.owed, fiat)]],
    },
    { key: "paid", label: "Paid", render: (d) => fmtStaffMoney(d.paid, fiat), details: (d) => [["Paid", fmtStaffMoney(d.paid, fiat)]] },
    { key: "people", label: "People", render: (d) => fmtStaffInt(d.people), details: (d) => [["People", fmtStaffInt(d.people)]] },
    {
      key: "status",
      label: "Status",
      render: (d) => {
        if (!d.hasOwed) return <Badge variant="muted">No one owed</Badge>;
        return d.allPaid ? <Badge variant="paid">All paid</Badge> : <Badge variant="held">Unpaid</Badge>;
      },
      details: (d) => [["Status", !d.hasOwed ? "No one owed" : d.allPaid ? "All paid" : "Unpaid"]],
    },
  ];

  const monthLabel = calendar
    ? new Date(`${calendar.from}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric" })
    : "";
  const firstWeekday = calendar ? (new Date(`${calendar.from}T00:00:00Z`).getUTCDay() + 6) % 7 : 0;

  return (
    <div>
      <PageHeader title="Payouts" sub="Commission owed per admin, per day." />
      <OwnerRangeBar />
      <Card title="Payouts">
        {totals ? (
          <div>
            <KpiTile label="Owed" value={fmtStaffMoney(totals.owed, fiat)} />
            <KpiTile label="Paid" value={fmtStaffMoney(totals.paid, fiat)} />
            <KpiTile label="Unpaid" value={fmtStaffInt(totals.unpaid)} sub="people" />
            <KpiTile label="Paid" value={fmtStaffInt(totals.paidCount)} sub="people" />
            <KpiTile label="Rejected" value={fmtStaffInt(totals.rejectedCount)} sub="people" />
          </div>
        ) : null}
        <Segmented
          label="Payouts view"
          items={[
            { id: "strip", label: "Recent days" },
            { id: "month", label: "Month" },
            { id: "list", label: "List" },
          ]}
          value={calView}
          onChange={(id) => setCalView(id as "strip" | "month" | "list")}
        />
        {loading && !payouts ? (
          <Skeleton lines={5} title />
        ) : err ? (
          <ErrorState text={err} onRetry={reload} />
        ) : payouts ? (
          <>
            {calView === "strip" ? (
              <div className="st-paydays" role="group" aria-label="Recent days">
                {payouts.days.map((d) => (
                  <button
                    key={d.date}
                    type="button"
                    className={`st-payday${payoutDay === d.date ? " st-payday-on" : ""}${d.hasOwed ? (d.allPaid ? " st-payday-paid" : " st-payday-owed") : ""}`}
                    onClick={() => setPayoutDay(d.date)}
                    aria-pressed={payoutDay === d.date}
                  >
                    {new Date(`${d.date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </button>
                ))}
                <FormField label="Pick a day">
                  <Input type="date" value={payoutDay} max={todayStr()} onChange={(e) => setPayoutDay(e.target.value)} aria-label="Payout day" />
                </FormField>
              </div>
            ) : null}
            {calView === "month" && calendar ? (
              <div>
                <div className="st-cal-nav">
                  <Button variant="secondary" size="sm" onClick={() => setCalOffset((o) => o - 1)}>
                    ‹ Prev
                  </Button>
                  <b>{monthLabel}</b>
                  <Button variant="secondary" size="sm" disabled={calOffset >= 0} onClick={() => setCalOffset((o) => o + 1)}>
                    Next ›
                  </Button>
                </div>
                <div className="st-cal" role="group" aria-label={monthLabel}>
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                    <span key={d} className="st-cal-head">
                      {d}
                    </span>
                  ))}
                  {Array.from({ length: firstWeekday }, (_, i) => (
                    <span key={`empty-${i}`} className="st-cal-empty" aria-hidden="true" />
                  ))}
                  {calendar.days.map((d) => (
                    <button
                      key={d.date}
                      type="button"
                      aria-label={`${d.date}: owed ${fmtStaffMoney(d.owed, fiat)}, paid ${fmtStaffMoney(d.paid, fiat)}`}
                      aria-pressed={payoutDay === d.date}
                      className={`st-cal-day${d.hasOwed ? (d.allPaid ? " st-cal-paid" : " st-cal-owed") : ""}${payoutDay === d.date ? " st-cal-on" : ""}`}
                      onClick={() => setPayoutDay(d.date)}
                    >
                      <span>{Number(d.date.slice(8, 10))}</span>
                      {d.hasOwed ? <span className="st-cal-amt">{fmtStaffMoney(d.owed, fiat)}</span> : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {calView === "list" && calendar ? (
              <DataTable<CalendarDay & { id: string }>
                viewId="owner-payouts-calendar"
                columns={calColumns}
                rows={calendar.days.map((d) => ({ ...d, id: d.date }))}
                total={calendar.days.length}
                page={1}
                pageSize={calendar.days.length || 1}
                onPageChange={() => {}}
                emptyTitle="No days in this range."
                emptyText="No days in this range."
              />
            ) : null}
          </>
        ) : null}

        {payouts && people.length === 0 ? <p>Nobody to pay that day.</p> : null}
        {people.map((p) => (
          <Card key={p.adminId} title={`${p.adminName}${p.active ? "" : " (deactivated)"}`}>
            <p>
              <b>{fmtStaffMoney(p.owed, fiat)}</b> owed <StatusBadge status={p.status} />
            </p>
            {p.paid > 0 ? (
              <p>
                Paid {fmtStaffMoney(p.paid, fiat)}
                {p.paidAt
                  ? ` · ${new Date(p.paidAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
                  : ""}
              </p>
            ) : null}
            <div>
              <Button
                variant="primary"
                size="sm"
                disabled={payoutBusy === p.adminId || p.status === "paid"}
                loading={payoutBusy === p.adminId}
                onClick={() => setConfirm({ person: p, action: "paid" })}
              >
                Mark paid
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={payoutBusy === p.adminId || p.status === "unpaid"}
                onClick={() => setConfirm({ person: p, action: "unpaid" })}
              >
                Not paid
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={payoutBusy === p.adminId || p.status === "rejected"}
                onClick={() => setConfirm({ person: p, action: "rejected" })}
              >
                Reject
              </Button>
              <Button variant="ghost" size="sm" onClick={() => openDetail(p.adminId)}>
                {payoutDetail === p.adminId ? "Hide details" : "Details"}
              </Button>
            </div>
            {payoutDetail === p.adminId ? (
              <PayoutPersonDetails
                person={p}
                day={payoutDay}
                fiat={fiat}
                history={payouts?.history}
                revealed={revealed}
                onReveal={() => void revealDetails(p)}
                onHide={() => setRevealed(null)}
                revealBusy={revealBusy}
              />
            ) : null}
          </Card>
        ))}
      </Card>

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={(reason) => void markPayout(reason)}
        title={
          confirm?.action === "paid" ? "Mark paid" : confirm?.action === "rejected" ? "Reject payout" : "Mark unpaid"
        }
        body={
          confirm?.action === "unpaid"
            ? "This deletes the Payouts-tab payout rows for this day. A day paid via Settlement cannot be reversed here."
            : confirm?.action === "paid"
              ? "This records a real payout for the remainder owed, method cash. The owner can correct the method in Settlement."
              : undefined
        }
        facts={
          confirm
            ? [
                { label: "Admin", value: confirm.person.adminName },
                { label: "Day", value: payoutDay },
                { label: "Owed", value: fmtStaffMoney(confirm.person.owed, fiat) },
                { label: "Already paid", value: fmtStaffMoney(confirm.person.paid, fiat) },
                ...(confirm.action === "paid"
                  ? [{ label: "To record", value: fmtStaffMoney(Math.max(0, confirm.person.owed - confirm.person.paid), fiat) }]
                  : []),
              ]
            : []
        }
        reasonRequired={confirm?.action === "rejected"}
        reasonLabel="Reason for rejection (required)"
        confirmLabel={confirm?.action === "paid" ? "Mark paid" : confirm?.action === "rejected" ? "Reject" : "Mark unpaid"}
        danger={confirm?.action === "rejected" || confirm?.action === "unpaid"}
        busy={payoutBusy !== null}
      />
    </div>
  );
}
