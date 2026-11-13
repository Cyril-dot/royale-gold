// Wallet page (round 11) — the balance is the way in. The 3D Visa-style
// wallet card, the three balances, and a Deposit action that opens the
// existing DepositModal (via setDepositOpen in the store). Signed-out
// visitors get a login prompt, not balances.

"use client";

import Link from "next/link";
import { fmtCash, fmtCoins } from "../../lib/api";
import { useStore } from "../../lib/store";
import WalletCard from "../../components/WalletCard";

export default function WalletPage() {
  const { user, wallet, openAuth, setDepositOpen } = useStore();

  if (!user) {
    return (
      <main className="rg48-page-main">
        <div className="wrap">
          <h2>Wallet</h2>
          <p>Log in to see your wallet.</p>
          <button className="btn btn-gold" type="button" onClick={() => openAuth("login")}>Log in</button>
        </div>
      </main>
    );
  }

  const cash = wallet?.cash ?? user.cash ?? 0;
  const sim = wallet?.sim ?? user.sim ?? 0;
  const coins = wallet?.coins ?? user.coins ?? 0;
  // Wallet id, not a payment card — the last 4 of the user id, uppercased.
  const last4 = (user.id || "").replace(/[^a-z0-9]/gi, "").slice(-4).toUpperCase() || "0000";

  return (
    <main className="rg48-page-main">
      <div className="wrap">
        <div className="rg48-hbar-in">
          <Link className="gp-back" href="/" aria-label="Back"><span className="gp-back-coin">←</span></Link>
          <h2>Wallet</h2>
        </div>
        <WalletCard holder={user.name} last4={last4} />
        <div className="sum-cards wallet-bals">
          <div className="sum-card"><span>Cash</span><b>{fmtCash(cash)}</b></div>
          <div className="sum-card"><span>SIM</span><b>{fmtCash(sim)}</b></div>
          <div className="sum-card"><span>Coins</span><b>{fmtCoins(coins)}</b></div>
        </div>
        <button className="btn btn-gold wallet-dep" type="button" onClick={() => setDepositOpen(true)}>Deposit</button>
        <p className="rg48-mini wallet-note">Coins are play-only — never withdrawable.</p>
      </div>
    </main>
  );
}
