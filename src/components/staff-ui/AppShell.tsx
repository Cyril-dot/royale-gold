// AppShell — sidebar (desktop) + top bar + drawer + bottom bar (phone,
// ≤5 items, permission-filtered by the caller) + main with dock clearance.
// The caller passes the already-filtered nav items: this component never
// decides permissions itself — authorisation stays server-side (brief §6).
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem {
  href: string;
  label: string;
  /** Pending count badge (e.g. withdrawals awaiting review). */
  count?: number;
  /** Bottom-bar only: opens the navigation drawer instead of navigating. */
  action?: "drawer";
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export interface PreviewInfo {
  name: string;
  onExit: () => void;
}

export function AppShell({
  brandTitle,
  brandSub,
  roleLabel,
  navItems,
  navGroups,
  bottomItems,
  preview,
  onSearch,
  children,
}: {
  brandTitle: string;
  brandSub: string;
  roleLabel: string;
  navItems: NavItem[];
  /** Grouped sidebar nav (label + items). When given, the sidebar and
   *  drawer render groups; navItems is still the fallback. */
  navGroups?: NavGroup[];
  bottomItems: NavItem[];
  preview?: PreviewInfo | null;
  /** ⌘K / search trigger — the CommandPalette wires itself to this. */
  onSearch?: () => void;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement | null>(null);

  const isActive = (href: string) =>
    href === "/admin" || href === "/owner"
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);

  // Close the drawer on Escape; focus it on open. Route changes close it
  // via the nav links' onClick — no effect needed for that.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKey);
    drawerRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const navList = (items: NavItem[]) => (
    <ul className="st-nav-list">
      {items
        .filter((item) => item.action !== "drawer")
        .map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="st-nav-item"
              aria-current={isActive(item.href) ? "page" : undefined}
              onClick={() => setDrawerOpen(false)}
            >
              {item.label}
              {typeof item.count === "number" && item.count > 0 ? (
                <span className="st-nav-item-count">{item.count}</span>
              ) : null}
            </Link>
          </li>
        ))}
    </ul>
  );

  const nav = navGroups ? (
    <>
      {navGroups.map((g) => (
        <div key={g.label}>
          <p className="st-nav-group">{g.label}</p>
          {navList(g.items)}
        </div>
      ))}
    </>
  ) : (
    navList(navItems)
  );

  return (
    <div className="st-shell st-shell-with-sidebar">
      <aside className="st-sidebar" aria-label="Staff navigation">
        <p className="st-sidebar-brand">{brandTitle}</p>
        <p className="st-sidebar-sub">{brandSub}</p>
        {nav}
      </aside>

      <div className="st-main-wrap">
        <header className="st-topbar">
          <button
            type="button"
            className="st-icon-btn st-topbar-menu-btn"
            aria-label="Open navigation menu"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            ☰
          </button>
          <h1 className="st-topbar-title">{brandTitle}</h1>
          <div className="st-topbar-actions">
            <span className="st-role-badge">{roleLabel}</span>
            {onSearch ? (
              <button type="button" className="st-copy-btn" onClick={onSearch} aria-label="Search (Ctrl+K)">
                Search ⌘K
              </button>
            ) : null}
          </div>
        </header>

        {preview ? (
          <div className="st-main" style={{ paddingBottom: 0 }}>
            <PreviewBanner name={preview.name} onExit={preview.onExit} />
          </div>
        ) : null}

        <main className="st-main">{children}</main>

        <nav className="st-bottombar" aria-label="Staff sections">
          {bottomItems.map((item) =>
            item.action === "drawer" ? (
              <button
                key={item.href}
                type="button"
                className="st-bottombar-item"
                aria-expanded={drawerOpen}
                onClick={() => setDrawerOpen(true)}
              >
                <span className="st-bottombar-dot" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className="st-bottombar-item"
                aria-current={isActive(item.href) ? "page" : undefined}
              >
                <span className="st-bottombar-dot" aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            ),
          )}
        </nav>
      </div>

      {drawerOpen ? (
        <>
          <button
            type="button"
            className="st-drawer-backdrop"
            aria-label="Close navigation menu"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="st-drawer" ref={drawerRef} role="dialog" aria-label="Staff navigation" aria-modal="true">
            <button
              type="button"
              className="st-icon-btn st-drawer-close"
              aria-label="Close navigation menu"
              onClick={() => setDrawerOpen(false)}
            >
              ✕
            </button>
            <p className="st-sidebar-brand">{brandTitle}</p>
            <p className="st-sidebar-sub">{brandSub}</p>
            {nav}
          </div>
        </>
      ) : null}
    </div>
  );
}

/** "Previewing as <admin> — read-only" + real Exit button (audit §4.1). */
export function PreviewBanner({ name, onExit }: { name: string; onExit: () => void }) {
  return (
    <div className="st-preview-banner" role="status">
      <span>
        Previewing as <b>{name}</b> — read-only
      </span>
      <button type="button" className="st-btn st-btn-secondary st-btn-sm" onClick={onExit}>
        Exit preview
      </button>
    </div>
  );
}
