-- FINTRACK reconstructed development baseline
--
-- This is a fresh-development bootstrap reconstructed from the application
-- access paths at commit 7a91c362. It is not a copy of, or migration for, the
-- former Railway database. Apply only to a new, empty development database.

CREATE TABLE schema_migrations (
  version VARCHAR(100) NOT NULL PRIMARY KEY,
  description VARCHAR(255) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;

CREATE TABLE categories (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  type ENUM('income', 'expense') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_name_type (name, type)
) ENGINE=InnoDB;

CREATE TABLE transactions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  category_id INT UNSIGNED NOT NULL,
  type ENUM('income', 'expense') NOT NULL,
  title VARCHAR(150) NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  transaction_date DATE NOT NULL,
  note VARCHAR(1000) NULL,
  sms_hash VARCHAR(64) NULL,
  sender VARCHAR(50) NULL,
  bank VARCHAR(50) NULL,
  reference_number VARCHAR(100) NULL,
  source ENUM('manual', 'sms') NOT NULL DEFAULT 'manual',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_transactions_user_date (user_id, transaction_date),
  KEY idx_transactions_user_category (user_id, category_id),
  KEY idx_transactions_user_sms_hash (user_id, sms_hash),
  CONSTRAINT uq_transaction_sms_hash UNIQUE (sms_hash),
  CONSTRAINT fk_transactions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_transactions_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
  CONSTRAINT chk_transactions_amount_positive CHECK (amount > 0)
) ENGINE=InnoDB;

CREATE TABLE budgets (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  category_id INT UNSIGNED NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  month TINYINT UNSIGNED NOT NULL,
  year SMALLINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_category_month_year (user_id, category_id, month, year),
  KEY idx_budgets_user_period (user_id, year, month),
  CONSTRAINT fk_budgets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_budgets_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
  CONSTRAINT chk_budget_amount_positive CHECK (amount > 0),
  CONSTRAINT chk_budget_month_valid CHECK (month BETWEEN 1 AND 12),
  CONSTRAINT chk_budget_year_valid CHECK (year BETWEEN 2000 AND 2100)
) ENGINE=InnoDB;

-- The global SMS-hash uniqueness from utils/migration_sms_import.sql is
-- intentionally retained. The unapproved per-user proposal is not applied.
INSERT IGNORE INTO categories (id, name, type) VALUES
  (1, 'Salary', 'income'),
  (2, 'Other Income', 'income'),
  (3, 'Food', 'expense'),
  (4, 'Transport', 'expense'),
  (5, 'Housing', 'expense'),
  (6, 'Utilities', 'expense'),
  (7, 'Healthcare', 'expense'),
  (8, 'Entertainment', 'expense'),
  (9, 'Shopping', 'expense'),
  (10, 'Education', 'expense'),
  (11, 'Travel', 'expense'),
  (12, 'Other Expense', 'expense');

INSERT IGNORE INTO schema_migrations (version, description)
VALUES ('0001', 'Reconstructed development baseline');
