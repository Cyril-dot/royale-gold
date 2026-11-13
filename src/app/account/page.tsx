// Account page — profile, two balances, referral-code redeem field,
// daily coin claim, logout.

"use client";

import { useState } from "react";
import Link from "next/link";
import { api, fmtCash, fmtCoins } from "../../lib/api";
import { useStore } from "../../lib/store";

export default function AccountPage() {
  const { user, wallet, openAuth, logout, toast, refresh } = useStore();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [claimBusy, setClaimBusy] = useState(false);

  if (!user) {
    return (
      <main className="rg48-page-main"><div className="wrap">
        <h2>My <em>account</em></h2>
        <p>Log in to see your account.</p>
        <button className="btn btn-gold" type="button" onClick={() => openAuth("login")}>Log in</button>
      </div></main>
    );
  }

  const cash = wallet?.cash ?? user.cash;
  const coins = wallet?.coins ?? user.coins;
  const sim = wallet?.sim ?? user.sim;

  const redeem = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ coins: number; redeemedCode: string; bonusCoins: number }>("/api/account/redeem", {
        method: "POST",
        body: JSON.stringify({ code: code.trim().toUpperCase() }),
      });
      toast(`Redeemed ${r.redeemedCode} — +${r.bonusCoins} coins`, "win");
      setCode("");
      await refresh();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Redeem failed", "lose");
    } finally { setBusy(false); }
  };

  const claimCoins = async () => {
    setClaimBusy(true);
    try {
      await api("/api/rewards/claim", { method: "POST", body: JSON.stringify({ type: "coins" }) });
      toast("+5 coins claimed", "win");
      await refresh();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Claim failed", "lose");
    } finally { setClaimBusy(false); }
  };

  return (
    <main className="rg48-page-main">
      <div className="wrap">
        <div className="rg48-hbar-in">
          <Link className="gp-back" href="/" aria-label="Back"><span className="gp-back-coin">←</span></Link>
          <h2>My <em>account</em></h2>
        </div>
        <section className="admin-sec">
          <h3>{user.name}</h3>
          <p>{user.email || user.phone || "—"} · {user.role === "owner" ? "Owner" : user.role === "admin" ? "Admin" : "Player"} · Joined {new Date(user.createdAt).toLocaleDateString("en-GB")}</p>
          {user.referralCodeUsed && <p>Referred with code {user.referralCodeUsed}</p>}
          <div className="sum-cards">
            <div className="sum-card"><span>CASH</span><b>{fmtCash(cash)}</b></div>
            <div className="sum-card"><span>COINS</span><b>{fmtCoins(coins)}</b></div>
            <div className="sum-card"><span>SIM</span><b>{fmtCoins(sim)}</b></div>
            <div className="sum-card"><span>LEVEL</span><b>{user.level} · {user.xp} XP</b></div>
          </div>
          <p className="rg48-mini">Coins are play-only — they can never be withdrawn or swapped for cash.</p>
        </section>
        <section className="admin-sec">
          <h3>Redeem a referral code — +5 coins</h3>
          <p className="rg48-mini">One code per account, ever. If you registered with a code, this is already used.</p>
          <form className="code-form" onSubmit={redeem}>
            <input type="text" placeholder="e.g. RG-DEMO1" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required />
            <button className="btn btn-gold" type="submit" disabled={busy}>{busy ? "Redeeming…" : "Redeem · +5 coins"}</button>
          </form>
        </section>
        <section className="admin-sec">
          <h3>Daily bonus</h3>
          <p>Claim your daily +5 coins.</p>
          <button className="btn btn-gold" type="button" onClick={() => void claimCoins()} disabled={claimBusy}>{claimBusy ? "Claiming…" : "Claim daily +5 coins"}</button>
        </section>
        <section className="admin-sec">
          <h3>Session</h3>
          <p><Link className="linklike" href="/settings">Settings — profile, password, preferences →</Link></p>
          {(user.role === "admin" || user.role === "owner") && <p><Link className="linklike" href="/admin">Open admin panel →</Link></p>}
          {user.role === "owner" && <p><Link className="linklike" href="/owner">Open owner panel →</Link></p>}
          <button className="btn btn-ghost" type="button" onClick={() => void logout()}>Log out</button>
        </section>
      </div>
    </main>
  );
}
