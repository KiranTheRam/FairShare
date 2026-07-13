import "server-only";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { billAllocations, billChangeHistory, billContributions, bills, obligations, payments, users } from "@/db/schema";
import { ApiError } from "./http";
import { validateMemberIds } from "./access";
import type { z } from "zod";
import type { billSchema } from "./validation";
import { calculateTransfers as calculateLedgerTransfers, LedgerCalculationError } from "./ledger-calculation";

type BillInput = z.infer<typeof billSchema>;
function calculateTransfers(input: BillInput) {
  try { return calculateLedgerTransfers(input); }
  catch (error) {
    if (error instanceof LedgerCalculationError) throw new ApiError(400, error.message, error.code);
    throw error;
  }
}

export async function createBill(householdId: string, actorUserId: string, input: BillInput) {
  const ids = [...input.contributions.map((item) => item.userId), ...input.allocations.map((item) => item.userId)];
  await validateMemberIds(householdId, ids);
  const transfers = calculateTransfers(input);
  return getDb().transaction(async (tx) => {
    const [bill] = await tx.insert(bills).values({
      householdId, createdByUserId: actorUserId, name: input.name, amountCents: input.amountCents,
      periodLabel: input.periodLabel, dueDate: input.dueDate ? new Date(input.dueDate) : null,
      amountState: input.amountState, allocationMethod: input.allocationMethod,
      recurringTemplateId: input.recurringTemplateId ?? null,
    }).returning();
    await tx.insert(billContributions).values(input.contributions.map((item) => ({ billId: bill.id, payerUserId: item.userId, amountCents: item.amountCents, paidAt: new Date(), createdByUserId: actorUserId })));
    await tx.insert(billAllocations).values(input.allocations.map((item) => ({ billId: bill.id, memberUserId: item.userId, amountCents: item.amountCents, percentageBasisPoints: item.percentageBasisPoints })));
    if (transfers.length) await tx.insert(obligations).values(transfers.map((item) => ({ ...item, householdId, billId: bill.id, originalAmountCents: item.amountCents, revision: 1 })));
    await tx.insert(billChangeHistory).values({ billId: bill.id, changedByUserId: actorUserId, changeType: "created", afterValue: input });
    return bill;
  });
}

export async function updateBill(billId: string, householdId: string, actorUserId: string, expectedRevision: number, input: BillInput) {
  await validateMemberIds(householdId, [...input.contributions.map((item) => item.userId), ...input.allocations.map((item) => item.userId)]);
  const transfers = calculateTransfers(input);
  return getDb().transaction(async (tx) => {
    const [existing] = await tx.select().from(bills).where(and(eq(bills.id, billId), eq(bills.householdId, householdId), isNull(bills.deletedAt))).limit(1);
    if (!existing) throw new ApiError(404, "Bill not found", "not_found");
    if (existing.revision !== expectedRevision) throw new ApiError(409, "This bill changed since you opened it", "revision_conflict");
    const revision = existing.revision + 1;
    const [bill] = await tx.update(bills).set({ name: input.name, amountCents: input.amountCents, periodLabel: input.periodLabel, dueDate: input.dueDate ? new Date(input.dueDate) : null, amountState: input.amountState, allocationMethod: input.allocationMethod, revision, updatedAt: new Date() }).where(and(eq(bills.id, billId), eq(bills.revision, expectedRevision))).returning();
    if (!bill) throw new ApiError(409, "This bill changed since you opened it", "revision_conflict");
    await tx.delete(billContributions).where(eq(billContributions.billId, billId));
    await tx.delete(billAllocations).where(eq(billAllocations.billId, billId));
    await tx.update(obligations).set({ active: false, updatedAt: new Date() }).where(eq(obligations.billId, billId));
    await tx.insert(billContributions).values(input.contributions.map((item) => ({ billId, payerUserId: item.userId, amountCents: item.amountCents, paidAt: new Date(), createdByUserId: actorUserId })));
    await tx.insert(billAllocations).values(input.allocations.map((item) => ({ billId, memberUserId: item.userId, amountCents: item.amountCents, percentageBasisPoints: item.percentageBasisPoints })));
    if (transfers.length) await tx.insert(obligations).values(transfers.map((item) => ({ ...item, householdId, billId, originalAmountCents: item.amountCents, revision })));
    await tx.insert(billChangeHistory).values({ billId, changedByUserId: actorUserId, changeType: "updated", beforeValue: existing, afterValue: input });
    return bill;
  });
}

