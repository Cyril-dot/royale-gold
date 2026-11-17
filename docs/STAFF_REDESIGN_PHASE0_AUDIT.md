# Staff Redesign — Phase 0 Audit & Plan (Royale Gold Admin & Owner panels)

> Phase 0 only. No code was changed for this document. Repo `Cyril-dot/royale-gold`,
> branch `main`, HEAD `dad2cfe` (17 Nov 2026). Staff panels only — the player site
> is out of scope and was not redesigned. The earlier full-site redesign brief
> (`~/workspace/user/files/royale-gold-redesign-brief.md`) is ON HOLD at Chuks's
> word; this track covers `/admin/*` and `/owner` only.
>
> Sources read: the staff brief verbatim; `API_CONTRACT.md`;
> `docs/FINANCIAL_METRIC_DEFINITIONS.md`; `docs/OWNER_DASHBOARD_ARCHITECTURE.md`;
> `docs/MOBILE_QA_CHECKLIST.md`; `TODO.md` (Prime); `src/lib/rbac.ts`;
> `src/lib/anti-clone.ts`; all 14 admin routes + `AdminNav.tsx` +
> `AdminPlayerDetail.tsx` (601 lines); `src/app/owner/page.tsx` in full
> (3,538 lines); `owner-commission.css` (237), `admin-v11.css` (30),
> `admin-players.css` (359), `admin-commission.css` (18), `admin-ref.css` (20);
> `v48.css` tokens (lines 102–124) and `globals.css` shared classes.
>
> Skills-first design read: staff back-office for a Ghanaian real-money casino.
> Audience: the owner (phone-first, 390×844 primary) and a small admin team
> (phone + laptop). Job: triage money queues fast and act safely. Aesthetic:
> RG dark/gold flat fintech — midnight `#070812`, one gold accent `#F2C230`,
> Outfit bold amounts, dense-but-calm. Dials: variance 4 (disciplined, not
> flashy), motion 3 (state feedback only), density 8 (dashboard-dense).
> Mobile-native baseline applies throughout: 44px targets, 16px inputs,
> `100dvh` shell, safe-area insets, hover gated behind
> `(hover:hover) and (pointer:fine)`, no tap flash, zoom never disabled.
> Adversarial fixtures for every view: 7-figure amounts (e.g. GH₵66,200.00),
> very long names/emails, 0 rows, 10,000 rows, failed/slow requests, an admin
> with only 1 permitted section, the owner previewing an admin.

## 1. Summary

- The owner panel is one 3,538-line client component with 41 sections and
  ~30 API calls fired on mount for every tab, none of them deep-linkable;
  the admin panel is 14 real routes but shares one 14-tab horizontal strip,
  repeated chrome, and no attention-first home.
- The most dangerous actions (Mark paid, Record payout, Pay jackpot/cashback,
  Kill all sessions, gateway flip, maintenance toggle, withdrawal Approve)
  are single taps with no confirmation, no typed reason, and no audit link
  shown — only 2 `window.confirm` calls exist in the whole owner page.
- Sensitive data is unmasked where it matters most (Payouts Details shows
  full MoMo/bank numbers), while the withdrawal approver paradoxically
  cannot see the destination account at all — the queue rows carry no
  account fields.
- The fix is a shared foundation first (one `tokens.css` + one
  `src/components/staff-ui/` library + real route layouts), then the owner
  split into routes and the admin queues rebuilt on the same patterns —
  carrying Prime Phase 1 (date range, charts, drill-down) and the Payouts
  tab over unchanged in behaviour.

## 2. Changed files (Phase 0)

- `docs/STAFF_REDESIGN_PHASE0_AUDIT.md` (this file) — new, uncommitted.
- Nothing else. No code changed, nothing committed, nothing pushed.
- Wireframes (not production UI): `~/workspace/your_files/rg-staff-redesign-phase0/wireframes.html`
  + `wireframes-390.png` / `wireframes-1280.png` (real captures of that HTML).

## 3. The 10 worst UX problems (with file:line evidence)

**1. The owner panel is a 3,538-line monolith — 41 sections, one component, no routes.**
`src/app/owner/page.tsx:1–3538`, 41 `<h3>` elements, 43 `useEffect` calls,
~30 state variables in the main component plus 7 sub-components defined in
the same file (`OwnerAdminPerms`, `OwnerGameRow`, `OwnerPayRow`,
`OwnerWalletForm`, `JackpotPayForm`, `CmsPageEditor`, `OwnerCurrencyConfig`,
`OwnerGatewaySection`). Tabs are `useState` (`page.tsx:668`), not URLs.

**2. Everything fetches on mount, for tabs nobody opens.**
32 `useEffect(() => { void load… })` mount loaders in `owner/page.tsx`:
`loadWdThresholds`, `loadOwnerWd`, `loadOwnerLedger`, `loadPnl`, `loadRules`,
`loadSettlement`, `loadAudit`, `loadOwnerGames`, `loadOwnerPay`,
`loadOwnerWallet`, `load` (admins + rollup), `loadDay`, `loadDash`,
`loadPayouts`, `loadAnalytics` (revenue + RTP), `loadOwnerFraud`,
`loadPromos`, `loadAnnouncements`, `loadPlatSettings`, `loadKycSettings`,
`loadSupport`, `loadCashier`, `loadVipTiers`, `loadBi`, `loadReplays`,
`loadLoyalty`, `loadOwnerTournaments`, `loadJackpots`, `loadCms`,
`loadRiskRules`, `loadAnomalies`, `loadBrands`. Opening `/owner` fires
~30 owner-only API calls before first paint, on mobile data. (The admin
panel does not have this problem — each route loads only its own data.)

