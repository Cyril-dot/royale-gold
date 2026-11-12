# Royale Gold — Full-Stack Scaffold

Next.js 16 (App Router) + TypeScript + Tailwind CSS 4. Postgres via Prisma 7.
Accounts, referrals (5 coins), admin/owner commission, cash/coin game split,
rewards, trivia — with all money logic server-side in transactions.

> **Status:** full-stack — backend + the real v48 UI ported (no stubs).
> Accounts, referrals, commission, cash/coin games, rewards, trivia.
> No pushes, no deploys from here; the coordinator merges and pushes.

## Quick start (local)

```bash
cp .env.example .env        # then fill in DATABASE_URL + JWT_SECRET
npm install
npm run db:generate         # generate Prisma Client
npm run db:push             # create tables (no migrations yet — see below)
npm run db:seed             # owner + demo admin + 45 trivia questions
npm run dev                 # http://localhost:3000
```

Prisma CLI commands need the env vars exported (Prisma 7's config loader
does not auto-read `.env` for `prisma.config.ts`):

```bash
set -a; source .env; set +a
npm run db:generate && npm run db:push && npm run db:seed
```

Demo accounts (seeded): owner `owner@royale.gold` / `owner123`,
admin `admin@royale.gold` / `admin123` (10% commission, code `RG-DEMO1`).

## Environment variables

| Var | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string. **Only** way the app reaches the DB. |
| `JWT_SECRET` | HS256 secret for the session cookie. Generate: `openssl rand -base64 32` |

No other secrets exist. Never commit `.env`.

## Database

- `prisma/schema.prisma` — Postgres, the source of truth.
- Prisma 7: the connection URL lives in `prisma.config.ts`
  (`datasource.url`) for migrate/push, and the runtime client connects via
  the `pg` driver adapter in `src/lib/prisma.ts`. The schema itself carries
  no URL.
- `npm run db:push` syncs the schema (good for early dev). Once the schema
  stabilises, switch to `prisma migrate dev` / `prisma migrate deploy`.
- Money: `Decimal(12,2)`, rounded to pesewas in code before storage.
  Coins are integers and are **never** convertible to cash — no endpoint
  converts them.
- Commission is computed **at deposit time** and stored on `DepositEvent`
  (`pctInForce`, `commission`) — changing an admin's % later never rewrites
  past days.
- Crash rounds and trivia round tokens live in **memory** (see
  `src/lib/crash.ts`, `src/lib/trivia.ts`). A server restart loses open
  rounds; the 5-coin trivia entry is only debited at grading, so no coins
  are lost. Persist rounds in the DB before a multi-instance deploy.

### Local database (this VM has no Postgres, no Docker)

`apt-get install postgresql` fails here (no package available after
`apt-get update`; the `apt-get update` run was killed by a VM restart),
so local verification used a **clearly-labelled dev-only SQLite stand-in**:

- `prisma/schema.sqlite.prisma` — generated from the Postgres schema by
  `scripts/make-sqlite-schema.mjs` (provider sqlite, `Decimal` → `Float`,
  `Role` enum → `String`). Regenerate it after any schema change.
- `src/lib/prisma.ts` picks the `better-sqlite3` adapter when
  `DATABASE_URL` starts with `file:`.
- Local verify flow:
  ```bash
  export DATABASE_URL="file:./dev.db" JWT_SECRET="dev-only-placeholder-secret-change-me"
  node scripts/make-sqlite-schema.mjs
  npx prisma generate --schema prisma/schema.sqlite.prisma
  npx prisma db push --schema prisma/schema.sqlite.prisma
  npx tsx prisma/seed.ts
  npm run dev   # then exercise the API (see API_CONTRACT.md)
  ```
- **Before committing / handing over, regenerate the Postgres client:**
  ```bash
  npx prisma generate   # from prisma/schema.prisma
  npm run build
  ```
  The SQLite client must never ship: it rejects the Postgres adapter at
  runtime and the schema differs (`Float` vs `Decimal`).
- The Postgres schema-engine binary could not be downloaded by Node's
  fetch through the egress proxy (`ECONNRESET`); it was fetched with
  `curl` from `binaries.prisma.sh` into
  `node_modules/@prisma/engines/schema-engine-debian-openssl-3.0.x`.
  `node_modules` is gitignored, so a fresh checkout needs
  `npm install` (+ the engine download, which may need the same curl
  workaround on this VM).

## Auth

