import { and, eq, isNull } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { householdInvites } from "@/db/schema";
import { apiRoute } from "@/lib/api";
import { requireMutationUser } from "@/lib/auth";
import { requireHouseholdAccess, writeAudit } from "@/lib/access";
import { ApiError, requireUuid } from "@/lib/http";

export async function DELETE(request: NextRequest, context: { params: Promise<{ householdId: string; inviteId: string }> }) {
  return apiRoute(async () => {
    const user = await requireMutationUser(request);
    const { householdId, inviteId } = await context.params;
    await requireHouseholdAccess(user, householdId);
    requireUuid(inviteId, "invite identifier");
    const [revoked] = await getDb().update(householdInvites).set({ revokedAt: new Date() })
      .where(and(eq(householdInvites.id, inviteId), eq(householdInvites.householdId, householdId), isNull(householdInvites.usedAt), isNull(householdInvites.revokedAt))).returning();
    if (!revoked) throw new ApiError(404, "Invite not found or already inactive", "not_found");
    await writeAudit(request, user, "invite.revoked", "household_invite", inviteId, householdId);
    return { ok: true };
  });
}
