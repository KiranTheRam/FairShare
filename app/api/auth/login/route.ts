import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { createSession, isLoginRateLimited, recordLoginAttempt } from "@/lib/auth";
import { ApiError, assertSameOrigin, clientIp, parseJson } from "@/lib/http";
import { verifyPassword } from "@/lib/security";
import { loginSchema } from "@/lib/validation";

export async function POST(request: NextRequest) {
  let email = "";
  const ip = clientIp(request);
  try {
    assertSameOrigin(request);
    const input = await parseJson(request, loginSchema);
    email = input.email.toLowerCase();
    if (await isLoginRateLimited(email, ip)) throw new ApiError(429, "Too many failed attempts. Try again in 15 minutes.", "rate_limited");
    const [user] = await getDb().select().from(users).where(eq(users.email, email)).limit(1);
    const valid = user && await verifyPassword(user.passwordHash, input.password);
    if (!valid || user.status !== "active") {
      await recordLoginAttempt(email, ip, false);
      throw new ApiError(401, "Email or password is incorrect", "invalid_credentials");
    }
    await recordLoginAttempt(email, ip, true);
    await getDb().update(users).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id));
    const response = NextResponse.json({ user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role } });
    response.headers.set("Cache-Control", "private, no-store");
    await createSession(user.id, request, response);
    return response;
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 400;
    const message = error instanceof Error ? error.message : "Sign in failed";
    return NextResponse.json({ error: message }, { status });
  }
}
