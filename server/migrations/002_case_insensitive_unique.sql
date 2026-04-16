-- Migration: Enforce case-insensitive uniqueness for emails and domains
-- Problem: UNIQUE on VARCHAR is case-sensitive in Postgres, but the application
-- treats emails/domains as case-insensitive. This allows duplicate logical
-- identities like 'User@kookmin.ac.kr' and 'user@kookmin.ac.kr'.
-- Solution: Replace plain UNIQUE constraints with functional unique indexes
-- using LOWER(), and normalize existing data to lowercase.

-- Step 1: Normalize existing data to lowercase
UPDATE "user" SET email = LOWER(email), school_domain = LOWER(school_domain);
UPDATE allowed_domain SET domain = LOWER(domain);

-- Step 2: Drop existing case-sensitive unique constraints
ALTER TABLE "user" DROP CONSTRAINT IF EXISTS user_email_key;
ALTER TABLE allowed_domain DROP CONSTRAINT IF EXISTS allowed_domain_domain_key;

-- Step 3: Drop the old case-sensitive index on user.email
DROP INDEX IF EXISTS idx_user_email;

-- Step 4: Create case-insensitive unique indexes
CREATE UNIQUE INDEX idx_user_email_unique_lower ON "user" (LOWER(email));
CREATE UNIQUE INDEX idx_allowed_domain_unique_lower ON allowed_domain (LOWER(domain));
