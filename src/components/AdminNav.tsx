// Round 11 — admin dashboard navigation, shared by every admin route
// (Overview / Referrals / Commission / player detail). Replaces the old
// in-page tabs. Preserves ?preview=<adminId> across all links so the
// owner's preview keeps working on every route.
// Round 31: a 4th tab (Players) joined the bar, so at phone width the
// active tab can sit off-screen to the right in the scrollable nav —
// scroll it into view on mount so the user always sees which tab
// they are on.
// P0 Batch 3 (O3): the nav hides tabs the admin has no permission for
// (permissions come from the signed-in user; in owner preview every tab
// shows — the owner bypasses permissions). Two new tabs joined: Activity
// (A12) and Tickets (A11).

"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useStore } from "../lib/store";
import { ADMIN_SECTION_LABELS, canAccessSection, type AdminSection } from "../lib/rbac";

const TABS: { path: string; section: AdminSection; label: string }[] = [
  { path: "/admin", section: "overview", label: "Overview" },
  { path: "/admin/referrals", section: "referrals", label: "Referrals" },
  { path: "/admin/commission", section: "commission", label: "Commission" },
  { path: "/admin/players", section: "players", label: "Players" },
  { path: "/admin/money", section: "money", label: "Money" },
  { path: "/admin/activity", section: "activity", label: "Activity" },
  { path: "/admin/tickets", section: "tickets", label: "Tickets" },
  // P1 Batch 1 (A16): bet lookup + provably-fair verify.
  { path: "/admin/lookup", section: "lookup", label: "Lookup" },
];

export function AdminNav() {
  const pathname = usePathname();
  const sp = useSearchParams();
  const previewId = sp.get("preview");
  const { user } = useStore();
  const navRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    navRef.current?.querySelector(".an-active")?.scrollIntoView({ behavior: "auto", inline: "nearest", block: "nearest" });
  }, [pathname]);
  const href = (p: string) => (previewId ? `${p}?preview=${previewId}` : p);
  const item = (p: string, label: string, active: boolean) => (
    <Link key={p} href={href(p)} className={active ? "an-active" : ""} aria-current={active ? "page" : undefined}>{label}</Link>
  );
  // In preview the owner sees every tab; otherwise hide the sections
  // this admin has no permission for.
  const visible = previewId ? TABS : TABS.filter((t) => canAccessSection(user, t.section));
  return (
    <nav ref={navRef} className="admin-nav" aria-label="Admin dashboard">
      {visible.map((t) => item(t.path, t.label, t.path === "/admin" ? pathname === "/admin" : pathname.startsWith(t.path)))}
    </nav>
  );
}

/** Shown when an admin opens a section they have no permission for
 *  (P0 Batch 3 O3). The page's API route 403s the same way — this is
 *  the friendly face of that denial. */
export function AdminDenied({ section }: { section: AdminSection }) {
  return (
    <>
      <div className="rg48-hbar-in">
        <h2>Admin <em>panel</em></h2>
      </div>
      <p className="rg48-err">You do not have access to the {ADMIN_SECTION_LABELS[section]} section.</p>
      <p>Ask the owner to grant you access to this section from the Owner panel.</p>
    </>
  );
}

/** Shown on every admin route while the owner previews an admin. */
export function AdminPreviewBanner({ name }: { name: string }) {
  return (
    <p className="admin-preview">
      Previewing <b>{name}</b>
      <Link href="/owner">Back to Owner panel</Link>
    </p>
  );
}

/** Signed-out state, shared by every admin route. */
export function AdminLoginPrompt() {
  const { openAuth } = useStore();
  return (
    <>
      <div className="rg48-hbar-in">
        <h2>Admin <em>panel</em></h2>
      </div>
      <p>Log in as an admin or the owner to see this panel.</p>
      <button className="btn btn-gold" type="button" onClick={() => openAuth("login")}>Log in</button>
    </>
  );
}

/** Non-admin / failed-load state, shared by every admin route. */
export function AdminError({ err }: { err: string }) {
  return (
    <>
      <div className="rg48-hbar-in">
        <h2>Admin <em>panel</em></h2>
      </div>
      <p className="rg48-err">{err}</p>
      <p>Only admins can open this panel. The owner previews any admin from the Owner panel.</p>
    </>
  );
}
