// Standalone CLI migration runner for local development and operations.
// It deliberately does not import lib/ or db/ modules: those are marked with
// "server-only", which only resolves inside the Next.js runtime (production
// migrations run there via instrumentation.ts). This script opens its own
// short-lived connection and closes it so the process exits cleanly.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required, for example postgresql://fairshare:password@127.0.0.1:5432/fairshare");
  process.exit(1);
}

const sql = postgres(url, { max: 1, connect_timeout: 10, prepare: false });
try {
  await migrate(drizzle(sql), { migrationsFolder: `${process.cwd()}/drizzle` });
  console.log("FairShare database migrations are up to date.");
} finally {
  await sql.end();
}
