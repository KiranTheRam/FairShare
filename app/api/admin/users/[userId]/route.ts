import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { sessions, users } from "@/db/schema";
import { apiRoute } from "@/lib/api";
import { requireAdmin, requireMutationUser } from "@/lib/auth";
import { ApiError, readJson } from "@/lib/http";
import { writeAudit } from "@/lib/access";
import { hashPassword } from "@/lib/security";
import { userUpdateSchema } from "@/lib/validation";

export async function PATCH(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  return apiRoute(async () => {
    const actor = requireAdmin(await requireMutationUser(request));
    const { userId } = await context.params;
    const body = await readJson(request);
    const input = userUpdateSchema.parse({ ...(typeof body === "object" && body ? body : {}), id: userId });
    if (userId === actor.id && input.status === "disabled") throw new ApiError(400, "You cannot disable your own account", "self_disable");
    const values: { displayName?: string; status?: "active" | "disabled"; passwordHash?: string; updatedAt: Date } = { updatedAt: new Date() };
    if (input.displayName) values.displayName = input.displayName;
    if (input.status) values.status = input.status;
    if (input.password) values.passwordHash = await hashPassword(input.password);
    const [user] = await getDb().update(users).set(values).where(eq(users.id, userId)).returning();
    if (!user) throw new ApiError(404, "User not found", "not_found");
    if (input.status === "disabled" || input.password) await getDb().delete(sessions).where(eq(sessions.userId, userId));
    await writeAudit(request, actor, "user.updated", "user", userId, undefined, { status: input.status, passwordChanged: Boolean(input.password) });
    return { user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role, status: user.status } };
  });
}
