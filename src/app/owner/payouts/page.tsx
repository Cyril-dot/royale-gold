// Owner Payouts (Phase 2) — split out of the old one-page owner panel
// (src/app/owner/legacy/page.tsx). Same sections, same endpoints, same
// behaviour — now its own route, loading only its own data.
"use client";

import { useCallback, useEffect, useState } from "react";
import { api, fmtMoney } from "../../../lib/api";
import { todayStr } from "../../../lib/admin-client";
import { useStore } from "../../../lib/store";
import { useOwner } from "../../../components/owner/OwnerContext";
import { OwnerRangeBar } from "../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../components/staff-ui/PageHeader";

export default function OwnerPayoutsPage() {
  const { user, toast } = useStore();
  const { fiat } = useOwner();
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
  interface PayoutsData {
    day: string; currency: string; people: PayoutPerson[]; days: PayoutDay[];
    totals: { owed: number; paid: number; unpaid: number; paidCount: number; rejectedCount: number };
  }
  const [payoutDay, setPayoutDay] = useState("");
  const [payouts, setPayouts] = useState<PayoutsData | null>(null);
  const [payoutBusy, setPayoutBusy] = useState<string | null>(null);
  const [payoutDetail, setPayoutDetail] = useState<string | null>(null);
  const loadPayouts = useCallback(async (d: string) => {
    try { setPayouts(await api<PayoutsData>(`/api/owner/payouts?day=${d}&currency=${fiat}`)); } catch { setPayouts(null); }
  }, [fiat]);
  useEffect(() => { setPayoutDay(todayStr()); }, []);
  useEffect(() => { if (user && payoutDay) void loadPayouts(payoutDay); }, [payoutDay, loadPayouts, user]);
  const markPayout = async (adminId: string, action: "paid" | "unpaid" | "rejected") => {
    setPayoutBusy(adminId);
    try {
      await api("/api/owner/payouts", { method: "POST", body: JSON.stringify({ day: payoutDay, adminId, action, currency: fiat }) });
      toast(action === "paid" ? "Marked paid" : action === "rejected" ? "Marked rejected" : "Marked unpaid", "win");
      await loadPayouts(payoutDay);
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not update payout", "lose");
    } finally {
      setPayoutBusy(null);
    }
  };
  return (
    <div>
      <PageHeader title="Payouts" sub="Commission owed per admin, per day." />
      <OwnerRangeBar />
      <section className="admin-sec" id="ow-sec-payouts">
      <h3>Payouts</h3>
      {payouts && (
        <div className="ow-paydays" role="group" aria-label="Recent days">
          {payouts.days.map((d) => (
            <button key={d.date} type="button" className={`ow-payday${payoutDay === d.date ? " ow-payday-on" : ""}${d.hasOwed ? (d.allPaid ? " ow-payday-paid" : " ow-payday-owed") : ""}`} onClick={() => setPayoutDay(d.date)} aria-pressed={payoutDay === d.date}>
              {new Date(`${d.date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            </button>
          ))}
          <label className="ow-payday-pick">Pick a day <input type="date" value={payoutDay} max={todayStr()} onChange={(e) => setPayoutDay(e.target.value)} aria-label="Payout day" /></label>
        </div>
      )}
      {payouts === null ? <p>Loading payouts…</p> : payouts.people.length === 0 ? (
        <p>Nobody to pay that day.</p>
      ) : (
        <div className="ow-games">
          {payouts.people.map((p) => (
            <div key={p.adminId} className="ow-game-row">
              <div className="ow-game-head">
                <b>{p.adminName}</b>
                <span className="ow-game-cur">{fmtMoney(p.owed, fiat)}</span>
                <span className={`ow-game-flag${p.status === "paid" ? " ok" : p.status === "rejected" ? " bad" : " gold"}`}>{p.status === "paid" ? "PAID" : p.status === "rejected" ? "REJECTED" : "UNPAID"}</span>
              </div>
              {p.paid > 0 && (
                <p className="ow-game-note">Paid {fmtMoney(p.paid, fiat)}{p.paidAt ? ` · ${new Date(p.paidAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}</p>
              )}
              <div className="ow-game-toggles">
                <button type="button" className="btn btn-sm btn-gold" disabled={payoutBusy === p.adminId || p.status === "paid"} onClick={() => void markPayout(p.adminId, "paid")}>{payoutBusy === p.adminId ? "Saving…" : "Mark paid"}</button>
                <button type="button" className="btn btn-sm btn-ghost" disabled={payoutBusy === p.adminId || p.status === "unpaid"} onClick={() => void markPayout(p.adminId, "unpaid")}>Not paid</button>
                <button type="button" className="btn btn-sm btn-ghost" disabled={payoutBusy === p.adminId || p.status === "rejected"} onClick={() => void markPayout(p.adminId, "rejected")}>Reject</button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setPayoutDetail(payoutDetail === p.adminId ? null : p.adminId)}>{payoutDetail === p.adminId ? "Hide details" : "Details"}</button>
              </div>
              {payoutDetail === p.adminId && (
                <div>
                  <p className="ow-game-note">{p.adminName}{p.active ? "" : " (deactivated)"} · {p.adminEmail ?? "—"}{p.adminPhone ? ` · ${p.adminPhone}` : ""}{p.referralCode ? ` · Code ${p.referralCode}` : ""}</p>
                  {p.account ? (
                    p.account.type === "momo" ? (
                      <p className="ow-game-note">MoMo · {p.account.network} · {p.account.phoneNumber} · {p.account.accountName}</p>
                    ) : (
                      <p className="ow-game-note">Bank · {p.account.bankName} · {p.account.accountNumber} · {p.account.accountName}</p>
                    )
                  ) : (
                    <p className="ow-game-note">No payout account saved.</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      </section>
    </div>
  );
}
