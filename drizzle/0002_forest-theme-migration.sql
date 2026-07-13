-- Preserve the original green appearance for existing accounts. New accounts
-- continue to receive the neutral `dark` default from the users table schema.
UPDATE "users" SET "theme_preference" = 'forest' WHERE "theme_preference" = 'dark';
