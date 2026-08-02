import db from "../config/db.js";

export const getDashboardSummary = async (userId) => {
  const [rows] = await db.execute(
    `
        SELECT
            COALESCE(SUM(CASE WHEN type='income' THEN amount END),0) AS totalIncome,
            COALESCE(SUM(CASE WHEN type='expense' THEN amount END),0) AS totalExpense
        FROM transactions
        WHERE user_id = ?
        `,
    [userId],
  );

  const [smsStatsRows] = await db.execute(
    `
        SELECT
            COALESCE(SUM(CASE WHEN source = 'sms' AND DATE(transaction_date) = CURDATE() THEN 1 ELSE 0 END), 0) AS smsImportedToday,
            COALESCE(SUM(CASE WHEN source = 'sms' THEN 1 ELSE 0 END), 0) AS totalSmsImported
        FROM transactions
        WHERE user_id = ?
        `,
    [userId],
  );

  const summary = rows[0];
  const smsStats = smsStatsRows[0];

  return {
    totalIncome: Number(summary.totalIncome),
    totalExpense: Number(summary.totalExpense),
    balance: Number(summary.totalIncome) - Number(summary.totalExpense),
    smsImportedToday: Number(smsStats.smsImportedToday),
    totalSmsImported: Number(smsStats.totalSmsImported),
  };
};

export const getMonthlySummary = async (userId) => {
  const [rows] = await db.execute(
    `
        SELECT

            DATE_FORMAT(transaction_date,'%Y-%m') AS month,

            SUM(
                CASE
                    WHEN type='income'
                    THEN amount
                    ELSE 0
                END
            ) AS income,

            SUM(
                CASE
                    WHEN type='expense'
                    THEN amount
                    ELSE 0
                END
            ) AS expense

        FROM transactions

        WHERE user_id=?

        GROUP BY month

        ORDER BY month DESC
        `,
    [userId],
  );

  return rows.map(row => ({
    ...row,
    income: Number(row.income),
    expense: Number(row.expense)
  }));
};

export const getExpenseByCategory = async (userId) => {

    const [rows] = await db.execute(
        `
        SELECT

            c.name,

            SUM(t.amount) AS total

        FROM transactions t

        JOIN categories c
            ON c.id=t.category_id

        WHERE
            t.user_id=?
            AND t.type='expense'

        GROUP BY c.name

        ORDER BY total DESC
        `,
        [userId]
    );

    return rows.map(row => ({
      ...row,
      total: Number(row.total)
    }));
};

export const getRecentTransactions = async (userId) => {

    const [rows] = await db.execute(
        `
        SELECT
            t.*,
            c.name AS category

        FROM transactions t

        JOIN categories c
            ON c.id=t.category_id

        WHERE t.user_id=?

        ORDER BY transaction_date DESC

        LIMIT 5
        `,
        [userId]
    );

    return rows.map(row => ({
      ...row,
      amount: Number(row.amount)
    }));
};