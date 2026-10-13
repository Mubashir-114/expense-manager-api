import assert from "node:assert/strict";
import test from "node:test";

import analyticsDb from "../config/analyticsDb.js";
import {
  parseUserQuery,
  checkPromptSafety,
  SUPPORTED_INTENTS,
  detectCategoryFromText,
} from "../services/analytics/intentParser.js";
import {
  executeAnalyticsQuery,
} from "../services/analytics/analyticsEngine.js";
import {
  analyticsQueryValidation,
} from "../validators/analyticsValidation.js";
import validate from "../middleware/validate.js";

const runValidation = async (validators, req) => {
  const cloned = structuredClone(req);
  for (const validator of validators) {
    await validator.run(cloned);
  }
  let failure;
  validate(cloned, {}, (error) => {
    failure = error;
  });
  return failure;
};

// ── 1. Multi-Turn Follow-Up Resolution ──────────────────────────────────────

test("multi-turn: resolves 'What about last month?' using previous intent", () => {
  const turn1 = parseUserQuery({
    question: "How much did I spend this month?",
  });
  assert.equal(turn1.intent, "total_spending");
  assert.equal(turn1.period, "current_month");

  // Context passed into turn 2
  const context = {
    previousIntent: "total_spending",
    activePeriod: "current_month",
    turnCount: 1,
  };

  const turn2 = parseUserQuery({
    question: "What about last month?",
    conversationContext: context,
  });
  assert.equal(turn2.intent, "total_spending");
  assert.equal(turn2.period, "previous_month");
});

test("multi-turn: resolves 'What about last 30 days?' using previous intent", () => {
  const context = {
    previousIntent: "income_vs_expense",
    activePeriod: "current_month",
    turnCount: 1,
  };

  const turn2 = parseUserQuery({
    question: "What about last 30 days?",
    conversationContext: context,
  });
  assert.equal(turn2.intent, "income_vs_expense");
  assert.equal(turn2.period, "last_30_days");
});

test("category comparison: parses 'Which category increased the most?'", () => {
  const parsed = parseUserQuery({
    question: "Which category increased the most?",
  });
  assert.equal(parsed.intent, "category_comparison");
  assert.equal(parsed.comparisonType, "largest_increase");
});

test("category comparison: parses 'Which category decreased the most?'", () => {
  const parsed = parseUserQuery({
    question: "Which category decreased the most?",
  });
  assert.equal(parsed.intent, "category_comparison");
  assert.equal(parsed.comparisonType, "largest_decrease");
});

test("budget status: extracts category from 'Am I exceeding my food budget?'", () => {
  const parsed = parseUserQuery({
    question: "Am I exceeding my food budget?",
  });
  assert.equal(parsed.intent, "budget_status");
  assert.equal(parsed.category, "Food");
});

test("remaining allowance: parses 'How much can I still spend?' with context category", () => {
  const context = {
    previousIntent: "budget_status",
    activeCategory: "Food",
    activePeriod: "current_month",
    turnCount: 2,
  };
  const parsed = parseUserQuery({
    question: "How much can I still spend?",
    conversationContext: context,
  });
  assert.equal(parsed.intent, "remaining_allowance");
  assert.equal(parsed.category, "Food");
});

test("unusual spending: parses 'Any unusual spending this month?'", () => {
  const parsed = parseUserQuery({
    question: "Any unusual spending this month?",
  });
  assert.equal(parsed.intent, "unusual_spending");
});

test("savings opportunities: parses 'Where can I save money?'", () => {
  const parsed = parseUserQuery({
    question: "Where can I save money?",
  });
  assert.equal(parsed.intent, "savings_opportunities");
});

test("ambiguous single category query returns safe clarification", () => {
  const parsed = parseUserQuery({
    question: "Food",
  });
  assert.equal(parsed.intent, "clarification_needed");
  assert.equal(parsed.confidence, "low");
  assert.ok(parsed.clarificationOptions.length >= 2);
  assert.ok(parsed.clarificationOptions.some((o) => o.question.includes("Food")));
});

test("single category query resolves with prior budget context", () => {
  const context = {
    previousIntent: "budget_status",
    activePeriod: "current_month",
    turnCount: 1,
  };
  const parsed = parseUserQuery({
    question: "Groceries",
    conversationContext: context,
  });
  assert.equal(parsed.intent, "budget_status");
  assert.equal(parsed.category, "Food"); // Groceries maps to Food
});

// ── 2. Request Validation & Smuggling Prevention ─────────────────────────────

test("validation allows category and conversationContext", async () => {
  const req = {
    body: {
      question: "Am I exceeding my food budget?",
      category: "Food",
      conversationContext: {
        previousIntent: "total_spending",
        activePeriod: "current_month",
        activeCategory: "Food",
        activeMonth: "2026-10",
        turnCount: 2,
      },
    },
  };
  const err = await runValidation(analyticsQueryValidation, req);
  assert.equal(err, undefined);
});

