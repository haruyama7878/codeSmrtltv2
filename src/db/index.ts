import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/postgres";

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

function resolveDatabaseUrl(rawUrl: string | undefined): string | undefined {
  if (!rawUrl) return undefined;
  const match = rawUrl.match(/sslrootcert=([^&]+)/);
  if (match) {
    const certPath = decodeURIComponent(match[1]);
    if (!fs.existsSync(certPath)) {
      const candidates = [
        path.resolve(process.cwd(), "supabase-root.crt"),
        path.resolve(process.cwd(), "rrr", "supabase-root.crt"),
      ];
      const found = candidates.find((p) => fs.existsSync(p));
      if (found) {
        return rawUrl.replace(/sslrootcert=[^&]+/, `sslrootcert=${encodeURIComponent(found)}`);
      }
    }
  }
  return rawUrl;
}

const cloudDatabaseUrl = resolveDatabaseUrl(process.env.SUPABASE_DATABASE_URL);

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: cloudDatabaseUrl ?? databaseUrl,
    max: 5,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
