-- FINTRACK Phase 5E: FIN Living Financial Companion & Relationship Preferences
-- Migration 0007: Additive schema for user companion preferences

CREATE TABLE IF NOT EXISTS user_companion_preferences (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  preferred_name VARCHAR(100) NULL,
  response_style ENUM('friendly', 'concise', 'detailed') NOT NULL DEFAULT 'friendly',
  enable_personalized_greetings BOOLEAN NOT NULL DEFAULT TRUE,
  enable_character_animations BOOLEAN NOT NULL DEFAULT TRUE,
  priority_goal_id INT UNSIGNED NULL,
  focus_category VARCHAR(100) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_companion_user (user_id),
  CONSTRAINT fk_companion_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_companion_priority_goal FOREIGN KEY (priority_goal_id) REFERENCES savings_goals(id) ON DELETE SET NULL
) ENGINE=InnoDB;

INSERT IGNORE INTO schema_migrations (version, description)
VALUES ('0007', 'User companion preferences and relationship memory');
