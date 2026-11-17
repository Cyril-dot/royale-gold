// Convert page (Nov 2026) — the money page. The converter moved off the
// wallet page and lives here, with the player's balances, recent
// conversions, the saved withdrawal account (bank or MoMo) and the
// withdraw request form. Forms, chips, lists and values only — no
// helper blurbs (Chuks had those removed). Withdrawals are requests
// only: no money moves until an admin approves (see /api/wallet/withdraw).

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, fmtMoney, fmtCoins } from "../../../lib/api";
import { symbolFor } from "../../../lib/country";
import { WITHDRAWAL_METHODS } from "../../../lib/withdrawal-flags";
import { useStore } from "../../../lib/store";
import CoinConverter from "../../../components/CoinConverter";

interface ConversionRow {
  id: string;
  cashDebited: number;
  coinsGained: number;
  fiatCurrency: string;
  createdAt: string;
}

interface WithdrawalRow {
  id: string;
  amount: number;
  method: string;
  fiatCurrency: string;
  status: string;
  accountType: string | null;
  accountName: string | null;
  accountDetail: string | null;
  reason: string | null;
  createdAt: string;
}

interface SavedAccount {
  id: string;
  type: string;
  bankName: string | null;
  accountNumber: string | null;
  accountName: string;
  network: string | null;
  phoneNumber: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  held: "Held",
  admin_approved: "Admin approved",
  approved: "Approved",
  rejected: "Rejected",
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function ConvertPage() {
  const { user, wallet, openAuth } = useStore();
  const [conversions, setConversions] = useState<ConversionRow[] | null>(null);
  const [requests, setRequests] = useState<WithdrawalRow[] | null>(null);
  const [account, setAccount] = useState<SavedAccount | null>(null);

  const loadConversions = useCallback(() => {
    api<{ conversions: ConversionRow[] }>("/api/wallet/conversions")
      .then((r) => setConversions(r.conversions))
      .catch(() => setConversions([]));
  }, []);
  const loadRequests = useCallback(() => {
    api<{ withdrawals: WithdrawalRow[] }>("/api/wallet/withdraw")
      .then((r) => setRequests(r.withdrawals))
      .catch(() => setRequests([]));
  }, []);
  const loadAccount = useCallback(() => {
    api<{ account: SavedAccount | null }>("/api/wallet/withdrawal-account")
      .then((r) => setAccount(r.account))
      .catch(() => setAccount(null));
  }, []);

  useEffect(() => {
    if (!user) return;
    loadConversions();
    loadRequests();
    loadAccount();
  }, [user, loadConversions, loadRequests, loadAccount]);

  if (!user) {
    return (
      <main className="rg48-page-main">
        <div className="wrap">
          <h2>Convert</h2>
          <button className="btn btn-gold" type="button" onClick={() => openAuth("login")}>Log in</button>
        </div>
      </main>
    );
  }

  const cash = wallet?.cash ?? user.cash ?? 0;
  const coins = wallet?.coins ?? user.coins ?? 0;
  const fiat = user.currency ?? "GHS";
  const sym = symbolFor(fiat);

  return (
    <main className="rg48-page-main">
      <div className="wrap">
        <div className="rg48-hbar-in">
          <Link className="gp-back" href="/wallet" aria-label="Back to wallet"><span className="gp-back-coin">←</span></Link>
          <h2>Convert</h2>
        </div>

        <section className="wallet-hist" aria-label="Balances">
          <div className="wallet-hist-list">
            <div className="wallet-hist-row">
              <span className="wallet-hist-txt"><b>Cash</b></span>
              <b>{fmtMoney(cash, fiat)}</b>
            </div>
            <div className="wallet-hist-row">
              <span className="wallet-hist-txt"><b>Coins</b></span>
              <b>◉ {fmtCoins(coins)}</b>
            </div>
          </div>
        </section>

        <CoinConverter onConverted={loadConversions} />

        <section className="wallet-hist" aria-label="Recent conversions">
          <h3>Recent conversions</h3>
          {conversions !== null && conversions.length > 0 && (
            <div className="wallet-hist-list">
              {conversions.map((c) => (
                <div key={c.id} className="wallet-hist-row">
                  <span className="wallet-hist-txt">
                    <b>{fmtMoney(c.cashDebited, c.fiatCurrency)} → {c.coinsGained} coins</b>
                    <span>{fmtDate(c.createdAt)}</span>
                  </span>
                  <b className="wallet-hist-win">+{c.coinsGained} ◉</b>
                </div>
              ))}
            </div>
          )}
        </section>

        <WithdrawalAccountSection account={account} onSaved={(a) => setAccount(a)} />
        <WithdrawSection
          account={account}
          cash={cash}
          fiat={fiat}
          sym={sym}
          requests={requests}
          onRequested={loadRequests}
        />
      </div>
    </main>
  );
}

function WithdrawalAccountSection({
  account,
  onSaved,
}: {
  account: SavedAccount | null;
  onSaved: (a: SavedAccount) => void;
}) {
  const { toast } = useStore();
  const [type, setType] = useState<"bank" | "momo">("bank");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [network, setNetwork] = useState("MTN");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!account) return;
    setType(account.type === "momo" ? "momo" : "bank");
    setBankName(account.bankName ?? "");
    setAccountNumber(account.accountNumber ?? "");
    setNetwork(account.network ?? "MTN");
    setPhoneNumber(account.phoneNumber ?? "");
    setAccountName(account.accountName ?? "");
  }, [account]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ account: SavedAccount }>("/api/wallet/withdrawal-account", {
        method: "POST",
        body: JSON.stringify(
          type === "bank"
            ? { type, bankName, accountNumber, accountName }
            : { type, network, phoneNumber, accountName }
        ),
      });
      onSaved(r.account);
      toast("Withdrawal account saved", "win");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save the account");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="wallet-hist" aria-label="Withdrawal account">
      <h3>Withdrawal account</h3>
      {account && (
        <div className="wallet-hist-list">
          <div className="wallet-hist-row">
            <span className="wallet-hist-txt">
              <b>{account.type === "bank" ? `${account.bankName ?? "Bank"} • ${account.accountNumber ?? ""}` : `${account.network ?? "MoMo"} • ${account.phoneNumber ?? ""}`}</b>
              <span>{account.accountName}</span>
            </span>
          </div>
        </div>
      )}
      <form onSubmit={save}>
        <div className="cv-chips" role="group" aria-label="Account type">
          {(["bank", "momo"] as const).map((t) => (
            <button
              key={t}
              type="button"
              className="cv-chip"
              aria-pressed={type === t}
              onClick={() => setType(t)}
            >
              {t === "bank" ? "Bank" : "MoMo"}
            </button>
          ))}
        </div>
        {type === "bank" ? (
          <>
            <div className="rg48-f"><label htmlFor="waBank">Bank name</label><input id="waBank" type="text" value={bankName} onChange={(e) => setBankName(e.target.value)} required maxLength={80} /></div>
            <div className="rg48-f"><label htmlFor="waAcct">Account number</label><input id="waAcct" type="text" inputMode="numeric" autoComplete="off" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value.replace(/[^0-9]/g, ""))} required /></div>
          </>
        ) : (
          <>
            <div className="rg48-f"><label htmlFor="waNet">Network</label>
              <select id="waNet" value={network} onChange={(e) => setNetwork(e.target.value)}>
                <option value="MTN">MTN</option>
                <option value="Telecel">Telecel</option>
                <option value="AirtelTigo">AirtelTigo</option>
              </select>
            </div>
            <div className="rg48-f"><label htmlFor="waPhone">Phone number</label><input id="waPhone" type="tel" inputMode="tel" autoComplete="off" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value.replace(/[^0-9]/g, ""))} required /></div>
          </>
        )}
        <div className="rg48-f"><label htmlFor="waName">Account name</label><input id="waName" type="text" value={accountName} onChange={(e) => setAccountName(e.target.value)} required maxLength={80} /></div>
        <p className="rg48-err">{err}</p>
        <button className="btn btn-gold" type="submit" style={{ width: "100%" }} disabled={busy}>{busy ? "Saving…" : "Save account"}</button>
      </form>
    </section>
  );
}

