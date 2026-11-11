// Prisma 7 config: connection URL for migrate/introspect + seed command.
// The runtime client does NOT read this file — it gets DATABASE_URL via the
// pg driver adapter in src/lib/prisma.ts.
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
