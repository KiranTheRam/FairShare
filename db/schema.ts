import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
};

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  role: text("role", { enum: ["member", "administrator"] }).notNull().default("member"),
  status: text("status", { enum: ["active", "disabled"] }).notNull().default("active"),
  ...timestamps,
});

export const households = sqliteTable("households", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  currency: text("currency").notNull().default("USD"),
  timezone: text("timezone").notNull().default("America/New_York"),
  ...timestamps,
});

export const householdMemberships = sqliteTable("household_memberships", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull().references(() => households.id),
  userId: text("user_id").notNull().references(() => users.id),
  joinedAt: text("joined_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("membership_household_user").on(table.householdId, table.userId)]);

export const recurringBillTemplates = sqliteTable("recurring_bill_templates", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull().references(() => households.id),
  name: text("name").notNull(),
  expectedAmount: real("expected_amount"),
  cadence: text("cadence", { enum: ["weekly", "monthly", "quarterly", "yearly"] }).notNull(),
  nextOccurrence: text("next_occurrence").notNull(),
  allocationMethod: text("allocation_method", { enum: ["equal", "percentage", "fixed"] }).notNull().default("equal"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
});

export const bills = sqliteTable("bills", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull().references(() => households.id),
  recurringTemplateId: text("recurring_template_id").references(() => recurringBillTemplates.id),
  name: text("name").notNull(),
  amount: real("amount").notNull(),
  periodLabel: text("period_label").notNull(),
  dueDate: text("due_date"),
  status: text("status", { enum: ["draft", "open", "settled", "void"] }).notNull().default("open"),
  amountState: text("amount_state", { enum: ["estimated", "final"] }).notNull().default("final"),
  allocationMethod: text("allocation_method", { enum: ["equal", "percentage", "fixed"] }).notNull(),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id),
  deletedAt: text("deleted_at"),
  ...timestamps,
});

export const billContributions = sqliteTable("bill_contributions", {
  id: text("id").primaryKey(),
  billId: text("bill_id").notNull().references(() => bills.id),
  payerUserId: text("payer_user_id").notNull().references(() => users.id),
  amount: real("amount").notNull(),
  paidAt: text("paid_at").notNull(),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id),
  ...timestamps,
});

export const billAllocations = sqliteTable("bill_allocations", {
  id: text("id").primaryKey(),
  billId: text("bill_id").notNull().references(() => bills.id),
  memberUserId: text("member_user_id").notNull().references(() => users.id),
  percentage: real("percentage"),
  amount: real("amount").notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("allocation_bill_member").on(table.billId, table.memberUserId)]);

export const obligations = sqliteTable("obligations", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull().references(() => households.id),
  billId: text("bill_id").notNull().references(() => bills.id),
  debtorUserId: text("debtor_user_id").notNull().references(() => users.id),
  creditorUserId: text("creditor_user_id").notNull().references(() => users.id),
  originalAmount: real("original_amount").notNull(),
  ...timestamps,
});

export const payments = sqliteTable("payments", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull().references(() => households.id),
  obligationId: text("obligation_id").references(() => obligations.id),
  payerUserId: text("payer_user_id").notNull().references(() => users.id),
  recipientUserId: text("recipient_user_id").notNull().references(() => users.id),
  amount: real("amount").notNull(),
  note: text("note"),
  paidAt: text("paid_at").notNull(),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id),
  ...timestamps,
});

export const billChangeHistory = sqliteTable("bill_change_history", {
  id: text("id").primaryKey(),
  billId: text("bill_id").notNull().references(() => bills.id),
  changedByUserId: text("changed_by_user_id").notNull().references(() => users.id),
  fieldName: text("field_name").notNull(),
  beforeValue: text("before_value"),
  afterValue: text("after_value"),
  changedAt: text("changed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull().references(() => households.id),
  userId: text("user_id").notNull().references(() => users.id),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  targetPath: text("target_path"),
  readAt: text("read_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
