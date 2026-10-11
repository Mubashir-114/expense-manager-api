-- FINTRACK Phase 3A.1: additive account foundation
-- Review before applying outside a fresh local development environment.

CREATE TABLE accounts (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  type ENUM('bank', 'cash', 'wallet', 'credit_card') NOT NULL,
  subtype ENUM('savings', 'current', 'salary', 'cash', 'stored_value', 'credit_card') NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  institution_name VARCHAR(100) NULL,
  masked_last4 CHAR(4) NULL,
  currency_code CHAR(3) NOT NULL DEFAULT 'INR',
  opening_amount_minor BIGINT NOT NULL DEFAULT 0,
  credit_limit_minor BIGINT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  status ENUM('active', 'archived') NOT NULL DEFAULT 'active',
  client_creation_key VARCHAR(100) NOT NULL,
  creation_fingerprint CHAR(64) NOT NULL,
  active_default_asset_user_id INT UNSIGNED
    GENERATED ALWAYS AS (
      CASE
        WHEN status = 'active' AND is_default = TRUE AND type <> 'credit_card'
          THEN user_id
        ELSE NULL
      END
    ) STORED,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_accounts_user_creation_key (user_id, client_creation_key),
  UNIQUE KEY uq_accounts_active_default_asset (active_default_asset_user_id),
  KEY idx_accounts_user_status_created (user_id, status, created_at, id),
  KEY idx_accounts_user_type_status (user_id, type, status),
  CONSTRAINT fk_accounts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT chk_accounts_type_subtype CHECK (
    (type = 'bank' AND subtype IN ('savings', 'current', 'salary')) OR
    (type = 'cash' AND subtype = 'cash') OR
    (type = 'wallet' AND subtype = 'stored_value') OR
    (type = 'credit_card' AND subtype = 'credit_card')
  ),
  CONSTRAINT chk_accounts_currency CHECK (currency_code = 'INR'),
  CONSTRAINT chk_accounts_masked_last4 CHECK (
    masked_last4 IS NULL OR masked_last4 REGEXP '^[0-9]{4}$'
  ),
  CONSTRAINT chk_accounts_cash_metadata CHECK (
    type <> 'cash' OR (institution_name IS NULL AND masked_last4 IS NULL)
  ),
  CONSTRAINT chk_accounts_institution CHECK (
    type NOT IN ('bank', 'credit_card') OR institution_name IS NOT NULL
  ),
  CONSTRAINT chk_accounts_opening_amount CHECK (
    (type = 'bank' AND subtype = 'current') OR opening_amount_minor >= 0
  ),
  CONSTRAINT chk_accounts_credit_fields CHECK (
    (type = 'credit_card' AND credit_limit_minor IS NOT NULL
      AND credit_limit_minor > 0 AND opening_amount_minor >= 0 AND is_default = FALSE)
    OR
    (type <> 'credit_card' AND credit_limit_minor IS NULL)
  )
) ENGINE=InnoDB;

INSERT IGNORE INTO schema_migrations (version, description)
VALUES ('0002', 'Phase 3A.1 account foundation');
