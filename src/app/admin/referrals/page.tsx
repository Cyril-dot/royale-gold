// Admin dashboard — Referrals (Phase 6 restyle). The referral codes +
// promo codes + referred-users list, on the shared DataTable with masked
// contacts (audited Reveal). List / Tree are real routes per Chuks's tab
// rule — this page is the List; the tree lives at /admin/referrals/tree.
// Same endpoints as before; no behaviour change.
"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "../../../lib/api";
import { fmtStaffMoney } from "../../../components/staff-ui/format";
import { symbolFor } from "../../../lib/country";
import { useStore } from "../../../lib/store";
import { useStaffFetch } from "../../../components/staff-ui/useStaffFetch";
import { PageHeader } from "../../../components/staff-ui/PageHeader";
import { Card } from "../../../components/staff-ui/Card";
import { DataTable, type DataColumn } from "../../../components/staff-ui/DataTable";
import { Tabs } from "../../../components/staff-ui/Tabs";
import { StatusPill } from "../../../components/staff-ui/Badge";
import { Button } from "../../../components/staff-ui/Button";
import { Input, Select, FormField } from "../../../components/staff-ui/Form";
import { CopyButton } from "../../../components/staff-ui/CopyButton";
import { Skeleton, ErrorState } from "../../../components/staff-ui/Feedback";
import { AdminContactValue } from "../../../components/admin/AdminReveal";
import { canAccessSection } from "../../../lib/rbac";
import { shareLink, type AdminIdentity, type PromoCodeRow, type ReferralsData } from "../../../lib/admin-client";

type ReferredUser = ReferralsData["referredUsers"][number];

export default function AdminReferralsPage() {
  return (
    <Suspense fallback={<Skeleton lines={6} title />}>
      <AdminReferralsInner />
    </Suspense>
  );
}

