// Admin dashboard — Referrals (round 11). The round-10 referral section,
// re-housed unchanged in content, plus the referred-users list. A referred
// user now opens as a real page (/admin/players/[id]) instead of an overlay.

"use client";

import { Suspense, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api, fmtCash } from "../../../lib/api";
import { useStore } from "../../../lib/store";
import { useAdminContext, useAdminReferrals, useAdminDownline, copyText, shareLink, type DownlineNode } from "../../../lib/admin-client";
import { canAccessSection } from "../../../lib/rbac";
import { AdminNav, AdminPreviewBanner, AdminLoginPrompt, AdminError, AdminDenied } from "../../../components/AdminNav";

export default function AdminReferralsPage() {
  return (
    <main className="rg48-page-main rg23 admin-fb">
      <div className="wrap">
        <Suspense fallback={null}>
          <AdminReferralsInner />
        </Suspense>
      </div>
    </main>
  );
}

// P0 Batch 4 (A9): one downline tree node — the player, what they
// deposited, and the commission earned on them. Renders recursively;
// the endpoint already caps at 3 levels (deeper = more below).
function DownlineTreeNode({ n, playerHref }: { n: DownlineNode; playerHref: (id: string) => string }) {
  return (
    <li className="b4-tree-node">
      <div className="b4-tree-card">
        <Link href={playerHref(n.id)}><b>{n.name}</b></Link>
        <span>{n.contact || "—"}</span>
        <span>Deposited {fmtCash(n.totalDeposited)}</span>
        <span>Commission {fmtCash(n.commission)}</span>
      </div>
      {n.children.length > 0 && (
        <ul className="b4-tree">
          {n.children.map((c) => (
            <DownlineTreeNode key={c.id} n={c} playerHref={playerHref} />
          ))}
        </ul>
      )}
      {n.deeper && <p className="b4-tree-more">+ more below (this view stops at 3 levels)</p>}
    </li>
  );
}

