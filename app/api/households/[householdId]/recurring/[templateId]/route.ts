import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { recurringBillTemplates } from "@/db/schema";
import { apiRoute } from "@/lib/api";
import { requireFinancialAccess, validateMemberIds, writeAudit } from "@/lib/access";
import { requireMutationUser } from "@/lib/auth";
import { ApiError, parseJson, requireUuid } from "@/lib/http";
import { recurringSchema } from "@/lib/validation";

export async function PATCH(request: NextRequest, context: { params: Promise<{ householdId: string; templateId: string }> }) {
  return apiRoute(async () => {
    const user = await requireMutationUser(request);
    const { householdId, templateId } = await context.params;
    await requireFinancialAccess(user, householdId);
    requireUuid(templateId, "recurring template identifier");
    const input = await parseJson(request, recurringSchema);
    await validateMemberIds(householdId, [...input.contributions.map((item) => item.userId), ...input.allocations.map((item) => item.userId)]);
    const [template] = await getDb().update(recurringBillTemplates).set({ name: input.name, expectedAmountCents: input.expectedAmountCents, cadence: input.cadence, nextOccurrence: new Date(input.nextOccurrence), allocationMethod: input.allocationMethod, templateConfig: { contributions: input.contributions, allocations: input.allocations }, active: input.active ?? true, updatedAt: new Date() }).where(and(eq(recurringBillTemplates.id, templateId), eq(recurringBillTemplates.householdId, householdId))).returning();
    if (!template) throw new ApiError(404, "Recurring bill not found", "not_found");
    await writeAudit(request, user, "recurring.updated", "recurring_template", templateId, householdId);
    return { recurring: template };
  });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ householdId: string; templateId: string }> }) {
  return apiRoute(async () => {
    const user = await requireMutationUser(request);
    const { householdId, templateId } = await context.params;
    await requireFinancialAccess(user, householdId);
    requireUuid(templateId, "recurring template identifier");
    const [template] = await getDb().update(recurringBillTemplates).set({ active: false, updatedAt: new Date() }).where(and(eq(recurringBillTemplates.id, templateId), eq(recurringBillTemplates.householdId, householdId))).returning();
    if (!template) throw new ApiError(404, "Recurring bill not found", "not_found");
    await writeAudit(request, user, "recurring.disabled", "recurring_template", templateId, householdId);
    return { ok: true };
  });
}