function AdminReferralsInner() {
  const { user, toast } = useStore();
  const sp = useSearchParams();
  const previewId = sp.get("preview");
  const preview = !!previewId;
  const [newCode, setNewCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoAmount, setPromoAmount] = useState("");
  const [promoCurrency, setPromoCurrency] = useState<"cash" | "coins">("cash");
  const [promoMaxUses, setPromoMaxUses] = useState("10");
  const [promoExpires, setPromoExpires] = useState("");
  const [promoBusy, setPromoBusy] = useState(false);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const ctxUrl = useMemo(() => {
    if (!user) return null;
    return previewId ? `/api/owner/admins/${previewId}/preview` : "/api/admin/context";
  }, [user, previewId]);
  const ctx = useStaffFetch<{ admin: AdminIdentity }>(ctxUrl);
  const refUrl = useMemo(() => {
    if (!user) return null;
    return previewId ? `/api/owner/admins/${previewId}/preview` : "/api/admin/referrals";
  }, [user, previewId]);
  const ref = useStaffFetch<ReferralsData>(refUrl);
  const promoUrl = useMemo(() => {
    if (!user) return null;
    return previewId ? `/api/admin/promo-codes?adminId=${previewId}` : "/api/admin/promo-codes";
  }, [user, previewId]);
  const promos = useStaffFetch<{ codes: PromoCodeRow[] }>(promoUrl);

  const data = ref.data;
  const admin = ctx.data?.admin;
  const err = ctx.err || ref.err;

  const createCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/admin/codes", { method: "POST", body: JSON.stringify({ code: newCode.trim() || undefined }) });
      setNewCode("");
      toast("Referral code created", "win");
      ref.reload();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not create code", "lose");
    } finally {
      setBusy(false);
    }
  };

  const createPromo = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(promoAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast("Enter a bonus amount above 0", "lose");
      return;
    }
    setPromoBusy(true);
    try {
      await api("/api/admin/promo-codes", {
        method: "POST",
        body: JSON.stringify({
          code: promoCode.trim() || undefined,
          bonusAmount: amount,
          bonusCurrency: promoCurrency,
          maxUses: Number(promoMaxUses) || 1,
          ...(promoExpires ? { expiresAt: promoExpires } : {}),
        }),
      });
      setPromoCode("");
      setPromoAmount("");
      setPromoExpires("");
      toast("Promo code created", "win");
      promos.reload();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not create promo code", "lose");
    } finally {
      setPromoBusy(false);
    }
  };

  if (!user) return null;
  if (!previewId && !canAccessSection(user, "referrals")) {
    return (
      <ErrorState
        title="No access to this section."
        text="You do not have access to the Referrals section. Ask the owner to grant you access from the Owner panel."
      />
    );
  }

  const withPreview = (href: string) => (previewId ? `${href}?preview=${previewId}` : href);
  const playerHref = (id: string) => withPreview(`/admin/players/${id}`);
  const needle = q.trim().toLowerCase();
  const users = (data?.referredUsers ?? []).filter(
    (u) => !needle || `${u.name} ${u.email ?? ""} ${u.phone ?? ""} ${u.referralCodeUsed ?? ""}`.toLowerCase().includes(needle),
  );
  const totalPages = Math.max(1, Math.ceil(users.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = users.slice((safePage - 1) * pageSize, safePage * pageSize);

  const userColumns: DataColumn<ReferredUser>[] = [
    {
      key: "player",
      label: "Player",
      render: (u) => u.name,
      sub: (u) => `Joined ${new Date(u.createdAt).toLocaleDateString("en-GB")}`,
    },
    {
      key: "contact",
      label: "Contact",
      render: (u) => <AdminContactValue userId={u.id} contact={u.email || u.phone} preview={preview} />,
      // The phone card renders details, not the cell — the masked
      // component (with audited Reveal) must live here too, never the
      // raw contact (D1: masked by default on every width).
      details: (u) => [
        ["Contact", <AdminContactValue key="contact-value" userId={u.id} contact={u.email || u.phone} preview={preview} />],
      ],
    },
    {
      key: "code",
      label: "Code used",
      render: (u) => (u.referralCodeUsed ? <span className="st-mono">{u.referralCodeUsed}</span> : "—"),
      details: (u) => [["Code used", u.referralCodeUsed ?? "—"]],
    },
  ];

  const promoColumns: DataColumn<PromoCodeRow>[] = [
    {
      key: "code",
      label: "Code",
      render: (c) => <span className="st-mono">{c.code}</span>,
    },
    {
      key: "bonus",
      label: "Bonus",
      render: (c) =>
        c.bonusCurrency === "cash" ? fmtStaffMoney(c.bonusAmount, user?.currency ?? "GHS") : `${c.bonusAmount} coins`,
      details: (c) => [
        ["Bonus", c.bonusCurrency === "cash" ? fmtStaffMoney(c.bonusAmount, user?.currency ?? "GHS") : `${c.bonusAmount} coins`],
      ],
    },
    {
      key: "uses",
      label: "Uses left",
      render: (c) => `${c.usesLeft} of ${c.maxUses}`,
      details: (c) => [["Uses left", `${c.usesLeft} of ${c.maxUses}`]],
    },
    {
      key: "expiry",
      label: "Expiry",
      render: (c) => (c.expired ? "Expired" : c.expiresAt ? `Expires ${new Date(c.expiresAt).toLocaleDateString("en-GB")}` : "No expiry"),
      details: (c) => [
        ["Expiry", c.expired ? "Expired" : c.expiresAt ? `Expires ${new Date(c.expiresAt).toLocaleDateString("en-GB")}` : "No expiry"],
      ],
    },
  ];

  return (
    <div>
      <PageHeader
        title="Referrals"
        sub={
          admin
            ? `${admin.name} · ${admin.commissionPct}% commission${admin.active ? "" : " · DEACTIVATED"}`
            : "Your referral codes, promo codes and referred players."
        }
        backHref={withPreview("/admin")}
        backLabel="Overview"
      />
      <Tabs
        label="Referrals views"
        items={[
          { id: "list", label: "List", href: withPreview("/admin/referrals"), exact: true },
          { id: "tree", label: "Tree", href: withPreview("/admin/referrals/tree") },
        ]}
      />
      {err ? (
        <ErrorState title="Could not load referrals." text={err} onRetry={() => { ctx.reload(); ref.reload(); promos.reload(); }} />
      ) : !data ? (
        <Skeleton lines={6} title />
      ) : (
        <>
          <Card
            title="Referral — share your link"
            sub={`Your link earns you ${admin?.commissionPct ?? 10}% commission on their deposits. New players get 5 extra coins.`}
          >
            {data.codes.length === 0 ? <p>No codes yet — create one below.</p> : null}
            {data.codes.map((c) => (
              <div key={c.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span className="st-mono">
                  <b>{c.code}</b>
                </span>{" "}
                <StatusPill status={c.active ? "Active" : "Inactive"} />
                <span className="st-btn-row">
                  <CopyButton text={c.code} label="Copy code" />
                  <CopyButton text={shareLink(c.code)} label="Copy link" />
                </span>
                <span className="st-mono">{shareLink(c.code)}</span>
              </div>
            ))}
            {!preview ? (
              <form onSubmit={createCode} style={{ marginTop: 12 }}>
                <FormField label="Custom code" hint="Blank = auto. RG- followed by 4–12 letters or digits.">
                  <Input
                    type="text"
                    placeholder="Custom code e.g. RG-GOLD1 (blank = auto)"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                    pattern="RG-[A-Z0-9]{4,12}"
                    title="RG- followed by 4–12 letters or digits"
                    aria-label="Custom referral code"
                  />
                </FormField>
                <Button type="submit" loading={busy}>
                  Create code
                </Button>
              </form>
            ) : null}
          </Card>

          <Card
            title="Promo codes"
            sub="Any player can redeem a promo code for a bonus — it is not tied to a referral. Expired or fully-used codes are rejected."
          >
            <DataTable<PromoCodeRow>
              viewId="admin-promo-codes"
              columns={promoColumns}
              rows={promos.data?.codes ?? []}
              total={promos.data?.codes.length ?? 0}
              page={1}
              pageSize={25}
              onPageChange={() => {}}
              loading={promos.loading}
              error={promos.err}
              onRetry={promos.reload}
              emptyTitle="No promo codes yet."
              emptyText="Create one below — any player can redeem it for a bonus."
              expandable
              expandRender={(c) =>
                c.redemptions.length > 0 ? (
                  <p>
                    Redeemed by:{" "}
                    {c.redemptions.map((r) => `${r.userName} (${new Date(r.redeemedAt).toLocaleDateString("en-GB")})`).join(", ")}
                  </p>
                ) : (
                  <p>No redemptions yet.</p>
                )
              }
            />
            {!preview ? (
              <form onSubmit={createPromo} style={{ marginTop: 12 }}>
                <div className="st-form-row st-form-row-2">
                  <FormField label="Code (optional)">
                    <Input
                      type="text"
                      placeholder="Blank = auto"
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                      aria-label="Promo code"
                    />
                  </FormField>
                  <FormField label="Bonus amount" required>
                    <Input
                      type="number"
                      min={0}
                      step={promoCurrency === "cash" ? "0.01" : "1"}
                      inputMode="decimal"
                      placeholder={promoCurrency === "cash" ? "0.00" : "0"}
                      value={promoAmount}
                      onChange={(e) => setPromoAmount(e.target.value)}
                      aria-label="Promo bonus amount"
                      required
                    />
                  </FormField>
                  <FormField label="Bonus in">
                    <Select
                      value={promoCurrency}
                      onChange={(e) => setPromoCurrency(e.target.value as "cash" | "coins")}
                      aria-label="Promo bonus currency"
                    >
                      <option value="cash">Cash ({symbolFor(user?.currency ?? "GHS")})</option>
                      <option value="coins">Coins</option>
                    </Select>
                  </FormField>
                  <FormField label="Max uses" required>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      inputMode="numeric"
                      value={promoMaxUses}
                      onChange={(e) => setPromoMaxUses(e.target.value)}
                      aria-label="Promo max uses"
                      required
                    />
                  </FormField>
                  <FormField label="Expiry (optional)">
                    <Input
                      type="date"
                      value={promoExpires}
                      onChange={(e) => setPromoExpires(e.target.value)}
                      aria-label="Promo expiry"
                    />
                  </FormField>
                </div>
                <Button type="submit" loading={promoBusy}>
                  Create promo code
                </Button>
              </form>
            ) : null}
          </Card>

          <Card
            title={`Referred users (${data.referredUsers.length}) · ${data.coinsGiven} coins given · ${data.redemptions} redemptions`}
          >
            <DataTable<ReferredUser>
              viewId="admin-referrals"
              columns={userColumns}
              rows={pageRows}
              total={users.length}
              page={safePage}
              pageSize={pageSize}
              onPageChange={(p) => setPage(p)}
              search={q}
              onSearchChange={(v) => {
                setQ(v);
                setPage(1);
              }}
              searchPlaceholder="Search name, contact or code…"
              loading={ref.loading}
              error={ref.err}
              onRetry={ref.reload}
              emptyTitle="No referred users yet."
              emptyText="Players who sign up with your code show up here."
              rowHref={(u) => playerHref(u.id)}
            />
          </Card>
        </>
      )}
    </div>
  );
}
