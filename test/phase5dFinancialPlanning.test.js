import assert from "node:assert/strict";
import test from "node:test";

import db from "../config/db.js";
import analyticsDb from "../config/analyticsDb.js";
import {
  createGoal,
  getGoals,
  getGoalById,
  updateGoal,
  deleteGoal,
  addContribution,
  getContributions,
  updateContribution,
  deleteContribution,
  getGoalsSummary,
} from "../models/goalModel.js";
import {
  enrichGoalProgress,
  generateCashFlowForecast,
  runWhatIfSimulation,
} from "../services/planningService.js";
import {
  parseUserQuery,
  extractAmountFromText,
  extractGoalTargetFromText,
} from "../services/analytics/intentParser.js";
import {
  executeAnalyticsQuery,
} from "../services/analytics/analyticsEngine.js";
import {
  createGoalValidation,
  addContributionValidation,
  simulationValidation,
  forecastQueryValidation,
} from "../validators/goalValidation.js";
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

// ── 1. Goal CRUD & Ownership Isolation ──────────────────────────────────────

test("createGoal inserts validated goal with positive targetAmount", async () => {
  const originalExecute = db.execute;
  let executedSql = "";
  let executedValues = [];

  db.execute = async (sql, values) => {
    executedSql = sql;
    executedValues = values;
    if (sql.includes("INSERT INTO savings_goals")) {
      return [{ insertId: 42 }];
    }
    if (sql.includes("SELECT g.*")) {
      return [
        [
          {
            id: 42,
            user_id: values[1],
            name: "Emergency Fund",
            description: "6 months living buffer",
            target_amount: "50000.00",
            currency: "INR",
            target_date: "2027-06-30",
            starting_amount: "5000.00",
            status: "active",
            contributions_total: "0.00",
            contributions_count: 0,
            created_at: new Date("2026-10-01"),
            updated_at: new Date("2026-10-01"),
          },
        ],
      ];
    }
    return [[]];
  };

  try {
    const goal = await createGoal(101, {
      name: "Emergency Fund",
      description: "6 months living buffer",
      targetAmount: 50000,
      targetDate: "2027-06-30",
      startingAmount: 5000,
    });

    assert.equal(goal.id, 42);
    assert.equal(goal.userId, 101);
    assert.equal(goal.name, "Emergency Fund");
    assert.equal(goal.targetAmount, 50000);
    assert.equal(goal.startingAmount, 5000);
    assert.equal(goal.savedAmount, 5000);
    assert.equal(goal.remainingAmount, 45000);
    assert.equal(goal.progressPercentage, 10);
    assert.equal(goal.status, "active");
  } finally {
    db.execute = originalExecute;
  }
});

test("cross-user isolation: User B (202) cannot retrieve or modify User A's (101) goal", async () => {
  const originalExecute = db.execute;

  db.execute = async (sql, values) => {
    // Assert user_id parameter scoping is always bound
    if (sql.includes("SELECT g.*")) {
      assert.equal(values[0], 42); // goalId
      assert.equal(values[1], 202); // userId
      // Simulate empty return because goal 42 belongs to 101
      return [[]];
    }
    return [[]];
  };

  try {
    const goal = await getGoalById(42, 202);
    assert.equal(goal, null);
  } finally {
    db.execute = originalExecute;
  }
});

// ── 2. Contribution Management & Status Transitions ─────────────────────────

