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
  // P1 Batch 4 (O24): the admin's parent admin (a senior agent), if any.
  parentAdminId: string | null; parentName: string | null;
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
  interface CommissionRuleRow { id: string; adminId: string | null; adminName: string | null; model: string; rate: number; parentSharePct: number; effectiveFrom: string; createdAt: string }
  const [rules, setRules] = useState<CommissionRuleRow[] | null>(null);
  const [ruleAdmin, setRuleAdmin] = useState("");
  const [ruleModel, setRuleModel] = useState<"revshare" | "turnover">("revshare");
  const [ruleRate, setRuleRate] = useState(10);
  // P1 Batch 4 (O24): the parent's share % of this admin's commission —
  // a REPORTING line on the settlement, never a deduction.
  const [ruleParentShare, setRuleParentShare] = useState(0);
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
        body: JSON.stringify({ adminId: ruleAdmin || null, model: ruleModel, rate: ruleRate, parentSharePct: ruleParentShare, effectiveFrom: ruleFrom }),
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
  interface SettlementRow { adminId: string; adminName: string; adminEmail: string | null; active: boolean; owed: number; paid: number; balance: number; parentAdminId: string | null; parentName: string | null; parentShare: number }
  const [settleFrom, setSettleFrom] = useState("");
  const [settleTo, setSettleTo] = useState("");
  useEffect(() => {
    const today = todayStr();
    setSettleFrom(`${today.slice(0, 8)}01`);
    setSettleTo(today);
  }, []);
  const [settlement, setSettlement] = useState<{ from: string; to: string; rows: SettlementRow[]; totals: { owed: number; paid: number; balance: number; parentShare: number } } | null>(null);
  const loadSettlement = useCallback(async () => {
    if (!settleFrom || !settleTo) return;
    try {
      const r = await api<{ from: string; to: string; rows: SettlementRow[]; totals: { owed: number; paid: number; balance: number; parentShare: number } }>(`/api/owner/commission/settlement?from=${settleFrom}&to=${settleTo}`);
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

  // P1 Batch 3 (O16/O17): revenue breakdowns + RTP monitor — one shared
  // period, so the two sections always agree on the dates they show.
  interface RevenueGameRow { game: string; name: string; currency: string; rounds: number; stakes: number; payouts: number; ggr: number }
  interface RevenueAdminRow { adminId: string | null; adminName: string; deposits: number; totalDeposited: number; commission: number; ggr: number }
  interface RevenueDayRow { date: string; ggr: number; deposits: number; totalDeposited: number; commission: number }
  interface RevenueMethodRow { method: string; deposits: number; total: number }
  interface RevenueData { from: string; to: string; byGameCash: RevenueGameRow[]; byGameCoins: RevenueGameRow[]; byAdmin: RevenueAdminRow[]; byDay: RevenueDayRow[]; byMethod: RevenueMethodRow[]; totals: { ggrCash: number; ggrCoins: number; deposits: number; totalDeposited: number; commission: number } }
  interface RtpRow { slug: string; name: string; currency: string; rounds: number; stakes: number; payouts: number; actualRtp: number | null; baseRtp: number | null; status: string }
  const [anPreset, setAnPreset] = useState<"today" | "week" | "month" | "custom">("month");
  const [anFrom, setAnFrom] = useState("");
  const [anTo, setAnTo] = useState("");
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [rtp, setRtp] = useState<{ from: string; to: string; rows: RtpRow[] } | null>(null);
  const loadAnalytics = useCallback(async () => {
    const today = todayStr();
    let from = today;
    let to = today;
    if (anPreset === "week") {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - 6);
      from = d.toISOString().slice(0, 10);
    } else if (anPreset === "month") {
      from = `${today.slice(0, 8)}01`;
    } else if (anPreset === "custom") {
      from = anFrom || today;
      to = anTo || today;
    }
    try {
      const [rev, r] = await Promise.all([
        api<RevenueData>(`/api/owner/revenue?from=${from}&to=${to}`),
        api<{ from: string; to: string; rows: RtpRow[] }>(`/api/owner/rtp?from=${from}&to=${to}`),
      ]);
      setRevenue(rev);
      setRtp(r);
    } catch { setRevenue(null); setRtp(null); }
  }, [anPreset, anFrom, anTo]);
  useEffect(() => { void loadAnalytics(); }, [loadAnalytics]);

  // P1 Batch 3 (O18): the global fraud console — same signals as the
  // admin fraud pages, over every player, with per-admin rollups.
  interface OwnerFraudAlert { id: string; severity: string; signal: string; userId: string; userName: string; userContact: string | null; reason: string; createdAt: string }
  interface OwnerFraudRollup { adminId: string | null; adminName: string; high: number; medium: number; total: number }
  const [ownerFraud, setOwnerFraud] = useState<{ alerts: OwnerFraudAlert[]; counts: { high: number; medium: number }; byAdmin: OwnerFraudRollup[] } | null>(null);
  const loadOwnerFraud = useCallback(async () => {
    try {
      setOwnerFraud(await api<{ alerts: OwnerFraudAlert[]; counts: { high: number; medium: number }; byAdmin: OwnerFraudRollup[] }>("/api/owner/fraud"));
    } catch { setOwnerFraud(null); }
  }, []);
  useEffect(() => { void loadOwnerFraud(); }, [loadOwnerFraud]);

  // P1 Batch 3 (O19): the promotion engine — the owner's campaigns.
  interface PromoRow { id: string; name: string; type: string; percent: number; cap: number | null; coinAmount: number | null; trigger: string | null; startAt: string; endAt: string | null; targetAdminId: string | null; targetAdminName: string | null; active: boolean; grants: number; createdAt: string }
  interface PromoGrantRow { id: string; promotionId: string; promotionName: string; userId: string; userName: string; amount: number; wallet: string; day: string; createdAt: string }
  const [promos, setPromos] = useState<PromoRow[] | null>(null);
  const [promoGrants, setPromoGrants] = useState<PromoGrantRow[] | null>(null);
  const loadPromos = useCallback(async () => {
    try {
      const r = await api<{ promotions: PromoRow[]; recentGrants: PromoGrantRow[] }>("/api/owner/promotions");
      setPromos(r.promotions);
      setPromoGrants(r.recentGrants);
    } catch { setPromos([]); setPromoGrants([]); }
  }, []);
  useEffect(() => { void loadPromos(); }, [loadPromos]);
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
  const [cbResult, setCbResult] = useState<{ promotionId: string; date: string; paid: number; total: number } | null>(null);
  // Dates start empty and are set on mount (calling new Date() during
  // render breaks the prerender — the same rule as the other pickers).
  useEffect(() => { setPromoStart(todayStr()); setCbDate(todayStr()); }, []);

  // P1 Batch 4 (O20–O25): owner platform — announcements, platform
  // settings & branding, KYC/AML settings, support oversight, agent
  // hierarchy, cashier. These hooks MUST live above the early returns
  // below — hooks after `if (!user) return` change the hook count
  // between renders and crash the page (React #310).
  // O20: announcements & banners (text only — no images, no links).
  interface AnnouncementRow { id: string; title: string; body: string; audience: string; active: boolean; startsAt: string; endsAt: string | null; createdByName: string | null; createdAt: string }
  const [announcements, setAnnouncements] = useState<AnnouncementRow[] | null>(null);
  const [annTitle, setAnnTitle] = useState("");
  const [annBody, setAnnBody] = useState("");
  const [annAudience, setAnnAudience] = useState<"all" | "players" | "admins">("all");
  const [annStartsAt, setAnnStartsAt] = useState("");
  const [annEndsAt, setAnnEndsAt] = useState("");
  const [annBusy, setAnnBusy] = useState(false);
  const [annToggleBusy, setAnnToggleBusy] = useState<string | null>(null);
  const loadAnnouncements = useCallback(async () => {
    try {
      const r = await api<{ announcements: AnnouncementRow[] }>("/api/owner/announcements");
      setAnnouncements(r.announcements);
    } catch { setAnnouncements([]); }
  }, []);
  useEffect(() => { void loadAnnouncements(); }, [loadAnnouncements]);
  useEffect(() => { setAnnStartsAt(todayStr()); }, []);
  // O21: platform settings & branding — site name, support contact,
  // maintenance mode (the money fields live in Wallet config).
  interface PlatSettings { siteName: string; supportContact: string; maintenanceMode: boolean }
  const [platSettings, setPlatSettings] = useState<PlatSettings | null>(null);
  const [platSiteName, setPlatSiteName] = useState("");
  const [platSupport, setPlatSupport] = useState("");
  const [platMaint, setPlatMaint] = useState(false);
  const [platBusy, setPlatBusy] = useState(false);
  const loadPlatSettings = useCallback(async () => {
    try {
      const r = await api<{ settings: PlatSettings }>("/api/owner/platform/settings");
      setPlatSettings(r.settings);
      setPlatSiteName(r.settings.siteName);
      setPlatSupport(r.settings.supportContact);
      setPlatMaint(r.settings.maintenanceMode);
    } catch { setPlatSettings(null); }
  }, []);
  useEffect(() => { void loadPlatSettings(); }, [loadPlatSettings]);
  // O22: KYC/AML settings — accepted document types, the auto-approve
  // rule (URL-host allow-list), and the withdrawal KYC threshold.
  interface KycSettingsRow { acceptedTypes: string[]; autoApprove: boolean; autoApproveHosts: string[]; withdrawalKycThreshold: number }
  const KYC_TYPES = [
    { type: "national_id", label: "National ID" },
    { type: "passport", label: "Passport" },
    { type: "drivers_licence", label: "Driver's licence" },
  ];
  const [kycSettings, setKycSettings] = useState<KycSettingsRow | null>(null);
  const [kycTypesSel, setKycTypesSel] = useState<string[]>(["national_id", "passport", "drivers_licence"]);
  const [kycAuto, setKycAuto] = useState(false);
  const [kycHosts, setKycHosts] = useState("");
  const [kycThreshold, setKycThreshold] = useState("0");
  const [kycBusy, setKycBusy] = useState(false);
  const loadKycSettings = useCallback(async () => {
    try {
      const r = await api<{ settings: KycSettingsRow }>("/api/owner/kyc-settings");
      setKycSettings(r.settings);
      setKycTypesSel(r.settings.acceptedTypes);
      setKycAuto(r.settings.autoApprove);
      setKycHosts(r.settings.autoApproveHosts.join(", "));
      setKycThreshold(String(r.settings.withdrawalKycThreshold));
    } catch { setKycSettings(null); }
  }, []);
  useEffect(() => { void loadKycSettings(); }, [loadKycSettings]);
  // O23: support oversight — every open ticket + per-admin stats.
  interface SupportTicketRow { id: string; subject: string; status: string; userId: string; userName: string; userContact: string | null; adminId: string | null; adminName: string | null; messages: number; createdAt: string; updatedAt: string; ageHours: number }
  interface SupportAdminStats { adminId: string; adminName: string; open: number; answered: number; closed: number; unanswered: number; avgFirstResponseHours: number | null }
  const [support, setSupport] = useState<{ openTickets: SupportTicketRow[]; stats: SupportAdminStats[]; totals: { open: number; answered: number; closed: number; unanswered: number } } | null>(null);
  // Per-ticket reassign target (ticket id → admin id).
  const [reassignSel, setReassignSel] = useState<Record<string, string>>({});
  const [reassignBusy, setReassignBusy] = useState<string | null>(null);
  const loadSupport = useCallback(async () => {
    try {
      setSupport(await api<{ openTickets: SupportTicketRow[]; stats: SupportAdminStats[]; totals: { open: number; answered: number; closed: number; unanswered: number } }>("/api/owner/tickets"));
    } catch { setSupport(null); }
  }, []);
  useEffect(() => { void loadSupport(); }, [loadSupport]);
  // O24: the parent picker per admin — the select's value is the admin's
  // current parent; changing it saves at once. One busy id at a time.
  const [parentBusy, setParentBusy] = useState<string | null>(null);
  // O25: cashier / gateway balances — per-method totals + reconciliation.
  interface CashierMethodRow { method: string; deposited: number; withdrawn: number; net: number }
  interface CashierData { perMethod: CashierMethodRow[]; totals: { deposited: number; withdrawn: number; net: number }; reconciliation: { totalDeposited: number; totalWithdrawn: number; totalCommissionPaid: number; expectedCashOnHand: number; actualWalletBalances: number; difference: number } }
  const [cashier, setCashier] = useState<CashierData | null>(null);
  const loadCashier = useCallback(async () => {
    try {
      setCashier(await api<CashierData>("/api/owner/cashier"));
    } catch { setCashier(null); }
  }, []);
  useEffect(() => { void loadCashier(); }, [loadCashier]);
  // P2 Batch 1 (A26): VIP tiers — the OWNER edits the thresholds here
  // (name, min deposited, perks). The tiers are computed live from the
  // deposit ledger; one tier must start at GH₵ 0. Save replaces all.
  interface VipTierRow { id: string; name: string; minDeposited: number; perks: string[]; sortOrder: number }
  const [vipTiers, setVipTiers] = useState<VipTierRow[]>([]);
  const [vipBusy, setVipBusy] = useState(false);
  const loadVipTiers = useCallback(async () => {
    try {
      const r = await api<{ tiers: VipTierRow[] }>("/api/owner/vip-tiers");
      setVipTiers(r.tiers ?? []);
    } catch { setVipTiers([]); }
  }, []);
  useEffect(() => { void loadVipTiers(); }, [loadVipTiers]);
  const saveVipTiers = async (e: React.FormEvent) => {
    e.preventDefault();
    const tiers = vipTiers.map((t, i) => ({
      name: t.name.trim(),
      minDeposited: Number(t.minDeposited),
      perks: t.perks.join(", "),
      sortOrder: i,
    }));
    if (tiers.some((t) => !t.name)) { toast("Every tier needs a name", "lose"); return; }
    if (tiers.length === 0 || Math.min(...tiers.map((t) => t.minDeposited)) !== 0) {
      toast("One tier must start at GH₵ 0", "lose");
      return;
    }
    setVipBusy(true);
    try {
      await api("/api/owner/vip-tiers", { method: "POST", body: JSON.stringify({ tiers }) });
      toast("VIP tiers saved", "win");
      await loadVipTiers();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "VIP tiers failed", "lose");
    } finally { setVipBusy(false); }
  };
  const setVipTier = (idx: number, patch: Partial<VipTierRow>) => {
    setVipTiers((cur) => cur.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  };

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
      const r = await api<{ promotionId: string; date: string; paid: number; total: number }>(`/api/owner/promotions/${p.id}/pay-cashback`, {
        method: "POST",
        body: JSON.stringify({ date: cbDate }),
      });
      setCbResult(r);
      toast(`Cashback paid — ${r.paid} ${r.paid === 1 ? "player" : "players"}, ${fmtCash(r.total)}`, "win");
      await loadPromos();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Cashback payment failed", "lose");
    } finally { setCbBusy(null); }
  };

  // P1 Batch 4 (O20): create an announcement / toggle one active.
  const createAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    setAnnBusy(true);
    try {
      await api("/api/owner/announcements", {
        method: "POST",
        body: JSON.stringify({
          title: annTitle.trim(),
          body: annBody.trim(),
          audience: annAudience,
          startsAt: annStartsAt || undefined,
          endsAt: annEndsAt || undefined,
        }),
      });
      toast("Announcement created — it shows on the homepage while it is live", "win");
      setAnnTitle("");
      setAnnBody("");
      setAnnEndsAt("");
      await loadAnnouncements();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not create announcement", "lose");
    } finally { setAnnBusy(false); }
  };
  const toggleAnnouncement = async (a: AnnouncementRow) => {
    setAnnToggleBusy(a.id);
    try {
      await api(`/api/owner/announcements/${a.id}/toggle`, { method: "POST" });
      toast(a.active ? "Announcement deactivated — it no longer shows" : "Announcement activated", "win");
      await loadAnnouncements();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not toggle announcement", "lose");
    } finally { setAnnToggleBusy(null); }
  };
  // P1 Batch 4 (O21): platform settings & branding.
  const savePlatSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setPlatBusy(true);
    try {
      await api("/api/owner/platform/settings", {
        method: "POST",
        body: JSON.stringify({ siteName: platSiteName.trim(), supportContact: platSupport.trim(), maintenanceMode: platMaint }),
      });
      toast("Platform settings saved", "win");
      await loadPlatSettings();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not save platform settings", "lose");
    } finally { setPlatBusy(false); }
  };
  // P1 Batch 4 (O22): KYC/AML settings.
  const saveKycSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (kycTypesSel.length === 0) { toast("Pick at least one accepted document type", "lose"); return; }
    setKycBusy(true);
    try {
      await api("/api/owner/kyc-settings", {
        method: "POST",
        body: JSON.stringify({
          acceptedTypes: kycTypesSel,
          autoApprove: kycAuto,
          autoApproveHosts: kycHosts.trim(),
          withdrawalKycThreshold: Number(kycThreshold) || 0,
        }),
      });
      toast("KYC/AML settings saved", "win");
      await loadKycSettings();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not save KYC settings", "lose");
    } finally { setKycBusy(false); }
  };
  // P1 Batch 4 (O23): reassign a ticket to a different admin.
  const reassignTicketTo = async (ticketId: string) => {
    const target = reassignSel[ticketId] ?? "";
    if (!target) { toast("Pick an admin to reassign to", "lose"); return; }
    setReassignBusy(ticketId);
    try {
      await api(`/api/owner/tickets/${ticketId}/reassign`, { method: "POST", body: JSON.stringify({ adminId: target }) });
      toast("Ticket reassigned — the history shows it", "win");
      setReassignSel((cur) => ({ ...cur, [ticketId]: "" }));
      await loadSupport();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not reassign ticket", "lose");
    } finally { setReassignBusy(null); }
  };
  // P1 Batch 4 (O24): set or clear an admin's parent admin.
  const saveParent = async (adminId: string, parentAdminId: string) => {
    setParentBusy(adminId);
    try {
      await api(`/api/owner/admins/${adminId}/parent`, { method: "POST", body: JSON.stringify({ parentAdminId: parentAdminId || null }) });
      toast(parentAdminId ? "Parent admin set — their panel now rolls this downline in" : "Parent admin cleared", "win");
      await load();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not set parent admin", "lose");
    } finally { setParentBusy(null); }
  };

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

  // P1 Batch 3 (O18): the same signal labels as the admin fraud page.
  const FRAUD_SIGNAL_LABELS: Record<string, string> = {
    "withdrawal-flags": "Flagged withdrawal",
    "rapid-withdrawals": "Rapid withdrawals",
    "deposit-no-play": "Deposit, no play",
    "deposit-then-withdraw": "Deposit then withdraw",
  };
  const rtpStatusLabel = (s: string) =>
    s === "flagged-over" ? "OVER-PAYING" : s === "flagged-under" ? "UNDER-PAYING" : s === "ok" ? "OK" : s === "small-sample" ? "Too few rounds" : "Skill — no base";

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
                <div className="admin-meta">Codes: {a.codes.map((c) => c.code).join(", ") || "—"} · Referrals: {a.referralCount} · Coins given: {a.coinsGiven} · Commission all-time: {fmtCash(a.commissionAllTime)}{a.parentName ? ` · Parent: ${a.parentName}` : ""}</div>
              </div>
              <div className="admin-edit">
                <label>% <input type="number" min={0} max={100} defaultValue={a.commissionPct ?? 0} onChange={(e) => setEditing((ed) => ({ ...ed, [a.id]: Number(e.target.value) }))} /></label>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => void savePct(a.id)}>Save %</button>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => void toggleActive(a)}>{a.active ? "Deactivate" : "Reactivate"}</button>
                {/* P1 Batch 4 (O24): the parent admin — a senior agent
                    whose panel rolls this admin's downline in (read-only).
                    Two levels only: only an admin with no parent of their
                    own can be a parent. */}
                <label>Parent <select value={a.parentAdminId ?? ""} disabled={parentBusy === a.id} onChange={(e) => void saveParent(a.id, e.target.value)} aria-label={`Parent admin for ${a.name}`}>
                  <option value="">No parent</option>
                  {admins.filter((p) => p.id !== a.id && !p.parentAdminId).map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select></label>
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
            <label>Parent share % <input type="number" min={0} max={100} step={0.5} value={ruleParentShare} onChange={(e) => setRuleParentShare(Number(e.target.value))} /></label>
            <label>From <input type="date" value={ruleFrom} max={todayStr()} onChange={(e) => setRuleFrom(e.target.value)} /></label>
            <button className="btn btn-gold" type="submit" disabled={ruleBusy}>{ruleBusy ? "Saving…" : "Save rule"}</button>
          </form>
          <p className="rg48-mini">Parent share: when this admin has a parent admin, the parent takes this % of the admin&apos;s commission — shown as a separate line on the settlement. It is a reporting line, NOT a deduction: the child&apos;s payout is untouched.</p>
          {rules === null ? <p>Loading rules…</p> : rules.length === 0 ? (
            <p>No rules yet — every admin is on the legacy flat % of deposits.</p>
          ) : (
            <div className="rg48-twrap">
              <table className="dep-table">
                <thead><tr><th>Applies to</th><th>Model</th><th>Rate</th><th>Parent share</th><th>From</th></tr></thead>
                <tbody>
                  {rules.map((r) => (
                    <tr key={r.id}>
                      <td>{r.adminName ?? "Global default"}</td>
                      <td>{r.model === "revshare" ? "RevShare" : "Turnover"}</td>
                      <td>{r.rate}%</td>
                      <td>{r.parentSharePct > 0 ? `${r.parentSharePct}%` : "—"}</td>
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
                <div className="sum-card"><span>Parent shares</span><b>{fmtCash(settlement.totals.parentShare)}</b></div>
              </div>
              <p className="rg48-mini">Parent shares are a reporting line — they are NOT deducted from any admin&apos;s payout.</p>
              {settlement.rows.length === 0 ? <p>No admins yet.</p> : (
                <div className="rg48-twrap">
                  <table className="dep-table">
                    <thead><tr><th>Admin</th><th>Owed</th><th>Paid</th><th>Balance</th><th>Parent share</th></tr></thead>
                    <tbody>
                      {settlement.rows.map((r) => (
                        <tr key={r.adminId}>
                          <td>{r.adminName}{r.active ? "" : " (deactivated)"}{r.parentName ? ` · parent: ${r.parentName}` : ""}</td>
                          <td>{fmtCash(r.owed)}</td>
                          <td>{fmtCash(r.paid)}</td>
                          <td>{fmtCash(r.balance)}</td>
                          <td>{r.parentShare > 0 ? fmtCash(r.parentShare) : "—"}</td>
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

        {/* P1 Batch 3 (O16): revenue breakdowns — by game, by admin, by
            day, by payment method. All from the real tables; commission
            is recomputed by the rules engine, the same figure the
            Commission page shows. */}
        <section className="admin-sec">
          <h3>Revenue breakdowns</h3>
          <p className="rg48-sub">Where the money comes from, for the period below — by game, by admin, by day, and by payment method. GGR is stakes minus payouts; coin games are shown apart because their GGR is in coins, not GH₵.</p>
          <div className="money-chips" role="group" aria-label="Analytics period">
            {(["today", "week", "month", "custom"] as const).map((p) => (
              <button key={p} type="button" className={anPreset === p ? "on" : ""} onClick={() => setAnPreset(p)}>
                {p === "today" ? "Today" : p === "week" ? "Last 7 days" : p === "month" ? "This month" : "Custom"}
              </button>
            ))}
          </div>
          {anPreset === "custom" && (
            <div className="money-dates">
              <label>From <input type="date" value={anFrom} max={todayStr()} onChange={(e) => setAnFrom(e.target.value)} /></label>
              <label>To <input type="date" value={anTo} max={todayStr()} onChange={(e) => setAnTo(e.target.value)} /></label>
            </div>
          )}
          {revenue === null ? <p>Loading revenue…</p> : (
            <>
              <div className="sum-cards">
                <div className="sum-card"><span>GGR (cash)</span><b>{fmtCash(revenue.totals.ggrCash)}</b></div>
                <div className="sum-card"><span>GGR (coins)</span><b>{revenue.totals.ggrCoins} coins</b></div>
                <div className="sum-card"><span>Deposits</span><b>{fmtCash(revenue.totals.totalDeposited)}</b></div>
                <div className="sum-card"><span>Commission</span><b>{fmtCash(revenue.totals.commission)}</b></div>
              </div>
              <h4>By game — cash (top 5 by GGR are the first five rows)</h4>
              {revenue.byGameCash.length === 0 ? <p>No cash rounds in this period.</p> : (
                <div className="rg48-twrap">
                  <table className="dep-table">
                    <thead><tr><th>Game</th><th>Rounds</th><th>Stakes</th><th>Payouts</th><th>GGR</th></tr></thead>
                    <tbody>
                      {revenue.byGameCash.map((g) => (
                        <tr key={g.game}><td>{g.name}</td><td>{g.rounds}</td><td>{fmtCash(g.stakes)}</td><td>{fmtCash(g.payouts)}</td><td>{fmtCash(g.ggr)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <h4>By game — coins</h4>
              {revenue.byGameCoins.length === 0 ? <p>No coin rounds in this period.</p> : (
                <div className="rg48-twrap">
                  <table className="dep-table">
                    <thead><tr><th>Game</th><th>Rounds</th><th>Stakes</th><th>Payouts</th><th>GGR</th></tr></thead>
                    <tbody>
                      {revenue.byGameCoins.map((g) => (
                        <tr key={g.game}><td>{g.name}</td><td>{g.rounds}</td><td>{g.stakes} coins</td><td>{g.payouts} coins</td><td>{g.ggr} coins</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <h4>By admin</h4>
              <div className="rg48-twrap">
                <table className="dep-table">
                  <thead><tr><th>Admin</th><th>Deposits</th><th>Deposited</th><th>Commission</th><th>GGR</th></tr></thead>
                  <tbody>
                    {revenue.byAdmin.map((a) => (
                      <tr key={a.adminId ?? "none"}><td>{a.adminName}</td><td>{a.deposits}</td><td>{fmtCash(a.totalDeposited)}</td><td>{fmtCash(a.commission)}</td><td>{fmtCash(a.ggr)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h4>By day</h4>
              {revenue.byDay.length === 0 ? <p>No days in this period.</p> : (
                <>
                  <div className="p1b3-bars" aria-label="Daily GGR bar chart">
                    {revenue.byDay.map((d) => {
                      const max = Math.max(0, ...revenue.byDay.map((x) => x.ggr));
                      const w = max > 0 && d.ggr > 0 ? Math.round((d.ggr / max) * 100) : 0;
                      return (
                        <div key={d.date} className="p1b3-bar-row">
                          <span className="p1b3-bar-label">{d.date.slice(5)}</span>
                          <span className="p1b3-bar-track"><span className="p1b3-bar-fill" style={{ width: `${w}%` }} /></span>
                          <b className="p1b3-bar-val">{fmtCash(d.ggr)}</b>
                        </div>
                      );
                    })}
                  </div>
                  <div className="rg48-twrap">
                    <table className="dep-table">
                      <thead><tr><th>Date</th><th>GGR</th><th>Deposits</th><th>Deposited</th><th>Commission</th></tr></thead>
                      <tbody>
                        {revenue.byDay.map((d) => (
                          <tr key={d.date}><td>{d.date}</td><td>{fmtCash(d.ggr)}</td><td>{d.deposits}</td><td>{fmtCash(d.totalDeposited)}</td><td>{fmtCash(d.commission)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              <h4>By payment method</h4>
              {revenue.byMethod.length === 0 ? <p>No deposits in this period.</p> : (
                <div className="rg48-twrap">
                  <table className="dep-table">
                    <thead><tr><th>Method</th><th>Deposits</th><th>Total</th></tr></thead>
                    <tbody>
                      {revenue.byMethod.map((m) => (
                        <tr key={m.method}><td>{m.method}</td><td>{m.deposits}</td><td>{fmtCash(m.total)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>

        {/* P1 Batch 3 (O17): RTP monitor — actual RTP per game against
            the base RTP the tiles print. READ-ONLY: it changes no
            game's maths or limits. */}
        <section className="admin-sec">
          <h3>RTP monitor</h3>
          <p className="rg48-sub">Actual RTP per game for the same period above (payouts ÷ stakes), against the base RTP the game tiles print. A game is flagged when its actual RTP is 10+ points off its base with 50+ rounds; below 50 rounds the sample is too small to flag.</p>
          {rtp === null ? <p>Loading RTP…</p> : (
            <div className="rg48-twrap">
              <table className="dep-table">
                <thead><tr><th>Game</th><th>Rounds</th><th>Stakes</th><th>Payouts</th><th>Actual RTP</th><th>Base RTP</th><th>Status</th></tr></thead>
                <tbody>
                  {rtp.rows.map((r) => (
                    <tr key={r.slug}>
                      <td>{r.name} <span className="ow-game-cur">{r.currency === "coins" ? "Coins" : "Cash"}</span></td>
                      <td>{r.rounds}</td>
                      <td>{r.currency === "coins" ? `${Math.round(r.stakes)} coins` : fmtCash(r.stakes)}</td>
                      <td>{r.currency === "coins" ? `${Math.round(r.payouts)} coins` : fmtCash(r.payouts)}</td>
                      <td>{r.actualRtp === null ? "—" : `${r.actualRtp.toFixed(1)}%`}</td>
                      <td>{r.baseRtp === null ? "Skill" : `${r.baseRtp}%`}</td>
                      <td><span className={`p1b3-flag${r.status === "flagged-over" ? " p1b3-flag-over" : r.status === "flagged-under" ? " p1b3-flag-under" : r.status === "ok" ? " p1b3-flag-ok" : ""}`}>{rtpStatusLabel(r.status)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="ow-day-cap">Skill games (Trivia, Snake, 2048, Brick Breaker, Stack Tower, Bubble Shooter, Bullseye Darts, Connect Four) print “Skill” on their tiles, not a number — they have no base RTP to compare against, so they are never flagged.</p>
        </section>

        {/* P1 Batch 3 (O18): the global fraud console — the same live
            signals as the admin fraud pages, over every player, with
            per-admin rollups. */}
        <section className="admin-sec">
          <h3>Fraud console</h3>
          <p className="rg48-sub">The same live signals as the admin fraud pages, computed over every player. Tap a player to open their detail.</p>
          {ownerFraud === null ? <p>Loading fraud console…</p> : (
            <>
              <div className="sum-cards">
                <div className="sum-card"><span>High</span><b>{ownerFraud.counts.high}</b></div>
                <div className="sum-card"><span>Medium</span><b>{ownerFraud.counts.medium}</b></div>
                <div className="sum-card"><span>Total</span><b>{ownerFraud.alerts.length}</b></div>
              </div>
              <button className="btn btn-ghost" type="button" onClick={() => void loadOwnerFraud()}>Refresh alerts</button>
              <h4>By admin</h4>
              <div className="rg48-twrap">
                <table className="dep-table">
                  <thead><tr><th>Admin</th><th>High</th><th>Medium</th><th>Total</th></tr></thead>
                  <tbody>
                    {ownerFraud.byAdmin.map((r) => (
                      <tr key={r.adminId ?? "none"}><td>{r.adminName}</td><td>{r.high}</td><td>{r.medium}</td><td>{r.total}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {ownerFraud.alerts.length === 0 ? <p>No fraud signals platform-wide right now.</p> : (
                <div className="fraud-list">
                  {ownerFraud.alerts.map((a) => (
                    <article key={a.id} className="fraud-row">
                      <div className="fraud-head">
                        <span className={`sev-pill sev-${a.severity}`}>{a.severity === "high" ? "HIGH" : "MEDIUM"}</span>
                        <b>{FRAUD_SIGNAL_LABELS[a.signal] ?? a.signal}</b>
                      </div>
                      <p>{a.reason}</p>
                      <p className="rg48-sub">
                        <Link href={`/admin/players/${a.userId}`}>{a.userName}</Link>
                        {a.userContact ? ` · ${a.userContact}` : ""} · {new Date(a.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </article>
                  ))}
                </div>
              )}
              <p className="ow-day-cap">Failed-login monitoring is not available — logins are not written to the audit log, so there is no real data to count failed attempts from.</p>
            </>
          )}
        </section>

        {/* P1 Batch 3 (O19): the promotion engine — the owner's
            campaigns. Deposit match + free coins grant automatically;
            cashback is paid by hand, one day at a time. There are no
            wagering requirements anywhere. */}
        <section className="admin-sec">
          <h3>Promotions</h3>
          <p className="rg48-sub">Named campaigns that grant bonuses automatically — a deposit match credits a % of a deposit (capped, once per player), free coins land on signup or first deposit. Cashback is different: it is paid by hand, for one day at a time, from the button on each cashback promotion. There are no wagering requirements anywhere — a granted bonus is in the wallet the moment it lands.</p>
          <form className="owner-add" onSubmit={createPromo}>
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
                    {p.cap !== null && <span className="ow-game-mult">cap {fmtCash(p.cap)}</span>}
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
                    <p className="ow-day-cap">Paid {cbResult.paid} {cbResult.paid === 1 ? "player" : "players"} {fmtCash(cbResult.total)} cashback for {cbResult.date}.</p>
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
                        <td>{g.wallet === "coins" ? `${Math.round(g.amount)} coins` : fmtCash(g.amount)}</td>
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

        {/* P1 Batch 4 (O20): announcements & banners — text only, no
            images, no links. */}
        <section className="admin-sec">
          <h3>Announcements</h3>
          <p className="rg48-sub">Text-only banners on the homepage — no images, no links. An announcement shows while it is active and inside its dates: “all” for everyone (including signed-out visitors), “players” for signed-in players, “admins” for admins. A player can dismiss a banner for the rest of their session.</p>
          <form className="owner-add ann-form" onSubmit={createAnnouncement}>
            <input type="text" placeholder="Title" value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} required minLength={1} maxLength={120} />
            <input type="text" placeholder="Message" value={annBody} onChange={(e) => setAnnBody(e.target.value)} required minLength={1} maxLength={1000} />
            <select value={annAudience} onChange={(e) => setAnnAudience(e.target.value as "all" | "players" | "admins")} aria-label="Audience">
              <option value="all">Everyone</option>
              <option value="players">Players only</option>
              <option value="admins">Admins only</option>
            </select>
            <label>From <input type="date" value={annStartsAt} onChange={(e) => setAnnStartsAt(e.target.value)} /></label>
            <label>To <input type="date" value={annEndsAt} onChange={(e) => setAnnEndsAt(e.target.value)} /></label>
            <button className="btn btn-gold" type="submit" disabled={annBusy}>{annBusy ? "Creating…" : "Create announcement"}</button>
          </form>
          {announcements === null ? <p>Loading announcements…</p> : announcements.length === 0 ? <p>No announcements yet.</p> : (
            <div className="rg48-twrap">
              <table className="dep-table ann-table">
                <thead><tr><th>Title</th><th>Audience</th><th>Dates</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {announcements.map((a) => (
                    <tr key={a.id}>
                      <td><b>{a.title}</b><br /><span className="rg48-mini">{a.body}</span></td>
                      <td>{a.audience}</td>
                      <td>{a.startsAt.slice(0, 10)} to {a.endsAt ? a.endsAt.slice(0, 10) : "open"}</td>
                      <td>{a.active ? "Active" : "Inactive"}</td>
                      <td><button type="button" className="btn btn-ghost btn-sm" disabled={annToggleBusy === a.id} onClick={() => void toggleAnnouncement(a)}>{a.active ? "Deactivate" : "Activate"}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* P1 Batch 4 (O21): platform settings & branding — site name,
            support contact, maintenance mode. The money fields live in
            Wallet config; the global kill switch is in Games. */}
        <section className="admin-sec">
          <h3>Platform settings</h3>
          <p className="rg48-sub">The site name in the header, the support contact on the account page&apos;s Support form, and maintenance mode. Maintenance mode ON shows “Royale Gold is under maintenance — back soon” on the homepage and an unavailable screen in every game room; the owner and admin panels stay reachable so you can switch it back OFF.</p>
          {platSettings === null ? <p>Loading platform settings…</p> : (
            <form className="owner-add" onSubmit={savePlatSettings}>
              <label>Site name <input type="text" value={platSiteName} onChange={(e) => setPlatSiteName(e.target.value)} maxLength={60} required /></label>
              <label>Support contact <input type="text" value={platSupport} onChange={(e) => setPlatSupport(e.target.value)} maxLength={120} placeholder="Email or WhatsApp number" /></label>
              <label><input type="checkbox" checked={platMaint} onChange={(e) => setPlatMaint(e.target.checked)} /> Maintenance mode</label>
              <button className="btn btn-gold" type="submit" disabled={platBusy}>{platBusy ? "Saving…" : "Save platform settings"}</button>
            </form>
          )}
        </section>

        {/* P1 Batch 4 (O22): KYC/AML settings — accepted document types,
            the auto-approve rule, and the withdrawal KYC threshold. */}
        <section className="admin-sec">
          <h3>KYC / AML settings</h3>
          <p className="rg48-sub">The document types players can submit, the auto-approve rule, and the withdrawal KYC threshold. Auto-approve is a URL-host check, NOT a document check — there is no verification service: a submission is approved at once only when its document link&apos;s host is on the allow-list below, and it stays visible in the queue as “auto-approved”. The threshold flags withdrawal requests above it from players whose KYC is not Approved — a warning on the queue, never a block. KYC never blocks a withdrawal outright.</p>
          {kycSettings === null ? <p>Loading KYC settings…</p> : (
            <form className="owner-add" onSubmit={saveKycSettings}>
              <span className="ow-perms-label">Accepted document types:</span>
              <div className="ow-perms-checks">
                {KYC_TYPES.map((t) => (
                  <label key={t.type} className="ow-perm-check">
                    <input type="checkbox" checked={kycTypesSel.includes(t.type)} onChange={() => setKycTypesSel((cur) => (cur.includes(t.type) ? cur.filter((x) => x !== t.type) : [...cur, t.type]))} /> {t.label}
                  </label>
                ))}
              </div>
              <label><input type="checkbox" checked={kycAuto} onChange={(e) => setKycAuto(e.target.checked)} /> Auto-approve from allow-listed hosts</label>
              <label>Allow-listed hosts <input type="text" value={kycHosts} onChange={(e) => setKycHosts(e.target.value)} placeholder="e.g. imgbb.com, ibb.co" /></label>
              <label>Withdrawal KYC threshold GH₵ <input type="number" min={0} step={1} value={kycThreshold} onChange={(e) => setKycThreshold(e.target.value)} /></label>
              <button className="btn btn-gold" type="submit" disabled={kycBusy}>{kycBusy ? "Saving…" : "Save KYC settings"}</button>
            </form>
          )}
        </section>

        {/* P1 Batch 4 (O23): support oversight — every open ticket on the
            platform + per-admin counts and first-response times. */}
        <section className="admin-sec">
          <h3>Support oversight</h3>
          <p className="rg48-sub">Every open ticket on the platform, and how fast each admin answers. First response is the first admin reply after the ticket was created; a ticket with no admin reply yet counts as unanswered. Reassigning writes “Reassigned to …” into the ticket history and the audit log.</p>
          {support === null ? <p>Loading support…</p> : (
            <>
              <div className="sum-cards">
                <div className="sum-card"><span>Open</span><b>{support.totals.open}</b></div>
                <div className="sum-card"><span>Answered</span><b>{support.totals.answered}</b></div>
                <div className="sum-card"><span>Closed</span><b>{support.totals.closed}</b></div>
                <div className="sum-card"><span>Unanswered</span><b>{support.totals.unanswered}</b></div>
              </div>
              {support.stats.length > 0 && (
                <div className="rg48-twrap">
                  <table className="dep-table">
                    <thead><tr><th>Admin</th><th>Open</th><th>Answered</th><th>Closed</th><th>Unanswered</th><th>Avg first response</th></tr></thead>
                    <tbody>
                      {support.stats.map((s) => (
                        <tr key={s.adminId}>
                          <td>{s.adminName}</td>
                          <td>{s.open}</td>
                          <td>{s.answered}</td>
                          <td>{s.closed}</td>
                          <td>{s.unanswered}</td>
                          <td>{s.avgFirstResponseHours === null ? "—" : `${s.avgFirstResponseHours}h`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {support.openTickets.length === 0 ? <p>No open tickets.</p> : (
                <div className="rg48-twrap">
                  <table className="dep-table">
                    <thead><tr><th>Player</th><th>Subject</th><th>Admin</th><th>Status</th><th>Age</th><th>Reassign to</th></tr></thead>
                    <tbody>
                      {support.openTickets.map((t) => (
                        <tr key={t.id}>
                          <td>{t.userName}</td>
                          <td>{t.subject}</td>
                          <td>{t.adminName ?? "—"}</td>
                          <td>{t.status}</td>
                          <td>{t.ageHours < 1 ? "< 1h" : `${t.ageHours}h`}</td>
                          <td>
                            <select value={reassignSel[t.id] ?? ""} onChange={(e) => setReassignSel((cur) => ({ ...cur, [t.id]: e.target.value }))} aria-label={`Reassign ticket ${t.subject}`}>
                              <option value="">Pick admin…</option>
                              {admins.filter((a) => a.id !== t.adminId).map((a) => (
                                <option key={a.id} value={a.id}>{a.name}</option>
                              ))}
                            </select>{" "}
                            <button type="button" className="btn btn-ghost btn-sm" disabled={reassignBusy === t.id || !(reassignSel[t.id] ?? "")} onClick={() => void reassignTicketTo(t.id)}>Reassign</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>

        {/* P1 Batch 4 (O24): agent hierarchy — the tree at a glance. The
            parent is set in All admins above; the split % in Commission
            rules. */}
        <section className="admin-sec">
          <h3>Agent hierarchy</h3>
          <p className="rg48-sub">An admin can have a parent admin (a senior agent). The parent&apos;s Overview, Commission and Players pages roll the child downlines in, read-only and labelled. A parent&apos;s share of a child&apos;s commission is a reporting line on the settlement — never deducted from the child&apos;s payout. Two levels only; an admin with no parent works exactly as before.</p>
          {admins.length === 0 ? <p>No admins yet.</p> : (
            <div className="ow-games">
              {admins.filter((a) => !a.parentAdminId).map((p) => {
                const kids = admins.filter((a) => a.parentAdminId === p.id);
                return (
                  <div key={p.id} className="ow-game-row">
                    <div className="ow-game-head">
                      <b>{p.name}</b>
                      <span className="ow-game-cur">{kids.length === 0 ? "No child admins" : `${kids.length} ${kids.length === 1 ? "child admin" : "child admins"}`}</span>
                    </div>
                    {kids.length > 0 && (
                      <p className="ow-game-note">Children: {kids.map((k) => k.name).join(", ")} — their downlines roll into {p.name}&apos;s Overview, Commission and Players pages.</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* P1 Batch 4 (O25): cashier / gateway balances — per-method
            totals + the reconciliation note. */}
        <section className="admin-sec cashier-sec">
          <h3>Cashier</h3>
          <p className="rg48-sub">What the platform holds per payment method — deposits minus approved withdrawals. Deposits are demo cashier only (no real payment gateway), so these are the platform&apos;s own ledger figures, not a gateway provider&apos;s balance.</p>
          {cashier === null ? <p>Loading cashier…</p> : (
            <>
              <div className="rg48-twrap">
                <table className="dep-table">
                  <thead><tr><th>Method</th><th>Deposited</th><th>Withdrawn</th><th>Net</th></tr></thead>
                  <tbody>
                    {cashier.perMethod.map((m) => (
                      <tr key={m.method}>
                        <td>{m.method}</td>
                        <td>{fmtCash(m.deposited)}</td>
                        <td>{fmtCash(m.withdrawn)}</td>
                        <td>{fmtCash(m.net)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td><b>Total</b></td>
                      <td><b>{fmtCash(cashier.totals.deposited)}</b></td>
                      <td><b>{fmtCash(cashier.totals.withdrawn)}</b></td>
                      <td><b>{fmtCash(cashier.totals.net)}</b></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <h4>Reconciliation</h4>
              <div className="sum-cards">
                <div className="sum-card"><span>Expected cash on hand</span><b>{fmtCash(cashier.reconciliation.expectedCashOnHand)}</b></div>
                <div className="sum-card"><span>Actual wallet balances</span><b>{fmtCash(cashier.reconciliation.actualWalletBalances)}</b></div>
                <div className="sum-card"><span>Difference</span><b>{fmtCash(cashier.reconciliation.difference)}</b></div>
              </div>
              <p className="rg48-mini">Expected = total deposits − total approved withdrawals − total commission paid out ({fmtCash(cashier.reconciliation.totalDeposited)} − {fmtCash(cashier.reconciliation.totalWithdrawn)} − {fmtCash(cashier.reconciliation.totalCommissionPaid)}). Actual = the sum of every player&apos;s cash balance. The difference is the house&apos;s net position — game winnings come from the house, so the two will differ; it is not an error.</p>
            </>
          )}
        </section>
        {/* P2 Batch 1 (A26): VIP tiers — only the owner edits them (name,
            min deposited, perks). Admins only SEE the tiers, on their
            Players list and the player detail. A tier is a label +
            perks only — it changes no economy, limits or payouts. */}
        <section className="admin-sec">
          <h3>VIP tiers</h3>
          <p className="rg48-sub">A player&apos;s tier is their total deposited, read live from the ledger — Bronze ≥ GH₵ 0, Silver ≥ GH₵ 500, Gold ≥ GH₵ 2,000 to start. Saving replaces all tiers at once; one tier must start at GH₵ 0.</p>
          <form className="owner-add" onSubmit={saveVipTiers}>
            {vipTiers.map((t, i) => (
              <div key={t.id} className="pd-adjust-row">
                <label>Name
                  <input type="text" value={t.name} onChange={(e) => setVipTier(i, { name: e.target.value })} aria-label={`Tier ${i + 1} name`} maxLength={40} />
                </label>
                <label>Min deposited (GH₵)
                  <input type="number" min={0} step="0.01" inputMode="decimal" value={t.minDeposited} onChange={(e) => setVipTier(i, { minDeposited: Number(e.target.value) })} aria-label={`Tier ${i + 1} minimum deposited`} />
                </label>
                <label>Perks (comma-separated)
                  <input type="text" value={t.perks.join(", ")} onChange={(e) => setVipTier(i, { perks: e.target.value.split(",").map((p) => p.trim()).filter(Boolean) })} aria-label={`Tier ${i + 1} perks`} placeholder="Priority support, Higher limits" />
                </label>
                <button className="btn btn-ghost" type="button" onClick={() => setVipTiers((cur) => cur.filter((_, j) => j !== i))}>Remove</button>
              </div>
            ))}
            <div className="pd-adjust-row">
              <button className="btn btn-ghost" type="button" onClick={() => setVipTiers((cur) => [...cur, { id: `new-${Date.now()}`, name: "", minDeposited: 0, perks: [], sortOrder: cur.length }])}>Add tier</button>
              <button className="btn btn-gold" type="submit" disabled={vipBusy}>{vipBusy ? "Saving…" : "Save tiers"}</button>
            </div>
          </form>
          <p className="rg48-mini">VIP is a label and perks only — it changes no economy, limits or payouts.</p>
        </section>
      </div>
    </main>
  );
}
