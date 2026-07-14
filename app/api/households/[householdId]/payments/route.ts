import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { billChangeHistory, bills, obligations, payments } from "@/db/schema";
import { apiRoute } from "@/lib/api";
import { requireMutationUser } from "@/lib/auth";
import { requireFinancialAccess, validateMembershipIds, writeAudit } from "@/lib/access";
import { ApiError, parseJson } from "@/lib/http";
import { outstandingForBillPair, outstandingForPair } from "@/lib/ledger";
import { areObligationsSettled } from "@/lib/ledger-calculation";
import { notifyUser } from "@/lib/notifications";
import { and, eq } from "drizzle-orm";
import { paymentSchema } from "@/lib/validation";

export async function POST(request: NextRequest, context: { params: Promise<{ householdId: string }> }) {
  return apiRoute(async () => {
    const user = await requireMutationUser(request);
    const { householdId } = await context.params;
    const household = await requireFinancialAccess(user, householdId);
    const input = await parseJson(request, paymentSchema);
    await validateMembershipIds(householdId, [input.payerUserId, input.recipientUserId]);
    if (user.id !== input.payerUserId && user.id !== input.recipientUserId) throw new ApiError(403, "Only a person involved in the payment may record it", "payment_not_involved");
    if (input.billId) {
      const [bill] = await getDb().select({ id: bills.id, status: bills.status }).from(bills).where(and(eq(bills.id, input.billId), eq(bills.householdId, householdId))).limit(1);
      if (!bill) throw new ApiError(400, "The selected bill does not belong to this Household", "invalid_bill");
      if (bill.status !== "open") throw new ApiError(409, "This bill is already settled", "bill_already_settled");
    }
    const outstanding = input.billId
      ? await outstandingForBillPair(householdId, input.billId, input.payerUserId, input.recipientUserId)
      : await outstandingForPair(householdId, input.payerUserId, input.recipientUserId);
    if (input.amountCents > outstanding) throw new ApiError(400, `Payment exceeds the outstanding balance of ${(outstanding / 100).toFixed(2)} ${household.currency}`, "payment_exceeds_balance");
    const payment = await getDb().transaction(async (tx) => {
      const [created] = await tx.insert(payments).values({ householdId, billId: input.billId ?? null, payerUserId: input.payerUserId, recipientUserId: input.recipientUserId, amountCents: input.amountCents, note: input.note, paidAt: input.paidAt ? new Date(input.paidAt) : new Date(), createdByUserId: user.id }).returning();
      if (input.billId) {
        const [activeObligations, billPayments] = await Promise.all([
          tx.select({ debtorUserId: obligations.debtorUserId, creditorUserId: obligations.creditorUserId, amountCents: obligations.originalAmountCents }).from(obligations).where(and(eq(obligations.billId, input.billId), eq(obligations.active, true))),
          tx.select({ payerUserId: payments.payerUserId, recipientUserId: payments.recipientUserId, amountCents: payments.amountCents }).from(payments).where(eq(payments.billId, input.billId)),
        ]);
        const fullySettled = areObligationsSettled(activeObligations, billPayments);
        if (fullySettled) {
          await tx.update(bills).set({ status: "settled", updatedAt: new Date() }).where(and(eq(bills.id, input.billId), eq(bills.status, "open")));
          await tx.insert(billChangeHistory).values({ billId: input.billId, changedByUserId: user.id, changeType: "settled", afterValue: { status: "settled", paymentId: created.id } });
        }
      }
      return created;
    });
    const notifyUserId = user.id === input.payerUserId ? input.recipientUserId : input.payerUserId;
    await notifyUser({ householdId, userId: notifyUserId, type: "payment", title: "Payment recorded", body: `${input.amountCents / 100} ${household.currency} was recorded toward your balance.`, targetPath: "/" });
    await writeAudit(request, user, "payment.created", "payment", payment.id, householdId, { amountCents: payment.amountCents });
    return { payment };
  }, 201);
}
