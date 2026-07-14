import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { householdInvites, users } from "@/db/schema";
import { apiRoute } from "@/lib/api";
import { requireMutationUser, requireRequestUser } from "@/lib/auth";
import { requireHouseholdAccess, writeAudit } from "@/lib/access";
import { randomToken, sha256 } from "@/lib/security";

const INVITE_DAYS = 7;

export async function GET(request: NextRequest, context: { params: Promise<{ householdId: string }> }) {
  return apiRoute(async () => {
    const user = await requireRequestUser(request);
    const { householdId } = await context.params;
    await requireHouseholdAccess(user, householdId);
    const invites = await getDb().select({ id: householdInvites.id, createdByName: users.displayName, expiresAt: householdInvites.expiresAt, createdAt: householdInvites.createdAt })
      .from(householdInvites).innerJoin(users, eq(users.id, householdInvites.createdByUserId))
      .where(and(eq(householdInvites.householdId, householdId), isNull(householdInvites.usedAt), isNull(householdInvites.revokedAt), gt(householdInvites.expiresAt, new Date())))
      .orderBy(desc(householdInvites.createdAt));
    return { invites };
  });
}

export async function POST(request: NextRequest, context: { params: Promise<{ householdId: string }> }) {
  return apiRoute(async () => {
    const user = await requireMutationUser(request);
    const { householdId } = await context.params;
    await requireHouseholdAccess(user, householdId);
    const token = randomToken();
    const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000);
    const [invite] = await getDb().insert(householdInvites).values({ householdId, tokenHash: sha256(token), createdByUserId: user.id, expiresAt }).returning({ id: householdInvites.id, expiresAt: householdInvites.expiresAt });
    await writeAudit(request, user, "invite.created", "household_invite", invite.id, householdId);
    // The raw token is returned exactly once and never stored.
    return { invite: { id: invite.id, expiresAt: invite.expiresAt, path: `/invite/${token}` } };
  }, 201);
}