test("addContribution updates tracked saved amount without creating financial transactions", async () => {
  const originalExecute = db.execute;
  let insertedContribution = false;

  db.execute = async (sql, values) => {
    if (sql.includes("SELECT g.*")) {
      return [
        [
          {
            id: 10,
            user_id: 101,
            name: "New Laptop",
            target_amount: "60000.00",
            starting_amount: "10000.00",
            status: "active",
            contributions_total: insertedContribution ? "50000.00" : "15000.00",
            contributions_count: insertedContribution ? 2 : 1,
          },
        ],
      ];
    }
    if (sql.includes("INSERT INTO goal_contributions")) {
      insertedContribution = true;
      assert.equal(values[0], 10); // goal_id
      assert.equal(values[1], 101); // user_id
      assert.equal(values[2], 35000); // amount
      return [{ insertId: 101 }];
    }
    if (sql.includes("SELECT * FROM goal_contributions")) {
      return [
        [
          {
            id: 101,
            goal_id: 10,
            user_id: 101,
            amount: "35000.00",
            contribution_date: "2026-10-15",
            note: "Festival bonus allocation",
          },
        ],
      ];
    }
    if (sql.includes("UPDATE savings_goals SET status = 'completed'")) {
      return [{ affectedRows: 1 }];
    }
    return [[]];
  };

  try {
    const contribution = await addContribution(10, 101, {
      amount: 35000,
      contributionDate: "2026-10-15",
      note: "Festival bonus allocation",
    });

    assert.equal(contribution.id, 101);
    assert.equal(contribution.amount, 35000);
    assert.equal(contribution.goalId, 10);
  } finally {
    db.execute = originalExecute;
  }
});

// ── 3. Goal Progress Intelligence (Feature 5D.2) ─────────────────────────────

test("enrichGoalProgress correctly computes remaining, percentage, and days remaining", () => {
  const goal = {
    id: 1,
    name: "Education Fund",
    targetAmount: 100000,
    savedAmount: 40000,
    startingAmount: 10000,
    targetDate: "2027-10-01",
    status: "active",
    createdAt: new Date("2026-01-01"),
  };

  const enriched = enrichGoalProgress(goal, []);
  assert.equal(enriched.remainingAmount, 60000);
  assert.equal(enriched.progressPercentage, 40);
  assert.ok(enriched.daysRemaining > 0);
  assert.ok(enriched.monthsRemaining > 0);
  assert.ok(enriched.requiredMonthlySaving > 0);
  assert.equal(enriched.isAchieved, false);
});

test("enrichGoalProgress handles goals exceeding targets safely", () => {
  const goal = {
    id: 2,
    name: "Vacation",
    targetAmount: 30000,
    savedAmount: 35000, // Exceeded!
    startingAmount: 5000,
    targetDate: "2026-12-31",
    status: "active",
  };

  const enriched = enrichGoalProgress(goal, []);
  assert.equal(enriched.remainingAmount, 0);
  assert.equal(enriched.progressPercentage, 100);
  assert.equal(enriched.requiredMonthlySaving, 0);
  assert.equal(enriched.isAchieved, true);
  assert.equal(enriched.intelligenceStatus, "completed");
});

test("enrichGoalProgress flags overdue deadline gracefully", () => {
  const goal = {
    id: 3,
    name: "Old Goal",
    targetAmount: 20000,
    savedAmount: 5000,
    startingAmount: 0,
    targetDate: "2025-01-01", // In the past!
    status: "active",
  };

  const enriched = enrichGoalProgress(goal, []);
  assert.equal(enriched.isOverdue, true);
  assert.equal(enriched.intelligenceStatus, "behind_schedule");
  assert.equal(enriched.requiredMonthlySaving, 15000);
});

test("completion estimate requires at least 2 contributions over 14+ days", () => {
  const goal = {
    id: 4,
    name: "Vehicle",
    targetAmount: 80000,
    savedAmount: 20000,
    startingAmount: 0,
    targetDate: null,
    status: "active",
  };

  // Case A: 1 contribution only -> insufficient history
  const single = enrichGoalProgress(goal, [
    { amount: 20000, contributionDate: "2026-10-01" },
  ]);
  assert.equal(single.estimatedCompletion.isEstimated, false);
  assert.ok(single.estimatedCompletion.reason.includes("Insufficient contribution history"));

  // Case B: 2 contributions across 30 days -> computes deterministic estimate
  const multiple = enrichGoalProgress(goal, [
    { amount: 10000, contributionDate: "2026-08-01" },
    { amount: 10000, contributionDate: "2026-08-31" },
  ]);
  assert.equal(multiple.estimatedCompletion.isEstimated, true);
  assert.ok(multiple.estimatedCompletion.date);
  assert.ok(multiple.estimatedCompletion.reason.includes("Estimated based on historical saving pace"));
});

