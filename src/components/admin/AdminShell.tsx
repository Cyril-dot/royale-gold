// AdminShell — the admin panel's shell (Phase 5). Mirrors OwnerShell:
//   - the admin guard (login prompt / not-an-admin), same copy as the
//     old pages — authorisation itself stays server-side (requireRole /
//     requirePermission on every route and page)
//   - AppShell with grouped sidebar nav + phone bottom bar
//     (Overview · Players · Money · Tickets · More — More opens the
//     drawer), permission-filtered: an admin sees only the sections
//     canAccessSection allows; in owner preview every section shows
//   - the owner preview banner ("Previewing as <admin> — read-only")
//     with a real Exit button on every admin route; ?preview=<adminId>
//     is preserved on every nav link, palette jump and player link
//   - the global command palette (⌘K): jump to any admin page, find a
//     player in the downline, safe quick actions only (no money-moving
//     actions).
// All 14 admin pages render inside this shell (Phase 6) — the old
// AdminNav strip is gone; the shell is the only nav.
"use client";

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "../../lib/api";
import { useStore } from "../../lib/store";
import { useAdminContext, type PlayerSegmentRow } from "../../lib/admin-client";
import { ADMIN_SECTION_LABELS, canAccessSection, type AdminSection } from "../../lib/rbac";
import { AppShell, type NavGroup, type NavItem } from "../staff-ui/AppShell";
import { CommandPalette, useCommandPaletteHotkey, type PaletteAction } from "../staff-ui/CommandPalette";
import { Button } from "../staff-ui/Button";
import AuthModal from "../AuthModal";

export const ADMIN_NAV_GROUPS: { label: string; items: { href: string; label: string; section: AdminSection }[] }[] = [
  { label: "Panel", items: [{ href: "/admin", label: "Overview", section: "overview" }] },
  {
    label: "Players",
    items: [
      { href: "/admin/players", label: "Players", section: "players" },
      { href: "/admin/referrals", label: "Referrals", section: "referrals" },
      { href: "/admin/commission", label: "Commission", section: "commission" },
    ],
  },
  {
    label: "Money & safety",
    items: [
      { href: "/admin/money", label: "Money", section: "money" },
      { href: "/admin/kyc", label: "KYC", section: "kyc" },
      { href: "/admin/fraud", label: "Fraud", section: "fraud" },
    ],
  },
  {
    label: "Support",
    items: [
      { href: "/admin/tickets", label: "Tickets", section: "tickets" },
      { href: "/admin/activity", label: "Activity", section: "activity" },
    ],
  },
  {
    label: "Tools",
    items: [
      { href: "/admin/lookup", label: "Lookup", section: "lookup" },
      { href: "/admin/reports", label: "Reports", section: "reports" },
      { href: "/admin/campaigns", label: "Campaigns", section: "campaigns" },
      { href: "/admin/tournaments", label: "Tournaments", section: "tournaments" },
      { href: "/admin/live", label: "Live", section: "live" },
    ],
  },
];

const ADMIN_BOTTOM: { href: string; label: string; section: AdminSection }[] = [
  { href: "/admin", label: "Overview", section: "overview" },
  { href: "/admin/players", label: "Players", section: "players" },
  { href: "/admin/money", label: "Money", section: "money" },
  { href: "/admin/tickets", label: "Tickets", section: "tickets" },
];

