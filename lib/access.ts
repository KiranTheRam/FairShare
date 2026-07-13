import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, householdMemberships, households, users } from "@/db/schema";
import type { AuthenticatedUser } from "./auth";
import { ApiError, clientIp } from "./http";
import type { NextRequest } from "next/server";

export async function requireHouseholdAccess(user: AuthenticatedUser, householdId: string) {
  const db = getDb();
  if (user.role === "administrator") {
    const [household] = await db.select().from(households).where(eq(households.id, householdId)).limit(1);
    if (!household || household.disabledAt) throw new ApiError(404, "Household not found", "not_found");
    return household;
  }
  const [row] = await db.select({ household: households }).from(householdMemberships)
    .innerJoin(households, eq(households.id, householdMemberships.householdId))
    .where(and(eq(householdMemberships.householdId, householdId), eq(householdMemberships.userId, user.id)))
    .limit(1);
  if (!row || row.household.disabledAt) throw new ApiError(404, "Household not found", "not_found");
  return row.household;
}

export async function requireFinancialAccess(user: AuthenticatedUser, householdId: string) {
  if (user.role !== "member") throw new ApiError(403, "Administrator accounts cannot access Household financial ledgers", "admin_financial_isolation");
  return requireHouseholdAccess(user, householdId);
}

export async function householdMembers(householdId: string) {
  return getDb().select({ id: users.id, displayName: users.displayName, email: users.email })
    .from(householdMemberships)
    .innerJoin(users, and(eq(users.id, householdMemberships.userId), eq(users.status, "active")))
    .where(eq(householdMemberships.householdId, householdId));
}

export async function validateMemberIds(householdId: string, ids: string[]) {
  const members = await householdMembers(householdId);
  const memberIds = new Set(members.map((member) => member.id));
  if (ids.some((id) => !memberIds.has(id))) throw new ApiError(400, "Every financial participant must be an active household member", "invalid_member");
}

export async function validateMembershipIds(householdId: string, ids: string[]) {
  const rows = await getDb().select({ userId: householdMemberships.userId }).from(householdMemberships).where(eq(householdMemberships.householdId, householdId));
  const memberIds = new Set(rows.map((row) => row.userId));
  if (ids.some((id) => !memberIds.has(id))) throw new ApiError(400, "Every payment participant must belong to the Household", "invalid_member");
}

export async function writeAudit(request: NextRequest, user: AuthenticatedUser, action: string, entityType: string, entityId?: string, householdId?: string, metadata?: unknown) {
  await getDb().insert(auditLogs).values({ actorUserId: user.id, householdId, action, entityType, entityId, metadata, ipAddress: clientIp(request) });
}
