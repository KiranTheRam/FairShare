import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { count, sql } from "drizzle-orm";
import { notificationPreferences, users } from "@/db/schema";
import { bootstrapSchema } from "@/lib/validation";
import { hasAnyUsers, createSession } from "@/lib/auth";
import { ApiError, assertSameOrigin, jsonError, parseJson } from "@/lib/http";
import { constantTimeEqual, hashPassword } from "@/lib/security";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    if (await hasAnyUsers()) throw new ApiError(409, "Initial setup is already complete", "already_initialized");
    const input = await parseJson(request, bootstrapSchema);
    const expected = process.env.FAIRSHARE_SETUP_TOKEN;
    if (!expected || !constantTimeEqual(input.setupToken, expected)) throw new ApiError(403, "Invalid setup token", "invalid_setup_token");
    const passwordHash = await hashPassword(input.password);
    const [user] = await getDb().transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(774293184)`);
      const [existing] = await tx.select({ value: count() }).from(users);
      if (Number(existing.value) > 0) throw new ApiError(409, "Initial setup is already complete", "already_initialized");
      const created = await tx.insert(users).values({ email: input.email.toLowerCase(), displayName: input.displayName, passwordHash, role: "administrator" }).returning();
      await tx.insert(notificationPreferences).values({ userId: created[0].id });
      return created;
    });
    const response = NextResponse.json({ user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role } }, { status: 201 });
    response.headers.set("Cache-Control", "private, no-store");
    await createSession(user.id, request, response);
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
