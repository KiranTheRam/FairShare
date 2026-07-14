import { NextRequest, NextResponse } from "next/server";
import { apiRoute } from "@/lib/api";
import { requireRequestUser } from "@/lib/auth";
import { requireFinancialAccess } from "@/lib/access";
import { ApiError } from "@/lib/http";
import { householdSnapshot } from "@/lib/ledger";

// Cells are always quoted, and a leading character that a spreadsheet would
// evaluate as a formula is neutralized so the export is safe to open directly.
function csvCell(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${guarded.replaceAll('"', '""')}"`;
}

function parseDay(value: string | null, name: string) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ApiError(400, `${name} must be a YYYY-MM-DD date`, "invalid_date");
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new ApiError(400, `${name} must be a valid date`, "invalid_date");
  return date;
}

export async function GET(request: NextRequest, context: { params: Promise<{ householdId: string }> }) {
  try {
    const user = await requireRequestUser(request);
    const { householdId } = await context.params;
    const household = await requireFinancialAccess(user, householdId);
    const from = parseDay(request.nextUrl.searchParams.get("from"), "from");
    const toDay = parseDay(request.nextUrl.searchParams.get("to"), "to");
    const to = toDay ? new Date(toDay.getTime() + 86_400_000) : null;
    const inRange = (value: string | Date) => { const date = new Date(value); return (!from || date >= from) && (!to || date < to); };
    const snapshot = await householdSnapshot(householdId);
    const rows: string[] = [["type", "date", "description", "category", "amount", "currency", "status", "from", "to", "recorded_by", "note"].map(csvCell).join(",")];
    const events = [
      ...snapshot.bills.filter((bill) => inRange(bill.createdAt)).map((bill) => ({
        when: new Date(bill.createdAt),
        cells: ["bill", new Date(bill.createdAt).toISOString().slice(0, 10), bill.name, bill.category, (bill.amountCents / 100).toFixed(2), household.currency, bill.status, bill.createdByName ?? "", "external vendor", bill.createdByName ?? "", bill.periodLabel],
      })),
      ...snapshot.payments.filter((payment) => inRange(payment.paidAt)).map((payment) => ({
        when: new Date(payment.paidAt),
        cells: ["payment", new Date(payment.paidAt).toISOString().slice(0, 10), payment.billName ? `Repayment toward ${payment.billName}` : "General repayment", "", (payment.amountCents / 100).toFixed(2), household.currency, "recorded", payment.payerName ?? "", payment.recipientName ?? "", payment.actorName ?? "", payment.note ?? ""],
      })),
    ].sort((a, b) => +a.when - +b.when);
    for (const event of events) rows.push(event.cells.map(csvCell).join(","));
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(rows.join("\r\n") + "\r\n", {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="fairshare-export-${stamp}.csv"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return apiRoute(async () => { throw error; });
  }
}
