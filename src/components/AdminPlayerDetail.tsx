// Admin dashboard — Player detail (client part, round 11). One player as
// a real page: name, contact, balances, totals, full deposit history.
// Reached from the referred-users list and from day-detail rows. Same
// endpoint as the old user-detail overlay (/api/admin/users/[id]).
// The route wrapper (src/app/admin/players/[id]/page.tsx) is a server
// component that passes the id in — this file stays a client component
// because it reads ?preview= and the store.

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, fmtMoney } from "../lib/api";
import { COUNTRIES, symbolFor } from "../lib/country";
import { useStore } from "../lib/store";
import { useAdminContext, type UserDetail } from "../lib/admin-client";
import { canAccessSection } from "../lib/rbac";
import { AdminNav, AdminPreviewBanner, AdminLoginPrompt, AdminError, AdminDenied } from "./AdminNav";

export default function AdminPlayerDetail({ id }: { id: string }) {
  const { user } = useStore();
  const router = useRouter();
  const sp = useSearchParams();
  const previewId = sp.get("preview");
  const { ctx, err } = useAdminContext(previewId);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [detailErr, setDetailErr] = useState("");
  const { toast } = useStore();

  // P0 Batch 1 (A7/A8): balance adjustment + block/unblock for this player
  // (own downline only — the endpoints enforce it; hidden in preview).
  const [adjWallet, setAdjWallet] = useState<"cash" | "coins">("cash");
  const [adjDir, setAdjDir] = useState<"credit" | "debit">("credit");
  const [adjAmount, setAdjAmount] = useState("");
  const [adjReason, setAdjReason] = useState("");
  const [adjBusy, setAdjBusy] = useState(false);
  const [blockReason, setBlockReason] = useState("");
  const [blockBusy, setBlockBusy] = useState(false);

  // P1 Batch 1 (A17): bonus grant — a plain credit, no wagering rules.
  const [bonusWallet, setBonusWallet] = useState<"cash" | "coins">("cash");
  const [bonusAmount, setBonusAmount] = useState("");
  const [bonusReason, setBonusReason] = useState("");
  const [bonusExpires, setBonusExpires] = useState("");
  const [bonusBusy, setBonusBusy] = useState(false);
  // P1 Batch 1 (A19): admin-only notes + tags (the player never sees them).
  const [noteText, setNoteText] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [tagBusy, setTagBusy] = useState(false);
  // P1 Batch 1 (A20): per-player limits (max stake, daily deposit/loss,
  // cool-off). Prefilled from the limits in force when the detail loads.
  const [limitMaxStake, setLimitMaxStake] = useState("");
  const [limitMaxDeposit, setLimitMaxDeposit] = useState("");
  const [limitMaxLoss, setLimitMaxLoss] = useState("");
  const [limitCoolOff, setLimitCoolOff] = useState("");
  // P2 Batch 1 (A29): self-exclusion (until + reason) + the reality
  // check interval (0 = off).
  const [limitSelfExcl, setLimitSelfExcl] = useState("");
  const [limitSelfExclReason, setLimitSelfExclReason] = useState("");
  const [limitRealityCheck, setLimitRealityCheck] = useState("");
  const [limitBusy, setLimitBusy] = useState(false);
  const [limitsSeeded, setLimitsSeeded] = useState(false);
  // P1 Batch 2 (A23): send one in-app notification to this player.
  const [ntfTitle, setNtfTitle] = useState("");
  const [ntfBody, setNtfBody] = useState("");
  const [ntfBusy, setNtfBusy] = useState(false);
  useEffect(() => {
    if (detail && !limitsSeeded) {
      setLimitMaxStake(detail.limits?.maxStake != null ? String(detail.limits.maxStake) : "");
      setLimitMaxDeposit(detail.limits?.maxDepositPerDay != null ? String(detail.limits.maxDepositPerDay) : "");
      setLimitMaxLoss(detail.limits?.maxLossPerDay != null ? String(detail.limits.maxLossPerDay) : "");
      setLimitCoolOff(detail.limits?.coolOffUntil ? detail.limits.coolOffUntil.slice(0, 10) : "");
      // P2 Batch 1 (A29): self-exclusion + reality check.
      setLimitSelfExcl(detail.limits?.selfExcludedUntil ? detail.limits.selfExcludedUntil.slice(0, 10) : "");
      setLimitSelfExclReason(detail.limits?.selfExclusionReason ?? "");
      setLimitRealityCheck(detail.limits?.realityCheckMinutes ? String(detail.limits.realityCheckMinutes) : "");
      setLimitsSeeded(true);
    }
  }, [detail, limitsSeeded]);

  const loadDetail = useCallback(async () => {
    try {
      const d = await api<UserDetail>(`/api/admin/users/${id}`);
      setDetail(d);
      setDetailErr("");
    } catch (ex) {
      setDetailErr(ex instanceof Error ? ex.message : "Could not load this player.");
    }
  }, [id]);

  useEffect(() => { void loadDetail(); }, [loadDetail]);

  const submitAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(adjAmount);
    if (!Number.isFinite(amount) || amount <= 0) { toast("Enter an amount above 0", "lose"); return; }
    if (adjReason.trim().length < 3) { toast("A reason is required", "lose"); return; }
    setAdjBusy(true);
    try {
      const r = await api<{ balances: { cash: number; coins: number } }>(`/api/admin/users/${id}/adjust`, {
        method: "POST",
        body: JSON.stringify({ wallet: adjWallet, direction: adjDir, amount, reason: adjReason.trim() }),
      });
      toast(`${adjDir === "credit" ? "Credited" : "Debited"} ${adjWallet === "cash" ? fmtMoney(amount, detail?.user.currency ?? "GHS") : `${amount} coins`} — recorded in the ledger`, "win");
      setAdjAmount("");
      setAdjReason("");
      await loadDetail();
      void r;
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Adjustment failed", "lose");
    } finally { setAdjBusy(false); }
  };

  const submitBlock = async () => {
    const blocked = !detail?.user.blockedAt;
    if (blocked && blockReason.trim().length < 3) { toast("A reason is required to block", "lose"); return; }
    setBlockBusy(true);
    try {
      await api(`/api/admin/users/${id}/block`, {
        method: "POST",
        body: JSON.stringify({ blocked, ...(blocked ? { reason: blockReason.trim() } : {}) }),
      });
      toast(blocked ? "Player blocked — betting and deposits suspended" : "Player unblocked", blocked ? "lose" : "win");
      setBlockReason("");
      await loadDetail();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Block failed", "lose");
    } finally { setBlockBusy(false); }
  };

  // P1 Batch 1 (A17): grant a bonus — a plain credit, no wagering rules.
  const submitBonus = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(bonusAmount);
    if (!Number.isFinite(amount) || amount <= 0) { toast("Enter an amount above 0", "lose"); return; }
    if (bonusReason.trim().length < 3) { toast("A reason is required", "lose"); return; }
    setBonusBusy(true);
    try {
      await api(`/api/admin/users/${id}/bonus`, {
        method: "POST",
        body: JSON.stringify({ wallet: bonusWallet, amount, reason: bonusReason.trim(), ...(bonusExpires ? { expiresAt: bonusExpires } : {}) }),
      });
      toast(`Bonus granted — ${bonusWallet === "cash" ? fmtMoney(amount, detail?.user.currency ?? "GHS") : `${amount} coins`} credited`, "win");
      setBonusAmount("");
      setBonusReason("");
      setBonusExpires("");
      await loadDetail();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Bonus failed", "lose");
    } finally { setBonusBusy(false); }
  };

  // P1 Batch 1 (A19): add a note (admin-only).
  const submitNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (noteText.trim().length < 2) { toast("Write the note first", "lose"); return; }
    setNoteBusy(true);
    try {
      await api(`/api/admin/users/${id}/notes`, { method: "POST", body: JSON.stringify({ text: noteText.trim() }) });
      toast("Note added", "win");
      setNoteText("");
      await loadDetail();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Note failed", "lose");
    } finally { setNoteBusy(false); }
  };

  // P1 Batch 1 (A19): add / remove a tag (admin-only).
  const submitTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (tagInput.trim().length < 2) { toast("Type a tag first", "lose"); return; }
    setTagBusy(true);
    try {
      await api(`/api/admin/users/${id}/tags`, { method: "POST", body: JSON.stringify({ tag: tagInput.trim() }) });
      setTagInput("");
      await loadDetail();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Tag failed", "lose");
    } finally { setTagBusy(false); }
  };

  const removeTag = async (tag: string) => {
    setTagBusy(true);
    try {
      await api(`/api/admin/users/${id}/tags?tag=${encodeURIComponent(tag)}`, { method: "DELETE" });
      await loadDetail();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Tag failed", "lose");
    } finally { setTagBusy(false); }
  };

  // P1 Batch 1 (A20): save the per-player limits (empty = no limit).
  // P2 Batch 1 (A29): self-exclusion + reality check ride the same save.
  const submitLimits = async (e: React.FormEvent) => {
    e.preventDefault();
    setLimitBusy(true);
    try {
      await api(`/api/admin/users/${id}/limits`, {
        method: "POST",
        body: JSON.stringify({
          maxStake: limitMaxStake.trim() === "" ? null : Number(limitMaxStake),
          maxDepositPerDay: limitMaxDeposit.trim() === "" ? null : Number(limitMaxDeposit),
          maxLossPerDay: limitMaxLoss.trim() === "" ? null : Number(limitMaxLoss),
          coolOffUntil: limitCoolOff || null,
          selfExcludedUntil: limitSelfExcl || null,
          selfExclusionReason: limitSelfExclReason.trim() || null,
          realityCheckMinutes: limitRealityCheck.trim() === "" ? 0 : Number(limitRealityCheck),
        }),
      });
      toast("Limits saved — enforced from the next bet or deposit", "win");
      await loadDetail();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Limits failed", "lose");
    } finally { setLimitBusy(false); }
  };

  // P1 Batch 2 (A23): send one in-app notification to this player
  // (own downline only — the endpoint enforces it).
  const submitNotify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (ntfTitle.trim().length < 2 || ntfBody.trim().length < 2) { toast("Write a title and a message first", "lose"); return; }
    setNtfBusy(true);
    try {
      await api(`/api/admin/users/${id}/notify`, {
        method: "POST",
        body: JSON.stringify({ title: ntfTitle.trim(), body: ntfBody.trim() }),
      });
      toast("Notification sent — it shows on the player's account page", "win");
      setNtfTitle("");
      setNtfBody("");
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Notification failed", "lose");
    } finally { setNtfBusy(false); }
  };

  if (!user) return <AdminLoginPrompt />;
  // P0 Batch 4 (A3): the owner may open a player directly (no preview)
  // from the global player search — there is no admin context to load
  // then, and that is fine (the header is the player's own name).
  if (err && !(user.role === "owner" && !previewId)) return <AdminError err={err} />;
  // P0 Batch 3 (O3): the server 403s this section too.
  if (!previewId && ctx && !canAccessSection(user, "players")) return <AdminDenied section="players" />;

  const back = (
    <button className="gp-back" type="button" onClick={() => router.back()} aria-label="Back"><span className="gp-back-coin">←</span></button>
  );

  if (!detail) {
    return (
      <>
        <div className="rg48-hbar-in">{back}<h2>Player</h2></div>
        {detailErr ? <p className="rg48-err">{detailErr}</p> : <p>Loading player…</p>}
      </>
    );
  }

  const u = detail.user;
  // Phase 1 country-based (Nov 2026): this player's fiat — every
  // cash figure on this page is in it unless a row carries its own.
  const fiat = u.currency ?? "GHS";
  const countryName = COUNTRIES.find((c) => c.code === (u.country ?? "GH"))?.name ?? (u.country ?? "GH");
  // P1 Batch 4 (O24): a parent admin viewing a player in a child
  // admin's downline is READ-ONLY — the action sections below hide.
  const canAct = !previewId && user.role === "admin" && !detail.readOnly;
  // P2 Batch 1 (A29): self-exclusion is live right now (the date is
  // in the future) — badge + note, like the blocked state.
  const selfExcludedNow = !!detail.limits?.selfExcludedUntil && new Date(detail.limits.selfExcludedUntil).getTime() > Date.now();
  const card = (label: string, value: string) => (
    <div className="sum-card"><span>{label}</span><b>{value}</b></div>
  );

  return (
    <>
      {previewId && ctx ? <AdminPreviewBanner name={ctx.admin.name} /> : null}
      <div className="rg48-hbar-in">{back}<h2>{u.name}</h2>{u.blockedAt ? <span className="pd-blocked-badge">BLOCKED</span> : null}{selfExcludedNow ? <span className="pd-blocked-badge">SELF-EXCLUDED</span> : null}</div>
      <p className="rg48-sub">{u.email || u.phone || "—"} · Joined {new Date(u.joinedAt).toLocaleDateString("en-GB")}</p>
      {detail.readOnly ? <p className="rg48-mini">Read-only — this player is in {u.referringAdmin?.name ?? "a child admin"}&apos;s downline. Adjustments, blocks, bonuses, notes, tags and limits are managed by their own admin.</p> : null}
      {u.blockedAt ? <p className="pd-blocked-note">Blocked {new Date(u.blockedAt).toLocaleDateString("en-GB")} — {u.blockedReason || "no reason recorded"}. Betting and deposits are suspended.</p> : null}
      {selfExcludedNow ? <p className="pd-blocked-note">Self-excluded until {new Date(detail.limits!.selfExcludedUntil!).toLocaleDateString("en-GB")}{detail.limits?.selfExclusionReason ? ` — ${detail.limits.selfExclusionReason}` : ""}. They cannot deposit, play or settle until then.</p> : null}
      <div className="pd-meta">
        <span className="pd-meta-item"><span className="pd-meta-label">Country</span><b>{countryName}</b></span>
        <span className="pd-meta-item"><span className="pd-meta-label">Currency</span><b>{fiat} ({symbolFor(fiat)})</b></span>
        <span className="pd-meta-item"><span className="pd-meta-label">Code used</span>{u.referralCodeUsed ? <b className="code-chip sm">{u.referralCodeUsed}</b> : <b>—</b>}</span>
        <span className="pd-meta-item"><span className="pd-meta-label">Referring admin</span><b>{u.referringAdmin?.name || "—"}</b></span>
        <span className="pd-meta-item"><span className="pd-meta-label">KYC</span><b>{detail.kycStatus === "not_submitted" ? "Not submitted" : detail.kycStatus === "pending" ? "Pending review" : detail.kycStatus === "approved" ? "Approved" : "Rejected"}</b></span>
      </div>
      {/* P1 Batch 2 (A21): the real KYC status — document type, submitted
          date and the rejection reason when one was given. */}
      {detail.kycDocumentType ? (
        <p className="rg48-sub">
          KYC: {detail.kycDocumentType === "national_id" ? "National ID" : detail.kycDocumentType === "passport" ? "Passport" : "Driver's licence"}
          {detail.kycSubmittedAt ? ` · submitted ${new Date(detail.kycSubmittedAt).toLocaleDateString("en-GB")}` : ""}
          {detail.kycStatus === "rejected" && detail.kycRejectionReason ? ` · Rejected: ${detail.kycRejectionReason}` : ""}
          {detail.kycDocumentUrl ? <> · <a href={detail.kycDocumentUrl} target="_blank" rel="noreferrer">View document ↗</a></> : null}
        </p>
      ) : null}
      <AdminNav />
      <section className="admin-sec">
        <h3>Balances</h3>
        <div className="sum-cards">
          {card("Cash", fmtMoney(u.cash, fiat))}
          {card("Coins", String(u.coins))}
          {card("Role", u.role)}
        </div>
      </section>
      <section className="admin-sec">
        <h3>Totals</h3>
        <div className="sum-cards">
          {card("Deposits", String(detail.totals.deposits))}
          {card("Deposited", fmtMoney(detail.totals.totalDeposited, fiat))}
          {card("Commission", fmtMoney(detail.totals.totalCommission, fiat))}
          {card("Coins given", String(detail.totals.coinsGiven))}
        </div>
      </section>
      {/* P0 Batch 4 (A3): player 360 — commission earned on this player
          (recomputed by the rules engine; the Commission page is the
          source of truth), their bet/round history, and their tickets.
          The Totals "Commission" tile above stays the stamped sum. */}
      <section className="admin-sec">
        <h3>Commission earned</h3>
        <div className="sum-cards">
          {card("Earned on this player", fmtMoney(detail.commission.total, detail.commission.fiatCurrency ?? fiat))}
        </div>
        <p className="rg48-sub">
          {detail.commission.model === "revshare"
            ? `RevShare ${detail.commission.rate}% — % of this player’s net loss (stakes − payouts), recomputed from the ledger.`
            : detail.commission.model === "turnover"
              ? `Turnover ${detail.commission.rate}% — % of this player’s stakes, recomputed from the ledger.`
              : detail.commission.model === "legacy"
                ? "Legacy — flat % of deposits, as stamped on each deposit."
                : detail.commission.model === "mixed"
                  ? "Mixed — the rule changed over time; the total adds each day’s rule."
                  : "No activity yet — nothing earned on this player."}
          {" "}The Commission page is the source of truth.
        </p>
      </section>
      {/* P2 Batch 1 (A26): VIP — the tier this player has reached from
          their total deposited, with progress to the next tier and its
          perks. A label + perks only: VIP changes no economy, limits
          or payouts. The owner edits the tiers; the admin only sees them. */}
      <section className="admin-sec">
        <h3>VIP</h3>
        {detail.vip.tier ? (
          <>
            <div className="sum-cards">
              {card("Tier", detail.vip.tier.name)}
              {card("Deposited", fmtMoney(detail.vip.totalDeposited, fiat))}
              {card("Next tier", detail.vip.nextTier ? `${detail.vip.nextTier.name} · ${fmtMoney(detail.vip.nextTier.minDeposited, fiat)}` : "Top tier")}
            </div>
            {detail.vip.nextTier ? (
              <p className="rg48-sub">
                {detail.vip.progressPct}% of the way to {detail.vip.nextTier.name} — {fmtMoney(detail.vip.toNext, fiat)} more to deposit.
              </p>
            ) : (
              <p className="rg48-sub">Top tier — nothing above this one.</p>
            )}
            {detail.vip.tier.perks.length > 0 ? (
              <p className="rg48-sub">Perks: {detail.vip.tier.perks.join(", ")}.</p>
            ) : null}
          </>
        ) : (
          <p>No VIP tier yet — tiers start at GH₵ 0, so this player will have one once the owner saves the tiers.</p>
        )}
        <p className="rg48-mini">VIP is a label and perks only — it changes no economy, limits or payouts. The owner edits the tiers on the Owner panel.</p>
      </section>
      <section className="admin-sec">
        <h3>Bet history ({detail.rounds.length})</h3>
        {detail.rounds.length === 0 ? <p>No rounds yet.</p> : (
          <div className="rg48-twrap">
            <table className="dep-table">
              <thead><tr><th>Game</th><th>Stake</th><th>Payout</th><th>Net</th><th>Date</th></tr></thead>
              <tbody>
                {detail.rounds.map((r) => (
                  <tr key={r.id}>
                    <td>{r.gameName}</td>
                    <td>{r.currency === "coins" ? `${r.stake} coins` : fmtMoney(r.stake, r.fiatCurrency ?? fiat)}</td>
                    <td>{r.currency === "coins" ? `${r.payout} coins` : fmtMoney(r.payout, r.fiatCurrency ?? fiat)}</td>
                    <td className={r.net > 0 ? "ok" : r.net < 0 ? "bad" : ""}>{r.currency === "coins" ? `${r.net > 0 ? "+" : ""}${r.net} coins` : r.net > 0 ? `+${fmtMoney(r.net, r.fiatCurrency ?? fiat)}` : fmtMoney(r.net, r.fiatCurrency ?? fiat)}</td>
                    <td>{new Date(r.createdAt).toLocaleDateString("en-GB")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="admin-sec">
        <h3>Support tickets ({detail.tickets.length})</h3>
        {detail.tickets.length === 0 ? (
          <p>No tickets from this player.</p>
        ) : (
          <div className="b4-tk-list">
            {detail.tickets.map((t) => (
              <div key={t.id} className="b4-tk-row">
                <b>{t.subject}</b>
                <span className={`tk-status tk-${t.status}`}>{t.status}</span>
                <span>{new Date(t.createdAt).toLocaleDateString("en-GB")}</span>
              </div>
            ))}
          </div>
        )}
        <p className="rg48-sub"><Link href={previewId ? `/admin/tickets?preview=${previewId}` : "/admin/tickets"}>Open the ticket inbox →</Link></p>
      </section>
      {canAct && (
        <>
          <section className="admin-sec">
            <h3>Balance adjustment</h3>
            <p className="rg48-sub">Credit or debit this player’s cash or coins. A reason is required — the adjustment is written to the ledger and the audit log.</p>
            <form className="pd-adjust" onSubmit={submitAdjust}>
              <div className="pd-adjust-row">
                <label>Wallet
                  <select value={adjWallet} onChange={(e) => setAdjWallet(e.target.value as "cash" | "coins")} aria-label="Wallet">
                    <option value="cash">Cash (GH₵)</option>
                    <option value="coins">Coins</option>
                  </select>
                </label>
                <label>Direction
                  <select value={adjDir} onChange={(e) => setAdjDir(e.target.value as "credit" | "debit")} aria-label="Direction">
                    <option value="credit">Credit</option>
                    <option value="debit">Debit</option>
                  </select>
                </label>
                <label>Amount
                  <input type="number" min={0} step={adjWallet === "cash" ? "0.01" : "1"} inputMode="decimal" placeholder={adjWallet === "cash" ? "0.00" : "0"} value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)} aria-label="Amount" required />
                </label>
              </div>
              <label className="pd-adjust-reason">Reason (required)
                <input type="text" placeholder="Why is this balance changing?" value={adjReason} onChange={(e) => setAdjReason(e.target.value)} aria-label="Reason" required minLength={3} />
              </label>
              <button className="btn btn-gold" type="submit" disabled={adjBusy}>{adjBusy ? "Saving…" : `${adjDir === "credit" ? "Credit" : "Debit"} ${adjWallet === "cash" ? "cash" : "coins"}`}</button>
            </form>
          </section>
          <section className="admin-sec">
            <h3>Block / Unblock</h3>
            <p className="rg48-sub">{u.blockedAt ? "This player is blocked — they cannot place bets or deposit." : "Blocking suspends this player’s betting and deposits immediately."}</p>
            {u.blockedAt ? null : (
              <label className="pd-adjust-reason">Reason (required to block)
                <input type="text" placeholder="Why is this player being blocked?" value={blockReason} onChange={(e) => setBlockReason(e.target.value)} aria-label="Block reason" />
              </label>
            )}
            <button className={`btn ${u.blockedAt ? "btn-gold" : "btn-ghost"}`} type="button" disabled={blockBusy} onClick={() => void submitBlock()}>
              {blockBusy ? "Saving…" : u.blockedAt ? "Unblock player" : "Block player"}
            </button>
          </section>
          {/* P1 Batch 1 (A17): bonus grant — a plain credit, written to the
              ledger and audit log as "bonus.grant" so it never reads as a
              manual adjustment. No wagering requirements (that is the
              P1 bonus engine, O19, a later batch). An expiry is recorded
              only — it is not auto-enforced. */}
          <section className="admin-sec">
            <h3>Bonus grant</h3>
            <p className="rg48-sub">Grant a bonus — cash or coins, credited at once. A reason is required; an expiry date is recorded only and is not auto-enforced.</p>
            <form className="pd-adjust" onSubmit={submitBonus}>
              <div className="pd-adjust-row">
                <label>Wallet
                  <select value={bonusWallet} onChange={(e) => setBonusWallet(e.target.value as "cash" | "coins")} aria-label="Bonus wallet">
                    <option value="cash">Cash (GH₵)</option>
                    <option value="coins">Coins</option>
                  </select>
                </label>
                <label>Amount
                  <input type="number" min={0} step={bonusWallet === "cash" ? "0.01" : "1"} inputMode="decimal" placeholder={bonusWallet === "cash" ? "0.00" : "0"} value={bonusAmount} onChange={(e) => setBonusAmount(e.target.value)} aria-label="Bonus amount" required />
                </label>
                <label>Expiry (optional)
                  <input type="date" value={bonusExpires} onChange={(e) => setBonusExpires(e.target.value)} aria-label="Bonus expiry" />
                </label>
              </div>
              <label className="pd-adjust-reason">Reason (required)
                <input type="text" placeholder="Why is this bonus being granted?" value={bonusReason} onChange={(e) => setBonusReason(e.target.value)} aria-label="Bonus reason" required minLength={3} />
              </label>
              <button className="btn btn-gold" type="submit" disabled={bonusBusy}>{bonusBusy ? "Granting…" : "Grant bonus"}</button>
            </form>
          </section>
        </>
      )}
      {/* P1 Batch 1 (A19): admin-only notes + tags — the player never sees
          these. The lists show for the owner too; the add/remove forms
          are admin-only (hidden in preview). */}
      <section className="admin-sec">
        <h3>Notes ({detail.notes.length})</h3>
        {detail.notes.length === 0 ? (
          <p>No notes on this player yet.</p>
        ) : (
          <div className="pd-notes">
            {detail.notes.map((n) => (
              <div key={n.id} className="pd-note">
                <p>{n.text}</p>
                <span>{n.authorName} · {new Date(n.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            ))}
          </div>
        )}
        {canAct ? (
          <form className="pd-note-form" onSubmit={submitNote}>
            <textarea placeholder="Add a note — only admins see this" value={noteText} onChange={(e) => setNoteText(e.target.value)} aria-label="Note" rows={2} maxLength={1000} />
            <button className="btn btn-gold" type="submit" disabled={noteBusy}>{noteBusy ? "Adding…" : "Add note"}</button>
          </form>
        ) : null}
      </section>
      {/* P1 Batch 2 (A23): send one in-app notification to this player.
          The form is admin-only; the player sees it on their account
          page. A broadcast to all players lives on the Overview page. */}
      {canAct ? (
        <section className="admin-sec">
          <h3>Send notification</h3>
          <p className="rg48-sub">Send a message to this player — it shows on their account page. In-app only, no email or SMS.</p>
          <form className="pd-note-form" onSubmit={submitNotify}>
            <input type="text" placeholder="Title — e.g. Your withdrawal is approved" value={ntfTitle} onChange={(e) => setNtfTitle(e.target.value)} aria-label="Notification title" maxLength={120} />
            <textarea placeholder="Message…" value={ntfBody} onChange={(e) => setNtfBody(e.target.value)} aria-label="Notification message" rows={2} maxLength={2000} />
            <button className="btn btn-gold" type="submit" disabled={ntfBusy}>{ntfBusy ? "Sending…" : "Send notification"}</button>
          </form>
        </section>
      ) : null}
      <section className="admin-sec">
        <h3>Tags</h3>
        {detail.tags.length === 0 ? (
          <p>No tags on this player yet.</p>
        ) : (
          <div className="pd-tags">
            {detail.tags.map((t) => (
              <span key={t} className="tag-pill">{t}
                {canAct ? <button type="button" className="tag-x" onClick={() => void removeTag(t)} aria-label={`Remove tag ${t}`}>×</button> : null}
              </span>
            ))}
          </div>
        )}
        {canAct ? (
          <form className="pd-tag-form" onSubmit={submitTag}>
            <input type="text" placeholder="Add a tag — e.g. VIP, fraud watch" value={tagInput} onChange={(e) => setTagInput(e.target.value)} aria-label="Tag" maxLength={30} />
            <button className="btn btn-gold" type="submit" disabled={tagBusy}>{tagBusy ? "Adding…" : "Add tag"}</button>
          </form>
        ) : null}
      </section>
      {/* P1 Batch 1 (A20): per-player limits. The form is admin-only; the
          limits in force show for the owner too. Empty = no limit.
          P2 Batch 1 (A29): self-exclusion (a hard stop until the date)
          + the reality check interval ride the same save. */}
      <section className="admin-sec">
        <h3>Limits</h3>
        <p className="rg48-sub">Per-player limits, enforced server-side on top of the per-game economics. A cool-off blocks play entirely until the date. Self-exclusion is stronger — no deposit, play or settle until the date.</p>
        {canAct ? (
          <form className="pd-adjust" onSubmit={submitLimits}>
            <div className="pd-adjust-row">
              <label>Max stake per bet (GH₵)
                <input type="number" min={0} step="0.01" inputMode="decimal" placeholder="No limit" value={limitMaxStake} onChange={(e) => setLimitMaxStake(e.target.value)} aria-label="Max stake per bet" />
              </label>
              <label>Max deposit per day (GH₵)
                <input type="number" min={0} step="0.01" inputMode="decimal" placeholder="No limit" value={limitMaxDeposit} onChange={(e) => setLimitMaxDeposit(e.target.value)} aria-label="Max deposit per day" />
              </label>
              <label>Max loss per day (GH₵)
                <input type="number" min={0} step="0.01" inputMode="decimal" placeholder="No limit" value={limitMaxLoss} onChange={(e) => setLimitMaxLoss(e.target.value)} aria-label="Max loss per day" />
              </label>
              <label>Cool-off until
                <input type="date" value={limitCoolOff} onChange={(e) => setLimitCoolOff(e.target.value)} aria-label="Cool-off until" />
              </label>
            </div>
            <div className="pd-adjust-row">
              <label>Self-excluded until
                <input type="date" value={limitSelfExcl} onChange={(e) => setLimitSelfExcl(e.target.value)} aria-label="Self-excluded until" />
              </label>
              <label>Self-exclusion reason
                <input type="text" placeholder="Why — required when excluding" value={limitSelfExclReason} onChange={(e) => setLimitSelfExclReason(e.target.value)} aria-label="Self-exclusion reason" />
              </label>
              <label>Reality check every (minutes, 0 = off)
                <input type="number" min={0} max={480} step="1" inputMode="numeric" placeholder="0" value={limitRealityCheck} onChange={(e) => setLimitRealityCheck(e.target.value)} aria-label="Reality check minutes" />
              </label>
            </div>
            <p className="rg48-mini">Self-exclusion blocks deposits, play and settling until the date. The reality check shows the player a session summary in the game room every N minutes (0 = off).</p>
            <button className="btn btn-gold" type="submit" disabled={limitBusy}>{limitBusy ? "Saving…" : "Save limits"}</button>
          </form>
        ) : (
          <div className="sum-cards">
            {card("Max stake", detail.limits?.maxStake != null ? fmtMoney(detail.limits.maxStake, fiat) : "No limit")}
            {card("Max deposit / day", detail.limits?.maxDepositPerDay != null ? fmtMoney(detail.limits.maxDepositPerDay, fiat) : "No limit")}
            {card("Max loss / day", detail.limits?.maxLossPerDay != null ? fmtMoney(detail.limits.maxLossPerDay, fiat) : "No limit")}
            {card("Cool-off", detail.limits?.coolOffUntil ? `Until ${new Date(detail.limits.coolOffUntil).toLocaleDateString("en-GB")}` : "None")}
            {card("Self-excluded", selfExcludedNow ? `Until ${new Date(detail.limits!.selfExcludedUntil!).toLocaleDateString("en-GB")}` : "No")}
            {card("Reality check", detail.limits?.realityCheckMinutes ? `Every ${detail.limits.realityCheckMinutes} min` : "Off")}
          </div>
        )}
      </section>
      <section className="admin-sec">
        <h3>Full deposit history</h3>
        {detail.deposits.length === 0 ? <p>No deposits yet.</p> : (
          <div className="rg48-twrap">
            <table className="dep-table">
              <thead><tr><th>Amount</th><th>Method</th><th>%</th><th>Commission</th><th>Date</th></tr></thead>
              <tbody>
                {detail.deposits.map((d) => (
                  <tr key={d.id}><td>{fmtMoney(d.amount, d.fiatCurrency ?? fiat)}</td><td>{d.method}</td><td>{d.pctInForce}%</td><td>{fmtMoney(d.commission, d.fiatCurrency ?? fiat)}</td><td>{new Date(d.createdAt).toLocaleDateString("en-GB")}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
