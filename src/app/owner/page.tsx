// Owner panel — add/edit/deactivate admins, set %, all admins with
// codes / referral counts / coins given / daily commission per admin per
// day with date picker, overall totals, per-day per-admin table,
// all-admins rollup, preview any admin's panel.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, fmtCash } from "../../lib/api";
import { useStore } from "../../lib/store";
import { copyText, todayStr } from "../../lib/admin-client";
import { ADMIN_SECTIONS, ADMIN_SECTION_LABELS, type AdminSection } from "../../lib/rbac";

interface AdminRow {
  id: string; name: string; email: string; role: string; commissionPct: number | null; active: boolean;
  permissions: string[] | null; totpEnabled: boolean;
  codes: { id: string; code: string; active: boolean }[];
  referralCount: number; coinsGiven: number; commissionAllTime: number; createdAt: string;
}

// P0 Batch 3 (O2/O15) — per-admin permissions editor + "Kill all
// sessions". Checkboxes for the 7 sections; "All sections" (null) is
// the default. Saving PATCHes the admin; killing sessions bumps their
// session version so every JWT they hold stops working at once.
function OwnerAdminPerms({ a, onSaved }: {
  a: AdminRow;
  onSaved: () => Promise<void>;
}) {
  const { toast } = useStore();
  const [perms, setPerms] = useState<string[] | null>(a.permissions);
  const [busy, setBusy] = useState(false);
  const [killBusy, setKillBusy] = useState(false);
  const toggle = (s: AdminSection) => {
    setPerms((cur) => {
      const all = cur ?? [...ADMIN_SECTIONS];
      return all.includes(s) ? all.filter((x) => x !== s) : [...all, s];
    });
  };
  const save = async () => {
    setBusy(true);
    try {
      // All 7 checked = "all sections" (null) — the stored form.
      const list = perms === null ? null : perms.length >= ADMIN_SECTIONS.length ? null : perms;
      await api(`/api/owner/admins/${a.id}`, { method: "PATCH", body: JSON.stringify({ permissions: list }) });
      toast(`Permissions saved for ${a.name}`, "win");
      await onSaved();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not save permissions", "lose");
    } finally { setBusy(false); }
  };
  const kill = async () => {
    setKillBusy(true);
    try {
      await api(`/api/owner/admins/${a.id}/kill-sessions`, { method: "POST" });
      toast(`All sessions killed for ${a.name} — they must sign in again`, "win");
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not kill sessions", "lose");
    } finally { setKillBusy(false); }
  };
  const checked = (s: AdminSection) => (perms === null ? true : perms.includes(s));
  return (
    <div className="ow-perms">
      <span className="ow-perms-label">Sections this admin can open:</span>
      <div className="ow-perms-checks">
        {ADMIN_SECTIONS.map((s) => (
          <label key={s} className="ow-perm-check">
            <input type="checkbox" checked={checked(s)} onChange={() => toggle(s)} /> {ADMIN_SECTION_LABELS[s]}
          </label>
        ))}
      </div>
      <div className="ow-perms-actions">
        <button className="btn btn-ghost btn-sm" type="button" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save permissions"}</button>
        <button className="btn btn-ghost btn-sm" type="button" disabled={killBusy} onClick={() => void kill()}>{killBusy ? "Killing…" : "Kill all sessions"}</button>
        {a.totpEnabled ? <span className="ow-2fa-on">2FA on</span> : null}
      </div>
    </div>
  );
}
interface RollupDay { date: string; adminId: string; adminName: string; deposits: number; totalAmount: number; totalCommission: number }
interface OwnerDayAdmin { admin: { id: string; name: string }; deposits: { id: string; userId: string; userName: string; userContact: string; amount: number; method: string; pctInForce: number; commission: number; time: string }[]; totalAmount: number; totalCommission: number }
// P0 Batch 4 (O6): one row of the global player search.
interface OwnerSearchPlayer { id: string; name: string; email: string | null; phone: string | null; role: string; referringAdmin: { id: string; name: string } | null; totalDeposited: number; deposits: number; cash: number; coins: number; joinedAt: string }

// P0 Batch 2 — one game row: visibility + kill toggles and the four
// economics fields, saved per row. Number inputs hold text locally so
// an empty field means "clear the override" (back to the catalogue
// default) instead of 0.
function OwnerGameRow({ g, onSave }: {
  g: { slug: string; name: string; currency: string; visible: boolean; killed: boolean; minBet: number | null; maxBet: number | null; maxPayout: number | null; maxMultiplier: number; note: string };
  onSave: (slug: string, patch: Record<string, unknown>) => Promise<void>;
}) {
  const [minBet, setMinBet] = useState(g.minBet == null ? "" : String(g.minBet));
  const [maxBet, setMaxBet] = useState(g.maxBet == null ? "" : String(g.maxBet));
  const [maxPayout, setMaxPayout] = useState(g.maxPayout == null ? "" : String(g.maxPayout));
  const [maxMult, setMaxMult] = useState(String(g.maxMultiplier));
  const [busy, setBusy] = useState(false);
  const unit = g.currency === "coins" ? "coins" : "GH₵";
  const numOrNull = (s: string): number | null => {
    const t = s.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : NaN;
  };
  const save = async () => {
    const patch: Record<string, unknown> = {};
    const a = numOrNull(minBet);
    const b = numOrNull(maxBet);
    const c = numOrNull(maxPayout);
    const d = numOrNull(maxMult);
    if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(c) || Number.isNaN(d)) return;
    if (a !== g.minBet) patch.minBet = a;
    if (b !== g.maxBet) patch.maxBet = b;
    if (c !== g.maxPayout) patch.maxPayout = c;
    if (d !== null && d !== g.maxMultiplier) patch.maxMultiplier = d;
    if (Object.keys(patch).length === 0) return;
    setBusy(true);
    try { await onSave(g.slug, patch); } finally { setBusy(false); }
  };
  return (
    <div className={`ow-game-row${g.killed ? " ow-game-killed" : ""}${!g.visible ? " ow-game-hidden" : ""}`}>
      <div className="ow-game-head">
        <b>{g.name}</b>
        <span className="ow-game-cur">{g.currency === "coins" ? "Coins" : "Cash"}</span>
        <span className="ow-game-mult">max ×{g.maxMultiplier}</span>
        {g.killed && <span className="ow-game-flag bad">KILLED</span>}
        {!g.visible && <span className="ow-game-flag">HIDDEN</span>}
      </div>
      <p className="ow-game-note">{g.note}</p>
      <div className="ow-game-toggles">
        <button
          type="button"
          className={`btn btn-sm ${g.visible ? "btn-gold" : "btn-ghost"}`}
          disabled={busy}
          onClick={() => void onSave(g.slug, { visible: !g.visible })}
          aria-pressed={g.visible}
        >{g.visible ? "Visible" : "Hidden"}</button>
        <button
          type="button"
          className={`btn btn-sm ${g.killed ? "btn-danger" : "btn-ghost"}`}
          disabled={busy}
          onClick={() => {
            if (!g.killed && !window.confirm(`Kill ${g.name}? No one can play it until you unkill it.`)) return;
            void onSave(g.slug, { killed: !g.killed });
          }}
          aria-pressed={g.killed}
        >{g.killed ? "Killed — tap to resume" : "Kill switch"}</button>
      </div>
      <div className="ow-game-econ">
        <label>Min bet ({unit}) <input type="number" min={0} step={g.currency === "coins" ? 1 : 0.01} value={minBet} onChange={(e) => setMinBet(e.target.value)} placeholder="Default" aria-label={`${g.name} minimum bet`} /></label>
        <label>Max bet ({unit}) <input type="number" min={0} step={g.currency === "coins" ? 1 : 0.01} value={maxBet} onChange={(e) => setMaxBet(e.target.value)} placeholder="No cap" aria-label={`${g.name} maximum bet`} /></label>
        <label>Max payout ({unit}) <input type="number" min={0} step={g.currency === "coins" ? 1 : 0.01} value={maxPayout} onChange={(e) => setMaxPayout(e.target.value)} placeholder="No cap" aria-label={`${g.name} maximum payout`} /></label>
        <label>Max × <input type="number" min={0.01} step={0.01} value={maxMult} onChange={(e) => setMaxMult(e.target.value)} aria-label={`${g.name} maximum multiplier`} /></label>
        <button className="btn btn-gold btn-sm" type="button" disabled={busy} onClick={() => void save()}>Save</button>
      </div>
    </div>
  );
}

