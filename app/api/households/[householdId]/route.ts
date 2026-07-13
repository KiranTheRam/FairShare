import { and, eq, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { householdMemberships, households, recurringBillTemplates, users } from "@/db/schema";
import { apiRoute } from "@/lib/api";
import { requireFinancialAccess, requireHouseholdAccess, householdMembers, writeAudit } from "@/lib/access";
import { requireAdmin, requireMutationUser, requireRequestUser } from "@/lib/auth";
import { ApiError, parseJson } from "@/lib/http";
import { householdSnapshot } from "@/lib/ledger";
import { householdUpdateSchema } from "@/lib/validation";

export async function GET(request: NextRequest, context: { params: Promise<{ householdId: string }> }) {
  return apiRoute(async () => {
    const user = await requireRequestUser(request);
    const { householdId } = await context.params;
    const household = await requireFinancialAccess(user, householdId);
    const [members, snapshot] = await Promise.all([householdMembers(householdId), householdSnapshot(householdId)]);
    return { household, members, ...snapshot };
  });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ householdId: string }> }) {
  return apiRoute(async () => {
    const actor = requireAdmin(await requireMutationUser(request));
    const { householdId } = await context.params;
    await requireHouseholdAccess(actor, householdId);
    const input = await parseJson(request, householdUpdateSchema);
    if (input.memberIds) {
      const valid = input.memberIds.length ? await getDb().select({ id: users.id }).from(users).where(and(inArray(users.id, input.memberIds), eq(users.role, "member"), eq(users.status, "active"))) : [];
      if (valid.length !== new Set(input.memberIds).size) throw new ApiError(400, "All selected users must be active member accounts", "invalid_members");
      const existing = await getDb().select({ userId: householdMemberships.userId }).from(householdMemberships).where(eq(householdMemberships.householdId, householdId));
      const nextIds = new Set(input.memberIds);
      const removedIds = new Set(existing.map((item) => item.userId).filter((id) => !nextIds.has(id)));
      if (removedIds.size) {
        const snapshot = await householdSnapshot(householdId);
        if (snapshot.balances.some((balance) => removedIds.has(balance.payerUserId) || removedIds.has(balance.recipientUserId))) throw new ApiError(409, "Settle this member’s open balances before removing them from the Household", "member_has_balance");
        const templates = await getDb().select({ config: recurringBillTemplates.templateConfig }).from(recurringBillTemplates).where(and(eq(recurringBillTemplates.householdId, householdId), eq(recurringBillTemplates.active, true)));
        if (templates.some((template) => [...template.config.contributions, ...template.config.allocations].some((item) => removedIds.has(item.userId)))) throw new ApiError(409, "Update or pause recurring schedules that reference this member before removing them", "member_in_recurring_schedule");
      }
    }
    const values: Partial<typeof households.$inferInsert> = { updatedAt: new Date() };
    if (input.name) values.name = input.name;
    if (input.currency) values.currency = input.currency.toUpperCase();
    if (input.timezone) values.timezone = input.timezone;
    if (input.disabled !== undefined) values.disabledAt = input.disabled ? new Date() : null;
    const [household] = await getDb().transaction(async (tx) => {
      const updated = await tx.update(households).set(values).where(eq(households.id, householdId)).returning();
      if (input.memberIds) {
        await tx.delete(householdMemberships).where(eq(householdMemberships.householdId, householdId));
        if (input.memberIds.length) await tx.insert(householdMemberships).values(input.memberIds.map((userId) => ({ householdId, userId })));
      }
      return updated;
    });
    if (!household) throw new ApiError(404, "Household not found", "not_found");
    await writeAudit(request, actor, "household.updated", "household", householdId, householdId, input);
    return { household };
  });
}
