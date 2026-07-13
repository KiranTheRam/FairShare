import { NextRequest } from "next/server";
import { apiRoute } from "@/lib/api";
import { requireMutationUser } from "@/lib/auth";
import { requireFinancialAccess, writeAudit } from "@/lib/access";
import { createBill } from "@/lib/ledger";
import { billCreateSchema } from "@/lib/validation";
import { parseJson } from "@/lib/http";
import { notifyHousehold } from "@/lib/notifications";

export async function POST(request: NextRequest, context: { params: Promise<{ householdId: string }> }) {
  return apiRoute(async () => {
    const user = await requireMutationUser(request);
    const { householdId } = await context.params;
    await requireFinancialAccess(user, householdId);
    const bill = await createBill(householdId, user.id, await parseJson(request, billCreateSchema));
    await writeAudit(request, user, "bill.created", "bill", bill.id, householdId, { amountCents: bill.amountCents });
    await notifyHousehold({ householdId, excludeUserId: user.id, type: "bill", title: "New bill added", body: `${bill.name} was added to the Household ledger.`, targetPath: `/` });
    return { bill };
  }, 201);
}