function OwnerPayRow({ m, onSave }: {
  m: { method: string; enabled: boolean; minDeposit: number | null; maxDeposit: number | null };
  onSave: (method: string, patch: Record<string, unknown>) => Promise<void>;
}) {
  const [minDep, setMinDep] = useState(m.minDeposit == null ? "" : String(m.minDeposit));
  const [maxDep, setMaxDep] = useState(m.maxDeposit == null ? "" : String(m.maxDeposit));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const patch: Record<string, unknown> = {};
    const a = minDep.trim() === "" ? null : Number(minDep);
    const b = maxDep.trim() === "" ? null : Number(maxDep);
    if (a !== m.minDeposit) patch.minDeposit = a;
    if (b !== m.maxDeposit) patch.maxDeposit = b;
    if (Object.keys(patch).length === 0) return;
    setBusy(true);
    try { await onSave(m.method, patch); } finally { setBusy(false); }
  };
  return (
    <div className={`ow-pay-row${!m.enabled ? " ow-pay-off" : ""}`}>
      <div className="ow-game-head">
        <b>{m.method}</b>
        {!m.enabled && <span className="ow-game-flag bad">DISABLED</span>}
      </div>
      <div className="ow-game-toggles">
        <button
          type="button"
          className={`btn btn-sm ${m.enabled ? "btn-gold" : "btn-ghost"}`}
          disabled={busy}
          onClick={() => void onSave(m.method, { enabled: !m.enabled })}
          aria-pressed={m.enabled}
        >{m.enabled ? "Enabled" : "Disabled"}</button>
      </div>
      <div className="ow-game-econ">
        <label>Min deposit (GH₵) <input type="number" min={0} step={0.01} value={minDep} onChange={(e) => setMinDep(e.target.value)} placeholder="Platform min" aria-label={`${m.method} minimum deposit`} /></label>
        <label>Max deposit (GH₵) <input type="number" min={0} step={0.01} value={maxDep} onChange={(e) => setMaxDep(e.target.value)} placeholder="No cap" aria-label={`${m.method} maximum deposit`} /></label>
        <button className="btn btn-gold btn-sm" type="button" disabled={busy} onClick={() => void save()}>Save</button>
      </div>
    </div>
  );
}

function OwnerWalletForm({ w, onSave }: {
  w: { cashMinDeposit: number; cashMinStake: number; coinMinStake: number; conversionRate: number; coinsWithdrawable: boolean };
  onSave: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const [dep, setDep] = useState(String(w.cashMinDeposit));
  const [stake, setStake] = useState(String(w.cashMinStake));
  const [coin, setCoin] = useState(String(w.coinMinStake));
  const [rate, setRate] = useState(String(w.conversionRate));
  const [wd, setWd] = useState(w.coinsWithdrawable);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const patch: Record<string, unknown> = {};
    const a = Number(dep);
    const b = Number(stake);
    const c = Number(coin);
    const d = Number(rate);
    if (Number.isFinite(a) && a !== w.cashMinDeposit) patch.cashMinDeposit = a;
    if (Number.isFinite(b) && b !== w.cashMinStake) patch.cashMinStake = b;
    if (Number.isFinite(c) && c !== w.coinMinStake) patch.coinMinStake = c;
    if (Number.isFinite(d) && d !== w.conversionRate) patch.conversionRate = d;
    if (wd !== w.coinsWithdrawable) patch.coinsWithdrawable = wd;
    if (Object.keys(patch).length === 0) return;
    setBusy(true);
    try { await onSave(patch); } finally { setBusy(false); }
  };
  return (
    <div className="ow-wallet">
      <label>Cash min deposit (GH₵)
        <input type="number" min={0} step={0.01} value={dep} onChange={(e) => setDep(e.target.value)} aria-label="Cash minimum deposit" />
      </label>
      <label>Cash min stake (GH₵)
        <input type="number" min={0.01} step={0.01} value={stake} onChange={(e) => setStake(e.target.value)} aria-label="Cash minimum stake" />
      </label>
      <label>Coin min stake (coins)
        <input type="number" min={1} step={1} value={coin} onChange={(e) => setCoin(e.target.value)} aria-label="Coin minimum stake" />
      </label>
      <label>Conversion rate (GH₵ = 1 coin)
        <input type="number" min={1} step={0.01} value={rate} onChange={(e) => setRate(e.target.value)} aria-label="Conversion rate" />
      </label>
      <label className="ow-check">
        <input type="checkbox" checked={wd} onChange={(e) => setWd(e.target.checked)} />
        Coins are withdrawable
      </label>
      <p className="ow-day-cap">Coins are play-only by default. Turning this on records the policy only — no coin payout path exists yet, so coins still cannot be paid out.</p>
      <button className="btn btn-gold" type="button" disabled={busy} onClick={() => void save()}>Save wallet config</button>
    </div>
  );
}