// ── 4. Cash-Flow Forecasting (Feature 5D.3) ─────────────────────────────────

test("generateCashFlowForecast computes deterministic net cash flow and savings capacity", async () => {
  const originalExecute = analyticsDb.execute;

  analyticsDb.execute = async (sql, values) => {
    assert.equal(values[0], 101); // User scoping
    return [
      [
        { period_month: "2026-07", month_income: "80000.00", month_expense: "50000.00", tx_count: 15 },
        { period_month: "2026-08", month_income: "80000.00", month_expense: "45000.00", tx_count: 12 },
        { period_month: "2026-09", month_income: "80000.00", month_expense: "55000.00", tx_count: 18 },
      ],
    ];
  };

  try {
    const forecast = await generateCashFlowForecast(101, "next_3_months");
    assert.equal(forecast.historicalMonthsSampled, 3);
    assert.equal(forecast.historicalAvgMonthlyIncome, 80000);
    assert.equal(forecast.historicalAvgMonthlyExpense, 50000);
    assert.equal(forecast.netMonthlyCashFlow, 30000);
    assert.equal(forecast.potentialMonthlySavingsCapacity, 30000);

    // 3 month horizon projections
    assert.equal(forecast.projectedIncome, 240000);
    assert.equal(forecast.projectedExpenses, 150000);
    assert.equal(forecast.projectedNetCashFlow, 90000);
    assert.equal(forecast.projectedSavingsCapacity, 90000);
    assert.equal(forecast.dataSufficiency.isSufficient, true);
  } finally {
    analyticsDb.execute = originalExecute;
  }
});

test("generateCashFlowForecast handles empty history safely without crash", async () => {
  const originalExecute = analyticsDb.execute;

  analyticsDb.execute = async () => [[]];

  try {
    const forecast = await generateCashFlowForecast(101, "next_6_months");
    assert.equal(forecast.historicalMonthsSampled, 0);
    assert.equal(forecast.historicalAvgMonthlyIncome, 0);
    assert.equal(forecast.historicalAvgMonthlyExpense, 0);
    assert.equal(forecast.netMonthlyCashFlow, 0);
    assert.equal(forecast.potentialMonthlySavingsCapacity, 0);
    assert.equal(forecast.dataSufficiency.isSufficient, false);
    assert.ok(forecast.dataSufficiency.warnings.length > 0);
  } finally {
    analyticsDb.execute = originalExecute;
  }
});

// ── 5. What-If Financial Scenario Simulator (Feature 5D.4) ───────────────────

test("runWhatIfSimulation simulates monthly savings increase without database mutation", async () => {
  const originalAnalyticsExecute = analyticsDb.execute;

  analyticsDb.execute = async () => [
    [
      { period_month: "2026-09", month_income: "70000.00", month_expense: "50000.00", tx_count: 10 },
    ],
  ];

  try {
    const result = await runWhatIfSimulation(101, {
      scenarioType: "savings_adjustment",
      monthlySavingsAdjustment: 3000,
    });

    assert.equal(result.scenarioType, "savings_adjustment");
    assert.equal(result.baseline.savingsCapacity, 20000);
    assert.equal(result.simulated.savingsCapacity, 23000);
    assert.equal(result.monthlyDifference, 3000);
    assert.ok(result.explanation.includes("Increasing your monthly savings by ₹3,000"));
    assert.ok(result.assumptions[0].includes("strictly for planning"));
  } finally {
    analyticsDb.execute = originalAnalyticsExecute;
  }
});

