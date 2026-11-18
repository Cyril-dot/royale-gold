# Royale Gold — API Contract

For the UI agent: every endpoint, its request/response JSON, and the rules
the server enforces. The server is the source of truth for balances —
**never trust client-side balances**; always render what the API returns.

Base: same origin. Auth: `rg_session` httpOnly cookie, set by login/register.
All responses are JSON. Errors: `{ "error": "<message>" }` with HTTP status
(400 validation, 401 not signed in, 403 wrong role, 404 not found,
409 already done).

Money: cash amounts are GH₵ numbers rounded to 2dp. Coins are integers.
`cash` = real cash wallet, `sim` = separate SIM/demo balance,
`coins` = play-only coins (never withdrawable, never convertible).

---

## Auth

### POST /api/auth/register
```json
// request
{ "name": "Kwame Mensah", "emailOrPhone": "kwame@example.com", "password": "secret123", "refCode": "RG-DEMO1" }
// refCode is OPTIONAL. If present it MUST be a real active code (400 otherwise).
// emailOrPhone: contains "@" -> email, else phone.
// response 201
{ "user": { "id": "...", "name": "Kwame Mensah", "email": "kwame@example.com", "phone": null,
  "role": "user", "cash": 250, "coins": 15, "sim": 1000, "xp": 0, "level": 1,
  "commissionPct": null, "active": true, "referredByAdminId": "<adminId>",
  "referralCodeUsed": "RG-DEMO1", "createdAt": "..." },
  "referredBonusCoins": 5 }
```
New accounts start with **10 coins** (+1000 SIM, GH₵250 cash). A valid
referral code adds exactly **5** (total 15) and records a Redemption.
One code per user ever — enforced again by `POST /api/account/redeem`.

### POST /api/auth/login
```json
// request
{ "emailOrPhone": "owner@royale.gold", "password": "owner123" }
// response 200 — same { user } shape as register (no referredBonusCoins)
{ "user": { "...": "..." } }
```
Phone login: first active account with that phone. A phone shared by
several accounts resolves to nobody — those users sign in by email.

### POST /api/auth/logout
```json
// response 200
{ "ok": true }
```

### GET /api/auth/me
```json
// response 200 (401 when signed out)
{ "user": { "...": "..." } }
```

### PATCH /api/auth/me
```json
// request — name and/or emailOrPhone (one contact only: an email, lowercased
// and unique, or a phone; switching type clears the other field)
{ "name": "New Name", "emailOrPhone": "new@example.com" }
// response 200 — { "user": { "...": "..." } }
// errors: empty name/contact 400; bad email/phone 400; email taken 409
```

### POST /api/auth/change-password
```json
// request — current password is verified first; new password >= 6 chars
{ "currentPassword": "oldpass", "newPassword": "newpass123" }
// response 200 — { "ok": true }
// errors: wrong current password 403; new password too short/same 400
```

---

## Wallet

### GET /api/wallet
```json
{ "cash": 350, "coins": 15, "sim": 1000 }
```

### POST /api/wallet/deposit — demo cashier (cash only, coins never involved)
```json
// request — amount > 0; method: "MTN" | "Telecel" | "AirtelTigo" | "card"
{ "amount": 100, "method": "MTN" }
// response 201
{ "cash": 350, "coins": 15, "sim": 1000,
  "deposit": { "id": "...", "amount": 100, "method": "MTN",
    "pctInForce": 10, "commission": 10, "createdAt": "..." } }
```
If the user was referred, the referring admin's **current** `commissionPct`
is frozen as `pctInForce` and `commission = amount × pct / 100` (2dp) is
stored on the deposit event. Later % changes never rewrite it.
When the owner has set a fixed deposit amount for the fiat
(`POST /api/owner/fixed-deposit`), deposits of any other amount are
rejected (400: "Deposits are fixed at GH₵X for now"); the same check
runs in `POST /api/wallet/payteller/create` (never at credit time —
money already paid must never be rejected).

---

## Games

### Per-game max multipliers (enforced by POST /api/games/settle)

