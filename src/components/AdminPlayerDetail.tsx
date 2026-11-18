// Admin dashboard — Player detail (Phase 5 restyle). One player as
// route-based tabs (Chuks's tab rule: each tab is its OWN route —
// /admin/players/[id], /money, /games, /kyc, /activity — deep-linkable,
// Back works). The route wrapper passes the tab in; this component
// loads the same detail endpoint as before (/api/admin/users/[id]) and
// renders only that tab's sections. All actions keep their endpoints,
// reasons and audit writes; money-moving actions (adjustment, bonus,
// block) now go through the shared ConfirmDialog. Masked contact with
// audited Reveal; the KYC document renders in the viewer on the KYC tab.
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, fmtMoney } from "../lib/api";
import { COUNTRIES, symbolFor } from "../lib/country";
import { useStore } from "../lib/store";
import { useStaffFetch } from "../components/staff-ui/useStaffFetch";
import { PageHeader } from "../components/staff-ui/PageHeader";
import { Card, KpiTile } from "../components/staff-ui/Card";
import { DataTable, type DataColumn } from "../components/staff-ui/DataTable";
import { Button } from "../components/staff-ui/Button";
import { Input, Select, FormField } from "../components/staff-ui/Form";
import { ConfirmDialog } from "../components/staff-ui/Dialog";
import { Skeleton, EmptyState, ErrorState } from "../components/staff-ui/Feedback";
import { Tabs } from "../components/staff-ui/Tabs";
import { fmtStaffMoney } from "../components/staff-ui/format";
import { AdminContactValue } from "../components/admin/AdminReveal";
import { KycDocumentViewer } from "../components/admin/KycDocumentViewer";
import { canAccessSection } from "../lib/rbac";
import type { UserDetail } from "../lib/admin-client";

export type DetailTab = "overview" | "money" | "games" | "kyc" | "activity";

const KYC_LABEL: Record<string, string> = {
  not_submitted: "Not submitted",
  pending: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
};

