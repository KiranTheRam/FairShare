import { NextRequest, NextResponse } from "next/server";
import { z, ZodError, type ZodType } from "zod";

export class ApiError extends Error {
  constructor(public status: number, message: string, public code = "request_error") {
    super(message);
  }
}

export function jsonError(error: unknown) {
  if (error instanceof ApiError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  if (error instanceof ZodError) return NextResponse.json({ error: "Invalid request", code: "validation_error" }, { status: 400 });
  console.error(error);
  return NextResponse.json({ error: "Internal server error", code: "internal_error" }, { status: 500 });
}

export async function parseJson<T>(request: NextRequest, schema: ZodType<T>): Promise<T> {
  return schema.parse(await readJson(request));
}

export async function readJson(request: NextRequest): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > 1_000_000) throw new ApiError(413, "Request body is too large", "payload_too_large");
  if (!request.body) throw new ApiError(400, "A JSON request body is required", "missing_body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > 1_000_000) { await reader.cancel(); throw new ApiError(413, "Request body is too large", "payload_too_large"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new ApiError(400, "Request body must be valid JSON", "invalid_json"); }
}

export function clientIp(request: NextRequest) {
  // Cloudflare overwrites CF-Connecting-IP at the edge. X-Real-IP is the
  // single-value fallback expected from the directly connected reverse proxy.
  // Deliberately do not trust the client-controlled X-Forwarded-For chain.
  return request.headers.get("cf-connecting-ip")?.trim() ?? request.headers.get("x-real-ip")?.trim() ?? "unknown";
}

export function requireUuid(value: string, name = "identifier") {
  if (!z.string().uuid().safeParse(value).success) throw new ApiError(400, `Invalid ${name}`, "invalid_identifier");
  return value;
}

export function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) throw new ApiError(403, "Origin header is required", "origin_required");
  const expected = process.env.APP_ORIGIN;
  if (expected && origin !== expected) throw new ApiError(403, "Cross-origin request rejected", "origin_rejected");
  if (!expected && new URL(origin).host !== request.headers.get("host")) throw new ApiError(403, "Cross-origin request rejected", "origin_rejected");
}

export function noStore<T>(data: T, init?: ResponseInit) {
  const response = NextResponse.json(data, init);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
