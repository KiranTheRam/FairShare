import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { billChangeHistory, bills } from "@/db/schema";
import { apiRoute } from "@/lib/api";
import { requireMutationUser } from "@/lib/auth";
import { requireFinancialAccess, writeAudit } from "@/lib/access";
import { ApiError, requireUuid } from "@/lib/http";
import { notifyHousehold } from "@/lib/notifications";

export async function POST(request: NextRequest, context: { params: Promise<{ householdId: string; billId: string }> }) {
  return apiRoute(async () => {
    const user = await requireMutationUser(request);
    const { householdId, billId } = await context.params;
    await requireFinancialAccess(user, householdId);
    requireUuid(billId, "bill identifier");
    const bill = await getDb().transaction(async (tx) => {
      const [existing] = await tx.select().from(bills).where(and(eq(bills.id, billId), eq(bills.householdId, householdId))).limit(1).for("update");
      if (!existing || existing.deletedAt) throw new ApiError(404, "Bill not found", "not_found");
      if (existing.status !== "open") throw new ApiError(409, "This bill is already settled", "bill_already_settled");
      const [settled] = await tx.update(bills).set({ status: "settled", updatedAt: new Date() }).where(and(eq(bills.id, billId), eq(bills.status, "open"))).returning();
      if (!settled) throw new ApiError(409, "This bill was settled by another member", "bill_already_settled");
      await tx.insert(billChangeHistory).values({ billId, changedByUserId: user.id, changeType: "closed_without_payment", beforeValue: { status: existing.status }, afterValue: { status: "settled" } });
      return settled;
    });
    await writeAudit(request, user, "bill.closed_without_payment", "bill", billId, householdId);
    await notifyHousehold({ householdId, excludeUserId: user.id, type: "bill", title: "Expense closed", body: `${bill.name} was closed without recording another payment.`, targetPath: "/" });
    return { bill };
  });
}
