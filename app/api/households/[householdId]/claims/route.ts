import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { paymentClaims } from "@/db/schema";
import { apiRoute } from "@/lib/api";
import { requireMutationUser } from "@/lib/auth";
import { requireFinancialAccess, writeAudit } from "@/lib/access";
import { ApiError, parseJson } from "@/lib/http";
import { householdSnapshot } from "@/lib/ledger";
import { notifyUser } from "@/lib/notifications";
import { claimSchema } from "@/lib/validation";

export async function POST(request: NextRequest, context: { params: Promise<{ householdId: string }> }) {
  return apiRoute(async () => {
    const user = await requireMutationUser(request);
    const { householdId } = await context.params;
    const household = await requireFinancialAccess(user, householdId);
    const input = await parseJson(request, claimSchema);
    if (input.creditorUserId === user.id) throw new ApiError(400, "You cannot claim a payment to yourself", "invalid_claim");
    // The claim never touches balances — but it must describe a real debt, so the
    // amount is validated against the live pair balance rather than trusted.
    const snapshot = await householdSnapshot(householdId);
    const balance = snapshot.balances.find((item) => item.payerUserId === user.id && item.recipientUserId === input.creditorUserId);
    if (!balance || balance.amountCents <= 0) throw new ApiError(400, "You have no outstanding balance with this member", "no_outstanding_balance");
    if (input.amountCents > balance.amountCents) throw new ApiError(400, "The claim is larger than what you owe", "claim_exceeds_balance");
    let claim;
    try {
      [claim] = await getDb().insert(paymentClaims).values({ householdId, debtorUserId: user.id, creditorUserId: input.creditorUserId, amountCents: input.amountCents, note: input.note ?? null }).returning();
    } catch (cause) {
      if ((cause as { code?: string }).code === "23505") throw new ApiError(409, "You already have a pending claim with this member", "claim_pending");
      throw cause;
    }
    await notifyUser({ householdId, userId: input.creditorUserId, type: "payment", title: "Payment to confirm", body: `${user.displayName} says they paid you ${(input.amountCents / 100).toFixed(2)} ${household.currency}${input.note ? ` — "${input.note}"` : ""}. Confirm it in ${household.name}.`, targetPath: "/" });
    await writeAudit(request, user, "claim.sent", "payment_claim", claim.id, householdId, { creditorUserId: input.creditorUserId, amountCents: input.amountCents });
    return { claim };
  }, 201);
}