| Game (slug) | Currency | Max × | Basis (v48 artifact) |
| --- | --- | --- | --- |
| aviator-gold | cash | 50 | Crash engine, display cap ×50 |
| jet-fly | cash | 50 | Crash engine, display cap ×50 |
| car-crash | cash | 50 | Crash engine, display cap ×50 |
| rocket-shooter | cash | 50 | Crash engine, display cap ×50 |
| penalty-shoot-out | cash | 12.5 | 5-shot ladder top rung ×12.5 |
| mines | cash | 5000 | Top prize ×5,000 |
| plinko | cash | 29 | 8 rows / 9 bins, edge ×29 |
| coin-flip | cash | 2 | Pays ×2 |
| dice-roll | cash | 5 | Exactly 7 pays ×5 |
| lucky-wheel | cash | 4 | Top prize ×4 |
| hi-lo | cash | 50 | Chain ×1.9 a card; v1 ceiling ×50 |
| rock-paper-scissors | cash | 2 | Win the throw ×2 |
| limbo | cash | 19.4 | Target × 0.97, max target 20 |
| red-or-black | cash | 8 | Chain doubles to ×8 |
| war | cash | 2 | Higher card ×2 |
| pick-a-box | cash | 1.8 | Find the gold ×1.8 |
| mini-roulette | cash | 36 | European wheel: red/black ×2, green zero ×36 |
| texas-poker-room | cash | 20 | Best hand wins; v1 ceiling ×20 |
| spin-da-bottle | cash | 2 | v1 ceiling ×2 |
| blackjack-vip | cash | 2.5 | Blackjack 3:2 |
| royale-roulette | cash | 36 | Straight-up ×36 |
| fruit-ninja | coins | 10 | v1 ceiling ×10 |
| candy-crush | coins | 3 | ≥500 pts ×1, ≥1000 ×2, ≥1500 ×3 (v48 export) |
| tetris | coins | 3 | ≥800 pts ×1, ≥1500 ×2, ≥2500 ×3, max ×3 (v48 export) |
| whack-a-mole | coins | 2 | Multiplier = points / 110, capped ×2 (v48 export) |
| memory-match | coins | 2 | Clear in ≤5 · ×2 |
| scratch-card | coins | 10 | Decide-first: ×10 2%, ×5 6%, ×2 22.5%, blank 69.5% (v48 export) |
| keno | coins | 6.5 | Pick 3 of 1–10, draw 5; 2 matches ×1, 3 matches ×6.5 (v48 export) |
| trivia | coins | 5 | Entry 5; 7→10, 9→15, 10→25 coins (max ×5) |
| snake | coins | 8 | Entry 5; 100+→10, 200+→20, 300+→40 coins |
| 2048 | coins | 10 | Entry 5; 256→10, 512→20, 1024→50 coins |

"v1 ceiling" = the artifact gives no hard cap; the server caps there so a
client bug can never mint money. Trivia / Snake / 2048 pay **flat coin
amounts** per the table — settle them with those exact payouts.

### POST /api/games/settle
```json
// request — currency MUST match the game's currency (400 otherwise)
{ "game": "penalty-shoot-out", "currency": "cash", "stake": 10, "payout": 15.6,
  "result": { "shots": 5 }, "roundId": "<crash roundId, optional>" }
// validation: stake > 0; payout >= 0; payout <= stake × maxMultiplier;
// insufficient balance -> 400. Coin stakes/payouts must be whole coins.
// Crash games: when roundId is supplied it must be a real issued round
// (aviator-gold / jet-fly / car-crash only) and payout / stake must never
// exceed that round's server crash point (400 otherwise).
// response 200
{ "game": "penalty-shoot-out", "currency": "cash", "stake": 10, "payout": 15.6,
  "cash": 355.6, "coins": 15, "sim": 1000, "xp": 2, "level": 1,
  "gameResultId": "..." }
```
Settles in one transaction: debit stake, credit payout, record a
`GameResult`, +2 XP. A loss is `payout: 0`.

Play-gated games (currently: `royale-roulette`) are REJECTED here — they
settle only through `POST /api/games/play`, where the server draws the
outcome. Settling one here would let a client skip the draw and invent
a win.

