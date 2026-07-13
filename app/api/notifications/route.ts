import { and, desc, eq, isNull } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { notifications } from "@/db/schema";
import { apiRoute } from "@/lib/api";
import { requireMutationUser, requireRequestUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  return apiRoute(async () => {
    const user = await requireRequestUser(request);
    return { notifications: await getDb().select().from(notifications).where(eq(notifications.userId, user.id)).orderBy(desc(notifications.createdAt)).limit(50) };
  });
}

export async function PATCH(request: NextRequest) {
  return apiRoute(async () => {
    const user = await requireMutationUser(request);
    await getDb().update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
    return { ok: true };
  });
}
