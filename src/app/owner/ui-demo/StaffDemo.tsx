// Staff UI demo — every component in its states, incl. adversarial fixtures.
// All figures are SAMPLE unless tagged LIVE — the LIVE tiles read the real
// figures from /api/owner/dashboard-stats on load (Phase 2 fix: they
// were a hardcoded 17 Nov snapshot before). Demo data is never
// presented as real.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../../lib/api";
import {
  AppShell,
  PageHeader,
  Card,
  KpiTile,
  Button,
  IconButton,
  Badge,
  Input,
  Select,
  AmountInput,
  DateRange,
  FormField,
  Skeleton,
  SkeletonCard,
  EmptyState,
  ErrorState,
  CopyButton,
  MaskedValue,
  Tabs,
  Segmented,
  Chip,
  Sheet,
  DataTable,
  BarChart,
  LineChart,
  Sparkline,
  Dialog,
  ConfirmDialog,
  useStaffToast,
  StaffToastHost,
  CommandPalette,
  useCommandPaletteHotkey,
  CHART_COLORS,
  fmtStaffInt,
  fmtStaffMoney,
  maskPhone,
  type NavItem,
  type PaletteAction,
  type DataColumn,
} from "../../../components/staff-ui";
import { canAccessSection, ADMIN_SECTIONS, ADMIN_SECTION_LABELS } from "../../../lib/rbac";

const OWNER_NAV: NavItem[] = [
  { href: "/owner", label: "Command Center" },
  { href: "/owner/finance/withdrawals", label: "Finance" },
  { href: "/owner/payouts", label: "Payouts" },
  { href: "/owner/people/admins", label: "People" },
  { href: "/owner/games", label: "Games" },
  { href: "/owner/reports", label: "Reports" },
  { href: "/owner/engage", label: "Engage" },
  { href: "/owner/settings", label: "Settings" },
  { href: "/owner/ui-demo", label: "UI demo" },
];

const OWNER_BOTTOM: NavItem[] = [
  { href: "/owner", label: "Home" },
  { href: "/owner/finance/withdrawals", label: "Finance" },
  { href: "/owner/payouts", label: "Payouts" },
  { href: "/owner/people/admins", label: "People" },
  { href: "/owner/ui-demo", label: "More" },
];

const DEMO_SECTIONS = [
  { id: "foundation", label: "Buttons & badges" },
  { id: "forms", label: "Forms" },
  { id: "kpis", label: "Cards & KPIs" },
  { id: "states", label: "Loading & empty & error" },
  { id: "privacy", label: "Copy & masked values" },
  { id: "table", label: "DataTable" },
  { id: "charts", label: "Charts" },
  { id: "dialogs", label: "Dialogs & sheets" },
  { id: "toast", label: "Toasts" },
  { id: "fixtures", label: "Adversarial fixtures" },
];

interface LiveStats {
  usersTotal: number;
  usersToday: number;
  depositedTotal: number;
  depositedToday: number;
  paidOutTotal: number;
  paidOutToday: number;
  commissionToday: number;
}

/** The LIVE tiles — real figures from /api/owner/dashboard-stats
 *  (GHS totals + today), loaded on mount. Never hardcoded: the 17 Nov
 *  snapshot they replaced went stale the day after Phase 1 landed. */
function LiveTiles() {
  const [s, setS] = useState<LiveStats | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    api<LiveStats>("/api/owner/dashboard-stats?currency=GHS")
      .then(setS)
      .catch(() => setErr(true));
  }, []);
  if (err) return <p className="rg48-err">Could not load live figures.</p>;
  if (!s) return <Skeleton lines={2} />;
  return (
    <div className="st-kpi-grid">
      <KpiTile label="Users" value={fmtStaffInt(s.usersTotal)} sub={`+${s.usersToday} today · LIVE`} />
      <KpiTile label="Total deposited" value={fmtStaffMoney(s.depositedTotal, "GHS")} sub={`+${fmtStaffMoney(s.depositedToday, "GHS")} today · LIVE`} />
      <KpiTile label="Total paid out" value={fmtStaffMoney(s.paidOutTotal, "GHS")} sub="approved only · LIVE" />
      <KpiTile label="Commission today" value={fmtStaffMoney(s.commissionToday, "GHS")} sub="LIVE" />
    </div>
  );
}

