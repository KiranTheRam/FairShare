import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { sessions, users } from "@/db/schema";
import { apiRoute } from "@/lib/api";
import { requireMutationUser } from "@/lib/auth";
import { ApiError, parseJson } from "@/lib/http";
import { hashPassword, verifyPassword } from "@/lib/security";
import { passwordChangeSchema } from "@/lib/validation";

export async function POST(request: NextRequest) {
  return apiRoute(async () => {
    const user = await requireMutationUser(request);
    const input = await parseJson(request, passwordChangeSchema);
    const [account] = await getDb().select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, user.id)).limit(1);
    if (!account || !await verifyPassword(account.passwordHash, input.currentPassword)) throw new ApiError(403, "Current password is incorrect", "invalid_password");
    const passwordHash = await hashPassword(input.newPassword);
    await getDb().transaction(async (tx) => {
      await tx.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, user.id));
      await tx.delete(sessions).where(eq(sessions.userId, user.id));
    });
    return { ok: true, signedOut: true };
  });
}
