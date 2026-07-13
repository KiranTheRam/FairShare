import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { noStore } from "@/lib/http";

export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    return noStore({ status: "ok" });
  } catch {
    return noStore({ status: "unhealthy" }, { status: 503 });
  }
}
