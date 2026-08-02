import db from "../config/db.js";

const toPositiveInteger = (value, fallback, max) => {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return max ? Math.min(parsed, max) : parsed;
};

export const createTransaction = async (
  userId,
  categoryId,
  type,
  title,
  amount,
  transactionDate,
  note,
) => {
  const [result] = await db.execute(
    `INSERT INTO transactions
        (user_id, category_id, type, title, amount, transaction_date, note)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, categoryId, type, title, amount, transactionDate, note],
  );

  return result.insertId;
};

export const getTransactions = async (userId, query) => {
  let sql = `
        SELECT
            t.*,
            c.name AS category
        FROM transactions t
        JOIN categories c
            ON c.id = t.category_id
        WHERE t.user_id = ?
    `;

  let countSql = `
        SELECT COUNT(*) AS total
        FROM transactions t
        WHERE t.user_id = ?
    `;

  const values = [userId];
  const countValues = [userId];

  if (query.type) {
    sql += " AND t.type = ?";
    countSql += " AND t.type = ?";
    values.push(query.type);
    countValues.push(query.type);
  }

  if (query.categoryId) {
    sql += " AND t.category_id = ?";
    countSql += " AND t.category_id = ?";
    values.push(query.categoryId);
    countValues.push(query.categoryId);
  }

  if (query.search) {
    sql += " AND t.title LIKE ?";
    countSql += " AND t.title LIKE ?";
    values.push(`%${query.search}%`);
    countValues.push(`%${query.search}%`);
  }

  if (query.from && query.to) {
    sql += " AND t.transaction_date BETWEEN ? AND ?";
    countSql += " AND t.transaction_date BETWEEN ? AND ?";
    values.push(query.from, query.to);
    countValues.push(query.from, query.to);
  }

  const allowedSort = ["transaction_date", "amount", "created_at"];

  const sort = allowedSort.includes(query.sort)
    ? query.sort
    : "transaction_date";

  const order = query.order === "asc" ? "ASC" : "DESC";

  sql += ` ORDER BY t.${sort} ${order}`;

  const page = toPositiveInteger(query.page, 1);
  const limit = toPositiveInteger(query.limit, 10, 100);
  const offset = (page - 1) * limit;

  sql += ` LIMIT ${limit} OFFSET ${offset}`;

  const [rows] = await db.execute(sql, values);
  const [count] = await db.execute(countSql, countValues);

  return {
    transactions: rows,
    total: count[0].total,
    page,
    limit,
  };
};
export const getTransactionById = async (id, userId) => {
  const [rows] = await db.execute(
    `SELECT
            t.*,
            c.name AS category
        FROM transactions t
        JOIN categories c
            ON c.id = t.category_id
        WHERE
            t.id = ?
            AND t.user_id = ?`,
    [id, userId],
  );

  return rows[0];
};

export const updateTransaction = async (
  id,
  userId,
  categoryId,
  type,
  title,
  amount,
  transactionDate,
  note,
) => {
  const [result] = await db.execute(
    `UPDATE transactions
        SET
            category_id=?,
            type=?,
            title=?,
            amount=?,
            transaction_date=?,
            note=?
        WHERE
            id=?
            AND user_id=?`,
    [categoryId, type, title, amount, transactionDate, note, id, userId],
  );

  return result.affectedRows;
};

export const deleteTransaction = async (id, userId) => {
  const [result] = await db.execute(
    `DELETE FROM transactions
        WHERE id=? AND user_id=?`,
    [id, userId],
  );

  return result.affectedRows;
};

export const getCategoryById = async (categoryId) => {
  const [rows] = await db.execute(`SELECT * FROM categories WHERE id=?`, [
    categoryId,
  ]);
  return rows[0];
};
