import { NextRequest } from "next/server";
import { apiRoute } from "@/lib/api";
import { ApiError } from "@/lib/http";
import { constantTimeEqual } from "@/lib/security";
import { generateDueBills } from "@/lib/recurring";

export async function POST(request: NextRequest) {
  return apiRoute(async () => {
    const expected = process.env.CRON_SECRET;
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (!expected || !constantTimeEqual(token, expected)) throw new ApiError(401, "Invalid scheduler credential", "unauthorized");
    return generateDueBills();
  });
}
