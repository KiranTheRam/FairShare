import { relations, sql } from "drizzle-orm";
import { bigint, boolean, customType, index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { BillCategory } from "@/lib/categories";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType() { return "bytea"; } });

export const userRole = pgEnum("user_role", ["member", "administrator"]);
export const userStatus = pgEnum("user_status", ["active", "disabled"]);
export const billStatus = pgEnum("bill_status", ["draft", "open", "settled", "void"]);
export const amountState = pgEnum("amount_state", ["estimated", "final"]);
export const allocationMethod = pgEnum("allocation_method", ["equal", "percentage", "fixed"]);
export const recurrenceCadence = pgEnum("recurrence_cadence", ["weekly", "monthly", "quarterly", "yearly"]);

const createdUpdated = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  themePreference: text("theme_preference").notNull().default("dark"),
  role: userRole("role").notNull().default("member"),
  status: userStatus("status").notNull().default("active"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  ...createdUpdated,
}, (table) => [uniqueIndex("users_email_lower_unique").on(table.email)]);

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  csrfToken: text("csrf_token").notNull(),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("sessions_user_idx").on(table.userId), index("sessions_expiry_idx").on(table.expiresAt)]);

export const households = pgTable("households", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  currency: text("currency").notNull().default("USD"),
  timezone: text("timezone").notNull().default("UTC"),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  ...createdUpdated,
});

export const householdMemberships = pgTable("household_memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("membership_household_user_unique").on(table.householdId, table.userId), index("membership_user_idx").on(table.userId)]);

export type RecurringTemplateConfig = {
  contributions: Array<{ userId: string; amountCents: number }>;
  allocations: Array<{ userId: string; amountCents: number; percentageBasisPoints?: number }>;
};

export const recurringBillTemplates = pgTable("recurring_bill_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  category: text("category").$type<BillCategory>().notNull().default("other"),
  expectedAmountCents: bigint("expected_amount_cents", { mode: "number" }),
  cadence: recurrenceCadence("cadence").notNull(),
  nextOccurrence: timestamp("next_occurrence", { withTimezone: true }).notNull(),
  allocationMethod: allocationMethod("allocation_method").notNull().default("equal"),
  templateConfig: jsonb("template_config").$type<RecurringTemplateConfig>().notNull(),
  active: boolean("active").notNull().default(true),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  ...createdUpdated,
}, (table) => [index("recurring_due_idx").on(table.active, table.nextOccurrence)]);

export const bills = pgTable("bills", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  recurringTemplateId: uuid("recurring_template_id").references(() => recurringBillTemplates.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  category: text("category").$type<BillCategory>().notNull().default("other"),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  periodLabel: text("period_label").notNull(),
  dueDate: timestamp("due_date", { withTimezone: true }),
  status: billStatus("status").notNull().default("open"),
  amountState: amountState("amount_state").notNull().default("final"),
  allocationMethod: allocationMethod("allocation_method").notNull(),
  revision: bigint("revision", { mode: "number" }).notNull().default(1),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  ...createdUpdated,
}, (table) => [index("bills_household_date_idx").on(table.householdId, table.createdAt), uniqueIndex("bills_recurring_period_unique").on(table.recurringTemplateId, table.periodLabel)]);

export const billContributions = pgTable("bill_contributions", {
  id: uuid("id").primaryKey().defaultRandom(),
  billId: uuid("bill_id").notNull().references(() => bills.id, { onDelete: "cascade" }),
  payerUserId: uuid("payer_user_id").notNull().references(() => users.id),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  ...createdUpdated,
}, (table) => [index("contributions_bill_idx").on(table.billId)]);

export const billAllocations = pgTable("bill_allocations", {
  id: uuid("id").primaryKey().defaultRandom(),
  billId: uuid("bill_id").notNull().references(() => bills.id, { onDelete: "cascade" }),
  memberUserId: uuid("member_user_id").notNull().references(() => users.id),
  percentageBasisPoints: bigint("percentage_basis_points", { mode: "number" }),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  ...createdUpdated,
}, (table) => [uniqueIndex("allocation_bill_member_unique").on(table.billId, table.memberUserId)]);