### GET /api/games/economy
```json
// response 200 — the signed-in user's SIM-vs-LIVE economy snapshot
{ "userId": "...", "lifetimeDeposited": 500, "liveFactor": 0.75,
  "liveFactorFloor": 0.5, "simBoost": 2, "simWinProbCap": 0.9,
  "decayPerStep": 0.05, "decayStepGhs": 100 }
// liveFactor = max(0.5, 1 - 0.05 * floor(lifetimeDeposited / 100)).
// SIM win probability is natural x 2 (capped at 0.9). Coin games: factor 1.
```

### POST /api/games/play
```json
// request — server-decided play for play-gated games (v1: royale-roulette
// only). The server draws the outcome with the economy factor applied and,
// in REAL mode, settles atomically in the same request (every draw costs
// the stake — no fishing for wins). The client animates to the returned
// pocket and displays the returned payout; it never decides anything.
// SIM mode draws only (no money moves); a SIM outcome can never settle
// for real cash. Crash games are never here (provably-fair HMAC point).
{ "game": "royale-roulette", "currency": "cash", "stake": 10,
  "mode": "REAL", "choice": { "betKind": "straight", "pick": 7 } }
// response 200 (REAL — includes new balances; SIM — no balances)
{ "game": "royale-roulette", "currency": "cash", "stake": 10, "payout": 0,
  "pocket": 23, "won": false, "mult": 0, "factor": 0.75, "mode": "REAL",
  "lifetimeDeposited": 500, "cash": 340, "coins": 15, "sim": 1000,
  "xp": 2, "level": 1, "gameResultId": "..." }
```

### POST /api/games/crash/round
```json
// response 201 — the server seed and crash point are NEVER returned
{ "roundId": "...", "hash": "<sha256(serverSeed)>", "clientSeed": "royale-gold-v48",
  "nonce": 587372, "startsAt": 1794435359996 }
```
Crash point (server, HMAC-SHA256, exactly as v48):
`hmac = HMAC-SHA256(serverSeed, clientSeed + ":" + nonce)`;
`h = first 13 hex chars as a 52-bit int`; `h % 33 == 0 → 1.00x`;
else `floor((100·2^52 − h) / (2^52 − h)) / 100`, capped at 1,000,000.
Cash-out goes through `POST /api/games/settle` with the multiplier the
player stopped at (settle cap ×50), passing `roundId` so the server
re-checks the multiplier against the stored crash point. The client
animates the same curve (`exp(0.00006 × ms since startsAt)`) and polls
the reveal endpoint below — it never draws its own crash point.
Rounds live in server memory (v1).

### GET /api/games/crash/reveal?roundId=...
```json
// response 200 — FINISHED rounds only (curve has reached the point)
// { "roundId": "...", "serverSeed": "<64 hex>", "clientSeed": "royale-gold-v48",
//   "nonce": 587372, "crashPoint": 2.41, "hash": "<sha256(serverSeed)>" }
// live round: 403 { "error": "Round is still live — ..." }
// unknown round: 404. Missing roundId: 400.
// Optional ?waitMs=<n> (max 25000) long-polls: holds until the round
// finishes or the wait elapses, then returns the reveal — or 200
// { "finished": false } if still live. The crash clients long-poll so a
// flying round costs a couple of 200s instead of a 403 every poll.
// Verify: SHA-256(serverSeed) must equal the hash issued with the round,
// and the crash-point formula above must reproduce crashPoint.
```

### GET /api/games/trivia/questions
```json
// response 200 — answers are NEVER included
{ "roundToken": "...",
  "questions": [ { "id": "...", "question": "...",
    "options": ["A", "B", "C", "D"], "category": "Ghana Sports" } ] } // exactly 10
```

### POST /api/games/trivia/grade
```json
// request — answers in question order; token is single-use (30 min expiry)
{ "roundToken": "...", "answers": [2, 0, 1, 3, 2, 0, 1, 1, 0, 2] }
// response 200 — entry 5 coins debited + payout credited in one transaction
{ "correct": 7, "total": 10, "payoutCoins": 10, "cash": 355.6, "coins": 20,
  "breakdown": [ { "question": 1, "correct": true }, "..." ] }
```
Payout rule: 7→10, 9→15, 10→25 coins; fewer than 7 → 0.

### GET /api/games/stats
```json
{ "stats": [ { "game": "keno", "played": 1, "wins": 1, "losses": 0,
  "streak": 1, "best": 5 } ] }
// best = best single-round profit (payout − stake) in that game's currency
```

