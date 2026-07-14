import "server-only";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { householdInvites, households, users } from "@/db/schema";
import { ApiError } from "./http";
import { sha256 } from "./security";

export function requireInviteTokenShape(token: string) {
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(token)) throw new ApiError(404, "This invite link is not valid", "invite_invalid");
  return token;
}

export async function findActiveInvite(token: string) {
  requireInviteTokenShape(token);
  const [row] = await getDb().select({ invite: householdInvites, householdName: households.name, invitedBy: users.displayName })
    .from(householdInvites)
    .innerJoin(households, and(eq(households.id, householdInvites.householdId), isNull(households.disabledAt)))
    .innerJoin(users, eq(users.id, householdInvites.createdByUserId))
    .where(and(eq(householdInvites.tokenHash, sha256(token)), isNull(householdInvites.usedAt), isNull(householdInvites.revokedAt), gt(householdInvites.expiresAt, new Date())))
    .limit(1);
  if (!row) throw new ApiError(404, "This invite link is not valid or has expired", "invite_invalid");
  return row;
}