function WithdrawSection({
  account,
  cash,
  fiat,
  sym,
  requests,
  onRequested,
}: {
  account: SavedAccount | null;
  cash: number;
  fiat: string;
  sym: string;
  requests: WithdrawalRow[] | null;
  onRequested: () => void;
}) {
  const { toast } = useStore();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>("MTN");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setNote(null);
    try {
      const r = await api<{ withdrawal: WithdrawalRow; note: string }>("/api/wallet/withdraw", {
        method: "POST",
        body: JSON.stringify({ amount: Number(amount), method }),
      });
      setNote(r.note);
      setAmount("");
      onRequested();
      toast(`Withdrawal requested — ${fmtMoney(r.withdrawal.amount, fiat)}`, "win");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="wallet-hist" aria-label="Withdraw">
      <h3>Withdraw</h3>
      <form onSubmit={submit}>
        <div className="rg48-f"><label htmlFor="wdAmt">Amount ({sym})</label><input id="wdAmt" type="number" min={0.01} step={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} required /></div>
        <div className="rg48-f"><label htmlFor="wdMethod">Method</label>
          <select id="wdMethod" value={method} onChange={(e) => setMethod(e.target.value)}>
            {WITHDRAWAL_METHODS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        {account && (
          <div className="wallet-hist-list">
            <div className="wallet-hist-row">
              <span className="wallet-hist-txt">
                <b>To: {account.type === "bank" ? `${account.bankName ?? "Bank"} • ${account.accountNumber ?? ""}` : `${account.network ?? "MoMo"} • ${account.phoneNumber ?? ""}`}</b>
                <span>{account.accountName}</span>
              </span>
            </div>
          </div>
        )}
        <p className="rg48-err">{err}</p>
        {note && <p className="rg48-mini">{note}</p>}
        <button className="btn btn-gold" type="submit" style={{ width: "100%" }} disabled={busy || cash <= 0}>{busy ? "Requesting…" : "Request withdrawal"}</button>
      </form>
      {requests !== null && requests.length > 0 && (
        <div className="wallet-hist-list" style={{ marginTop: 12 }}>
          {requests.map((w) => (
            <div key={w.id} className="wallet-hist-row">
              <span className="wallet-hist-txt">
                <b>{fmtMoney(w.amount, w.fiatCurrency)} · {w.method}</b>
                <span>{fmtDate(w.createdAt)}{w.accountDetail ? ` · ${w.accountDetail}` : ""}{w.reason ? ` · ${w.reason}` : ""}</span>
              </span>
              <b>{STATUS_LABELS[w.status] ?? w.status}</b>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
