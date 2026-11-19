# Financial Metric Definitions — Royale Gold

> Every definition below names its source table(s) and its status.
> **Implemented** = an endpoint computes it today (file cited).
> **To build** = the brief asks for it and no endpoint computes it yet.
> **Blocked** = it cannot be computed correctly until a decision or a
> missing input is resolved (named in the caveat).
>
> Global rules (apply to every metric): **UTC calendar day**
> (`todayStr()`, `src/lib/money.ts:19-29` — `toISOString().slice(0,10)`,
> day bounds `[dateT00:00:00Z, +24h)`); **per-fiat only** — filter or group
> by `fiatCurrency`, never sum across fiats; money stored `Decimal(12,2)`
> (Postgres) but summed as JS floats via `dec()` + `round2`
> (`src/lib/money.ts:5-17`) — see the money-safety caveat at the end.

## 1. Users

| Metric | Definition | Source | Status |
|---|---|---|---|
| Total registered users | `COUNT(User WHERE role = "user" AND currency = <fiat>)` | `User` (`prisma/schema.prisma:22`) | Implemented — `GET /api/owner/dashboard-stats` (`src/app/api/owner/dashboard-stats/route.ts:27`) |
| New users (today / period) | Same count with `createdAt` in the UTC day / range | `User.createdAt` | Implemented for today; period version **to build** (no range param on the endpoint) |
| Active users (DAU / WAU / MAU) | **Definition to adopt:** a user is active on a day if they have ≥1 `GameResult` OR ≥1 `DepositEvent` that UTC day. DAU = distinct users active today; WAU = distinct active in the last 7 UTC days; MAU = last 30 UTC days. | `GameResult.createdAt`, `DepositEvent.createdAt` | **To build** — no endpoint computes DAU/WAU/MAU today. BI cohorts (`src/lib/bi.ts`) use "played in last 30d" for a month cohort, not DAU/WAU/MAU |
| Verified / unverified users | **Blocked:** there is no user-level `verified` flag. Closest proxy: `KycSubmission.status = "approved"` for that user (`prisma/schema.prisma:710`). Do NOT present KYC approval as identity verification — KYC here is informational only and never blocks deposits/play. | `KycSubmission` | **To build** (proxy only, with the label caveat) |
| Suspended users | `COUNT(User WHERE role = "user" AND (active = false OR blockedAt IS NOT NULL))` | `User.active`, `User.blockedAt` | **To build** (fields exist; no count endpoint) |
| Users who never deposited | Users with zero `DepositEvent` rows | `User` anti-join `DepositEvent` | **To build** |
| Users with pending payouts | Users with ≥1 `Withdrawal` in `pending` / `admin_approved` / `held` | `Withdrawal.status` | **To build** |

## 2. Deposits

| Metric | Definition | Source | Status |
|---|---|---|---|
| Lifetime successful deposits (amount + count) | `SUM(DepositEvent.amount)`, `COUNT(*)` where `fiatCurrency = <fiat>`. **Every `DepositEvent` row is a successful deposit** — the demo cashier credits synchronously and PayTeller rows are written only after verified success. | `DepositEvent` (`prisma/schema.prisma:177`) | Implemented — `dashboard-stats` (total + today); `reports/deposits` for the list |
| Deposits in period / today | Same sums with `createdAt` in the range / UTC day | `DepositEvent.createdAt` | Implemented for today; period version **to build** |
| Pending deposits | **No such records exist.** Demo cashier deposits never pend; PayTeller rows in `PaytellerPayment.status = pending\|processing` are *payments in flight*, not deposits — count them separately as "gateway payments in flight" if needed, never as deposits. | `PaytellerPayment.status` | **To build** (as a gateway metric, §7) |
| Failed deposits | **No deposit-failure records exist.** Failed gateway payments are `PaytellerPayment.status = failed\|expired`. Demo cashier has no failure path. | `PaytellerPayment.status` | **To build** (gateway metric only) |
| Reversed / refunded deposits | **Do not exist.** No `Refund`/`Reversal` model; no deposit-refund flow. The only reversal in the tree is the Payouts-tab commission reversal (delete + audit). A refund flow is new work + a Chuks decision. | — | **Blocked** (missing flow) |

## 3. Payouts (player withdrawals)

