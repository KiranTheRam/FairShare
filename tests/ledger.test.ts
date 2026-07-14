import assert from "node:assert/strict";
import test from "node:test";
import { areObligationsSettled, calculateTransfers, LedgerCalculationError, simplifyBalances } from "../lib/ledger-calculation";

test("calculates a deterministic equal split with multiple external payers", () => {
  const transfers = calculateTransfers({
    amountCents: 240_000,
    allocationMethod: "equal",
    contributions: [{ userId: "kiran", amountCents: 200_000 }, { userId: "jordan", amountCents: 40_000 }],
    allocations: ["alex", "kiran", "sam", "jordan"].map((userId) => ({ userId, amountCents: 60_000 })),
  });
  assert.deepEqual(transfers, [
    { debtorUserId: "alex", creditorUserId: "kiran", amountCents: 60_000 },
    { debtorUserId: "sam", creditorUserId: "kiran", amountCents: 60_000 },
    { debtorUserId: "jordan", creditorUserId: "kiran", amountCents: 20_000 },
  ]);
});

test("rejects a bill when contributions do not match the bill total", () => {
  assert.throws(() => calculateTransfers({ amountCents: 10_000, allocationMethod: "fixed", contributions: [{ userId: "a", amountCents: 9_999 }], allocations: [{ userId: "b", amountCents: 10_000 }] }), (error: unknown) => error instanceof LedgerCalculationError && error.code === "invalid_contributions");
});

test("requires percentage allocations to total exactly 100 percent", () => {
  assert.throws(() => calculateTransfers({ amountCents: 10_000, allocationMethod: "percentage", contributions: [{ userId: "a", amountCents: 10_000 }], allocations: [{ userId: "a", amountCents: 5_000, percentageBasisPoints: 5_000 }, { userId: "b", amountCents: 5_000, percentageBasisPoints: 4_999 }] }), (error: unknown) => error instanceof LedgerCalculationError && error.code === "invalid_percentage");
});

test("simplifies a debt chain into fewer transfers while preserving every net position", () => {
  // alex owes kiran 30, kiran owes sam 30: simplification routes alex directly to sam.
  const transfers = simplifyBalances([
    { payerUserId: "alex", recipientUserId: "kiran", amountCents: 3_000 },
    { payerUserId: "kiran", recipientUserId: "sam", amountCents: 3_000 },
  ]);
  assert.deepEqual(transfers, [{ debtorUserId: "alex", creditorUserId: "sam", amountCents: 3_000 }]);
});

test("simplification preserves exact net positions with uneven amounts", () => {
  const balances = [
    { payerUserId: "alex", recipientUserId: "kiran", amountCents: 5_500 },
    { payerUserId: "sam", recipientUserId: "alex", amountCents: 2_000 },
    { payerUserId: "sam", recipientUserId: "kiran", amountCents: 1_500 },
  ];
  const transfers = simplifyBalances(balances);
  const net = new Map<string, number>();
  for (const item of balances) {
    net.set(item.payerUserId, (net.get(item.payerUserId) ?? 0) - item.amountCents);
    net.set(item.recipientUserId, (net.get(item.recipientUserId) ?? 0) + item.amountCents);
  }
  const simplifiedNet = new Map<string, number>();
  for (const item of transfers) {
    simplifiedNet.set(item.debtorUserId, (simplifiedNet.get(item.debtorUserId) ?? 0) - item.amountCents);
    simplifiedNet.set(item.creditorUserId, (simplifiedNet.get(item.creditorUserId) ?? 0) + item.amountCents);
  }
  for (const [userId, amount] of net) assert.equal(simplifiedNet.get(userId) ?? 0, amount);
  assert.ok(transfers.length <= balances.length);
});

test("simplification of settled or empty balances produces no transfers", () => {
  assert.deepEqual(simplifyBalances([]), []);
  assert.deepEqual(simplifyBalances([{ payerUserId: "a", recipientUserId: "b", amountCents: 0 }]), []);
});

test("settles a multi-person bill only after every obligation is fully paid", () => {
  const obligations = [
    { debtorUserId: "alex", creditorUserId: "kiran", amountCents: 4_000 },
    { debtorUserId: "sam", creditorUserId: "kiran", amountCents: 4_000 },
  ];
  assert.equal(areObligationsSettled(obligations, [
    { payerUserId: "alex", recipientUserId: "kiran", amountCents: 4_000 },
    { payerUserId: "sam", recipientUserId: "kiran", amountCents: 2_000 },
  ]), false);
  assert.equal(areObligationsSettled(obligations, [
    { payerUserId: "alex", recipientUserId: "kiran", amountCents: 4_000 },
    { payerUserId: "sam", recipientUserId: "kiran", amountCents: 1_500 },
    { payerUserId: "sam", recipientUserId: "kiran", amountCents: 2_500 },
  ]), true);
});