export default function AdminPlayerDetail({ id, tab }: { id: string; tab: DetailTab }) {
  const { user, toast } = useStore();
  const router = useRouter();
  const sp = useSearchParams();
  const previewId = sp.get("preview");
  const { data: detail, err: detailErr, loading, reload } = useStaffFetch<UserDetail>(`/api/admin/users/${id}`);

  // P0 Batch 1 (A7/A8): balance adjustment + block/unblock (own downline
  // only — the endpoints enforce it; hidden in preview).
  const [adjWallet, setAdjWallet] = useState<"cash" | "coins">("cash");
  const [adjDir, setAdjDir] = useState<"credit" | "debit">("credit");
  const [adjAmount, setAdjAmount] = useState("");
  const [adjReason, setAdjReason] = useState("");
  const [adjBusy, setAdjBusy] = useState(false);
  const [adjConfirm, setAdjConfirm] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const [blockConfirm, setBlockConfirm] = useState<"block" | "unblock" | null>(null);

  // P1 Batch 1 (A17): bonus grant — a plain credit, no wagering rules.
  const [bonusWallet, setBonusWallet] = useState<"cash" | "coins">("cash");
  const [bonusAmount, setBonusAmount] = useState("");
  const [bonusReason, setBonusReason] = useState("");
  const [bonusExpires, setBonusExpires] = useState("");
  const [bonusBusy, setBonusBusy] = useState(false);
  const [bonusConfirm, setBonusConfirm] = useState(false);
  // P1 Batch 1 (A19): admin-only notes + tags (the player never sees them).
  const [noteText, setNoteText] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [tagBusy, setTagBusy] = useState(false);
  // P1 Batch 1 (A20): per-player limits (max stake, daily deposit/loss,
  // cool-off). P2 Batch 1 (A29): self-exclusion + reality check.
  const [limitMaxStake, setLimitMaxStake] = useState("");
  const [limitMaxDeposit, setLimitMaxDeposit] = useState("");
  const [limitMaxLoss, setLimitMaxLoss] = useState("");
  const [limitCoolOff, setLimitCoolOff] = useState("");
  const [limitSelfExcl, setLimitSelfExcl] = useState("");
  const [limitSelfExclReason, setLimitSelfExclReason] = useState("");
  const [limitRealityCheck, setLimitRealityCheck] = useState("");
  const [limitBusy, setLimitBusy] = useState(false);
  const [limitsSeeded, setLimitsSeeded] = useState(false);
  // P1 Batch 2 (A23): send one in-app notification to this player.
  const [ntfTitle, setNtfTitle] = useState("");
  const [ntfBody, setNtfBody] = useState("");
  const [ntfBusy, setNtfBusy] = useState(false);
  // "Now", captured once after mount for the self-exclusion check
  // below. Date.now() may not be called during render
  // (react-hooks/purity), so the timeout callback owns the setState —
  // the accepted shape, same as the owner palette debounce. Until it
  // fires, nowMs is 0 and any set exclusion reads as active for one
  // tick; an expired exclusion corrects itself immediately after.
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => {
    const t = window.setTimeout(() => setNowMs(Date.now()), 0);
    return () => window.clearTimeout(t);
  }, []);

  // Seed the limits form from the loaded detail — render-phase
  // adjustment (the supported pattern; never in an effect), once per
  // mount. The admin's edits survive later reloads.
  if (detail && !limitsSeeded) {
    setLimitsSeeded(true);
    setLimitMaxStake(detail.limits?.maxStake != null ? String(detail.limits.maxStake) : "");
    setLimitMaxDeposit(detail.limits?.maxDepositPerDay != null ? String(detail.limits.maxDepositPerDay) : "");
    setLimitMaxLoss(detail.limits?.maxLossPerDay != null ? String(detail.limits.maxLossPerDay) : "");
    setLimitCoolOff(detail.limits?.coolOffUntil ? detail.limits.coolOffUntil.slice(0, 10) : "");
    setLimitSelfExcl(detail.limits?.selfExcludedUntil ? detail.limits.selfExcludedUntil.slice(0, 10) : "");
    setLimitSelfExclReason(detail.limits?.selfExclusionReason ?? "");
    setLimitRealityCheck(detail.limits?.realityCheckMinutes ? String(detail.limits.realityCheckMinutes) : "");
  }

  // The shell shows the login prompt when signed out and the
  // not-an-admin state for players — pages render nothing until then.
  if (!user) return null;
  if (!previewId && !canAccessSection(user, "players")) {
    return (
      <ErrorState
        title="No access to this section."
        text="You do not have access to the Players section. Ask the owner to grant you access from the Owner panel."
      />
    );
  }
  if (detailErr) return <ErrorState text={detailErr} onRetry={reload} />;
  if (loading || !detail) return <Skeleton lines={6} title />;

  const u = detail.user;
  const fiat = u.currency ?? "GHS";
  const countryName = COUNTRIES.find((c) => c.code === (u.country ?? "GH"))?.name ?? (u.country ?? "GH");
  // P1 Batch 4 (O24): a parent admin viewing a player in a child
  // admin's downline is READ-ONLY — the action sections hide.
  const canAct = !previewId && user.role === "admin" && !detail.readOnly;
  const selfExcludedNow = !!detail.limits?.selfExcludedUntil && new Date(detail.limits.selfExcludedUntil).getTime() > nowMs;
  const href = (p: string) => (previewId ? `${p}?preview=${previewId}` : p);
  const base = `/admin/players/${id}`;
  const tabItems = [
    { id: "overview", label: "Overview", href: href(base), exact: true },
    { id: "money", label: "Money", href: href(`${base}/money`) },
    { id: "games", label: "Games", href: href(`${base}/games`) },
    { id: "kyc", label: "KYC", href: href(`${base}/kyc`) },
    { id: "activity", label: "Activity", href: href(`${base}/activity`) },
  ];

  const submitAdjust = async () => {
    const amount = Number(adjAmount);
    setAdjBusy(true);
    try {
      await api<{ balances: { cash: number; coins: number } }>(`/api/admin/users/${id}/adjust`, {
        method: "POST",
        body: JSON.stringify({ wallet: adjWallet, direction: adjDir, amount, reason: adjReason.trim() }),
      });
      toast(`${adjDir === "credit" ? "Credited" : "Debited"} ${adjWallet === "cash" ? fmtMoney(amount, fiat) : `${amount} coins`} — recorded in the ledger`, "win");
      setAdjAmount("");
      setAdjReason("");
      setAdjConfirm(false);
      reload();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Adjustment failed", "lose");
    } finally {
      setAdjBusy(false);
    }
  };

  const submitBlock = async (reason: string) => {
    const blocked = !detail?.user.blockedAt;
    setBlockBusy(true);
    try {
      await api(`/api/admin/users/${id}/block`, {
        method: "POST",
        body: JSON.stringify({ blocked, ...(blocked ? { reason: reason.trim() } : {}) }),
      });
      toast(blocked ? "Player blocked — betting and deposits suspended" : "Player unblocked", blocked ? "lose" : "win");
      setBlockConfirm(null);
      reload();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Block failed", "lose");
    } finally {
      setBlockBusy(false);
    }
  };

  const submitBonus = async () => {
    const amount = Number(bonusAmount);
    setBonusBusy(true);
    try {
      await api(`/api/admin/users/${id}/bonus`, {
        method: "POST",
        body: JSON.stringify({ wallet: bonusWallet, amount, reason: bonusReason.trim(), ...(bonusExpires ? { expiresAt: bonusExpires } : {}) }),
      });
      toast(`Bonus granted — ${bonusWallet === "cash" ? fmtMoney(amount, fiat) : `${amount} coins`} credited`, "win");
      setBonusAmount("");
      setBonusReason("");
      setBonusExpires("");
      setBonusConfirm(false);
      reload();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Bonus failed", "lose");
    } finally {
      setBonusBusy(false);
    }
  };

  const submitNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (noteText.trim().length < 2) { toast("Write the note first", "lose"); return; }
    setNoteBusy(true);
    try {
      await api(`/api/admin/users/${id}/notes`, { method: "POST", body: JSON.stringify({ text: noteText.trim() }) });
      toast("Note added", "win");
      setNoteText("");
      reload();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Note failed", "lose");
    } finally {
      setNoteBusy(false);
    }
  };

  const submitTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (tagInput.trim().length < 2) { toast("Type a tag first", "lose"); return; }
    setTagBusy(true);
    try {
      await api(`/api/admin/users/${id}/tags`, { method: "POST", body: JSON.stringify({ tag: tagInput.trim() }) });
      setTagInput("");
      reload();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Tag failed", "lose");
    } finally {
      setTagBusy(false);
    }
  };

  const removeTag = async (tag: string) => {
    setTagBusy(true);
    try {
      await api(`/api/admin/users/${id}/tags?tag=${encodeURIComponent(tag)}`, { method: "DELETE" });
      reload();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Tag failed", "lose");
    } finally {
      setTagBusy(false);
    }
  };

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
      reload();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Limits failed", "lose");
    } finally {
      setLimitBusy(false);
    }
  };

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
    } finally {
      setNtfBusy(false);
    }
  };

  const openAdjustConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(adjAmount);
    if (!Number.isFinite(amount) || amount <= 0) { toast("Enter an amount above 0", "lose"); return; }
    if (adjReason.trim().length < 3) { toast("A reason is required", "lose"); return; }
    setAdjConfirm(true);
  };

  const openBonusConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(bonusAmount);
    if (!Number.isFinite(amount) || amount <= 0) { toast("Enter an amount above 0", "lose"); return; }
    if (bonusReason.trim().length < 3) { toast("A reason is required", "lose"); return; }
    setBonusConfirm(true);
  };

  const depositColumns: DataColumn<UserDetail["deposits"][number]>[] = [
    { key: "amount", label: "Amount", render: (d) => fmtStaffMoney(d.amount, d.fiatCurrency ?? fiat) },
    { key: "method", label: "Method", render: (d) => d.method },
    { key: "pct", label: "%", render: (d) => `${d.pctInForce}%` },
    {
      key: "commission",
      label: "Commission",
      render: (d) => fmtStaffMoney(d.commission, d.fiatCurrency ?? fiat),
      details: (d) => [["Commission", fmtStaffMoney(d.commission, d.fiatCurrency ?? fiat)]],
    },
    {
      key: "date",
      label: "Date",
      render: (d) => new Date(d.createdAt).toLocaleDateString("en-GB"),
      details: (d) => [["Date", new Date(d.createdAt).toLocaleDateString("en-GB")]],
    },
  ];

  const roundColumns: DataColumn<UserDetail["rounds"][number]>[] = [
    { key: "game", label: "Game", render: (r) => r.gameName },
    {
      key: "stake",
      label: "Stake",
      render: (r) => (r.currency === "coins" ? `${r.stake} coins` : fmtStaffMoney(r.stake, r.fiatCurrency ?? fiat)),
    },
    {
      key: "payout",
      label: "Payout",
      render: (r) => (r.currency === "coins" ? `${r.payout} coins` : fmtStaffMoney(r.payout, r.fiatCurrency ?? fiat)),
    },
    {
      key: "net",
      label: "Net",
      render: (r) => (
        <span className={r.net > 0 ? "st-ok-text" : r.net < 0 ? "st-bad-text" : ""}>
          {r.currency === "coins" ? `${r.net > 0 ? "+" : ""}${r.net} coins` : r.net > 0 ? `+${fmtStaffMoney(r.net, r.fiatCurrency ?? fiat)}` : fmtStaffMoney(r.net, r.fiatCurrency ?? fiat)}
        </span>
      ),
    },
    {
      key: "date",
      label: "Date",
      render: (r) => new Date(r.createdAt).toLocaleDateString("en-GB"),
      details: (r) => [["Date", new Date(r.createdAt).toLocaleDateString("en-GB")]],
    },
  ];

  return (
    <div>
      <PageHeader
        title={u.name}
        sub={`${u.blockedAt ? "Blocked · " : ""}${detail.readOnly ? "Read-only — this player is in a child admin's downline. " : ""}`}
        backHref={href("/admin/players")}
        backLabel="Players"
      />
      <p>
        <AdminContactValue userId={u.id} contact={u.email || u.phone} preview={!!previewId} />
        {" · "}Joined {new Date(u.joinedAt).toLocaleDateString("en-GB")}
      </p>
      {u.blockedAt ? (
        <p>
          Blocked {new Date(u.blockedAt).toLocaleDateString("en-GB")} — {u.blockedReason || "no reason recorded"}. Betting and deposits are suspended.
        </p>
      ) : null}
      {selfExcludedNow ? (
        <p>
          Self-excluded until {new Date(detail.limits!.selfExcludedUntil!).toLocaleDateString("en-GB")}
          {detail.limits?.selfExclusionReason ? ` — ${detail.limits.selfExclusionReason}` : ""}. They cannot deposit, play or settle until then.
        </p>
      ) : null}
      <Tabs items={tabItems} label="Player detail" />

      {tab === "overview" ? (
        <>
          <Card title="Player">
            <div className="st-meta-grid">
              <div className="st-meta-item"><span>Country</span><b>{countryName}</b></div>
              <div className="st-meta-item"><span>Currency</span><b>{fiat} ({symbolFor(fiat)})</b></div>
              <div className="st-meta-item"><span>Code used</span><b>{u.referralCodeUsed ?? "—"}</b></div>
              <div className="st-meta-item"><span>Referring admin</span><b>{u.referringAdmin?.name || "—"}</b></div>
              <div className="st-meta-item"><span>KYC</span><b>{KYC_LABEL[detail.kycStatus] ?? detail.kycStatus}</b></div>
              <div className="st-meta-item"><span>Status</span><b>{u.blockedAt ? "Blocked" : selfExcludedNow ? "Self-excluded" : "Active"}</b></div>
            </div>
          </Card>
          <Card title="Balances">
            <div className="st-kpi-grid">
              <KpiTile label="Cash" value={fmtStaffMoney(u.cash, fiat)} />
              <KpiTile label="Coins" value={String(u.coins)} />
              <KpiTile label="Role" value={u.role} />
            </div>
          </Card>
          <Card title="Totals">
            <div className="st-kpi-grid">
              <KpiTile label="Deposits" value={String(detail.totals.deposits)} />
              <KpiTile label="Deposited" value={fmtStaffMoney(detail.totals.totalDeposited, fiat)} />
              <KpiTile label="Commission" value={fmtStaffMoney(detail.totals.totalCommission, fiat)} />
              <KpiTile label="Coins given" value={String(detail.totals.coinsGiven)} />
            </div>
          </Card>
          <Card title="VIP">
            {detail.vip.tier ? (
              <>
                <div className="st-kpi-grid">
                  <KpiTile label="Tier" value={detail.vip.tier.name} />
                  <KpiTile label="Deposited" value={fmtStaffMoney(detail.vip.totalDeposited, fiat)} />
                  <KpiTile label="Next tier" value={detail.vip.nextTier ? `${detail.vip.nextTier.name} · ${fmtStaffMoney(detail.vip.nextTier.minDeposited, fiat)}` : "Top tier"} />
                </div>
                {detail.vip.nextTier ? (
                  <p>
                    {detail.vip.progressPct}% of the way to {detail.vip.nextTier.name} — {fmtStaffMoney(detail.vip.toNext, fiat)} more to deposit.
                  </p>
                ) : (
                  <p>Top tier — nothing above this one.</p>
                )}
                {detail.vip.tier.perks.length > 0 ? <p>Perks: {detail.vip.tier.perks.join(", ")}.</p> : null}
              </>
            ) : (
              <p>No VIP tier yet — tiers start at GH₵ 0, so this player will have one once the owner saves the tiers.</p>
            )}
            <p className="st-kbd-hint">VIP is a label and perks only — it changes no economy, limits or payouts. The owner edits the tiers on the Owner panel.</p>
          </Card>
        </>
      ) : null}

      {tab === "money" ? (
        <>
          <Card title="Commission earned">
            <div className="st-kpi-grid">
              <KpiTile label="Earned on this player" value={fmtStaffMoney(detail.commission.total, detail.commission.fiatCurrency ?? fiat)} />
            </div>
            <p>
              {detail.commission.model === "revshare"
                ? `RevShare ${detail.commission.rate}% — % of this player’s net loss (stakes − payouts), recomputed from the ledger.`
                : detail.commission.model === "turnover"
                  ? `Turnover ${detail.commission.rate}% — % of this player’s stakes, recomputed from the ledger.`
                  : detail.commission.model === "legacy"
                    ? "Legacy — flat % of deposits, as stamped on each deposit."
                    : detail.commission.model === "mixed"
                      ? "Mixed — the rule changed over time; the total adds each day’s rule."
                      : "No activity yet — nothing earned on this player."}{" "}
              The Commission page is the source of truth.
            </p>
          </Card>
          {canAct ? (
            <>
              <Card title="Balance adjustment" sub="Credit or debit this player’s cash or coins. A reason is required — the adjustment is written to the ledger and the audit log.">
                <form onSubmit={openAdjustConfirm}>
                  <div className="st-form-row st-form-row-3">
                    <FormField label="Wallet">
                      <Select value={adjWallet} onChange={(e) => setAdjWallet(e.target.value as "cash" | "coins")} aria-label="Wallet">
                        <option value="cash">Cash ({symbolFor(fiat)})</option>
                        <option value="coins">Coins</option>
                      </Select>
                    </FormField>
                    <FormField label="Direction">
                      <Select value={adjDir} onChange={(e) => setAdjDir(e.target.value as "credit" | "debit")} aria-label="Direction">
                        <option value="credit">Credit</option>
                        <option value="debit">Debit</option>
                      </Select>
                    </FormField>
                    <FormField label="Amount" required>
                      <Input type="number" min={0} step={adjWallet === "cash" ? "0.01" : "1"} inputMode="decimal" placeholder={adjWallet === "cash" ? "0.00" : "0"} value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)} aria-label="Amount" required />
                    </FormField>
                  </div>
                  <FormField label="Reason (required)" required>
                    <Input type="text" placeholder="Why is this balance changing?" value={adjReason} onChange={(e) => setAdjReason(e.target.value)} aria-label="Reason" required minLength={3} />
                  </FormField>
                  <div className="st-btn-row" style={{ marginTop: 12 }}>
                    <Button variant="primary" type="submit" disabled={adjBusy}>
                      {adjBusy ? "Saving…" : `${adjDir === "credit" ? "Credit" : "Debit"} ${adjWallet === "cash" ? "cash" : "coins"}`}
                    </Button>
                  </div>
                </form>
              </Card>
              <Card title="Bonus grant" sub="Grant a bonus — cash or coins, credited at once. A reason is required; an expiry date is recorded only and is not auto-enforced.">
                <form onSubmit={openBonusConfirm}>
                  <div className="st-form-row st-form-row-3">
                    <FormField label="Wallet">
                      <Select value={bonusWallet} onChange={(e) => setBonusWallet(e.target.value as "cash" | "coins")} aria-label="Bonus wallet">
                        <option value="cash">Cash ({symbolFor(fiat)})</option>
                        <option value="coins">Coins</option>
                      </Select>
                    </FormField>
                    <FormField label="Amount" required>
                      <Input type="number" min={0} step={bonusWallet === "cash" ? "0.01" : "1"} inputMode="decimal" placeholder={bonusWallet === "cash" ? "0.00" : "0"} value={bonusAmount} onChange={(e) => setBonusAmount(e.target.value)} aria-label="Bonus amount" required />
                    </FormField>
                    <FormField label="Expiry (optional)">
                      <Input type="date" value={bonusExpires} onChange={(e) => setBonusExpires(e.target.value)} aria-label="Bonus expiry" />
                    </FormField>
                  </div>
                  <FormField label="Reason (required)" required>
                    <Input type="text" placeholder="Why is this bonus being granted?" value={bonusReason} onChange={(e) => setBonusReason(e.target.value)} aria-label="Bonus reason" required minLength={3} />
                  </FormField>
                  <div className="st-btn-row" style={{ marginTop: 12 }}>
                    <Button variant="primary" type="submit" disabled={bonusBusy}>
                      {bonusBusy ? "Granting…" : "Grant bonus"}
                    </Button>
                  </div>
                </form>
              </Card>
            </>
          ) : null}
          <Card title={`Full deposit history (${detail.deposits.length})`}>
            {detail.deposits.length === 0 ? (
              <EmptyState title="No deposits yet." text="This player has not deposited yet." />
            ) : (
              <DataTable
                viewId="admin-player-deposits"
                columns={depositColumns}
                rows={detail.deposits}
                total={detail.deposits.length}
                page={1}
                pageSize={10}
                onPageChange={() => undefined}
              />
            )}
          </Card>
        </>
      ) : null}

      {tab === "games" ? (
        <Card title={`Bet history (${detail.rounds.length})`}>
          {detail.rounds.length === 0 ? (
            <EmptyState title="No rounds yet." text="This player has not played any rounds yet." />
          ) : (
            <DataTable
              viewId="admin-player-rounds"
              columns={roundColumns}
              rows={detail.rounds}
              total={detail.rounds.length}
              page={1}
              pageSize={10}
              onPageChange={() => undefined}
            />
          )}
        </Card>
      ) : null}

      {tab === "kyc" ? (
        <>
          <Card title="KYC status">
            <div className="st-kpi-grid">
              <KpiTile label="Status" value={KYC_LABEL[detail.kycStatus] ?? detail.kycStatus} />
              <KpiTile
                label="Document"
                value={
                  detail.kycDocumentType === "national_id"
                    ? "National ID"
                    : detail.kycDocumentType === "passport"
                      ? "Passport"
                      : detail.kycDocumentType === "drivers_licence"
                        ? "Driver's licence"
                        : detail.kycDocumentType ?? "—"
                }
              />
              <KpiTile
                label="Submitted"
                value={detail.kycSubmittedAt ? new Date(detail.kycSubmittedAt).toLocaleDateString("en-GB") : "—"}
              />
            </div>
            {detail.kycStatus === "rejected" && detail.kycRejectionReason ? <p>Rejected: {detail.kycRejectionReason}</p> : null}
            <p>KYC is verification only — it never blocks deposits or play. Decisions are made on the KYC queue.</p>
            <Button variant="secondary" onClick={() => router.push(href("/admin/kyc"))}>
              Open the KYC queue
            </Button>
          </Card>
          {detail.kycDocumentUrl ? (
            <Card title="Document">
              <KycDocumentViewer
                documentUrl={detail.kycDocumentUrl}
                documentTypeLabel={
                  detail.kycDocumentType === "national_id"
                    ? "National ID"
                    : detail.kycDocumentType === "passport"
                      ? "Passport"
                      : detail.kycDocumentType === "drivers_licence"
                        ? "Driver's licence"
                        : detail.kycDocumentType ?? "Document"
                }
                playerName={u.name}
              />
            </Card>
          ) : (
            <Card title="Document">
              <EmptyState title="No document submitted." text="This player has not submitted a KYC document yet." />
            </Card>
          )}
        </>
      ) : null}

      {tab === "activity" ? (
        <>
          <Card title={`Support tickets (${detail.tickets.length})`}>
            {detail.tickets.length === 0 ? (
              <EmptyState title="No tickets from this player." text="Tickets they open will show here." />
            ) : (
              <div className="st-tk-thread">
                {detail.tickets.map((t) => (
                  <div key={t.id} className="st-tk-msg st-tk-msg-user">
                    <b>{t.subject}</b>
                    <small>
                      {t.status} · {new Date(t.createdAt).toLocaleDateString("en-GB")}
                    </small>
                  </div>
                ))}
              </div>
            )}
            <Button variant="secondary" onClick={() => router.push(href("/admin/tickets"))}>
              Open the ticket inbox
            </Button>
          </Card>
          <Card title={`Notes (${detail.notes.length})`} sub="Admin-only — the player never sees these.">
            {detail.notes.length === 0 ? (
              <p>No notes on this player yet.</p>
            ) : (
              <div className="st-tk-thread">
                {detail.notes.map((n) => (
                  <div key={n.id} className="st-tk-msg st-tk-msg-user">
                    <span>{n.text}</span>
                    <small>
                      {n.authorName} · {new Date(n.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </small>
                  </div>
                ))}
              </div>
            )}
            {canAct ? (
              <form onSubmit={submitNote}>
                <FormField label="Add a note">
                  <textarea className="st-textarea" placeholder="Add a note — only admins see this" value={noteText} onChange={(e) => setNoteText(e.target.value)} aria-label="Note" rows={2} maxLength={1000} />
                </FormField>
                <div className="st-btn-row" style={{ marginTop: 12 }}>
                  <Button variant="primary" type="submit" disabled={noteBusy}>
                    {noteBusy ? "Adding…" : "Add note"}
                  </Button>
                </div>
              </form>
            ) : null}
          </Card>
          <Card title="Tags">
            {detail.tags.length === 0 ? (
              <p>No tags on this player yet.</p>
            ) : (
              <div className="st-chip-row">
                {detail.tags.map((t) => (
                  <span key={t} className="st-chip">
                    {t}
                    {canAct ? (
                      <button
                        type="button"
                        className="st-chip-x"
                        onClick={() => void removeTag(t)}
                        aria-label={`Remove tag ${t}`}
                      >
                        ✕
                      </button>
                    ) : null}
                  </span>
                ))}
              </div>
            )}
            {canAct ? (
              <form onSubmit={submitTag}>
                <FormField label="Add a tag">
                  <Input type="text" placeholder="Add a tag — e.g. VIP, fraud watch" value={tagInput} onChange={(e) => setTagInput(e.target.value)} aria-label="Tag" maxLength={30} />
                </FormField>
                <div className="st-btn-row" style={{ marginTop: 12 }}>
                  <Button variant="primary" type="submit" disabled={tagBusy}>
                    {tagBusy ? "Adding…" : "Add tag"}
                  </Button>
                </div>
              </form>
            ) : null}
          </Card>
          {canAct ? (
            <Card title="Send notification" sub="Send a message to this player — it shows on their account page. In-app only, no email or SMS.">
              <form onSubmit={submitNotify}>
                <FormField label="Title" required>
                  <Input type="text" placeholder="Title — e.g. Your withdrawal is approved" value={ntfTitle} onChange={(e) => setNtfTitle(e.target.value)} aria-label="Notification title" maxLength={120} />
                </FormField>
                <FormField label="Message" required>
                  <textarea className="st-textarea" placeholder="Message…" value={ntfBody} onChange={(e) => setNtfBody(e.target.value)} aria-label="Notification message" rows={2} maxLength={2000} />
                </FormField>
                <div className="st-btn-row" style={{ marginTop: 12 }}>
                  <Button variant="primary" type="submit" disabled={ntfBusy}>
                    {ntfBusy ? "Sending…" : "Send notification"}
                  </Button>
                </div>
              </form>
            </Card>
          ) : null}
          <Card title="Limits & responsible play" sub="Per-player limits, enforced server-side on top of the per-game economics. A cool-off blocks play entirely until the date. Self-exclusion is stronger — no deposit, play or settle until the date.">
            {canAct ? (
              <form onSubmit={submitLimits}>
                <div className="st-form-row st-form-row-4">
                  <FormField label={`Max stake per bet (${symbolFor(fiat)})`}>
                    <Input type="number" min={0} step="0.01" inputMode="decimal" placeholder="No limit" value={limitMaxStake} onChange={(e) => setLimitMaxStake(e.target.value)} aria-label="Max stake per bet" />
                  </FormField>
                  <FormField label={`Max deposit per day (${symbolFor(fiat)})`}>
                    <Input type="number" min={0} step="0.01" inputMode="decimal" placeholder="No limit" value={limitMaxDeposit} onChange={(e) => setLimitMaxDeposit(e.target.value)} aria-label="Max deposit per day" />
                  </FormField>
                  <FormField label={`Max loss per day (${symbolFor(fiat)})`}>
                    <Input type="number" min={0} step="0.01" inputMode="decimal" placeholder="No limit" value={limitMaxLoss} onChange={(e) => setLimitMaxLoss(e.target.value)} aria-label="Max loss per day" />
                  </FormField>
                  <FormField label="Cool-off until">
                    <Input type="date" value={limitCoolOff} onChange={(e) => setLimitCoolOff(e.target.value)} aria-label="Cool-off until" />
                  </FormField>
                </div>
                <div className="st-form-row st-form-row-3">
                  <FormField label="Self-excluded until">
                    <Input type="date" value={limitSelfExcl} onChange={(e) => setLimitSelfExcl(e.target.value)} aria-label="Self-excluded until" />
                  </FormField>
                  <FormField label="Self-exclusion reason">
                    <Input type="text" placeholder="Why — required when excluding" value={limitSelfExclReason} onChange={(e) => setLimitSelfExclReason(e.target.value)} aria-label="Self-exclusion reason" />
                  </FormField>
                  <FormField label="Reality check every (minutes, 0 = off)">
                    <Input type="number" min={0} max={480} step="1" inputMode="numeric" placeholder="0" value={limitRealityCheck} onChange={(e) => setLimitRealityCheck(e.target.value)} aria-label="Reality check minutes" />
                  </FormField>
                </div>
                <p className="st-kbd-hint">Self-exclusion blocks deposits, play and settling until the date. The reality check shows the player a session summary in the game room every N minutes (0 = off).</p>
                <div className="st-btn-row" style={{ marginTop: 12 }}>
                  <Button variant="primary" type="submit" disabled={limitBusy}>
                    {limitBusy ? "Saving…" : "Save limits"}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="st-kpi-grid">
                <KpiTile label="Max stake" value={detail.limits?.maxStake != null ? fmtStaffMoney(detail.limits.maxStake, fiat) : "No limit"} />
                <KpiTile label="Max deposit / day" value={detail.limits?.maxDepositPerDay != null ? fmtStaffMoney(detail.limits.maxDepositPerDay, fiat) : "No limit"} />
                <KpiTile label="Max loss / day" value={detail.limits?.maxLossPerDay != null ? fmtStaffMoney(detail.limits.maxLossPerDay, fiat) : "No limit"} />
                <KpiTile label="Cool-off" value={detail.limits?.coolOffUntil ? `Until ${new Date(detail.limits.coolOffUntil).toLocaleDateString("en-GB")}` : "None"} />
                <KpiTile label="Self-excluded" value={selfExcludedNow ? `Until ${new Date(detail.limits!.selfExcludedUntil!).toLocaleDateString("en-GB")}` : "No"} />
                <KpiTile label="Reality check" value={detail.limits?.realityCheckMinutes ? `Every ${detail.limits.realityCheckMinutes} min` : "Off"} />
              </div>
            )}
          </Card>
          {canAct ? (
            <Card title="Block / Unblock" sub={u.blockedAt ? "This player is blocked — they cannot place bets or deposit." : "Blocking suspends this player’s betting and deposits immediately."}>
              <Button
                variant={u.blockedAt ? "primary" : "danger"}
                onClick={() => setBlockConfirm(u.blockedAt ? "unblock" : "block")}
                disabled={blockBusy}
              >
                {blockBusy ? "Saving…" : u.blockedAt ? "Unblock player" : "Block player"}
              </Button>
            </Card>
          ) : null}
        </>
      ) : null}

      <ConfirmDialog
        open={adjConfirm}
        onClose={() => setAdjConfirm(false)}
        onConfirm={() => void submitAdjust()}
        title={`${adjDir === "credit" ? "Credit" : "Debit"} ${adjWallet === "cash" ? "cash" : "coins"}`}
        facts={[
          { label: "Player", value: u.name },
          { label: "Amount", value: adjWallet === "cash" ? fmtStaffMoney(Number(adjAmount) || 0, fiat) : `${adjAmount} coins` },
          { label: "Direction", value: adjDir === "credit" ? "Credit" : "Debit" },
          { label: "Reason", value: adjReason.trim() },
        ]}
        confirmLabel={adjDir === "credit" ? "Credit" : "Debit"}
        busy={adjBusy}
      />
      <ConfirmDialog
        open={bonusConfirm}
        onClose={() => setBonusConfirm(false)}
        onConfirm={() => void submitBonus()}
        title="Grant bonus"
        facts={[
          { label: "Player", value: u.name },
          { label: "Amount", value: bonusWallet === "cash" ? fmtStaffMoney(Number(bonusAmount) || 0, fiat) : `${bonusAmount} coins` },
          { label: "Reason", value: bonusReason.trim() },
          ...(bonusExpires ? [{ label: "Expires", value: bonusExpires }] : []),
        ]}
        confirmLabel="Grant bonus"
        busy={bonusBusy}
      />
      <ConfirmDialog
        open={blockConfirm !== null}
        onClose={() => setBlockConfirm(null)}
        onConfirm={(reason) => void submitBlock(reason)}
        title={blockConfirm === "unblock" ? "Unblock player" : "Block player"}
        body={
          blockConfirm === "unblock"
            ? "This restores the player’s betting and deposits."
            : "Blocking suspends this player’s betting and deposits immediately."
        }
        facts={[{ label: "Player", value: u.name }]}
        reasonRequired={blockConfirm === "block"}
        reasonLabel="Reason for blocking (required)"
        confirmLabel={blockConfirm === "unblock" ? "Unblock" : "Block"}
        danger={blockConfirm === "block"}
        busy={blockBusy}
      />
    </div>
  );
}