> Terminology warning: the brief's "payout" means two different things in
> this codebase. **Player cash-out = `Withdrawal`** (request only).
> **Admin commission payment = `CommissionPayout`**. Keep them apart in
> every label and total.

| Metric | Definition | Source | Status |
|---|---|---|---|
| Total payout requests (count + amount) | `COUNT` / `SUM(Withdrawal.amount)` per fiat, any status | `Withdrawal` (`prisma/schema.prisma:278`) | Implemented — Withdrawals queue (`GET /api/owner/withdrawals`) |
| Paid out (amount + count) — **the definition** | `SUM(Withdrawal.amount)` where `status IN ("approved", "rejected")`. **There is NO `paid` status in the code.** `approved`/`rejected` are the terminal states — the amount leaves the balance on the decision, approve or reject (Nov 2026 reject-debit rule; see decide-route headers). Day = the request's `createdAt` UTC day, **not** the decision day (same rule as the P&L). | `Withdrawal.status`, `Withdrawal.createdAt` | Implemented — `dashboard-stats` (`paidOutTotal`/`paidOutToday`), P&L (`approved` withdrawals) |
| Paid out — **the gap** | Because approval ≠ payment, "paid out" overstates reality whenever an approved request has not actually been sent off-platform. The honest fix is a `PAID` status (+ `PROCESSING`/`FAILED`) recorded with a payment reference — a migration + a Chuks decision (TODO decision 2). Until then, label the figure "payouts out", not "paid", wherever the UI can. | — | **Blocked** (decision 2) |
| Awaiting review | `status = "pending"` (count + amount) | `Withdrawal` | Implemented (queue filter) |
| Approved awaiting payment | **Cannot be distinguished today** — `approved` conflates "approved, not yet sent" with "approved and sent". Needs the `PAID` status (decision 2). | — | **Blocked** (decision 2) |
| Processing / failed payouts | No such statuses exist. | — | **Missing** (needs decision 2) |
| Unpaid / overdue payouts | **Definition to adopt:** `status IN ("pending","admin_approved","held")` AND `createdAt` older than the due window. There is no due date on a withdrawal — "overdue" needs a policy (e.g. > 48h unapproved) decided by Chuks; until then report "unpaid" as the open-status sum with age shown, never as "overdue". | `Withdrawal` | **To build** (open-status sum exists in the queue; ageing + due policy missing) |
| Rejected payouts | `status = "rejected"` (reason mandatory, `decidedBy`/`decidedAt` recorded) | `Withdrawal` | Implemented |
| Payout fees / deductions / net payable | **Do not exist.** Withdrawals carry no fee fields; the requested amount is the amount. Do not invent a fee column — if fees are introduced, they need a schema field + a decision. | — | **Missing** (no fee model) |

## 4. Commission

