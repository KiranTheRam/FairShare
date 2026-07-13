import { and, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { billAllocations, billChangeHistory, billContributions, bills, obligations, payments, users } from "@/db/schema";
import { apiRoute } from "@/lib/api";
import { requireMutationUser, requireRequestUser } from "@/lib/auth";
import { requireFinancialAccess, writeAudit } from "@/lib/access";
import { ApiError, parseJson } from "@/lib/http";
import { updateBill } from "@/lib/ledger";
import { billUpdateSchema } from "@/lib/validation";
import { notifyHousehold } from "@/lib/notifications";

const debtor = alias(users, "debtor");
const creditor = alias(users, "creditor");

export async function GET(request: NextRequest, context: { params: Promise<{ householdId: string; billId: string }> }) {
  return apiRoute(async () => {
    const user = await requireRequestUser(request);
    const { householdId, billId } = await context.params;
    await requireFinancialAccess(user, householdId);
    const db = getDb();
    const [bill] = await db.select().from(bills).where(and(eq(bills.id, billId), eq(bills.householdId, householdId))).limit(1);
    if (!bill) throw new ApiError(404, "Bill not found", "not_found");
    const [contributions, allocations, obligationRows, paymentRows, history] = await Promise.all([
      db.select({ id: billContributions.id, userId: billContributions.payerUserId, displayName: users.displayName, amountCents: billContributions.amountCents, paidAt: billContributions.paidAt }).from(billContributions).innerJoin(users, eq(users.id, billContributions.payerUserId)).where(eq(billContributions.billId, billId)),
      db.select({ id: billAllocations.id, userId: billAllocations.memberUserId, displayName: users.displayName, amountCents: billAllocations.amountCents, percentageBasisPoints: billAllocations.percentageBasisPoints }).from(billAllocations).innerJoin(users, eq(users.id, billAllocations.memberUserId)).where(eq(billAllocations.billId, billId)),
      db.select({ id: obligations.id, debtorUserId: obligations.debtorUserId, creditorUserId: obligations.creditorUserId, debtorName: debtor.displayName, creditorName: creditor.displayName, originalAmountCents: obligations.originalAmountCents }).from(obligations).innerJoin(debtor, eq(debtor.id, obligations.debtorUserId)).innerJoin(creditor, eq(creditor.id, obligations.creditorUserId)).where(and(eq(obligations.billId, billId), eq(obligations.active, true))),
      db.select({ id: payments.id, payerUserId: payments.payerUserId, recipientUserId: payments.recipientUserId, amountCents: payments.amountCents, note: payments.note, paidAt: payments.paidAt }).from(payments).where(eq(payments.billId, billId)).orderBy(desc(payments.paidAt)),
      db.select({ id: billChangeHistory.id, changeType: billChangeHistory.changeType, beforeValue: billChangeHistory.beforeValue, afterValue: billChangeHistory.afterValue, changedAt: billChangeHistory.changedAt, changedBy: users.displayName }).from(billChangeHistory).innerJoin(users, eq(users.id, billChangeHistory.changedByUserId)).where(eq(billChangeHistory.billId, billId)).orderBy(desc(billChangeHistory.changedAt)),
    ]);
    const detailedObligations = obligationRows.map((item) => ({ ...item, paidAmountCents: paymentRows.filter((payment) => payment.payerUserId === item.debtorUserId && payment.recipientUserId === item.creditorUserId).reduce((sum, payment) => sum + payment.amountCents, 0) })).map((item) => ({ ...item, outstandingAmountCents: Math.max(0, item.originalAmountCents - item.paidAmountCents) }));
    return { bill, contributions, allocations, obligations: detailedObligations, payments: paymentRows, history };
  });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ householdId: string; billId: string }> }) {
  return apiRoute(async () => {
    const user = await requireMutationUser(request);
    const { householdId, billId } = await context.params;
    await requireFinancialAccess(user, householdId);
    const input = await parseJson(request, billUpdateSchema);
    const bill = await updateBill(billId, householdId, user.id, input.revision, input);
    await writeAudit(request, user, "bill.updated", "bill", billId, householdId, { revision: bill.revision });
    await notifyHousehold({ householdId, excludeUserId: user.id, type: "bill", title: "Bill updated", body: `${bill.name} was materially updated and balances were recalculated.`, targetPath: `/` });
    return { bill };
  });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ householdId: string; billId: string }> }) {
  return apiRoute(async () => {
    const user = await requireMutationUser(request);
    const { householdId, billId } = await context.params;
    await requireFinancialAccess(user, householdId);
    const bill = await getDb().transaction(async (tx) => {
      const [removed] = await tx.update(bills).set({ status: "void", deletedAt: new Date(), updatedAt: new Date() }).where(and(eq(bills.id, billId), eq(bills.householdId, householdId))).returning();
      if (!removed) throw new ApiError(404, "Bill not found", "not_found");
      await tx.update(obligations).set({ active: false, updatedAt: new Date() }).where(eq(obligations.billId, billId));
      await tx.insert(billChangeHistory).values({ billId, changedByUserId: user.id, changeType: "voided", beforeValue: removed, afterValue: { status: "void" } });
      return removed;
    });
    await writeAudit(request, user, "bill.voided", "bill", billId, householdId);
    await notifyHousehold({ householdId, excludeUserId: user.id, type: "bill", title: "Bill removed", body: `${bill.name} was removed and balances were recalculated.`, targetPath: `/` });
    return { ok: true };
  });
}
