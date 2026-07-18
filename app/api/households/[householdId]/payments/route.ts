import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { paymentClaims, payments } from "@/db/schema";
import { apiRoute } from "@/lib/api";
import { requireMutationUser } from "@/lib/auth";
import { requireFinancialAccess, validateMembershipIds, writeAudit } from "@/lib/access";
import { ApiError, parseJson } from "@/lib/http";
import { outstandingForPair } from "@/lib/ledger";
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
      const lockKey = `payment:${householdId}:general:${pair}`;
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
      const [prior] = await tx.select().from(payments).where(eq(payments.idempotencyKey, input.idempotencyKey)).limit(1);
      if (prior) {
        const sameOperation = prior.householdId === householdId
          && prior.createdByUserId === user.id
          && prior.payerUserId === input.payerUserId
          && prior.recipientUserId === input.recipientUserId
          && prior.amountCents === input.amountCents;
        if (!sameOperation) throw new ApiError(409, "Idempotency key was already used for another payment", "idempotency_conflict");
        return { payment: prior, created: false };
      }
      const outstanding = await outstandingForPair(householdId, input.payerUserId, input.recipientUserId);
      if (input.amountCents > outstanding) throw new ApiError(400, `Payment exceeds the outstanding balance of ${(outstanding / 100).toFixed(2)} ${household.currency}`, "payment_exceeds_balance");
      const [created] = await tx.insert(payments).values({ idempotencyKey: input.idempotencyKey, householdId, billId: null, payerUserId: input.payerUserId, recipientUserId: input.recipientUserId, amountCents: input.amountCents, note: input.note, paidAt: input.paidAt ? new Date(input.paidAt) : new Date(), createdByUserId: user.id }).returning();
      // A confirmed payment settles any matching pending claim from the payer,
      // as long as the payment covers the claimed amount.
      await tx.update(paymentClaims).set({ status: "confirmed", resolvedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(paymentClaims.householdId, householdId), eq(paymentClaims.debtorUserId, input.payerUserId), eq(paymentClaims.creditorUserId, input.recipientUserId), eq(paymentClaims.status, "pending"), lte(paymentClaims.amountCents, input.amountCents)));
      return { payment: created, created: true };
    });
    const payment = result.payment;
    if (!result.created) return { payment, replayed: true };
    const notifyUserId = user.id === input.payerUserId ? input.recipientUserId : input.payerUserId;
    await notifyUser({ householdId, userId: notifyUserId, type: "payment", title: "Payment recorded", body: `${input.amountCents / 100} ${household.currency} was recorded toward your balance.`, targetPath: "/" });
    await writeAudit(request, user, "payment.created", "payment", payment.id, householdId, { amountCents: payment.amountCents });
    return { payment, replayed: false };
  }, 201);
}
