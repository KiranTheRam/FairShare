import { and, eq, isNull } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { billComments, bills } from "@/db/schema";
import { apiRoute } from "@/lib/api";
import { requireMutationUser } from "@/lib/auth";
import { requireFinancialAccess, writeAudit } from "@/lib/access";
import { ApiError, parseJson, requireUuid } from "@/lib/http";
import { notifyHousehold } from "@/lib/notifications";
import { commentSchema } from "@/lib/validation";

export async function POST(request: NextRequest, context: { params: Promise<{ householdId: string; billId: string }> }) {
  return apiRoute(async () => {
    const user = await requireMutationUser(request);
    const { householdId, billId } = await context.params;
    await requireFinancialAccess(user, householdId);
    requireUuid(billId, "bill identifier");
    const input = await parseJson(request, commentSchema);
    const [bill] = await getDb().select({ id: bills.id, name: bills.name }).from(bills).where(and(eq(bills.id, billId), eq(bills.householdId, householdId), isNull(bills.deletedAt))).limit(1);
    if (!bill) throw new ApiError(404, "Bill not found", "not_found");
    const [comment] = await getDb().insert(billComments).values({ billId, authorUserId: user.id, body: input.body }).returning();
    await writeAudit(request, user, "bill.commented", "bill_comment", comment.id, householdId);
    await notifyHousehold({ householdId, excludeUserId: user.id, type: "bill", title: "New comment", body: `${user.displayName} commented on ${bill.name}.`, targetPath: `/?bill=${billId}` });
    return { comment };
  }, 201);
}
