-- FINTRACK Phase 3B: Smart Transactions & User-Scoped SMS Duplicate Prevention
-- Migration 0005: Additive schema for detected transaction review workflow and user-scoped sms_hash uniqueness

-- 1. Scope transactions.sms_hash uniqueness to (user_id, sms_hash) if not already scoped
SET @global_key_count = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'transactions'
    AND INDEX_NAME = 'uq_transaction_sms_hash'
    AND SEQ_IN_INDEX = 1
    AND COLUMN_NAME = 'sms_hash'
);

SET @sql_scope_sms_hash = IF(@global_key_count > 0,
  'ALTER TABLE transactions
     DROP INDEX uq_transaction_sms_hash,
     ADD UNIQUE KEY uq_transaction_sms_hash (user_id, sms_hash)',
  'SELECT 1'
);

PREPARE stmt_sms FROM @sql_scope_sms_hash;
EXECUTE stmt_sms;
DEALLOCATE PREPARE stmt_sms;

-- 2. Detected transactions table for smart parsing, auto-categorization, account matching, and review workflow
CREATE TABLE IF NOT EXISTS detected_transactions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  account_id INT UNSIGNED NULL,
  category_id INT UNSIGNED NULL,
  classification ENUM('expense', 'income', 'transfer', 'refund', 'credit_card_purchase', 'credit_card_repayment') NOT NULL DEFAULT 'expense',
  amount DECIMAL(15,2) NOT NULL,
  transaction_date DATE NOT NULL,
  merchant_raw VARCHAR(255) NULL,
  merchant_clean VARCHAR(150) NOT NULL,
  bank VARCHAR(50) NULL,
  sender VARCHAR(50) NULL,
  reference_number VARCHAR(100) NULL,
  masked_account_hint VARCHAR(20) NULL,
  sms_hash VARCHAR(64) NOT NULL,
  confidence DECIMAL(3,2) NOT NULL DEFAULT 0.50,
  confidence_reason VARCHAR(255) NULL,
  suggested_account_id INT UNSIGNED NULL,
  suggested_category_id INT UNSIGNED NULL,
  is_account_ambiguous TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('detected', 'suggested', 'confirmed', 'rejected') NOT NULL DEFAULT 'suggested',
  rejection_reason VARCHAR(255) NULL,
  confirmed_transaction_id INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_detected_user_sms_hash (user_id, sms_hash),
  KEY idx_detected_user_status (user_id, status, transaction_date, id),
  KEY idx_detected_user_ref (user_id, reference_number),
  KEY fk_detected_account (account_id),
  KEY fk_detected_category (category_id),
  KEY fk_detected_confirmed_tx (confirmed_transaction_id),
  CONSTRAINT fk_detected_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_detected_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL,
  CONSTRAINT fk_detected_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  CONSTRAINT fk_detected_confirmed_tx FOREIGN KEY (confirmed_transaction_id) REFERENCES transactions(id) ON DELETE SET NULL,
  CONSTRAINT chk_detected_amount_positive CHECK (amount > 0),
  CONSTRAINT chk_detected_confidence CHECK (confidence >= 0.00 AND confidence <= 1.00)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 3. Record migration in tracking table
INSERT IGNORE INTO schema_migrations (version, description)
VALUES ('0005', 'Phase 3B smart transactions and user-scoped SMS hash');
