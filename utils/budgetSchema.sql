CREATE TABLE IF NOT EXISTS budgets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  category_id INT NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  month INT NOT NULL,
  year INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_budgets_user
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_budgets_category
    FOREIGN KEY (category_id)
    REFERENCES categories(id)
    ON DELETE CASCADE,
  CONSTRAINT uq_user_category_month_year
    UNIQUE (user_id, category_id, month, year),
  CONSTRAINT chk_budget_amount_positive
    CHECK (amount > 0),
  CONSTRAINT chk_budget_month_valid
    CHECK (month BETWEEN 1 AND 12),
  CONSTRAINT chk_budget_year_valid
    CHECK (year BETWEEN 2000 AND 2100)
);
