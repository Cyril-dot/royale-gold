# TODO — Prime Owner Command Center (Royale Gold)

> Discovery-only baseline. Repo `Cyril-dot/royale-gold`, branch `main`, HEAD `34b8948`
> (Owner Overview fill), mapped 17 Nov 2026. Nothing here is implemented yet.
> Status tags: `[x]` proven in the repo · `[~]` PARTIAL — exists in part, work remains ·
> `[ ]` MISSING — not built. Counts: **16 exists / 39 partial / 25 missing** (80 items).
> Evidence and definitions: `docs/OWNER_DASHBOARD_ARCHITECTURE.md`,
> `docs/FINANCIAL_METRIC_DEFINITIONS.md`, `docs/MOBILE_QA_CHECKLIST.md`.
>
> Standing rules that govern every phase: real data only (no invented figures);
> money in `Decimal(12,2)` at rest, `round2` float in flight (see the money-safety
> note in the architecture doc — hardening is Phase 6); UTC calendar days
> (`todayStr()`, `src/lib/money.ts`); per-fiat aggregates, never summed across
> fiats; RG dark/gold flat design, no explanation paragraphs; owner-only
> endpoints via `requireRole("owner")`; every financial action audit-logged.

## Discovery
- [x] Inspect frontend architecture. — Next.js 16 App Router; owner panel is one
  3,292-line page (`src/app/owner/page.tsx`), 7 pill tabs, 39 sections, flat RG
  dark/gold; admin panel is multi-route (14 routes). No sidebar, no chart lib.
- [x] Inspect backend architecture. — 70 owner routes, all `requireRole("owner")`;
  lib services in `src/lib/` (money, commission, ledger, revenue, payteller,
  gateway-settings, withdrawals, fraud, anomalies, risk-rules, reports, bi, rtp).
- [x] Inspect database schema. — 47 models, Postgres `Decimal(12,2)` vs sqlite
  `Float` dev stand-in (`prisma/schema.prisma` vs `prisma/schema.sqlite.prisma`).
- [x] Inspect authentication and roles. — 3 roles (owner/admin/user), JWT
  `rg_session` 7d, `requireRole` exact-match, per-section admin RBAC
  (`src/lib/rbac.ts`), TOTP opt-in, never enforced.
- [x] Inspect payment integrations. — PayTeller GH/GHS hosted checkout + signed
  webhook (no keys live; toggle still Demo); demo cashier only otherwise.
  No payout sending, no settlement feed, no FX, no cron.
- [x] Document existing financial source of truth. — `docs/FINANCIAL_METRIC_DEFINITIONS.md`.
  DepositEvent (deposits + frozen commission) · Withdrawal (requests only) ·
  CommissionPayout (paid) · GameResult (GGR/RTP) · User balances (current state) ·
  BalanceAdjustment (manual/bonus/promo) · AuditLog (append-only by convention) ·
  ledger is a computed view, not a table.

## Architecture
- [~] Define metric calculations. — Defined in `docs/FINANCIAL_METRIC_DEFINITIONS.md`
  from the real tables; several brief metrics have no current implementation
  (DAU/WAU/MAU, failed deposits, processing payouts) and need new queries.
- [~] Define event-date/timezone rules. — UTC day exists (`todayStr()`); no
  configurable reporting timezone; "paid out" day = request `createdAt` day,
  not approval day (see metric doc — Chuks to confirm).
- [x] Define owner permissions. — `requireRole("owner")` on all 70 owner routes;
  owner bypasses admin section RBAC; no `middleware.ts` (new routes must add
  the guard explicitly).
- [~] Define payout state transitions. — Withdrawals: `pending → approved |
  admin_approved → approved | rejected` (+ untyped `held`); NO `paid` /
  `processing` / `failed` status. Commission payouts: no status column,
  paid is derived (`paid >= owed`). Needs a Chuks decision before building §7.
- [~] Define commission state transitions. — Earned (recomputed) → payable →
  paid (`CommissionPayout` row) → reversed (tab delete + audit only).
  No `disputed` state, no batches.
- [x] Define audit event schema. — `AuditLog{actorId, action, targetId?,
  detail?, createdAt}`; action vocabulary in `prisma/schema.prisma:365-390`.
  Gaps: admin creation, referral-code creation, campaign-draft creation,
  auth events are NOT audited.

## Owner overview
- [~] Executive KPI cards. — 7 stats live (users total/today, deposited
  total/today, paid out total/today, commission today) + activity + 7-day
  chart + top admins. Missing: DAU/WAU/MAU, verified/suspended counts,
  deposit/payout status breakdowns, commission lifetime/paid/outstanding,
  revenue-in-period, liabilities, period comparison, sparklines, drill-down.
