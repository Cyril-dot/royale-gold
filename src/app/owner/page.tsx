// Owner panel — add/edit/deactivate admins, set %, all admins with
// codes / referral counts / coins given / daily commission per admin per
// day with date picker, overall totals, per-day per-admin table,
// all-admins rollup, preview any admin's panel.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, fmtMoney } from "../../lib/api";
import { COUNTRIES, symbolFor } from "../../lib/country";
import CurrencyChips from "../../components/CurrencyChips";
import type { CurrencyConfigShape } from "../../lib/game-config";
import { useStore } from "../../lib/store";
import { copyText, todayStr } from "../../lib/admin-client";
import { ALL_GAMES } from "../../lib/games";
import { ADMIN_SECTIONS, ADMIN_SECTION_LABELS, type AdminSection } from "../../lib/rbac";

interface AdminRow {
  id: string; name: string; email: string; role: string; commissionPct: number | null; active: boolean;
  permissions: string[] | null; totpEnabled: boolean;
  codes: { id: string; code: string; active: boolean }[];
  referralCount: number; coinsGiven: number; commissionAllTime: number; createdAt: string;
  // Phase 1 country-based (Nov 2026): the admin's country + fiat;
  // commissionAllTime is in commissionCurrency (their own fiat).
  country?: string | null; currency?: string; commissionCurrency?: string;
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
interface RollupDay { date: string; adminId: string; adminName: string; deposits: number; totalAmount: number; totalCommission: number; fiatCurrency: string }
interface OwnerDayAdmin { admin: { id: string; name: string }; deposits: { id: string; userId: string; userName: string; userContact: string; amount: number; method: string; fiatCurrency: string; pctInForce: number; commission: number; time: string }[]; totalAmount: number; totalCommission: number }
// P0 Batch 4 (O6): one row of the global player search.
interface OwnerSearchPlayer { id: string; name: string; email: string | null; phone: string | null; role: string; country: string | null; currency: string; referringAdmin: { id: string; name: string } | null; totalDeposited: number; deposits: number; cash: number; coins: number; joinedAt: string }

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
  m: { method: string; enabled: boolean; minDeposit: number | null; maxDeposit: number | null; fiatCurrency: string; gateway?: string | null };
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
        <label>Min deposit ({symbolFor(m.fiatCurrency ?? "GHS")}) <input type="number" min={0} step={0.01} value={minDep} onChange={(e) => setMinDep(e.target.value)} placeholder="Platform min" aria-label={`${m.method} minimum deposit`} /></label>
        <label>Max deposit ({symbolFor(m.fiatCurrency ?? "GHS")}) <input type="number" min={0} step={0.01} value={maxDep} onChange={(e) => setMaxDep(e.target.value)} placeholder="No cap" aria-label={`${m.method} maximum deposit`} /></label>
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
      <button className="btn btn-gold" type="button" disabled={busy} onClick={() => void save()}>Save wallet config</button>
    </div>
  );
}

// P2 Batch 2 (O29): the jackpot pay form — the owner searches a
// player by name/email/phone (the owner's global player search), picks
// one, gives a reason, and pays the whole pot as a bonus. The pot then
// resets to the seed amount.
function JackpotPayForm({ jackpot, busy, onPay }: {
  jackpot: { id: string; name: string; currentPot: number };
  busy: boolean;
  onPay: (jackpotId: string, userId: string, reason: string) => Promise<void>;
}) {
  const { toast } = useStore();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; email: string | null; phone: string | null }[]>([]);
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const [reason, setReason] = useState("");
  const search = async () => {
    if (q.trim().length < 2) { toast("Search needs at least 2 characters", "lose"); return; }
    try {
      const r = await api<{ players: { id: string; name: string; email: string | null; phone: string | null; role: string }[] }>(`/api/owner/players/search?q=${encodeURIComponent(q.trim())}`);
      setResults(r.players.filter((p) => p.role === "user"));
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Search failed", "lose");
    }
  };
  return (
    <div className="pd-adjust-row">
      {picked ? (
        <span>Pay to: <b>{picked.name}</b> <button className="btn btn-ghost btn-sm" type="button" onClick={() => { setPicked(null); setQ(""); setResults([]); }}>Change</button></span>
      ) : (
        <>
          <label>Player (name / email / phone)
            <input type="text" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void search(); } }} placeholder="Search players" aria-label={`Search a player to pay the ${jackpot.name} jackpot to`} />
          </label>
          <button className="btn btn-ghost" type="button" onClick={() => void search()}>Search</button>
          {results.length > 0 && (
            <span>{results.map((p) => (
              <button key={p.id} className="btn btn-ghost btn-sm" type="button" onClick={() => { setPicked({ id: p.id, name: p.name }); setResults([]); }}>{p.name}{p.email ? ` (${p.email})` : p.phone ? ` (${p.phone})` : ""}</button>
            ))}</span>
          )}
        </>
      )}
      <label>Reason (optional)
        <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Why this player" aria-label={`Reason for paying the ${jackpot.name} jackpot`} />
      </label>
      <button className="btn btn-gold" type="button" disabled={busy || !picked || jackpot.currentPot <= 0} onClick={() => picked && void onPay(jackpot.id, picked.id, reason.trim())}>{busy ? "Paying…" : `Pay ${fmtMoney(jackpot.currentPot, "GHS")}`}</button>
    </div>
  );
}

// P2 Batch 2 (O30): one CMS page's editor — title + body + active
// toggle, saved to /api/owner/cms. An inactive page 404s on
// /pages/[slug].
function CmsPageEditor({ page, onSaved }: {
  page: { slug: string; title: string; body: string; active: boolean };
  onSaved: () => Promise<void>;
}) {
  const { toast } = useStore();
  const [title, setTitle] = useState(page.title);
  const [body, setBody] = useState(page.body);
  const [active, setActive] = useState(page.active);
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/owner/cms", { method: "POST", body: JSON.stringify({ slug: page.slug, title: title.trim(), body: body.trim(), active }) });
      toast(`Page “${title.trim()}” saved`, "win");
      await onSaved();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "CMS save failed", "lose");
    } finally { setBusy(false); }
  };
  return (
    <form className="owner-add" onSubmit={save}>
      <div className="pd-adjust-row">
        <label>Title
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} aria-label={`Title for the ${page.slug} page`} />
        </label>
        <label>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active — shows on /pages/{page.slug}
        </label>
      </div>
      <div className="pd-adjust-row">
        <label>Body
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={20000} aria-label={`Body for the ${page.slug} page`} />
        </label>
      </div>
      <div className="pd-adjust-row">
        <button className="btn btn-gold" type="submit" disabled={busy}>{busy ? "Saving…" : "Save page"}</button>
        <a className="btn btn-ghost" href={`/pages/${page.slug}`} target="_blank" rel="noreferrer">View public page ↗</a>
      </div>
    </form>
  );
}

