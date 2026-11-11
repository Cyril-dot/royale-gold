import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { Pool } from "pg";

/**
 * Prisma 7 needs a driver adapter — the client no longer reads
 * DATABASE_URL from the schema. Production: Postgres via `pg` Pool.
 * Local dev on this VM (no Postgres installed): a `file:` DATABASE_URL
 * switches to the better-sqlite3 adapter — DEV-ONLY stand-in, never
 * used in production. See README.md "Local database".
 *
 * The client is created lazily (via Proxy) so importing this module at
 * build time never opens a connection or instantiates a driver.
 */
function createClient(): PrismaClient {
  const url = process.env.DATABASE_URL ?? "";
  if (url.startsWith("file:")) {
    const path = url.replace(/^file:/, "");
    return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: path }) });
  }
  const pool = new Pool({ connectionString: url });
  return new PrismaClient({ adapter: new PrismaPg(pool) });
}

let cached: PrismaClient | undefined;

function getClient(): PrismaClient {
  if (!cached) cached = createClient();
  return cached;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const value = (getClient() as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(getClient())
      : value;
  },
});