export const obligations = pgTable("obligations", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  billId: uuid("bill_id").notNull().references(() => bills.id, { onDelete: "cascade" }),
  debtorUserId: uuid("debtor_user_id").notNull().references(() => users.id),
  creditorUserId: uuid("creditor_user_id").notNull().references(() => users.id),
  originalAmountCents: bigint("original_amount_cents", { mode: "number" }).notNull(),
  revision: bigint("revision", { mode: "number" }).notNull(),
  active: boolean("active").notNull().default(true),
  ...createdUpdated,
}, (table) => [index("obligations_household_pair_idx").on(table.householdId, table.debtorUserId, table.creditorUserId), index("obligations_bill_idx").on(table.billId)]);

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  idempotencyKey: uuid("idempotency_key"),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  billId: uuid("bill_id").references(() => bills.id, { onDelete: "set null" }),
  payerUserId: uuid("payer_user_id").notNull().references(() => users.id),
  recipientUserId: uuid("recipient_user_id").notNull().references(() => users.id),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  note: text("note"),
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  ...createdUpdated,
}, (table) => [uniqueIndex("payments_idempotency_key_unique").on(table.idempotencyKey), index("payments_household_date_idx").on(table.householdId, table.paidAt), index("payments_bill_idx").on(table.billId)]);

export const paymentClaims = pgTable("payment_claims", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  debtorUserId: uuid("debtor_user_id").notNull().references(() => users.id),
  creditorUserId: uuid("creditor_user_id").notNull().references(() => users.id),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  note: text("note"),
  status: text("status", { enum: ["pending", "cancelled", "dismissed", "confirmed"] }).notNull().default("pending"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  ...createdUpdated,
}, (table) => [index("payment_claims_household_idx").on(table.householdId), uniqueIndex("payment_claims_pending_pair_unique").on(table.householdId, table.debtorUserId, table.creditorUserId).where(sql`${table.status} = 'pending'`)]);

export const billAttachments = pgTable("bill_attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  billId: uuid("bill_id").notNull().references(() => bills.id, { onDelete: "cascade" }),
  uploadedByUserId: uuid("uploaded_by_user_id").notNull().references(() => users.id),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  data: bytea("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("attachments_bill_idx").on(table.billId)]);

export const billComments = pgTable("bill_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  billId: uuid("bill_id").notNull().references(() => bills.id, { onDelete: "cascade" }),
  authorUserId: uuid("author_user_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("comments_bill_date_idx").on(table.billId, table.createdAt)]);

export const householdInvites = pgTable("household_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedByUserId: uuid("used_by_user_id").references(() => users.id),
  usedAt: timestamp("used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("invites_household_idx").on(table.householdId)]);

export const billChangeHistory = pgTable("bill_change_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  billId: uuid("bill_id").notNull().references(() => bills.id, { onDelete: "cascade" }),
  changedByUserId: uuid("changed_by_user_id").notNull().references(() => users.id),
  changeType: text("change_type").notNull(),
  beforeValue: jsonb("before_value"),
  afterValue: jsonb("after_value"),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("history_bill_date_idx").on(table.billId, table.changedAt)]);

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  targetPath: text("target_path"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("notifications_user_date_idx").on(table.userId, table.createdAt)]);

export const notificationPreferences = pgTable("notification_preferences", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  billsEnabled: boolean("bills_enabled").notNull().default(true),
  paymentsEnabled: boolean("payments_enabled").notNull().default(true),
  balanceChangesEnabled: boolean("balance_changes_enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  householdId: uuid("household_id").references(() => households.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  metadata: jsonb("metadata"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("audit_household_date_idx").on(table.householdId, table.createdAt), index("audit_actor_date_idx").on(table.actorUserId, table.createdAt)]);

export const loginAttempts = pgTable("login_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  ipAddress: text("ip_address").notNull(),
  successful: boolean("successful").notNull(),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("login_attempt_window_idx").on(table.email, table.ipAddress, table.attemptedAt)]);

export const usersRelations = relations(users, ({ many }) => ({ memberships: many(householdMemberships), sessions: many(sessions) }));
export const householdsRelations = relations(households, ({ many }) => ({ memberships: many(householdMemberships), bills: many(bills) }));
export const billsRelations = relations(bills, ({ many }) => ({ contributions: many(billContributions), allocations: many(billAllocations), obligations: many(obligations), payments: many(payments) }));