- `bcryptjs` password hashing, JWT (`jose`, HS256) in an httpOnly cookie
  `rg_session` (7 days, `SameSite=Lax`, `Secure` in production).
- `src/lib/auth.ts`: `getSession()`, `getSessionUser()`, `requireAuth()`,
  `requireRole(...)`. Owner does **not** imply admin — pass roles explicitly.

## API

Every endpoint is documented with request/response shapes in
[`API_CONTRACT.md`](./API_CONTRACT.md) — the UI agent builds against that
file. Highlights:

- `POST /api/auth/register` — validates referral codes server-side; valid
  code = 15 starting coins (10 + 5), one redemption per user ever.
- `POST /api/wallet/deposit` — demo cashier; credits cash, records a
  `DepositEvent` with frozen commission.
- `POST /api/games/settle` — the only balance mover for games; validates
  currency match, stake > 0, payout ≤ stake × per-game max multiplier.
- `POST /api/games/crash/round` — provably-fair crash point, HMAC-SHA256,
  exactly as the v48 artifact (verified byte-identical on test seeds).
  `GET /api/games/crash/reveal?roundId=` returns the server seed, nonce
  and crash point for a FINISHED round only (live rounds get 403), so the
  hash issued at round start can be checked; the client animates the
  shared curve and polls the reveal — it never draws its own point.
  Cash-outs pass `roundId` and the server re-checks the multiplier
  against the stored crash point.
- `GET/POST /api/games/trivia/*` — 10 random questions, server-side grading,
  7→10 / 9→15 / 10→25 coins.
- `GET /api/admin/*`, `GET/PATCH /api/owner/*` — commission summaries,
  per-day history, day detail, user detail, rollup, admin preview.
- `GET/POST /api/rewards*` — daily SIM (+100) and coin (+5) claims, streak,
  XP/level, achievements.

## Vercel deploy (Chuks deploys himself — no Vercel tools used here)

Do it in this order — env vars FIRST, then deploy:

1. Create a Postgres database (Neon free tier works) and copy its
   connection string. It must be reachable from the internet and use
   `sslmode=require` (Neon URLs already include it).
2. Push this repo to GitHub, import into Vercel (Next.js preset).
   No `vercel.json` needed — Vercel auto-detects Next.js and runs
   `npm run build`. `postinstall` runs `prisma generate`, so the
   Prisma Client is always generated during install; it does not
   need a live database.
3. In the Vercel project → Settings → Environment Variables, set for
   the Production environment (and Preview if you want previews):
   - `DATABASE_URL` — the Neon Postgres connection string.
   - `JWT_SECRET` — a long random string (`openssl rand -base64 32`).
4. Create the tables and seed the demo accounts — run once against
   the production DB from your own machine (do NOT paste the prod URL
   into the repo or into chat):
   ```bash
   set -a; source .env; set +a   # with the PROD database url in .env
   npx prisma db push
   npx tsx prisma/seed.ts
   ```
   (Seed is idempotent — owner/admin upsert, trivia only if the bank is empty.)
   Or wire these two commands into Vercel's build step if you prefer.
5. Deploy. No other build configuration needed: `next build` is the
   build command, `next start` serves it.

What the build does and does not need: `next build` never touches the
database — no page queries Prisma at build time (game rooms are
prerendered from the static catalogue in `src/lib/games.ts`, all data
loads through `/api/*` at runtime). So the build succeeds even before
step 4 runs. But the deployed site cannot serve real requests until
steps 3–4 are done: without `DATABASE_URL` every API call fails, and
without `db push` the tables do not exist yet.

Demo accounts after seeding: owner `owner@royale.gold` / `owner123`,
admin `admin@royale.gold` / `admin123` (10% commission, code `RG-DEMO1`).
Change these passwords before going live.

## Repo layout

```
prisma/schema.prisma        Postgres schema (source of truth)
prisma/schema.sqlite.prisma dev-only SQLite stand-in (generated — see above)
prisma/seed.ts              owner + admin + RG-DEMO1 + 45 trivia questions
prisma.config.ts            Prisma 7 config (datasource URL, seed command)
src/lib/                    prisma client, auth, money, games catalogue,
                            crash engine, settle, commission, rewards, trivia
src/app/api/                all route handlers
src/app/                    pages: /, /games, /games/[slug], /admin, /owner, /account
API_CONTRACT.md             endpoint contract for the UI agent
```

`prisma/schema.sqlite.prisma` is committed deliberately so the next agent
can reproduce the local verification without re-deriving it; it is never
used in production.
