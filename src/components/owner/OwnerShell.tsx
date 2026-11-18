// OwnerShell — the owner panel's shell (Phase 2). Wraps every /owner
// route except the legacy monolith:
//   - OwnerProvider (fiat + global date range + admins)
//   - the owner guard (login prompt / not-the-owner), same copy as the
//     old page — authorisation itself stays server-side (requireRole)
//   - AppShell with grouped sidebar nav + phone bottom bar
//     (Home · Finance · Payouts · People · More — More opens the drawer)
//   - the global command palette (⌘K): jump to any owner page, find a
//     player or admin, run safe quick actions (no money-moving actions).
// The legacy monolith at /owner/legacy renders bare (no AppShell), so
// the old page stays pixel-identical until Phase 4 deletes it.
"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { api } from "../../lib/api";
import { useStore } from "../../lib/store";
import { copyText } from "../../lib/admin-client";
import { AppShell, type NavGroup, type NavItem } from "../staff-ui/AppShell";
import { CommandPalette, useCommandPaletteHotkey, type PaletteAction } from "../staff-ui/CommandPalette";
import { Button } from "../staff-ui/Button";
import AuthModal from "../AuthModal";
import { OwnerProvider, useOwner } from "./OwnerContext";

export const OWNER_NAV_GROUPS: NavGroup[] = [
  { label: "Command Center", items: [{ href: "/owner", label: "Command Center" }] },
  {
    label: "Finance",
    items: [
      { href: "/owner/finance/withdrawals", label: "Withdrawals" },
      { href: "/owner/finance/commission", label: "Commission" },
      { href: "/owner/finance/ledger", label: "Ledger" },
      { href: "/owner/finance/pnl", label: "Profit & loss" },
      { href: "/owner/finance/gateway", label: "Gateway" },
      { href: "/owner/finance/cashier", label: "Cashier" },
    ],
  },
  { label: "Payouts", items: [{ href: "/owner/payouts", label: "Payouts" }] },
  {
    label: "People",
    items: [
      { href: "/owner/people/admins", label: "Admins" },
      { href: "/owner/people/players", label: "Players" },
      { href: "/owner/people/hierarchy", label: "Hierarchy" },
    ],
  },
  {
    label: "Games",
    items: [
      { href: "/owner/games", label: "Games" },
      { href: "/owner/games/rtp", label: "RTP monitor" },
      { href: "/owner/games/replays", label: "Replays" },
    ],
  },
  {
    label: "Reports",
    items: [
      { href: "/owner/reports", label: "Audit log" },
      { href: "/owner/reports/bi", label: "BI & cohorts" },
      { href: "/owner/reports/risk", label: "Risk" },
    ],
  },
  {
    label: "Engage",
    items: [
      { href: "/owner/engage/promotions", label: "Promotions" },
      { href: "/owner/engage/announcements", label: "Announcements" },
      { href: "/owner/engage/vip", label: "VIP tiers" },
      { href: "/owner/engage/loyalty", label: "Loyalty" },
      { href: "/owner/engage/tournaments", label: "Tournaments" },
    ],
  },
  {
    label: "Settings",
    items: [
      { href: "/owner/settings/platform", label: "Platform" },
      { href: "/owner/settings/kyc", label: "KYC / AML" },
      { href: "/owner/settings/support", label: "Support" },
      { href: "/owner/settings/cms", label: "CMS" },
      { href: "/owner/settings/risk", label: "Risk rules" },
      { href: "/owner/settings/brands", label: "Brands" },
    ],
  },
];

const OWNER_BOTTOM: NavItem[] = [
  { href: "/owner", label: "Home" },
  { href: "/owner/finance/withdrawals", label: "Finance" },
  { href: "/owner/payouts", label: "Payouts" },
  { href: "/owner/people/admins", label: "People" },
  { href: "#more", label: "More", action: "drawer" },
];

const PAGE_ACTIONS: PaletteAction[] = OWNER_NAV_GROUPS.flatMap((g) =>
  g.items.map((item) => ({ id: `page:${item.href}`, group: "Pages", label: item.label, sub: g.label, href: item.href })),
);