interface WdRow {
  id: string;
  player: string;
  contact: string;
  amount: number;
  currency: string;
  method: string;
  kyc: string;
  risk: string;
  status: string;
  date: string;
}

const SAMPLE_NAMES: [string, string, string, string][] = [
  ["Kwame Mensah", "0244123456", "MTN", "Approved"],
  ["Ama Serwaa", "0209988776", "Telecel", "Required"],
  ["Kofi Boateng", "0551234567", "MTN", "Approved"],
  ["Akosua Nyarko", "0247654321", "AirtelTigo", "Approved"],
  ["Yaw Osei", "0201112233", "MTN", "Not submitted"],
  ["Efua Adjei", "0559876543", "Telecel", "Approved"],
];

function makeRows(n: number): WdRow[] {
  const statuses = ["pending", "approved", "rejected", "held"];
  const rows: WdRow[] = [];
  for (let i = 0; i < n; i++) {
    const [name, phone, method, kyc] = SAMPLE_NAMES[i % SAMPLE_NAMES.length];
    rows.push({
      id: `wd-${String(i + 1).padStart(4, "0")}`,
      player: n > 100 ? `${name} #${i + 1}` : name,
      contact: phone,
      amount: 50 + ((i * 137) % 12000),
      currency: i % 5 === 0 ? "NGN" : "GHS",
      method,
      kyc,
      risk: i % 7 === 0 ? "2 flags" : "—",
      status: statuses[i % statuses.length],
      date: `17 Nov ${String(8 + (i % 10)).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}`,
    });
  }
  return rows;
}

