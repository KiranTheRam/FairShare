CREATE TABLE "payment_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"debtor_user_id" uuid NOT NULL,
	"creditor_user_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"note" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_claims" ADD CONSTRAINT "payment_claims_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_claims" ADD CONSTRAINT "payment_claims_debtor_user_id_users_id_fk" FOREIGN KEY ("debtor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_claims" ADD CONSTRAINT "payment_claims_creditor_user_id_users_id_fk" FOREIGN KEY ("creditor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_claims_household_idx" ON "payment_claims" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_claims_pending_pair_unique" ON "payment_claims" USING btree ("household_id","debtor_user_id","creditor_user_id") WHERE "payment_claims"."status" = 'pending';