test("validation rejects unknown properties inside conversationContext", async () => {
  const req = {
    body: {
      question: "What about last month?",
      conversationContext: {
        previousIntent: "total_spending",
        unauthorizedPayload: "exploit",
      },
    },
  };
  const err = await runValidation(analyticsQueryValidation, req);
  assert.ok(err);
  assert.equal(err.statusCode, 400);
});

test("validation rejects negative or non-integer turnCount", async () => {
  const req = {
    body: {
      question: "How much did I spend?",
      conversationContext: {
        turnCount: -5,
      },
    },
  };
  const err = await runValidation(analyticsQueryValidation, req);
  assert.ok(err);
});

// ── 3. Deterministic Engine Computations ─────────────────────────────────────

test("deterministic category comparison identifies largest increase and delta", async () => {
  const originalExecute = analyticsDb.execute;

  analyticsDb.execute = async (sql, values) => {
    // Check user_id scoping
    assert.equal(values[0], 101);

    if (sql.includes("DATE(t.transaction_date) >= ?") && sql.includes("GROUP BY c.id, c.name")) {
      const startDate = values[1];
      if (startDate === "2026-10-01") {
        // Current month
        return [
          [
            { id: 1, name: "Food", total: "15000.00", count: 10 },
            { id: 2, name: "Transport", total: "3000.00", count: 3 },
          ],
        ];
      } else {
        // Previous month (2026-09-01)
        return [
          [
            { id: 1, name: "Food", total: "10000.00", count: 8 },
            { id: 2, name: "Transport", total: "4000.00", count: 4 },
          ],
        ];
      }
    }
    return [[]];
  };

  try {
    const res = await executeAnalyticsQuery(101, {
      intent: "category_comparison",
      period: "current_month",
      month: "2026-10",
    });

    assert.equal(res.intent, "category_comparison");
    assert.ok(res.answer.includes("Calculated Fact:"));
    assert.equal(res.metrics.largestIncrease.name, "Food");
    assert.equal(res.metrics.largestIncrease.difference, 5000);
    assert.equal(res.metrics.largestIncrease.percentChange, "50.0");
    assert.equal(res.conversationContext.activeCategory, "Food");
  } finally {
    analyticsDb.execute = originalExecute;
  }
});

test("deterministic budget status with category correctly evaluates over-budget status", async () => {
  const originalExecute = analyticsDb.execute;

  analyticsDb.execute = async (sql, values) => {
    assert.equal(values[0], 101);
    if (sql.includes("FROM budgets b")) {
      return [
        [
          { id: 1, category_id: 10, budget_limit: "5000.00", category_name: "Food" },
          { id: 2, category_id: 20, budget_limit: "2000.00", category_name: "Utilities" },
        ],
      ];
    }
    if (sql.includes("category_id = ?") && sql.includes("type = 'expense'")) {
      const catId = values[1];
      if (catId === 10) return [[{ spent: "6500.00", count: 5 }]]; // Over budget by 1500
      if (catId === 20) return [[{ spent: "1000.00", count: 2 }]];
    }
    return [[]];
  };

  try {
    const res = await executeAnalyticsQuery(101, {
      intent: "budget_status",
      category: "Food",
      period: "current_month",
      month: "2026-10",
    });

    assert.equal(res.intent, "budget_status");
    assert.ok(res.answer.includes("Yes, you are exceeding your Food budget"));
    assert.equal(res.metrics.categoryBudget.status, "exceeded");
    assert.equal(res.metrics.categoryBudget.spent, 6500);
    assert.equal(res.metrics.categoryBudget.remaining, 0);
  } finally {
    analyticsDb.execute = originalExecute;
  }
});

test("deterministic remaining allowance computes exact residual figures", async () => {
  const originalExecute = analyticsDb.execute;

  analyticsDb.execute = async (sql, values) => {
    assert.equal(values[0], 101);
    if (sql.includes("FROM budgets b")) {
      return [
        [{ id: 1, category_id: 10, budget_limit: "8000.00", category_name: "Food" }],
      ];
    }
    if (sql.includes("category_id = ?") && sql.includes("type = 'expense'")) {
      return [[{ spent: "6500.00", count: 5 }]];
    }
    if (sql.includes("total_income") && sql.includes("total_expense")) {
      return [[{ total_income: "50000.00", total_expense: "25000.00", transaction_count: 10 }]];
    }
    return [[]];
  };

  try {
    const res = await executeAnalyticsQuery(101, {
      intent: "remaining_allowance",
      category: "Food",
      period: "current_month",
      month: "2026-10",
    });

    assert.equal(res.intent, "remaining_allowance");
    assert.ok(res.answer.includes("You can still spend ₹1,500.00 in your Food budget"));
    assert.equal(res.metrics.categoryBudget.remaining, 1500);
  } finally {
    analyticsDb.execute = originalExecute;
  }
});

