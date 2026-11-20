// Wallet page (round 11) — the balance is the way in. The 3D Visa-style
// wallet card, the three balances, and a Deposit action that opens the
// existing DepositModal (via setDepositOpen in the store). Signed-out
// visitors get a login prompt, not balances.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, fmtMoney, fmtCoins, type GameHistoryRow, type DepositHistoryRow } from "../../lib/api";
import { symbolFor } from "../../lib/country";
import { getGame } from "../../lib/games";
import { useStore } from "../../lib/store";
import WalletCard from "../../components/WalletCard";
import CoinCard from "../../components/CoinCard";
import { WithdrawSection } from "../../components/WithdrawSection";

export default function WalletPage() {
  const { user, wallet, mode, simSession, topUpSim, openAuth, setDepositOpen } = useStore();
  // Round 31: wallet history — game rounds (/api/games/history) plus
  // deposits (/api/wallet/history), merged newest first. Conversions
  // and withdrawals still have no GET endpoint, so they are not listed.
  const [history, setHistory] = useState<GameHistoryRow[] | null>(null);
  const [deposits, setDeposits] = useState<DepositHistoryRow[] | null>(null);
  // Wallet tabs (Nov 2026): Deposit first and default, Withdrawal
  // second. Presentation only — the tabs switch which section shows.
  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");
  useEffect(() => {
    if (!user) return;
    let live = true;
    api<{ history: GameHistoryRow[] }>("/api/games/history?limit=20")
      .then((r) => { if (live) setHistory(r.history); })
      .catch(() => { if (live) setHistory([]); });
    api<{ deposits: DepositHistoryRow[] }>("/api/wallet/history?limit=20")
      .then((r) => { if (live) setDeposits(r.deposits); })
      .catch(() => { if (live) setDeposits([]); });
    return () => { live = false; };
  }, [user]);

  if (!user) {
    return (
      <main className="rg48-page-main">
        <div className="wrap">
          <h2>Wallet</h2>
          <button className="btn btn-gold" type="button" onClick={() => openAuth("login")}>Log in</button>
        </div>
      </main>
    );
  }

  const cash = wallet?.cash ?? user.cash ?? 0;
  // Round 12: in SIM mode the SIM card shows the LIVE session counter
  // (the money the user actually has to play with), not the server
  // value — the server value only changes at signup / daily claim.
  const sim = mode === "SIM" ? (simSession ?? wallet?.sim ?? user.sim ?? 0) : (wallet?.sim ?? user.sim ?? 0);
  const coins = wallet?.coins ?? user.coins ?? 0;
  // Phase 1 country-based (Nov 2026): the wallet shows the player's
  // own fiat everywhere; SIM is demo money in the same symbol.
  const fiat = user.currency ?? "GHS";
  const sym = symbolFor(fiat);
  // Wallet id, not a payment card — the last 4 of the user id, uppercased.
  const last4 = (user.id || "").replace(/[^a-z0-9]/gi, "").slice(-4).toUpperCase() || "0000";
  // Nov 2026: History merges game rounds and deposits, newest first.
  const mergedHistory: (
    | { kind: "game"; id: string; createdAt: string; h: GameHistoryRow }
    | { kind: "deposit"; id: string; createdAt: string; d: DepositHistoryRow }
  )[] = [
    ...(history ?? []).map((h) => ({ kind: "game" as const, id: h.id, createdAt: h.createdAt, h })),
    ...(deposits ?? []).map((d) => ({ kind: "deposit" as const, id: d.id, createdAt: d.createdAt, d })),
  ]
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, 20);
  const historyLoading = history === null || deposits === null;
  // Round 20: the Visa card shows the cash balance for the active mode —
  // REAL = cash, SIM = the SIM balance labelled SIM. The coins live on
  // their own coin card below, not in a pill tab.
  const cardBalance = mode === "SIM" ? fmtMoney(sim, fiat) : fmtMoney(cash, fiat);
  const cardLabel = mode === "SIM" ? "SIM Balance" : "Balance";

  return (
    <main className="rg48-page-main">
      <div className="wrap">
        <div className="rg48-hbar-in">
          <Link className="gp-back" href="/" aria-label="Back"><span className="gp-back-coin">←</span></Link>
          <h2>Wallet</h2>
        </div>
        {/* Round 20: two cards — the Visa card carries the cash balance
            for the active mode, the coin card carries the coins. Round
            20b: the last pill tab (SIM) is gone too — zero pill tabs on
            this page; the SIM balance lives on the Visa card in SIM mode. */}
        <div className="wallet-cards">
          <WalletCard holder={user.name} last4={last4} balance={cardBalance} balanceLabel={cardLabel} />
          <CoinCard holder={user.name} coins={fmtCoins(coins)} />
        </div>
        {/* Nov 2026: the SIM top-up lives next to the SIM balance — the
            Visa card above shows the SIM balance in SIM mode — and
            nowhere else on this page. It is a ghost button on purpose:
            play money must never look like the gold real Deposit
            button. SIM mode only; in REAL mode there is no SIM balance
            on this page, so there is no top-up either. */}
        {mode === "SIM" && (
          <div className="wallet-simtop">
            <button className="btn btn-ghost" type="button" onClick={topUpSim}>Top up SIM +{sym} 1,000</button>
            <p className="rg48-mini wallet-note">SIM is play money — top up anytime, it never touches your real cash.</p>
          </div>
        )}
        {/* Wallet tabs (Nov 2026): Deposit first and default, Withdrawal
            second. The Deposit tab holds the same deposit action in BOTH
            modes — the button opens the DepositModal (PayTeller /
            Theteller / demo by gateway). The SIM top-up is NOT here
            anymore: it lives next to the SIM balance above, SIM mode
            only — the Deposit tab never shows play money. */}
        <div className="wallet-tabs" role="tablist" aria-label="Deposit or withdraw">
          <button type="button" role="tab" aria-selected={tab === "deposit"} className={tab === "deposit" ? "on" : ""} onClick={() => setTab("deposit")}>Deposit</button>
          <button type="button" role="tab" aria-selected={tab === "withdraw"} className={tab === "withdraw" ? "on" : ""} onClick={() => setTab("withdraw")}>Withdrawal</button>
        </div>
        {tab === "deposit" ? (
          <div className="wallet-tab-panel">
            <button className="btn btn-gold wallet-dep" type="button" onClick={() => setDepositOpen(true)}>Deposit</button>
          </div>
        ) : null}
        {/* Win logic (Nov 2026): the Stake/Winnings split of the cash
            balance — REAL mode only (in SIM mode the card shows the SIM
            balance). Shown once the wallet split has loaded. */}
        {mode === "REAL" && wallet?.stake !== undefined && (
          <section className="wallet-hist" aria-label="Cash split">
            <div className="wallet-hist-list">
              <div className="wallet-hist-row">
                <span className="wallet-hist-txt"><b>Stake</b></span>
                <b>{fmtMoney(wallet.stake, fiat)}</b>
              </div>
              <div className="wallet-hist-row">
                <span className="wallet-hist-txt"><b>Winnings</b></span>
                <b>{fmtMoney(wallet.winnings ?? 0, fiat)}</b>
              </div>
            </div>
          </section>
        )}
        {/* Withdraw (Nov 2026): the wallet page had no withdraw option —
            the same request form as the Convert page, same endpoint.
            Lives under the Withdrawal tab now; the form is untouched. */}
        {tab === "withdraw" ? (
          <div className="wallet-tab-panel">
            <WithdrawSection
              cash={cash}
              stake={wallet?.stake}
              winnings={wallet?.winnings}
              fiat={fiat}
              sym={sym}
            />
          </div>
        ) : null}
        {/* Nov 2026: History — game rounds and deposits, newest first.
            Deposits carry amount / method / date / status. */}
        <section className="wallet-hist" aria-label="Wallet history">
          <h3>History</h3>
          {historyLoading ? (
            <p>Loading history…</p>
          ) : mergedHistory.length === 0 ? null : (
            <div className="wallet-hist-list">
              {mergedHistory.map((row) => {
                if (row.kind === "deposit") {
                  const d = row.d;
                  const statusLabel =
                    d.status === "successful" ? "Successful"
                    : d.status === "failed" ? "Failed"
                    : d.status === "expired" ? "Expired"
                    : d.status === "processing" ? "Processing" : "Pending";
                  const amtClass =
                    d.status === "successful" ? "wallet-hist-win"
                    : d.status === "failed" || d.status === "expired" ? "wallet-hist-lose"
                    : "wallet-hist-pend";
                  // The "+" is earned only when the money actually landed.
                  const amtTxt = d.status === "successful"
                    ? `+${fmtMoney(d.amount, d.fiatCurrency)}`
                    : fmtMoney(d.amount, d.fiatCurrency);
                  return (
                    <div key={d.id} className="wallet-hist-row">
                      <span className="wallet-hist-txt">
                        <b>Deposit</b>
                        <span>{new Date(d.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {d.method} · {statusLabel}</span>
                      </span>
                      <b className={amtClass}>{amtTxt}</b>
                    </div>
                  );
                }
                const h = row.h;
                const net = Number(h.payout || 0) - Number(h.stake || 0);
                const isCoin = h.currency === "coins";
                // Phase 1 country-based (Nov 2026): each round carries
                // its own fiat — use it, not the viewer's.
                const rowFiat = h.fiatCurrency ?? fiat;
                const netTxt = isCoin
                  ? `${net >= 0 ? "+" : "−"}${Math.abs(Math.round(net))} coins`
                  : `${net >= 0 ? "+" : "−"}${fmtMoney(Math.abs(net), rowFiat)}`;
                return (
                  <div key={h.id} className="wallet-hist-row">
                    <span className="wallet-hist-txt">
                      <b>{getGame(h.game)?.name || h.game}</b>
                      <span>{new Date(h.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {isCoin ? `${fmtCoins(h.stake)} coins staked` : `${fmtMoney(h.stake, rowFiat)} staked`}</span>
                    </span>
                    <b className={net >= 0 ? "wallet-hist-win" : "wallet-hist-lose"}>{netTxt}</b>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