**3. Nothing in the owner panel is deep-linkable; Back leaves the whole panel.**
Tab state is `useState<OwTab>` (`page.tsx:668`); sub-views (commission
Per-day/Rollup, money Deposits/Withdrawals/Ledger) are more `useState`.
The only cross-link is `drillTo` (`page.tsx:691–696`), which switches tab
then `scrollIntoView`s an anchor — a link that cannot be shared, bookmarked,
or reached with Back. Same pattern inside admin Money (state tabs,
`src/app/admin/money/page.tsx:48`) and admin Commission/Referrals.

**4. Money-moving and irreversible actions are single taps — no confirm, no typed reason, no audit link.**
Only 2 `window.confirm` calls exist in the entire owner page:
game kill (`page.tsx:152`) and global-kill pause (`page.tsx:941`).
Everything else fires on one tap: Payouts Mark paid / Not paid / Reject
(`markPayout`, no reason field at all — Reject posts `{action:"rejected"}`
with no reason); Settlement Record payout (`recordPayout`, amount + method,
no confirm); Pay cashback (`payCashbackFor`); Pay birthdays
(`payBirthdays`); Pay jackpot (`payJackpot`); End tournament (two-step
inline button only); Kill all sessions (`OwnerAdminPerms.kill`); Deactivate
admin (`toggleActive`); Gateway Demo/PayTeller flip (`OwnerGatewaySection.flip`
— client-side key guard only, no server-side guard); Maintenance-mode save
(`savePlatSettings` — a checkbox + Save); Risk-rule toggle
(`toggleRiskRule` — enables an auto-block/hold rule in one tap).
Admin side, same pattern: withdrawal Approve is one tap
(`src/app/admin/money/page.tsx:decide` — Reject needs a reason, Approve
needs nothing); Close ticket is one tap (`src/app/admin/tickets/page.tsx:closeTicket`,
no reason); Send campaign to N players is one tap
(`src/app/admin/campaigns/page.tsx:send`, irreversible — no resend/edit);
Block player needs a reason but no confirm (`AdminPlayerDetail.tsx:submitBlock`).
Toasts are text-only with no undo (`src/lib/store.tsx:79`).

**5. Sensitive data is shown in full where it matters most.**
Payouts Details renders the admin's saved account in full —
`MoMo · {network} · {phoneNumber} · {accountName}` and
`Bank · {bankName} · {accountNumber} · {accountName}`
(`page.tsx`, Payouts section, `payoutDetail` block). The KYC queue prints
the full document URL as text next to the link
(`src/app/admin/kyc/page.tsx`, `.kyc-doc` span). Player/admin emails and
phones are in full on every row, subtitle and CSV. There is no
`MaskedValue`, no reveal control, no reveal-audit anywhere in the tree
(grep: 0 hits). Correction to the brief, see §8.3: CSV exports do NOT
contain account numbers (`src/lib/reports.ts` has no account fields) —
the live full-number surfaces are Payouts Details and the KYC document URL.

**6. The withdrawal approver cannot see where the money goes.**
The queue row types carry no payout-account fields:
`WithdrawalRow` (`src/app/admin/money/page.tsx:17–18`) and `OwnerWdRow`
(`page.tsx:707`) have no `account`/`accountNumber`/`phoneNumber` fields.
An admin or owner approving a withdrawal sees name, contact, amount,
method and risk flags — but not the MoMo number or bank account the money
will be sent to. The destination exists only as a snapshot on the
`Withdrawal` row and in Payouts Details (commission, not withdrawals).

**7. No list paginates — the API has no cursor/offset pagination at all.**
Grep over `src/app/api/` finds zero `cursor`/`offset` params. A few
endpoints accept `limit` only (owner withdrawals default 50/max 100,
`src/app/api/owner/withdrawals/route.ts:22`; audit-log default 100/max 200;
ledger default 50) and the UI never passes `limit`, so every list renders
its first-N in full: rollup (all days), audit log, replays (50), revenue
tables, admin deposits/withdrawals/ledger/activity. The ledger is a
computed view capped at 200 rows/source (`src/lib/ledger.ts`), so long
lists silently truncate. At 10,000 rows the phone renders 10,000 rows.

**8. Admin navigation is a 14-tab horizontal strip with a scroll hack, and every page repeats the same chrome.**
`src/components/AdminNav.tsx:52–54` scrolls the active tab into view on
mount because 14 tabs do not fit a phone. Every one of the 14 pages
re-renders the same header block (`.rg48-hbar-in` title + admin subtitle
line + `<AdminNav />` + `CurrencyChips`) — 14 copies, no shared page
shell. The Overview has no "needs attention" tiles at all
(`src/app/admin/page.tsx`: commission summary, at-a-glance, today-so-far,
7-day chart, top players, latest commission days, broadcast) — pending
withdrawals, KYC queue, open tickets and fraud flags are on other routes
with no counts surfaced here, and no endpoint returns them in one call
(`GET /api/admin/overview` returns commission/codes/users/history only).
There is no global player search on the admin side (each page has its own
scoped search) and no command palette anywhere (grep: 0 hits).

**9. The highest-stakes screens are the least guided.**
KYC (`src/app/admin/kyc/page.tsx:166`): the "document viewer" is a bare
`View document ↗` link plus the raw URL as text — no side-by-side view,
no zoom/rotate, no keyboard shortcuts, no next-item flow, no reason
templates (reject reason is a free-text input). Fraud
(`src/app/admin/fraud/page.tsx:107`): alerts are computed live on every
load and never stored, so there is no triage state — nothing can be
acknowledged, assigned or resolved; the only action is opening the player.
Tickets (`src/app/admin/tickets/page.tsx:206`): inline thread, no canned
replies, no assign (only the owner can reassign, from Support oversight),
close with no reason. Player detail (`AdminPlayerDetail.tsx`, 601 lines):
13 stacked sections (Balances, Totals, Commission earned, VIP, Bet
history, Tickets, Balance adjustment, Block/Unblock, Bonus grant, Notes,
Send notification, Tags, Limits, Full deposit history) in one scroll —
no tabs, no deep links, no per-tab loading; the read-only downline state
is a single small line.

