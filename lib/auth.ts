import "server-only";
import { and, count, eq, gt, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { loginAttempts, sessions, users } from "@/db/schema";
import { ApiError, assertSameOrigin, clientIp } from "./http";
import { constantTimeEqual, randomToken, sha256 } from "./security";

const SESSION_DAYS = 30;
const cookieName = process.env.COOKIE_SECURE === "false" ? "fairshare_session" : "__Host-fairshare_session";

export type AuthenticatedUser = {
  id: string;
  email: string;
  displayName: string;
  role: "member" | "administrator";
  status: "active" | "disabled";
  sessionId: string;
  csrfToken: string;
};

export async function createSession(userId: string, request: NextRequest, response: NextResponse) {
  const db = getDb();
  const token = randomToken();
  const csrfToken = randomToken(24);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({
    userId,
    tokenHash: sha256(token),
    csrfToken,
    expiresAt,
    userAgent: request.headers.get("user-agent")?.slice(0, 500),
    ipAddress: clientIp(request),
  });
  response.cookies.set(cookieName, token, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE !== "false",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
    priority: "high",
  });
}

async function sessionByToken(token: string | undefined): Promise<AuthenticatedUser | null> {
  if (!token) return null;
  const db = getDb();
  const rows = await db.select({
    id: users.id,
    email: users.email,
    displayName: users.displayName,
    role: users.role,
    status: users.status,
    sessionId: sessions.id,
    csrfToken: sessions.csrfToken,
  }).from(sessions).innerJoin(users, eq(users.id, sessions.userId)).where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date()))).limit(1);
  const user = rows[0];
  if (!user || user.status !== "active") return null;
  void db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, user.sessionId));
  return user;
}

export async function getCurrentUser() {
  const store = await cookies();
  return sessionByToken(store.get(cookieName)?.value);
}

export async function requireRequestUser(request: NextRequest) {
  const user = await sessionByToken(request.cookies.get(cookieName)?.value);
  if (!user) throw new ApiError(401, "Authentication required", "unauthenticated");
  return user;
}

export async function requireMutationUser(request: NextRequest) {
  assertSameOrigin(request);
  const user = await requireRequestUser(request);
  const csrf = request.headers.get("x-csrf-token");
  if (!csrf || !constantTimeEqual(csrf, user.csrfToken)) throw new ApiError(403, "CSRF validation failed", "csrf_failed");
  return user;
}

export function requireAdmin(user: AuthenticatedUser) {
  if (user.role !== "administrator") throw new ApiError(403, "Administrator access required", "forbidden");
  return user;
}

export async function deleteSession(request: NextRequest, response: NextResponse) {
  const token = request.cookies.get(cookieName)?.value;
  if (token) await getDb().delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
  response.cookies.set(cookieName, "", { httpOnly: true, secure: process.env.COOKIE_SECURE !== "false", sameSite: "lax", path: "/", maxAge: 0 });
}

export async function isLoginRateLimited(email: string, ip: string) {
  const since = new Date(Date.now() - 15 * 60_000);
  const [emailResult, ipResult] = await Promise.all([
    getDb().select({ attempts: count() }).from(loginAttempts).where(and(eq(loginAttempts.email, email), eq(loginAttempts.successful, false), gt(loginAttempts.attemptedAt, since))),
    getDb().select({ attempts: count() }).from(loginAttempts).where(and(eq(loginAttempts.ipAddress, ip), eq(loginAttempts.successful, false), gt(loginAttempts.attemptedAt, since))),
  ]);
  return Number(emailResult[0]?.attempts ?? 0) >= 8 || Number(ipResult[0]?.attempts ?? 0) >= 40;
}

export async function recordLoginAttempt(email: string, ip: string, successful: boolean) {
  const db = getDb();
  await db.insert(loginAttempts).values({ email, ipAddress: ip, successful });
  if (successful) await db.delete(loginAttempts).where(and(eq(loginAttempts.email, email), eq(loginAttempts.successful, false)));
  if (Math.random() < 0.05) await db.delete(loginAttempts).where(sql`${loginAttempts.attemptedAt} < now() - interval '1 day'`);
}

export async function hasAnyUsers() {
  const result = await getDb().select({ value: count() }).from(users);
  return Number(result[0]?.value ?? 0) > 0;
}