test("deterministic unusual spending identifies spikes and large transactions", async () => {
  const originalExecute = analyticsDb.execute;

  analyticsDb.execute = async (sql, values) => {
    assert.equal(values[0], 101);

    // Total spending
    if (sql.includes("SELECT COALESCE(SUM(amount), 0)") && !sql.includes("GROUP BY")) {
      return [[{ total_spending: "20000.00", transaction_count: 5 }]]; // Avg = 4000
    }
    // Categories
    if (sql.includes("GROUP BY c.id, c.name")) {
      const startDate = values[1];
      if (startDate === "2026-10-01") {
        return [
          [{ id: 1, name: "Shopping", total: "10000.00", count: 2 }],
        ];
      } else {
        return [
          [{ id: 1, name: "Shopping", total: "3000.00", count: 1 }], // +7000 surge (> 50%)
        ];
      }
    }
    // Largest expenses
    if (sql.includes("ORDER BY t.amount DESC")) {
      return [
        [
          {
            id: 1,
            title: "Laptop Purchase",
            amount: "15000.00", // >= 2.5 * 4000 = 10000
            transaction_date: "2026-10-05",
            category_name: "Shopping",
          },
        ],
      ];
    }
    if (sql.includes("COUNT(*) AS total_count")) {
      return [[{ total_count: 5 }]];
    }
    // Budgets
    if (sql.includes("FROM budgets b")) {
      return [[]];
    }
    return [[]];
  };

  try {
    const res = await executeAnalyticsQuery(101, {
      intent: "unusual_spending",
      period: "current_month",
      month: "2026-10",
    });

    assert.equal(res.intent, "unusual_spending");
    assert.ok(res.metrics.totalIndicators >= 2);
    assert.ok(res.metrics.indicators.some((i) => i.type === "category_spike"));
    assert.ok(res.metrics.indicators.some((i) => i.type === "large_transaction"));
  } finally {
    analyticsDb.execute = originalExecute;
  }
});

test("deterministic savings opportunities calculates over-budget and discretionary trimming", async () => {
  const originalExecute = analyticsDb.execute;

  analyticsDb.execute = async (sql, values) => {
    assert.equal(values[0], 101);

    if (sql.includes("FROM budgets b")) {
      return [
        [{ id: 1, category_id: 10, budget_limit: "5000.00", category_name: "Dining" }],
      ];
    }
    if (sql.includes("category_id = ?") && sql.includes("type = 'expense'")) {
      return [[{ spent: "6500.00", count: 5 }]]; // 1500 overrun
    }
    if (sql.includes("GROUP BY c.id, c.name")) {
      return [[{ id: 1, name: "Dining", total: "6500.00", count: 5 }]];
    }
    if (sql.includes("total_income") && sql.includes("total_expense")) {
      return [[{ total_income: "50000.00", total_expense: "20000.00", transaction_count: 10 }]];
    }
    return [[]];
  };

  try {
    const res = await executeAnalyticsQuery(101, {
      intent: "savings_opportunities",
      period: "current_month",
      month: "2026-10",
    });

    assert.equal(res.intent, "savings_opportunities");
    assert.ok(res.answer.includes("Deterministic Recommendation:"));
    assert.ok(res.metrics.totalPotentialSavings >= 1500);
    assert.ok(res.metrics.opportunities.some((o) => o.type === "budget_overrun"));
  } finally {
    analyticsDb.execute = originalExecute;
  }
});

test("conversation context preserves state and increments turn count", async () => {
  const originalExecute = analyticsDb.execute;

  analyticsDb.execute = async (sql, values) => {
    return [[{ total_spending: "5000.00", transaction_count: 3 }]];
  };

  try {
    const res = await executeAnalyticsQuery(101, {
      intent: "total_spending",
      period: "current_month",
      month: "2026-10",
      conversationContext: {
        previousIntent: "spending_by_category",
        activePeriod: "current_month",
        turnCount: 2,
      },
    });

    assert.equal(res.conversationContext.turnCount, 3);
    assert.equal(res.conversationContext.previousIntent, "total_spending");
    assert.ok(res.followUpSuggestions.length >= 2);
  } finally {
    analyticsDb.execute = originalExecute;
  }
});

test("multi-tenant isolation: User A and User B conversation queries remain isolated", async () => {
  const originalExecute = analyticsDb.execute;

  analyticsDb.execute = async (sql, values) => {
    const queriedUserId = values[0];
    assert.ok(sql.includes("user_id = ?"));
    if (queriedUserId === 101) {
      return [[{ total_spending: "7500.00", transaction_count: 4 }]];
    } else {
      return [[{ total_spending: "1200.00", transaction_count: 1 }]];
    }
  };

  try {
    const resA = await executeAnalyticsQuery(101, { intent: "total_spending", period: "current_month" });
    const resB = await executeAnalyticsQuery(202, { intent: "total_spending", period: "current_month" });

    assert.equal(resA.metrics.totalSpending, 7500);
    assert.equal(resB.metrics.totalSpending, 1200);
  } finally {
    analyticsDb.execute = originalExecute;
  }
});
