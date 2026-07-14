export const BILL_CATEGORIES = ["housing", "utilities", "groceries", "dining", "transport", "subscriptions", "household", "other"] as const;
export type BillCategory = (typeof BILL_CATEGORIES)[number];
export const CATEGORY_LABELS: Record<BillCategory, string> = {
  housing: "Housing & rent",
  utilities: "Utilities",
  groceries: "Groceries",
  dining: "Dining & takeout",
  transport: "Transport",
  subscriptions: "Subscriptions",
  household: "Household & supplies",
  other: "Other",
};
