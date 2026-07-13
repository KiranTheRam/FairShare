import { NextRequest, NextResponse } from "next/server";
import { deleteSession, requireMutationUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    await requireMutationUser(request);
    const response = NextResponse.json({ ok: true });
    await deleteSession(request, response);
    return response;
  } catch {
    return NextResponse.json({ error: "Unable to sign out" }, { status: 403 });
  }
}
