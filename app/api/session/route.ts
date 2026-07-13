import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { householdMemberships, households } from "@/db/schema";
import { apiRoute } from "@/lib/api";
import { requireRequestUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  return apiRoute(async () => {
    const user = await requireRequestUser(request);
    const userHouseholds = user.role === "administrator" ? [] : await getDb().select({ id: households.id, name: households.name, currency: households.currency })
      .from(householdMemberships).innerJoin(households, eq(households.id, householdMemberships.householdId)).where(eq(householdMemberships.userId, user.id));
    return { user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role }, csrfToken: user.csrfToken, households: userHouseholds };
  });
}
