-- FINTRACK Phase 3A.4: Credit Card Billing Configuration and Repayments
-- Review before applying outside a fresh local development environment.

SET @stmt_col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'accounts'
    AND COLUMN_NAME = 'statement_closing_day'
);

SET @sql_stmt = IF(@stmt_col_exists = 0,
  'ALTER TABLE accounts
     ADD COLUMN statement_closing_day TINYINT UNSIGNED NULL AFTER credit_limit_minor',
  'SELECT 1'
);

PREPARE stmt1 FROM @sql_stmt;
EXECUTE stmt1;
DEALLOCATE PREPARE stmt1;

SET @due_col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'accounts'
    AND COLUMN_NAME = 'payment_due_day'
);

SET @sql_due = IF(@due_col_exists = 0,
  'ALTER TABLE accounts
     ADD COLUMN payment_due_day TINYINT UNSIGNED NULL AFTER statement_closing_day',
  'SELECT 1'
);

PREPARE stmt2 FROM @sql_due;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

SET @chk_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'accounts'
    AND CONSTRAINT_NAME = 'chk_accounts_billing_days'
);

SET @sql_chk = IF(@chk_exists = 0,
  'ALTER TABLE accounts
     ADD CONSTRAINT chk_accounts_billing_days CHECK (
       (type = ''credit_card'' AND (statement_closing_day IS NULL OR (statement_closing_day BETWEEN 1 AND 31))
                               AND (payment_due_day IS NULL OR (payment_due_day BETWEEN 1 AND 31)))
       OR
       (type <> ''credit_card'' AND statement_closing_day IS NULL AND payment_due_day IS NULL)
     )',
  'SELECT 1'
);

PREPARE stmt3 FROM @sql_chk;
EXECUTE stmt3;
DEALLOCATE PREPARE stmt3;

INSERT IGNORE INTO schema_migrations (version, description)
VALUES ('0004', 'Phase 3A.4 credit card billing and repayment configuration');