### GET /api/games/history?limit=50
```json
{ "history": [ { "id": "...", "game": "keno", "currency": "coins",
  "stake": 5, "payout": 10, "result": {}, "createdAt": "..." } ] }
```

---

## Referrals

### GET /api/referral/validate?code=RG-DEMO1 (public)
```json
{ "valid": true, "code": "RG-DEMO1", "adminName": "Royale Admin", "commissionPct": 10 }
// invalid/inactive:
{ "valid": false, "code": "RG-FAKE" }
```
`commissionPct` is the owning admin's current % (null if none on file);
the deposit modal shows it, or hides the commission sentence when null.

### POST /api/account/redeem
```json
// request
{ "code": "RG-M86X" }
// response 200 — exactly 5 coins; 409 if this user already redeemed any code
{ "coins": 15, "redeemedCode": "RG-M86X", "bonusCoins": 5 }
```

### GET /api/admin/codes (admin)
```json
{ "codes": [ { "id": "...", "code": "RG-DEMO1", "active": true,
  "shareLink": "/register?ref=RG-DEMO1", "createdAt": "..." } ] }
```

### POST /api/admin/codes (admin)
```json
// request — code optional; omit for auto RG-XXXX; custom must match RG-[A-Z0-9]{4,12}
{ "code": "RG-GOLD1" }
// response 201 — same shape as one entry of GET, plus shareLink
{ "id": "...", "code": "RG-GOLD1", "active": true, "shareLink": "/register?ref=RG-GOLD1", "createdAt": "..." }
```

---

## Admin (role: admin)

### GET /api/admin/attention?currency=GHS (admin, Phase 5 — brief §7 list)
Attention-first counts for the admin Overview — one call instead of
four. Counts are the calling admin's own downline only (or, for the
owner preview, the previewed admin's downline filtered by THAT
admin's permissions: sections the admin cannot access are omitted).
Withdrawals are counted in one fiat (`?currency=`, default the
admin's currency). Fraud counts come from the same live computation
as the Fraud page (`computeFraudAlerts`) — never recomputed, never
stored.
```json
{ "withdrawals": { "pending": 2, "held": 1, "awaitingOwner": 0, "actionable": 3 },
  "kycPending": 1,
  "tickets": { "open": 2, "answered": 1, "needingAttention": 2 },
  "fraud": { "high": 1, "medium": 0 } }
// withdrawals.actionable = pending + held (the rows an admin can
// decide right now); tickets.needingAttention = open + answered
// (answered still needs a follow-up or a close)
```
401 logged out; 403 as a non-admin (or an admin without the section
permission for every section — an empty object).

### GET /api/admin/overview
```json
{ "admin": { "id": "...", "name": "Royale Admin", "email": "admin@royale.gold",
    "commissionPct": 10, "active": true },
  "codes": [ { "id": "...", "code": "RG-DEMO1", "active": true, "createdAt": "..." } ],
  "referredUsers": [ { "id": "...", "name": "Test User", "email": "test@royale.gold",
    "phone": null, "referralCodeUsed": "RG-DEMO1", "createdAt": "..." } ],
  "coinsGiven": 5, "redemptions": 1,
  "commission": { "today": 10, "yesterday": 0, "last7d": 10, "last30d": 10, "allTime": 10 },
  "history": [ { "date": "2026-11-11", "deposits": 1, "totalAmount": 100, "totalCommission": 10 } ] }
```

### GET /api/admin/commission?date=2026-11-11 (default: today)
```json
{ "date": "2026-11-11",
  "deposits": [ { "id": "...", "userId": "...", "userName": "Test User",
    "userContact": "test@royale.gold", "amount": 100, "method": "MTN",
    "pctInForce": 10, "commission": 10, "time": "..." } ],
  "totals": { "deposits": 1, "totalAmount": 100, "totalCommission": 10 } }
```

### GET /api/admin/commission/history
```json
{ "days": [ { "date": "2026-11-11", "deposits": 1, "totalAmount": 100, "totalCommission": 10 } ] }
// every active day, newest first
```

### GET /api/admin/users/:id (admin: only users they referred; owner: anyone)
```json
{ "user": { "id": "...", "name": "Test User", "email": "test@royale.gold", "phone": null,
    "role": "user", "cash": 355.6, "coins": 20, "joinedAt": "...",
    "referralCodeUsed": "RG-DEMO1",
    "referringAdmin": { "id": "...", "name": "Royale Admin", "email": "admin@royale.gold" } },
  "deposits": [ { "id": "...", "amount": 100, "method": "MTN", "pctInForce": 10,
    "commission": 10, "createdAt": "..." } ],
  "totals": { "deposits": 1, "totalDeposited": 100, "totalCommission": 10, "coinsGiven": 5 } }
```

---

## Owner (role: owner)

### GET /api/owner/admins
```json
{ "admins": [ { "id": "...", "name": "Royale Admin", "email": "admin@royale.gold",
  "role": "admin", "cash": 250, "coins": 10, "sim": 1000, "xp": 0, "level": 1,
  "commissionPct": 10, "active": true, "referredByAdminId": null,
  "referralCodeUsed": null, "createdAt": "...",
  "codes": [ { "id": "...", "code": "RG-DEMO1", "active": true } ],
  "referralCount": 1, "coinsGiven": 5, "commissionAllTime": 10 } ] }
```

### POST /api/owner/admins
```json
// request — commissionPct 0–100 (may be omitted/null)
{ "name": "New Admin", "email": "admin2@royale.gold", "password": "admin123", "commissionPct": 15 }
// response 201
{ "admin": { "...user shape...": "..." } }
```

### PATCH /api/owner/admins/:id
```json
// request — either field optional
{ "commissionPct": 20, "active": false }
// response 200
{ "admin": { "...user shape...": "..." } }
// NOTE: changing commissionPct affects FUTURE deposits only (frozen pctInForce).
```

### GET /api/owner/admins/:id/preview
Same payload as `GET /api/admin/overview`, for that admin.

### GET /api/owner/commission?adminId=&date=2026-11-11
With `adminId`: that admin's day detail (same shape as admin day detail
plus `"admin": { "id", "name" }`). Without `adminId`: all admins that day:
```json
{ "date": "2026-11-11",
  "admins": [ { "admin": { "id": "...", "name": "Royale Admin" },
    "deposits": [ "...same deposit rows..." ],
    "totalAmount": 100, "totalCommission": 10 } ],
  "totals": { "deposits": 1, "totalAmount": 100, "totalCommission": 10 } }
```

