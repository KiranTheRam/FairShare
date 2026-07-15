import "server-only";
import { and, eq, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { recurringBillTemplates } from "@/db/schema";
import { createBill } from "./ledger";
import { notifyHousehold } from "./notifications";

function nextDate(date: Date, cadence: "weekly" | "monthly" | "quarterly" | "yearly") {
  const next = new Date(date);
  if (cadence === "weekly") next.setUTCDate(next.getUTCDate() + 7);
  if (cadence === "monthly") next.setUTCMonth(next.getUTCMonth() + 1);
  if (cadence === "quarterly") next.setUTCMonth(next.getUTCMonth() + 3);
  if (cadence === "yearly") next.setUTCFullYear(next.getUTCFullYear() + 1);
  return next;
}

export async function generateDueBills(now = new Date()) {
  const db = getDb();
  const due = await db.select().from(recurringBillTemplates).where(and(eq(recurringBillTemplates.active, true), lte(recurringBillTemplates.nextOccurrence, now)));
  let created = 0;
  for (const template of due) {
    const amountCents = template.expectedAmountCents ?? template.templateConfig.allocations.reduce((sum, item) => sum + item.amountCents, 0);
    const occurrence = template.nextOccurrence.toISOString().slice(0, 10);
    try {
      const bill = await createBill(template.householdId, template.createdByUserId, {
        name: template.name, category: template.category, amountCents, periodLabel: occurrence, dueDate: template.nextOccurrence.toISOString(),
        amountState: template.expectedAmountCents === null ? "estimated" : "final", allocationMethod: template.allocationMethod,
        contributions: template.templateConfig.contributions, allocations: template.templateConfig.allocations,
        recurringTemplateId: template.id,
      });
      await notifyHousehold({ householdId: template.householdId, type: "bill", title: "Recurring bill generated", body: `${template.name} was created for ${occurrence}.`, targetPath: `/?bill=${bill.id}` });
      created += 1;
    } catch (error) {
      const duplicate = typeof error === "object" && error && "code" in error && error.code === "23505";
      if (!duplicate) throw error;
    }
    let nextOccurrence = nextDate(template.nextOccurrence, template.cadence);
    while (nextOccurrence <= now) nextOccurrence = nextDate(nextOccurrence, template.cadence);
    await db.update(recurringBillTemplates).set({ nextOccurrence, updatedAt: new Date() }).where(eq(recurringBillTemplates.id, template.id));
  }
  return { checked: due.length, created };
}
