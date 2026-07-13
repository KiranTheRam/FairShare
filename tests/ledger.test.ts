import assert from "node:assert/strict";
import test from "node:test";
import { calculateTransfers, LedgerCalculationError } from "../lib/ledger-calculation";

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