### GET /api/owner/rollup
```json
{ "days": [ { "date": "2026-11-11", "adminId": "...", "adminName": "Royale Admin",
    "deposits": 1, "totalAmount": 100, "totalCommission": 10 } ],
  "totals": { "deposits": 1, "totalAmount": 100, "totalCommission": 10 } }
```

### GET /api/owner/command-center?currency=GHS&from=2026-11-11&to=2026-11-17 (owner, Phase 2)
Everything `GET /api/owner/dashboard-stats` returns for the same range
(KPIs + deltas vs previous period + finChart + growthChart + activity +
deposits7d + topAdmins — computed by calling that handler in-process,
never recomputed here) PLUS the alert strip and pending counts:
```json
{ "...dashboard-stats fields...",
  "alerts": [ { "id": "gateway-no-keys", "severity": "high",
    "label": "PayTeller has no keys — Ghana MoMo cannot take live payments.",
    "href": "/owner/finance/gateway" } ],
  "pending": { "withdrawalsPending": 0, "withdrawalsAwaitingOwner": 0,
    "withdrawalsOverThreshold": 0, "payoutsDueAdmins": 0,
    "payoutsDueAmount": 0, "kycPending": 0, "ticketsOpen": 0,
    "fraudHigh": 0, "fraudMedium": 0, "anomaliesHigh": 0,
    "anomaliesMedium": 0 } }
```
`from`/`to` default to the last 7 days, same as dashboard-stats.
`payoutsDueAmount` is today's unpaid commission (recomputed, never
stored); withdrawals-over-threshold uses the per-fiat
`withdrawalOwnerThreshold` from the currency config.
`ggrRange`/`ggrPrev` are cash GGR (stakes − payouts, GameResult) from
the P&L handler; `activePlayersRange`/`activePlayersPrev` are distinct
players with a deposit or a game round in the period (that fiat).

