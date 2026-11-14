// Admin dashboard — Players list (Round 31). The audit found there was
// no Players list page at all — /admin/players 404d, and the only way to
// reach a player was tapping a referred user on the Referrals page. Now
// every referred user is listed here, with a search box, each row linking
// to its detail page (/admin/players/[id]). Same data source as the
// Referrals page (useAdminOverview → ov.referredUsers); no API change.
//
// P1 Batch 1 (A14): segmentation — the list now loads from the segments
// endpoint (same players, plus segment flags + counts + tags). Filter
// chips above the list, tags on each row. Search still works the same.

"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useStore } from "../../../lib/store";
import { useAdminContext, useAdminSegments, useAdminVipTiers, useAdminResponsible, type PlayerSegmentKey } from "../../../lib/admin-client";
import { canAccessSection } from "../../../lib/rbac";
import { AdminNav, AdminPreviewBanner, AdminLoginPrompt, AdminError, AdminDenied } from "../../../components/AdminNav";

const SEGMENTS: { key: PlayerSegmentKey; label: string }[] = [
  { key: "new", label: "New" },
  { key: "active", label: "Active" },
  { key: "dormant", label: "Dormant" },
  { key: "high-roller", label: "High roller" },
  { key: "at-risk", label: "At risk" },
];

export default function AdminPlayersPage() {
  return (
    <main className="rg48-page-main rg23 admin-fb">
      <div className="wrap">
        <Suspense fallback={null}>
          <AdminPlayersInner />
        </Suspense>
      </div>
    </main>
  );
}

