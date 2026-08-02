import db from "../config/db.js";

export const createBudget = async (userId, categoryId, amount, month, year) => {
  const [result] = await db.execute(
    `INSERT INTO budgets
        (user_id, category_id, amount, month, year)
        VALUES (?, ?, ?, ?, ?)`,
    [userId, categoryId, amount, month, year],
  );

  return result.insertId;
};

export const getBudgets = async (userId, filters = {}) => {
  let sql = `
        SELECT
            b.id,
            b.user_id,
            b.category_id,
            c.name AS category,
            c.type AS category_type,
            b.amount,
            b.month,
            b.year,
            b.created_at
        FROM budgets b
        JOIN categories c
            ON c.id = b.category_id
        WHERE b.user_id = ?
    `;

  const values = [userId];

  if (filters.month) {
    sql += " AND b.month = ?";
    values.push(filters.month);
  }

  if (filters.year) {
    sql += " AND b.year = ?";
    values.push(filters.year);
  }

  if (filters.categoryId) {
    sql += " AND b.category_id = ?";
    values.push(filters.categoryId);
  }

  sql += " ORDER BY b.year DESC, b.month DESC, c.name ASC";

  const [rows] = await db.execute(sql, values);

  return rows;
};

export const getBudgetById = async (budgetId, userId) => {
  const [rows] = await db.execute(
    `SELECT
            b.id,
            b.user_id,
            b.category_id,
            c.name AS category,
            c.type AS category_type,
            b.amount,
            b.month,
            b.year,
            b.created_at
        FROM budgets b
        JOIN categories c
            ON c.id = b.category_id
        WHERE
            b.id = ?
            AND b.user_id = ?`,
    [budgetId, userId],
  );

  return rows[0];
};

export const updateBudget = async (
  budgetId,
  userId,
  categoryId,
  amount,
  month,
  year,
) => {
  const [result] = await db.execute(
    `UPDATE budgets
        SET
            category_id = ?,
            amount = ?,
            month = ?,
            year = ?
        WHERE
            id = ?
            AND user_id = ?`,
    [categoryId, amount, month, year, budgetId, userId],
  );

  return result.affectedRows;
};

export const deleteBudget = async (budgetId, userId) => {
  const [result] = await db.execute(
    `DELETE FROM budgets
        WHERE
            id = ?
            AND user_id = ?`,
    [budgetId, userId],
  );

  return result.affectedRows;
};

export const categoryExists = async (categoryId) => {
  const [rows] = await db.execute(
    `SELECT id, name, type
        FROM categories
        WHERE id = ?`,
    [categoryId],
  );

  return rows[0];
};

export const budgetExists = async (
  userId,
  categoryId,
  month,
  year,
  excludeBudgetId = null,
) => {
  let sql = `
        SELECT id
        FROM budgets
        WHERE
            user_id = ?
            AND category_id = ?
            AND month = ?
            AND year = ?
    `;

  const values = [userId, categoryId, month, year];

  if (excludeBudgetId) {
    sql += " AND id <> ?";
    values.push(excludeBudgetId);
  }

  const [rows] = await db.execute(sql, values);

  return rows[0];
};

export const getBudgetStatus = async (userId, month, year) => {
  const [rows] = await db.execute(
    `SELECT
            b.id AS budget_id,
            b.category_id,
            c.name AS category,
            b.amount AS budget,
            COALESCE(SUM(t.amount), 0) AS spent
        FROM budgets b
        JOIN categories c
            ON c.id = b.category_id
        LEFT JOIN transactions t
            ON t.user_id = b.user_id
            AND t.category_id = b.category_id
            AND t.type = 'expense'
            AND MONTH(t.transaction_date) = b.month
            AND YEAR(t.transaction_date) = b.year
        WHERE
            b.user_id = ?
            AND b.month = ?
            AND b.year = ?
        GROUP BY
            b.id,
            b.category_id,
            c.name,
            b.amount
        ORDER BY c.name ASC`,
    [userId, month, year],
  );

  return rows.map((row) => {
    const budget = Number(row.budget);
    const spent = Number(row.spent);
    const remaining = Number((budget - spent).toFixed(2));
    const percentageUsed =
      budget === 0 ? 0 : Number(((spent / budget) * 100).toFixed(2));

    return {
      budgetId: row.budget_id,
      categoryId: row.category_id,
      category: row.category,
      budget,
      spent,
      remaining,
      percentageUsed,
      status: spent > budget ? "over_budget" : "safe",
    };
  });
};
