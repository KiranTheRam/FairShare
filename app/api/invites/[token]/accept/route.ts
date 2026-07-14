import { and, eq, gt, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { householdInvites, householdMemberships, notificationPreferences, users } from "@/db/schema";
import { createSession, requireRequestUser } from "@/lib/auth";
import { writeAudit } from "@/lib/access";
import { ApiError, assertSameOrigin, jsonError, parseJson } from "@/lib/http";
import { findActiveInvite } from "@/lib/invites";
import { hashPassword, normalizeEmail } from "@/lib/security";
import { inviteAcceptSchema } from "@/lib/validation";

// The claim conditions are re-checked inside the transaction so two concurrent
// redemptions of the same single-use link cannot both succeed.
function claimConditions(inviteId: string) {
  return and(eq(householdInvites.id, inviteId), isNull(householdInvites.usedAt), isNull(householdInvites.revokedAt), gt(householdInvites.expiresAt, new Date()));
}

export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    assertSameOrigin(request);
    const { token } = await context.params;
    const { invite, householdName } = await findActiveInvite(token);
    const sessionUser = await requireRequestUser(request).catch(() => null);
    const db = getDb();
    if (sessionUser) {
      if (sessionUser.role !== "member") throw new ApiError(403, "Administrator accounts cannot join Households", "admin_financial_isolation");
      await db.transaction(async (tx) => {
        const [existing] = await tx.select({ id: householdMemberships.id }).from(householdMemberships).where(and(eq(householdMemberships.householdId, invite.householdId), eq(householdMemberships.userId, sessionUser.id))).limit(1);
        if (existing) throw new ApiError(409, `You are already a member of ${householdName}`, "already_member");
        const [claimed] = await tx.update(householdInvites).set({ usedAt: new Date(), usedByUserId: sessionUser.id }).where(claimConditions(invite.id)).returning();
        if (!claimed) throw new ApiError(409, "This invite was already used", "invite_used");
        await tx.insert(householdMemberships).values({ householdId: invite.householdId, userId: sessionUser.id });
      });
      await writeAudit(request, sessionUser, "invite.accepted", "household_invite", invite.id, invite.householdId);
      const response = NextResponse.json({ joined: true, householdId: invite.householdId });
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }
    const input = await parseJson(request, inviteAcceptSchema);
    const passwordHash = await hashPassword(input.password);
    const created = await db.transaction(async (tx) => {
      const [user] = await tx.insert(users).values({ email: normalizeEmail(input.email), displayName: input.displayName, passwordHash, role: "member" }).returning();
      await tx.insert(notificationPreferences).values({ userId: user.id });
      const [claimed] = await tx.update(householdInvites).set({ usedAt: new Date(), usedByUserId: user.id }).where(claimConditions(invite.id)).returning();
      if (!claimed) throw new ApiError(409, "This invite was already used", "invite_used");
      await tx.insert(householdMemberships).values({ householdId: invite.householdId, userId: user.id });
      return user;
    }).catch((error: unknown) => {
      if (typeof error === "object" && error && "code" in error && error.code === "23505") throw new ApiError(409, "An account with this email already exists. Sign in first, then open the invite link again.", "email_in_use");
      throw error;
    });
    await writeAudit(request, { id: created.id, email: created.email, displayName: created.displayName, role: created.role, status: created.status, sessionId: "", csrfToken: "" }, "invite.accepted", "household_invite", invite.id, invite.householdId, { newAccount: true });
    const response = NextResponse.json({ joined: true, householdId: invite.householdId, user: { id: created.id, email: created.email, displayName: created.displayName } }, { status: 201 });
    response.headers.set("Cache-Control", "private, no-store");
    await createSession(created.id, request, response);
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