**10. Six staff stylesheets, all imported globally, two card languages, no shared patterns.**
`src/app/layout.tsx:4–25` imports `v48.css` (2,103 lines, tokens at
102–124) + `admin-ref.css` (20) + `admin-v11.css` (30) +
`owner-commission.css` (237) + `admin-commission.css` (18) +
`admin-players.css` (359) on EVERY page, player pages included — staff
CSS ships to players. The shared classes the staff pages actually use
(`.admin-sec`, `.dep-table`, `.sum-card`, `.sum-cards`) live in
`globals.css:59–80`, not in the staff files, so deleting the `-vNN` files
does not remove the staff system. Two card languages coexist: admin
`.admin-sec` is a boxed steel card (`globals.css:59`), owner cards are
flat/transparent with hairline separators (`owner-commission.css`,
flat pass). There is no shared DataTable, form, dialog, toast-with-undo,
skeleton, empty-state or error-state component anywhere (grep for
`Skeleton`: 0 hits); every loading state is a plain `<p>Loading…</p>`
(13 identical `Loading admin panel…` full-page returns across the admin
routes); tables are raw `<table class="dep-table">` in a horizontal-scroll
wrapper (`.rg48-twrap`) — at 390px the 5–7 column tables (Live feed: 6
columns; RTP monitor: 7) squeeze instead of becoming cards. There is no
`src/app/admin/layout.tsx` or `src/app/owner/layout.tsx` — the root
layout renders the player Header, Dock (Home/Games/Play/Promos/Winners)
and AuthModal on staff pages too (`layout.tsx:93–97`).

## 4. Final sitemap / IA

Principles applied (from the skills): one pattern per job; attention first;
every page a real URL; ≤2 taps to any section on a phone; bottom nav ≤5;
preserve existing slugs unless there is a reason to move (the brief's
suggested IA is kept wherever it works — refinements below are marked
**REFINED** with the reason).

### 4.1 Admin — `/admin/*` (paths unchanged; shell + home rebuilt)

| Route | Page | What changes |
|---|---|---|
| `/admin` | Overview | **Rebuilt attention-first:** needs-attention tiles (pending withdrawals, KYC queue, open tickets, fraud HIGH) with counts + deep links, then today KPIs, deposits trend, top players, broadcast. Needs `GET /api/admin/attention` (§7). |
| `/admin/players` | Players | Shared DataTable + segment/VIP filters + search (kept). |
| `/admin/players/[id]` | Player detail | **Tabbed profile** (Summary · Wallet & ledger · Rounds · KYC · Limits & RG · Notes & tags · Notifications · Audit). Each action via ConfirmDialog with required reason + "audit-logged" note. Audit tab needs per-player audit param (§7). |
| `/admin/money` | Money | One route, deep-linkable sub-views via `?view=deposits\|withdrawals\|ledger` (keeps one page, fixes Back/share). Withdrawals queue gets the guided flow: KYC state + destination account + risk flags + previous withdrawals inline + next-in-queue. |
| `/admin/kyc` | KYC review | Queue + side-by-side document viewer (zoom/rotate) + decision panel (approve / reject with reason template) + keyboard shortcuts + next-item flow. |
| `/admin/fraud` | Fraud | Alerts triaged by severity with evidence, linked players, one-tap actions. **Needs stored triage state to acknowledge/resolve — a backend decision, not assumed (§7).** Until then: severity filter + evidence + player link (what the live compute supports). |
| `/admin/tickets` | Tickets | Inbox + conversation view (chat-style thread, canned replies, close-with-reason). Assign stays owner-only (existing rule). |
| `/admin/lookup` | Bet lookup | Clean two-step tool (round / player rounds) + provably-fair verify, copyable results (CopyButton on ids, seeds, hashes). |
| `/admin/reports` | Reports | Shared DataTable + filter bar + CSV export (kept, with masking warning — §7). |
| `/admin/activity` | Activity | Shared DataTable + action filter (filter options from the endpoint, not from the loaded rows — current bug: options derive from `rows`, `activity/page.tsx`). |
| `/admin/referrals` | Referrals | Kept (codes + promo codes + list/tree). |
| `/admin/commission` | Commission | Kept (day detail + history tabs → URL `?view=`). |
| `/admin/campaigns` | Campaigns | Kept (audience preview is already good) + ConfirmDialog on Send (irreversible, N recipients). |
| `/admin/tournaments` | Tournaments | Kept (end + pay keeps its two-step inline confirm). |
| `/admin/live` | Live feed | Pause/resume + filters; table → cards on phone (6 columns squeeze at 390px today). Polling 15s kept (no socket infra). |

- **Shell:** desktop persistent left sidebar; phone top bar + slide-over
  drawer + bottom bar with the 4 most-used sections **for that admin**
  (default Overview · Players · Money · Tickets, permission-filtered —
  an admin with 2 sections sees those 2 + More, never dead tabs).
  Sidebar shows only sections `canAccessSection` allows
  (`src/lib/rbac.ts` — already the rule in `AdminNav.tsx`).
- **Preview:** `?preview=<adminId>` preserved on every link (already the
  rule in `AdminNav.tsx:href`). **REFINED:** the banner must say
  "Previewing as \<admin\> — read-only" with a real **Exit** button.
  Today it says only "Previewing \<name\>" with a "Back to Owner panel"
  link (`AdminNav.tsx:AdminPreviewBanner`) — no read-only wording, no
  button. Actions are already hidden in preview; the banner must say so.
- **Denied deep link:** `AdminDenied` already exists and is good — keep
  it, restyle into the shared ErrorState.

### 4.2 Owner — `/owner/*` (monolith split into real routes)

