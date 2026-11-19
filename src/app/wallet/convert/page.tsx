// Convert page (Nov 2026) — the money page. The converter moved off the
// wallet page and lives here, with the player's balances, recent
// conversions, the saved withdrawal account (bank or MoMo) and the
// withdraw request form. Forms, chips, lists and values only — no
// helper blurbs (Chuks had those removed). Withdrawals are requests
// only: the amount leaves your balance when an admin approves or rejects it (see /api/wallet/withdraw).
//
// Win logic (Nov 2026): the Balances section shows the Stake/Winnings
// split of the cash balance. The withdraw form itself lives in
// components/WithdrawSection.tsx, shared with the wallet page.

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, fmtMoney, fmtCoins } from "../../../lib/api";
import { symbolFor } from "../../../lib/country";
import { useStore } from "../../../lib/store";
import CoinConverter from "../../../components/CoinConverter";
import { WithdrawSection } from "../../../components/WithdrawSection";

interface ConversionRow {
  id: string;
  cashDebited: number;
  coinsGained: number;
  fiatCurrency: string;
  createdAt: string;
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function ConvertPage() {
  const { user, wallet, openAuth } = useStore();
  const [conversions, setConversions] = useState<ConversionRow[] | null>(null);

  const loadConversions = useCallback(() => {
    api<{ conversions: ConversionRow[] }>("/api/wallet/conversions")
      .then((r) => setConversions(r.conversions))
      .catch(() => setConversions([]));
  }, []);

  useEffect(() => {
    if (!user) return;
    loadConversions();
  }, [user, loadConversions]);

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
            {wallet?.stake !== undefined && (
              <>
                <div className="wallet-hist-row">
                  <span className="wallet-hist-txt"><b>Stake</b></span>
                  <b>{fmtMoney(wallet.stake, fiat)}</b>
                </div>
                <div className="wallet-hist-row">
                  <span className="wallet-hist-txt"><b>Winnings</b></span>
                  <b>{fmtMoney(wallet.winnings ?? 0, fiat)}</b>
                </div>
              </>
            )}
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

        <WithdrawSection
          cash={cash}
          stake={wallet?.stake}
          winnings={wallet?.winnings}
          fiat={fiat}
          sym={sym}
        />
      </div>
    </main>
  );
}
