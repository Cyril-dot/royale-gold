// Admin dashboard — Players list (Round 31). The audit found there was
// no Players list page at all — /admin/players 404d, and the only way to
// reach a player was tapping a referred user on the Referrals page. Now
// every referred user is listed here, with a search box, each row linking
// to its detail page (/admin/players/[id]). Same data source as the
// Referrals page (useAdminOverview → ov.referredUsers); no API change.

"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useStore } from "../../../lib/store";
import { useAdminOverview } from "../../../lib/admin-client";
import { AdminNav, AdminPreviewBanner, AdminLoginPrompt, AdminError } from "../../../components/AdminNav";

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
  const { ov, err } = useAdminOverview(previewId);
  const [q, setQ] = useState("");

  if (!user) return <AdminLoginPrompt />;
  if (err) return <AdminError err={err} />;
  if (!ov) return <p>Loading admin panel…</p>;

  const playerHref = (id: string) => (previewId ? `/admin/players/${id}?preview=${previewId}` : `/admin/players/${id}`);
  const needle = q.trim().toLowerCase();
  const users = needle
    ? ov.referredUsers.filter((u) =>
        [u.name, u.email || "", u.phone || "", u.referralCodeUsed || ""]
          .join(" ").toLowerCase().includes(needle))
    : ov.referredUsers;

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
          <p>No players match “{q.trim()}”.</p>
        ) : (
          <div className="user-list">
            {users.map((u) => (
              <Link key={u.id} className="user-row" href={playerHref(u.id)}>
                <b>{u.name}</b><span>{u.email || u.phone || "—"}</span>{u.referralCodeUsed ? <span className="code-chip sm">{u.referralCodeUsed}</span> : <span aria-hidden="true" />}<span>Joined {new Date(u.createdAt).toLocaleDateString("en-GB")}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
