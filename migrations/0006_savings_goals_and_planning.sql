-- FINTRACK Phase 5D: Intelligent Financial Planning & Savings Goals Foundation
-- Migration 0006: Additive schema for savings goals and contribution tracking

-- 1. Savings Goals Table
CREATE TABLE IF NOT EXISTS savings_goals (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  description VARCHAR(1000) NULL,
  target_amount DECIMAL(15,2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  target_date DATE NULL,
  starting_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  status ENUM('active', 'completed', 'archived') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_goals_user_status (user_id, status, target_date),
  KEY idx_goals_user_target_date (user_id, target_date),
  CONSTRAINT fk_goals_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_goals_target_amount_positive CHECK (target_amount > 0),
  CONSTRAINT chk_goals_starting_amount_non_negative CHECK (starting_amount >= 0)
) ENGINE=InnoDB;

-- 2. Goal Contributions Table
-- Accounting Note: Contributions are planning/allocation tracking records.
-- They do NOT touch bank accounts, wallet balances, or financial transaction ledgers.
CREATE TABLE IF NOT EXISTS goal_contributions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  goal_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  contribution_date DATE NOT NULL,
  note VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_contributions_goal (goal_id, contribution_date),
  KEY idx_contributions_user (user_id, contribution_date),
  CONSTRAINT fk_contributions_goal FOREIGN KEY (goal_id) REFERENCES savings_goals(id) ON DELETE CASCADE,
  CONSTRAINT fk_contributions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_contributions_amount_positive CHECK (amount > 0)
) ENGINE=InnoDB;

-- 3. Register Migration
INSERT IGNORE INTO schema_migrations (version, description)
VALUES ('0006', 'Savings goals and contribution tracking foundation');
