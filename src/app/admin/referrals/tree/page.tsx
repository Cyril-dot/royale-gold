// Admin dashboard — Referrals / Tree (Phase 6 restyle). The downline
// tree — the admin at the top, their players below, with what each
// deposited and the commission earned on them. The endpoint already caps
// at 3 levels (deeper = more below). Contacts are masked with audited
// Reveal, like every other list. Same endpoint as before.
"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { fmtStaffMoney } from "../../../../components/staff-ui/format";
import { useStore } from "../../../../lib/store";
import { useStaffFetch } from "../../../../components/staff-ui/useStaffFetch";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";
import { Card } from "../../../../components/staff-ui/Card";
import { Tabs } from "../../../../components/staff-ui/Tabs";
import { Skeleton, ErrorState } from "../../../../components/staff-ui/Feedback";
import { AdminContactValue } from "../../../../components/admin/AdminReveal";
import { canAccessSection } from "../../../../lib/rbac";
import type { AdminIdentity, DownlineNode } from "../../../../lib/admin-client";

export default function AdminReferralsTreePage() {
  return (
    <Suspense fallback={<Skeleton lines={6} title />}>
      <AdminReferralsTreeInner />
    </Suspense>
  );
}

function DownlineTreeNode({ n, playerHref, preview }: { n: DownlineNode; playerHref: (id: string) => string; preview: boolean }) {
  return (
    <li className="st-tree-node">
      <div className="st-tree-card">
        <Link href={playerHref(n.id)}>
          <b>{n.name}</b>
        </Link>
        <span>
          <AdminContactValue userId={n.id} contact={n.contact} preview={preview} />
        </span>
        <span>Deposited {fmtStaffMoney(n.totalDeposited, n.fiatCurrency ?? "GHS")}</span>
        <span>Commission {fmtStaffMoney(n.commission, n.fiatCurrency ?? "GHS")}</span>
      </div>
      {n.children.length > 0 && (
        <ul className="st-tree">
          {n.children.map((c) => (
            <DownlineTreeNode key={c.id} n={c} playerHref={playerHref} preview={preview} />
          ))}
        </ul>
      )}
      {n.deeper && <p>+ more below (this view stops at 3 levels)</p>}
    </li>
  );
}

function AdminReferralsTreeInner() {
  const { user } = useStore();
  const sp = useSearchParams();
  const previewId = sp.get("preview");
  const preview = !!previewId;

  const ctxUrl = useMemo(() => {
    if (!user) return null;
    return previewId ? `/api/owner/admins/${previewId}/preview` : "/api/admin/context";
  }, [user, previewId]);
  const ctx = useStaffFetch<{ admin: AdminIdentity }>(ctxUrl);
  const treeUrl = useMemo(() => {
    if (!user) return null;
    return previewId ? `/api/owner/referrals/tree?adminId=${previewId}` : "/api/admin/referrals/tree";
  }, [user, previewId]);
  const tree = useStaffFetch<{ root: { id: string; name: string }; children: DownlineNode[] }>(treeUrl);

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
  const admin = ctx.data?.admin;

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
      <Card title="Downline tree" sub="You at the top, your players below — with what each deposited and the commission earned on them.">
        {tree.err ? (
          <ErrorState title="Could not load the tree." text={tree.err} onRetry={tree.reload} />
        ) : tree.loading || !tree.data ? (
          <Skeleton lines={5} />
        ) : tree.data.children.length === 0 ? (
          <p>No referred users yet.</p>
        ) : (
          <div>
            <div className="st-tree-card">
              <b>{tree.data.root.name}</b>
              <span>
                {tree.data.children.length} direct {tree.data.children.length === 1 ? "referral" : "referrals"}
              </span>
            </div>
            <ul className="st-tree">
              {tree.data.children.map((n) => (
                <DownlineTreeNode key={n.id} n={n} playerHref={playerHref} preview={preview} />
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