### POST /api/owner/reveal (owner, Phase 3 — brief §7.2 item 3)
Returns ONE unmasked value and writes an audit entry (`data.reveal`,
actor = the owner, target = the id passed, detail names the kind —
never the value itself). Kinds are whitelisted; gateway secrets are
never revealable (the gateway API only ever returns last-4). Phase 5
reuses this route for the admin side by adding an admin-guarded kind.
```json
// request
{ "kind": "withdrawal-account" | "user-contact" | "payout-account" | "admin-withdrawal-account" | "admin-user-contact", "id": "<id>" }
// admin-withdrawal-account (id = withdrawal id; admin only):
// the payout account snapshot saved on the withdrawal. Guarded by
// requireRole("admin") + the "money" permission, and the withdrawal
// must belong to the admin's own downline (withdrawal.adminId ===
// admin.id). Same 503 when the withdrawal-account columns do not
// exist in the database yet.
// admin-user-contact (id = user id; admin only): that player's email
// + phone. Guarded by requireRole("admin") + at least one
// player-facing section permission (players / money / fraud /
// tickets / kyc), and the player must be in the admin's downline
// scope. 404 when the player is out of scope.
// Preview never reveals: the owner previewing an admin's panel
// reads through the owner kinds only; admin kinds 403 for the owner.
// Owner kinds are unchanged (owner role only).
{ "ok": true, "kind": "admin-withdrawal-account", "id": "...",
  "value": { "accountType": "momo", "accountName": "Kwame Mensah", "accountDetail": "0244123456" } }
{ "ok": true, "kind": "admin-user-contact", "id": "...",
  "value": { "name": "Kwame Mensah", "email": "k@example.com", "phone": "0244123456" } }
```
// withdrawal-account (id = withdrawal id): the payout account snapshot
// saved on the withdrawal. 503 (not 500) when the withdrawal-account
// columns do not exist in the database yet (rg-withdrawal-account.sql
// unrun) — the owner list deliberately never selects those columns.
{ "ok": true, "kind": "withdrawal-account", "id": "...",
  "value": { "accountType": "momo", "accountName": "Kwame Mensah", "accountDetail": "0244123456" } }
// user-contact (id = user id): that player's email + phone.
{ "ok": true, "kind": "user-contact", "id": "...",
  "value": { "name": "Kwame Mensah", "email": "k@example.com", "phone": "0244123456" } }
// payout-account (id = admin id): the admin's saved payout account +
// contact, one call for the whole Payouts Details view.
{ "ok": true, "kind": "payout-account", "id": "...",
  "value": { "adminName": "Royale Admin", "email": "a@example.com", "phone": "0244123456",
    "account": { "type": "momo", "bankName": null, "accountNumber": null,
      "network": "MTN", "phoneNumber": "0244123456", "accountName": "Royale Admin" } } }
