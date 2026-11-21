// Withdraw (Nov 2026) — the saved withdrawal account (bank or MoMo)
// and the withdraw request form, shared by the Convert page and the
// Wallet page (Chuks: the wallet page had no withdraw option). One
// implementation, one endpoint (POST /api/wallet/withdraw), same
// saved-account flow. Withdrawals are requests only: the amount leaves
// your balance when an admin approves or rejects it (see /api/wallet/withdraw).
//
// Win logic (Nov 2026): the form shows the Stake/Winnings split of
// the entered amount — withdrawals draw from Winnings first, then
// Stake. That is a display rule only: the request itself is validated
// against the total cash balance, and no balance is debited at request
// time (request-only by design). No max-win wording anywhere here.
"use client";

import { useCallback, useEffect, useState } from "react";
import { api, fmtMoney } from "../lib/api";
import { useFiat } from "../lib/use-fiat";
import { WITHDRAWAL_METHODS } from "../lib/withdrawal-flags";
import { useStore } from "../lib/store";

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

export function WithdrawSection({
  cash,
  stake,
  winnings,
  fiat,
  sym,
}: {
  cash: number;
  stake?: number;
  winnings?: number;
  fiat: string;
  sym: string;
}) {
  const [account, setAccount] = useState<SavedAccount | null>(null);
  const [requests, setRequests] = useState<WithdrawalRow[] | null>(null);

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
    loadRequests();
    loadAccount();
  }, [loadRequests, loadAccount]);

  return (
    <>
      <WithdrawalAccountSection account={account} onSaved={(a) => setAccount(a)} />
      <WithdrawForm
        account={account}
        cash={cash}
        stake={stake}
        winnings={winnings}
        fiat={fiat}
        sym={sym}
        requests={requests}
        onRequested={loadRequests}
      />
    </>
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

function WithdrawForm({
  account,
  cash,
  stake,
  winnings,
  fiat,
  sym,
  requests,
  onRequested,
}: {
  account: SavedAccount | null;
  cash: number;
  stake?: number;
  winnings?: number;
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
  // Owner-set max withdrawal for this fiat (null = no max) — shown
  // under the amount field so players see the cap before submitting.
  const { withdrawalMax } = useFiat(fiat);

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

  // Win logic: a request draws from Winnings first, then Stake.
  const amt = Number(amount);
  const showSplit =
    Number.isFinite(amt) && amt > 0 && stake !== undefined && winnings !== undefined;
  const fromWinnings = showSplit ? Math.min(Math.max(0, amt), winnings) : 0;
  const fromStake = showSplit ? Math.max(0, Math.round((amt - fromWinnings) * 100) / 100) : 0;

  return (
    <section className="wallet-hist" aria-label="Withdraw">
      <h3>Withdraw</h3>
      <form onSubmit={submit}>
        <div className="rg48-f"><label htmlFor="wdAmt">Amount ({sym})</label><input id="wdAmt" type="number" min={0.01} step={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} required /></div>
        {withdrawalMax !== null && (
          <p className="rg48-mini">Max {fmtMoney(withdrawalMax, fiat)} per withdrawal</p>
        )}
        <div className="rg48-f"><label htmlFor="wdMethod">Method</label>
          <select id="wdMethod" value={method} onChange={(e) => setMethod(e.target.value)}>
            {WITHDRAWAL_METHODS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        {showSplit && (
          <p className="rg48-mini">
            {fmtMoney(fromWinnings, fiat)} from Winnings · {fmtMoney(fromStake, fiat)} from Stake
          </p>
        )}
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