- [ ] Date filters. — No global date-range selector. Only P&L and Revenue/RTP
  have independent today/week/month/custom presets; Settlement/Ledger/Audit
  have independent From/To inputs. No shared state, no sync.
- [ ] Period comparisons. — Nothing compares against a previous equivalent
  period anywhere in the owner panel.
- [~] Financial charts. — One hand-rolled bar pattern (`.p1b3-bars`): 7-day
  deposits + daily GGR. No toggleable series, no daily/weekly/monthly
  grouping, no tooltips with counts.
- [ ] User growth charts. — No registrations/cumulative/active-users chart.
  (BI cohorts table exists under Reports — backward-looking only.)
- [~] Operations queue. — No unified attention queue. Pieces exist: Withdrawals
  `(N pending)` badge, Fraud console, Anomaly alerts — separate sections.
- [~] Recent activity. — Overview feed (latest 10, merged deposits/withdrawals/
  signups/commission) + admin live-feed polling every 15s. No filters, no
  gateway/admin-action events, no severity.

## Finance
- [~] Financial center. — Cashier (per-method holdings + reconciliation),
  Ledger (merged view), P&L, Revenue breakdowns exist as Finance/Reports
  sections. No dedicated financial-center page, no cash-flow view.
- [ ] Cash flow. — No cash-flow chart or daily ledger summary with opening/
  closing balances (ledger is a computed view; no balance-history table).
- [x] Revenue definitions. — GGR (cash) = cash stakes − cash payouts
  (`GameResult`); GGR (coins) shown apart; P&L net profit = GGR − commissions
  owed. Deposits/withdrawals are cash flow, not profit. See metric doc.
- [~] Outstanding liabilities. — Commission outstanding = owed − paid
  (recomputed, `settlementForAdmin`). Payout liabilities: approved
  withdrawals are NOT debited and have no paid state — liability definition
  needs the §7 status decision. No liabilities dashboard.
- [ ] Daily financial reports. — No daily performance table and no daily
  report drill-down (§6 of the brief). Parts exist (Revenue "By day",
  Commission per-day, Payouts day view).
- [~] Reconciliation. — Cashier reconciliation exists (expected cash on hand
  vs actual wallet balances, difference = house net position, "not an error").
  No provider-settlement comparison, no discrepancy workflow, no drill-down.

## Payouts
- [~] Payout overview. — Payouts tab API returns `totals{owed,paid,unpaid,
  paidCount,rejectedCount}` but the tab renders no totals row. Withdrawals
  section has status filters + pending count.
- [~] Payout list. — Withdrawals queue (global, filter by status/currency) +
  Payouts day list (commission, per admin). No server-side pagination, no
  export, no bulk actions; no fees/net-payable/due-date columns.
- [~] Search and filters. — Player search, Ledger search, Games search exist
  (scoped). Payouts have day + status only; no search by payout ID/reference,
  no amount/method filters, no sorting.
- [~] Approval. — Maker-checker EXISTS for withdrawals: admin approves; large
  amounts (> GHS 500 / NGN 50,000) go `admin_approved` until the owner
  second-approves. Reject always needs a reason. Bypass: owner can approve a
  `pending` withdrawal directly with no prior admin approval.
- [ ] Processing. — No `processing` status and no "mark as processing" step
  anywhere (withdrawals or commission payouts).
- [~] Payment confirmation. — Commission only: Payouts tab "Mark paid" records
  a `CommissionPayout` (method defaults `cash`, no reference required).
  Player withdrawals have NO paid confirmation — `approved` is terminal and
  no money moves; actual MoMo/bank payment is off-platform and unrecorded.
- [~] Unpaid/defer workflow. — Payouts "Not paid" deletes that day's tab-created
  rows (audit-logged, refuses if paid via Settlement). No reason, no next
  expected date, no deferred-vs-rejected distinction for withdrawals.
- [x] Rejection. — Withdrawal reject needs a reason (`decidedBy/decidedAt/
  reason` recorded + audit). Commission-payout reject = zero-amount marker
  row (`method:"rejected"`, audit-logged).
- [ ] Failure handling. — No `failed` status, no failure reason/provider
  response storage, no retry eligibility (PayTeller payment failures exist
  as `PaytellerPayment.status`, but nothing surfaces them to the owner).
- [~] Beneficiary detail. — Payouts Details inline expand: name, email/phone,
  referral code, saved MoMo/bank account. GAP: account numbers shown IN FULL
  (no masking anywhere); no access logging; no status-history timeline;
  no full-screen mobile view.