function AdminPlayersInner() {
  const { user } = useStore();
  const sp = useSearchParams();
  const previewId = sp.get("preview");
  const { ctx, err: ctxErr } = useAdminContext(previewId);
  // P1 Batch 1 (A14): segments endpoint — same players, plus segment
  // flags, counts and tags.
  const { data: seg, err: playersErr } = useAdminSegments(previewId);
  // P2 Batch 1 (A26): VIP tiers + each player's tier, computed live
  // from the deposit ledger. (A29): the responsible-gambling list —
  // players with an active cool-off or self-exclusion.
  const { data: vip } = useAdminVipTiers(previewId);
  const { data: rg } = useAdminResponsible(previewId);
  const [q, setQ] = useState("");
  const [segment, setSegment] = useState<PlayerSegmentKey | "">("");
  const [vipFilter, setVipFilter] = useState("");

  if (!user) return <AdminLoginPrompt />;
  if (ctxErr) return <AdminError err={ctxErr} />;
  if (!ctx) return <p>Loading admin panel…</p>;
  // P0 Batch 3 (O3): the server 403s this section too.
  if (!previewId && !canAccessSection(user, "players")) return <AdminDenied section="players" />;
  if (playersErr) return <AdminError err={playersErr} />;
  if (!seg) return <p>Loading admin panel…</p>;

  const ov = { admin: ctx.admin, referredUsers: seg.players };

  const playerHref = (id: string) => (previewId ? `/admin/players/${id}?preview=${previewId}` : `/admin/players/${id}`);
  const needle = q.trim().toLowerCase();
  // P2 Batch 1 (A26): tier per player, merged by id (the VIP endpoint
  // computes it from the same deposit ledger as the segments).
  const tierById = new Map((vip?.players ?? []).map((p) => [p.id, p.tier?.name ?? null]));
  const users = ov.referredUsers.filter((u) => {
    if (segment && !u.segments.includes(segment)) return false;
    if (vipFilter && tierById.get(u.id) !== vipFilter) return false;
    if (!needle) return true;
    return [u.name, u.email || "", u.phone || "", u.referralCodeUsed || "", u.tags.join(" ")]
      .join(" ").toLowerCase().includes(needle);
  });
  const rgPlayers = rg?.players ?? [];

  return (
    <>
      {previewId ? <AdminPreviewBanner name={ov.admin.name} /> : null}
      <div className="rg48-hbar-in">
        <Link className="gp-back" href={previewId ? `/admin?preview=${previewId}` : "/admin"} aria-label="Back to admin overview"><span className="gp-back-coin">←</span></Link>
        <h2>Players</h2>
      </div>
      <p className="rg48-sub">{ov.admin.name} · {ov.admin.email} · {ov.admin.commissionPct}% commission{ov.admin.active ? "" : " · DEACTIVATED"}</p>
      <AdminNav />
      <section className="admin-sec">
        <h3>Referred players ({ov.referredUsers.length})</h3>
        {/* P1 Batch 4 (O24): when this admin has child admins, the
            list rolls their downlines in — each row says via whom. */}
        {seg.scope.childAdmins.length > 0 && (
          <p className="rg48-mini">
            Includes your child admins&apos; downlines: {seg.scope.childAdmins.map((c) => c.name).join(", ")}.
          </p>
        )}
        <div className="money-chips" role="group" aria-label="Filter by segment">
          <button type="button" className={!segment ? "on" : ""} onClick={() => setSegment("")}>All ({seg.total})</button>
          {SEGMENTS.map((s) => (
            <button key={s.key} type="button" className={segment === s.key ? "on" : ""} onClick={() => setSegment(segment === s.key ? "" : s.key)}>{s.label} ({seg.counts[s.key]})</button>
          ))}
        </div>
        {/* P2 Batch 1 (A26): filter by VIP tier — a label + perks only;
            it changes no economy, limits or payouts. */}
        {vip && vip.tiers.length > 0 && (
          <div className="money-chips" role="group" aria-label="Filter by VIP tier">
            <button type="button" className={!vipFilter ? "on" : ""} onClick={() => setVipFilter("")}>All tiers</button>
            {vip.tiers.map((t) => (
              <button key={t.id} type="button" className={vipFilter === t.name ? "on" : ""} onClick={() => setVipFilter(vipFilter === t.name ? "" : t.name)}>
                {t.name} ({vip.players.filter((p) => p.tier?.name === t.name).length})
              </button>
            ))}
          </div>
        )}
        <label className="players-search">
          <input
            type="search"
            placeholder="Search by name, email or phone"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search players"
          />
        </label>
        {ov.referredUsers.length === 0 ? (
          <p>No referred players yet.</p>
        ) : users.length === 0 ? (
          <p>No players match{segment ? ` this segment` : ""}{vipFilter ? ` the ${vipFilter} tier` : ""}{q.trim() ? ` “${q.trim()}”` : ""}.</p>
        ) : (
          <div className="user-list">
            {users.map((u) => (
              <Link key={u.id} className="user-row" href={playerHref(u.id)}>
                <b>{u.name}</b><span>{u.email || u.phone || "—"}</span>{u.referralCodeUsed ? <span className="code-chip sm">{u.referralCodeUsed}</span> : <span aria-hidden="true" />}<span>Joined {new Date(u.createdAt).toLocaleDateString("en-GB")}</span>
                {seg.scope.childAdmins.length > 0 && u.referredByAdminName ? <span className="rg48-mini">via {u.referredByAdminName}</span> : null}
                {tierById.get(u.id) ? <span className="vip-pill">{tierById.get(u.id)}</span> : null}
                {u.tags.length > 0 ? <span className="pd-tags-inline">{u.tags.map((t) => <span key={t} className="tag-pill">{t}</span>)}</span> : null}
              </Link>
            ))}
          </div>
        )}
      </section>
      {/* P2 Batch 1 (A29): responsible gambling — players with an ACTIVE
          cool-off or self-exclusion, with their until dates. A player
          whose dates have passed is not listed. */}
      <section className="admin-sec">
        <h3>Responsible gambling ({rgPlayers.length})</h3>
        <p className="rg48-sub">Players on a break right now — a cool-off (set by you or by the player) or a self-exclusion. While it runs they cannot deposit, play or settle.</p>
        {rgPlayers.length === 0 ? (
          <p>No players on a break right now.</p>
        ) : (
          <div className="user-list">
            {rgPlayers.map((p) => (
              <Link key={p.id} className="user-row" href={playerHref(p.id)}>
                <b>{p.name}</b><span>{p.contact || "—"}</span>
                {p.selfExcludedUntil ? <span className="pd-blocked-badge">SELF-EXCLUDED</span> : <span className="tag-pill">Cool-off</span>}
                <span>
                  {p.selfExcludedUntil ? `until ${new Date(p.selfExcludedUntil).toLocaleDateString("en-GB")}` : ""}
                  {p.selfExcludedUntil && p.coolOffUntil ? " · " : ""}
                  {p.coolOffUntil ? `cool-off until ${new Date(p.coolOffUntil).toLocaleDateString("en-GB")}` : ""}
                </span>
                {p.selfExclusionReason ? <span className="rg48-mini">{p.selfExclusionReason}</span> : null}
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
