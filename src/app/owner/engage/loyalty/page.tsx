// Owner Loyalty (Phase 2) — split out of the old one-page owner panel
// (src/app/owner/legacy/page.tsx). Same sections, same endpoints, same
// behaviour — now its own route, loading only its own data.
"use client";

import { useCallback, useEffect, useState } from "react";
import { api, fmtMoney } from "../../../../lib/api";
import { useStore } from "../../../../lib/store";
import { useOwner } from "../../../../components/owner/OwnerContext";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";

export default function OwnerLoyaltyPage() {
  const { user, toast } = useStore();
  const { fiat } = useOwner();
  // Phase 1 country-based (Nov 2026): a run that pays players in
  // more than one fiat has no honest single total — show the per-fiat
  // split instead ("GH₵ 12.00 + ₦500.00").
  const fmtSplit = (totals: Record<string, number> | undefined, fallback: number) => {
    if (!totals || Object.keys(totals).length === 0) return fmtMoney(fallback, fiat);
    return Object.entries(totals).map(([c, v]) => fmtMoney(v, c)).join(" + ");
  };

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
  const [loyalty, setLoyalty] = useState<LoyaltyData | null>(null);
  const [loyPoints, setLoyPoints] = useState("1");
  const [loyBonus, setLoyBonus] = useState("0");
  const [loyBusy, setLoyBusy] = useState(false);
  const [bdayPayBusy, setBdayPayBusy] = useState(false);
  const [payResult, setPayResult] = useState<{ count: number; total: number; totalsByCurrency: Record<string, number>; alreadyPaid: number } | null>(null);
  const loadLoyalty = useCallback(async () => {
    try {
      const r = await api<LoyaltyData>("/api/owner/loyalty-settings");
      setLoyalty(r);
      setLoyPoints(String(r.settings.pointsPerGhs));
      setLoyBonus(String(r.settings.birthdayBonus));
    } catch { setLoyalty(null); }
  }, []);
  useEffect(() => { if (user) void loadLoyalty(); }, [loadLoyalty, user]);
  const saveLoyalty = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoyBusy(true);
    try {
      await api("/api/owner/loyalty-settings", { method: "POST", body: JSON.stringify({ pointsPerGhs: Number(loyPoints), birthdayBonus: Number(loyBonus) }) });
      toast("Loyalty settings saved", "win");
      await loadLoyalty();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Loyalty settings failed", "lose");
    } finally { setLoyBusy(false); }
  };
  const payBirthdays = async () => {
    setBdayPayBusy(true);
    try {
      const r = await api<{ paid: { userId: string; userName: string; amount: number }[]; total: number; totalsByCurrency: Record<string, number>; count: number; alreadyPaid: number }>("/api/owner/loyalty/pay-birthdays", { method: "POST" });
      setPayResult({ count: r.count, total: r.total, totalsByCurrency: r.totalsByCurrency ?? {}, alreadyPaid: r.alreadyPaid });
      toast(r.count === 0 ? "Nobody to pay today" : `Paid ${fmtSplit(r.totalsByCurrency, r.total)} to ${r.count} ${r.count === 1 ? "player" : "players"}`, "win");
      await loadLoyalty();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Birthday pay failed", "lose");
    } finally { setBdayPayBusy(false); }
  };
  return (
    <div>
      <PageHeader title="Loyalty" sub="Points, tiers and birthday bonuses." />
      <OwnerRangeBar />
      <section className="admin-sec">
      <h3>Loyalty</h3>
      {loyalty === null ? <p>Loading loyalty…</p> : (
        <>
          <form className="owner-add ow-form-rows" onSubmit={saveLoyalty}>
            <div className="pd-adjust-row ow-stack">
              <label>Points per GH₵ staked
                <input type="number" min={0} max={100} step="0.01" inputMode="decimal" value={loyPoints} onChange={(e) => setLoyPoints(e.target.value)} aria-label="Points per GH₵ staked" />
              </label>
              <label>Birthday bonus (GH₵)
                <input type="number" min={0} max={10000} step="0.01" inputMode="decimal" value={loyBonus} onChange={(e) => setLoyBonus(e.target.value)} aria-label="Birthday bonus in GH₵" />
              </label>
              <button className="btn btn-gold" type="submit" disabled={loyBusy}>{loyBusy ? "Saving…" : "Save loyalty settings"}</button>
            </div>
          </form>
          <h4>Tier thresholds (read-only — edit in VIP tiers above)</h4>
          <div className="rg48-twrap">
            <table className="dep-table">
              <thead><tr><th>Tier</th><th>Min deposited</th><th>Perks</th></tr></thead>
              <tbody>
                {loyalty.tiers.map((t) => (
                  <tr key={t.id}><td>{t.name}</td><td>{fmtMoney(t.minDeposited, "GHS")}</td><td>{t.perks.length === 0 ? "—" : t.perks.join(", ")}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <h4>Birthdays today</h4>
          {loyalty.birthdaysToday.length === 0 ? (
            <p>No player has a birthday today.</p>
          ) : (
            <div className="rg48-twrap">
              <table className="dep-table">
                <thead><tr><th>Player</th><th>Contact</th><th>Birthday</th><th>Paid this year</th></tr></thead>
                <tbody>
                  {loyalty.birthdaysToday.map((b) => (
                    <tr key={b.userId}>
                      <td>{b.userName}</td>
                      <td>{b.userContact ?? "—"}</td>
                      <td>{b.birthday}</td>
                      <td>{b.paidThisYear ? "Yes" : "No"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="pd-adjust-row ow-stack">
            <button className="btn btn-gold" type="button" disabled={bdayPayBusy || loyalty.settings.birthdayBonus <= 0} onClick={() => void payBirthdays()}>{bdayPayBusy ? "Paying…" : `Pay birthday bonuses for today (${fmtMoney(loyalty.settings.birthdayBonus, "GHS")} each)`}</button>
          </div>
          {loyalty.settings.birthdayBonus <= 0 && <p className="rg48-mini">The birthday bonus is GH₵ 0 — set an amount above to pay anything.</p>}
          {payResult && <p className="rg48-mini">Last run: paid {payResult.count} {payResult.count === 1 ? "player" : "players"} ({fmtSplit(payResult.totalsByCurrency, payResult.total)}){payResult.alreadyPaid > 0 ? ` · ${payResult.alreadyPaid} already paid this year, skipped` : ""}. A second run today pays nobody.</p>}
          <h4>Players (latest 10) — live points</h4>
          <div className="rg48-twrap">
            <table className="dep-table">
              <thead><tr><th>Player</th><th>Tier</th><th>Total staked</th><th>Points</th></tr></thead>
              <tbody>
                {loyalty.players.map((p) => (
                  <tr key={p.id}><td>{p.name}</td><td>{p.tier ?? "—"}</td><td>{fmtMoney(p.totalStaked, p.fiatCurrency ?? fiat)}</td><td>{p.points}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      </section>
    </div>
  );
}