export default function OwnerPage() {
  const { user, openAuth, toast } = useStore();
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [rollup, setRollup] = useState<{ days: RollupDay[]; totals: { deposits: number; totalAmount: number; totalCommission: number } } | null>(null);
  const [err, setErr] = useState("");
  const [date, setDate] = useState("");
  useEffect(() => { setDate(todayStr()); }, []);
  const [tab, setTab] = useState<"per-day" | "rollup">("per-day");
  const [dayAdmins, setDayAdmins] = useState<OwnerDayAdmin[] | null>(null);
  const [dayTotals, setDayTotals] = useState<{ deposits: number; totalAmount: number; totalCommission: number } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // P0 Batch 1 (O8): withdrawal oversight — every pending withdrawal
  // platform-wide. Large ones an admin approved sit as "admin_approved"
  // until the owner approves them second (maker-checker, GH₵ 500).
  interface OwnerWdRow { id: string; userId: string; userName: string; userContact: string | null; adminId: string | null; adminName: string | null; amount: number; method: string; status: string; reason: string | null; createdAt: string; decidedAt: string | null }
  const [ownerWd, setOwnerWd] = useState<OwnerWdRow[] | null>(null);
  const [ownerWdPending, setOwnerWdPending] = useState(0);
  const [ownerWdStatus, setOwnerWdStatus] = useState("");
  const [ownerRejectId, setOwnerRejectId] = useState<string | null>(null);
  const [ownerRejectReason, setOwnerRejectReason] = useState("");
  const [ownerWdBusy, setOwnerWdBusy] = useState<string | null>(null);
  const loadOwnerWd = useCallback(async () => {
    try {
      const r = await api<{ withdrawals: OwnerWdRow[]; pending: number }>(`/api/owner/withdrawals${ownerWdStatus ? `?status=${ownerWdStatus}` : ""}`);
      setOwnerWd(r.withdrawals);
      setOwnerWdPending(r.pending);
    } catch { setOwnerWd([]); }
  }, [ownerWdStatus]);
  useEffect(() => { void loadOwnerWd(); }, [loadOwnerWd]);
  const decideOwnerWd = async (w: OwnerWdRow, decision: "approve" | "reject") => {
    if (decision === "reject" && ownerRejectId !== w.id) { setOwnerRejectId(w.id); setOwnerRejectReason(""); return; }
    if (decision === "reject" && ownerRejectReason.trim().length < 3) { toast("A reason is required to reject", "lose"); return; }
    setOwnerWdBusy(w.id);
    try {
      await api(`/api/owner/withdrawals/${w.id}/decide`, {
        method: "POST",
        body: JSON.stringify({ decision, ...(decision === "reject" ? { reason: ownerRejectReason.trim() } : {}) }),
      });
      toast(decision === "approve" ? "Withdrawal approved" : "Withdrawal rejected", decision === "approve" ? "win" : "lose");
      setOwnerRejectId(null);
      setOwnerRejectReason("");
      await loadOwnerWd();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Decision failed", "lose");
    } finally { setOwnerWdBusy(null); }
  };

  // P0 Batch 1 (O7): global transaction ledger — every money movement,
  // platform-wide, searchable by type, period, amount, method and admin.
  interface OwnerLedgerRow { id: string; type: string; userId: string; userName: string; userContact: string | null; adminId: string | null; adminName: string | null; amount: number; wallet: string; detail: string; status?: string; reason?: string; createdAt: string }
  const [ownerLedger, setOwnerLedger] = useState<OwnerLedgerRow[] | null>(null);
  const [ownerLedTotals, setOwnerLedTotals] = useState<{ rows: number; cashIn: number; cashOut: number } | null>(null);
  const [ownerLedType, setOwnerLedType] = useState("");
  const [ownerLedQ, setOwnerLedQ] = useState("");
  const [ownerLedFrom, setOwnerLedFrom] = useState("");
  const [ownerLedTo, setOwnerLedTo] = useState("");
  const [ownerLedAdmin, setOwnerLedAdmin] = useState("");
  const loadOwnerLedger = useCallback(async () => {
    try {
      const p = new URLSearchParams();
      if (ownerLedType) p.set("type", ownerLedType);
      if (ownerLedQ.trim()) p.set("q", ownerLedQ.trim());
      if (ownerLedFrom) p.set("from", ownerLedFrom);
      if (ownerLedTo) p.set("to", ownerLedTo);
      if (ownerLedAdmin) p.set("adminId", ownerLedAdmin);
      const qs = p.toString();
      const r = await api<{ rows: OwnerLedgerRow[]; totals: { rows: number; cashIn: number; cashOut: number } }>(`/api/owner/ledger${qs ? `?${qs}` : ""}`);
      setOwnerLedger(r.rows);
      setOwnerLedTotals(r.totals);
    } catch { setOwnerLedger([]); }
  }, [ownerLedType, ownerLedQ, ownerLedFrom, ownerLedTo, ownerLedAdmin]);
  useEffect(() => { void loadOwnerLedger(); }, [loadOwnerLedger]);

  // P0 Batch 2 (O1): global P&L — GGR, deposits, approved withdrawals,
  // commissions owed, net profit, for a selectable period.
  interface Pnl { from: string | null; to: string | null; roundsCash: number; stakesCash: number; payoutsCash: number; ggrCash: number; roundsCoins: number; stakesCoins: number; payoutsCoins: number; ggrCoins: number; deposits: number; depositsCount: number; withdrawals: number; withdrawalsCount: number; commissions: number; netProfit: number; formula: string }
  const [pnlPreset, setPnlPreset] = useState<"today" | "week" | "month" | "custom">("today");
  const [pnlFrom, setPnlFrom] = useState("");
  const [pnlTo, setPnlTo] = useState("");
  const [pnl, setPnl] = useState<Pnl | null>(null);
  const loadPnl = useCallback(async () => {
    const today = todayStr();
    let from = today;
    let to = today;
    if (pnlPreset === "week") {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - 6);
      from = d.toISOString().slice(0, 10);
    } else if (pnlPreset === "month") {
      from = `${today.slice(0, 8)}01`;
    } else if (pnlPreset === "custom") {
      from = pnlFrom || today;
      to = pnlTo || today;
    }
    try {
      setPnl(await api<Pnl>(`/api/owner/pnl?from=${from}&to=${to}`));
    } catch { setPnl(null); }
  }, [pnlPreset, pnlFrom, pnlTo]);
  useEffect(() => { void loadPnl(); }, [loadPnl]);

  // P0 Batch 3 (O4): commission rules — the rules engine. A rule is a
  // model (RevShare = % of net loss, Turnover = % of stakes) + a rate,
  // for one admin or as the global default, from an effective date.
  interface CommissionRuleRow { id: string; adminId: string | null; adminName: string | null; model: string; rate: number; effectiveFrom: string; createdAt: string }
  const [rules, setRules] = useState<CommissionRuleRow[] | null>(null);
  const [ruleAdmin, setRuleAdmin] = useState("");
  const [ruleModel, setRuleModel] = useState<"revshare" | "turnover">("revshare");
  const [ruleRate, setRuleRate] = useState(10);
  // Dates start empty and are set on mount (calling new Date() during
  // render breaks the prerender — the same rule as the commission date
  // picker above).
  const [ruleFrom, setRuleFrom] = useState("");
  useEffect(() => { setRuleFrom(todayStr()); }, []);
  const [ruleBusy, setRuleBusy] = useState(false);
  const loadRules = useCallback(async () => {
    try {
      const r = await api<{ rules: CommissionRuleRow[] }>("/api/owner/commission/rules");
      setRules(r.rules);
    } catch { setRules([]); }
  }, []);
  useEffect(() => { void loadRules(); }, [loadRules]);
  const saveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setRuleBusy(true);
    try {
      await api("/api/owner/commission/rules", {
        method: "POST",
        body: JSON.stringify({ adminId: ruleAdmin || null, model: ruleModel, rate: ruleRate, effectiveFrom: ruleFrom }),
      });
      toast("Commission rule saved — it applies from its effective date", "win");
      await loadRules();
      await load();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not save rule", "lose");
    } finally { setRuleBusy(false); }
  };

  // P0 Batch 3 (O5): commission settlement — owed / paid / balance per
  // admin for a period, and recording a payout (which writes to the
  // ledger + audit log and drops the balance).
  interface SettlementRow { adminId: string; adminName: string; adminEmail: string | null; active: boolean; owed: number; paid: number; balance: number }
  const [settleFrom, setSettleFrom] = useState("");
  const [settleTo, setSettleTo] = useState("");
  useEffect(() => {
    const today = todayStr();
    setSettleFrom(`${today.slice(0, 8)}01`);
    setSettleTo(today);
  }, []);
  const [settlement, setSettlement] = useState<{ from: string; to: string; rows: SettlementRow[]; totals: { owed: number; paid: number; balance: number } } | null>(null);
  const loadSettlement = useCallback(async () => {
    if (!settleFrom || !settleTo) return;
    try {
      const r = await api<{ from: string; to: string; rows: SettlementRow[]; totals: { owed: number; paid: number; balance: number } }>(`/api/owner/commission/settlement?from=${settleFrom}&to=${settleTo}`);
      setSettlement(r);
    } catch { setSettlement(null); }
  }, [settleFrom, settleTo]);
  useEffect(() => { void loadSettlement(); }, [loadSettlement]);
  const [payAdmin, setPayAdmin] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("MTN");
  const [payRef, setPayRef] = useState("");
  const [payBusy, setPayBusy] = useState(false);
  const recordPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payAdmin || !payAmount) return;
    setPayBusy(true);
    try {
      await api("/api/owner/commission/settlement", {
        method: "POST",
        body: JSON.stringify({
          adminId: payAdmin,
          amount: Number(payAmount),
          method: payMethod,
          reference: payRef.trim() || undefined,
          periodFrom: settleFrom,
          periodTo: settleTo,
        }),
      });
      toast("Payout recorded — ledger and audit log updated", "win");
      setPayAmount("");
      setPayRef("");
      await loadSettlement();
      await loadOwnerLedger();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not record payout", "lose");
    } finally { setPayBusy(false); }
  };

  // P0 Batch 3 (O14): the global audit log — every admin/owner action,
  // append-only. Filter by actor, action, or date.
  interface AuditRow { id: string; actorId: string; actorName: string; actorRole: string; action: string; targetId: string | null; detail: string | null; createdAt: string }
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [auditActions, setAuditActions] = useState<{ action: string; count: number }[]>([]);
  const [auditActors, setAuditActors] = useState<{ id: string; name: string; role: string }[]>([]);
  const [auditActor, setAuditActor] = useState("");
  const [auditAction, setAuditAction] = useState("");
  const [auditFrom, setAuditFrom] = useState("");
  const [auditTo, setAuditTo] = useState("");
  const loadAudit = useCallback(async () => {
    try {
      const p = new URLSearchParams();
      if (auditActor) p.set("actor", auditActor);
      if (auditAction) p.set("action", auditAction);
      if (auditFrom) p.set("from", auditFrom);
      if (auditTo) p.set("to", auditTo);
      const qs = p.toString();
      const r = await api<{ rows: AuditRow[]; actions: { action: string; count: number }[]; actors: { id: string; name: string; role: string }[] }>(`/api/owner/audit-log${qs ? `?${qs}` : ""}`);
      setAudit(r.rows);
      setAuditActions(r.actions);
      setAuditActors(r.actors);
    } catch { setAudit([]); }
  }, [auditActor, auditAction, auditFrom, auditTo]);
  useEffect(() => { void loadAudit(); }, [loadAudit]);

  // P0 Batch 2 (O9/O10/O11): game catalogue — visibility, kill switch,
  // and per-game economics for all 46 games.
  interface OwnerGameCfg { slug: string; name: string; currency: string; visible: boolean; killed: boolean; minBet: number | null; maxBet: number | null; maxPayout: number | null; maxMultiplier: number; note: string }
  const [ownerGames, setOwnerGames] = useState<OwnerGameCfg[] | null>(null);
  const [ownerGamesQ, setOwnerGamesQ] = useState("");
  const [globalKill, setGlobalKill] = useState(false);
  const loadOwnerGames = useCallback(async () => {
    try {
      const g = await api<{ globalKill: boolean; games: OwnerGameCfg[] }>("/api/games/config");
      setOwnerGames(g.games);
      setGlobalKill(g.globalKill);
    } catch { setOwnerGames([]); }
  }, []);
  useEffect(() => { void loadOwnerGames(); }, [loadOwnerGames]);
  const toggleGlobalKill = async () => {
    const next = !globalKill;
    if (next && !window.confirm("Pause ALL games? No one can play until you resume them.")) return;
    try {
      await api("/api/owner/platform/kill", { method: "POST", body: JSON.stringify({ killed: next }) });
      toast(next ? "All games paused" : "All games resumed", next ? "lose" : "win");
      await loadOwnerGames();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Kill switch failed", "lose");
    }
  };
  const saveOwnerGame = async (slug: string, patch: Partial<OwnerGameCfg>) => {
    try {
      await api(`/api/owner/games/${slug}`, { method: "POST", body: JSON.stringify(patch) });
      toast("Game updated", "win");
      await loadOwnerGames();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Update failed", "lose");
    }
  };

  // P0 Batch 2 (O12): payment methods — enable/disable + per-method min/max.
  interface OwnerPayMethod { method: string; enabled: boolean; minDeposit: number | null; maxDeposit: number | null }
  const [ownerPay, setOwnerPay] = useState<OwnerPayMethod[] | null>(null);
  const loadOwnerPay = useCallback(async () => {
    try {
      setOwnerPay((await api<{ methods: OwnerPayMethod[] }>("/api/owner/payment-methods")).methods);
    } catch { setOwnerPay([]); }
  }, []);
  useEffect(() => { void loadOwnerPay(); }, [loadOwnerPay]);
  const saveOwnerPay = async (method: string, patch: Partial<OwnerPayMethod>) => {
    try {
      await api(`/api/owner/payment-methods/${method}`, { method: "POST", body: JSON.stringify(patch) });
      toast(`${method} updated`, "win");
      await loadOwnerPay();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Update failed", "lose");
    }
  };

  // P0 Batch 2 (O13): wallet config — the platform rules for both wallets.
  interface OwnerWalletCfg { globalKill: boolean; cashMinDeposit: number; cashMinStake: number; coinMinStake: number; conversionRate: number; coinsWithdrawable: boolean }
  const [ownerWallet, setOwnerWallet] = useState<OwnerWalletCfg | null>(null);
  const loadOwnerWallet = useCallback(async () => {
    try {
      setOwnerWallet(await api<OwnerWalletCfg>("/api/owner/wallet-config"));
    } catch { setOwnerWallet(null); }
  }, []);
  useEffect(() => { void loadOwnerWallet(); }, [loadOwnerWallet]);
  const saveOwnerWallet = async (patch: Partial<OwnerWalletCfg>) => {
    try {
      await api("/api/owner/wallet-config", { method: "POST", body: JSON.stringify(patch) });
      toast("Wallet config saved", "win");
      await loadOwnerWallet();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Update failed", "lose");
    }
  };

  // Per-admin referral link copy (first active code) — the admin's own
  // panel lives on the /admin routes; "Preview panel" links there with
  // ?preview=<adminId>.
  const copyAdminLink = (a: AdminRow) => {
    const c = a.codes.find((x) => x.active) ?? a.codes[0];
    if (!c) return;
    const link = `${window.location.origin}/?ref=${c.code}`;
    void copyText(link).then(() => {
      setCopiedId(a.id);
      toast("Referral link copied", "win");
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopiedId(null), 1600);
    }).catch(() => toast("Copy failed — long-press the link to copy it", "lose"));
  };
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pct, setPct] = useState(10);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    try {
      const a = await api<{ admins: AdminRow[] }>("/api/owner/admins");
      setAdmins(a.admins);
      setRollup(await api<{ days: RollupDay[]; totals: { deposits: number; totalAmount: number; totalCommission: number } }>("/api/owner/rollup"));
      setErr("");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not load owner panel.");
    }
  }, []);

  const loadDay = useCallback(async (d: string) => {
    try {
      const r = await api<{ date: string; admins: OwnerDayAdmin[]; totals: { deposits: number; totalAmount: number; totalCommission: number } }>(`/api/owner/commission?date=${d}`);
      setDayAdmins(r.admins);
      setDayTotals(r.totals);
    } catch {
      setDayAdmins(null);
      setDayTotals(null);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (date) void loadDay(date); }, [date, loadDay]);

  // P0 Batch 4 (O6): global player search state. These hooks MUST live
  // above the early returns below — hooks after `if (!user) return`
  // change the hook count between renders and crash the page (React #310).
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<OwnerSearchPlayer[] | null>(null);
  const [searchCount, setSearchCount] = useState(0);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchedQ, setSearchedQ] = useState("");

  if (!user) {
    return (
      <main className="rg48-page-main"><div className="wrap">
        <h2>Owner <em>panel</em></h2>
        <p>Log in as the owner to see this panel.</p>
        <button className="btn btn-gold" type="button" onClick={() => openAuth("login")}>Log in</button>
      </div></main>
    );
  }
  if (err) {
    return (
      <main className="rg48-page-main"><div className="wrap">
        <h2>Owner <em>panel</em></h2>
        <p className="rg48-err">{err}</p>
        <p>Only the owner can open this panel.</p>
      </div></main>
    );
  }

  const addAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/owner/admins", { method: "POST", body: JSON.stringify({ name: name.trim(), email: email.trim(), password, commissionPct: pct }) });
      setName(""); setEmail(""); setPassword(""); setPct(10);
      toast("Admin added", "win");
      await load();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not add admin", "lose");
    } finally { setBusy(false); }
  };

  const savePct = async (id: string) => {
    const v = editing[id];
    if (v === undefined) return;
    try {
      await api(`/api/owner/admins/${id}`, { method: "PATCH", body: JSON.stringify({ commissionPct: v }) });
      toast("Commission % updated — future deposits only", "win");
      await load();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Update failed", "lose");
    }
  };
  const toggleActive = async (a: AdminRow) => {
    try {
      await api(`/api/owner/admins/${a.id}`, { method: "PATCH", body: JSON.stringify({ active: !a.active }) });
      toast(a.active ? "Admin deactivated" : "Admin reactivated", "win");
      await load();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Update failed", "lose");
    }
  };

  // P0 Batch 4 (O6): global player search — every player platform-wide
  // by name, email, or phone. The search runs on submit, not on mount.
  const runPlayerSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQ.trim();
    if (q.length < 2) { toast("Type at least 2 characters to search", "lose"); return; }
    setSearchBusy(true);
    try {
      const r = await api<{ q: string; count: number; players: OwnerSearchPlayer[] }>(`/api/owner/players/search?q=${encodeURIComponent(q)}`);
      setSearchResults(r.players);
      setSearchCount(r.count);
      setSearchedQ(r.q);
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Search failed", "lose");
      setSearchResults([]);
    } finally { setSearchBusy(false); }
  };
  // A referred player opens in the owner's preview of that admin's
  // panel; a player with no referring admin opens directly (the player
  // detail tolerates an owner with no preview).
  const playerDetailHref = (p: OwnerSearchPlayer) =>
    p.referringAdmin ? `/admin/players/${p.id}?preview=${p.referringAdmin.id}` : `/admin/players/${p.id}`;

  return (
    <main className="rg48-page-main">
      <div className="wrap">
        <div className="rg48-hbar-in">
          <Link className="gp-back" href="/" aria-label="Back"><span className="gp-back-coin">←</span></Link>
          <h2>Owner <em>panel</em></h2>
        </div>

        <section className="admin-sec">
          <h3>Overall totals</h3>
          {/* Round 31: was one plain sentence; now 3 stat tiles, same
              .sum-card style as the commission tiles below. */}
          {rollup && (
            <div className="sum-cards">
              <div className="sum-card"><span>Deposits</span><b>{rollup.totals.deposits}</b></div>
              <div className="sum-card"><span>Total deposited</span><b>{fmtCash(rollup.totals.totalAmount)}</b></div>
              <div className="sum-card"><span>Commission</span><b>{fmtCash(rollup.totals.totalCommission)}</b></div>
            </div>
          )}
        </section>

        <section className="admin-sec">
          <h3>Add admin</h3>
          <form className="owner-add" onSubmit={addAdmin}>
            <input type="text" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            <label>Commission % <input type="number" min={0} max={100} value={pct} onChange={(e) => setPct(Number(e.target.value))} /></label>
            <button className="btn btn-gold" type="submit" disabled={busy}>{busy ? "Adding…" : "Add admin"}</button>
          </form>
        </section>

        <section className="admin-sec">
          <h3>All admins ({admins.length})</h3>
          {admins.map((a) => (
            <div key={a.id} className="admin-row">
              <div>
                <b>{a.name}</b> <span>{a.email}</span> <span className={a.active ? "ok" : "bad"}>{a.active ? "Active" : "Deactivated"}</span>
                <div className="admin-meta">Codes: {a.codes.map((c) => c.code).join(", ") || "—"} · Referrals: {a.referralCount} · Coins given: {a.coinsGiven} · Commission all-time: {fmtCash(a.commissionAllTime)}</div>
              </div>
              <div className="admin-edit">
                <label>% <input type="number" min={0} max={100} defaultValue={a.commissionPct ?? 0} onChange={(e) => setEditing((ed) => ({ ...ed, [a.id]: Number(e.target.value) }))} /></label>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => void savePct(a.id)}>Save %</button>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => void toggleActive(a)}>{a.active ? "Deactivate" : "Reactivate"}</button>
                {a.codes.length > 0 && (
                  <button className={`btn btn-ghost btn-sm${copiedId === a.id ? " done" : ""}`} type="button" onClick={() => copyAdminLink(a)}>
                    {copiedId === a.id ? "Copied ✓" : "Copy referral link"}
                  </button>
                )}
                <Link className="btn btn-gold btn-sm" href={`/admin?preview=${a.id}`}>Preview panel</Link>
              </div>
              <OwnerAdminPerms a={a} onSaved={load} />
            </div>
          ))}
        </section>

        <section className="admin-sec">
          <h3>Player search</h3>
          <p className="rg48-sub">Every player on the platform — search by name, email, or phone.</p>
          <form className="b4-search" onSubmit={runPlayerSearch}>
            <input type="search" placeholder="Search players…" value={searchQ} onChange={(e) => setSearchQ(e.target.value)} aria-label="Search players by name, email or phone" />
            <button className="btn btn-gold" type="submit" disabled={searchBusy}>{searchBusy ? "Searching…" : "Search"}</button>
          </form>
          {searchResults === null ? null : searchResults.length === 0 ? (
            <p>No players match “{searchedQ}”.</p>
          ) : (
            <>
              <p className="rg48-sub">{searchCount} {searchCount === 1 ? "player" : "players"} found for “{searchedQ}”.</p>
              <div className="rg48-twrap">
                <table className="dep-table">
                  <thead><tr><th>Player</th><th>Contact</th><th>Role</th><th>Referring admin</th><th>Deposited</th><th>Cash</th><th>Coins</th></tr></thead>
                  <tbody>
                    {searchResults.map((p) => (
                      <tr key={p.id}>
                        <td><Link href={playerDetailHref(p)}>{p.name}</Link></td>
                        <td>{p.email || p.phone || "—"}</td>
                        <td>{p.role}</td>
                        <td>{p.referringAdmin?.name || "—"}</td>
                        <td>{fmtCash(p.totalDeposited)}</td>
                        <td>{fmtCash(p.cash)}</td>
                        <td>{p.coins}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <section className="admin-sec">
          <h3>Withdrawals{ownerWdPending > 0 ? ` (${ownerWdPending} pending)` : ""}</h3>
          <p className="rg48-sub">Every pending withdrawal, platform-wide. Requests only — no real money moves. Large amounts (over GH₵ 500) need your second approval after the admin’s.</p>
          <div className="money-chips" role="group" aria-label="Filter by status">
            <button type="button" className={!ownerWdStatus ? "on" : ""} onClick={() => setOwnerWdStatus("")}>All</button>
            {["pending", "admin_approved", "approved", "rejected"].map((s) => (
              <button key={s} type="button" className={ownerWdStatus === s ? "on" : ""} onClick={() => setOwnerWdStatus(s)}>{s === "admin_approved" ? "Awaiting owner" : s[0].toUpperCase() + s.slice(1)}</button>
            ))}
          </div>
          {ownerWd === null ? <p>Loading withdrawals…</p> : ownerWd.length === 0 ? (
            <p>No withdrawal requests.</p>
          ) : (
            <div className="wd-list">
              {ownerWd.map((w) => (
                <div key={w.id} className="wd-row">
                  <div className="wd-main">
                    <b>{w.userName}</b><span>{w.userContact || ""}</span>
                    <span className="wd-amt">{fmtCash(w.amount)} · {w.method}</span>
                    <span className="wd-date">{w.adminName ? `via ${w.adminName} · ` : ""}{new Date(w.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <span className={`wd-status wd-${w.status}`}>{w.status === "admin_approved" ? "Awaiting owner" : w.status}</span>
                  {w.reason ? <p className="wd-reason">Reason: {w.reason}</p> : null}
                  {(w.status === "pending" || w.status === "admin_approved") && (
                    <div className="wd-actions">
                      {w.status === "admin_approved" ? <span className="wd-note">Admin approved — your approval makes it final.</span> : null}
                      <button className="btn btn-gold btn-sm" type="button" disabled={ownerWdBusy === w.id} onClick={() => void decideOwnerWd(w, "approve")}>Approve</button>
                      <button className="btn btn-ghost btn-sm" type="button" disabled={ownerWdBusy === w.id} onClick={() => void decideOwnerWd(w, "reject")}>Reject</button>
                    </div>
                  )}
                  {ownerRejectId === w.id && (
                    <div className="wd-reject">
                      <input type="text" placeholder="Reason for rejection (required)" value={ownerRejectReason} onChange={(e) => setOwnerRejectReason(e.target.value)} aria-label="Rejection reason" />
                      <button className="btn btn-gold btn-sm" type="button" disabled={ownerWdBusy === w.id} onClick={() => void decideOwnerWd(w, "reject")}>Confirm reject</button>
                      <button className="btn btn-ghost btn-sm" type="button" onClick={() => { setOwnerRejectId(null); setOwnerRejectReason(""); }}>Cancel</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="admin-sec ow-commission">
          <h3>Commission</h3>
          <div className="ow-tabs" role="tablist" aria-label="Commission views">
            <button type="button" role="tab" id="ow-tab-per-day" aria-selected={tab === "per-day"} aria-controls="ow-panel-per-day" className={`ow-tab${tab === "per-day" ? " ow-tab-active" : ""}`} onClick={() => setTab("per-day")}>Per-day</button>
            <button type="button" role="tab" id="ow-tab-rollup" aria-selected={tab === "rollup"} aria-controls="ow-panel-rollup" className={`ow-tab${tab === "rollup" ? " ow-tab-active" : ""}`} onClick={() => setTab("rollup")}>All-admins rollup</button>
          </div>
          {tab === "per-day" ? (
            <div role="tabpanel" id="ow-panel-per-day" aria-labelledby="ow-tab-per-day">
              <label className="date-pick">Pick a day <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} /></label>
              {dayTotals && (
                <>
                  <div className="sum-cards">
                    <div className="sum-card"><span>Deposits</span><b>{dayTotals.deposits}</b></div>
                    <div className="sum-card"><span>Total deposited</span><b>{fmtCash(dayTotals.totalAmount)}</b></div>
                    <div className="sum-card"><span>Commission</span><b>{fmtCash(dayTotals.totalCommission)}</b></div>
                  </div>
                  <p className="ow-day-cap">Commission on {date}</p>
                </>
              )}
              {dayAdmins && dayAdmins.length === 0 && <p className="bh-empty">No deposits that day.</p>}
              {dayAdmins?.map((da) => (
                <div key={da.admin.id} className="day-admin">
                  <h4>{da.admin.name} — {fmtCash(da.totalAmount)} · {fmtCash(da.totalCommission)} commission</h4>
                  <div className="rg48-twrap">
                    <table className="dep-table">
                      <thead><tr><th>User</th><th>Contact</th><th>Amount</th><th>Time</th><th>Method</th><th>Commission</th></tr></thead>
                      <tbody>
                        {da.deposits.map((d) => (
                          <tr key={d.id}><td>{d.userName}</td><td>{d.userContact}</td><td>{fmtCash(d.amount)}</td><td>{new Date(d.time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</td><td>{d.method}</td><td>{fmtCash(d.commission)} ({d.pctInForce}%)</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div role="tabpanel" id="ow-panel-rollup" aria-labelledby="ow-tab-rollup">
              {!rollup || rollup.days.length === 0 ? <p>No commission days yet.</p> : (
                <div className="rg48-twrap">
                  <table className="dep-table">
                    <thead><tr><th>Date</th><th>Admin</th><th>Deposits</th><th>Total deposited</th><th>Commission</th></tr></thead>
                    <tbody>
                      {rollup.days.map((d, i) => (
                        <tr key={`${d.date}-${d.adminId}-${i}`}><td>{d.date}</td><td>{d.adminName}</td><td>{d.deposits}</td><td>{fmtCash(d.totalAmount)}</td><td>{fmtCash(d.totalCommission)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="admin-sec">
          <h3>Commission rules</h3>
          <p className="rg48-sub">Commission is no longer a flat % of deposits. A rule pays an admin on their players’ ACTIVITY: RevShare = % of net loss (stakes − payouts), Turnover = % of total stakes. The rule in force on a day is what that day pays — past days stay frozen. A day with no rule uses the old flat % of deposits.</p>
          <form className="owner-add" onSubmit={saveRule}>
            <select value={ruleAdmin} onChange={(e) => setRuleAdmin(e.target.value)} aria-label="Admin (blank = global default)">
              <option value="">Global default (every admin)</option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <select value={ruleModel} onChange={(e) => setRuleModel(e.target.value as "revshare" | "turnover")} aria-label="Model">
              <option value="revshare">RevShare — % of net loss</option>
              <option value="turnover">Turnover — % of stakes</option>
            </select>
            <label>Rate % <input type="number" min={0} max={100} step={0.5} value={ruleRate} onChange={(e) => setRuleRate(Number(e.target.value))} /></label>
            <label>From <input type="date" value={ruleFrom} max={todayStr()} onChange={(e) => setRuleFrom(e.target.value)} /></label>
            <button className="btn btn-gold" type="submit" disabled={ruleBusy}>{ruleBusy ? "Saving…" : "Save rule"}</button>
          </form>
          {rules === null ? <p>Loading rules…</p> : rules.length === 0 ? (
            <p>No rules yet — every admin is on the legacy flat % of deposits.</p>
          ) : (
            <div className="rg48-twrap">
              <table className="dep-table">
                <thead><tr><th>Applies to</th><th>Model</th><th>Rate</th><th>From</th></tr></thead>
                <tbody>
                  {rules.map((r) => (
                    <tr key={r.id}>
                      <td>{r.adminName ?? "Global default"}</td>
                      <td>{r.model === "revshare" ? "RevShare" : "Turnover"}</td>
                      <td>{r.rate}%</td>
                      <td>{r.effectiveFrom}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="admin-sec">
          <h3>Settlement</h3>
          <p className="rg48-sub">Commission owed, paid and still owing per admin — recomputed from the same ledger as the revenue, so the numbers cannot disagree. Recording a payout writes it to the ledger and the audit log and drops the balance.</p>
          <div className="money-dates">
            <label>From <input type="date" value={settleFrom} max={todayStr()} onChange={(e) => setSettleFrom(e.target.value)} /></label>
            <label>To <input type="date" value={settleTo} max={todayStr()} onChange={(e) => setSettleTo(e.target.value)} /></label>
          </div>
          {settlement === null ? <p>Loading settlement…</p> : (
            <>
              <div className="sum-cards">
                <div className="sum-card"><span>Owed</span><b>{fmtCash(settlement.totals.owed)}</b></div>
                <div className="sum-card"><span>Paid</span><b>{fmtCash(settlement.totals.paid)}</b></div>
                <div className="sum-card"><span>Balance</span><b>{fmtCash(settlement.totals.balance)}</b></div>
              </div>
              {settlement.rows.length === 0 ? <p>No admins yet.</p> : (
                <div className="rg48-twrap">
                  <table className="dep-table">
                    <thead><tr><th>Admin</th><th>Owed</th><th>Paid</th><th>Balance</th></tr></thead>
                    <tbody>
                      {settlement.rows.map((r) => (
                        <tr key={r.adminId}>
                          <td>{r.adminName}{r.active ? "" : " (deactivated)"}</td>
                          <td>{fmtCash(r.owed)}</td>
                          <td>{fmtCash(r.paid)}</td>
                          <td>{fmtCash(r.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
          <form className="owner-add" onSubmit={recordPayout}>
            <select value={payAdmin} onChange={(e) => setPayAdmin(e.target.value)} aria-label="Admin to pay" required>
              <option value="">Pay admin…</option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <label>Amount GH₵ <input type="number" min={0.01} step={0.01} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="0.00" required /></label>
            <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} aria-label="Method">
              {["MTN", "Telecel", "AirtelTigo", "bank", "cash"].map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <input type="text" placeholder="Reference (optional)" value={payRef} onChange={(e) => setPayRef(e.target.value)} />
            <button className="btn btn-gold" type="submit" disabled={payBusy || !payAdmin || !payAmount}>{payBusy ? "Recording…" : "Record payout"}</button>
          </form>
        </section>

        <section className="admin-sec">
          <h3>Audit log</h3>
          <p className="rg48-sub">Every admin and owner action, platform-wide. Append-only — nothing edits or deletes these rows.</p>
          <div className="money-filters">
            <div className="money-dates">
              <label>Actor
                <select value={auditActor} onChange={(e) => setAuditActor(e.target.value)} aria-label="Filter by actor">
                  <option value="">Everyone</option>
                  {auditActors.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} ({a.role})</option>
                  ))}
                </select>
              </label>
              <label>Action
                <select value={auditAction} onChange={(e) => setAuditAction(e.target.value)} aria-label="Filter by action">
                  <option value="">All actions</option>
                  {auditActions.map((a) => (
                    <option key={a.action} value={a.action}>{a.action} ({a.count})</option>
                  ))}
                </select>
              </label>
              <label>From <input type="date" value={auditFrom} max={todayStr()} onChange={(e) => setAuditFrom(e.target.value)} /></label>
              <label>To <input type="date" value={auditTo} max={todayStr()} onChange={(e) => setAuditTo(e.target.value)} /></label>
            </div>
          </div>
          {audit === null ? <p>Loading audit log…</p> : audit.length === 0 ? (
            <p>No actions match.</p>
          ) : (
            <div className="rg48-twrap">
              <table className="dep-table">
                <thead><tr><th>Actor</th><th>Action</th><th>Detail</th><th>Time</th></tr></thead>
                <tbody>
                  {audit.map((r) => (
                    <tr key={r.id}>
                      <td>{r.actorName} ({r.actorRole})</td>
                      <td>{r.action}</td>
                      <td>{r.detail || "—"}</td>
                      <td>{new Date(r.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="admin-sec">
          <h3>Ledger</h3>
          <p className="rg48-sub">Every money movement, platform-wide — deposits, bets, withdrawals, adjustments, conversions. Built only from rows the tables actually hold.</p>
          <div className="money-filters">
            <label className="players-search">
              <input type="search" placeholder="Search by player or contact" value={ownerLedQ} onChange={(e) => setOwnerLedQ(e.target.value)} aria-label="Search ledger" />
            </label>
            <div className="money-chips" role="group" aria-label="Filter by type">
              <button type="button" className={!ownerLedType ? "on" : ""} onClick={() => setOwnerLedType("")}>All types</button>
              {["deposit", "bet", "withdrawal", "adjustment", "conversion", "payout"].map((t) => (
                <button key={t} type="button" className={ownerLedType === t ? "on" : ""} onClick={() => setOwnerLedType(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
              ))}
            </div>
            <div className="money-dates">
              <label>From <input type="date" value={ownerLedFrom} max={todayStr()} onChange={(e) => setOwnerLedFrom(e.target.value)} /></label>
              <label>To <input type="date" value={ownerLedTo} max={todayStr()} onChange={(e) => setOwnerLedTo(e.target.value)} /></label>
              <label>Admin
                <select value={ownerLedAdmin} onChange={(e) => setOwnerLedAdmin(e.target.value)} aria-label="Filter by admin">
                  <option value="">All admins</option>
                  {admins.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          {ownerLedTotals && (
            <div className="sum-cards">
              <div className="sum-card"><span>Rows</span><b>{ownerLedTotals.rows}</b></div>
              <div className="sum-card"><span>Cash in</span><b>{fmtCash(ownerLedTotals.cashIn)}</b></div>
              <div className="sum-card"><span>Cash out</span><b>{fmtCash(ownerLedTotals.cashOut)}</b></div>
            </div>
          )}
          {ownerLedger === null ? <p>Loading ledger…</p> : ownerLedger.length === 0 ? (
            <p>No money movements yet.</p>
          ) : (
            <div className="ledger-list">
              {ownerLedger.map((r) => {
                const sign = r.amount > 0 ? "+" : r.amount < 0 ? "−" : "";
                const abs = Math.abs(r.amount);
                const amt = r.wallet === "coins" ? `${sign}${Math.round(abs)} coins` : `${sign}${fmtCash(abs)}`;
                return (
                  <div key={r.id} className="ledger-row">
                    <span className="ledger-txt">
                      <b>{r.userName} <span className={`ledger-type ledger-${r.type}`}>{r.type}</span></b>
                      <span>{r.detail}{r.reason ? ` — ${r.reason}` : ""}{r.status ? ` · ${r.status}` : ""}{r.adminName ? ` · ${r.adminName}` : ""}</span>
                      <span>{new Date(r.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    </span>
                    <b className={r.amount >= 0 ? "ledger-in" : "ledger-out"}>{amt}</b>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="admin-sec">
          <h3>Profit &amp; loss</h3>
          <p className="rg48-sub">Gross gaming revenue, deposits, approved withdrawals, commissions owed, and net profit — all from the real tables, nothing invented.</p>
          <div className="money-chips" role="group" aria-label="P&L period">
            {(["today", "week", "month", "custom"] as const).map((p) => (
              <button key={p} type="button" className={pnlPreset === p ? "on" : ""} onClick={() => setPnlPreset(p)}>
                {p === "today" ? "Today" : p === "week" ? "Last 7 days" : p === "month" ? "This month" : "Custom"}
              </button>
            ))}
          </div>
          {pnlPreset === "custom" && (
            <div className="money-dates">
              <label>From <input type="date" value={pnlFrom} max={todayStr()} onChange={(e) => setPnlFrom(e.target.value)} /></label>
              <label>To <input type="date" value={pnlTo} max={todayStr()} onChange={(e) => setPnlTo(e.target.value)} /></label>
            </div>
          )}
          {pnl === null ? <p>Loading P&amp;L…</p> : (
            <>
              <div className="sum-cards">
                <div className="sum-card"><span>GGR (cash)</span><b>{fmtCash(pnl.ggrCash)}</b></div>
                <div className="sum-card"><span>Deposits</span><b>{fmtCash(pnl.deposits)}</b></div>
                <div className="sum-card"><span>Withdrawals (approved)</span><b>{fmtCash(pnl.withdrawals)}</b></div>
                <div className="sum-card"><span>Commissions owed</span><b>{fmtCash(pnl.commissions)}</b></div>
                <div className="sum-card"><span>Net profit</span><b>{fmtCash(pnl.netProfit)}</b></div>
              </div>
              <p className="ow-day-cap">
                {pnl.roundsCash} cash rounds ({fmtCash(pnl.stakesCash)} staked − {fmtCash(pnl.payoutsCash)} paid out) · {pnl.roundsCoins} coin rounds ({pnl.stakesCoins} staked − {pnl.payoutsCoins} paid out, GGR {pnl.ggrCoins} coins) · {pnl.depositsCount} deposits · {pnl.withdrawalsCount} approved withdrawals.
              </p>
              <p className="ow-day-cap">{pnl.formula}</p>
            </>
          )}
        </section>

        <section className="admin-sec">
          <h3>Games ({ownerGames ? ownerGames.length : "…"})</h3>
          <p className="rg48-sub">Hide a game to take it off the games page, kill one to stop all play on it at once. Economics are per game — empty means the catalogue default, and a max payout above the cap is cut down to it, never rejected.</p>
          <div className="ow-killbar">
            <div>
              <b>Global kill switch</b>
              <span>{globalKill ? " ALL games are paused right now." : " All games live."}</span>
            </div>
            <button type="button" className={`btn ${globalKill ? "btn-danger" : "btn-ghost"}`} onClick={() => void toggleGlobalKill()}>
              {globalKill ? "Resume all games" : "Pause all games"}
            </button>
          </div>
          <label className="players-search">
            <input type="search" placeholder="Search games…" value={ownerGamesQ} onChange={(e) => setOwnerGamesQ(e.target.value)} aria-label="Search games" />
          </label>
          {ownerGames === null ? <p>Loading games…</p> : (
            <div className="ow-games">
              {ownerGames
                .filter((g) => !ownerGamesQ.trim() || g.name.toLowerCase().includes(ownerGamesQ.trim().toLowerCase()))
                .map((g) => (
                  <OwnerGameRow key={g.slug} g={g} onSave={saveOwnerGame} />
                ))}
              {ownerGames.filter((g) => !ownerGamesQ.trim() || g.name.toLowerCase().includes(ownerGamesQ.trim().toLowerCase())).length === 0 && (
                <p>No games match that search.</p>
              )}
            </div>
          )}
        </section>

        <section className="admin-sec">
          <h3>Payment methods</h3>
          <p className="rg48-sub">Which deposit methods are live, and their per-method limits. Demo cashier only — this connects no gateway.</p>
          {ownerPay === null ? <p>Loading payment methods…</p> : (
            <div className="ow-games">
              {ownerPay.map((m) => (
                <OwnerPayRow key={m.method} m={m} onSave={saveOwnerPay} />
              ))}
            </div>
          )}
        </section>

        <section className="admin-sec">
          <h3>Wallet config</h3>
          <p className="rg48-sub">The platform rules for both wallets. The conversion rate is enforced server-side; the wallet card still reads GH₵5 = 1 coin until its text is updated.</p>
          {ownerWallet === null ? <p>Loading wallet config…</p> : (
            <OwnerWalletForm key={JSON.stringify(ownerWallet)} w={ownerWallet} onSave={saveOwnerWallet} />
          )}
        </section>
      </div>
    </main>
  );
}