function OwnerShellInner({ children }: { children: ReactNode }) {
  const { user, openAuth, toast } = useStore();
  const pathname = usePathname();
  const { admins, loadAdmins } = useOwner();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [playerActions, setPlayerActions] = useState<PaletteAction[]>([]);
  const [adminActions, setAdminActions] = useState<PaletteAction[]>([]);
  const searchSeq = useRef(0);

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  useCommandPaletteHotkey(openPalette);

  // Load the admins list when the palette opens (it powers admin jumps).
  useEffect(() => {
    if (paletteOpen && admins === null) void loadAdmins();
  }, [paletteOpen, admins, loadAdmins]);

  const onPaletteQuery = useCallback(
    (q: string) => {
      const query = q.trim();
      // Admin jumps filter the already-loaded list (no extra call).
      if (admins) {
        const needle = query.toLowerCase();
        setAdminActions(
          query
            ? admins
                .filter((a) => `${a.name} ${a.email}`.toLowerCase().includes(needle))
                .slice(0, 5)
                .map((a) => ({
                  id: `admin:${a.id}`,
                  group: "Admins",
                  label: `Preview ${a.name}'s panel`,
                  sub: a.email,
                  href: `/admin?preview=${a.id}`,
                }))
            : [],
        );
      }
      // Player search hits the server (debounced by the caller — the
      // palette fires on every keystroke, so gate on length + a timer).
      const seq = ++searchSeq.current;
      if (query.length < 2) {
        setPlayerActions([]);
        return;
      }
      window.setTimeout(() => {
        if (seq !== searchSeq.current) return;
        void api<{
          players: { id: string; name: string; email: string | null; phone: string | null; referringAdmin: { id: string; name: string } | null }[];
        }>(`/api/owner/players/search?q=${encodeURIComponent(query)}`)
          .then((r) =>
            setPlayerActions(
              r.players.slice(0, 5).map((p) => ({
                id: `player:${p.id}`,
                group: "Players",
                label: p.name,
                sub: p.email || p.phone || "",
                href: p.referringAdmin
                  ? `/admin/players/${p.id}?preview=${p.referringAdmin.id}`
                  : `/admin/players/${p.id}`,
              })),
            ),
          )
          .catch(() => setPlayerActions([]));
      }, 250);
    },
    [admins],
  );

  const quickActions: PaletteAction[] = useMemo(
    () => [
      {
        id: "quick:webhook",
        group: "Quick actions",
        label: "Copy PayTeller webhook URL",
        sub: "Copies the URL to register in PayTeller Settings",
        onSelect: () => {
          void api<{ webhookUrl: string }>("/api/owner/gateway")
            .then((r) => copyText(r.webhookUrl))
            .then(() => toast("Webhook URL copied", "win"))
            .catch(() => toast("Could not copy the webhook URL", "lose"));
        },
      },
      {
        id: "quick:legacy",
        group: "Quick actions",
        label: "Open the classic owner panel",
        sub: "The old one-page view (until Phase 4 removes it)",
        href: "/owner/legacy",
      },
    ],
    [toast],
  );

  const actions = useMemo(
    () => [...PAGE_ACTIONS, ...playerActions, ...adminActions, ...quickActions],
    [playerActions, adminActions, quickActions],
  );

  // The legacy monolith keeps its own strip + pill tabs — no AppShell.
  if (pathname === "/owner/legacy" || pathname?.startsWith("/owner/legacy/")) {
    return <>{children}</>;
  }

  if (!user) {
    return (
      <main className="st-main">
        <h2 className="st-pagehead-title">Owner panel</h2>
        <p>Log in with the owner account to open this panel.</p>
        <Button variant="primary" onClick={() => openAuth("login")}>
          Log in
        </Button>
        {/* StaffChrome suppresses the layout AuthModal on /owner* — mount
            it here so this button actually opens the login card. */}
        <AuthModal />
      </main>
    );
  }
  if (user.role !== "owner") {
    return (
      <main className="st-main">
        <h2 className="st-pagehead-title">Owner panel</h2>
        <p>This account is not the owner — log in with the owner account.</p>
        <Button variant="primary" onClick={() => openAuth("login")}>
          Log in
        </Button>
        <AuthModal />
      </main>
    );
  }

  return (
    <>
      <AppShell
        brandTitle="Owner panel"
        brandSub="Platform-wide control"
        roleLabel="Owner"
        navItems={OWNER_NAV_GROUPS.flatMap((g) => g.items)}
        navGroups={OWNER_NAV_GROUPS}
        bottomItems={OWNER_BOTTOM}
        onSearch={openPalette}
      >
        {children}
      </AppShell>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} actions={actions} onQueryChange={onPaletteQuery} />
    </>
  );
}

export function OwnerShell({ children }: { children: ReactNode }) {
  return (
    <OwnerProvider>
      <OwnerShellInner>{children}</OwnerShellInner>
    </OwnerProvider>
  );
}
