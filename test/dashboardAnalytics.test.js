import assert from "node:assert/strict";
import test from "node:test";

import db from "../config/db.js";
import {
  calculateChangePercent,
  getDashboardAccountsData,
  getDashboardAnalytics,
  resolveDateRange,
} from "../models/dashboardModel.js";
import validate from "../middleware/validate.js";
import { dashboardQueryValidation } from "../validators/dashboardValidation.js";

const runValidation = async (validators, query) => {
  const req = { query: structuredClone(query) };
  for (const validator of validators) await validator.run(req);
  let failure;
  validate(req, {}, (error) => {
    failure = error;
  });
  return failure;
};

test("resolveDateRange handles current month, previous month, and custom dates correctly", () => {
  const custom = resolveDateRange({ startDate: "2026-10-01", endDate: "2026-10-15" });
  assert.equal(custom.startDate, "2026-10-01");
  assert.equal(custom.endDate, "2026-10-15");
  assert.equal(custom.periodType, "custom");
  assert.equal(custom.previousPeriod.endDate, "2026-09-30");

  const monthSpecified = resolveDateRange({ month: "2026-02" });
  assert.equal(monthSpecified.startDate, "2026-02-01");
  assert.equal(monthSpecified.endDate, "2026-02-28");
  assert.equal(monthSpecified.previousPeriod.startDate, "2026-01-01");
  assert.equal(monthSpecified.previousPeriod.endDate, "2026-01-31");

  const prevMonth = resolveDateRange({ period: "previous_month" });
  assert.equal(prevMonth.periodType, "previous_month");
  assert.ok(prevMonth.startDate.endsWith("-01"));
});

test("calculateChangePercent computes deterministic percentages with zero-division protection", () => {
  assert.equal(calculateChangePercent(0n, 0n), "0.0");
  assert.equal(calculateChangePercent(10000n, 0n), "+100.0");
  assert.equal(calculateChangePercent(-5000n, 0n), "-100.0");
  assert.equal(calculateChangePercent(15000n, 10000n), "+50.0");
  assert.equal(calculateChangePercent(8000n, 10000n), "-20.0");
  assert.equal(calculateChangePercent(10000n, 10000n), "0.0");
});

test("dashboard query validation accepts valid params and rejects invalid formats", async () => {
  const valid = await runValidation(dashboardQueryValidation, {
    month: "2026-10",
    period: "current_month",
  });
  assert.equal(valid, undefined);

  const invalidMonth = await runValidation(dashboardQueryValidation, {
    month: "2026-13",
  });
  assert.ok(invalidMonth);
  assert.equal(invalidMonth.statusCode, 400);

  const invertedDates = await runValidation(dashboardQueryValidation, {
    startDate: "2026-10-20",
    endDate: "2026-10-10",
  });
  assert.ok(invertedDates);
  assert.equal(invertedDates.statusCode, 400);
});