- [~] Payout calendar. — 14-day pill strip + date picker + per-day list with
  gold/green status colours. No month/week/list views, no per-day summary
  cards, no due-date vs confirmed-date distinction.
- [~] Payout history. — Audit log + Commission per-day/rollup + ledger cover
  history in fragments. No single per-beneficiary payout timeline.

## Commissions
- [~] Commission overview. — Commission viewer (Per-day / All-admins rollup),
  Settlement tiles (Owed/Paid/Balance/Parent shares), Payouts tab.
  No lifetime/period/pending-settlement KPI cards, no beneficiary count.
- [~] Beneficiary breakdown. — Per-admin tables exist (rollup, settlement).
  No beneficiary-level totals page, no per-beneficiary drill-down.
- [~] Commission ledger. — Settlement recomputes owed from the ledger;
  paid = sum of `CommissionPayout` rows. No stored per-entry ledger rows;
  no source-transaction/rule/rate/gross-basis columns in any table.
- [x] Settlement workflow. — `GET/POST /api/owner/commission/settlement`:
  owed/paid/balance per admin per period; POST records a `CommissionPayout`
  (+ ledger + audit). Parent share is a reporting line only, never deducted.
- [ ] Dispute/reversal workflow. — No `disputed` state, no reversal record
  (only the Payouts-tab delete + audit). No batches, no settlement references
  beyond a free-text field.

## Users and activity
- [~] User intelligence. — Player search, BI cohorts (join-month, retention
  m1/m2/m3), admin Players list + segments (`src/lib/segments.ts`: new/active/
  dormant/high-roller/at-risk). Missing owner-side: DAU/WAU/MAU, verified/
  unverified breakdown, active/inactive definitions, never-deposited list.
- [~] User financial profile. — Admin player detail exists (deposits, payouts,
  notes/tags/limits/KYC). Owner reaches it via Player search links.
  No owner-side profile page.
- [~] Transaction investigation. — Ledger (search/type/date filters) + Game
  replays (provably-fair verify) + admin Lookup (round verify). No unified
  transaction search by reference/ID across types.
- [~] Live activity. — Admin live-feed polls every 15s (no WebSocket/SSE);
  owner has only a per-admin preview (`GET /api/owner/live-feed?adminId=`).
  No global owner feed, no filters, no reconnect states.
- [~] Alerts and risk review. — Fraud console (4 signals; failed-logins NOT
  built — no login-attempt data), Anomaly alerts (rule-based, no ML),
  Risk rules (flag/block_player/hold_withdrawal). No alert workflow
  (assignee, open/investigating/resolved, resolution notes).

## Integrations and reporting
- [~] Gateway monitoring. — PayTeller gateway section (Demo/PayTeller toggle,
  Test connection via `GET /api/v1/auth`, masked keys, webhook URL) +
  Payment methods. No health dashboard: no success rate, error trends,
  last-success, avg processing time, payout counts, provider comparison.
  Test is a single auth check, not transaction evidence.
- [ ] Reconciliation imports/integrations. — No settlement import of any kind:
  no route, no table, no file parsing. PayTeller reconciliation is per-payment
  `providerPayload`/fee fields only. BLOCKED: PayTeller keys not live;
  no settlement file format known.
- [x] CSV export. — `src/lib/reports.ts`: deposits/players/withdrawals,
  JSON preview (first 10) + CSV download, owner + admin, per-fiat, date range.
- [ ] Excel export. — No `.xlsx` anywhere in the repo (grep: 0 hits).
- [ ] PDF export. — No PDF anywhere in the repo (grep: 0 hits).
- [ ] Scheduled reports if supported. — NOT SUPPORTED: no cron infra, no
  `vercel.json`, no email delivery. Cashback + birthday bonuses are manual
  owner buttons for the same reason.

## Security
- [x] Owner-only endpoints. — All 70 files under `src/app/api/owner/` guard
  with `requireRole("owner")` (verified by grep; no unguarded handler).
- [x] Role-based permissions. — 3 roles; `requireRole` exact-match (owner
  implies nothing); admin per-section RBAC, 16 sections (`src/lib/rbac.ts`);
  owner bypasses. No `middleware.ts` — new routes must add the guard.
- [~] Sensitive data masking. — Gateway secrets masked (last-4 only) and
  AES-256-GCM encrypted at rest. GAP: MoMo/bank account numbers and phones
  are stored and shown IN FULL (owner Payouts, withdrawal snapshots, CSV).
- [ ] Sensitive access audit. — No audit rows for viewing sensitive account
  details (no access log exists). AuditLog covers actions, not reads.