function AdminReferralsInner() {
  const { user, toast } = useStore();
  const sp = useSearchParams();
  const previewId = sp.get("preview");
  const { ctx, err: ctxErr } = useAdminContext(previewId);
  const { data, err: refErr, load } = useAdminReferrals(previewId);
  // P0 Batch 4 (A9): the downline tree — a second view of the same
  // referrals (List / Tree tabs, same pattern as the commission tabs).
  const { tree, err: treeErr } = useAdminDownline(previewId);
  const [view, setView] = useState<"list" | "tree">("list");
  const [newCode, setNewCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<{ id: string; kind: "code" | "link" } | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!user) return <AdminLoginPrompt />;
  if (ctxErr) return <AdminError err={ctxErr} />;
  if (!ctx) return <p>Loading admin panel…</p>;
  // P0 Batch 3 (O3): the server 403s this section too — this is the
  // friendly face of that denial (the owner bypasses it in preview).
  if (!previewId && !canAccessSection(user, "referrals")) return <AdminDenied section="referrals" />;
  if (refErr) return <AdminError err={refErr} />;
  if (!data) return <p>Loading admin panel…</p>;

  const ov = { admin: ctx.admin, ...data };

  const copyRef = (id: string, kind: "code" | "link", text: string, doneMsg: string) => {
    void copyText(text).then(() => {
      setCopied({ id, kind });
      toast(doneMsg, "win");
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(null), 1600);
    }).catch(() => toast("Copy failed — long-press the text to copy it", "lose"));
  };

  const createCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/admin/codes", { method: "POST", body: JSON.stringify({ code: newCode.trim() || undefined }) });
      setNewCode("");
      toast("Referral code created", "win");
      await load();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not create code", "lose");
    } finally { setBusy(false); }
  };

  const playerHref = (id: string) => (previewId ? `/admin/players/${id}?preview=${previewId}` : `/admin/players/${id}`);

  return (
    <>
      {previewId ? <AdminPreviewBanner name={ov.admin.name} /> : null}
      <div className="rg48-hbar-in">
        <Link className="gp-back" href={previewId ? `/admin?preview=${previewId}` : "/admin"} aria-label="Back to admin overview"><span className="gp-back-coin">←</span></Link>
        <h2>Referrals</h2>
      </div>
      <p className="rg48-sub">{ov.admin.name} · {ov.admin.email} · {ov.admin.commissionPct}% commission{ov.admin.active ? "" : " · DEACTIVATED"}</p>
      <AdminNav />
      <section className="admin-sec referral-sec">
        <h3>Referral — share your link</h3>
        <p className="referral-sub">Your link earns you <b>{ov.admin.commissionPct}% commission</b> on their deposits. New players get <b>5 extra coins</b>.</p>
        {ov.codes.length === 0 && <p>No codes yet — create one below.</p>}
        {ov.codes.map((c) => (
          <div key={c.id} className="code-row referral-row">
            <b className="code-chip">{c.code}</b>
            <span className="code-state">{c.active ? "Active" : "Inactive"}</span>
            <span className="referral-copy">
              <button className={`btn btn-ghost btn-sm${copied?.id === c.id && copied?.kind === "code" ? " done" : ""}`} type="button" onClick={() => copyRef(c.id, "code", c.code, "Referral code copied")}>
                {copied?.id === c.id && copied?.kind === "code" ? "Copied ✓" : "Copy code"}
              </button>
              <button className={`btn btn-ghost btn-sm${copied?.id === c.id && copied?.kind === "link" ? " done" : ""}`} type="button" onClick={() => copyRef(c.id, "link", shareLink(c.code), "Referral link copied")}>
                {copied?.id === c.id && copied?.kind === "link" ? "Copied ✓" : "Copy link"}
              </button>
            </span>
            <span className="code-link">{shareLink(c.code)}</span>
          </div>
        ))}
        {!previewId && (
          <form className="code-form" onSubmit={createCode}>
            <input type="text" placeholder="Custom code e.g. RG-GOLD1 (blank = auto)" value={newCode} onChange={(e) => setNewCode(e.target.value.toUpperCase())} pattern="RG-[A-Z0-9]{4,12}" title="RG- followed by 4–12 letters or digits" />
            <button className="btn btn-gold" type="submit" disabled={busy}>{busy ? "Creating…" : "Create code"}</button>
          </form>
        )}
      </section>
      <div className="ac-tabs" role="tablist" aria-label="Referrals views">
        <button type="button" role="tab" id="ref-tab-list" aria-selected={view === "list"} aria-controls="ref-panel-list" className={`ac-tab${view === "list" ? " ac-tab-active" : ""}`} onClick={() => setView("list")}>List</button>
        <button type="button" role="tab" id="ref-tab-tree" aria-selected={view === "tree"} aria-controls="ref-panel-tree" className={`ac-tab${view === "tree" ? " ac-tab-active" : ""}`} onClick={() => setView("tree")}>Tree</button>
      </div>
      {view === "list" ? (
      <div role="tabpanel" id="ref-panel-list" aria-labelledby="ref-tab-list">
      <section className="admin-sec">
        <h3>Referred users ({ov.referredUsers.length}) · {ov.coinsGiven} coins given · {ov.redemptions} redemptions</h3>
        {ov.referredUsers.length === 0 ? <p>No referred users yet.</p> : (
          <div className="user-list">
            {ov.referredUsers.map((u) => (
              <Link key={u.id} className="user-row" href={playerHref(u.id)}>
                <b>{u.name}</b><span>{u.email || u.phone || "—"}</span>{u.referralCodeUsed ? <span className="code-chip sm">{u.referralCodeUsed}</span> : <span aria-hidden="true" />}<span>Joined {new Date(u.createdAt).toLocaleDateString("en-GB")}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
      </div>
      ) : (
      <div role="tabpanel" id="ref-panel-tree" aria-labelledby="ref-tab-tree">
      <section className="admin-sec">
        <h3>Downline tree</h3>
        <p className="rg48-sub">You at the top, your players below — with what each deposited and the commission earned on them.</p>
        {treeErr ? <p>Could not load the tree.</p> : !tree ? <p>Loading tree…</p> : tree.children.length === 0 ? (
          <p>No referred users yet.</p>
        ) : (
          <div className="b4-tree-root">
            <div className="b4-tree-card b4-tree-root-card"><b>{tree.root.name}</b><span>{tree.children.length} direct {tree.children.length === 1 ? "referral" : "referrals"}</span></div>
            <ul className="b4-tree">
              {tree.children.map((n) => (
                <DownlineTreeNode key={n.id} n={n} playerHref={playerHref} />
              ))}
            </ul>
          </div>
        )}
      </section>
      </div>
      )}
    </>
  );
}