export default function StaffDemo({ ownerName }: { ownerName: string }) {
  const { toasts, push, dismiss, undo } = useStaffToast();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const [amount, setAmount] = useState("250.00");
  const [amountError, setAmountError] = useState("");
  const [range, setRange] = useState({ from: "2026-11-11", to: "2026-11-17" });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [dangerOpen, setDangerOpen] = useState(false);
  const [oneSection, setOneSection] = useState(false);

  useCommandPaletteHotkey(useCallback(() => setPaletteOpen(true), []));

  // Palette actions are demo-local: the IA routes they name land in
  // Phase 2, so selecting one says so instead of navigating to a 404.
  const paletteActions: PaletteAction[] = useMemo(
    () => [
      ...OWNER_NAV.map((n) => ({
        id: n.href,
        group: "Pages",
        label: n.label,
        sub: n.href,
        onSelect: () => push({ text: `Demo: “${n.label}” opens in Phase 2 — the route does not exist yet.`, kind: "info" }),
      })),
      {
        id: "p1",
        group: "Players (sample)",
        label: "Kwame Mensah",
        sub: "024•••••56 · GH₵350.00 cash",
        onSelect: () => push({ text: "Demo: would open Kwame Mensah's profile (Phase 5).", kind: "info" }),
      },
      {
        id: "p2",
        group: "Players (sample)",
        label: "Ama Serwaa",
        sub: "020•••••76 · KYC required",
        onSelect: () => push({ text: "Demo: would open Ama Serwaa's profile (Phase 5).", kind: "info" }),
      },
      {
        id: "a1",
        group: "Quick actions",
        label: "Open withdrawals queue",
        onSelect: () => push({ text: "Demo: the withdrawals queue opens in Phase 3.", kind: "info" }),
      },
      {
        id: "a2",
        group: "Quick actions",
        label: "Open payouts",
        onSelect: () => push({ text: "Demo: payouts open in Phase 3.", kind: "info" }),
      },
    ],
    [push],
  );

  const permNav = useMemo(() => {
    const fakeAdmin = oneSection
      ? { role: "admin", permissions: ["money"] as string[] }
      : { role: "admin", permissions: null };
    return ADMIN_SECTIONS.filter((s) => canAccessSection(fakeAdmin, s)).map((s) => ADMIN_SECTION_LABELS[s]);
  }, [oneSection]);

  return (
    <AppShell
      brandTitle="Owner panel"
      brandSub="Platform-wide control"
      roleLabel="Owner"
      navItems={OWNER_NAV}
      bottomItems={OWNER_BOTTOM}
      preview={preview ? { name: "Adaeze Mensah (admin)", onExit: () => setPreview(false) } : null}
      onSearch={() => setPaletteOpen(true)}
    >
      <PageHeader
        title="Staff UI demo"
        sub="Every staff-ui component in its states. All figures below are SAMPLE unless tagged LIVE. Demo only — never linked from the player site. The sidebar links point at the Phase 2 owner routes."
        crumbs={[
          { label: "Owner", href: "/owner" },
          { label: "UI demo" },
        ]}
        actions={
          <>
            <Button variant="secondary" onClick={() => setPreview(!preview)}>
              {preview ? "Stop previewing" : "Preview as an admin"}
            </Button>
            <Button variant="ghost" onClick={() => setPaletteOpen(true)}>
              Search ⌘K
            </Button>
          </>
        }
      />

      <div className="st-demo-section-nav" role="navigation" aria-label="Demo sections">
        {DEMO_SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="st-chip">
            {s.label}
          </a>
        ))}
      </div>

      <Card title="Buttons & badges" id="foundation">
        <div className="st-demo-row">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="primary" loading>
            Saving…
          </Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
          <IconButton label="Close">✕</IconButton>
          <IconButton label="Menu">☰</IconButton>
        </div>
        <div className="st-demo-row">
          <Badge variant="paid">Paid</Badge>
          <Badge variant="pending">Pending</Badge>
          <Badge variant="rejected">Rejected</Badge>
          <Badge variant="held">Held</Badge>
          <Badge variant="muted">Draft</Badge>
          <Badge variant="info">Info</Badge>
        </div>
        <p className="st-demo-note">44px targets, :active scale, hover gated behind (hover:hover) — touch never gets a stuck hover.</p>
        <p className="st-demo-note">
          Route tabs — each tab is a link to its own page (click one and that page loads; Back works). The UI demo tab
          is active because you are on it:
        </p>
        <Tabs
          label="Staff pages"
          items={[
            { id: "owner", label: "Owner", href: "/owner" },
            { id: "demo", label: "UI demo", href: "/owner/ui-demo" },
            { id: "admin", label: "Admin", href: "/admin" },
          ]}
        />
      </Card>

      <Card title="Forms" id="forms">
        <div className="st-demo-grid st-demo-grid-2">
          <FormField label="Player name" hint="Shown exactly as the player typed it.">
            <Input type="text" defaultValue="Kwame Mensah" aria-label="Player name" />
          </FormField>
          <FormField label="Method" hint="Pick one.">
            <Select defaultValue="MTN" aria-label="Method">
              <option>MTN</option>
              <option>Telecel</option>
              <option>AirtelTigo</option>
              <option>card</option>
            </Select>
          </FormField>
          <FormField
            label="Amount"
            required
            hint="Decimal keyboard on phones."
            error={amountError || undefined}
          >
            <AmountInput
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setAmountError(Number(e.target.value) > 0 ? "" : "Enter an amount above 0.");
              }}
              aria-label="Amount"
            />
          </FormField>
          <FormField label="Date range">
            <DateRange value={range} onChange={setRange} max="2026-11-17" />
          </FormField>
        </div>
        <p className="st-demo-note">All inputs are 16px — iOS never zooms into them. Labels sit above, errors sit with the field.</p>
      </Card>

      <Card title="Cards & KPIs" id="kpis">
        <LiveTiles />
        <div className="st-demo-row" style={{ marginTop: 16 }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <KpiTile label="Deposits (sample)" value="GH₵12,480.00" sub="+18% vs prev. 7 days" delta="+18%" deltaUp />
            <Sparkline values={[1200, 3400, 2100, 5600, 4300, 6100, 2900]} />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <KpiTile label="Withdrawals (sample)" value="GH₵3,210.00" sub="−6% vs prev. 7 days" delta="−6%" deltaUp={false} />
            <Sparkline values={[300, 900, 500, 1400, 800, 1100, 600]} color={CHART_COLORS.redText} />
          </div>
        </div>
        <p className="st-demo-note">LIVE tiles read the real figures from the dashboard-stats endpoint on load. Sample tiles carry deltas; Prime tiles keep the today sub-line only.</p>
      </Card>

      <Card title="Loading, empty & error states" id="states">
        <div className="st-demo-grid st-demo-grid-2">
          <div>
            <p className="st-demo-note">Skeleton — matches the layout, never a blank page:</p>
            <Skeleton title lines={3} />
            <div style={{ marginTop: 12 }}>
              <SkeletonCard />
            </div>
          </div>
          <div>
            <EmptyState
              title="No withdrawal requests."
              text="Nothing is waiting for review. New requests will appear here."
              actionLabel="View all withdrawals"
              onAction={() => push({ text: "Demo: would open the full list.", kind: "info" })}
            />
            <ErrorState
              title="Could not load withdrawals."
              text="The request failed. Your data is safe — try again."
              onRetry={() => push({ text: "Demo: retried the load.", kind: "info" })}
            />
          </div>
        </div>
      </Card>

      <Card title="Copy & masked values" id="privacy">
        <p className="st-demo-note">
          Masked by default (decision D1). Copy copies the MASKED value only. Reveal is disabled until the audited reveal
          endpoint lands (Phase 3) — it never shows a full number from nowhere and never claims an audit entry.
        </p>
        <div className="st-demo-row">
          <span>MoMo:</span>
          <MaskedValue value="0244123456" kind="phone" label="MoMo number" />
        </div>
        <div className="st-demo-row">
          <span>Bank:</span>
          <MaskedValue value="1234567890123" kind="account" label="Bank account" />
        </div>
        <div className="st-demo-row">
          <span>Email:</span>
          <MaskedValue value="kwame.mensah@example.com" kind="email" label="Email" />
        </div>
        <div className="st-demo-row">
          <span>Round ID:</span>
          <span className="st-mono">crash-9f2c41aa…</span>
          <CopyButton text="crash-9f2c41aa7d" label="Copy ID" />
        </div>
      </Card>

      <TableDemo
        onRowAction={(label, row) =>
          push({ text: `Demo: “${label}”${row ? ` on ${row.player}` : ""} — nothing was written.`, kind: "info" })
        }
      />
      <ChartsDemo />

      <Card title="Dialogs & sheets" id="dialogs">
        <div className="st-demo-row">
          <Button variant="secondary" onClick={() => setDialogOpen(true)}>
            Open dialog
          </Button>
          <Button variant="secondary" onClick={() => setConfirmOpen(true)}>
            Confirm with reason
          </Button>
          <Button variant="danger" onClick={() => setDangerOpen(true)}>
            Danger zone (type to confirm)
          </Button>
          <Button variant="secondary" onClick={() => setSheetOpen(true)}>
            Open bottom sheet
          </Button>
        </div>
        <p className="st-demo-note">
          Owner {ownerName} — dialogs trap focus, close on Escape, and the confirm button stays disabled until the
          reason (≥3 chars) and the typed word are given.
        </p>
      </Card>

      <Card title="Toasts" id="toast">
        <div className="st-demo-row">
          <Button
            variant="secondary"
            onClick={() =>
              push({
                text: "Payout marked paid — GH₵5.00 to Royale Admin (demo — nothing was written).",
                kind: "win",
                undoLabel: "Undo",
                onUndo: () => push({ text: "Undone — payout is unpaid again (demo).", kind: "info" }),
              })
            }
          >
            Mark paid (with Undo)
          </Button>
          <Button
            variant="secondary"
            onClick={() => push({ text: "Withdrawal rejected — reason recorded.", kind: "lose" })}
          >
            Reject (no undo)
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              push({ text: "Promotion created.", kind: "win", linkLabel: "View audit", linkHref: "/owner/reports" })
            }
          >
            With audit link
          </Button>
        </div>
        <p className="st-demo-note">Undo is real in this demo: tapping it reverses the demo state. Toasts auto-dismiss after 6s.</p>
      </Card>

      <Card title="Adversarial fixtures" id="fixtures">
        <p className="st-demo-note">
          The worst cases, on purpose: 7-figure amounts, very long names and emails, a 10,000-row table (see the
          DataTable section), an admin with only 1 permitted section, and the owner preview.
        </p>
        <div className="st-demo-row">
          <span>7-figure:</span>
          <span className="st-amount">{fmtStaffMoney(1234567.89, "GHS")}</span>
          <span className="st-amount">{fmtStaffMoney(9876543.21, "NGN")}</span>
        </div>
        <div className="st-demo-row">
          <span>Long name:</span>
          <b style={{ overflowWrap: "anywhere" }}>Kwame-Alexander Osei-Mensah-Boateng Junior the Third</b>
        </div>
        <div className="st-demo-row">
          <span>Long email:</span>
          <span className="st-mono">kwame.alexander.osei.mensah.boateng.junior.the.third@verylongdomainname.example.com</span>
        </div>
        <div className="st-demo-row">
          <span>Masked long phone:</span>
          <span className="st-mono">{maskPhone("024412345678901234567890")}</span>
        </div>
        <Segmented
          items={[
            { id: "all", label: "Admin — all sections" },
            { id: "one", label: "Admin — Money only" },
          ]}
          value={oneSection ? "one" : "all"}
          onChange={(id) => setOneSection(id === "one")}
          label="Permission demo"
        />
        <p>
          This admin sees {permNav.length} section{permNav.length === 1 ? "" : "s"}: {permNav.join(" · ")}
        </p>
        <p className="st-demo-note">
          The sidebar and bottom bar show exactly those sections — never dead tabs. The owner preview banner above
          (toggle “Preview as an admin”) says “read-only” and carries a real Exit button.
        </p>
      </Card>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title="About this demo">
        <p>
          The staff component library is the foundation for the admin and owner redesign. Nothing on this page touches
          money, permissions or the audit log — it only shows the pieces.
        </p>
        <div className="st-dialog-actions">
          <Button variant="primary" onClick={() => setDialogOpen(false)}>
            Got it
          </Button>
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={async (reason) => {
          setConfirmOpen(false);
          push({ text: `Approved with reason: “${reason}” (demo — nothing was written).`, kind: "win" });
        }}
        title="Approve withdrawal?"
        body="This approves the request. The player is paid out by the finance flow afterwards — nothing moves here."
        facts={[
          { label: "Amount", value: "GH₵250.00" },
          { label: "Player", value: "Kwame Mensah" },
          { label: "Destination", value: "MoMo · MTN · 024•••••56 (masked)" },
          { label: "Consequence", value: "Status becomes Approved; the owner is notified." },
        ]}
        reasonRequired
        confirmLabel="Approve"
      />

      <ConfirmDialog
        open={dangerOpen}
        onClose={() => setDangerOpen(false)}
        onConfirm={async () => {
          setDangerOpen(false);
          push({ text: "Demo: danger action confirmed (nothing happened).", kind: "lose" });
        }}
        title="Pause all games?"
        body="This is the danger zone pattern: the current state, the plain-language effect, and a typed confirmation."
        facts={[
          { label: "Current state", value: "All games live" },
          { label: "Effect", value: "Every game stops taking stakes until resumed." },
        ]}
        typedConfirm="PAUSE"
        confirmLabel="Pause all games"
        danger
      />

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Payout details (sample)">
        <p>
          Royale Admin — owed GH₵5.00. MoMo · MTN · 024•••••78 (masked). Code RG-DEMO1. Reveal is audited and lands in
          Phase 3.
        </p>
        <div className="st-demo-row">
          <Button variant="primary" onClick={() => setSheetOpen(false)}>
            Done
          </Button>
        </div>
      </Sheet>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} actions={paletteActions} />
      <StaffToastHost toasts={toasts} onDismiss={dismiss} onUndo={undo} />
    </AppShell>
  );
}

