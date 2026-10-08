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