- [~] Idempotent financial actions. — PayTeller ONLY: unique `reference`
  (idempotency key) + atomic claim + webhook-event PK dedup. No idempotency
  keys on demo deposits, conversions, adjustments, settlements, or payouts.
- [~] Two-person approval where configured. — EXISTS for large withdrawals
  only (admin → owner, threshold-gated). Not a general policy: no toggle,
  no scope beyond withdrawals, owner single-approval bypass exists,
  commission/jackpot/adjustment/gateway actions are single-actor.
- [x] Audit history. — `AuditLog` append-only by convention (GET-only viewer,
  no DELETE/PATCH endpoint). 53 files write inline `prisma.auditLog.create`.
  Gaps: admin creation, referral-code creation, campaign-draft creation,
  all auth events (login/logout/register/password change).

## Mobile
- [~] Mobile home. — Overview renders at 390px with flat tiles + activity +
  chart + top admins, but the brief's priority order (alerts first, today's
  deposits/payouts, unpaid, commissions, new users, revenue, chart, activity,
  quick actions) is NOT the layout; no mobile-specific home.
- [~] Bottom navigation. — Site dock exists (≤760px, Home/Games/Play/Promos/
  Winners) — NOT the brief's owner nav (Home/Finance/Payouts/Activity/More).
  Owner panel has no bottom nav of its own.
- [~] Mobile financial cards. — `sum-card` tiles + 44px targets + 16px inputs
  exist; tiles are not links; no mobile-specific card layout.
- [~] Mobile payout list. — Payouts tab works at 390px (day strip scrolls,
  per-person cards). No status-filter chips beyond the day strip.
- [~] Mobile payout detail. — Details is an inline expand in-flow, not a
  full-screen view or bottom sheet; account numbers shown in full.
- [ ] Mobile calendar. — No calendar of any kind (see Payout calendar).
- [~] Mobile charts. — `.p1b3-bars` fits width with labels + values (not
  colour-alone). No touch tooltips, no table/list alternative.
- [~] Mobile user profile. — Admin player detail exists; owner reaches it via
  links. No mobile-first profile layout.
- [~] Mobile reports. — CSV downloads work from the admin Reports page; no
  mobile report UI in the owner panel.
- [ ] Mobile notifications. — In-app `Notification` rows exist (admin → players
  only); no owner notification center, no push (no subscription endpoint,
  `sw.js` is static-assets-only), no notification types for payouts/alerts.

## QA and delivery
- [ ] Unit tests. — NO test suite exists in the repo (no `*.test.*`, no test
  script in `package.json`). Nothing to run; tests must be written with the
  financial code (follow-up prompt 3).
- [ ] Integration tests. — None exist.
- [ ] Authorization tests. — None exist (manual verification only so far).
- [ ] Financial calculation tests. — None exist. Priority: commission recompute,
  GGR/P&L, reconciliation, ledger cashOut (known pending-withdrawal flaw).
- [ ] Responsive viewport tests. — None automated. Manual Playwright rigs exist
  in prior rounds (390/768/1280). See `docs/MOBILE_QA_CHECKLIST.md` for the
  §25 matrix (360–1920).
- [ ] End-to-end tests. — None exist.
- [ ] Production build. — Not run in this discovery (read-only task). Prior
  rounds: `tsc` + `next build` pass on HEAD.
- [ ] Preview verified. — Not in scope for discovery. Live site is
  `https://royale-omega.vercel.app/` (owner deploys from GitHub himself).
- [ ] Documentation updated. — This file + the three docs in `docs/` are the
  discovery deliverable. Implementation must keep them current.
- [ ] Final report delivered. — Pending implementation.

## Decisions only Chuks can make (blockers — see architecture doc §7)
1. Countries/currencies beyond GH + NG, and the Nigeria gateway.
2. Withdrawal "paid" semantics: add a `PAID`/`PROCESSING`/`FAILED` status
   (migration) or keep `approved` as terminal with off-platform payment.
3. Two-person approval: on/off, scope (withdrawals only vs commission/
   jackpot/adjustments), and whether the owner single-approve bypass closes.
4. Reporting timezone: keep UTC or configure Africa/Accra.
5. MoMo/bank masking: mask by default in UI/CSV (recommended) or keep full.
6. PayTeller live keys + webhook registration (his step; blocks §12/§15).
7. AI assistant: provider + budget, or explicitly out of scope.
8. Forecasting: in or out (brief marks it optional).
9. Excel/PDF: library choice (no new paid infra without his say-so).
10. Light theme: build it or stay dark-only (brief allows either).
11. Push notifications: build the infra or stay in-app only.
12. 2FA enforcement for owner/admins: enforce or keep opt-in.
