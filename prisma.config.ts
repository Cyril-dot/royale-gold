// Prisma 7 config: connection URL for migrate/introspect + seed command.
// The runtime client does NOT read this file — it gets DATABASE_URL via the
// pg driver adapter in src/lib/prisma.ts.
//
// NOTE: `prisma generate` never connects to the database, so it must not
// fail when DATABASE_URL is unset — it runs in `postinstall`, which Vercel
// executes during `npm install`, and on fresh clones with no .env yet.
// Fall back to a placeholder URL for codegen only. Commands that DO need
// a live database (db push, migrate, seed, studio) fail loudly with a
// connection error if the placeholder is used — which is the correct
// behaviour. Always export the real DATABASE_URL before those commands
// (see README: `set -a; source .env; set +a`).
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://placeholder:placeholder@localhost:5432/placeholder",
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
