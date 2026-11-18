// Owner Gateway & payments (Phase 2) — split out of the old one-page owner panel
// (src/app/owner/legacy/page.tsx). Same sections, same endpoints, same
// behaviour — now its own route, loading only its own data.
"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../../../lib/api";
import { useStore } from "../../../../lib/store";
import { useOwner } from "../../../../components/owner/OwnerContext";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";
import { OwnerPayRow } from "../../../../components/owner/OwnerPayRow";
import { OwnerWalletForm } from "../../../../components/owner/OwnerWalletForm";
import { OwnerCurrencyConfig } from "../../../../components/owner/OwnerCurrencyConfig";
import { OwnerGatewaySection } from "../../../../components/owner/OwnerGatewaySection";

export default function OwnerGatewayPage() {
  const { user, toast } = useStore();
  const { fiat } = useOwner();
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
  useEffect(() => { if (user) void loadOwnerPay(); }, [loadOwnerPay, user]);
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
  useEffect(() => { if (user) void loadOwnerWallet(); }, [loadOwnerWallet, user]);
  const saveOwnerWallet = async (patch: Partial<OwnerWalletCfg>) => {
    try {
      await api("/api/owner/wallet-config", { method: "POST", body: JSON.stringify(patch) });
      toast("Wallet config saved", "win");
      await loadOwnerWallet();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Update failed", "lose");
    }
  };
  return (
    <div>
      <PageHeader title="Gateway & payments" sub="Payment methods, PayTeller gateway, wallet and currency config." />
      <OwnerRangeBar />
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

      <section className="admin-sec">
      <h3>PayTeller gateway</h3>
      <OwnerGatewaySection />
      </section>

      <section className="admin-sec">
      <h3>Wallet config</h3>
      {ownerWallet === null ? <p>Loading wallet config…</p> : (
        <OwnerWalletForm key={JSON.stringify(ownerWallet)} w={ownerWallet} onSave={saveOwnerWallet} />
      )}
      </section>

      <section className="admin-sec">
      <h3>Currency settings</h3>
      <OwnerCurrencyConfig />
      </section>
    </div>
  );
}