test("getDashboardAccountsData computes exact ledger balances, assets, liabilities, and net worth", async () => {
  const originalExecute = db.execute;

  db.execute = async (sql, values) => {
    if (sql.includes("FROM accounts")) {
      return [
        [
          {
            id: 1,
            user_id: 42,
            type: "bank",
            subtype: "savings",
            display_name: "HDFC Savings",
            opening_amount_minor: "500000", // 5000.00
            credit_limit_minor: null,
            is_default: 1,
            status: "active",
            statement_closing_day: null,
            payment_due_day: null,
          },
          {
            id: 2,
            user_id: 42,
            type: "credit_card",
            subtype: "credit_card",
            display_name: "Regalia Card",
            opening_amount_minor: "0",
            credit_limit_minor: "10000000", // 100,000.00
            is_default: 0,
            status: "active",
            statement_closing_day: 20,
            payment_due_day: 10,
          },
          {
            id: 3,
            user_id: 42,
            type: "bank",
            subtype: "current",
            display_name: "Archived Bank",
            opening_amount_minor: "100000",
            credit_limit_minor: null,
            is_default: 0,
            status: "archived",
            statement_closing_day: null,
            payment_due_day: null,
          },
        ],
      ];
    }
    if (sql.includes("FROM transactions")) {
      return [
        [
          { account_id: 1, type: "income", amount: "2000.00" },
          { account_id: 1, type: "expense", amount: "500.00" },
          { account_id: 2, type: "expense", amount: "12000.00" }, // card spending
        ],
      ];
    }
    if (sql.includes("FROM transfers")) {
      return [
        [
          // Repayment transfer from bank 1 to credit card 2 of 2000.00
          { source_account_id: 1, destination_account_id: 2, amount_minor: "200000" },
        ],
      ];
    }
    if (sql.includes("FROM account_adjustments")) {
      return [
        [
          { account_id: 1, amount_minor: "10000" }, // +100.00 adjustment
        ],
      ];
    }
    throw new Error(`Unexpected query: ${sql}`);
  };

  try {
    const data = await getDashboardAccountsData(42);

    // Account 1: 5000 + 2000 (inc) - 500 (exp) - 2000 (transfer out) + 100 (adj) = 4600.00
    const bank = data.accounts.find((a) => a.id === 1);
    assert.equal(bank.currentBalance, "4600.00");
    assert.equal(bank.isDefault, true);
    assert.equal(bank.status, "active");

    // Account 2: Credit Card: 0 (opening) + 12000 (exp) - 2000 (transfer in) = 10000.00 debt
    const card = data.accounts.find((a) => a.id === 2);
    assert.equal(card.outstandingDebt, "10000.00");
    assert.equal(card.availableCredit, "90000.00");
    assert.equal(card.utilizationPercentage, "10.00");

    // Archived account 3 excluded from total assets
    const archived = data.accounts.find((a) => a.id === 3);
    assert.equal(archived.isArchived, true);

    // Totals:
    // Total Assets = 4600.00
    // Total Liabilities = 10000.00
    // Net Worth = 4600.00 - 10000.00 = -5400.00
    assert.equal(data.totalAssets, "4600.00");
    assert.equal(data.totalLiabilities, "10000.00");
    assert.equal(data.netWorth, "-5400.00");

    // Asset distribution includes active bank account
    assert.equal(data.assetDistribution.length, 1);
    assert.equal(data.assetDistribution[0].accountId, 1);
    assert.equal(data.assetDistribution[0].percentage, "100.0");
  } finally {
    db.execute = originalExecute;
  }
});

