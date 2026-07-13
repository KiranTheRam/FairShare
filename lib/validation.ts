import { z } from "zod";

const email = z.string().trim().email().max(254);
const password = z.string().min(12).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/);
const uuid = z.string().uuid();
const money = z.number().int().min(0).max(100_000_000_000);

export const bootstrapSchema = z.object({ setupToken: z.string().min(16), email, displayName: z.string().trim().min(2).max(100), password });
export const loginSchema = z.object({ email, password: z.string().min(1).max(128) });
export const userCreateSchema = z.object({ email, displayName: z.string().trim().min(2).max(100), password, role: z.enum(["member", "administrator"]).default("member") });
export const userUpdateSchema = z.object({ id: uuid, displayName: z.string().trim().min(2).max(100).optional(), status: z.enum(["active", "disabled"]).optional(), password: password.optional() });
export const householdCreateSchema = z.object({ name: z.string().trim().min(2).max(120), currency: z.string().length(3).default("USD"), timezone: z.string().trim().min(1).max(80).default("UTC"), memberIds: z.array(uuid).max(100).default([]) });
export const householdUpdateSchema = z.object({ name: z.string().trim().min(2).max(120).optional(), currency: z.string().length(3).optional(), timezone: z.string().trim().min(1).max(80).optional(), disabled: z.boolean().optional(), memberIds: z.array(uuid).max(100).optional() });
export const contributionSchema = z.object({ userId: uuid, amountCents: money });
export const allocationSchema = z.object({ userId: uuid, amountCents: money, percentageBasisPoints: z.number().int().min(0).max(10_000).optional() });
export const billSchema = z.object({
  name: z.string().trim().min(2).max(160),
  amountCents: money.positive(),
  periodLabel: z.string().trim().min(1).max(120),
  dueDate: z.string().datetime().nullable().optional(),
  amountState: z.enum(["estimated", "final"]),
  allocationMethod: z.enum(["equal", "percentage", "fixed"]),
  contributions: z.array(contributionSchema).min(1).max(100),
  allocations: z.array(allocationSchema).min(1).max(100),
  recurringTemplateId: uuid.nullable().optional(),
});
export const billUpdateSchema = billSchema.extend({ revision: z.number().int().positive() });
export const paymentSchema = z.object({ billId: uuid.nullable().optional(), payerUserId: uuid, recipientUserId: uuid, amountCents: money.positive(), note: z.string().trim().max(500).optional(), paidAt: z.string().datetime().optional() }).refine((v) => v.payerUserId !== v.recipientUserId, "Payer and recipient must differ");
export const recurringSchema = z.object({ name: z.string().trim().min(2).max(160), expectedAmountCents: money.nullable(), cadence: z.enum(["weekly", "monthly", "quarterly", "yearly"]), nextOccurrence: z.string().datetime(), allocationMethod: z.enum(["equal", "percentage", "fixed"]), contributions: z.array(contributionSchema).min(1), allocations: z.array(allocationSchema).min(1), active: z.boolean().optional() }).superRefine((value, context) => {
  const amount = value.expectedAmountCents ?? value.allocations.reduce((sum, item) => sum + item.amountCents, 0);
  if (value.contributions.reduce((sum, item) => sum + item.amountCents, 0) !== amount) context.addIssue({ code: "custom", message: "Recurring contributions must equal the expected amount" });
  if (value.allocations.reduce((sum, item) => sum + item.amountCents, 0) !== amount) context.addIssue({ code: "custom", message: "Recurring allocations must equal the expected amount" });
});
export const notificationPreferenceSchema = z.object({ billsEnabled: z.boolean(), paymentsEnabled: z.boolean(), balanceChangesEnabled: z.boolean() });
export const pushSubscriptionSchema = z.object({ endpoint: z.string().url().max(2048), keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }) });
export const userSettingsSchema = z.object({ displayName: z.string().trim().min(2).max(100).optional(), themePreference: z.enum(["dark", "light"]).optional() });
export const passwordChangeSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: password });
