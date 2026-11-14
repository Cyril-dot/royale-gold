// Round 11 — admin dashboard navigation, shared by every admin route
// (Overview / Referrals / Commission / player detail). Replaces the old
// in-page tabs. Preserves ?preview=<adminId> across all links so the
// owner's preview keeps working on every route.
// Round 31: a 4th tab (Players) joined the bar, so at phone width the
// active tab can sit off-screen to the right in the scrollable nav —
// scroll it into view on mount so the user always sees which tab
// they are on.

"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useStore } from "../lib/store";

export function AdminNav() {
  const pathname = usePathname();
  const sp = useSearchParams();
  const previewId = sp.get("preview");
  const navRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    navRef.current?.querySelector(".an-active")?.scrollIntoView({ behavior: "auto", inline: "nearest", block: "nearest" });
  }, [pathname]);
  const href = (p: string) => (previewId ? `${p}?preview=${previewId}` : p);
  const item = (p: string, label: string, active: boolean) => (
    <Link key={p} href={href(p)} className={active ? "an-active" : ""} aria-current={active ? "page" : undefined}>{label}</Link>
  );
  return (
    <nav ref={navRef} className="admin-nav" aria-label="Admin dashboard">
      {item("/admin", "Overview", pathname === "/admin")}
      {item("/admin/referrals", "Referrals", pathname.startsWith("/admin/referrals"))}
      {item("/admin/commission", "Commission", pathname.startsWith("/admin/commission"))}
      {item("/admin/players", "Players", pathname.startsWith("/admin/players"))}
    </nav>
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
