-- ============================================================================
-- FinTrack 2.0 - Phase 5A: Dedicated Read-Only Analytics Database Provisioning
-- ============================================================================
-- Security Purpose:
--   Enforce least-privilege, SELECT-only access for the FinTrack analytics engine.
--   Prevents any INSERT, UPDATE, DELETE, ALTER, DROP, TRUNCATE, or schema mutation.
--   Explicitly isolates the analytics identity from sensitive tables:
--     - Excludes `detected_transactions` (unconfirmed SMS candidate records)
--     - Excludes `users` (credentials, password hashes)
-- ============================================================================

-- Step 1: Create dedicated analytics user (Replace 'CHANGE_TO_STRONG_PASSWORD' in production)
CREATE USER IF NOT EXISTS 'fintrack_analytics'@'%' IDENTIFIED BY 'CHANGE_TO_STRONG_PASSWORD';

-- Step 2: Ensure zero default privileges or grant options
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'fintrack_analytics'@'%';

-- Step 3: Grant SELECT-only privileges on approved persisted tables
GRANT SELECT ON personal_finance.transactions TO 'fintrack_analytics'@'%';
GRANT SELECT ON personal_finance.categories TO 'fintrack_analytics'@'%';
GRANT SELECT ON personal_finance.budgets TO 'fintrack_analytics'@'%';
GRANT SELECT ON personal_finance.accounts TO 'fintrack_analytics'@'%';

-- Step 4: Flush privileges to activate configuration
FLUSH PRIVILEGES;

-- ============================================================================
-- Verification Queries (Run as 'fintrack_analytics' to verify least privilege)
-- ============================================================================

-- A. Should SUCCEED (Read approved transactions):
-- SELECT id, amount, type FROM personal_finance.transactions LIMIT 1;

-- B. Should FAIL with ERROR 1142 (42000): SELECT command denied for 'detected_transactions'
-- SELECT * FROM personal_finance.detected_transactions LIMIT 1;

-- C. Should FAIL with ERROR 1142 (42000): SELECT command denied for 'users'
-- SELECT * FROM personal_finance.users LIMIT 1;

-- D. Should FAIL with ERROR 1142 (42000): INSERT command denied for 'transactions'
-- INSERT INTO personal_finance.transactions (user_id, amount) VALUES (1, 100);

-- E. Should FAIL with ERROR 1142 (42000): UPDATE command denied for 'transactions'
-- UPDATE personal_finance.transactions SET amount = 0 WHERE id = 1;

-- F. Should FAIL with ERROR 1142 (42000): DROP command denied
-- DROP TABLE personal_finance.transactions;