function AdminShellInner({ children }: { children: ReactNode }) {
  const { user, openAuth } = useStore();
  const router = useRouter();
  const sp = useSearchParams();
  const previewId = sp.get("preview");
  // The previewed admin's name for the banner (owner preview only).
  // In normal use this loads the admin's own identity — harmless, one
  // call the pages used to make themselves.
  const { ctx } = useAdminContext(previewId);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [playerActions, setPlayerActions] = useState<PaletteAction[]>([]);
  const [segments, setSegments] = useState<PlayerSegmentRow[] | null>(null);
  const searchSeq = useRef(0);

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  useCommandPaletteHotkey(openPalette);

  const withPreview = useCallback(
    (href: string) => (previewId ? `${href}?preview=${previewId}` : href),
    [previewId],
  );

  // Nav: every section in preview; otherwise only the sections this
  // admin may access. The server 403s the rest anyway — this is the
  // friendly face of that denial, never the security.
  const navGroups: NavGroup[] = useMemo(() => {
    const groups: NavGroup[] = [];
    for (const g of ADMIN_NAV_GROUPS) {
      const items: NavItem[] = g.items
        .filter((item) => previewId || canAccessSection(user, item.section))
        .map((item) => ({ href: withPreview(item.href), label: item.label }));
      if (items.length > 0) groups.push({ label: g.label, items });
    }
    return groups;
  }, [user, previewId, withPreview]);

  const navItems: NavItem[] = useMemo(() => navGroups.flatMap((g) => g.items), [navGroups]);

  const bottomItems: NavItem[] = useMemo(() => {
    const primary: NavItem[] = ADMIN_BOTTOM.filter(
      (item) => previewId || canAccessSection(user, item.section),
    ).map((item) => ({ href: withPreview(item.href), label: item.label }));
    const items = primary.length > 0 ? primary : navItems.slice(0, 1);
    return [...items, { href: "#more", label: "More", action: "drawer" as const }];
  }, [user, previewId, withPreview, navItems]);

  const pageActions: PaletteAction[] = useMemo(
    () =>
      ADMIN_NAV_GROUPS.flatMap((g) =>
        g.items
          .filter((item) => previewId || canAccessSection(user, item.section))
          .map((item) => ({
            id: `page:${item.href}`,
            group: g.label,
            label: item.label,
            sub: ADMIN_SECTION_LABELS[item.section],
            href: withPreview(item.href),
          })),
      ),
    [user, previewId, withPreview],
  );

  const onPaletteQuery = useCallback(
    (q: string) => {
      const query = q.trim();
      const seq = ++searchSeq.current;
      if (query.length < 2) {
        setPlayerActions([]);
        return;
      }
      // Player search reuses the segments endpoint (the Players list's
      // own source) and filters client-side — no new endpoint. Loaded
      // once per shell, then cached for the session.
      const search = (players: PlayerSegmentRow[]) => {
        if (seq !== searchSeq.current) return;
        const needle = query.toLowerCase();
        setPlayerActions(
          players
            .filter((p) => `${p.name} ${p.email ?? ""} ${p.phone ?? ""}`.toLowerCase().includes(needle))
            .slice(0, 5)
            .map((p) => ({
              id: `player:${p.id}`,
              group: "Players",
              label: p.name,
              sub: p.email || p.phone || "",
              href: withPreview(`/admin/players/${p.id}`),
            })),
        );
      };
      if (segments) {
        search(segments);
        return;
      }
      window.setTimeout(() => {
        if (seq !== searchSeq.current) return;
        void api<{ players: PlayerSegmentRow[] }>(
          previewId ? `/api/admin/players/segments?adminId=${previewId}` : "/api/admin/players/segments",
        )
          .then((r) => {
            setSegments(r.players);
            search(r.players);
          })
          .catch(() => setPlayerActions([]));
      }, 250);
    },
    [previewId, segments, withPreview],
  );

  const actions = useMemo(() => [...pageActions, ...playerActions], [pageActions, playerActions]);

  if (!user) {
    return (
      <main className="st-main">
        <h2 className="st-pagehead-title">Admin panel</h2>
        <p>Log in as an admin or the owner to see this panel.</p>
        <Button variant="primary" onClick={() => openAuth("login")}>
          Log in
        </Button>
        {/* StaffChrome suppresses the layout AuthModal on /admin* — mount
            it here so this button actually opens the login card. */}
        <AuthModal />
      </main>
    );
  }
  if (user.role !== "admin" && user.role !== "owner") {
    return (
      <main className="st-main">
        <h2 className="st-pagehead-title">Admin panel</h2>
        <p>Only admins can open this panel. The owner previews any admin from the Owner panel.</p>
        <Button variant="primary" onClick={() => openAuth("login")}>
          Log in
        </Button>
        <AuthModal />
      </main>
    );
  }

  const preview =
    previewId && ctx
      ? { name: ctx.admin.name, onExit: () => router.push("/owner") }
      : null;

  return (
    <>
      <AppShell
        brandTitle="Admin panel"
        brandSub={ctx ? ctx.admin.name : "Staff"}
        roleLabel={user.role === "owner" && !previewId ? "Owner" : "Admin"}
        navItems={navItems}
        navGroups={navGroups}
        bottomItems={bottomItems}
        preview={preview}
        onSearch={openPalette}
      >
        {children}
      </AppShell>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} actions={actions} onQueryChange={onPaletteQuery} />
    </>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  return <AdminShellInner>{children}</AdminShellInner>;
}
