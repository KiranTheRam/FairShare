import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { notificationPreferences, users } from "@/db/schema";
import { apiRoute } from "@/lib/api";
import { requireMutationUser, requireRequestUser } from "@/lib/auth";
import { notificationPreferenceSchema, userSettingsSchema } from "@/lib/validation";
import { ApiError, readJson } from "@/lib/http";

export async function GET(request: NextRequest) {
  return apiRoute(async () => {
    const user = await requireRequestUser(request);
    const [account] = await getDb().select({ displayName: users.displayName, email: users.email, themePreference: users.themePreference }).from(users).where(eq(users.id, user.id)).limit(1);
    const [preferences] = await getDb().select().from(notificationPreferences).where(eq(notificationPreferences.userId, user.id)).limit(1);
    return { account, notifications: preferences, vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? null };
  });
}

export async function PATCH(request: NextRequest) {
  return apiRoute(async () => {
    const user = await requireMutationUser(request);
    const body = await readJson(request);
    if (typeof body !== "object" || !body) throw new ApiError(400, "Invalid settings body", "invalid_json");
    const record = body as Record<string, unknown>;
    const settings = userSettingsSchema.parse(body);
    const preferences = record.notifications ? notificationPreferenceSchema.parse(record.notifications) : undefined;
    if (Object.keys(settings).length) await getDb().update(users).set({ ...settings, updatedAt: new Date() }).where(eq(users.id, user.id));
    if (preferences) await getDb().insert(notificationPreferences).values({ userId: user.id, ...preferences }).onConflictDoUpdate({ target: notificationPreferences.userId, set: { ...preferences, updatedAt: new Date() } });
    return { ok: true };
  });
}
