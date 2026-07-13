DROP INDEX "bills_recurring_idx";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "theme_preference" text DEFAULT 'dark' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "bills_recurring_period_unique" ON "bills" USING btree ("recurring_template_id","period_label");