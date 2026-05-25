// src/db/client.ts
// Drizzle ORM singleton — works with any standard pg connection string,
// no native binary downloads required.

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

declare global {
  // Preserve across Next.js hot-reloads in development
  // eslint-disable-next-line no-var
  var __dbPool: Pool | undefined;
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  return new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

const pool = globalThis.__dbPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalThis.__dbPool = pool;

export const db = drizzle(pool, { schema });

// Re-export schema for convenience
export * from "./schema";
