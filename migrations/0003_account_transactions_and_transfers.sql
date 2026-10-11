-- FINTRACK Phase 3A.3: Account transaction association, atomic transfers, and auditable adjustments
-- Review before applying outside a fresh local development environment.

-- 1. Add account_id to transactions table if it does not already exist
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'transactions'
    AND COLUMN_NAME = 'account_id'
);

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE transactions
     ADD COLUMN account_id INT UNSIGNED NULL AFTER category_id,
     ADD CONSTRAINT fk_transactions_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
     ADD KEY idx_transactions_user_account (user_id, account_id, transaction_date)',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. Transfers table for atomic inter-account transfers
CREATE TABLE IF NOT EXISTS transfers (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  source_account_id INT UNSIGNED NOT NULL,
  destination_account_id INT UNSIGNED NOT NULL,
  amount_minor BIGINT NOT NULL,
  currency_code CHAR(3) NOT NULL DEFAULT 'INR',
  transfer_date DATE NOT NULL,
  note VARCHAR(1000) NULL,
  client_transfer_key VARCHAR(100) NOT NULL,
  transfer_fingerprint CHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_transfers_user_client_key (user_id, client_transfer_key),
  KEY idx_transfers_user_date (user_id, transfer_date, id),
  KEY idx_transfers_source (user_id, source_account_id, transfer_date),
  KEY idx_transfers_destination (user_id, destination_account_id, transfer_date),
  CONSTRAINT fk_transfers_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_transfers_source_account FOREIGN KEY (source_account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
  CONSTRAINT fk_transfers_dest_account FOREIGN KEY (destination_account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
  CONSTRAINT chk_transfers_distinct_accounts CHECK (source_account_id <> destination_account_id),
  CONSTRAINT chk_transfers_amount_positive CHECK (amount_minor > 0),
  CONSTRAINT chk_transfers_currency CHECK (currency_code = 'INR')
) ENGINE=InnoDB;

-- 3. Account balance adjustments table for auditable balance reconciliations
CREATE TABLE IF NOT EXISTS account_adjustments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  account_id INT UNSIGNED NOT NULL,
  amount_minor BIGINT NOT NULL,
  reason VARCHAR(255) NOT NULL,
  adjustment_date DATE NOT NULL,
  client_adjustment_key VARCHAR(100) NOT NULL,
  adjustment_fingerprint CHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_adjustments_user_client_key (user_id, client_adjustment_key),
  KEY idx_adjustments_account (user_id, account_id, adjustment_date, id),
  CONSTRAINT fk_adjustments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_adjustments_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
  CONSTRAINT chk_adjustments_amount_nonzero CHECK (amount_minor <> 0)
) ENGINE=InnoDB;

INSERT IGNORE INTO schema_migrations (version, description)
VALUES ('0003', 'Phase 3A.3 account transactions, transfers, and balance adjustments');
