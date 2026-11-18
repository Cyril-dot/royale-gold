// Wallet page (round 11) — the balance is the way in. The 3D Visa-style
// wallet card, the three balances, and a Deposit action that opens the
// existing DepositModal (via setDepositOpen in the store). Signed-out
// visitors get a login prompt, not balances.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, fmtMoney, fmtCoins, type GameHistoryRow } from "../../lib/api";
import { symbolFor } from "../../lib/country";
import { getGame } from "../../lib/games";
import { useStore } from "../../lib/store";
import WalletCard from "../../components/WalletCard";
import CoinCard from "../../components/CoinCard";
import { WithdrawSection } from "../../components/WithdrawSection";

export default function WalletPage() {
  const { user, wallet, mode, simSession, topUpSim, openAuth, setDepositOpen } = useStore();
  // Round 31: wallet history — game rounds are the only money movement
  // retrievable without a new API (/api/games/history). Deposits and
  // conversions have no GET endpoint (and withdrawals are not tracked at
  // all), so they cannot be listed.
  const [history, setHistory] = useState<GameHistoryRow[] | null>(null);
  useEffect(() => {
    if (!user) return;
    let live = true;
    api<{ history: GameHistoryRow[] }>("/api/games/history?limit=20")
      .then((r) => { if (live) setHistory(r.history); })
      .catch(() => { if (live) setHistory([]); });
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
        {/* Round 12: SIM mode is demo-only — the action is an instant
            SIM top-up, never a real-money deposit. */}
        {mode === "SIM" ? (
          <button className="btn btn-gold wallet-dep" type="button" onClick={topUpSim}>Top up SIM +{sym} 1,000</button>
        ) : (
          <button className="btn btn-gold wallet-dep" type="button" onClick={() => setDepositOpen(true)}>Deposit</button>
        )}
        {mode === "SIM" && (
          <p className="rg48-mini wallet-note">SIM is play money — top up anytime, it never touches your real cash.</p>
        )}
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
            the same request form as the Convert page, same endpoint. */}
        <WithdrawSection
          cash={cash}
          stake={wallet?.stake}
          winnings={wallet?.winnings}
          fiat={fiat}
          sym={sym}
        />
        {/* Round 31: History — recent game rounds (stake out, payout in),
            the only wallet movement an existing endpoint returns. */}
        <section className="wallet-hist" aria-label="Wallet history">
          <h3>History</h3>
          {history === null ? (
            <p>Loading history…</p>
          ) : history.length === 0 ? null : (
            <div className="wallet-hist-list">
              {history.map((h) => {
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
