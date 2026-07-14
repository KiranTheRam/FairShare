-- Bills created before explicit settlement tracking remained `open` even when
-- every active per-person obligation had already been paid in full.
UPDATE "bills" AS "bill"
SET "status" = 'settled', "updated_at" = NOW()
WHERE "bill"."status" = 'open'
  AND "bill"."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "obligations" AS "obligation"
    WHERE "obligation"."bill_id" = "bill"."id"
      AND "obligation"."active" = TRUE
      AND "obligation"."original_amount_cents" > COALESCE((
        SELECT SUM("payment"."amount_cents")
        FROM "payments" AS "payment"
        WHERE "payment"."bill_id" = "bill"."id"
          AND "payment"."payer_user_id" = "obligation"."debtor_user_id"
          AND "payment"."recipient_user_id" = "obligation"."creditor_user_id"
      ), 0)
  );
