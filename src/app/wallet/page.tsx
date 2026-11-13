// Wallet page (round 11) — the balance is the way in. The 3D Visa-style
// wallet card, the three balances, and a Deposit action that opens the
// existing DepositModal (via setDepositOpen in the store). Signed-out
// visitors get a login prompt, not balances.

"use client";

import Link from "next/link";
import { fmtCash, fmtCoins } from "../../lib/api";
import { useStore } from "../../lib/store";
import WalletCard from "../../components/WalletCard";
import CoinConverter from "../../components/CoinConverter";

export default function WalletPage() {
  const { user, wallet, mode, simSession, topUpSim, openAuth, setDepositOpen } = useStore();

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
  // Round 12: in SIM mode the SIM card shows the LIVE session counter
  // (the money the user actually has to play with), not the server
  // value — the server value only changes at signup / daily claim.
  const sim = mode === "SIM" ? (simSession ?? wallet?.sim ?? user.sim ?? 0) : (wallet?.sim ?? user.sim ?? 0);
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
        {/* Round 12: SIM mode is demo-only — the action is an instant
            SIM top-up, never a real-money deposit. */}
        {mode === "SIM" ? (
          <button className="btn btn-gold wallet-dep" type="button" onClick={topUpSim}>Top up SIM +GH₵ 1,000</button>
        ) : (
          <button className="btn btn-gold wallet-dep" type="button" onClick={() => setDepositOpen(true)}>Deposit</button>
        )}
        {mode === "SIM" && (
          <p className="rg48-mini wallet-note">SIM is play money — top up anytime, it never touches your real cash.</p>
        )}
        {/* Round 16: convert REAL cash to coins at GH₵5 = 1 coin. The
            deposit centre above stays as-is; this section is the new work.
            (The "coins are play-only" line lives inside the converter now.) */}
        <CoinConverter />
      </div>
    </main>
  );
}
