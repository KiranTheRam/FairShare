import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { paymentClaims } from "@/db/schema";
import { apiRoute } from "@/lib/api";
import { requireMutationUser } from "@/lib/auth";
import { requireFinancialAccess, writeAudit } from "@/lib/access";
import { ApiError, parseJson, requireUuid } from "@/lib/http";
import { notifyUser } from "@/lib/notifications";
import { claimUpdateSchema } from "@/lib/validation";

async function loadPending(householdId: string, claimId: string) {
  const [claim] = await getDb().select().from(paymentClaims)
    .where(and(eq(paymentClaims.id, claimId), eq(paymentClaims.householdId, householdId), eq(paymentClaims.status, "pending"))).limit(1);
  if (!claim) throw new ApiError(404, "No pending claim found", "claim_not_found");
  return claim;
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ householdId: string; claimId: string }> }) {
  return apiRoute(async () => {
    const user = await requireMutationUser(request);
    const { householdId, claimId } = await context.params;
    await requireFinancialAccess(user, householdId);
    requireUuid(claimId, "claim id");
    const input = await parseJson(request, claimUpdateSchema);
    const claim = await loadPending(householdId, claimId);
    if (claim.debtorUserId !== user.id) throw new ApiError(403, "Only the person who made the claim can edit it", "not_claim_owner");
    const [updated] = await getDb().update(paymentClaims)
      .set({ ...(input.amountCents !== undefined ? { amountCents: input.amountCents } : {}), ...(input.note !== undefined ? { note: input.note } : {}), updatedAt: new Date() })
      .where(and(eq(paymentClaims.id, claimId), eq(paymentClaims.status, "pending"))).returning();
    await writeAudit(request, user, "claim.edited", "payment_claim", claimId, householdId, input);
    return { claim: updated };
  });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ householdId: string; claimId: string }> }) {
  return apiRoute(async () => {
    const user = await requireMutationUser(request);
    const { householdId, claimId } = await context.params;
    const household = await requireFinancialAccess(user, householdId);
    requireUuid(claimId, "claim id");
    const claim = await loadPending(householdId, claimId);
    const isDebtor = claim.debtorUserId === user.id;
    const isCreditor = claim.creditorUserId === user.id;
    if (!isDebtor && !isCreditor) throw new ApiError(403, "Only the two people involved can resolve this claim", "not_claim_party");
    const status = isDebtor ? "cancelled" : "dismissed";
    await getDb().update(paymentClaims).set({ status, resolvedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(paymentClaims.id, claimId), eq(paymentClaims.status, "pending")));
    if (isCreditor) await notifyUser({ householdId, userId: claim.debtorUserId, type: "payment", title: "Payment claim dismissed", body: `${user.displayName} says they didn't receive your payment of ${(claim.amountCents / 100).toFixed(2)} ${household.currency}. The balance stays open.`, targetPath: "/" });
    await writeAudit(request, user, isDebtor ? "claim.cancelled" : "claim.dismissed", "payment_claim", claimId, householdId);
    return { ok: true, status };
  });
}
