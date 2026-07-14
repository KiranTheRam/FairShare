export type LedgerInput = {
  amountCents: number;
  allocationMethod: "equal" | "percentage" | "fixed";
  contributions: Array<{ userId: string; amountCents: number }>;
  allocations: Array<{ userId: string; amountCents: number; percentageBasisPoints?: number }>;
};

export type Transfer = { debtorUserId: string; creditorUserId: string; amountCents: number };
export type SettlementObligation = { debtorUserId: string; creditorUserId: string; amountCents: number };
export type SettlementPayment = { payerUserId: string; recipientUserId: string; amountCents: number };

export class LedgerCalculationError extends Error {
  constructor(message: string, public code: string) { super(message); }
}

export function calculateTransfers(input: LedgerInput): Transfer[] {
  const contributionTotal = input.contributions.reduce((sum, item) => sum + item.amountCents, 0);
  const allocationTotal = input.allocations.reduce((sum, item) => sum + item.amountCents, 0);
  if (contributionTotal !== input.amountCents) throw new LedgerCalculationError("Contributions must equal the bill amount", "invalid_contributions");
  if (allocationTotal !== input.amountCents) throw new LedgerCalculationError("Allocations must equal the bill amount", "invalid_allocations");
  if (new Set(input.contributions.map((item) => item.userId)).size !== input.contributions.length) throw new LedgerCalculationError("Each payer may appear only once", "duplicate_payer");
  if (new Set(input.allocations.map((item) => item.userId)).size !== input.allocations.length) throw new LedgerCalculationError("Each member may appear only once", "duplicate_allocation");
  if (input.allocationMethod === "percentage" && input.allocations.reduce((sum, item) => sum + (item.percentageBasisPoints ?? 0), 0) !== 10_000) throw new LedgerCalculationError("Percentage allocations must total 100%", "invalid_percentage");

  const net = new Map<string, number>();
  for (const item of input.contributions) net.set(item.userId, (net.get(item.userId) ?? 0) + item.amountCents);
  for (const item of input.allocations) net.set(item.userId, (net.get(item.userId) ?? 0) - item.amountCents);
  const creditors = [...net].filter(([, amount]) => amount > 0).map(([userId, amount]) => ({ userId, amount })).sort((a, b) => b.amount - a.amount);
  const debtors = [...net].filter(([, amount]) => amount < 0).map(([userId, amount]) => ({ userId, amount: -amount })).sort((a, b) => b.amount - a.amount);
  const transfers: Transfer[] = [];
  let creditorIndex = 0;
  let debtorIndex = 0;
  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];
    const amountCents = Math.min(creditor.amount, debtor.amount);
    if (amountCents > 0) transfers.push({ debtorUserId: debtor.userId, creditorUserId: creditor.userId, amountCents });
    creditor.amount -= amountCents;
    debtor.amount -= amountCents;
    if (creditor.amount === 0) creditorIndex += 1;
    if (debtor.amount === 0) debtorIndex += 1;
  }
  return transfers;
}

export function areObligationsSettled(obligations: SettlementObligation[], payments: SettlementPayment[]) {
  return obligations.every((obligation) => payments
    .filter((payment) => payment.payerUserId === obligation.debtorUserId && payment.recipientUserId === obligation.creditorUserId)
    .reduce((sum, payment) => sum + payment.amountCents, 0) >= obligation.amountCents);
}
