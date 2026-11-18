// Owner Promotions (Phase 2) — split out of the old one-page owner panel
// (src/app/owner/legacy/page.tsx). Same sections, same endpoints, same
// behaviour — now its own route, loading only its own data.
"use client";

import { useCallback, useEffect, useState } from "react";
import { api, fmtMoney } from "../../../../lib/api";
import { todayStr } from "../../../../lib/admin-client";
import { useStore } from "../../../../lib/store";
import { useOwner } from "../../../../components/owner/OwnerContext";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";

export default function OwnerPromotionsPage() {
  const { user, toast } = useStore();
  const { fiat } = useOwner();
  const { admins: ctxAdmins, loadAdmins } = useOwner();
  const admins = ctxAdmins ?? [];
  useEffect(() => { if (user) void loadAdmins(); }, [loadAdmins, user]);

  // Phase 1 country-based (Nov 2026): a run that pays players in
  // more than one fiat has no honest single total — show the per-fiat
  // split instead ("GH₵ 12.00 + ₦500.00").
  const fmtSplit = (totals: Record<string, number> | undefined, fallback: number) => {
    if (!totals || Object.keys(totals).length === 0) return fmtMoney(fallback, fiat);
    return Object.entries(totals).map(([c, v]) => fmtMoney(v, c)).join(" + ");
  };

  // P1 Batch 3 (O19): the promotion engine — the owner's campaigns.
  interface PromoRow { id: string; name: string; type: string; percent: number; cap: number | null; coinAmount: number | null; trigger: string | null; startAt: string; endAt: string | null; targetAdminId: string | null; targetAdminName: string | null; active: boolean; grants: number; createdAt: string }
  interface PromoGrantRow { id: string; promotionId: string; promotionName: string; userId: string; userName: string; amount: number; wallet: string; fiatCurrency: string; day: string; createdAt: string }
  const [promos, setPromos] = useState<PromoRow[] | null>(null);
  const [promoGrants, setPromoGrants] = useState<PromoGrantRow[] | null>(null);
  const loadPromos = useCallback(async () => {
    try {
      const r = await api<{ promotions: PromoRow[]; recentGrants: PromoGrantRow[] }>("/api/owner/promotions");
      setPromos(r.promotions);
      setPromoGrants(r.recentGrants);
    } catch { setPromos([]); setPromoGrants([]); }
  }, []);
  useEffect(() => { if (user) void loadPromos(); }, [loadPromos, user]);
  const [promoName, setPromoName] = useState("");
  const [promoType, setPromoType] = useState<"deposit_match" | "free_coins" | "cashback">("deposit_match");
  const [promoPercent, setPromoPercent] = useState(50);
  const [promoCap, setPromoCap] = useState("");
  const [promoCoins, setPromoCoins] = useState(25);
  const [promoTrigger, setPromoTrigger] = useState<"signup" | "first_deposit">("signup");
  const [promoStart, setPromoStart] = useState("");
  const [promoEnd, setPromoEnd] = useState("");
  const [promoTarget, setPromoTarget] = useState("");
  const [promoBusy, setPromoBusy] = useState(false);
  const [cbDate, setCbDate] = useState("");
  const [cbBusy, setCbBusy] = useState<string | null>(null);
  const [cbResult, setCbResult] = useState<{ promotionId: string; date: string; paid: number; total: number; totalsByCurrency: Record<string, number> } | null>(null);
  // Dates start empty and are set on mount (calling new Date() during
  // render breaks the prerender — the same rule as the other pickers).
  useEffect(() => { setPromoStart(todayStr()); setCbDate(todayStr()); }, []);

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
      await loadPromos();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not create promotion", "lose");
    } finally { setPromoBusy(false); }
  };
  const togglePromo = async (p: PromoRow) => {
    try {
      await api(`/api/owner/promotions/${p.id}/toggle`, { method: "POST", body: JSON.stringify({ active: !p.active }) });
      toast(p.active ? "Promotion paused — it grants nothing new" : "Promotion resumed", "win");
      await loadPromos();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not toggle promotion", "lose");
    }
  };
  const payCashbackFor = async (p: PromoRow) => {
    if (!cbDate) { toast("Pick a date to pay cashback for", "lose"); return; }
    setCbBusy(p.id);
    try {
      const r = await api<{ promotionId: string; date: string; paid: number; total: number; totalsByCurrency: Record<string, number> }>(`/api/owner/promotions/${p.id}/pay-cashback`, {
        method: "POST",
        body: JSON.stringify({ date: cbDate }),
      });
      setCbResult(r);
      toast(`Cashback paid — ${r.paid} ${r.paid === 1 ? "player" : "players"}, ${fmtSplit(r.totalsByCurrency, r.total)}`, "win");
      await loadPromos();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Cashback payment failed", "lose");
    } finally { setCbBusy(null); }
  };
  return (
    <div>
      <PageHeader title="Promotions" sub="Campaigns, grants and cashback." />
      <OwnerRangeBar />
      <section className="admin-sec">
      <h3>Promotions</h3>
      <form className="owner-add ow-form" onSubmit={createPromo}>
        <input type="text" placeholder="Promotion name" value={promoName} onChange={(e) => setPromoName(e.target.value)} required minLength={3} />
        <select value={promoType} onChange={(e) => setPromoType(e.target.value as "deposit_match" | "free_coins" | "cashback")} aria-label="Promotion type">
          <option value="deposit_match">Deposit match — % of a deposit</option>
          <option value="free_coins">Free coins — on signup / first deposit</option>
          <option value="cashback">Cashback — % of a day&apos;s net loss</option>
        </select>
        {promoType !== "free_coins" ? (
          <label>% <input type="number" min={0.5} max={100} step={0.5} value={promoPercent} onChange={(e) => setPromoPercent(Number(e.target.value))} /></label>
        ) : (
          <>
            <label>Coins <input type="number" min={1} step={1} value={promoCoins} onChange={(e) => setPromoCoins(Number(e.target.value))} /></label>
            <select value={promoTrigger} onChange={(e) => setPromoTrigger(e.target.value as "signup" | "first_deposit")} aria-label="When the coins land">
              <option value="signup">On signup</option>
              <option value="first_deposit">On first deposit</option>
            </select>
          </>
        )}
        <label>Cap GH₵ <input type="number" min={0} step={0.01} value={promoCap} onChange={(e) => setPromoCap(e.target.value)} placeholder="No cap" /></label>
        <label>From <input type="date" value={promoStart} max={todayStr()} onChange={(e) => setPromoStart(e.target.value)} /></label>
        <label>To <input type="date" value={promoEnd} onChange={(e) => setPromoEnd(e.target.value)} /></label>
        <select value={promoTarget} onChange={(e) => setPromoTarget(e.target.value)} aria-label="Target (blank = every player)">
          <option value="">Every player</option>
          {admins.map((a) => (
            <option key={a.id} value={a.id}>{a.name}&apos;s downline</option>
          ))}
        </select>
        <button className="btn btn-gold" type="submit" disabled={promoBusy}>{promoBusy ? "Creating…" : "Create promotion"}</button>
      </form>
      {promos === null ? <p>Loading promotions…</p> : promos.length === 0 ? <p>No promotions yet.</p> : (
        <div className="ow-games">
          {promos.map((p) => (
            <div key={p.id} className="ow-game-row">
              <div className="ow-game-head">
                <b>{p.name}</b>
                <span className="ow-game-cur">{p.type === "deposit_match" ? `Match ${p.percent}%` : p.type === "free_coins" ? `${p.coinAmount} coins` : `Cashback ${p.percent}%`}</span>
                {p.cap !== null && <span className="ow-game-mult">cap {fmtMoney(p.cap, fiat)}</span>}
                {!p.active && <span className="ow-game-flag">PAUSED</span>}
              </div>
              <p className="ow-game-note">
                {p.type === "free_coins" ? `On ${p.trigger === "first_deposit" ? "first deposit" : "signup"}` : p.type === "cashback" ? "Paid by hand, one day at a time" : "On every deposit, once per player"} · {p.startAt.slice(0, 10)} to {p.endAt ? p.endAt.slice(0, 10) : "open"} · {p.targetAdminName ? `${p.targetAdminName}'s downline` : "Every player"} · {p.grants} {p.grants === 1 ? "grant" : "grants"}
              </p>
              <div className="ow-game-toggles">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void togglePromo(p)}>{p.active ? "Pause" : "Resume"}</button>
                {p.type === "cashback" && (
                  <>
                    <label className="p1b3-cb">Pay for <input type="date" value={cbDate} max={todayStr()} onChange={(e) => setCbDate(e.target.value)} aria-label="Cashback date" /></label>
                    <button type="button" className="btn btn-gold btn-sm" disabled={cbBusy === p.id} onClick={() => void payCashbackFor(p)}>{cbBusy === p.id ? "Paying…" : "Pay cashback"}</button>
                  </>
                )}
              </div>
              {cbResult && cbResult.promotionId === p.id && (
                <p className="ow-day-cap">Paid {cbResult.paid} {cbResult.paid === 1 ? "player" : "players"} {fmtSplit(cbResult.totalsByCurrency, cbResult.total)} cashback for {cbResult.date}.</p>
              )}
            </div>
          ))}
        </div>
      )}
      {promoGrants && promoGrants.length > 0 && (
        <>
          <h4>Recent grants</h4>
          <div className="rg48-twrap">
            <table className="dep-table">
              <thead><tr><th>Promotion</th><th>Player</th><th>Amount</th><th>Day</th><th>Granted</th></tr></thead>
              <tbody>
                {promoGrants.map((g) => (
                  <tr key={g.id}>
                    <td>{g.promotionName}</td>
                    <td>{g.userName}</td>
                    <td>{g.wallet === "coins" ? `${Math.round(g.amount)} coins` : fmtMoney(g.amount, g.fiatCurrency ?? fiat)}</td>
                    <td>{g.day || "—"}</td>
                    <td>{new Date(g.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                  </tr>
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