// Phase 1 country-based (Nov 2026): the CurrencyConfig editor —
// per-currency min deposit / min stake / conversion rate (fiat per
// 1 coin) / LIVE decay step / owner-approval threshold / enabled.
// The owner sets his own NGN numbers here without a code change;
// GHS rows stay in sync with Wallet config (the server syncs them).
function OwnerCurrencyConfig() {
  const { toast } = useStore();
  const [rows, setRows] = useState<CurrencyConfigShape[] | null>(null);
  const [draft, setDraft] = useState<Record<string, Partial<CurrencyConfigShape>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setRows((await api<{ currencies: CurrencyConfigShape[] }>("/api/owner/currency-config")).currencies);
      setDraft({});
    } catch { setRows([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const set = (code: string, patch: Partial<CurrencyConfigShape>) => {
    setDraft((d) => ({ ...d, [code]: { ...(d[code] ?? {}), ...patch } }));
  };
  const save = async (row: CurrencyConfigShape) => {
    const d = draft[row.currency] ?? {};
    const body = {
      currency: row.currency,
      symbol: row.symbol,
      minDeposit: d.minDeposit ?? row.minDeposit,
      minStake: d.minStake ?? row.minStake,
      conversionRate: d.conversionRate ?? row.conversionRate,
      decayStep: d.decayStep ?? row.decayStep,
      withdrawalOwnerThreshold: d.withdrawalOwnerThreshold ?? row.withdrawalOwnerThreshold,
      enabled: d.enabled ?? row.enabled,
    };
    setBusy(row.currency);
    try {
      await api("/api/owner/currency-config", { method: "POST", body: JSON.stringify(body) });
      toast(`${row.currency} currency settings saved`, "win");
      await load();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Save failed", "lose");
    } finally { setBusy(null); }
  };
  if (rows === null) return <p>Loading currency settings…</p>;
  if (rows.length === 0) return <p>No currency settings yet.</p>;
  const val = (row: CurrencyConfigShape, key: keyof CurrencyConfigShape) =>
    String((draft[row.currency] as Record<string, unknown> | undefined)?.[key as string] ?? row[key]);
  return (
    <div className="ow-games">
      {rows.map((row) => (
        <div key={row.currency} className="ow-game-row">
          <div className="ow-game-head">
            <b>{row.currency} ({row.symbol})</b>
            {!row.enabled && <span className="ow-game-flag bad">DISABLED</span>}
          </div>
          <p className="ow-game-note">1 coin = {symbolFor(row.currency)} {val(row, "conversionRate")} · LIVE decay step {val(row, "decayStep")} · owner approval above {symbolFor(row.currency)} {val(row, "withdrawalOwnerThreshold")}.</p>
          <div className="ow-game-econ">
            <label>Min deposit ({row.symbol}) <input type="number" min={0} step={0.01} value={val(row, "minDeposit")} onChange={(e) => set(row.currency, { minDeposit: Number(e.target.value) })} aria-label={`${row.currency} minimum deposit`} /></label>
            <label>Min stake ({row.symbol}) <input type="number" min={0} step={0.01} value={val(row, "minStake")} onChange={(e) => set(row.currency, { minStake: Number(e.target.value) })} aria-label={`${row.currency} minimum stake`} /></label>
            <label>Conversion rate ({row.symbol} per coin) <input type="number" min={0} step={0.01} value={val(row, "conversionRate")} onChange={(e) => set(row.currency, { conversionRate: Number(e.target.value) })} aria-label={`${row.currency} conversion rate`} /></label>
            <label>LIVE decay step <input type="number" min={1} step={1} value={val(row, "decayStep")} onChange={(e) => set(row.currency, { decayStep: Number(e.target.value) })} aria-label={`${row.currency} LIVE decay step`} /></label>
            <label>Owner-approval threshold ({row.symbol}) <input type="number" min={0} step={1} value={val(row, "withdrawalOwnerThreshold")} onChange={(e) => set(row.currency, { withdrawalOwnerThreshold: Number(e.target.value) })} aria-label={`${row.currency} owner approval threshold`} /></label>
            <label className="ow-game-toggle">Enabled <input type="checkbox" checked={draft[row.currency]?.enabled ?? row.enabled} onChange={(e) => set(row.currency, { enabled: e.target.checked })} aria-label={`${row.currency} enabled`} /></label>
            <button className="btn btn-gold btn-sm" type="button" disabled={busy === row.currency} onClick={() => void save(row)}>{busy === row.currency ? "Saving…" : "Save"}</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// Phase 2 PayTeller (Nov 2026): the owner Gateway section — the 4
// PayTeller fields (paste → encrypted, last-4 shown), the Ghana MoMo
// toggle (Demo / PayTeller), a Test connection button, and the webhook
// URL to register in PayTeller Settings. Blank fields keep the saved
// value; the toggle alone never needs the encryption key.
interface GatewaySettingsShape {
  ghMomoGateway: "demo" | "payteller";
  paytellerConfigured: boolean;
  paytellerApiKey: string | null;
  paytellerMerchantId: string | null;
  paytellerUsername: string | null;
  paytellerWebhookSecret: string | null;
  webhookUrl: string;
  updatedAt: string | null;
}

function OwnerGatewaySection() {
  const { toast } = useStore();
  const [gw, setGw] = useState<GatewaySettingsShape | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [merchantId, setMerchantId] = useState("");
  const [username, setUsername] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState("");
  const load = useCallback(async () => {
    try {
      setGw(await api<GatewaySettingsShape>("/api/owner/gateway"));
    } catch { setGw(null); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const save = async (patch: Record<string, string>) => {
    setBusy(true);
    try {
      const r = await api<GatewaySettingsShape>("/api/owner/gateway", { method: "POST", body: JSON.stringify(patch) });
      setGw(r);
      setApiKey(""); setMerchantId(""); setUsername(""); setWebhookSecret("");
      toast("Gateway settings saved", "win");
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Save failed", "lose");
    } finally { setBusy(false); }
  };
  const saveKeys = () => void save({
    paytellerApiKey: apiKey,
    paytellerMerchantId: merchantId,
    paytellerUsername: username,
    paytellerWebhookSecret: webhookSecret,
  });
  const flip = (g: "demo" | "payteller") => {
    if (g === "payteller" && gw && !gw.paytellerConfigured) {
      toast("Save the 4 PayTeller keys first (or set them as env vars), then test the connection", "lose");
      return;
    }
    void save({ ghMomoGateway: g });
  };
  const test = async () => {
    setTestBusy(true);
    setTestResult("");
    try {
      const r = await api<{ authenticated: boolean; merchant_id?: string; environment?: string }>("/api/owner/gateway/test", { method: "POST" });
      setTestResult(r.authenticated ? `Connected — ${r.merchant_id ?? ""} (${r.environment ?? ""})` : "PayTeller did not confirm these credentials.");
    } catch (ex) {
      setTestResult(ex instanceof Error ? ex.message : "Connection test failed");
    } finally { setTestBusy(false); }
  };
  const copyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(gw?.webhookUrl ?? "");
      toast("Webhook URL copied", "win");
    } catch {
      toast("Copy failed — long-press the URL to copy it", "lose");
    }
  };
  if (gw === null) return <p>Loading gateway settings…</p>;
  return (
    <div className="ow-games">
      <div className="ow-game-row">
        <div className="ow-game-head">
          <b>Ghana MoMo gateway</b>
          {gw.paytellerConfigured
            ? <span className="ow-game-flag">KEYS SAVED</span>
            : <span className="ow-game-flag bad">NO KEYS</span>}
        </div>
        <div className="ow-game-toggles">
          <button type="button" className={`btn btn-sm ${gw.ghMomoGateway === "demo" ? "btn-gold" : "btn-ghost"}`} disabled={busy} onClick={() => flip("demo")} aria-pressed={gw.ghMomoGateway === "demo"}>Demo</button>
          <button type="button" className={`btn btn-sm ${gw.ghMomoGateway === "payteller" ? "btn-gold" : "btn-ghost"}`} disabled={busy} onClick={() => flip("payteller")} aria-pressed={gw.ghMomoGateway === "payteller"}>PayTeller</button>
          <button type="button" className="btn btn-sm btn-ghost" disabled={testBusy} onClick={() => void test()}>{testBusy ? "Testing…" : "Test connection"}</button>
        </div>
        {testResult && <p className="ow-game-note">{testResult}</p>}
        <div className="ow-game-econ">
          <label>API key {gw.paytellerApiKey ? `(${gw.paytellerApiKey})` : "(not set)"} <input type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Paste new key to replace" aria-label="PayTeller API key" /></label>
          <label>Merchant ID {gw.paytellerMerchantId ? `(${gw.paytellerMerchantId})` : "(not set)"} <input type="text" autoComplete="off" value={merchantId} onChange={(e) => setMerchantId(e.target.value)} placeholder="TTM-00000000" aria-label="PayTeller Merchant ID" /></label>
          <label>Username {gw.paytellerUsername ? `(${gw.paytellerUsername})` : "(not set)"} <input type="text" autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="PayTeller username" aria-label="PayTeller username" /></label>
          <label>Webhook secret {gw.paytellerWebhookSecret ? `(${gw.paytellerWebhookSecret})` : "(not set)"} <input type="password" autoComplete="off" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} placeholder="Paste new secret to replace" aria-label="PayTeller webhook secret" /></label>
          <button className="btn btn-gold btn-sm" type="button" disabled={busy} onClick={saveKeys}>{busy ? "Saving…" : "Save keys"}</button>
        </div>
        <p className="ow-game-note">Webhook URL — register this in PayTeller Settings before the first payment:</p>
        <div className="ow-game-toggles">
          <code className="ow-gw-url">{gw.webhookUrl}</code>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => void copyWebhook()}>Copy</button>
        </div>
      </div>
    </div>
  );
}

// Owner panel rebuild (Nov 2026) — msport tab layout: one tab at a
// time, pill nav, one card at a time. Same RG dark/gold look.
type OwTab = "overview" | "manage" | "finance" | "payouts" | "reports" | "engage" | "settings";
const OWNER_TABS: { id: OwTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "manage", label: "Manage" },
  { id: "finance", label: "Finance" },
  { id: "payouts", label: "Payouts" },
  { id: "reports", label: "Reports" },
  { id: "engage", label: "Engage" },
  { id: "settings", label: "Settings" },
];

// Overview activity feed (Nov 2026): relative time ("2h ago"). Pure
// function of the timestamp; the feed only renders after the client
// fetch, so there is no server/client mismatch.
function relTime(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return iso.slice(0, 10);
}

const ACT_VERB: Record<string, string> = {
  deposit: "Deposited",
  withdrawal: "Withdrawal",
  signup: "Joined",
  commission: "Commission paid",
};

export default function OwnerPage() {
  const { user, openAuth, toast } = useStore();
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [rollup, setRollup] = useState<{ days: RollupDay[]; totals: { deposits: number; totalAmount: number; totalCommission: number } } | null>(null);
  const [err, setErr] = useState("");
  const [date, setDate] = useState("");
  useEffect(() => { setDate(todayStr()); }, []);
  // Phase 1 country-based (Nov 2026): the currency filter — P&L,
  // revenue, cashier, BI, commission, settlement, withdrawals and the
  // ledger are each in ONE fiat only. Defaults to GHS.
  const [fiatSel, setFiatSel] = useState<string | null>(null);
  const fiat = fiatSel ?? user?.currency ?? "GHS";
  // Owner panel rebuild (Nov 2026): the per-fiat owner-approval
  // threshold for the Withdrawals line — read from the currency
  // config the owner edits, with the defaults as fallback.
  const [wdThresholds, setWdThresholds] = useState<Record<string, number> | null>(null);
  const loadWdThresholds = useCallback(async () => {
    try {
      const rows = (await api<{ currencies: CurrencyConfigShape[] }>("/api/owner/currency-config")).currencies;
      setWdThresholds(Object.fromEntries(rows.map((r) => [r.currency, r.withdrawalOwnerThreshold])));
    } catch { setWdThresholds({}); }
  }, []);
  useEffect(() => { void loadWdThresholds(); }, [loadWdThresholds]);
  const wdThreshold = wdThresholds?.[fiat] ?? (fiat === "NGN" ? 50000 : 500);
  // Phase 1 country-based (Nov 2026): a run that pays players in
  // more than one fiat has no honest single total — show the per-fiat
  // split instead ("GH₵ 12.00 + ₦500.00").
  const fmtSplit = (totals: Record<string, number> | undefined, fallback: number) => {
    if (!totals || Object.keys(totals).length === 0) return fmtMoney(fallback, fiat);
    return Object.entries(totals).map(([c, v]) => fmtMoney(v, c)).join(" + ");
  };
  const [tab, setTab] = useState<"per-day" | "rollup">("per-day");
  const [owTab, setOwTab] = useState<OwTab>("overview");
  const [dayAdmins, setDayAdmins] = useState<OwnerDayAdmin[] | null>(null);
  const [dayTotals, setDayTotals] = useState<{ deposits: number; totalAmount: number; totalCommission: number } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // P0 Batch 1 (O8): withdrawal oversight — every pending withdrawal
  // platform-wide. Large ones an admin approved sit as "admin_approved"
  // until the owner approves them second (maker-checker, GH₵ 500).
  interface OwnerWdRow { id: string; userId: string; userName: string; userContact: string | null; adminId: string | null; adminName: string | null; amount: number; method: string; fiatCurrency: string; status: string; reason: string | null; createdAt: string; decidedAt: string | null }
  const [ownerWd, setOwnerWd] = useState<OwnerWdRow[] | null>(null);
  const [ownerWdPending, setOwnerWdPending] = useState(0);
  const [ownerWdStatus, setOwnerWdStatus] = useState("");
  const [ownerRejectId, setOwnerRejectId] = useState<string | null>(null);
  const [ownerRejectReason, setOwnerRejectReason] = useState("");
  const [ownerWdBusy, setOwnerWdBusy] = useState<string | null>(null);
  const loadOwnerWd = useCallback(async () => {
    try {
      const p = new URLSearchParams();
      if (ownerWdStatus) p.set("status", ownerWdStatus);
      p.set("currency", fiat);
      const qs = p.toString();
      const r = await api<{ withdrawals: OwnerWdRow[]; pending: number }>(`/api/owner/withdrawals${qs ? `?${qs}` : ""}`);
      setOwnerWd(r.withdrawals);
      setOwnerWdPending(r.pending);
    } catch { setOwnerWd([]); }
  }, [ownerWdStatus, fiat]);
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
  interface OwnerLedgerRow { id: string; type: string; userId: string; userName: string; userContact: string | null; adminId: string | null; adminName: string | null; amount: number; wallet: string; fiatCurrency: string; detail: string; status?: string; reason?: string; createdAt: string }
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
      p.set("currency", fiat);
      const qs = p.toString();
      const r = await api<{ rows: OwnerLedgerRow[]; totals: { rows: number; cashIn: number; cashOut: number } }>(`/api/owner/ledger${qs ? `?${qs}` : ""}`);
      setOwnerLedger(r.rows);
      setOwnerLedTotals(r.totals);
    } catch { setOwnerLedger([]); }
  }, [ownerLedType, ownerLedQ, ownerLedFrom, ownerLedTo, ownerLedAdmin, fiat]);
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
      setPnl(await api<Pnl>(`/api/owner/pnl?from=${from}&to=${to}&currency=${fiat}`));
    } catch { setPnl(null); }
  }, [pnlPreset, pnlFrom, pnlTo, fiat]);
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
      const r = await api<{ from: string; to: string; rows: SettlementRow[]; totals: { owed: number; paid: number; balance: number; parentShare: number } }>(`/api/owner/commission/settlement?from=${settleFrom}&to=${settleTo}&currency=${fiat}`);
      setSettlement(r);
    } catch { setSettlement(null); }
  }, [settleFrom, settleTo, fiat]);
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
          // Phase 1 country-based (Nov 2026): the payout is in the
          // fiat of the settlement view.
          currency: fiat,
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
  // Phase 1 country-based (Nov 2026): one row per (method × currency) —
  // the list below shows the selected fiat's methods only.
  interface OwnerPayMethod { method: string; enabled: boolean; minDeposit: number | null; maxDeposit: number | null; fiatCurrency: string; gateway?: string | null }
  const [ownerPay, setOwnerPay] = useState<OwnerPayMethod[] | null>(null);
  const loadOwnerPay = useCallback(async () => {
    try {
      setOwnerPay((await api<{ methods: OwnerPayMethod[] }>(`/api/owner/payment-methods?currency=${fiat}`)).methods);
    } catch { setOwnerPay([]); }
  }, [fiat]);
  useEffect(() => { void loadOwnerPay(); }, [loadOwnerPay]);
  const saveOwnerPay = async (method: string, patch: Partial<OwnerPayMethod>) => {
    try {
      await api(`/api/owner/payment-methods/${method}`, { method: "POST", body: JSON.stringify({ ...patch, currency: fiat }) });
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
  // Phase 1 country-based (Nov 2026): the new admin's country — the
  // fiat follows it (GH → GHS, NG → NGN).
  const [adminCountry, setAdminCountry] = useState("GH");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    try {
      const a = await api<{ admins: AdminRow[] }>("/api/owner/admins");
      setAdmins(a.admins);
      setRollup(await api<{ days: RollupDay[]; totals: { deposits: number; totalAmount: number; totalCommission: number } }>(`/api/owner/rollup?currency=${fiat}`));
      setErr("");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not load owner panel.");
    }
  }, [fiat]);

  const loadDay = useCallback(async (d: string) => {
    try {
      const r = await api<{ date: string; admins: OwnerDayAdmin[]; totals: { deposits: number; totalAmount: number; totalCommission: number } }>(`/api/owner/commission?date=${d}&currency=${fiat}`);
      setDayAdmins(r.admins);
      setDayTotals(r.totals);
    } catch {
      setDayAdmins(null);
      setDayTotals(null);
    }
  }, [fiat]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (date) void loadDay(date); }, [date, loadDay]);

  // Overview dashboard (Nov 2026): the 7-stat dashboard — one call,
  // per selected fiat, reloaded with the currency chips.
  interface DashboardActivity {
    kind: "deposit" | "withdrawal" | "signup" | "commission";
    name: string; amount: number | null; detail: string | null; at: string;
  }
  interface DashboardTopAdmin {
    adminId: string; adminName: string; earned: number; paid: number; unpaid: number;
  }
  interface DashboardStats {
    currency: string; date: string;
    usersTotal: number; usersToday: number;
    depositedTotal: number; depositedToday: number;
    paidOutTotal: number; paidOutToday: number;
    commissionToday: number;
    activity: DashboardActivity[];
    deposits7d: { date: string; total: number }[];
    topAdmins: DashboardTopAdmin[];
  }
  const [dash, setDash] = useState<DashboardStats | null>(null);
  const loadDash = useCallback(async () => {
    try { setDash(await api<DashboardStats>(`/api/owner/dashboard-stats?currency=${fiat}`)); } catch { setDash(null); }
  }, [fiat]);
  useEffect(() => { void loadDash(); }, [loadDash]);

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
  useEffect(() => { if (payoutDay) void loadPayouts(payoutDay); }, [payoutDay, loadPayouts]);
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
        api<RevenueData>(`/api/owner/revenue?from=${from}&to=${to}&currency=${fiat}`),
        api<{ from: string; to: string; rows: RtpRow[] }>(`/api/owner/rtp?from=${from}&to=${to}`),
      ]);
      setRevenue(rev);
      setRtp(r);
    } catch { setRevenue(null); setRtp(null); }
  }, [anPreset, anFrom, anTo, fiat]);
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
  const [cbResult, setCbResult] = useState<{ promotionId: string; date: string; paid: number; total: number; totalsByCurrency: Record<string, number> } | null>(null);
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
      setCashier(await api<CashierData>(`/api/owner/cashier?currency=${fiat}`));
    } catch { setCashier(null); }
  }, [fiat]);
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

  // P2 Batch 2 — owner P2 (O26–O33). These hooks MUST live above the
  // early returns below — hooks after `if (!user) return` change the
  // hook count between renders and crash the page (React #310).
  // O26: advanced BI & cohorts — players by joining month, with
  // activity, deposits, stakes, GGR, average deposit + a month-1/2/3
  // retention curve. Read from the real tables, no analytics store.
  interface CohortRow { cohort: string; players: number; activePct: number; totalDeposited: number; totalStaked: number; ggr: number; avgDeposit: number; retention: { m1: number | null; m2: number | null; m3: number | null } }
  const [bi, setBi] = useState<{ cohorts: CohortRow[]; totalPlayers: number } | null>(null);
  const loadBi = useCallback(async () => {
    try { setBi(await api<{ cohorts: CohortRow[]; totalPlayers: number }>(`/api/owner/bi?currency=${fiat}`)); } catch { setBi(null); }
  }, [fiat]);
  useEffect(() => { void loadBi(); }, [loadBi]);
  // O27: game replays — the 50 most recent GameResult rows + a detail
  // view (the round's outcome + the provably-fair verify for crash
  // rounds). No per-bet event log exists, so a replay shows the
  // outcome + the verify result, not a step-by-step animation.
  interface ReplayRow { id: string; userId: string; userName: string; game: string; gameName: string; currency: string; fiatCurrency: string; stake: number; payout: number; net: number; roundId: string | null; createdAt: string }
  interface ReplayVerify { roundId: string; hash: string; clientSeed: string; nonce: number; finished: boolean; serverSeed?: string; crashPoint?: number; recomputedPoint?: number; pointMatch?: boolean; hashMatch?: boolean }
  interface ReplayDetail { replay: ReplayRow & { userContact: string | null }; verify: ReplayVerify | null }
  const [replays, setReplays] = useState<ReplayRow[] | null>(null);
  const [replayDetail, setReplayDetail] = useState<ReplayDetail | null>(null);
  const [replayBusy, setReplayBusy] = useState<string | null>(null);
  const loadReplays = useCallback(async () => {
    try { setReplays((await api<{ replays: ReplayRow[] }>("/api/owner/replays")).replays); } catch { setReplays([]); }
  }, []);
  useEffect(() => { void loadReplays(); }, [loadReplays]);
  const openReplay = async (id: string) => {
    setReplayBusy(id);
    try { setReplayDetail(await api<ReplayDetail>(`/api/owner/replays/${id}`)); }
    catch (ex) { toast(ex instanceof Error ? ex.message : "Could not open the replay", "lose"); }
    finally { setReplayBusy(null); }
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
  useEffect(() => { void loadLoyalty(); }, [loadLoyalty]);
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
  // O29: tournaments & jackpots config — ALL tournaments platform-wide
  // (the owner ends any of them) + the jackpot system. The pot is
  // house-funded: contributionPct% of each cash stake in the jackpot's
  // game(s) feeds the pot — never taken from any payout.
  interface OwnerTournamentRow { id: string; name: string; gameSlug: string; gameName: string; startAt: string; endAt: string; prizePool: number; status: string; winnerId: string | null; winnerName: string | null; adminId: string; adminName: string; createdAt: string }
  interface JackpotRow { id: string; name: string; gameSlug: string; gameName: string; seedAmount: number; contributionPct: number; currentPot: number; active: boolean; createdBy: string; createdAt: string }
  const [ownerTournaments, setOwnerTournaments] = useState<OwnerTournamentRow[] | null>(null);
  const [endConfirmId, setEndConfirmId] = useState<string | null>(null);
  const [endBusy, setEndBusy] = useState<string | null>(null);
  const [jackpots, setJackpots] = useState<JackpotRow[] | null>(null);
  const [jkName, setJkName] = useState("");
  const [jkGame, setJkGame] = useState("all");
  const [jkSeed, setJkSeed] = useState("100");
  const [jkPct, setJkPct] = useState("1");
  const [jkBusy, setJkBusy] = useState(false);
  const [jkPayBusy, setJkPayBusy] = useState<string | null>(null);
  const [jkToggleBusy, setJkToggleBusy] = useState<string | null>(null);
  const loadOwnerTournaments = useCallback(async () => {
    try { setOwnerTournaments((await api<{ tournaments: OwnerTournamentRow[] }>("/api/owner/tournaments")).tournaments); } catch { setOwnerTournaments([]); }
  }, []);
  useEffect(() => { void loadOwnerTournaments(); }, [loadOwnerTournaments]);
  const loadJackpots = useCallback(async () => {
    try { setJackpots((await api<{ jackpots: JackpotRow[] }>("/api/owner/jackpots")).jackpots); } catch { setJackpots([]); }
  }, []);
  useEffect(() => { void loadJackpots(); }, [loadJackpots]);
  const endOwnerTournament = async (t: OwnerTournamentRow) => {
    setEndBusy(t.id);
    try {
      const r = await api<{ tournament: { winnerName: string; prizePool: number } }>(`/api/owner/tournaments/${t.id}/end`, { method: "POST", body: JSON.stringify({}) });
      toast(`Tournament ended — ${r.tournament.winnerName} won ${fmtMoney(r.tournament.prizePool, fiat)}`, "win");
      setEndConfirmId(null);
      await loadOwnerTournaments();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not end the tournament", "lose");
    } finally { setEndBusy(null); }
  };
  const createJackpot = async (e: React.FormEvent) => {
    e.preventDefault();
    setJkBusy(true);
    try {
      await api("/api/owner/jackpots", { method: "POST", body: JSON.stringify({ name: jkName.trim(), gameSlug: jkGame, seedAmount: Number(jkSeed), contributionPct: Number(jkPct) }) });
      toast(`Jackpot “${jkName.trim()}” created`, "win");
      setJkName("");
      await loadJackpots();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Jackpot failed", "lose");
    } finally { setJkBusy(false); }
  };
  const payJackpot = async (jackpotId: string, userId: string, reason: string) => {
    setJkPayBusy(jackpotId);
    try {
      const r = await api<{ winner: { name: string }; paid: number }>(`/api/owner/jackpots/${jackpotId}/pay`, { method: "POST", body: JSON.stringify({ userId, reason }) });
      toast(`Paid ${fmtMoney(r.paid, "GHS")} to ${r.winner.name} — pot reset to the seed`, "win");
      await loadJackpots();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Jackpot pay failed", "lose");
    } finally { setJkPayBusy(null); }
  };
  const toggleJackpot = async (j: JackpotRow) => {
    setJkToggleBusy(j.id);
    try {
      await api(`/api/owner/jackpots/${j.id}/toggle`, { method: "POST" });
      toast(`Jackpot “${j.name}” ${j.active ? "paused" : "resumed"}`, "win");
      await loadJackpots();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not toggle the jackpot", "lose");
    } finally { setJkToggleBusy(null); }
  };
  // O30: CMS & localisation — the site pages (About, Terms, Privacy),
  // edited here and shown on /pages/[slug] when active. English only,
  // GH₵ only — the page says so plainly.
  interface CmsRow { slug: string; title: string; body: string; active: boolean; updatedAt: string }
  const [cmsPages, setCmsPages] = useState<CmsRow[] | null>(null);
  const loadCms = useCallback(async () => {
    try { setCmsPages((await api<{ pages: CmsRow[] }>("/api/owner/cms")).pages); } catch { setCmsPages([]); }
  }, []);
  useEffect(() => { void loadCms(); }, [loadCms]);
  // O31: automated risk rules — a fraud signal + threshold + action.
  // "block_player" and "hold_withdrawal" are REAL actions; "flag" only
  // adds the alert to the fraud console.
  interface RiskRuleRow { id: string; name: string; signal: string; threshold: number; action: string; active: boolean; createdBy: string; createdAt: string }
  interface RiskSignalRow { key: string; label: string; thresholdLabel: string; thresholdHint: string; defaultThreshold: number }
  interface RiskActionRow { key: string; label: string; note: string }
  const [riskRules, setRiskRules] = useState<RiskRuleRow[] | null>(null);
  const [riskSignals, setRiskSignals] = useState<RiskSignalRow[]>([]);
  const [riskActions, setRiskActions] = useState<RiskActionRow[]>([]);
  const [rrName, setRrName] = useState("");
  const [rrSignal, setRrSignal] = useState("withdrawal-flags");
  const [rrThreshold, setRrThreshold] = useState("2");
  const [rrAction, setRrAction] = useState("flag");
  const [rrBusy, setRrBusy] = useState(false);
  const [rrToggleBusy, setRrToggleBusy] = useState<string | null>(null);
  const loadRiskRules = useCallback(async () => {
    try {
      const r = await api<{ rules: RiskRuleRow[]; signals: RiskSignalRow[]; actions: RiskActionRow[] }>("/api/owner/risk-rules");
      setRiskRules(r.rules);
      setRiskSignals(r.signals);
      setRiskActions(r.actions);
    } catch { setRiskRules([]); }
  }, []);
  useEffect(() => { void loadRiskRules(); }, [loadRiskRules]);
  const createRiskRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setRrBusy(true);
    try {
      await api("/api/owner/risk-rules", { method: "POST", body: JSON.stringify({ name: rrName.trim(), signal: rrSignal, threshold: Number(rrThreshold), action: rrAction }) });
      toast(`Risk rule “${rrName.trim()}” created`, "win");
      setRrName("");
      await loadRiskRules();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Risk rule failed", "lose");
    } finally { setRrBusy(false); }
  };
  const toggleRiskRule = async (r: RiskRuleRow) => {
    setRrToggleBusy(r.id);
    try {
      await api(`/api/owner/risk-rules/${r.id}/toggle`, { method: "POST" });
      toast(`Risk rule “${r.name}” ${r.active ? "disabled" : "enabled"}`, "win");
      await loadRiskRules();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not toggle the rule", "lose");
    } finally { setRrToggleBusy(null); }
  };
  // O32: anomaly alerts — rule-based, computed live from the real
  // tables. No stored rows, no ML model, no AI — just thresholds.
  interface AnomalyRow { id: string; type: string; severity: string; userId: string | null; userName: string | null; game: string | null; gameName: string | null; reason: string; createdAt: string }
  const [anomalies, setAnomalies] = useState<{ anomalies: AnomalyRow[]; counts: { high: number; medium: number } } | null>(null);
  const loadAnomalies = useCallback(async () => {
    try { setAnomalies(await api<{ anomalies: AnomalyRow[]; counts: { high: number; medium: number } }>("/api/owner/anomalies")); } catch { setAnomalies(null); }
  }, []);
  useEffect(() => { void loadAnomalies(); }, [loadAnomalies]);
  // O33: multi-brand support — CONFIG records only. A brand does NOT
  // change any page, game or URL (no per-brand routing or theming).
  interface BrandRow { id: string; name: string; slug: string; siteName: string; primaryColor: string; secondaryColor: string; active: boolean; createdAt: string }
  const [brands, setBrands] = useState<BrandRow[] | null>(null);
  const [brName, setBrName] = useState("");
  const [brSlug, setBrSlug] = useState("");
  const [brSite, setBrSite] = useState("");
  const [brPrimary, setBrPrimary] = useState("#F2C230");
  const [brSecondary, setBrSecondary] = useState("#0C2B22");
  const [brBusy, setBrBusy] = useState(false);
  const [brToggleBusy, setBrToggleBusy] = useState<string | null>(null);
  const loadBrands = useCallback(async () => {
    try { setBrands((await api<{ brands: BrandRow[] }>("/api/owner/brands")).brands); } catch { setBrands([]); }
  }, []);
  useEffect(() => { void loadBrands(); }, [loadBrands]);
  const createBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    setBrBusy(true);
    try {
      await api("/api/owner/brands", { method: "POST", body: JSON.stringify({ name: brName.trim(), slug: brSlug.trim(), siteName: brSite.trim() || undefined, primaryColor: brPrimary, secondaryColor: brSecondary }) });
      toast(`Brand “${brName.trim()}” created`, "win");
      setBrName(""); setBrSlug(""); setBrSite("");
      await loadBrands();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Brand failed", "lose");
    } finally { setBrBusy(false); }
  };
  const toggleBrand = async (b: BrandRow) => {
    setBrToggleBusy(b.id);
    try {
      await api(`/api/owner/brands/${b.id}/toggle`, { method: "POST" });
      toast(`Brand “${b.name}” ${b.active ? "disabled" : "enabled"}`, "win");
      await loadBrands();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not toggle the brand", "lose");
    } finally { setBrToggleBusy(null); }
  };

  if (!user) {
    return (
      <main className="rg48-page-main"><div className="wrap">
        <h2>Owner <em>panel</em></h2>
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
      await api("/api/owner/admins", { method: "POST", body: JSON.stringify({ name: name.trim(), email: email.trim(), password, commissionPct: pct, country: adminCountry }) });
      setName(""); setEmail(""); setPassword(""); setPct(10); setAdminCountry("GH");
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
    <main className="rg48-page-main ow-page">
      <div className="wrap">
        <div className="ow-strip">
          <Link className="gp-back" href="/" aria-label="Back"><span className="gp-back-coin">←</span></Link>
          <span className="ow-strip-dot" aria-hidden="true" />
          <div className="ow-strip-titles"><h2>Owner panel</h2><small>Platform-wide control</small></div>
          <span className="ow-strip-role">Owner</span>
        </div>
        <nav className="ow-ptabs" aria-label="Owner panel sections">
          {OWNER_TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={owTab === t.id} className={`ow-ptab${owTab === t.id ? " ow-ptab-on" : ""}`} onClick={() => setOwTab(t.id)}>{t.label}</button>
          ))}
        </nav>
        {/* Phase 1 country-based (Nov 2026): the currency filter — the
            money sections below (totals, commission, P&L, revenue,
            cashier, BI, withdrawals, ledger) are each in ONE fiat. */}
        {owTab === "overview" && (
          <CurrencyChips value={fiat} onChange={setFiatSel} label="Owner currency" />
        )}

        {owTab === "overview" && (
          <>
          <section className="admin-sec">
          <h3>Overall totals</h3>
          {dash === null ? <p>Loading totals…</p> : (
            <div className="sum-cards">
              <div className="sum-card"><span>Users</span><b>{dash.usersTotal.toLocaleString("en-GB")}</b><span className="ow-dash-today">+{dash.usersToday} today</span></div>
              <div className="sum-card"><span>Total deposited</span><b>{fmtMoney(dash.depositedTotal, fiat)}</b><span className="ow-dash-today">+{fmtMoney(dash.depositedToday, fiat)} today</span></div>
              <div className="sum-card"><span>Total paid out</span><b>{fmtMoney(dash.paidOutTotal, fiat)}</b><span className="ow-dash-today">+{fmtMoney(dash.paidOutToday, fiat)} today</span></div>
              <div className="sum-card"><span>Commission to pay today</span><b>{fmtMoney(dash.commissionToday, fiat)}</b></div>
            </div>
          )}
          </section>

          <section className="admin-sec">
          <h3>Recent activity</h3>
          {dash === null ? <p>Loading activity…</p> : dash.activity.length === 0 ? (
            <p>No activity yet.</p>
          ) : (
            <div>
              {dash.activity.map((a, i) => (
                <div key={`${a.kind}-${a.at}-${i}`} className="ow-act-row">
                  <div className="ow-act-main">
                    <b>{a.name}</b>
                    <span className="ow-act-sub">{ACT_VERB[a.kind] ?? a.kind}{a.detail ? ` · ${a.detail}` : ""} · {relTime(a.at)}</span>
                  </div>
                  {a.amount !== null && <b className="ow-act-amt">{fmtMoney(a.amount, fiat)}</b>}
                </div>
              ))}
            </div>
          )}
          </section>

          <section className="admin-sec">
          <h3>Deposits — last 7 days</h3>
          {dash === null ? <p>Loading chart…</p> : (
            <div className="p1b3-bars" aria-label="Deposits per day, last 7 days">
              {dash.deposits7d.map((d) => {
                const max = Math.max(0, ...dash.deposits7d.map((x) => x.total));
                const w = max > 0 && d.total > 0 ? Math.round((d.total / max) * 100) : 0;
                return (
                  <div key={d.date} className="p1b3-bar-row">
                    <span className="p1b3-bar-label">{d.date.slice(5)}</span>
                    <span className="p1b3-bar-track"><span className="p1b3-bar-fill" style={{ width: `${w}%` }} /></span>
                    <b className="p1b3-bar-val">{fmtMoney(d.total, fiat)}</b>
                  </div>
                );
              })}
            </div>
          )}
          </section>

          <section className="admin-sec">
          <h3>Top admins</h3>
          {dash === null ? <p>Loading admins…</p> : dash.topAdmins.length === 0 ? (
            <p>No commission earned yet.</p>
          ) : (
            <div>
              {dash.topAdmins.map((t, i) => (
                <div key={t.adminId} className="ow-act-row">
                  <span className="ow-act-rank">{i + 1}</span>
                  <div className="ow-act-main">
                    <b>{t.adminName}</b>
                    <span className="ow-act-sub">{t.unpaid > 0 ? `Paid ${fmtMoney(t.paid, fiat)} · ${fmtMoney(t.unpaid, fiat)} owing` : `Fully paid · ${fmtMoney(t.paid, fiat)}`}</span>
                  </div>
                  <b className="ow-act-amt">{fmtMoney(t.earned, fiat)}</b>
                </div>
              ))}
            </div>
          )}
          </section>
          </>
        )}

        {owTab === "manage" && (
          <section className="admin-sec">
          <h3>Add admin</h3>
          <form className="owner-add" onSubmit={addAdmin}>
            <input type="text" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            <label>Commission % <input type="number" min={0} max={100} value={pct} onChange={(e) => setPct(Number(e.target.value))} /></label>
            <label>Country <select value={adminCountry} onChange={(e) => setAdminCountry(e.target.value)} aria-label="New admin country">
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>{c.name} ({c.currency})</option>
              ))}
            </select></label>
            <button className="btn btn-gold" type="submit" disabled={busy}>{busy ? "Adding…" : "Add admin"}</button>
          </form>
          </section>
        )}

        {owTab === "manage" && (
          <section className="admin-sec">
          <h3>All admins ({admins.length})</h3>
          {admins.map((a) => (
            <div key={a.id} className="admin-row">
              <div>
                <b>{a.name}</b> <span>{a.email}</span> <span className={a.active ? "ok" : "bad"}>{a.active ? "Active" : "Deactivated"}</span>
                <div className="admin-meta">Codes: {a.codes.map((c) => c.code).join(", ") || "—"} · Referrals: {a.referralCount} · Coins given: {a.coinsGiven} · Commission all-time: {fmtMoney(a.commissionAllTime, a.commissionCurrency ?? a.currency ?? "GHS")}{a.country ? ` · ${COUNTRIES.find((c) => c.code === a.country)?.name ?? a.country}` : ""}{a.parentName ? ` · Parent: ${a.parentName}` : ""}</div>
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
        )}

        {owTab === "manage" && (
          <section className="admin-sec">
          <h3>Player search</h3>
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
                        <td>{fmtMoney(p.totalDeposited, p.currency ?? fiat)}</td>
                        <td>{fmtMoney(p.cash, p.currency ?? fiat)}</td>
                        <td>{p.coins}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          </section>
        )}

        {owTab === "finance" && (
          <section className="admin-sec">
          <h3>Withdrawals{ownerWdPending > 0 ? ` (${ownerWdPending} pending)` : ""}</h3>
          <div className="money-chips" role="group" aria-label="Filter by status">
            <button type="button" className={!ownerWdStatus ? "on" : ""} onClick={() => setOwnerWdStatus("")}>All</button>
            {["pending", "held", "admin_approved", "approved", "rejected"].map((s) => (
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
                    <span className="wd-amt">{fmtMoney(w.amount, w.fiatCurrency ?? fiat)} · {w.method}</span>
                    <span className="wd-date">{w.adminName ? `via ${w.adminName} · ` : ""}{new Date(w.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <span className={`wd-status wd-${w.status}`}>{w.status === "admin_approved" ? "Awaiting owner" : w.status}</span>
                  {w.reason ? <p className="wd-reason">Reason: {w.reason}</p> : null}
                  {(w.status === "pending" || w.status === "admin_approved" || w.status === "held") && (
                    <div className="wd-actions">
                      {w.status === "admin_approved" ? <span className="wd-note">Admin approved — your approval makes it final.</span> : null}
                      {w.status === "held" ? <span className="wd-note">Held by a risk rule — review before deciding.</span> : null}
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
        )}


        {owTab === "finance" && (
          <section className="admin-sec">
          <h3>Commission rules</h3>
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
        )}

        {owTab === "finance" && (
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
                    <div className="sum-card"><span>Total deposited</span><b>{fmtMoney(dayTotals.totalAmount, fiat)}</b></div>
                    <div className="sum-card"><span>Commission</span><b>{fmtMoney(dayTotals.totalCommission, fiat)}</b></div>
                  </div>
                  <p className="ow-day-cap">Commission on {date}</p>
                </>
              )}
              {dayAdmins && dayAdmins.length === 0 && <p className="bh-empty">No deposits that day.</p>}
              {dayAdmins?.map((da) => (
                <div key={da.admin.id} className="day-admin">
                  <h4>{da.admin.name} — {fmtMoney(da.totalAmount, fiat)} · {fmtMoney(da.totalCommission, fiat)} commission</h4>
                  <div className="rg48-twrap">
                    <table className="dep-table">
                      <thead><tr><th>User</th><th>Contact</th><th>Amount</th><th>Time</th><th>Method</th><th>Commission</th></tr></thead>
                      <tbody>
                        {da.deposits.map((d) => (
                          <tr key={d.id}><td>{d.userName}</td><td>{d.userContact}</td><td>{fmtMoney(d.amount, d.fiatCurrency ?? fiat)}</td><td>{new Date(d.time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</td><td>{d.method}</td><td>{fmtMoney(d.commission, d.fiatCurrency ?? fiat)} ({d.pctInForce}%)</td></tr>
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
                        <tr key={`${d.date}-${d.adminId}-${i}`}><td>{d.date}</td><td>{d.adminName}</td><td>{d.deposits}</td><td>{fmtMoney(d.totalAmount, d.fiatCurrency ?? fiat)}</td><td>{fmtMoney(d.totalCommission, d.fiatCurrency ?? fiat)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          </section>
        )}

        {owTab === "finance" && (
          <section className="admin-sec">
          <h3>Settlement</h3>
          <div className="money-dates">
            <label>From <input type="date" value={settleFrom} max={todayStr()} onChange={(e) => setSettleFrom(e.target.value)} /></label>
            <label>To <input type="date" value={settleTo} max={todayStr()} onChange={(e) => setSettleTo(e.target.value)} /></label>
          </div>
          {settlement === null ? <p>Loading settlement…</p> : (
            <>
              <div className="sum-cards">
                <div className="sum-card"><span>Owed</span><b>{fmtMoney(settlement.totals.owed, fiat)}</b></div>
                <div className="sum-card"><span>Paid</span><b>{fmtMoney(settlement.totals.paid, fiat)}</b></div>
                <div className="sum-card"><span>Balance</span><b>{fmtMoney(settlement.totals.balance, fiat)}</b></div>
                <div className="sum-card"><span>Parent shares</span><b>{fmtMoney(settlement.totals.parentShare, fiat)}</b></div>
              </div>
              {settlement.rows.length === 0 ? <p>No admins yet.</p> : (
                <div className="rg48-twrap">
                  <table className="dep-table">
                    <thead><tr><th>Admin</th><th>Owed</th><th>Paid</th><th>Balance</th><th>Parent share</th></tr></thead>
                    <tbody>
                      {settlement.rows.map((r) => (
                        <tr key={r.adminId}>
                          <td>{r.adminName}{r.active ? "" : " (deactivated)"}{r.parentName ? ` · parent: ${r.parentName}` : ""}</td>
                          <td>{fmtMoney(r.owed, fiat)}</td>
                          <td>{fmtMoney(r.paid, fiat)}</td>
                          <td>{fmtMoney(r.balance, fiat)}</td>
                          <td>{r.parentShare > 0 ? fmtMoney(r.parentShare, fiat) : "—"}</td>
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
        )}

        {owTab === "reports" && (
          <section className="admin-sec">
          <h3>Audit log</h3>
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
        )}

        {owTab === "finance" && (
          <section className="admin-sec">
          <h3>Ledger</h3>
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
              <div className="sum-card"><span>Cash in</span><b>{fmtMoney(ownerLedTotals.cashIn, fiat)}</b></div>
              <div className="sum-card"><span>Cash out</span><b>{fmtMoney(ownerLedTotals.cashOut, fiat)}</b></div>
            </div>
          )}
          {ownerLedger === null ? <p>Loading ledger…</p> : ownerLedger.length === 0 ? (
            <p>No money movements yet.</p>
          ) : (
            <div className="ledger-list">
              {ownerLedger.map((r) => {
                const sign = r.amount > 0 ? "+" : r.amount < 0 ? "−" : "";
                const abs = Math.abs(r.amount);
                const amt = r.wallet === "coins" ? `${sign}${Math.round(abs)} coins` : `${sign}${fmtMoney(abs, r.fiatCurrency ?? fiat)}`;
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
        )}

        {owTab === "finance" && (
          <section className="admin-sec">
          <h3>Profit &amp; loss</h3>
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
                <div className="sum-card"><span>GGR (cash)</span><b>{fmtMoney(pnl.ggrCash, fiat)}</b></div>
                <div className="sum-card"><span>Deposits</span><b>{fmtMoney(pnl.deposits, fiat)}</b></div>
                <div className="sum-card"><span>Withdrawals (approved)</span><b>{fmtMoney(pnl.withdrawals, fiat)}</b></div>
                <div className="sum-card"><span>Commissions owed</span><b>{fmtMoney(pnl.commissions, fiat)}</b></div>
                <div className="sum-card"><span>Net profit</span><b>{fmtMoney(pnl.netProfit, fiat)}</b></div>
              </div>
              <p className="ow-day-cap">
                {pnl.roundsCash} cash rounds ({fmtMoney(pnl.stakesCash, fiat)} staked − {fmtMoney(pnl.payoutsCash, fiat)} paid out) · {pnl.roundsCoins} coin rounds ({pnl.stakesCoins} staked − {pnl.payoutsCoins} paid out, GGR {pnl.ggrCoins} coins) · {pnl.depositsCount} deposits · {pnl.withdrawalsCount} approved withdrawals.
              </p>
            </>
          )}
          </section>
        )}

        {owTab === "manage" && (
          <section className="admin-sec">
          <h3>Games ({ownerGames ? ownerGames.length : "…"})</h3>
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
        )}

        {owTab === "finance" && (
          <section className="admin-sec">
          <h3>Payment methods</h3>
          {ownerPay === null ? <p>Loading payment methods…</p> : (
            <div className="ow-games">
              {ownerPay.map((m) => (
                <OwnerPayRow key={m.method} m={m} onSave={saveOwnerPay} />
              ))}
            </div>
          )}
          </section>
        )}

        {/* Phase 2 PayTeller (Nov 2026): the Ghana MoMo gateway — keys,
            the Demo / PayTeller switch, and the webhook URL. The 10%
            PayTeller charge is absorbed by the house; the wallet is
            always credited the full amount. */}
        {owTab === "finance" && (
          <section className="admin-sec">
          <h3>PayTeller gateway</h3>
          <OwnerGatewaySection />
          </section>
        )}

        {owTab === "finance" && (
          <section className="admin-sec">
          <h3>Wallet config</h3>
          {ownerWallet === null ? <p>Loading wallet config…</p> : (
            <OwnerWalletForm key={JSON.stringify(ownerWallet)} w={ownerWallet} onSave={saveOwnerWallet} />
          )}
          </section>
        )}

        {owTab === "finance" && (
          <section className="admin-sec">
          <h3>Currency settings</h3>
          <OwnerCurrencyConfig />
          </section>
        )}

        {/* P1 Batch 3 (O16): revenue breakdowns — by game, by admin, by
            day, by payment method. All from the real tables; commission
            is recomputed by the rules engine, the same figure the
            Commission page shows. */}
        {owTab === "reports" && (
          <section className="admin-sec">
          <h3>Revenue breakdowns</h3>
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
                <div className="sum-card"><span>GGR (cash)</span><b>{fmtMoney(revenue.totals.ggrCash, fiat)}</b></div>
                <div className="sum-card"><span>GGR (coins)</span><b>{revenue.totals.ggrCoins} coins</b></div>
                <div className="sum-card"><span>Deposits</span><b>{fmtMoney(revenue.totals.totalDeposited, fiat)}</b></div>
                <div className="sum-card"><span>Commission</span><b>{fmtMoney(revenue.totals.commission, fiat)}</b></div>
              </div>
              <h4>By game — cash (top 5 by GGR are the first five rows)</h4>
              {revenue.byGameCash.length === 0 ? <p>No cash rounds in this period.</p> : (
                <div className="rg48-twrap">
                  <table className="dep-table">
                    <thead><tr><th>Game</th><th>Rounds</th><th>Stakes</th><th>Payouts</th><th>GGR</th></tr></thead>
                    <tbody>
                      {revenue.byGameCash.map((g) => (
                        <tr key={g.game}><td>{g.name}</td><td>{g.rounds}</td><td>{fmtMoney(g.stakes, fiat)}</td><td>{fmtMoney(g.payouts, fiat)}</td><td>{fmtMoney(g.ggr, fiat)}</td></tr>
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
                      <tr key={a.adminId ?? "none"}><td>{a.adminName}</td><td>{a.deposits}</td><td>{fmtMoney(a.totalDeposited, fiat)}</td><td>{fmtMoney(a.commission, fiat)}</td><td>{fmtMoney(a.ggr, fiat)}</td></tr>
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
                          <b className="p1b3-bar-val">{fmtMoney(d.ggr, fiat)}</b>
                        </div>
                      );
                    })}
                  </div>
                  <div className="rg48-twrap">
                    <table className="dep-table">
                      <thead><tr><th>Date</th><th>GGR</th><th>Deposits</th><th>Deposited</th><th>Commission</th></tr></thead>
                      <tbody>
                        {revenue.byDay.map((d) => (
                          <tr key={d.date}><td>{d.date}</td><td>{fmtMoney(d.ggr, fiat)}</td><td>{d.deposits}</td><td>{fmtMoney(d.totalDeposited, fiat)}</td><td>{fmtMoney(d.commission, fiat)}</td></tr>
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
                        <tr key={m.method}><td>{m.method}</td><td>{m.deposits}</td><td>{fmtMoney(m.total, fiat)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
          </section>
        )}

        {/* P1 Batch 3 (O17): RTP monitor — actual RTP per game against
            the base RTP the tiles print. READ-ONLY: it changes no
            game's maths or limits. */}
        {owTab === "reports" && (
          <section className="admin-sec">
          <h3>RTP monitor</h3>
          {rtp === null ? <p>Loading RTP…</p> : (
            <div className="rg48-twrap">
              <table className="dep-table">
                <thead><tr><th>Game</th><th>Rounds</th><th>Stakes</th><th>Payouts</th><th>Actual RTP</th><th>Base RTP</th><th>Status</th></tr></thead>
                <tbody>
                  {rtp.rows.map((r) => (
                    <tr key={r.slug}>
                      <td>{r.name} <span className="ow-game-cur">{r.currency === "coins" ? "Coins" : "Cash"}</span></td>
                      <td>{r.rounds}</td>
                      <td>{r.currency === "coins" ? `${Math.round(r.stakes)} coins` : fmtMoney(r.stakes, fiat)}</td>
                      <td>{r.currency === "coins" ? `${Math.round(r.payouts)} coins` : fmtMoney(r.payouts, fiat)}</td>
                      <td>{r.actualRtp === null ? "—" : `${r.actualRtp.toFixed(1)}%`}</td>
                      <td>{r.baseRtp === null ? "Skill" : `${r.baseRtp}%`}</td>
                      <td><span className={`p1b3-flag${r.status === "flagged-over" ? " p1b3-flag-over" : r.status === "flagged-under" ? " p1b3-flag-under" : r.status === "ok" ? " p1b3-flag-ok" : ""}`}>{rtpStatusLabel(r.status)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </section>
        )}

        {/* P1 Batch 3 (O18): the global fraud console — the same live
            signals as the admin fraud pages, over every player, with
            per-admin rollups. */}
        {owTab === "reports" && (
          <section className="admin-sec">
          <h3>Fraud console</h3>
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
            </>
          )}
          </section>
        )}

        {/* P1 Batch 3 (O19): the promotion engine — the owner's
            campaigns. Deposit match + free coins grant automatically;
            cashback is paid by hand, one day at a time. There are no
            wagering requirements anywhere. */}
        {owTab === "engage" && (
          <section className="admin-sec">
          <h3>Promotions</h3>
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
        )}

        {/* P1 Batch 4 (O20): announcements & banners — text only, no
            images, no links. */}
        {owTab === "engage" && (
          <section className="admin-sec">
          <h3>Announcements</h3>
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
        )}

        {/* P1 Batch 4 (O21): platform settings & branding — site name,
            support contact, maintenance mode. The money fields live in
            Wallet config; the global kill switch is in Games. */}
        {owTab === "settings" && (
          <section className="admin-sec">
          <h3>Platform settings</h3>
          {platSettings === null ? <p>Loading platform settings…</p> : (
            <form className="owner-add" onSubmit={savePlatSettings}>
              <label>Site name <input type="text" value={platSiteName} onChange={(e) => setPlatSiteName(e.target.value)} maxLength={60} required /></label>
              <label>Support contact <input type="text" value={platSupport} onChange={(e) => setPlatSupport(e.target.value)} maxLength={120} placeholder="Email or WhatsApp number" /></label>
              <label><input type="checkbox" checked={platMaint} onChange={(e) => setPlatMaint(e.target.checked)} /> Maintenance mode</label>
              <button className="btn btn-gold" type="submit" disabled={platBusy}>{platBusy ? "Saving…" : "Save platform settings"}</button>
            </form>
          )}
          </section>
        )}

        {/* P1 Batch 4 (O22): KYC/AML settings — accepted document types,
            the auto-approve rule, and the withdrawal KYC threshold. */}
        {owTab === "settings" && (
          <section className="admin-sec">
          <h3>KYC / AML settings</h3>
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
        )}

        {/* P1 Batch 4 (O23): support oversight — every open ticket on the
            platform + per-admin counts and first-response times. */}
        {owTab === "settings" && (
          <section className="admin-sec">
          <h3>Support oversight</h3>
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
        )}

        {/* P1 Batch 4 (O24): agent hierarchy — the tree at a glance. The
            parent is set in All admins above; the split % in Commission
            rules. */}
        {owTab === "manage" && (
          <section className="admin-sec">
          <h3>Agent hierarchy</h3>
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
        )}

        {/* P1 Batch 4 (O25): cashier / gateway balances — per-method
            totals + the reconciliation note. */}
        {owTab === "finance" && (
          <section className="admin-sec cashier-sec">
          <h3>Cashier</h3>
          {cashier === null ? <p>Loading cashier…</p> : (
            <>
              <div className="rg48-twrap">
                <table className="dep-table">
                  <thead><tr><th>Method</th><th>Deposited</th><th>Withdrawn</th><th>Net</th></tr></thead>
                  <tbody>
                    {cashier.perMethod.map((m) => (
                      <tr key={m.method}>
                        <td>{m.method}</td>
                        <td>{fmtMoney(m.deposited, fiat)}</td>
                        <td>{fmtMoney(m.withdrawn, fiat)}</td>
                        <td>{fmtMoney(m.net, fiat)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td><b>Total</b></td>
                      <td><b>{fmtMoney(cashier.totals.deposited, fiat)}</b></td>
                      <td><b>{fmtMoney(cashier.totals.withdrawn, fiat)}</b></td>
                      <td><b>{fmtMoney(cashier.totals.net, fiat)}</b></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <h4>Reconciliation</h4>
              <div className="sum-cards">
                <div className="sum-card"><span>Expected cash on hand</span><b>{fmtMoney(cashier.reconciliation.expectedCashOnHand, fiat)}</b></div>
                <div className="sum-card"><span>Actual wallet balances</span><b>{fmtMoney(cashier.reconciliation.actualWalletBalances, fiat)}</b></div>
                <div className="sum-card"><span>Difference</span><b>{fmtMoney(cashier.reconciliation.difference, fiat)}</b></div>
              </div>
            </>
          )}
          </section>
        )}

        {/* Payouts tab (Nov 2026): the people owed commission each day —
            the drill-down of the dashboard's "Commission to pay today".
            Day strip (last 14 days, gold = owed, green = all paid) +
            date input; one row per admin owed that day with a Paid /
            Unpaid / Rejected pill, one-tap status actions, and an
            inline Details view (user + saved payout account). */}
        {owTab === "payouts" && (
          <CurrencyChips value={fiat} onChange={setFiatSel} label="Owner currency" />
        )}
        {owTab === "payouts" && (
          <section className="admin-sec">
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
        )}

        {/* P2 Batch 1 (A26): VIP tiers — only the owner edits them (name,
            min deposited, perks). Admins only SEE the tiers, on their
            Players list and the player detail. A tier is a label +
            perks only — it changes no economy, limits or payouts. */}
        {owTab === "engage" && (
          <section className="admin-sec">
          <h3>VIP tiers</h3>
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
          </section>
        )}

        {/* P2 Batch 2 (O26): advanced BI & cohorts — players grouped by
            the month they joined, with activity, deposits, stakes, GGR
            and average deposit, plus a month-1/2/3 retention curve.
            Read from the real tables — no separate analytics store. */}
        {owTab === "reports" && (
          <section className="admin-sec">
          <h3>BI &amp; cohorts</h3>
          {bi === null ? <p>Loading cohorts…</p> : bi.cohorts.length === 0 ? (
            <p>No players yet.</p>
          ) : (
            <>
              <div className="sum-cards">
                <div className="sum-card"><span>Players</span><b>{bi.totalPlayers}</b></div>
                <div className="sum-card"><span>Cohorts</span><b>{bi.cohorts.length}</b></div>
              </div>
              <div className="rg48-twrap">
                <table className="dep-table">
                  <thead><tr><th>Cohort</th><th>Players</th><th>Active (30d)</th><th>Deposited</th><th>Staked</th><th>GGR</th><th>Avg deposit</th></tr></thead>
                  <tbody>
                    {bi.cohorts.map((c) => (
                      <tr key={c.cohort}>
                        <td>{c.cohort}</td>
                        <td>{c.players}</td>
                        <td>{c.activePct}%</td>
                        <td>{fmtMoney(c.totalDeposited, fiat)}</td>
                        <td>{fmtMoney(c.totalStaked, fiat)}</td>
                        <td>{fmtMoney(c.ggr, fiat)}</td>
                        <td>{fmtMoney(c.avgDeposit, fiat)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h4>Retention curve</h4>
              <div className="rg48-twrap">
                <table className="dep-table">
                  <thead><tr><th>Cohort</th><th>Month 1</th><th>Month 2</th><th>Month 3</th></tr></thead>
                  <tbody>
                    {bi.cohorts.map((c) => (
                      <tr key={c.cohort}>
                        <td>{c.cohort}</td>
                        <td>{c.retention.m1 === null ? "—" : `${c.retention.m1}%`}</td>
                        <td>{c.retention.m2 === null ? "—" : `${c.retention.m2}%`}</td>
                        <td>{c.retention.m3 === null ? "—" : `${c.retention.m3}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => void loadBi()}>Refresh cohorts</button>
            </>
          )}
          </section>
        )}

        {/* P2 Batch 2 (O27): game replays — the 50 most recent rounds
            platform-wide, with a detail view per round (the round's
            outcome + the provably-fair verify for crash rounds). There
            is no per-bet event log, so a replay shows the outcome +
            the verify result — not a step-by-step animation. */}
        {owTab === "reports" && (
          <section className="admin-sec">
          <h3>Game replays</h3>
          {replays === null ? <p>Loading replays…</p> : replays.length === 0 ? (
            <p>No rounds yet.</p>
          ) : (
            <>
              <div className="rg48-twrap">
                <table className="dep-table">
                  <thead><tr><th>Time</th><th>Player</th><th>Game</th><th>Stake</th><th>Payout</th><th>Net</th><th></th></tr></thead>
                  <tbody>
                    {replays.map((r) => (
                      <tr key={r.id}>
                        <td>{new Date(r.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                        <td>{r.userName}</td>
                        <td>{r.gameName}</td>
                        <td>{r.currency === "coins" ? `${r.stake} coins` : fmtMoney(r.stake, r.fiatCurrency ?? fiat)}</td>
                        <td>{r.currency === "coins" ? `${r.payout} coins` : fmtMoney(r.payout, r.fiatCurrency ?? fiat)}</td>
                        <td>{r.currency === "coins" ? `${r.net > 0 ? "+" : ""}${r.net} coins` : `${r.net > 0 ? "+" : ""}${fmtMoney(r.net, r.fiatCurrency ?? fiat)}`}</td>
                        <td><button className="btn btn-ghost btn-sm" type="button" disabled={replayBusy === r.id} onClick={() => void openReplay(r.id)}>{replayBusy === r.id ? "Opening…" : "View"}</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {replayDetail && (
                <div className="ow-game-row">
                  <div className="ow-game-head">
                    <b>{replayDetail.replay.gameName}</b>
                    <span className="ow-game-cur">{replayDetail.replay.userName}{replayDetail.replay.userContact ? ` · ${replayDetail.replay.userContact}` : ""}</span>
                    <span className="ow-game-mult">{new Date(replayDetail.replay.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <p className="ow-game-note">Stake {replayDetail.replay.currency === "coins" ? `${replayDetail.replay.stake} coins` : fmtMoney(replayDetail.replay.stake, replayDetail.replay.fiatCurrency ?? fiat)} · Payout {replayDetail.replay.currency === "coins" ? `${replayDetail.replay.payout} coins` : fmtMoney(replayDetail.replay.payout, replayDetail.replay.fiatCurrency ?? fiat)} · Net {replayDetail.replay.currency === "coins" ? `${replayDetail.replay.net} coins` : fmtMoney(replayDetail.replay.net, replayDetail.replay.fiatCurrency ?? fiat)}{replayDetail.replay.roundId ? ` · Round ${replayDetail.replay.roundId.slice(0, 8)}…` : ""}</p>
                  {replayDetail.verify ? (
                    <p className="ow-game-note">
                      Provably-fair verify: crash point ×{replayDetail.verify.crashPoint} · recomputed ×{replayDetail.verify.recomputedPoint} · point {replayDetail.verify.pointMatch ? "MATCHES ✓" : "DOES NOT MATCH ✗"} · hash {replayDetail.verify.hashMatch ? "MATCHES ✓" : "DOES NOT MATCH ✗"}
                      {replayDetail.verify.finished ? "" : " · Round still live — the seed is revealed only once it finishes."}
                    </p>
                  ) : (
                    <p className="ow-game-note">No provably-fair verify for this round — only crash rounds carry a seed + hash.</p>
                  )}
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => setReplayDetail(null)}>Close replay</button>
                </div>
              )}
            </>
          )}
          </section>
        )}

        {/* P2 Batch 2 (O28): loyalty / VIP config — the points rule (a
            read-only display rule: points are computed live from total
            staked, there is no points ledger), the tier thresholds
            (read-only, from the VIP tiers above) and the birthday
            bonus, paid ONCE per year by the button below — there is
            NO cron, so it is manual, not automatic. */}
        {owTab === "engage" && (
          <section className="admin-sec">
          <h3>Loyalty</h3>
          {loyalty === null ? <p>Loading loyalty…</p> : (
            <>
              <form className="owner-add" onSubmit={saveLoyalty}>
                <div className="pd-adjust-row">
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
              <div className="pd-adjust-row">
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
        )}

        {/* P2 Batch 2 (O29): tournaments & jackpots config — ALL
            tournaments platform-wide (the owner ends any of them) +
            the jackpot system. The pot is house-funded: the
            contribution % of each cash stake feeds the pot — never
            taken from any payout. */}
        {owTab === "engage" && (
          <section className="admin-sec">
          <h3>Tournaments &amp; jackpots</h3>
          {ownerTournaments === null ? <p>Loading tournaments…</p> : ownerTournaments.length === 0 ? (
            <p>No tournaments yet.</p>
          ) : (
            <div className="rg48-twrap">
              <table className="dep-table">
                <thead><tr><th>Tournament</th><th>Game</th><th>Admin</th><th>Status</th><th>Prize pool</th><th>Winner</th><th></th></tr></thead>
                <tbody>
                  {ownerTournaments.map((t) => (
                    <tr key={t.id}>
                      <td>{t.name}</td>
                      <td>{t.gameName}</td>
                      <td>{t.adminName}</td>
                      <td>{t.status}</td>
                      <td>{fmtMoney(t.prizePool, fiat)}</td>
                      <td>{t.winnerName ?? "—"}</td>
                      <td>
                        {t.status !== "ended" && (
                          endConfirmId === t.id ? (
                            <button className="btn btn-gold btn-sm" type="button" disabled={endBusy === t.id} onClick={() => void endOwnerTournament(t)}>{endBusy === t.id ? "Ending…" : `Confirm end — pay ${fmtMoney(t.prizePool, fiat)}`}</button>
                          ) : (
                            <button className="btn btn-ghost btn-sm" type="button" onClick={() => setEndConfirmId(t.id)}>End</button>
                          )
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <h4>Jackpots</h4>
          <form className="owner-add" onSubmit={createJackpot}>
            <div className="pd-adjust-row">
              <label>Name
                <input type="text" value={jkName} onChange={(e) => setJkName(e.target.value)} maxLength={60} aria-label="Jackpot name" placeholder="e.g. Golden Hour Jackpot" />
              </label>
              <label>Game
                <select value={jkGame} onChange={(e) => setJkGame(e.target.value)} aria-label="Jackpot game">
                  <option value="all">All games</option>
                  {ALL_GAMES.map((g) => (<option key={g.slug} value={g.slug}>{g.name}</option>))}
                </select>
              </label>
              <label>Seed amount (GH₵)
                <input type="number" min={0} max={100000} step="0.01" inputMode="decimal" value={jkSeed} onChange={(e) => setJkSeed(e.target.value)} aria-label="Jackpot seed amount in GH₵" />
              </label>
              <label>Contribution (% of each stake)
                <input type="number" min={0} max={50} step="0.1" inputMode="decimal" value={jkPct} onChange={(e) => setJkPct(e.target.value)} aria-label="Jackpot contribution percent" />
              </label>
              <button className="btn btn-gold" type="submit" disabled={jkBusy}>{jkBusy ? "Creating…" : "Create jackpot"}</button>
            </div>
          </form>
          {jackpots === null ? <p>Loading jackpots…</p> : jackpots.length === 0 ? (
            <p>No jackpots yet.</p>
          ) : (
            <div className="ow-games">
              {jackpots.map((j) => (
                <div key={j.id} className="ow-game-row">
                  <div className="ow-game-head">
                    <b>{j.name}</b>
                    <span className="ow-game-cur">{j.gameName}</span>
                    <span className="ow-game-mult">Pot {fmtMoney(j.currentPot, "GHS")}</span>
                    {j.active ? <span className="ow-game-flag">ACTIVE</span> : <span className="ow-game-flag">PAUSED</span>}
                  </div>
                  <p className="ow-game-note">Seed {fmtMoney(j.seedAmount, "GHS")} · {j.contributionPct}% of each cash stake feeds the pot · {j.active ? "growing" : "paused — not growing"}.</p>
                  <JackpotPayForm jackpot={j} busy={jkPayBusy === j.id} onPay={payJackpot} />
                  <div className="pd-adjust-row">
                    <button className="btn btn-ghost btn-sm" type="button" disabled={jkToggleBusy === j.id} onClick={() => void toggleJackpot(j)}>{jkToggleBusy === j.id ? "…" : j.active ? "Pause" : "Resume"}</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          </section>
        )}

        {/* P2 Batch 2 (O30): CMS & localisation — the site pages (About,
            Terms, Privacy), edited here and shown on /pages/[slug]
            when active. English only, GH₵ only. */}
        {owTab === "settings" && (
          <section className="admin-sec">
          <h3>CMS &amp; localisation</h3>
          {cmsPages === null ? <p>Loading pages…</p> : cmsPages.map((p) => (
            <div key={p.slug}>
              <h4>/{p.slug}{p.active ? "" : " (inactive)"}</h4>
              <CmsPageEditor page={p} onSaved={loadCms} />
            </div>
          ))}
          </section>
        )}

        {/* P2 Batch 2 (O31): automated risk rules — a fraud signal +
            threshold + action, evaluated when the event happens (a
            withdrawal request is created, a deposit lands). "flag" only
            adds the alert to the fraud console; "block_player" blocks
            the player at once; "hold_withdrawal" holds the withdrawal
            for admin review. The last two are REAL actions. */}
        {owTab === "settings" && (
          <section className="admin-sec">
          <h3>Risk rules</h3>
          <form className="owner-add" onSubmit={createRiskRule}>
            <div className="pd-adjust-row">
              <label>Name
                <input type="text" value={rrName} onChange={(e) => setRrName(e.target.value)} maxLength={60} aria-label="Risk rule name" placeholder="e.g. Hold fast withdrawals" />
              </label>
              <label>Signal
                <select value={rrSignal} onChange={(e) => { setRrSignal(e.target.value); const s = riskSignals.find((x) => x.key === e.target.value); if (s) setRrThreshold(String(s.defaultThreshold)); }} aria-label="Risk rule signal">
                  {riskSignals.map((s) => (<option key={s.key} value={s.key}>{s.label}</option>))}
                </select>
              </label>
              <label>{riskSignals.find((s) => s.key === rrSignal)?.thresholdLabel ?? "Threshold"}
                <input type="number" min={0.01} step="0.01" inputMode="decimal" value={rrThreshold} onChange={(e) => setRrThreshold(e.target.value)} aria-label="Risk rule threshold" />
              </label>
              <label>Action
                <select value={rrAction} onChange={(e) => setRrAction(e.target.value)} aria-label="Risk rule action">
                  {riskActions.map((a) => (<option key={a.key} value={a.key}>{a.label}</option>))}
                </select>
              </label>
              <button className="btn btn-gold" type="submit" disabled={rrBusy}>{rrBusy ? "Creating…" : "Create rule"}</button>
            </div>
          </form>
          {riskRules === null ? <p>Loading rules…</p> : riskRules.length === 0 ? (
            <p>No risk rules yet — the fraud console still flags, but nothing is blocked or held automatically.</p>
          ) : (
            <div className="rg48-twrap">
              <table className="dep-table">
                <thead><tr><th>Rule</th><th>Signal</th><th>Threshold</th><th>Action</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {riskRules.map((r) => (
                    <tr key={r.id}>
                      <td>{r.name}</td>
                      <td>{riskSignals.find((s) => s.key === r.signal)?.label ?? r.signal}</td>
                      <td>{r.threshold}</td>
                      <td>{riskActions.find((a) => a.key === r.action)?.label ?? r.action}</td>
                      <td>{r.active ? "Active" : "Disabled"}</td>
                      <td><button className="btn btn-ghost btn-sm" type="button" disabled={rrToggleBusy === r.id} onClick={() => void toggleRiskRule(r)}>{rrToggleBusy === r.id ? "…" : r.active ? "Disable" : "Enable"}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </section>
        )}

        {/* P2 Batch 2 (O32): anomaly alerts — rule-based detection,
            computed live from the real tables. No stored rows, no ML
            model, no AI — just thresholds on the real data. */}
        {owTab === "reports" && (
          <section className="admin-sec">
          <h3>Anomaly alerts</h3>
          {anomalies === null ? <p>Loading anomalies…</p> : (
            <>
              <div className="sum-cards">
                <div className="sum-card"><span>High</span><b>{anomalies.counts.high}</b></div>
                <div className="sum-card"><span>Medium</span><b>{anomalies.counts.medium}</b></div>
              </div>
              {anomalies.anomalies.length === 0 ? <p>No anomalies right now.</p> : (
                <div className="fraud-list">
                  {anomalies.anomalies.map((a) => (
                    <article key={a.id} className="fraud-row">
                      <div className="fraud-head">
                        <span className={`sev-pill sev-${a.severity}`}>{a.severity === "high" ? "HIGH" : "MEDIUM"}</span>
                        <b>{a.type === "win-rate" ? "Win rate" : a.type === "stake-jump" ? "Stake jump" : a.type === "rtp-spike" ? "RTP spike" : "Deposit then withdraw"}</b>
                      </div>
                      <p>{a.reason}</p>
                      <p className="rg48-sub">
                        {a.userId ? <Link href={`/admin/players/${a.userId}`}>{a.userName}</Link> : a.gameName ?? a.game}
                        {a.userId ? "" : " · see the RTP monitor above"} · {new Date(a.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </article>
                  ))}
                </div>
              )}
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => void loadAnomalies()}>Refresh anomalies</button>
            </>
          )}
          </section>
        )}

        {/* P2 Batch 2 (O33): multi-brand support — CONFIG records only.
            A brand does NOT change any page, game or URL: there is no
            per-brand routing, no per-brand database and no per-brand
            theme switcher. */}
        {owTab === "manage" && (
          <section className="admin-sec">
          <h3>Brands</h3>
          <form className="owner-add" onSubmit={createBrand}>
            <div className="pd-adjust-row">
              <label>Name
                <input type="text" value={brName} onChange={(e) => setBrName(e.target.value)} maxLength={60} aria-label="Brand name" placeholder="e.g. Royale Gold" />
              </label>
              <label>Slug
                <input type="text" value={brSlug} onChange={(e) => setBrSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} maxLength={40} aria-label="Brand slug" placeholder="e.g. royale-gold" />
              </label>
              <label>Site name
                <input type="text" value={brSite} onChange={(e) => setBrSite(e.target.value)} maxLength={60} aria-label="Brand site name" placeholder="Defaults to the name" />
              </label>
              <label>Primary colour
                <input type="color" value={brPrimary} onChange={(e) => setBrPrimary(e.target.value)} aria-label="Brand primary colour" />
              </label>
              <label>Secondary colour
                <input type="color" value={brSecondary} onChange={(e) => setBrSecondary(e.target.value)} aria-label="Brand secondary colour" />
              </label>
              <button className="btn btn-gold" type="submit" disabled={brBusy}>{brBusy ? "Creating…" : "Create brand"}</button>
            </div>
          </form>
          {brands === null ? <p>Loading brands…</p> : brands.length === 0 ? (
            <p>No brands yet.</p>
          ) : (
            <div className="rg48-twrap">
              <table className="dep-table">
                <thead><tr><th>Brand</th><th>Slug</th><th>Site name</th><th>Colours</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {brands.map((b) => (
                    <tr key={b.id}>
                      <td>{b.name}</td>
                      <td>{b.slug}</td>
                      <td>{b.siteName}</td>
                      <td><span style={{ display: "inline-block", width: 14, height: 14, borderRadius: 3, background: b.primaryColor, verticalAlign: "middle" }} /> <span style={{ display: "inline-block", width: 14, height: 14, borderRadius: 3, background: b.secondaryColor, verticalAlign: "middle" }} /></td>
                      <td>{b.active ? "Active" : "Inactive"}</td>
                      <td><button className="btn btn-ghost btn-sm" type="button" disabled={brToggleBusy === b.id} onClick={() => void toggleBrand(b)}>{brToggleBusy === b.id ? "…" : b.active ? "Disable" : "Enable"}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </section>
        )}
      </div>
    </main>
  );
}
