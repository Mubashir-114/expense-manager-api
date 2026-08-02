import db from "../config/db.js";

const buildTransactionFilters = (userId, filters) => {
  let sql = "WHERE t.user_id = ?";
  const values = [userId];

  if (filters.month) {
    sql += " AND MONTH(t.transaction_date) = ?";
    values.push(filters.month);
  }
  if (filters.year) {
    sql += " AND YEAR(t.transaction_date) = ?";
    values.push(filters.year);
  }
  if (filters.from) {
    sql += " AND t.transaction_date >= ?";
    values.push(filters.from);
  }
  if (filters.to) {
    sql += " AND t.transaction_date <= ?";
    values.push(filters.to);
  }
  if (filters.categoryId) {
    sql += " AND t.category_id = ?";
    values.push(filters.categoryId);
  }
  if (filters.type) {
    sql += " AND t.type = ?";
    values.push(filters.type);
  }

  return { sql, values };
};

export const getReportSummary = async (userId, filters) => {
  const { sql, values } = buildTransactionFilters(userId, filters);
  const query = `
    SELECT
      COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0) AS totalIncome,
      COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) AS totalExpense,
      COUNT(t.id) AS totalTransactions
    FROM transactions t
    ${sql}
  `;
  const [rows] = await db.execute(query, values);
  return rows[0];
};

export const getMonthlyReport = async (userId, filters) => {
  const { sql, values } = buildTransactionFilters(userId, filters);
  const query = `
    SELECT
      YEAR(t.transaction_date) AS year,
      MONTH(t.transaction_date) AS month,
      DATE_FORMAT(t.transaction_date, '%M') AS monthName,
      COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0) AS income,
      COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) AS expense
    FROM transactions t
    ${sql}
    GROUP BY YEAR(t.transaction_date), MONTH(t.transaction_date), DATE_FORMAT(t.transaction_date, '%M')
    ORDER BY year DESC, month DESC
  `;
  const [rows] = await db.execute(query, values);
  return rows;
};

export const getCategoryReport = async (userId, filters) => {
  // Build transaction filter conditions inside subquery
  let txFilterSql = "WHERE user_id = ? AND type = 'expense'";
  const txValues = [userId];

  if (filters.month) {
    txFilterSql += " AND MONTH(transaction_date) = ?";
    txValues.push(filters.month);
  }
  if (filters.year) {
    txFilterSql += " AND YEAR(transaction_date) = ?";
    txValues.push(filters.year);
  }
  if (filters.from) {
    txFilterSql += " AND transaction_date >= ?";
    txValues.push(filters.from);
  }
  if (filters.to) {
    txFilterSql += " AND transaction_date <= ?";
    txValues.push(filters.to);
  }
  if (filters.categoryId) {
    txFilterSql += " AND category_id = ?";
    txValues.push(filters.categoryId);
  }
  if (filters.type) {
    txFilterSql += " AND type = ?";
    txValues.push(filters.type);
  }

  // Build budget filter conditions inside subquery
  let budgetFilterSql = "WHERE user_id = ?";
  const budgetValues = [userId];

  if (filters.categoryId) {
    budgetFilterSql += " AND category_id = ?";
    budgetValues.push(filters.categoryId);
  }
  if (filters.month) {
    budgetFilterSql += " AND month = ?";
    budgetValues.push(filters.month);
  }
  if (filters.year) {
    budgetFilterSql += " AND year = ?";
    budgetValues.push(filters.year);
  }
  if (filters.from) {
    budgetFilterSql += " AND LAST_DAY(STR_TO_DATE(CONCAT(year, '-', month, '-01'), '%Y-%m-%d')) >= ?";
    budgetValues.push(filters.from);
  }
  if (filters.to) {
    budgetFilterSql += " AND STR_TO_DATE(CONCAT(year, '-', month, '-01'), '%Y-%m-%d') <= ?";
    budgetValues.push(filters.to);
  }

  const query = `
    SELECT
      c.id AS categoryId,
      c.name AS category,
      COALESCE(t_sum.spent, 0) AS spent,
      COALESCE(b_sum.budget, 0) AS budget
    FROM categories c
    LEFT JOIN (
      SELECT category_id, SUM(amount) AS spent
      FROM transactions
      ${txFilterSql}
      GROUP BY category_id
    ) t_sum ON t_sum.category_id = c.id
    LEFT JOIN (
      SELECT category_id, SUM(amount) AS budget
      FROM budgets
      ${budgetFilterSql}
      GROUP BY category_id
    ) b_sum ON b_sum.category_id = c.id
    WHERE (t_sum.spent > 0 OR b_sum.budget > 0)
    ORDER BY c.name ASC
  `;

  const [rows] = await db.execute(query, [...txValues, ...budgetValues]);
  return rows;
};

export const getTrendsReport = async (userId, filters) => {
  const { sql, values } = buildTransactionFilters(userId, filters);
  const query = `
    SELECT
      YEAR(t.transaction_date) AS year,
      MONTH(t.transaction_date) AS month,
      DATE_FORMAT(t.transaction_date, '%b') AS monthName,
      COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0) AS income,
      COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) AS expense
    FROM transactions t
    ${sql}
    GROUP BY YEAR(t.transaction_date), MONTH(t.transaction_date), DATE_FORMAT(t.transaction_date, '%b')
    ORDER BY year ASC, month ASC
  `;
  const [rows] = await db.execute(query, values);
  return rows;
};

export const getCashflowReport = async (userId, filters) => {
  const { sql, values } = buildTransactionFilters(userId, filters);
  const query = `
    SELECT
      t.id,
      t.title,
      t.amount,
      t.type,
      t.transaction_date AS date,
      c.name AS category
    FROM transactions t
    JOIN categories c ON c.id = t.category_id
    ${sql}
    ORDER BY t.transaction_date ASC, t.id ASC
  `;
  const [rows] = await db.execute(query, values);
  return rows;
};

export const getExportData = async (userId, filters) => {
  const { sql, values } = buildTransactionFilters(userId, filters);
  const query = `
    SELECT
      t.id,
      t.transaction_date,
      t.type,
      c.name AS category,
      t.title,
      t.amount,
      t.note
    FROM transactions t
    JOIN categories c ON c.id = t.category_id
    ${sql}
    ORDER BY t.transaction_date DESC, t.id DESC
  `;
  const [rows] = await db.execute(query, values);
  return rows;
};