| Route | Contents (from today's tabs) |
|---|---|
| `/owner` | **Command Center** (default): currency selector (one fiat), global date-range control, KPI row with deltas vs previous period, trend charts, alert strip, pending queues with one-tap deep links, top admins, recent activity. Needs `GET /api/owner/command-center` (§7). |
| `/owner/finance/withdrawals` | Withdrawals queue (was Finance §1). **REFINED — split out:** the highest-traffic queue deserves its own URL and queue flow; burying it as section 1 of 11 in a tab is the findability problem. |
| `/owner/finance/commission` | Commission rules + Commission viewer (per-day / rollup) + Settlement. |
| `/owner/finance/ledger` | Ledger (with the `cashOut` flaw disclosed until fixed — §7). |
| `/owner/finance/pnl` | Profit & loss + Revenue breakdowns. **REFINED:** P&L and Revenue are the same job (period money story) with a shared period control; today they have independent presets (`pnlPreset` vs `anPreset`) that can disagree. |
| `/owner/finance/gateway` | PayTeller gateway (health/test) + Payment methods + Wallet config + Currency settings. One "money plumbing" page. |
| `/owner/finance/cashier` | Cashier + reconciliation (expected vs actual + difference, labelled as the house's net position, never "missing money"). |
| `/owner/payouts` | 14-day strip/calendar + per-admin payout cards + Mark paid / Not paid / Reject with confirm + details. **Carry-over, see §10.** |
| `/owner/people/admins` | Add admin, All admins, permissions editor (grouped checkbox matrix, "all / none / clone from…", explicit "null = all sections"), sessions list with kill, hierarchy tree, preview-as. |
| `/owner/people/players` | Global player search. |
| `/owner/games` | Game list, per-game kill/visibility, economics. |
| `/owner/games/rtp` | RTP monitor with target bands. |
| `/owner/games/replays` | Game replays + provably-fair verify. **REFINED — moved from Reports:** a replay is evidence about one round of one game; it belongs with the game, not with the audit log. |
| `/owner/reports` | Audit log (+ filters + export). |
| `/owner/reports/bi` | Revenue breakdowns live under `/owner/finance/pnl`; BI & cohorts here. |
| `/owner/reports/risk` | Fraud console + Anomaly alerts. **REFINED — merged:** same triage job, same evidence shape (severity + reason + player link); today the owner checks two sections for one question, "is anything wrong?" Two tabs, one page. |
| `/owner/engage` | Promotions, Announcements, VIP tiers, Loyalty, Tournaments & jackpots (grouping unchanged). |
| `/owner/settings` | Platform (kill switch, maintenance) in a separated **Danger zone** pattern, KYC/AML, Support oversight, CMS & localisation, Risk rules, Brands. |
| `/owner/settings/brands` | **REFINED — moved out of People:** brands are config records, not people, and today a brand changes no page, game or URL (`page.tsx:O33` comment). See decision D4. |

- **Shell:** desktop sidebar; phone bottom bar (Home · Finance · Payouts ·
  People · More) + drawer. Every page a real URL. Fetch per route
  (Suspense + skeletons); refetch on focus for live numbers.
- **Global search / command palette** (⌘K / long-press search): jump to
  any page, find a player or admin, run safe quick actions.
- **Danger zone pattern** (platform controls): current state badge,
  plain-language effect, typed confirmation + reason, visible audit entry
  after. Applies to: global kill, maintenance, gateway live/demo,
  risk-rule toggles, per-game kill, jackpot pay, cashback pay, birthday
  pay, kill-all-sessions, admin deactivate.
- **No owner index pages that duplicate content:** `/owner/finance` and
  `/owner/reports` redirect to their first child (withdrawals / audit log)
  rather than re-stacking the sections.

## 5. Token set (locked)

Source: `src/app/v48.css:102–124` (locked tokens — carried over verbatim,
not re-chosen). One accent, one radius system, one dark theme.

| Token | Value | Notes |
|---|---|---|
| `--bg` | `#070812` | midnight ground |
| `--felt` | `#0C2B22` | table felt (accents, modals) |
| `--steel` | `#141828` | surface (inputs, pills, tracks) |
| `--steel-2` | `#1C2138` | raised surface |
| `--gold` | `#F2C230` | **the one accent** |
| `--gold-2` | `#FFD964` | light gold (amounts, active text) |
| `--gold-deep` | `#9A7410` | dark gold (borders on gold) |
| `--ink` | `#FFF6D8` | cream ink |
| `--muted` | `#B2B69F` | secondary text |
| `--faint` | `#8A8F7C` | tertiary text — see contrast note |
| `--red` | `#E5322D` | LIVE / danger only |
| `--green` | `#3ED97E` | paid / OK (not a token today — add as `--ok`) |
| `--orange` | `#FFA94D` | held (existing `.wd-held`) — add as `--warn` |
| `--line` | `rgba(255,246,216,.14)` | hairline |
| `--line-gold` | `rgba(242,194,48,.45)` | gold hairline |
| `--r` / `--r-s` | `18px` / `12px` | radii; pills `999px` |
| `--disp` | Anton | display only — page titles, never amounts |
| `--font` | Outfit | everything; **amounts Outfit bold, tabular figures** |
| `--mono` | ui-monospace stack | ids, seeds, hashes, URLs |

**Type scale (new, to lock in `tokens.css`):** page title Anton 20px
uppercase; section `h3` Outfit 800 18px; body 14px/1.5; small/meta 12–13px;
amounts Outfit 800 with `font-variant-numeric: tabular-nums` (**new** —
amounts are Outfit bold today but not tabular, so columns of figures
jitter); labels 11px uppercase letterspaced `.08em` for field labels only
(not for headings — no tracked-out eyebrow above every heading).

**Spacing:** 4 / 8 / 12 / 16 / 20 / 24 / 32. Section gap 20px (flat
system: spacing + hairlines separate, not boxes). Page edge padding
20px (14px ≤480px — already the rule). Bottom clearance 96px owner /
120px admin ≤760px (dock clearance, already the rule).

**Contrast — verified by computation (WCAG 2.2 AA, 4.5:1 normal text):**

| Pair | Ratio | Verdict |
|---|---|---|
| Gold `#F2C230` on midnight | 11.91:1 | Pass |
| Gold-2 `#FFD964` on midnight | 14.59:1 | Pass |
| Ink `#FFF6D8` on midnight | 18.46:1 | Pass |
| Muted `#B2B69F` on midnight | 9.58:1 | Pass |
| Faint `#8A8F7C` on midnight | 5.99:1 | Pass (use only for non-essential meta) |
| Green `#3ED97E` on midnight | 10.86:1 | Pass |
| Red `#E5322D` on midnight | 4.59:1 | **Marginal pass** — use only for large text / fills; error *text* uses `#FF8580` (8.47:1) |
| Dark `#231a02` on gold | 10.27:1 | Pass (active pill text) |
| Muted on steel `#141828` | 8.47:1 | Pass |
| Gold on felt `#0C2B22` | 9.06:1 | Pass |

The brief's worry about gold-on-dark and muted text is unfounded —
both pass AA comfortably. The only watch item is pure red `#E5322D` as
text (4.59:1): keep it for fills/badges with dark text, never for small
body text. Status is never colour-alone: every pill carries an icon
and/or text label (already the pattern in `.wd-status`, `.sev-pill`).

**Motion:** press feedback 100–160ms `ease-out` (`:active` scale .97–.98);
no layout animation on load; `prefers-reduced-motion` respected (kill the
`.ow-strip-dot` pulse and any entrance). **Z-index:** dock 40, header 50,
drawer/sheet 80, dialog 90, toast 100.

## 6. Component list — `src/components/staff-ui/`

One library, used by both panels. Each entry names the current pattern it
replaces (so Phase 1 can delete the old one per route).

| Component | Spec (one line) | Replaces |
|---|---|---|
| `AppShell` | Sidebar (desktop) + top bar + drawer + bottom bar (phone, ≤5 items, permission-filtered) + main with dock clearance + safe-area insets | Per-page header/nav blocks; root Header/Dock on staff routes |
| `Topbar` | Role badge, currency chips, date-range control slot, search trigger (⌘K), preview banner slot | `.ow-strip`, per-page `.rg48-hbar-in` |
| `Breadcrumbs` | Route crumbs, shareable-URL aware | Nothing (new) |
| `PageHeader` | Title (Anton) + subtitle + primary actions + back link | `.rg48-hbar-in` + `.rg48-sub` repeats |
| `Button` | primary / secondary / ghost / danger + loading + disabled; 44px min; `touch-action: manipulation`; `:active` scale; hover gated | `.btn` variants scattered across 6 CSS files |
| `IconButton` | 44px, labelled (`aria-label`), no icon-only ambiguity | Ad-hoc `×` / `←` buttons |
| `Input` / `Select` / `AmountInput` / `DateRange` | 16px font (no iOS zoom), `inputmode` correct, labelled, error state | Per-file input rules in `admin-players.css`, `owner-commission.css` |
| `FormField` | label above input + hint + error, one component | `.pd-adjust-row` label stacks |
| `Segmented` / `Tabs` | URL-driven (`?view=`), `role=tablist`, keyboard-operable | `.ac-tabs`, `.ow-tabs`, `.ow-ptabs`, `.money-chips` (4 tab languages today) |
| `Chip` / `FilterChip` | Removable filter chips with counts | `.money-chips` buttons |
| `Badge` / `StatusPill` | Status with icon + text, never colour-alone; variants paid/pending/rejected/held/high/medium | `.wd-status`, `.sev-pill`, `.kyc-pill`, `.tk-status`, `.ow-game-flag` (5 pill languages today) |
| `Card` | Flat by default (transparent + hairline separator, the owner flat language) | `.admin-sec` boxed card vs owner flat — one language |
| `KpiTile` | Value (Outfit bold, tabular) + label + today/prev sub-line + delta vs previous period + drill-down link | `.sum-card` (not a link today except the 4 Overview tiles) |
| `DataTable` | Server pagination (cursor/page), sortable columns, column visibility, filter bar + removable chips, text search, date-range, saved views (localStorage), row actions menu, bulk select where safe, sticky header, row expand, CSV export respecting filters, skeleton / empty / error states. **≤760px renders as `CardList`** — never a squeezed desktop table. Handles 7-figure amounts, long emails/names without clipping. | Raw `.dep-table` in `.rg48-twrap` on every list |
| `CardList` | Phone fallback for DataTable: primary fields up top, secondary in expandable area | `.wd-list`, `.user-list`, `.ledger-list`, `.fraud-list`, `.kyc-list` (5 hand-rolled list languages) |
| `Dialog` / `ConfirmDialog` | Focus-trapped modal; typed-reason variant; shows amount, currency, target, consequence; success toast links to the audit entry; double-submit disabled | `window.confirm` (2 places only) + inline reject-reason boxes |
| `Sheet` | Mobile bottom sheet (player detail on phone, payout details, KYC doc) | Inline expands (`.wd-reject`, payout Details, replay detail) |
| `Toast` | Text + kind + optional **Undo** + optional link to audit entry | `store.toast` (text-only, no undo) |
| `Skeleton` | Per-section shimmer matching the layout (never a blank page) | Plain `<p>Loading…</p>` (13× in admin) |
| `EmptyState` | One honest line + next action | Inconsistent `<p>` empties |
| `ErrorState` | Names the problem + Retry button | `rg48-err` lines, some silent `[]` fallbacks |
| `Pagination` | Page/cursor controls + per-page + total count | None today |
| `CopyButton` | Copies + "Copied ✓" 1.6s state (already the pattern in Referrals) | Ad-hoc copy code in 3 places |
| `MaskedValue` | Masked by default (`024•••••78`), Reveal control (role-appropriate, audited via §7 endpoint), Copy masked only | Nothing (new) — blocked by decision D1 |
| `Charts` | **Hand-rolled SVG** (zero new dependency): line + bar, labelled axes, tap tooltip, table/list alternative, colour-blind-safe RG palette (gold/green/muted/red-text), max 4–5 series | `.p1b3-bars`, `.b4-chart`, `.ow-fin-bars` (3 hand-rolled div chart languages) |
| `CommandPalette` | ⌘K / long-press search: jump to any page, find player/admin, safe quick actions | Nothing (new) |

**A11y (applies to all of the above):** WCAG 2.2 AA contrast (verified
§5); visible focus (`:focus-visible` gold outline, already the pattern);
keyboard-operable menus/dialogs with focus trap and `aria-*`; labelled
controls; no colour-only status; `prefers-reduced-motion`.

## 7. Backend-gap report (§7) — report, do not silently change

### 7.1 Known gaps (from `docs/OWNER_DASHBOARD_ARCHITECTURE.md` §1.5/§6 + verified here)

| Gap | Evidence | Recommendation |
|---|---|---|
| No CSRF protection | Grep: 0 hits for CSRF in `src/lib`, `src/app/api/auth` | Add CSRF tokens on state-changing routes (Phase 7 hardening). Do not build new money endpoints without it. |
| No rate limiting | Grep: 0 hits for rate limit anywhere | Rate-limit login / register / TOTP first (Phase 7). |
| No security headers | `next.config.*`: no `headers()` block | Add headers (CSP, frame-ancestors, HSTS) in Phase 7. |
| Logout / password change do not bump `sessionVersion` | Architecture doc §1.5; `getSessionUser` rejects stale `sessionVersion` but nothing bumps it on logout/password change | Bump on both (Phase 7, one-line server change + test). |
| TOTP login step needs no proof the password step ran | Architecture doc §1.5 | Bind `POST /api/auth/login/totp` to the password step (Phase 7). |
| TOTP opt-in, no backup codes | Architecture doc §1.5 | Decision D12 in `TODO.md` (enforce or keep opt-in) — Chuks's call, Phase 7. |
| Maintenance mode is client-side only | `savePlatSettings` toggles a flag; no server route checks it (architecture doc §1.5) | Enforce server-side (Phase 7); until then the Danger-zone copy must say maintenance is a display gate, not an enforcement. |
| Ledger is a computed view capped at 200 rows/source, and `cashOut` counts every withdrawal row regardless of status | `src/lib/ledger.ts:206,311–319`; metric doc §9.2 | Fix `cashOut` to count approved only (Phase 6 money hardening); the redesigned Ledger page must disclose the cap until pagination lands. Do not build new totals on `cashOut` until fixed. |
| Unaudited events | Admin creation, referral-code creation, campaign-draft creation, all auth events have no audit rows (architecture doc §1.5, `TODO.md`) | Add audit writes in Phase 7; the redesigned Audit log must not claim coverage it does not have. |
| "Approved" ≠ paid | No `paid`/`processing`/`failed` status on `Withdrawal` (metric doc §3); "paid out" = `status = "approved"` | Decision D2 (below) — the redesign must label the figure "approved payouts" wherever the UI can, until decided. |
| No idempotency outside PayTeller | Metric doc §9.5 | Idempotency keys on new financial endpoints (Phase 6). |
| Float in flight | Money stored `Decimal(12,2)`, summed as JS floats via `dec()` + `round2` (metric doc §9.1) | Audit float sums at settlement boundary (Phase 6). |
| Fraud signal (d) failed-logins NOT built | No login-attempt data exists; pages say so plainly (`fraud/page.tsx`) | Keep the plain-language note in the redesign; do not invent the signal. |
| No global owner live feed | `GET /api/owner/live-feed` requires `adminId` (route.ts:14) | The Command Center's "recent activity" uses `dashboard-stats.activity` (latest 10 merged) — good enough; a global live feed is a new endpoint only if Chuks wants it (not required for Phase 2). |

### 7.2 Additive endpoints the UX truly needs (recommend — do not build yet)

All additive, backward-compatible, guarded by `requireRole` (+
`requirePermission` for admin), documented in `API_CONTRACT.md`, manually
tested. Existing shapes unchanged.

1. **`GET /api/owner/command-center?currency=&from=&to=`** (new) — KPIs +
   deltas vs previous period + alert strip (gateway failing, anomaly,
   fraud spike, withdrawals over threshold, maintenance/kill ON) +
   pending counts (withdrawals, payouts due, KYC, tickets) in ONE call.
   Today the Command Center would need `dashboard-stats` + `withdrawals` +
   `payouts` + `fraud` + `anomalies` + `kyc` + `tickets` — seven calls for
   the first screen. This is the one new endpoint Phase 2 cannot do
   without.
2. **`GET /api/admin/attention`** (new) — pending counts for the admin's
   *permitted* sections only (withdrawals pending, KYC pending, open
   tickets, fraud HIGH). Today `GET /api/admin/overview` returns no
   pending counts at all, so the admin Overview cannot be attention-first
   without N extra calls.
3. **`POST /api/{admin|owner}/reveal`** (new) — returns an unmasked value
   and writes an audit entry. Needed for the mask-by-default UX (§4.7).
   Blocked by decision D1 (masking policy) — do not build before it.
4. **Pagination / sort / filter / search / CSV params on existing list
   endpoints** — withdrawals, deposits, players, ledger, audit log,
   tickets, KYC. Additive query params only (`?page=&limit=&sort=&q=`…);
   existing callers keep today's defaults (`limit` 50/100 as today).
   No response-shape change for callers that do not pass the new params.
5. **`?target=` on the activity/audit endpoints** (additive param) — the
   player-detail Audit tab needs "everything that happened to this
   player". Today `/api/admin/activity` filters by actor only.
6. **No new endpoint needed for charts.** `dashboard-stats` already
   returns `finChart` (4 toggleable series, daily/weekly/monthly
   grouping) and `growthChart` (new + cumulative) — the Charts component
   renders them. Revenue/RTP already exist as endpoints.
7. **Fraud triage state is NOT recommended as a quiet additive change.**
   Fraud alerts are computed live and never stored; adding
   acknowledge/assign/resolve needs a stored alert model (migration +
   Chuks decision). The redesign keeps fraud read-only with severity
   filters until that decision lands.

## 8. Brief-vs-repo conflicts (listed plainly — nothing silently picked)

1. **"39 sections" (§1) — actual 41.** `src/app/owner/page.tsx` has 41
   `<h3>` elements: Overview 6, Manage 6, Finance 11, Payouts 1,
   Reports 7, Engage 5, Settings 5. The brief's table omits two sections
   (the count was taken at an older HEAD). The IA in §4 uses the real 41.
2. **"~55 routes under `/api/admin/`" (§1) — actual 47 route files.**
   Verified by count. Owner is correct at 70.
3. **"MoMo/bank numbers appear in full in … CSV exports" (§2) — wrong
   for CSVs.** `src/lib/reports.ts` has no account-number fields; the
   deposits/players/withdrawals CSVs carry full names, emails and phones
   but no account numbers. Full account numbers appear in exactly one
   live UI surface: Payouts Details (`page.tsx`). The masking work
   (§4.7) therefore starts at Payouts Details + KYC document URLs, not
   at the CSV generator (CSV masking is still needed for contacts).
4. **"Remove `admin-*.css`/`owner-*.css` once nothing references them"
   (§4.1) — understates the dependency.** The classes staff pages
   actually use (`.admin-sec`, `.dep-table`, `.sum-card`, `.sum-cards`)
   live in `globals.css:59–80`, and the tokens live in `v48.css:102–124`.
   Deleting the five staff files alone removes only the overrides; the
   staff system must be migrated route by route into `tokens.css` +
   `staff-ui`, and only then can the legacy files go (Phase 7).
5. **"Two hand-rolled div bar charts" (§1) — actually three patterns:**
   `.p1b3-bars` (horizontal), `.b4-chart` (vertical, admin only),
   `.ow-fin-bars` (stacked series). All three are replaced by one Charts
   component (§6).
6. **"There is no sidebar" (§1) — also no staff layout at all.** There
   is no `src/app/admin/layout.tsx` or `src/app/owner/layout.tsx`; the
   root layout renders the player Header, Dock and AuthModal on staff
   pages (`layout.tsx:93–97`). Phase 1 must decide how the staff shell
   suppresses them (route-group layout + a client check, or accept them
   until Phase 2 — flagged in §11).
7. **Brief §4.5 puts Support oversight under Settings and Replays under
   Reports** — refined in §4.2 (replays → Games, fraud + anomalies →
   one Risk page, brands → Settings). Reasons given in §4.2.
8. **Brief §4.4 says the bottom bar shows "the 4 most-used sections for
   that admin (Overview, Players, Money, Tickets by default)"** — the
   repo has no usage data to rank "most-used" (no analytics store), so
   the default is the named four, permission-filtered; true per-admin
   ranking would need a usage log (not proposed — keep the static
   default).
9. **Brief §7 lists "no security headers" among the gaps — confirmed,**
   and in addition there is no `middleware.ts` at all (verified), so the
   "every new route must add the guard itself" rule (§6.3) is load-bearing
   and must be in the Phase 1 checklist.
10. **Brief §1 says `AdminPlayerDetail.tsx` is 601 lines — confirmed.**
    Brief §1 says `rbac.ts` has 14 sections — confirmed (14 entries in
    `ADMIN_SECTIONS`). Brief §1 says `v48.css` is 2,103 lines — confirmed.

## 9. Decisions needed from Chuks (blocking Phase 1 design only)

**D1. Masking policy (TODO decision 5) — BLOCKS `MaskedValue` + the reveal
endpoint.** Mask MoMo/bank numbers, phones and emails by default with an
audited Reveal control, or keep them in full? Recommended: mask by
default (the brief's §4.7). Until you answer, Phase 1 builds `MaskedValue`
with masking ON as the default and the reveal endpoint unbuilt.

**D2. Reporting timezone (TODO decision 4) — BLOCKS date labels.** Keep
UTC calendar days (`todayStr()`, the current rule) or configure
Africa/Accra? The date-range component, "today" sub-lines and day-strip
labels all depend on this. Recommended: keep UTC (no silent change).

**D3. Light theme (TODO decision 10) — BLOCKS the token set.** Stay
dark-only or build a light theme too? Recommended: dark-only (the RG
brand is dark; the brief allows either).

**D4. Brands — BLOCKS the IA.** Brands are config-only records that
change no page, game or URL. Keep them in the nav under Settings, or
hide them until brands do something? Recommended: keep under Settings,
labelled "Config records — no effect on pages yet", so the work is not
lost.

**D5. Chart approach — BLOCKS the Charts component.** Hand-rolled SVG
(zero new dependency — recommended, keeps the bundle at zero) or a chart
library (if so, which one)?

*Not Phase 1 blockers, recorded here so they are not lost: withdrawal
"paid" semantics (TODO decision 2 — blocks Phase 3 payout statuses);
two-person approval scope (decision 3 — blocks Phase 6/7); approval to
build the two new aggregate endpoints in §7.2 items 1–2 (needed before
Phase 2, not Phase 1); fraud triage state (needs a stored model —
§7.2 item 7).*

## 10. How Prime Phase 1 features + the Payouts tab carry over

**Prime Phase 1 (shipped `9afa464` + fixes `6592dc7`) — carries over
into the Command Center, not re-decided:**

| Shipped feature | Where it lands in the redesign |
|---|---|
| Global date-range selector (10 presets + Custom, page-level state, persists across tabs) | Becomes the Command Center's global range control; now drives the whole home (KPIs, charts, queues), not just the Overview dashboard. Still UTC, still `?from=&to=` on `dashboard-stats` (then on `command-center`). |
| Financial performance chart (4 toggleable series: deposits, approved payouts, commission generated, commission paid; daily ≤31d, weekly ≤92, monthly beyond) | Becomes the Charts component's first use (`finChart` buckets already returned by the endpoint — no new endpoint for charts). Series dots keep their colours (gold / soft red / green / muted). |
| User-growth chart (new + cumulative) | Second Charts use on the Command Center (`growthChart` buckets). |
| KPI drill-down (tiles switch tab + scroll to section) | Tiles become `KpiTile` links to the new routes (Users → `/owner/people/players`, Deposited → `/owner/finance/ledger`, Paid out → `/owner/finance/withdrawals`, Commission → `/owner/payouts`). Deep links replace the scrollIntoView hack. |
| `GET /api/owner/dashboard-stats?currency=&from=&to=` (range + prev-period + finChart + growthChart in one owner-only call) | Kept as the Command Center's data source until `command-center` lands (§7.2 item 1); the new endpoint extends it with alerts + pending counts rather than replacing it. |
| Commission tile = `commissionToday` (not the range figure) + tiles show the today sub-line only (his order — comparison lines removed) | Kept: tiles show label + big number + today sub-line. Deltas vs previous period live on the Command Center KPI row as a separate small line (the comparison his order removed was the tile sub-line; the brief's Command Center asks for deltas — if he wants no deltas at all, say so and they come off). |
| Default range Last 7 days (Today-default left the charts blank) | Kept as the default. |
| Flat styling (transparent cards, hairline separators, 20px edge padding, `.ow-sum` clustered tiles) | Becomes the `Card` + spacing tokens (§5) — the flat language is the design system now, not a one-off pass. |

**Payouts tab — carries over verbatim in behaviour, then gains the
brief's additions in Phase 3:**

- Kept: 14-day strip (gold = owed, green = all paid, filled = selected) +
  date picker; one row per admin owed that day with amount + PAID /
  UNPAID / REJECTED pill; Mark paid / Not paid / Reject; Details expand
  (name, email/phone, referral code, saved account or "No payout account
  saved."); totals from the endpoint (`owed/paid/unpaid/paidCount/
  rejectedCount` — the tab renders no totals row today; the redesign adds
  one); "paid" stays DERIVED (paid = sum of payout rows covering the day;
  REJECTED stays a zero-amount marker row) until decision D2 lands.
- Added in Phase 3: month/week/list views, filter by status, totals per
  currency, bulk actions with confirm, masking on the account in Details
  (D1), ConfirmDialog + required reason on Reject (today Reject posts
  with no reason — §3.4), and a link from each payout row to the audit
  entry after the action.

## 11. Phase 1 proposal — Foundation

**Goal:** one `tokens.css` + one `src/components/staff-ui/` library +
staff layouts for `/admin` and `/owner`, with zero change to the player
site and zero change to any API or money logic.

1. **`tokens.css`** — the locked set from §5 (palette, type scale with
   tabular amounts, spacing, radii, status colours, z-index, motion).
   Imported by the staff layouts only (scoped, not global — the legacy
   global imports stay until Phase 7 so nothing else moves).
2. **`src/components/staff-ui/`** — build in this order (dependency
   order): tokens consumers first (Button, Badge/StatusPill, Input/Select,
   FormField, Card, KpiTile, Skeleton, EmptyState, ErrorState, CopyButton,
   MaskedValue); then layout (AppShell, Topbar, PageHeader, Breadcrumbs,
   Segmented/Tabs, Sheet); then data (DataTable + CardList, Pagination,
   Charts); then safety (Dialog/ConfirmDialog, Toast with undo);
   then CommandPalette last (it depends on the route map).
3. **Staff layouts** — `src/app/(staff)/` route group or
   `src/app/admin/layout.tsx` + `src/app/owner/layout.tsx` with the shell,
   permission-aware nav, preview banner, and staff-only CSS scoping.
   **Open point:** the root layout renders Header/Dock/AuthModal
   unconditionally — Phase 1 must either suppress them on staff routes
   (client check on pathname in the root layout, smallest change) or
   accept them for one more phase. Recommend the pathname check; it is
   a 3-line change with no player-site effect (staff paths only).
4. **Storybook-style demo route (staff-only, owner-guarded)** — e.g.
   `/owner/_ui-demo` behind `requireRole("owner")` (server guard, not
   just hidden link), showing every component in its states, including
   the adversarial fixtures (7-figure amounts, long names, 0 rows,
   10,000-row table, 1-section admin, owner preview). Never public,
   never linked from the player site.
5. **Verification (per §11 report format):** `npm run lint` + `npm run
   build` pass; device matrix 360/390/768/1440 with `scrollWidth <=
   clientWidth` on every view; adversarial fixtures on every component;
   player-site screenshots before/after proving zero visual change
   (staff CSS is scoped — prove it, do not claim it); audit doc updated
   with the component inventory as built.

**Risks / things not touched in Phase 1:** no API changes; no money,
permission or audit logic; no owner-route split (Phase 2); no admin
queue rebuilds (Phase 5); legacy staff CSS still loaded globally until
Phase 7; the player Dock/Header still render on staff routes until the
pathname check lands; MaskedValue's reveal endpoint waits on D1;
fraud triage waits on a stored-model decision (§7.2 item 7).

**Next phase proposal:** Phase 2 — Owner Command Center + routing split
(new route structure, per-route loading, Command Center with KPIs/charts/
alerts/queues, global search), gated on decisions D1–D5 and approval of
the `command-center` endpoint (§7.2 item 1).
