import assert from "node:assert/strict";
import test from "node:test";

import db from "../config/db.js";
import { getAllBudgets } from "../controllers/budgetController.js";
import { getSummary } from "../controllers/reportController.js";
import {
  getAllTransactions,
  importSmsTransactions,
} from "../controllers/transactionController.js";
import logger from "../utils/logger.js";

const run = async (handler, req) => {
  let statusCode = 200;
  let body;
  let failure;

  await new Promise((resolve) => {
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(payload) {
        body = payload;
        resolve();
        return payload;
      },
    };
    handler(req, res, (error) => {
      failure = error;
      resolve();
    });
  });

  return { statusCode, body, failure };
};

const withDb = async (impl, callback) => {
  const originalExecute = db.execute;
  db.execute = impl;
  try {
    return await callback();
  } finally {
    db.execute = originalExecute;
  }
};

test("transaction list response envelope is unchanged and amounts are numeric", async () => {
  await withDb(
    async (sql) =>
      sql.includes("COUNT")
        ? [[{ total: 1 }]]
        : [[{ id: 1, user_id: 9, title: "Synthetic", amount: "12.50", category: "Food" }]],
    async () => {
      const { body } = await run(getAllTransactions, {
        user: { id: 9 },
        query: { search: "synthetic", page: 1, limit: 10 },
      });

      assert.deepEqual(body, {
        success: true,
        message: "Transactions fetched",
        data: {
          transactions: [
            { id: 1, user_id: 9, title: "Synthetic", amount: 12.5, category: "Food" },
          ],
          total: 1,
          page: 1,
          limit: 10,
        },
      });
    },
  );
});

test("budget list response envelope is unchanged", async () => {
  await withDb(
    async () => [[{ id: 1, user_id: 9, category: "Food", amount: "100.00", month: 3, year: 2026 }]],
    async () => {
      const { body } = await run(getAllBudgets, { user: { id: 9 }, query: { month: 3 } });
      assert.deepEqual(body, {
        success: true,
        message: "Budgets fetched",
        data: {
          budgets: [{ id: 1, user_id: 9, category: "Food", amount: 100, month: 3, year: 2026 }],
        },
      });
    },
  );
});

test("report summary response envelope and arithmetic are unchanged", async () => {
  await withDb(
    async () => [[{ totalIncome: "1000.00", totalExpense: "250.50", totalTransactions: 4 }]],
    async () => {
      const { body } = await run(getSummary, { user: { id: 9 }, query: {} });
      assert.deepEqual(body, {
        success: true,
        message: "Report summary fetched",
        data: {
          totalIncome: 1000,
          totalExpense: 250.5,
          netBalance: 749.5,
          savingsRate: 74.95,
          totalTransactions: 4,
        },
      });
    },
  );
});

test("SMS import response envelope is unchanged", async () => {
  const originalInfo = logger.info;
  logger.info = () => {};

  try {
    await withDb(
      async (sql) => {
        if (sql.includes("FROM categories")) return [[{ id: 2, name: "Food", type: "expense" }]];
        if (sql.includes("SELECT id FROM transactions")) return [[{ id: 1 }]];
        throw new Error("insert must not run for an existing hash");
      },
      async () => {
        const { body } = await run(importSmsTransactions, {
          user: { id: 9 },
          body: [
            {
              amount: 1,
              type: "expense",
              merchant: "M",
              bank: "B",
              category: "Food",
              date: new Date("2026-01-01"),
              sender: "S",
              sms_hash: "h",
              message: "m",
            },
          ],
        });

        assert.deepEqual(body, {
          success: true,
          message: "0 transactions imported",
          imported: 0,
          duplicates: 1,
          failed: 0,
        });
      },
    );
  } finally {
    logger.info = originalInfo;
  }
});

test("dashboard controllers maintain envelope compatibility and exact data shapes", async () => {
  await withDb(
    async (sql) => {
      if (sql.includes("FROM accounts")) return [[]];
      if (sql.includes("FROM transfers")) return [[]];
      if (sql.includes("FROM account_adjustments")) return [[]];
      if (sql.includes("smsImportedToday")) return [[{ smsImportedToday: 0, totalSmsImported: 0 }]];
      if (sql.includes("INTERVAL 6 MONTH")) {
        return [[
          { month: "2026-10", type: "income", amount: "1000.00" },
          { month: "2026-10", type: "expense", amount: "500.00" },
        ]];
      }
      if (sql.includes("DATE_FORMAT(transaction_date, '%Y-%m')")) return [[{ month: "2026-10", income: "1000.00", expense: "500.00" }]];
      if (sql.includes("LIMIT")) return [[{ id: 1, title: "Coffee", amount: "50.00", type: "expense", category: "Food" }]];
      return [[]];
    },
    async () => {
      const { dashboard, monthlySummary, categorySummary, recentTransactions } = await import("../controllers/dashboardController.js");

      // 1. Main dashboard summary envelope
      const dRes = await run(dashboard, { user: { id: 9 }, query: {} });
      if (dRes.failure) throw dRes.failure;
      assert.equal(dRes.statusCode, 200);
      assert.equal(dRes.body.success, true);
      assert.equal(dRes.body.message, "Dashboard summary fetched");
      assert.equal(typeof dRes.body.data.totalIncome, "number");
      assert.equal(typeof dRes.body.data.totalExpense, "number");
      assert.equal(typeof dRes.body.data.balance, "number");
      assert.ok(dRes.body.data.overview);

      // 2. Monthly summary envelope
      const mRes = await run(monthlySummary, { user: { id: 9 } });
      assert.equal(mRes.statusCode, 200);
      assert.equal(mRes.body.success, true);
      assert.equal(mRes.body.message, "Monthly summary fetched");
      assert.ok(Array.isArray(mRes.body.data));

      // 3. Category summary envelope
      const cRes = await run(categorySummary, { user: { id: 9 }, query: {} });
      assert.equal(cRes.statusCode, 200);
      assert.equal(cRes.body.success, true);
      assert.equal(cRes.body.message, "Category summary fetched");
      assert.ok(Array.isArray(cRes.body.data));

      // 4. Recent transactions envelope
      const rRes = await run(recentTransactions, { user: { id: 9 }, query: { limit: 5 } });
      assert.equal(rRes.statusCode, 200);
      assert.equal(rRes.body.success, true);
      assert.equal(rRes.body.message, "Recent transactions fetched");
      assert.ok(Array.isArray(rRes.body.data));
    },
  );
});