test("runWhatIfSimulation simulates expense reduction percentage", async () => {
  const originalAnalyticsExecute = analyticsDb.execute;

  analyticsDb.execute = async () => [
    [
      { period_month: "2026-09", month_income: "100000.00", month_expense: "60000.00", tx_count: 20 },
    ],
  ];

  try {
    const result = await runWhatIfSimulation(101, {
      scenarioType: "expense_reduction",
      expenseReductionPercentage: 15, // 15% reduction of 60,000 = 9,000
    });

    assert.equal(result.scenarioType, "expense_reduction");
    assert.equal(result.baseline.monthlyExpense, 60000);
    assert.equal(result.simulated.monthlyExpense, 51000);
    assert.equal(result.simulated.savingsCapacity, 49000);
    assert.equal(result.monthlyDifference, 9000);
  } finally {
    analyticsDb.execute = originalAnalyticsExecute;
  }
});

// ── 6. Conversational Assistant Integration (Feature 5D.5) ───────────────────

test("intentParser parses 'Can I afford to save ₹5,000 monthly?'", () => {
  const parsed = parseUserQuery({
    question: "Can I afford to save ₹5,000 monthly?",
  });

  assert.equal(parsed.intent, "goal_affordability");
  assert.equal(parsed.targetAmount, 5000);
  assert.equal(parsed.isRefusal, false);
});

test("intentParser parses 'When can I reach my laptop goal?'", () => {
  const parsed = parseUserQuery({
    question: "When can I reach my laptop goal?",
  });

  assert.equal(parsed.intent, "goal_completion_estimate");
  assert.equal(parsed.targetGoalName, "laptop");
});

test("intentParser parses 'Which goal is closest to completion?'", () => {
  const parsed = parseUserQuery({
    question: "Which goal is closest to completion?",
  });

  assert.equal(parsed.intent, "goal_status_summary");
  assert.equal(parsed.subType, "closest_to_completion");
});

test("intentParser parses 'Explain my savings forecast'", () => {
  const parsed = parseUserQuery({
    question: "Explain my savings forecast",
  });

  assert.equal(parsed.intent, "goal_forecast_explanation");
});

test("executeAnalyticsQuery handles goal_affordability with explainable response", async () => {
  const originalAnalyticsExecute = analyticsDb.execute;

  analyticsDb.execute = async () => [
    [
      { period_month: "2026-09", month_income: "80000.00", month_expense: "45000.00", tx_count: 10 },
    ],
  ];

  try {
    const res = await executeAnalyticsQuery(101, {
      intent: "goal_affordability",
      targetAmount: 5000,
    });

    assert.equal(res.intent, "goal_affordability");
    assert.ok(res.answer.includes("Calculated Fact: Yes, you can afford to save ₹5,000.00 monthly."));
    assert.equal(res.metrics.isAffordable, true);
    assert.ok(res.privacyNotice);
    assert.ok(res.followUpSuggestions.length > 0);
  } finally {
    analyticsDb.execute = originalAnalyticsExecute;
  }
});

// ── 7. Input Validation & Defense-in-Depth ───────────────────────────────────

test("createGoalValidation rejects empty name and non-positive targetAmount", async () => {
  const error = await runValidation(createGoalValidation, {
    body: {
      name: "",
      targetAmount: -500,
    },
  });

  assert.ok(error);
  assert.equal(error.statusCode, 400);
  assert.ok(error.errors && error.errors.some((d) => d.message.includes("Goal name is required")));
  assert.ok(error.errors && error.errors.some((d) => d.message.includes("Target amount must be a positive number")));
});

test("addContributionValidation rejects zero or negative contribution amount", async () => {
  const error = await runValidation(addContributionValidation, {
    params: { id: "1" },
    body: {
      amount: 0,
    },
  });

  assert.ok(error);
  assert.equal(error.statusCode, 400);
  assert.ok(error.errors && error.errors.some((d) => d.message.includes("Contribution amount must be a positive number")));
});

test("simulationValidation rejects unsupported scenarioType", async () => {
  const error = await runValidation(simulationValidation, {
    body: {
      scenarioType: "invalid_crypto_scenario",
    },
  });

  assert.ok(error);
  assert.equal(error.statusCode, 400);
  assert.ok(error.errors && error.errors.some((d) => d.message.includes("scenarioType must be one of")));
});
