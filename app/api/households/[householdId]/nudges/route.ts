import { and, eq, gt } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { auditLogs } from "@/db/schema";
import { apiRoute } from "@/lib/api";
import { requireMutationUser } from "@/lib/auth";
import { requireFinancialAccess, writeAudit } from "@/lib/access";
import { ApiError, parseJson } from "@/lib/http";
import { householdSnapshot } from "@/lib/ledger";
import { notifyUser } from "@/lib/notifications";
import { nudgeSchema } from "@/lib/validation";

const NUDGE_COOLDOWN_HOURS = 24;

export async function POST(request: NextRequest, context: { params: Promise<{ householdId: string }> }) {
  return apiRoute(async () => {
    const user = await requireMutationUser(request);
    const { householdId } = await context.params;
    const household = await requireFinancialAccess(user, householdId);
    const input = await parseJson(request, nudgeSchema);
    // Only the creditor of a live balance may send a reminder, and the amount is
    // derived on the server from the ledger rather than trusted from the client.
    const snapshot = await householdSnapshot(householdId);
    const balance = snapshot.balances.find((item) => item.payerUserId === input.debtorUserId && item.recipientUserId === user.id);
    if (!balance || balance.amountCents <= 0) throw new ApiError(400, "There is no outstanding balance owed to you by this member", "no_outstanding_balance");
    const since = new Date(Date.now() - NUDGE_COOLDOWN_HOURS * 3_600_000);
    const recent = await getDb().select({ metadata: auditLogs.metadata }).from(auditLogs)
      .where(and(eq(auditLogs.actorUserId, user.id), eq(auditLogs.householdId, householdId), eq(auditLogs.action, "nudge.sent"), gt(auditLogs.createdAt, since)));
    if (recent.some((row) => (row.metadata as { debtorUserId?: string } | null)?.debtorUserId === input.debtorUserId)) {
      throw new ApiError(429, "You already sent this member a reminder in the last 24 hours", "nudge_cooldown");
    }
    await notifyUser({ householdId, userId: input.debtorUserId, type: "balance", title: "Payment reminder", body: `${user.displayName} sent a reminder: you owe ${(balance.amountCents / 100).toFixed(2)} ${household.currency} in ${household.name}.`, targetPath: "/" });
    await writeAudit(request, user, "nudge.sent", "balance", undefined, householdId, { debtorUserId: input.debtorUserId, amountCents: balance.amountCents });
    return { ok: true };
  }, 201);
}