function TableDemo({ onRowAction }: { onRowAction: (label: string, row?: WdRow) => void }) {
  const allRows = useMemo(() => makeRows(24), []);
  const bigRows = useMemo(() => makeRows(10000), []);
  const [big, setBig] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState("amount");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<"data" | "empty" | "error">("data");
  const pageSize = 10;

  const source = big ? bigRows : allRows;
  const filtered = useMemo(() => {
    let rows = source;
    if (filter) rows = rows.filter((r) => r.status === filter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((r) => `${r.player} ${r.contact} ${r.id}`.toLowerCase().includes(q));
    }
    const dir = sortDir === "asc" ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      if (sortKey === "amount") return (a.amount - b.amount) * dir;
      return a.date.localeCompare(b.date) * dir;
    });
    return rows;
  }, [source, filter, search, sortKey, sortDir]);

  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of source) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [source]);

  const columns: DataColumn<WdRow>[] = [
    {
      key: "player",
      label: "Player",
      render: (r) => r.player,
      sub: (r) => maskPhone(r.contact),
      details: (r) => [
        ["Contact", maskPhone(r.contact)],
        ["Method", r.method],
        ["KYC", r.kyc],
      ],
    },
    {
      key: "amount",
      label: "Amount",
      sortable: true,
      render: (r) => <span className="st-amount">{fmtStaffMoney(r.amount, r.currency)}</span>,
      details: (r) => [["Currency", r.currency]],
    },
    { key: "method", label: "Method", render: (r) => r.method },
    { key: "kyc", label: "KYC", render: (r) => r.kyc },
    { key: "risk", label: "Risk", render: (r) => r.risk },
    {
      key: "status",
      label: "Status",
      render: (r) => (
        <Badge variant={r.status === "approved" ? "paid" : r.status === "rejected" ? "rejected" : r.status === "held" ? "held" : "pending"}>
          {r.status}
        </Badge>
      ),
      details: (r) => [["Status", r.status]],
    },
    {
      key: "date",
      label: "Requested",
      sortable: true,
      render: (r) => r.date,
      details: (r) => [["Requested", r.date]],
    },
  ];

  const exportCsv = () => {
    const head = "id,player,contact_masked,amount,currency,method,kyc,status,date";
    const lines = filtered.map((r) => [r.id, r.player, maskPhone(r.contact), r.amount, r.currency, r.method, r.kyc, r.status, r.date].join(","));
    const blob = new Blob([[head, ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "withdrawals-sample.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card title="DataTable" id="table" sub="Withdrawals queue (sample data). ≤760px this becomes cards — never a squeezed table.">
      <div className="st-demo-row">
        <Segmented
          items={[
            { id: "data", label: "With data" },
            { id: "empty", label: "0 rows" },
            { id: "error", label: "Failed load" },
          ]}
          value={mode}
          onChange={(id) => {
            setMode(id as "data" | "empty" | "error");
            setPage(1);
          }}
          label="Table state"
        />
        <Chip label={big ? "10,000 rows" : "24 rows"} active={big} onClick={() => { setBig(!big); setPage(1); setSelected([]); }} />
      </div>
      <DataTable<WdRow>
        viewId="demo-withdrawals"
        columns={columns}
        rows={mode === "data" ? pageRows : []}
        total={mode === "data" ? filtered.length : 0}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={(key) => {
          if (key === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
          else {
            setSortKey(key);
            setSortDir("desc");
          }
          setPage(1);
        }}
        search={search}
        onSearchChange={(q) => {
          setSearch(q);
          setPage(1);
        }}
        searchPlaceholder="Search by player, contact or ID"
        filters={[
          { id: "", label: "All", count: source.length },
          { id: "pending", label: "Pending", count: statusCounts.pending },
          { id: "approved", label: "Approved", count: statusCounts.approved },
          { id: "rejected", label: "Rejected", count: statusCounts.rejected },
          { id: "held", label: "Held", count: statusCounts.held },
        ]}
        activeFilter={filter}
        onFilterChange={(id) => {
          setFilter(id);
          setPage(1);
        }}
        onExportCsv={exportCsv}
        loading={false}
        error={mode === "error" ? "The withdrawals list failed to load." : null}
        onRetry={() => setMode("data")}
        emptyTitle="No withdrawal requests."
        emptyText="No rows match the current filters. Clear the search or pick another status."
        emptyActionLabel="Clear filters"
        onEmptyAction={() => {
          setSearch("");
          setFilter("");
          setMode("data");
        }}
        rowActions={[
          { label: "Approve", onClick: (row) => onRowAction("Approve", row) },
          { label: "Reject…", onClick: (row) => onRowAction("Reject", row), danger: true },
          { label: "Open player", onClick: (row) => onRowAction("Open player", row) },
        ]}
        bulkActions={[{ label: "Export selected", onClick: (ids) => onRowAction(`Export ${ids.length} selected`) }]}
        selectedIds={selected}
        onSelectionChange={setSelected}
        expandable
        expandRender={(r) => (
          <span>
            Destination: MoMo · {r.method} · {maskPhone(r.contact)} (masked). Previous withdrawals: 1 approved
            (GH₵100.00, 12 Nov) · 0 rejected. Deposited GH₵500.00 in the last 24h · 0 rounds played.
          </span>
        )}
      />
      <p className="st-demo-note">
        Server-driven shape: page/sort/filter/search are props the caller owns — the real endpoints take the same
        params in Phase 3+. Saved views persist per-viewer in localStorage (filter + sort only, never row data).
      </p>
    </Card>
  );
}

function ChartsDemo() {
  const labels = ["11 Nov", "12 Nov", "13 Nov", "14 Nov", "15 Nov", "16 Nov", "17 Nov"];
  return (
    <Card title="Charts" id="charts" sub="Hand-rolled SVG, zero new dependencies (decision D5). Tap a bar or point for its exact value.">
      <div className="st-demo-grid st-demo-grid-2">
        <div>
          <p className="st-demo-note">Deposits vs payouts (sample, GH₵):</p>
          <BarChart
            labels={labels}
            series={[
              { label: "Deposits", color: CHART_COLORS.gold, values: [1200, 3400, 2100, 5600, 4300, 6100, 2900] },
              { label: "Payouts", color: CHART_COLORS.green, values: [300, 900, 500, 1400, 800, 1100, 600] },
            ]}
            formatValue={(v) => fmtStaffMoney(v, "GHS")}
          />
        </div>
        <div>
          <p className="st-demo-note">GGR trend (sample, GH₵):</p>
          <LineChart
            labels={labels}
            series={[{ label: "GGR", color: CHART_COLORS.gold, values: [900, 2500, 1600, 4200, 3500, 5000, 2300] }]}
            formatValue={(v) => fmtStaffMoney(v, "GHS")}
          />
        </div>
        <div>
          <p className="st-demo-note">Commission per day (sample, GH₵):</p>
          <BarChart
            labels={labels}
            series={[{ label: "Commission", color: CHART_COLORS.muted, values: [120, 340, 210, 560, 430, 610, 290] }]}
            formatValue={(v) => fmtStaffMoney(v, "GHS")}
          />
        </div>
        <div>
          <p className="st-demo-note">RTP vs target (sample, %):</p>
          <LineChart
            labels={labels}
            series={[
              { label: "RTP", color: CHART_COLORS.green, values: [94, 96, 93, 97, 95, 96, 94] },
              { label: "Target", color: CHART_COLORS.redText, values: [95, 95, 95, 95, 95, 95, 95] },
            ]}
            formatValue={(v) => `${v}%`}
          />
        </div>
      </div>
    </Card>
  );
}
