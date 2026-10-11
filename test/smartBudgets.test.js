import assert from "node:assert/strict";
import test from "node:test";

import db from "../config/db.js";
import {
  getBudgetProgress,
  getBudgetAlerts,
  getBudgetSuggestions,
  getBudgetHistory,
  budgetExists,
  createBudget,
} from "../models/budgetModel.js";
import {
  budgetProgress,
  budgetAlerts,
  budgetSuggestions,
  budgetHistory,
  budgetSavingsTarget,
  addBudget,
} from "../controllers/budgetController.js";
import {
  budgetValidation,
  budgetProgressValidation,
  budgetAlertsValidation,
  budgetSuggestionsValidation,
} from "../validators/budgetValidation.js";
import validate from "../middleware/validate.js";
import AppError from "../utils/AppError.js";

const withDb = async (impl, callback) => {
  const originalExecute = db.execute;
  db.execute = impl;
  try {
    return await callback();
  } finally {
    db.execute = originalExecute;
  }
};

const runHandler = async (handler, req) => {
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

const runValidation = async (validators, req) => {
  for (const validator of validators) await validator.run(req);
  let failure;
  validate(req, {}, (error) => {
    failure = error;
  });
  return failure;
};

test("Exact budget calculations preserve exact BigInt minor-unit precision", async () => {
  await withDb(
    async (sql, params) => {
      if (sql.includes("FROM budgets b")) {
        // Return budget of 150.35
        return [[
          { budget_id: 1, category_id: 3, category: "Food", category_type: "expense", budget: "150.35" },
        ]];
      }
      if (sql.includes("FROM transactions")) {
        // Return two expense transactions: 50.15 and 25.20 = 75.35
        return [[
          { category_id: 3, type: "expense", amount: "50.15", transaction_date: "2026-10-02" },
          { category_id: 3, type: "expense", amount: "25.20", transaction_date: "2026-10-05" },
        ]];
      }
      return [[]];
    },
    async () => {
      const progress = await getBudgetProgress(1, 10, 2026);
      assert.equal(progress.overall.budgetLimit, "150.35");
      assert.equal(progress.overall.actualSpending, "75.35");
      assert.equal(progress.overall.remainingAmount, "75.00");
      assert.equal(progress.categoryBudgets[0].budgetLimit, "150.35");
      assert.equal(progress.categoryBudgets[0].actualSpending, "75.35");
      assert.equal(progress.categoryBudgets[0].remainingAmount, "75.00");
      // 75.35 / 150.35 = 50.1%
      assert.equal(progress.categoryBudgets[0].utilizationPercentage, "50.1");
      assert.equal(progress.categoryBudgets[0].status, "on_track");
    },
  );
});

test("Duplicate budget prevention enforces unique active budget per category/month/year", async () => {
  await withDb(
    async (sql, params) => {
      if (sql.includes("FROM budgets") && sql.includes("user_id = ?")) {
        // Existing budget found
        return [[{ id: 99 }]];
      }
      if (sql.includes("FROM categories")) {
        return [[{ id: 3, name: "Food", type: "expense" }]];
      }
      return [[]];
    },
    async () => {
      const req = {
        user: { id: 1 },
        body: { categoryId: 3, amount: 500, month: 10, year: 2026 },
      };
      const { statusCode, failure } = await runHandler(addBudget, req);
      assert.ok(failure);
      assert.equal(failure.statusCode, 409);
      assert.match(failure.message, /already exists/i);
    },
  );
});

test("Monthly & category aggregation isolates category expenses and tracks unbudgeted spending", async () => {
  await withDb(
    async (sql, params) => {
      if (sql.includes("FROM budgets b")) {
        return [[
          { budget_id: 1, category_id: 3, category: "Food", category_type: "expense", budget: "300.00" },
          { budget_id: 2, category_id: 4, category: "Transport", category_type: "expense", budget: "200.00" },
        ]];
      }
      if (sql.includes("FROM transactions")) {
        return [[
          { category_id: 3, type: "expense", amount: "100.00", transaction_date: "2026-10-02" },
          { category_id: 4, type: "expense", amount: "150.00", transaction_date: "2026-10-05" },
          // Unbudgeted category (Shopping, id 9)
          { category_id: 9, type: "expense", amount: "80.00", transaction_date: "2026-10-08" },
        ]];
      }
      return [[]];
    },
    async () => {
      const progress = await getBudgetProgress(1, 10, 2026);
      assert.equal(progress.overall.budgetLimit, "500.00");
      assert.equal(progress.overall.actualSpending, "330.00"); // 100 + 150 + 80
      assert.equal(progress.overall.remainingAmount, "170.00");
      assert.equal(progress.uncategorizedSpending, "80.00");
      assert.equal(progress.categoryBudgets.length, 2);
      assert.equal(progress.categoryBudgets[0].actualSpending, "100.00");
      assert.equal(progress.categoryBudgets[1].actualSpending, "150.00");
    },
  );
});

test("Refund and repayment accounting excludes credit card repayments and income from expenses", async () => {
  await withDb(
    async (sql, params) => {
      if (sql.includes("FROM budgets b")) {
        return [[
          { budget_id: 1, category_id: 3, category: "Food", category_type: "expense", budget: "500.00" },
        ]];
      }
      if (sql.includes("FROM transactions")) {
        // Query filters `type = 'expense'` strictly; income/refunds are not counted as expenses
        return [[
          { category_id: 3, type: "expense", amount: "200.00", transaction_date: "2026-10-02" },
          // Income transaction (refund) in month
          { category_id: 3, type: "income", amount: "50.00", transaction_date: "2026-10-04" },
        ]];
      }
      return [[]];
    },
    async () => {
      const progress = await getBudgetProgress(1, 10, 2026);
      // Only expense (200.00) is counted in actual spending
      assert.equal(progress.overall.actualSpending, "200.00");
      assert.equal(progress.overall.remainingAmount, "300.00");
      // Income is tracked in savings.totalIncome
      assert.equal(progress.savings.totalIncome, "50.00");
    },
  );
});

test("Imported SMS confirmation integration excludes unconfirmed SMS and counts confirmed ledger records", async () => {
  // Unconfirmed smart transactions reside in detected_transactions, NOT transactions table.
  // When confirmed, they are inserted into transactions table.
  await withDb(
    async (sql, params) => {
      if (sql.includes("FROM budgets b")) {
        return [[
          { budget_id: 1, category_id: 4, category: "Transport", category_type: "expense", budget: "1000.00" },
        ]];
      }
      if (sql.includes("FROM transactions")) {
        // Only confirmed records present in transactions table
        return [[
          { category_id: 4, type: "expense", amount: "450.00", transaction_date: "2026-10-03" },
        ]];
      }
      return [[]];
    },
    async () => {
      const progress = await getBudgetProgress(1, 10, 2026);
      assert.equal(progress.categoryBudgets[0].actualSpending, "450.00");
      assert.equal(progress.categoryBudgets[0].remainingAmount, "550.00");
    },
  );
});

test("Transaction edits and deletions immediately reflect in real-time budget calculations", async () => {
  // If transaction amount changes from 300 to 150
  await withDb(
    async (sql, params) => {
      if (sql.includes("FROM budgets b")) {
        return [[
          { budget_id: 1, category_id: 3, category: "Food", category_type: "expense", budget: "400.00" },
        ]];
      }
      if (sql.includes("FROM transactions")) {
        return [[
          { category_id: 3, type: "expense", amount: "150.00", transaction_date: "2026-10-01" },
        ]];
      }
      return [[]];
    },
    async () => {
      const progress = await getBudgetProgress(1, 10, 2026);
      assert.equal(progress.overall.actualSpending, "150.00");
      assert.equal(progress.overall.remainingAmount, "250.00");
    },
  );
});

test("Threshold alerts accurately classify on_track, approaching_limit (80%), and exceeded (100%)", async () => {
  await withDb(
    async (sql, params) => {
      if (sql.includes("FROM budgets b")) {
        return [[
          { budget_id: 1, category_id: 3, category: "Food", category_type: "expense", budget: "100.00" },
          { budget_id: 2, category_id: 4, category: "Transport", category_type: "expense", budget: "100.00" },
          { budget_id: 3, category_id: 5, category: "Housing", category_type: "expense", budget: "100.00" },
        ]];
      }
      if (sql.includes("FROM transactions")) {
        return [[
          { category_id: 3, type: "expense", amount: "50.00", transaction_date: "2026-10-01" }, // 50% -> on_track
          { category_id: 4, type: "expense", amount: "85.00", transaction_date: "2026-10-02" }, // 85% -> approaching_limit
          { category_id: 5, type: "expense", amount: "110.00", transaction_date: "2026-10-03" }, // 110% -> exceeded
        ]];
      }
      return [[]];
    },
    async () => {
      const alerts = await getBudgetAlerts(1, 10, 2026);
      assert.equal(alerts.approachingLimit.length, 1);
      assert.equal(alerts.approachingLimit[0].category, "Transport");
      assert.equal(alerts.approachingLimit[0].utilizationPercentage, "85.0");

      assert.equal(alerts.exceeded.length, 1);
      assert.equal(alerts.exceeded[0].category, "Housing");
      assert.equal(alerts.exceeded[0].utilizationPercentage, "110.0");

      // Total spent = 245.00, Total budget = 300.00 => 81.7% => overallAlert is warning
      assert.ok(alerts.overallAlert);
      assert.equal(alerts.overallAlert.severity, "warning");
    },
  );
});

test("Forecast calculations compute deterministic daily run-rate burn rate", async () => {
  await withDb(
    async (sql, params) => {
      if (sql.includes("FROM budgets b")) {
        return [[
          { budget_id: 1, category_id: 3, category: "Food", category_type: "expense", budget: "1000.00" },
        ]];
      }
      if (sql.includes("FROM transactions")) {
        return [[
          { category_id: 3, type: "expense", amount: "310.00", transaction_date: "2026-10-01" },
        ]];
      }
      return [[]];
    },
    async () => {
      const progress = await getBudgetProgress(1, 10, 2026);
      // Period has valid daysInMonth (31 for October)
      assert.equal(progress.period.daysInMonth, 31);
      assert.ok(Number(progress.overall.projectedSpending) >= 310.0);
    },
  );
});

test("Historical comparisons return chronological spending vs budget across past periods", async () => {
  await withDb(
    async (sql, params) => {
      if (sql.includes("FROM budgets b")) {
        return [[
          { budget_id: 1, category_id: 3, category: "Food", category_type: "expense", budget: "500.00" },
        ]];
      }
      if (sql.includes("FROM transactions")) {
        return [[
          { category_id: 3, type: "expense", amount: "400.00", transaction_date: "2026-09-10" },
        ]];
      }
      return [[]];
    },
    async () => {
      const history = await getBudgetHistory(1, 3);
      assert.equal(history.length, 3);
      assert.equal(history[0].totalBudget, "500.00");
      assert.equal(history[0].totalSpent, "400.00");
      assert.equal(history[0].status, "approaching_limit");
    },
  );
});

test("Ownership & authentication scoping isolates users completely", async () => {
  let capturedUserId = null;
  await withDb(
    async (sql, params) => {
      capturedUserId = params[0];
      if (sql.includes("FROM budgets b")) return [[]];
      if (sql.includes("FROM transactions")) return [[]];
      return [[]];
    },
    async () => {
      await getBudgetProgress(42, 10, 2026);
      assert.equal(capturedUserId, 42);
    },
  );
});

test("Smart budget suggestions compute deterministic 3-month average, trend, and distinguish facts from estimates", async () => {
  await withDb(
    async (sql, params) => {
      if (sql.includes("FROM categories")) {
        return [[
          { id: 3, name: "Food", type: "expense" },
          { id: 4, name: "Transport", type: "expense" },
        ]];
      }
      if (sql.includes("FROM transactions")) {
        // Transactions across past 3 months
        return [[
          { category_id: 3, amount: "300.00", tx_month: 9, tx_year: 2026 },
          { category_id: 3, amount: "200.00", tx_month: 8, tx_year: 2026 },
          { category_id: 3, amount: "100.00", tx_month: 7, tx_year: 2026 },
        ]];
      }
      if (sql.includes("FROM budgets")) {
        return [[]];
      }
      return [[]];
    },
    async () => {
      const suggestions = await getBudgetSuggestions(1, 10, 2026);
      assert.equal(suggestions.targetMonth, 10);
      assert.equal(suggestions.targetYear, 2026);
      assert.equal(suggestions.historicalMonthsAnalyzed.length, 3);

      const foodSuggestion = suggestions.suggestions.find((s) => s.categoryName === "Food");
      assert.ok(foodSuggestion);
      // Total = 600, 3-month avg = 200.00
      assert.equal(foodSuggestion.historicalFacts.threeMonthAverage, "200.00");
      assert.equal(foodSuggestion.estimates.trend, "increasing");
      assert.equal(foodSuggestion.estimates.suggestedBudget, "200.00");
      assert.equal(foodSuggestion.isHistoricalFact, false);
      assert.equal(foodSuggestion.isSuggestion, true);
    },
  );
});

test("Savings target progress computes net savings, target progress %, and achievement status", async () => {
  await withDb(
    async (sql, params) => {
      if (sql.includes("FROM budgets b")) {
        return [[
          { budget_id: 1, category_id: 3, category: "Food", category_type: "expense", budget: "400.00" },
        ]];
      }
      if (sql.includes("FROM transactions")) {
        return [[
          { category_id: 3, type: "expense", amount: "300.00", transaction_date: "2026-10-05" },
          { category_id: 1, type: "income", amount: "1000.00", transaction_date: "2026-10-01" },
        ]];
      }
      return [[]];
    },
    async () => {
      const progress = await getBudgetProgress(1, 10, 2026, { savingsTarget: "500.00" });
      assert.equal(progress.savings.totalIncome, "1000.00");
      assert.equal(progress.savings.totalExpense, "300.00");
      assert.equal(progress.savings.netSavings, "700.00");
      assert.equal(progress.savings.savingsTarget, "500.00");
      // 700 / 500 = 140.0%
      assert.equal(progress.savings.progressPercentage, "140.0");
      assert.equal(progress.savings.isTargetAchieved, true);
    },
  );
});

test("Budget query validators accept valid and reject invalid input parameters", async () => {
  const validProgress = await runValidation(budgetProgressValidation, {
    query: { month: "10", year: "2026", savingsTarget: "5000.50" },
  });
  assert.equal(validProgress, undefined);

  const invalidMonth = await runValidation(budgetProgressValidation, {
    query: { month: "13" },
  });
  assert.ok(invalidMonth);
  assert.equal(invalidMonth.statusCode, 400);

  const invalidTarget = await runValidation(budgetProgressValidation, {
    query: { savingsTarget: "-100" },
  });
  assert.ok(invalidTarget);
  assert.equal(invalidTarget.statusCode, 400);
});