test("getDashboardAnalytics isolates users and prevents double-counting of transfers and adjustments", async () => {
  const originalExecute = db.execute;

  db.execute = async (sql, values) => {
    // Check that user_id is always scoped to 999
    assert.ok(values.includes(999), `Query must isolate user 999: ${sql}`);

    if (sql.includes("FROM accounts")) {
      return [
        [
          {
            id: 10,
            user_id: 999,
            type: "bank",
            subtype: "savings",
            display_name: "Savings",
            opening_amount_minor: "1000000", // 10000.00
            credit_limit_minor: null,
            is_default: 1,
            status: "active",
          },
        ],
      ];
    }
    if (sql.includes("FROM transactions") && sql.includes("account_id IS NOT NULL")) {
      return [[{ account_id: 10, type: "income", amount: "5000.00" }]];
    }
    if (sql.includes("FROM transfers")) {
      // 1000.00 transfer (should NOT appear in monthly spending)
      return [[{ source_account_id: 10, destination_account_id: 99, amount_minor: "100000" }]];
    }
    if (sql.includes("FROM account_adjustments")) {
      // Adjustment of 50.00 (should NOT appear in monthly spending)
      return [[{ account_id: 10, amount_minor: "5000" }]];
    }
    if (sql.includes("FROM transactions t") && sql.includes("DATE(t.transaction_date) >=")) {
      // Period transactions: 1 income (5000.00), 1 manual expense (1500.00), 1 SMS expense (350.00)
      return [
        [
          {
            id: 101,
            category_id: 1,
            account_id: 10,
            type: "income",
            title: "Salary Credit",
            amount: "5000.00",
            transaction_date: "2026-10-01",
            source: "manual",
            category_name: "Salary",
            category_icon: "work",
            category_color: "#4CAF50",
            account_name: "Savings",
            account_type: "bank",
          },
          {
            id: 102,
            category_id: 2,
            account_id: 10,
            type: "expense",
            title: "Supermarket Groceries",
            amount: "1500.00",
            transaction_date: "2026-10-05",
            source: "manual",
            category_name: "Food",
            category_icon: "restaurant",
            category_color: "#FF9800",
            account_name: "Savings",
            account_type: "bank",
          },
          {
            id: 103,
            category_id: 3,
            account_id: 10,
            type: "expense",
            title: "Uber Ride",
            amount: "350.00",
            transaction_date: "2026-10-08",
            source: "sms",
            category_name: "Travel",
            category_icon: "commute",
            category_color: "#2196F3",
            account_name: "Savings",
            account_type: "bank",
          },
        ],
      ];
    }
    if (sql.includes("FROM transactions") && sql.includes("DATE(transaction_date) >=")) {
      return [
        [
          { type: "income", amount: "4000.00" },
          { type: "expense", amount: "1000.00" },
        ],
      ];
    }
    if (sql.includes("DATE_FORMAT(transaction_date, '%Y-%m')")) {
      return [
        [
          { month: "2026-09", type: "income", amount: "4000.00" },
          { month: "2026-09", type: "expense", amount: "1000.00" },
          { month: "2026-10", type: "income", amount: "5000.00" },
          { month: "2026-10", type: "expense", amount: "1850.00" },
        ],
      ];
    }
    if (sql.includes("smsImportedToday")) {
      return [[{ smsImportedToday: 1, totalSmsImported: 5 }]];
    }
    if (sql.includes("LIMIT 10")) {
      return [
        [
          {
            id: 103,
            category_id: 3,
            account_id: 10,
            type: "expense",
            title: "Uber Ride",
            amount: "350.00",
            transaction_date: "2026-10-08",
            source: "sms",
            category_name: "Travel",
            category_icon: "commute",
            category_color: "#2196F3",
            account_name: "Savings",
            account_type: "bank",
          },
        ],
      ];
    }

    throw new Error(`Unexpected query in user isolation test: ${sql}`);
  };

  try {
    const res = await getDashboardAnalytics(999, { month: "2026-10" });

    // Financial Overview
    assert.equal(res.overview.monthlyIncome, "5000.00");
    assert.equal(res.overview.monthlyExpenses, "1850.00");
    assert.equal(res.overview.monthlyNetSavings, "3150.00");
    assert.equal(res.overview.savingsRate, "63.0");

    // MoM changes:
    // Income: 5000 vs 4000 => +25.0%
    // Expenses: 1850 vs 1000 => +85.0%
    assert.equal(res.overview.monthOverMonth.incomeChangePercent, "+25.0");
    assert.equal(res.overview.monthOverMonth.expenseChangePercent, "+85.0");

    // Spending breakdown
    assert.equal(res.spending.byCategory.length, 2);
    assert.equal(res.spending.topCategories[0].name, "Food");
    assert.equal(res.spending.topCategories[0].total, "1500.00");
    assert.equal(res.spending.topMerchants[0].merchant, "Supermarket Groceries");
    assert.equal(res.spending.largestExpense.title, "Supermarket Groceries");
    assert.equal(res.spending.largestExpense.amount, "1500.00");

    // Deterministic Insights
    assert.ok(res.insights.length >= 3);
    assert.ok(res.insights.some((i) => i.type === "highest_category"));
    assert.ok(res.insights.some((i) => i.type === "largest_expense"));
    assert.ok(res.insights.some((i) => i.type === "savings_rate"));

    // Backward compatibility
    assert.equal(typeof res.totalIncome, "number");
    assert.equal(res.totalIncome, 5000);
    assert.equal(typeof res.totalExpense, "number");
    assert.equal(res.totalExpense, 1850);
    assert.equal(res.balance, 3150);
    assert.equal(res.smsImportedToday, 1);
    assert.equal(res.totalSmsImported, 5);
  } finally {
    db.execute = originalExecute;
  }
});

test("handles empty accounts, zero transactions, and signed boundary monetary values", async () => {
  const originalExecute = db.execute;

  db.execute = async (sql) => {
    if (sql.includes("FROM accounts")) return [[]];
    if (sql.includes("FROM transfers")) return [[]];
    if (sql.includes("FROM account_adjustments")) return [[]];
    if (sql.includes("smsImportedToday")) return [[{ smsImportedToday: 0, totalSmsImported: 0 }]];
    return [[]];
  };

  try {
    const emptyResult = await getDashboardAnalytics(101, { month: "2026-10" });
    assert.equal(emptyResult.overview.totalAssets, "0.00");
    assert.equal(emptyResult.overview.totalLiabilities, "0.00");
    assert.equal(emptyResult.overview.netWorth, "0.00");
    assert.equal(emptyResult.overview.monthlyIncome, "0.00");
    assert.equal(emptyResult.overview.monthlyExpenses, "0.00");
    assert.equal(emptyResult.overview.monthlyNetSavings, "0.00");
    assert.equal(emptyResult.overview.savingsRate, "0.0");
    assert.equal(emptyResult.accounts.items.length, 0);
    assert.equal(emptyResult.spending.byCategory.length, 0);
    assert.equal(emptyResult.spending.topMerchants.length, 0);
    assert.equal(emptyResult.totalIncome, 0);
    assert.equal(emptyResult.totalExpense, 0);
    assert.equal(emptyResult.balance, 0);
  } finally {
    db.execute = originalExecute;
  }
});
