export async function GET() {
  return Response.json(
    { status: "ok", service: "fairshare" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