```
404 when the withdrawal / user / admin does not exist (or the user is
not an admin for `payout-account`); 400 for an unknown kind or a
missing id.

### GET /api/owner/payouts?day=YYYY-MM-DD&currency=GHS (owner, Phase 3)
As before (`day`, `people`, 14-day `days` strip, `totals`) PLUS:
- `calendar: { "from", "to", "days": [ { "date", "owed", "paid",
  "people", "allPaid", "hasOwed" } ] }` — one summary per day in the
  requested window. `?from=&to=` set the window (max 62 days, default
  the current month); `days` (the 14-day strip) is unchanged.
- `?adminId=` adds `history` — that admin's latest 30 CommissionPayout
  rows in this fiat (newest first): `{ "id", "amount", "method",
  "reference", "periodFrom", "periodTo", "createdAt" }`.

### POST /api/owner/payouts (owner, Phase 3)
As before (`{ day, adminId, action, currency }`) PLUS an optional
`reason` (max 200 chars) on the `rejected` action — recorded in the
`commission.payout-rejected` audit detail. Paid stays DERIVED (sum of
payout rows covering the day; PAID when paid ≥ owed) and REJECTED stays
a zero-amount marker row — no status column (see the route header).

### POST /api/owner/fixed-deposit (owner, Nov 2026 — fixed deposit amount)
Sets (or clears) ONE fixed deposit amount per fiat. When set, every
deposit in that fiat must be exactly that amount — enforced server-side
in the demo cashier + PayTeller create, and the DepositModal locks to
it. Null/empty = OFF (any amount ≥ min deposit). Audit-logged
(`deposit.fixed_amount`). The value is stored in its own `FixedDeposit`
table (not a CurrencyConfig column) so a prod database without the
table degrades to OFF instead of 500ing every currency-config read —
run `rg-fixed-deposit.sql` in Neon before setting one live.
```json
// request — amount: null (or omitted) = clear = OFF
{ "currency": "GHS", "amount": 50 }
// response 200
{ "currency": "GHS", "fixedDepositAmount": 50 }
// clear — response 200
{ "currency": "GHS", "fixedDepositAmount": null }
```
400 for a bad currency code or an amount ≤ 0 / not 2dp. 503 when the
`FixedDeposit` table does not exist yet (run `rg-fixed-deposit.sql`).
`GET /api/owner/currency-config` now carries `fixedDepositAmount:
number | null` per currency, and `GET /api/games/config` carries it
too (the DepositModal reads it there).

### GET /api/owner/analytics?from=2026-11-01&to=2026-11-30&currency=GHS (owner, Nov 2026)
Income vs losses + when income rises, per fiat, UTC days (range
defaults to this month through today, max 92 days). Per-game figures
reuse `revenueBreakdown` — the same figures the BI page shows.
```json
{ "from": "2026-11-01", "to": "2026-11-30", "fiatCurrency": "GHS",
  "totals": { "deposits": 66200, "depositsCount": 12, "paidOut": 0,
    "paidOutCount": 0, "gamePayouts": 0, "ggrCash": 0, "netPosition": 66200 },
  "daily": [ { "date": "2026-11-01", "deposits": 500, "depositsCount": 2,
    "payoutsOut": 120, "net": 380, "ggr": 40 } ],
  "hourly": [ { "hour": 0, "deposits": 0, "count": 0 } ],
  "bestDay": { "date": "2026-11-17", "deposits": 12000 },
  "trend": { "depositsPct": 12.5, "payoutsPct": null, "direction": "rising" },
  "byGameCash": [ { "game": "penalty", "name": "Penalty Shoot Out",
    "rounds": 10, "stakes": 500, "payouts": 300, "ggr": 200 } ],
  "byGameCoins": [ { "game": "mines", "name": "Mines",
    "rounds": 4, "stakes": 40, "payouts": 25, "ggr": 15 } ] }
```
`paidOut` = approved withdrawals only (status `approved`, day = the
request's createdAt UTC day — approval ≠ payment, no money moves on
a decision). `payoutsOut` = `paidOut` + cash game payouts.
`netPosition` = deposits − payouts out — cash flow, NEVER labelled
profit. `ggrCash` = cash stakes − cash payouts. `depositsPct` is the %
change vs the previous period of the same length (null when the
previous period had no deposits and this one does — "new").

---

## Rewards

### GET /api/rewards
```json
{ "simClaimedToday": true, "coinsClaimedToday": true, "streakDay": 1,
  "xp": 22, "level": 1,
  "achievements": [ { "key": "first-win", "name": "First Win", "target": 1,
    "progress": 1, "unlocked": true },
    { "key": "streak-3", "name": "3-Win Streak", "target": 3, "progress": 1, "unlocked": false },
    { "key": "games-10", "name": "10 Games Played", "target": 10, "progress": 1, "unlocked": false },
    { "key": "first-cashout", "name": "First Cash-Out", "target": 1, "progress": 1, "unlocked": true } ] }
```
Level = 1 + floor(xp / 100). XP: +2 per settled game, +10 per daily claim.
Achievements unlock automatically when their threshold is met.

### POST /api/rewards/claim
```json
// request — type "sim" or "coins"; once per day EACH (409 on repeat)
{ "type": "sim" }
// response 201 — sim: +100 SIM credits; coins: +5 coins; +10 XP
{ "type": "sim", "streakDay": 1, "claimedBothToday": false,
  "cash": 260, "coins": 15, "sim": 1100, "xp": 22, "level": 1 }
```
`streakDay` counts consecutive claim days; claiming the second type on the
same day keeps the streak (does not increment it).
