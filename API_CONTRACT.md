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
| mini-roulette | cash | 36 | Green zero ×36 |
| texas-poker-room | cash | 20 | Best hand wins; v1 ceiling ×20 |
| spin-da-bottle | cash | 2 | v1 ceiling ×2 |
| blackjack-vip | cash | 2.5 | Blackjack 3:2 |
| royale-roulette | cash | 36 | Straight-up ×36 |
| fruit-ninja | coins | 10 | v1 ceiling ×10 |
| candy-crush | coins | 10 | v1 ceiling ×10 |
| tetris | coins | 10 | v1 ceiling ×10 |
| whack-a-mole | coins | 2 | Golden moles up to ×2 |
| memory-match | coins | 2 | Clear in ≤5 · ×2 |
| scratch-card | coins | 10 | Match 3 · up to ×10 |
| keno | coins | 6.5 | Match 3 · ×6.5 |
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
// response 200
{ "game": "penalty-shoot-out", "currency": "cash", "stake": 10, "payout": 15.6,
  "cash": 355.6, "coins": 15, "sim": 1000, "xp": 2, "level": 1,
  "gameResultId": "..." }
```
Settles in one transaction: debit stake, credit payout, record a
`GameResult`, +2 XP. A loss is `payout: 0`.

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
player stopped at (settle cap ×50). Rounds live in server memory (v1).

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
{ "valid": true, "code": "RG-DEMO1", "adminName": "Royale Admin" }
// invalid/inactive:
{ "valid": false, "code": "RG-FAKE" }
```

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
