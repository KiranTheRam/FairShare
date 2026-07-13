import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { recurringBillTemplates } from "@/db/schema";
import { apiRoute } from "@/lib/api";
import { requireFinancialAccess, validateMemberIds, writeAudit } from "@/lib/access";
import { requireMutationUser, requireRequestUser } from "@/lib/auth";
import { recurringSchema } from "@/lib/validation";
import { parseJson } from "@/lib/http";

export async function GET(request: NextRequest, context: { params: Promise<{ householdId: string }> }) {
  return apiRoute(async () => {
    const user = await requireRequestUser(request);
    const { householdId } = await context.params;
    await requireFinancialAccess(user, householdId);
    return { recurring: await getDb().select().from(recurringBillTemplates).where(eq(recurringBillTemplates.householdId, householdId)) };
  });
}

export async function POST(request: NextRequest, context: { params: Promise<{ householdId: string }> }) {
  return apiRoute(async () => {
    const user = await requireMutationUser(request);
    const { householdId } = await context.params;
    await requireFinancialAccess(user, householdId);
    const input = await parseJson(request, recurringSchema);
    await validateMemberIds(householdId, [...input.contributions.map((item) => item.userId), ...input.allocations.map((item) => item.userId)]);
    const [template] = await getDb().insert(recurringBillTemplates).values({ householdId, name: input.name, expectedAmountCents: input.expectedAmountCents, cadence: input.cadence, nextOccurrence: new Date(input.nextOccurrence), allocationMethod: input.allocationMethod, templateConfig: { contributions: input.contributions, allocations: input.allocations }, active: input.active ?? true, createdByUserId: user.id }).returning();
    await writeAudit(request, user, "recurring.created", "recurring_template", template.id, householdId);
    return { recurring: template };
  }, 201);
}