| Metric | Definition | Source | Status |
|---|---|---|---|
| Commission generated (per day / period / lifetime) | Recomputed from the ledger, never stored. For admin A on day D: rule in force that day (`CommissionRule` with latest `effectiveFrom ≤ D`, admin's own else global default) — `revshare`: rate% × max(0, stakes − payouts) that day; `turnover`: rate% × total stakes that day. **No rule that day → legacy fallback:** the stamped `DepositEvent.commission` (flat % of deposit, `User.commissionPct`). | `CommissionRule`, `GameResult`, `DepositEvent` — `src/lib/commission.ts:135-217` (`ruleForDay`, `dayCommissions`) | Implemented — `GET /api/owner/commission?date=`, `GET /api/owner/rollup`, `totalCommissionOwed` |
| Commission paid | `SUM(CommissionPayout.amount)` per admin / period / fiat. A payout row is the owner recording a payment (amount + method + reference). | `CommissionPayout` (`prisma/schema.prisma:410`) | Implemented — `commissionPaid`, `GET /api/owner/commission/settlement` |
| Commission outstanding | `owed − paid` per admin (owed recomputed, paid summed). Never stored; never negative-clamped silently (settlement shows the balance). | `src/lib/commission.ts:418-421` (`settlementForAdmin`) | Implemented |
| Commission pending approval / settlement | **No such state exists.** There is no approval step for commission settlement and no `pending` status on `CommissionPayout` (the model has no status column — "paid" is derived: `paid ≥ owed`). A pending-settlement queue is new work. | — | **To build** (needs a status model decision) |
| Commission beneficiaries | Count of admins with `owed > 0` in the period (from the recompute, not from payout rows). | Recompute | **To build** |
| Parent share | `CommissionRule.parentSharePct` — a **reporting line only**: parent's share = day commission × pct/100, never deducted from the child's payout (`src/lib/commission.ts:52-56`). Show it as a separate line on the settlement; never subtract it from the child's balance. | `CommissionRule.parentSharePct` | Implemented (reporting only) |
| **Known caveat** | A rule created mid-day after deposits were stamped makes the per-day tab and the rollup disagree for that day (`src/lib/revenue.ts:14-16`). A rule with `effectiveFrom` = today applies retroactively to all of today. Do not "fix" by editing history — past days stay frozen by design. | `src/lib/commission.ts:135` | Documented in code |

## 5. Revenue, liabilities, cash

| Metric | Definition | Source | Status |
|---|---|---|---|
| GGR (cash) | Cash stakes − cash payouts, from `GameResult` where `currency = "cash"`, per fiat. | `GameResult` — `src/lib/revenue.ts:7-8,117` | Implemented — P&L, Revenue breakdowns |
| GGR (coins) | Coin stakes − coin payouts. **Shown apart, never added to cash GGR.** Coins are play-only and never withdrawable. | `GameResult` (`currency = "coins"`) | Implemented (apart) |
| Actual platform revenue | **There is no single "revenue" row.** The defensible figure is the P&L one: **net profit = GGR (cash) − commissions owed** (`src/app/api/owner/pnl/route.ts:66-77`). Deposits and withdrawals are cash flow and are shown as separate lines, never subtracted into profit. **Never label deposits − payouts as profit** (brief §4.2). | `GameResult` + recomputed commission | Implemented (as P&L net profit) |
| Outstanding payout liabilities | Open withdrawal requests (`pending`/`admin_approved`/`held`) at face amount — money the platform has been asked to send and has not approved away. Approved-but-unsent requests are indistinguishable from sent ones until decision 2 lands; disclose that in the label. | `Withdrawal` | **To build** (queue has the rows; no liabilities total) |
| Outstanding commission liabilities | Commission outstanding (owed − paid) — see §4. | Recompute + `CommissionPayout` | Implemented (settlement balance) |
| User-held balances (liability) | `SUM(User.cashBalance)` per fiat — cash the platform holds for players. Coins are excluded (play-only, no cash value). SIM balances are excluded (demo money). | `User.cashBalance` | **To build** (cashier uses the sum for reconciliation; no liabilities view) |
| Net cash movement | **Definition to adopt:** deposits (in) − decided withdrawals (out) − commission paid (out) for the period, per fiat, from the ledger tables. Label the components; do not present it as profit or as available cash. | `DepositEvent`, `Withdrawal`, `CommissionPayout` | **To build** |
| Provider / bank balances | **Do not infer from DB totals.** No provider balance is retrieved from any integration. The cashier states this plainly ("the platform's own ledger figures, not a gateway provider's balance"). A real provider balance needs an integration + a labelled last-updated time. | — | **Blocked** (no integration) |
| Fees / provider charges | Per-payment only: `PaytellerPayment.merchantNet / platformCommission / customerTotal / customerFee` (10% merchant charge absorbed by the house; wallet credited the full principal). No aggregate fees view exists. | `PaytellerPayment` | **To build** (aggregate view) |
| Refunds / reversals | Do not exist as a flow (see §2). | — | **Blocked** |

## 6. Reconciliation

| Metric | Definition | Source | Status |
|---|---|---|---|
| Expected cash on hand | Total deposits − total decided withdrawals − total commission paid (per fiat). | `DepositEvent`, `Withdrawal`, `CommissionPayout` — `GET /api/owner/cashier` | Implemented |
| Actual wallet balances | `SUM(User.cashBalance)` (per fiat). | `User` | Implemented |
| Reconciliation difference | Expected − actual. **This is the house's net position, not an error** — game winnings come from the house, so the two differ by design (live prod, 17 Nov 2026: −GH₵11,852.86). Never present it as missing money without investigation. | Cashier route | Implemented (single number; no drill-down, no discrepancy workflow) |
| Gateway reconciliation | **Not built.** No settlement feed import; per-payment `providerPayload`/fee fields only. Comparing internal records with provider confirmations needs decision 6 (PayTeller keys + settlement format). | `PaytellerPayment.providerPayload` | **Blocked** |

## 7. Gateway (PayTeller — Ghana MoMo only, GHS only)

| Metric | Definition | Source | Status |
|---|---|---|---|
| Gateway mode | `GatewaySettings.ghMomoGateway`: `demo` (default) or `payteller`. Keys AES-256-GCM encrypted; missing encryption env → save fails 503, never plaintext. | `GatewaySettings` | Implemented |
| Deposit success / failure | `PaytellerPayment.status`: `pending \| processing \| successful \| failed \| expired`. Counts/values per status are computable but no owner view aggregates them. | `PaytellerPayment` | **To build** (aggregate view) |
| Payout sending via gateway | **Does not exist.** No disbursement API is called; `CommissionPayout` rows record manual/off-platform payments only. | — | **Missing** (provider capability + decision) |
| Webhook health | Dedup by `PaytellerWebhookEvent.eventId` (PK); re-verify by GET before credit; 503 when the secret is unset so PayTeller keeps retrying. No owner-visible webhook log. | `PaytellerWebhookEvent` | Implemented (no UI) |

## 8. Activity, risk, audit

| Metric | Definition | Source | Status |
|---|---|---|---|
| Recent activity | Latest 10 merged events (deposits, withdrawals, signups, commission payouts), newest first, per fiat — `GET /api/owner/dashboard-stats`. Live feed polls every 15s (no WebSocket/SSE). | Merged query in `dashboard-stats` | Implemented (partial — no filters, no gateway/admin events) |
| Fraud signals | (a) open withdrawal with 2+ risk flags → HIGH; (b) 3+ withdrawals in 24h → HIGH; (c) deposited ≥1,000 (fiat-scaled) in 24h with 0 rounds → MEDIUM; (e) withdrawal within 1h of a deposit (7d window) → MEDIUM. **(d) failed-logins is NOT built — no login-attempt data exists.** | `src/lib/fraud.ts:45` | Implemented (computed live, no stored rows) |
| Anomalies | Rule-based, no ML: win rate >80% (20+ rounds/7d); stakes 5×+ vs prior 7d (min 100, fiat-scaled); game RTP 10+ pts above base (50+ rounds/7d); deposited ≥1,000 in 24h AND withdrew within 1h. | `src/lib/anomalies.ts:47` | Implemented (computed live) |
| Audit events | Append-only rows: `actorId, action, targetId?, detail?, createdAt`. Action vocabulary in `prisma/schema.prisma:365-390`. | `AuditLog` | Implemented (with gaps: admin/code/campaign creation, auth events) |

## 9. Money-safety caveats (read before building on these numbers)
1. **Float in flight.** Storage is `Decimal(12,2)`; every read converts to a JS
   number (`dec()`) and every sum runs in float with `round2` after each step.
   Totals are recomputed approximations. Phase 6 work: audit the float sums,
   consider integer minor units or Decimal arithmetic at the settlement
   boundary, and define one canonical rounding point.
2. **Ledger `cashOut` (fixed).** `src/lib/ledger.ts` counts a withdrawal row
   as `−amount` only when decided (`approved`/`rejected` — the debit lands
   on the decision); pending/admin_approved/held count 0 (fixed Phase 6 +
   Nov 2026 reject-debit rule). Analytics payouts-out matches it exactly.
3. **Commission is recomputed in several places, not stored once.** The
   per-day tab, the rollup, the settlement, and the dashboard each recompute;
   the mid-day-rule caveat (§4) makes them disagree for one day. Any new
   commission total must reuse `src/lib/commission.ts`, never re-derive it.
4. **"Approved" ≠ paid.** See §3. Every new payout figure must state which
   status it counts, and the UI must never imply an approved request has been
   sent.
5. **No idempotency outside PayTeller.** Retried demo deposits, conversions,
   adjustments, and settlements are new writes. New financial endpoints must
   take an idempotency key (Phase 6).
6. **Coins have no cash value.** Never add coin GGR, coin balances, or coin
   stakes to any cash total. Conversion is one-way cash→coins
   (`ConversionEvent`, GH₵5 = 1 coin GHS / ₦500 = 1 coin NGN).
