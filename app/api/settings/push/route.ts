import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { apiRoute } from "@/lib/api";
import { requireMutationUser } from "@/lib/auth";
import { pushSubscriptionSchema } from "@/lib/validation";
import { parseJson, readJson } from "@/lib/http";

export async function POST(request: NextRequest) {
  return apiRoute(async () => {
    const user = await requireMutationUser(request);
    const input = await parseJson(request, pushSubscriptionSchema);
    await getDb().insert(pushSubscriptions).values({ userId: user.id, endpoint: input.endpoint, p256dh: input.keys.p256dh, auth: input.keys.auth }).onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId: user.id, p256dh: input.keys.p256dh, auth: input.keys.auth } });
    return { ok: true };
  }, 201);
}

export async function DELETE(request: NextRequest) {
  return apiRoute(async () => {
    const user = await requireMutationUser(request);
    const body = await readJson(request);
    const endpoint = typeof body === "object" && body && "endpoint" in body ? body.endpoint : undefined;
    if (typeof endpoint === "string") await getDb().delete(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, user.id)));
    return { ok: true, userId: user.id };
  });
}
