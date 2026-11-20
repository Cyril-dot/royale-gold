// Owner Gateway & payments (Phase 3 restyle) — split out of the old
// one-page owner panel (deleted in Phase 4). Same endpoints,
// same behaviour, staff-ui throughout: payment-method cards, PayTeller
// gateway section, wallet config, currency settings.
"use client";

import { useMemo } from "react";
import { api } from "../../../../lib/api";
import { useStore } from "../../../../lib/store";
import { useOwner } from "../../../../components/owner/OwnerContext";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";
import { Card } from "../../../../components/staff-ui/Card";
import { Skeleton, ErrorState, EmptyState } from "../../../../components/staff-ui/Feedback";
import { OwnerPayRow } from "../../../../components/owner/OwnerPayRow";
import { OwnerWalletForm } from "../../../../components/owner/OwnerWalletForm";
import { OwnerCurrencyConfig } from "../../../../components/owner/OwnerCurrencyConfig";
import { OwnerFixedDeposit } from "../../../../components/owner/OwnerFixedDeposit";
import { OwnerWinRate } from "../../../../components/owner/OwnerWinRate";
import { OwnerWinException } from "../../../../components/owner/OwnerWinException";
import { OwnerGatewaySection } from "../../../../components/owner/OwnerGatewaySection";
import { useOwnerFetch } from "../../../../components/owner/useOwnerFetch";

export default function OwnerGatewayPage() {
  const { user, toast } = useStore();
  const { fiat } = useOwner();
  // P0 Batch 2 (O12): payment methods — enable/disable + per-method min/max.
  // Phase 1 country-based (Nov 2026): one row per (method × currency) —
  // the list below shows the selected fiat's methods only.
  interface OwnerPayMethod { method: string; enabled: boolean; minDeposit: number | null; maxDeposit: number | null; fiatCurrency: string; gateway?: string | null }
  const payUrl = useMemo(() => (user ? `/api/owner/payment-methods?currency=${fiat}` : null), [user, fiat]);
  const { data: payData, err: payErr, loading: payLoading, reload: reloadPay } =
    useOwnerFetch<{ methods: OwnerPayMethod[] }>(payUrl);
  const ownerPay = payData?.methods ?? [];
  const saveOwnerPay = async (method: string, patch: Partial<OwnerPayMethod>) => {
    try {
      await api(`/api/owner/payment-methods/${method}`, { method: "POST", body: JSON.stringify({ ...patch, currency: fiat }) });
      toast(`${method} updated`, "win");
      reloadPay();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Update failed", "lose");
    }
  };

  // P0 Batch 2 (O13): wallet config — the platform rules for both wallets.
  interface OwnerWalletCfg { globalKill: boolean; cashMinDeposit: number; cashMinStake: number; coinMinStake: number; conversionRate: number; coinsWithdrawable: boolean }
  const { data: ownerWallet, err: walletErr, loading: walletLoading, reload: reloadWallet } =
    useOwnerFetch<OwnerWalletCfg>(user ? "/api/owner/wallet-config" : null);
  const saveOwnerWallet = async (patch: Partial<OwnerWalletCfg>) => {
    try {
      await api("/api/owner/wallet-config", { method: "POST", body: JSON.stringify(patch) });
      toast("Wallet config saved", "win");
      reloadWallet();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Update failed", "lose");
    }
  };

  return (
    <div>
      <PageHeader title="Gateway & payments" sub="Payment methods, Ghana MoMo gateway, wallet and currency config." />
      <OwnerRangeBar />
      <Card title="Payment methods">
        {payLoading ? (
          <Skeleton lines={4} />
        ) : payErr ? (
          <ErrorState text={payErr} onRetry={reloadPay} />
        ) : ownerPay.length === 0 ? (
          <EmptyState title="No payment methods." text="No payment methods for this currency." />
        ) : (
          ownerPay.map((m) => <OwnerPayRow key={m.method} m={m} onSave={saveOwnerPay} />)
        )}
      </Card>

      <Card title="Ghana MoMo gateway">
        <OwnerGatewaySection />
      </Card>

      <Card title="Wallet config">
        {walletLoading ? (
          <Skeleton lines={4} />
        ) : walletErr ? (
          <ErrorState text={walletErr} onRetry={reloadWallet} />
        ) : ownerWallet ? (
          <OwnerWalletForm key={JSON.stringify(ownerWallet)} w={ownerWallet} onSave={saveOwnerWallet} />
        ) : null}
      </Card>

      <Card title="Currency settings">
        <OwnerCurrencyConfig />
      </Card>

      <Card title="Fixed deposit amount">
        <OwnerFixedDeposit />
      </Card>

      <Card title="Win rate — max winnings per deposit">
        <OwnerWinRate />
      </Card>

      <Card title="Random win exception">
        <OwnerWinException />
      </Card>
    </div>
  );
}