export async function householdSnapshot(householdId: string) {
  const db = getDb();
  const [billRows, obligationRows, paymentRows] = await Promise.all([
    db.select().from(bills).where(and(eq(bills.householdId, householdId), isNull(bills.deletedAt))).orderBy(desc(bills.createdAt)),
    db.select({ id: obligations.id, billId: obligations.billId, debtorUserId: obligations.debtorUserId, creditorUserId: obligations.creditorUserId, amountCents: obligations.originalAmountCents, billName: bills.name })
      .from(obligations).innerJoin(bills, eq(bills.id, obligations.billId)).where(and(eq(obligations.householdId, householdId), eq(obligations.active, true))),
    db.select().from(payments).where(eq(payments.householdId, householdId)).orderBy(desc(payments.paidAt)),
  ]);
  const directional = new Map<string, { payerUserId: string; recipientUserId: string; amountCents: number }>();
  for (const item of obligationRows) {
    const key = `${item.debtorUserId}:${item.creditorUserId}`;
    const current = directional.get(key);
    if (current) current.amountCents += item.amountCents;
    else directional.set(key, { payerUserId: item.debtorUserId, recipientUserId: item.creditorUserId, amountCents: item.amountCents });
  }
  for (const payment of paymentRows) {
    const key = `${payment.payerUserId}:${payment.recipientUserId}`;
    const entry = directional.get(key);
    if (entry) entry.amountCents -= payment.amountCents;
    else directional.set(key, { payerUserId: payment.payerUserId, recipientUserId: payment.recipientUserId, amountCents: -payment.amountCents });
  }
  const outstanding = new Map<string, { payerUserId: string; recipientUserId: string; amountCents: number }>();
  const visited = new Set<string>();
  for (const [key, entry] of directional) {
    if (visited.has(key)) continue;
    const reverseKey = `${entry.recipientUserId}:${entry.payerUserId}`;
    const reverse = directional.get(reverseKey);
    visited.add(key); visited.add(reverseKey);
    const difference = entry.amountCents - (reverse?.amountCents ?? 0);
    if (difference > 0) outstanding.set(key, { ...entry, amountCents: difference });
    else if (difference < 0) outstanding.set(reverseKey, { payerUserId: entry.recipientUserId, recipientUserId: entry.payerUserId, amountCents: -difference });
  }
  const userIds = [...new Set([...outstanding.values()].flatMap((item) => [item.payerUserId, item.recipientUserId]))];
  const names = userIds.length ? await db.select({ id: users.id, displayName: users.displayName }).from(users).where(inArray(users.id, userIds)) : [];
  const nameMap = new Map(names.map((item) => [item.id, item.displayName]));
  return {
    bills: billRows,
    balances: [...outstanding.values()].filter((item) => item.amountCents > 0).map((item) => ({ ...item, payerName: nameMap.get(item.payerUserId), recipientName: nameMap.get(item.recipientUserId) })),
    payments: paymentRows,
  };
}

export async function outstandingForPair(householdId: string, payerUserId: string, recipientUserId: string) {
  const snapshot = await householdSnapshot(householdId);
  return snapshot.balances.find((item) => item.payerUserId === payerUserId && item.recipientUserId === recipientUserId)?.amountCents ?? 0;
}

export async function outstandingForBillPair(householdId: string, billId: string, payerUserId: string, recipientUserId: string) {
  const db = getDb();
  const [owed] = await db.select({ amount: sql<number>`coalesce(sum(${obligations.originalAmountCents}), 0)` }).from(obligations).where(and(eq(obligations.householdId, householdId), eq(obligations.billId, billId), eq(obligations.debtorUserId, payerUserId), eq(obligations.creditorUserId, recipientUserId), eq(obligations.active, true)));
  const [paid] = await db.select({ amount: sql<number>`coalesce(sum(${payments.amountCents}), 0)` }).from(payments).where(and(eq(payments.householdId, householdId), eq(payments.billId, billId), eq(payments.payerUserId, payerUserId), eq(payments.recipientUserId, recipientUserId)));
  return Math.max(0, Number(owed?.amount ?? 0) - Number(paid?.amount ?? 0));
}
