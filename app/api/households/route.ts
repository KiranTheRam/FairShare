import { and, desc, eq, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { householdMemberships, households, users } from "@/db/schema";
import { apiRoute } from "@/lib/api";
import { requireAdmin, requireMutationUser, requireRequestUser } from "@/lib/auth";
import { writeAudit } from "@/lib/access";
import { householdCreateSchema } from "@/lib/validation";
import { ApiError, parseJson } from "@/lib/http";

export async function GET(request: NextRequest) {
  return apiRoute(async () => {
    const user = await requireRequestUser(request);
    const rows = user.role === "administrator"
      ? await (async () => {
          const [householdRows, memberships] = await Promise.all([getDb().select().from(households).orderBy(desc(households.createdAt)), getDb().select({ householdId: householdMemberships.householdId, userId: householdMemberships.userId }).from(householdMemberships)]);
          return householdRows.map((household) => ({ ...household, memberIds: memberships.filter((item) => item.householdId === household.id).map((item) => item.userId) }));
        })()
      : await getDb().select({ id: households.id, name: households.name, currency: households.currency, timezone: households.timezone, disabledAt: households.disabledAt, createdAt: households.createdAt, updatedAt: households.updatedAt, createdByUserId: households.createdByUserId }).from(householdMemberships).innerJoin(households, eq(households.id, householdMemberships.householdId)).where(eq(householdMemberships.userId, user.id));
    return { households: rows };
  });
}

export async function POST(request: NextRequest) {
  return apiRoute(async () => {
    const actor = requireAdmin(await requireMutationUser(request));
    const input = await parseJson(request, householdCreateSchema);
    if (input.memberIds.length) {
      const valid = await getDb().select({ id: users.id }).from(users).where(and(inArray(users.id, input.memberIds), eq(users.role, "member"), eq(users.status, "active")));
      if (valid.length !== new Set(input.memberIds).size) throw new ApiError(400, "All selected users must be active member accounts", "invalid_members");
    }
    const [household] = await getDb().transaction(async (tx) => {
      const created = await tx.insert(households).values({ name: input.name, currency: input.currency.toUpperCase(), timezone: input.timezone, createdByUserId: actor.id }).returning();
      if (input.memberIds.length) await tx.insert(householdMemberships).values(input.memberIds.map((userId) => ({ householdId: created[0].id, userId })));
      return created;
    });
    await writeAudit(request, actor, "household.created", "household", household.id, household.id, { memberCount: input.memberIds.length });
    return { household };
  }, 201);
}
