import { desc } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { notificationPreferences, users } from "@/db/schema";
import { apiRoute } from "@/lib/api";
import { requireAdmin, requireMutationUser, requireRequestUser } from "@/lib/auth";
import { writeAudit } from "@/lib/access";
import { hashPassword, normalizeEmail } from "@/lib/security";
import { userCreateSchema } from "@/lib/validation";
import { parseJson } from "@/lib/http";

export async function GET(request: NextRequest) {
  return apiRoute(async () => {
    requireAdmin(await requireRequestUser(request));
    return { users: await getDb().select({ id: users.id, email: users.email, displayName: users.displayName, role: users.role, status: users.status, createdAt: users.createdAt }).from(users).orderBy(desc(users.createdAt)) };
  });
}

export async function POST(request: NextRequest) {
  return apiRoute(async () => {
    const actor = requireAdmin(await requireMutationUser(request));
    const input = await parseJson(request, userCreateSchema);
    const passwordHash = await hashPassword(input.password);
    const [user] = await getDb().transaction(async (tx) => {
      const created = await tx.insert(users).values({ email: normalizeEmail(input.email), displayName: input.displayName, passwordHash, role: input.role }).returning();
      await tx.insert(notificationPreferences).values({ userId: created[0].id });
      return created;
    });
    await writeAudit(request, actor, "user.created", "user", user.id, undefined, { role: user.role });
    return { user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role, status: user.status } };
  }, 201);
}
