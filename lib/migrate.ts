import "server-only";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { getDb } from "@/db";

export async function runMigrations() {
  await migrate(getDb(), { migrationsFolder: `${process.cwd()}/drizzle` });
}
