import { runMigrations } from "../lib/migrate";

await runMigrations();
console.log("FairShare database migrations are up to date.");
