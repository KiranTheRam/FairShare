import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { billChangeHistory, bills, obligations, paymentClaims, payments } from "@/db/schema";
import { apiRoute } from "@/lib/api";
import { requireMutationUser } from "@/lib/auth";
import { requireFinancialAccess, validateMembershipIds, writeAudit } from "@/lib/access";
import { ApiError, parseJson } from "@/lib/http";
import { outstandingForBillPair, outstandingForPair } from "@/lib/ledger";
import { areObligationsSettled } from "@/lib/ledger-calculation";
import { notifyUser } from "@/lib/notifications";
import { and, eq, lte, sql } from "drizzle-orm";
import { paymentSchema } from "@/lib/validation";

export async function POST(request: NextRequest, context: { params: Promise<{ householdId: string }> }) {
  return apiRoute(async () => {
    const user = await requireMutationUser(request);
    const { householdId } = await context.params;
    const household = await requireFinancialAccess(user, householdId);
    const input = await parseJson(request, paymentSchema);
    await validateMembershipIds(householdId, [input.payerUserId, input.recipientUserId]);
    if (user.id !== input.recipientUserId) throw new ApiError(403, "Only the recipient may confirm a payment", "payment_confirmation_required");
    const result = await getDb().transaction(async (tx) => {
      const pair = [input.payerUserId, input.recipientUserId].sort().join(":");
      const lockKey = `payment:${householdId}:${input.billId ?? "general"}:${pair}`;
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
      const [prior] = await tx.select().from(payments).where(eq(payments.idempotencyKey, input.idempotencyKey)).limit(1);
      if (prior) {
        const sameOperation = prior.householdId === householdId
          && prior.createdByUserId === user.id
          && prior.billId === (input.billId ?? null)
          && prior.payerUserId === input.payerUserId
          && prior.recipientUserId === input.recipientUserId
          && prior.amountCents === input.amountCents;
        if (!sameOperation) throw new ApiError(409, "Idempotency key was already used for another payment", "idempotency_conflict");
        return { payment: prior, created: false };
      }
      if (input.billId) {
        const [bill] = await tx.select({ id: bills.id, status: bills.status }).from(bills)
          .where(and(eq(bills.id, input.billId), eq(bills.householdId, householdId))).limit(1).for("update");
        if (!bill) throw new ApiError(400, "The selected bill does not belong to this Household", "invalid_bill");
        if (bill.status !== "open") throw new ApiError(409, "This bill is already settled", "bill_already_settled");
      }
      const outstanding = input.billId
        ? await outstandingForBillPair(householdId, input.billId, input.payerUserId, input.recipientUserId)
        : await outstandingForPair(householdId, input.payerUserId, input.recipientUserId);
      if (input.amountCents > outstanding) throw new ApiError(400, `Payment exceeds the outstanding balance of ${(outstanding / 100).toFixed(2)} ${household.currency}`, "payment_exceeds_balance");
      const [created] = await tx.insert(payments).values({ idempotencyKey: input.idempotencyKey, householdId, billId: input.billId ?? null, payerUserId: input.payerUserId, recipientUserId: input.recipientUserId, amountCents: input.amountCents, note: input.note, paidAt: input.paidAt ? new Date(input.paidAt) : new Date(), createdByUserId: user.id }).returning();
      // A confirmed payment settles any matching pending claim from the payer,
      // as long as the payment covers the claimed amount.
      await tx.update(paymentClaims).set({ status: "confirmed", resolvedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(paymentClaims.householdId, householdId), eq(paymentClaims.debtorUserId, input.payerUserId), eq(paymentClaims.creditorUserId, input.recipientUserId), eq(paymentClaims.status, "pending"), lte(paymentClaims.amountCents, input.amountCents)));
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
      return { payment: created, created: true };
    });
    const payment = result.payment;
    if (!result.created) return { payment, replayed: true };
    const notifyUserId = user.id === input.payerUserId ? input.recipientUserId : input.payerUserId;
    await notifyUser({ householdId, userId: notifyUserId, type: "payment", title: "Payment recorded", body: `${input.amountCents / 100} ${household.currency} was recorded toward your balance.`, targetPath: input.billId ? `/?bill=${input.billId}` : "/" });
    await writeAudit(request, user, "payment.created", "payment", payment.id, householdId, { amountCents: payment.amountCents });
    return { payment, replayed: false };
  }, 201);
}
