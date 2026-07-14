import { NextRequest } from "next/server";
import { apiRoute } from "@/lib/api";
import { findActiveInvite } from "@/lib/invites";

// Public preview so an invited person can see what they are joining before
// creating an account. Reveals only the household name and inviter.
export async function GET(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  return apiRoute(async () => {
    const { token } = await context.params;
    const { invite, householdName, invitedBy } = await findActiveInvite(token);
    return { invite: { householdName, invitedBy, expiresAt: invite.expiresAt } };
  });
}
