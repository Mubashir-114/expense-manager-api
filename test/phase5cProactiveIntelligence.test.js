import assert from "node:assert/strict";
import test from "node:test";

import analyticsDb from "../config/analyticsDb.js";
import {
  generateProactiveAlerts,
  evaluateBudgetAlerts,
  evaluateUnusualSpendingAlerts,
  evaluateSpendingTrends,
  evaluateSavingsOpportunities,
  DEFAULT_ALERT_PREFERENCES,
  ALERT_SEVERITY,
} from "../services/analytics/proactiveEngine.js";
import {
  parseUserQuery,
  SUPPORTED_INTENTS,
} from "../services/analytics/intentParser.js";
import { executeAnalyticsQuery } from "../services/analytics/analyticsEngine.js";
import {
  analyticsAlertsValidation,
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

test("Phase 5C Proactive Financial Intelligence & Smart Alerts Suite", async (suite) => {
  // ── 1. Empty Financial History ───────────────────────────────────────────────
  await suite.test("empty financial history returns zero alerts safely without crash", async () => {
    const originalExecute = analyticsDb.execute;
    analyticsDb.execute = async () => [[]];

    try {
      const result = await generateProactiveAlerts(101, {
        period: "current_month",
        month: "2026-10",
      });

      assert.equal(result.alertCount, 0);
      assert.deepEqual(result.alerts, []);
      assert.ok(result.period);
    } finally {
      analyticsDb.execute = originalExecute;
    }
  });

  // ── 2. Zero Budget Handling ──────────────────────────────────────────────────
  await suite.test("zero or negative budget limit is handled safely without division by zero", async () => {
    const originalExecute = analyticsDb.execute;

    analyticsDb.execute = async (sql) => {
      if (sql.includes("FROM budgets b")) {
        return [
          [
            { id: 1, category_id: 10, budget_limit: 0, category_name: "Food" },
            { id: 2, category_id: 11, budget_limit: -500, category_name: "Rent" },
          ],
        ];
      }
      return [[{ spent: 500, count: 2 }]];
    };

    try {
      const alerts = await evaluateBudgetAlerts(
        101,
        { month: 10, year: 2026, startDate: "2026-10-01", endDate: "2026-10-31", label: "October 2026" },
        80
      );

      // Zero and negative budgets must not emit invalid or division-by-zero alerts
      assert.equal(alerts.length, 0);
    } finally {
      analyticsDb.execute = originalExecute;
    }
  });

  // ── 3. Overspending & Severity Classification ───────────────────────────────
  await suite.test("overspending emits critical alert with exact overrun and calculations", async () => {
    const originalExecute = analyticsDb.execute;

    analyticsDb.execute = async (sql) => {
      if (sql.includes("FROM budgets b")) {
        return [[{ id: 42, category_id: 5, budget_limit: 10000, category_name: "Dining" }]];
      }
      if (sql.includes("FROM transactions")) {
        return [[{ spent: 12500, count: 6 }]];
      }
      return [[]];
    };

    try {
      const alerts = await evaluateBudgetAlerts(
        101,
        { month: 10, year: 2026, startDate: "2026-10-01", endDate: "2026-10-31", label: "October 2026" },
        80
      );

      assert.equal(alerts.length, 1);
      const alert = alerts[0];
      assert.equal(alert.type, "budget_exceeded");
      assert.equal(alert.severity, ALERT_SEVERITY.CRITICAL);
      assert.equal(alert.category, "Dining");
      assert.equal(alert.calculatedValues.difference, 2500);
      assert.equal(alert.calculatedValues.percentage, "125.0");
      assert.ok(alert.explanation.includes("₹2,500 over budget"));
      assert.ok(alert.suggestedQuestions.length >= 2);
    } finally {
      analyticsDb.execute = originalExecute;
    }
  });

  // ── 4. Threshold Boundaries (80% approaching vs 100% reached vs >100%) ──────
  await suite.test("threshold boundaries correctly differentiate approaching, reached, and exceeded", async () => {
    const originalExecute = analyticsDb.execute;

    analyticsDb.execute = async (sql, params) => {
      if (sql.includes("FROM budgets b")) {
        return [
          [
            { id: 1, category_id: 10, budget_limit: 1000, category_name: "ApproachingCat" },
            { id: 2, category_id: 20, budget_limit: 1000, category_name: "ReachedCat" },
            { id: 3, category_id: 30, budget_limit: 1000, category_name: "ExceededCat" },
            { id: 4, category_id: 40, budget_limit: 1000, category_name: "OnTrackCat" },
          ],
        ];
      }
      if (sql.includes("FROM transactions")) {
        const catId = params[1];
        if (catId === 10) return [[{ spent: 850, count: 3 }]]; // 85%
        if (catId === 20) return [[{ spent: 1000, count: 4 }]]; // 100%
        if (catId === 30) return [[{ spent: 1100, count: 5 }]]; // 110%
        if (catId === 40) return [[{ spent: 600, count: 2 }]]; // 60%
      }
      return [[]];
    };

    try {
      const alerts = await evaluateBudgetAlerts(
        101,
        { month: 10, year: 2026, startDate: "2026-10-01", endDate: "2026-10-31", label: "October 2026" },
        80
      );

      assert.equal(alerts.length, 3);
      const exceeded = alerts.find((a) => a.type === "budget_exceeded");
      const reached = alerts.find((a) => a.type === "budget_reached");
      const approaching = alerts.find((a) => a.type === "budget_approaching");

      assert.ok(exceeded);
      assert.equal(exceeded.severity, ALERT_SEVERITY.CRITICAL);
      assert.equal(exceeded.category, "ExceededCat");

      assert.ok(reached);
      assert.equal(reached.severity, ALERT_SEVERITY.WARNING);
      assert.equal(reached.category, "ReachedCat");

      assert.ok(approaching);
      assert.equal(approaching.severity, ALERT_SEVERITY.WARNING);
      assert.equal(approaching.category, "ApproachingCat");
    } finally {
      analyticsDb.execute = originalExecute;
    }
  });

  // ── 5. Duplicate Alerts Prevention & Stable Deduplication IDs ────────────────
  await suite.test("deduplication prevents duplicate warnings for the same budget", async () => {
    const originalExecute = analyticsDb.execute;

    analyticsDb.execute = async (sql) => {
      if (sql.includes("FROM budgets b")) {
        return [[{ id: 7, category_id: 15, budget_limit: 5000, category_name: "Shopping" }]];
      }
      if (sql.includes("FROM transactions")) {
        return [[{ spent: 6000, count: 4 }]]; // 120%
      }
      return [[]];
    };

    try {
      const period = { month: 10, year: 2026, startDate: "2026-10-01", endDate: "2026-10-31", label: "October 2026", type: "current_month" };
      const alerts = await evaluateBudgetAlerts(101, period, 80);

      assert.equal(alerts.length, 1);
      assert.equal(alerts[0].type, "budget_exceeded");
      assert.equal(alerts[0].id, "budget_exceeded_7_2026_10");
    } finally {
      analyticsDb.execute = originalExecute;
    }
  });

  // ── 6. Insufficient Historical Information ──────────────────────────────────
  await suite.test("insufficient historical samples suppresses misleading anomaly alerts", async () => {
    const originalExecute = analyticsDb.execute;

    analyticsDb.execute = async (sql) => {
      if (sql.includes("SELECT COUNT(id) AS total_count")) {
        return [[{ total_count: 2, total_spent: 300 }]]; // Only 2 historical transactions
      }
      return [[]];
    };

    try {
      const period = {
        month: 10,
        year: 2026,
        startDate: "2026-10-01",
        endDate: "2026-10-31",
        label: "October 2026",
        previousPeriod: { startDate: "2026-09-01", endDate: "2026-09-30", label: "September 2026" },
      };

      const alerts = await evaluateUnusualSpendingAlerts(101, period);
      assert.equal(alerts.length, 0); // Correctly suppressed
    } finally {
      analyticsDb.execute = originalExecute;
    }
  });

  // ── 7. Incomplete-Month Comparisons ─────────────────────────────────────────
  await suite.test("incomplete-month safety uses normalized like-for-like elapsed period", async () => {
    const originalExecute = analyticsDb.execute;

    const capturedQueries = [];
    analyticsDb.execute = async (sql, params) => {
      capturedQueries.push({ sql, params });
      if (sql.includes("FROM transactions") && params && params[1]) {
        if (params[1].startsWith("2026-10")) {
          return [[{ total: 8000, count: 5 }]];
        }
        return [[{ total: 5000, count: 4 }]];
      }
      return [[]];
    };

    try {
      const now = new Date(Date.UTC(2026, 9, 13)); // Oct 13, 2026
      const period = {
        type: "current_month",
        month: 10,
        year: 2026,
        startDate: "2026-10-01",
        endDate: "2026-10-31",
        label: "October 2026",
        previousPeriod: { startDate: "2026-09-01", endDate: "2026-09-30", label: "September 2026" },
      };

      const alerts = await evaluateSpendingTrends(101, period, now);

      assert.equal(alerts.length, 1);
      assert.equal(alerts[0].type, "spending_trend_increase");
      assert.equal(alerts[0].calculatedValues.isProrated, true);
      assert.ok(alerts[0].explanation.includes("same period (Days 1–13)"));

      const curQuery = capturedQueries.find((q) => q.params[1] === "2026-10-01");
      const prevQuery = capturedQueries.find((q) => q.params[1] === "2026-09-01");
      assert.equal(curQuery.params[2], "2026-10-13");
      assert.equal(prevQuery.params[2], "2026-09-13");
    } finally {
      analyticsDb.execute = originalExecute;
    }
  });

  // ── 8. Savings Opportunities (Evidence-Based & No Invented Figures) ──────────
  await suite.test("savings opportunities calculates over-budget and discretionary trimming exactly", async () => {
    const originalExecute = analyticsDb.execute;

    analyticsDb.execute = async (sql, params) => {
      if (sql.includes("FROM budgets b")) {
        return [[{ id: 9, category_id: 25, budget_limit: 4000, category_name: "Food" }]];
      }
      if (sql.includes("SELECT COALESCE(SUM(amount), 0) AS spent")) {
        return [[{ spent: 5500, count: 4 }]]; // Over budget by 1500
      }
      if (sql.includes("GROUP BY c.id, c.name") && params[1] === "2026-10-01") {
        return [[{ id: 30, name: "Entertainment", total: 3000, count: 4 }]];
      }
      if (sql.includes("GROUP BY c.id, c.name") && params[1] === "2026-09-01") {
        return [[{ id: 30, name: "Entertainment", total: 1000 }]]; // Grew by 2000
      }
      return [[]];
    };

    try {
      const period = {
        month: 10,
        year: 2026,
        startDate: "2026-10-01",
        endDate: "2026-10-31",
        label: "October 2026",
        previousPeriod: { startDate: "2026-09-01", endDate: "2026-09-30", label: "September 2026" },
      };

      const alerts = await evaluateSavingsOpportunities(101, period);

      assert.equal(alerts.length, 2);
      const budgetSaving = alerts.find((a) => a.type === "savings_budget_alignment");
      const discSaving = alerts.find((a) => a.type === "savings_discretionary_trim");

      assert.ok(budgetSaving);
      assert.equal(budgetSaving.calculatedValues.potentialSavings, 1500);
      assert.ok(budgetSaving.explanation.includes("save ₹1,500"));

      assert.ok(discSaving);
      assert.equal(discSaving.calculatedValues.potentialSavings, 1000); // 50% of 2000 increase
      assert.ok(discSaving.explanation.includes("recover ₹1,000"));
    } finally {
      analyticsDb.execute = originalExecute;
    }
  });

  // ── 9. Multi-Tenant Isolation & User Scoping ────────────────────────────────
  await suite.test("multi-tenant isolation: User A and User B alerts are strictly scoped", async () => {
    const originalExecute = analyticsDb.execute;

    const capturedUserIds = [];
    analyticsDb.execute = async (sql, params) => {
      capturedUserIds.push(params[0]);
      return [[]];
    };

    try {
      await generateProactiveAlerts(101, { month: "2026-10" });
      await generateProactiveAlerts(202, { month: "2026-10" });

      assert.ok(capturedUserIds.length > 0);
      const userAQueries = capturedUserIds.slice(0, capturedUserIds.length / 2);
      const userBQueries = capturedUserIds.slice(capturedUserIds.length / 2);

      assert.ok(userAQueries.every((id) => id === 101));
      assert.ok(userBQueries.every((id) => id === 202));
    } finally {
      analyticsDb.execute = originalExecute;
    }
  });

  // ── 10. User Alert Preferences & Toggles ─────────────────────────────────────
  await suite.test("disabled alert preferences suppresses proactive alerts according to toggles", async () => {
    const originalExecute = analyticsDb.execute;

    analyticsDb.execute = async (sql) => {
      if (sql.includes("FROM budgets b")) {
        return [[{ id: 1, category_id: 10, budget_limit: 1000, category_name: "Food" }]];
      }
      if (sql.includes("FROM transactions")) {
        return [[{ spent: 2000, count: 5 }]];
      }
      return [[]];
    };

    try {
      // A: Proactive insights disabled globally
      const resOff = await generateProactiveAlerts(
        101,
        { month: "2026-10" },
        { enableProactiveInsights: false }
      );
      assert.equal(resOff.alertCount, 0);

      // B: Budget alerts disabled specifically
      const resBudgetsOff = await generateProactiveAlerts(
        101,
        { month: "2026-10" },
        { enableBudgetAlerts: false, enableSavingsAlerts: false }
      );
      const hasBudgetAlerts = resBudgetsOff.alerts.some((a) => a.type.startsWith("budget_"));
      assert.equal(hasBudgetAlerts, false);
    } finally {
      analyticsDb.execute = originalExecute;
    }
  });

  // ── 11. Conversational AI Integration Questions (Feature 5C.5) ──────────────
  await suite.test("conversational AI resolves Phase 5C alert follow-up questions", async () => {
    // 1. "Why am I over budget?"
    const q1 = parseUserQuery({
      question: "Why am I over budget?",
      conversationContext: {
        previousIntent: "budget_status",
        activeCategory: "Food",
        activePeriod: "current_month",
        turnCount: 1,
      },
    });
    assert.equal(q1.intent, "budget_status");
    assert.equal(q1.category, "Food");

    // 2. "Explain this spending increase"
    const q2 = parseUserQuery({
      question: "Explain this spending increase",
      conversationContext: {
        previousIntent: "category_comparison",
        activeCategory: "Shopping",
        activePeriod: "current_month",
        turnCount: 2,
      },
    });
    assert.equal(q2.intent, "category_comparison");
    assert.equal(q2.category, "Shopping");

    // 3. "How was this calculated?"
    const q3 = parseUserQuery({
      question: "How was this calculated?",
      conversationContext: {
        previousIntent: "budget_status",
        activeCategory: "Food",
        turnCount: 3,
      },
    });
    assert.equal(q3.intent, "explain_calculation");
    assert.equal(q3.category, "Food");

    // 4. "Compare this with last month"
    const q4 = parseUserQuery({
      question: "Compare this with last month",
      conversationContext: {
        previousIntent: "spending_trend",
        activePeriod: "current_month",
        turnCount: 4,
      },
    });
    assert.equal(q4.intent, "spending_trend");

    // 5. "What can I do to improve?"
    const q5 = parseUserQuery({
      question: "What can I do to improve?",
      conversationContext: {
        previousIntent: "savings_opportunities",
        activeCategory: "Food",
        turnCount: 5,
      },
    });
    assert.equal(q5.intent, "savings_opportunities");
    assert.equal(q5.category, "Food");
  });

  // ── 12. Explain Calculation Engine Deterministic Output ─────────────────────
  await suite.test("deterministic explain_calculation returns calculation methodology and sources", async () => {
    const originalExecute = analyticsDb.execute;

    analyticsDb.execute = async (sql) => {
      if (sql.includes("FROM budgets b")) {
        return [[{ id: 1, category_id: 10, budget_limit: 5000, category_name: "Food" }]];
      }
      if (sql.includes("SELECT COALESCE(SUM(amount), 0) AS spent")) {
        return [[{ spent: 6500, count: 4 }]];
      }
      return [[]];
    };

    try {
      const res = await executeAnalyticsQuery(101, {
        intent: "explain_calculation",
        category: "Food",
        conversationContext: {
          previousIntent: "budget_status",
          activeCategory: "Food",
        },
      });

      assert.equal(res.intent, "explain_calculation");
      assert.ok(res.answer.includes("Calculation Methodology for Food Budget:"));
      assert.ok(res.answer.includes("spent - budget_limit"));
      assert.ok(res.provenance);
    } finally {
      analyticsDb.execute = originalExecute;
    }
  });

  // ── 13. Query Validation Rejects Malicious or Unknown Parameters ─────────────
  await suite.test("analytics alerts validation rejects unknown query parameters", async () => {
    const req = {
      query: {
        period: "current_month",
        maliciousParam: "DROP TABLE transactions",
      },
    };

    const failure = await runValidation(analyticsAlertsValidation, req);
    assert.ok(failure);
    assert.equal(failure.statusCode, 400);
    assert.ok(failure.errors && failure.errors.length > 0);
  });

  await suite.test("analytics alerts validation validates budgetThreshold integer range", async () => {
    const reqInvalid = {
      query: {
        budgetThreshold: "150", // Out of range 1-100
      },
    };

    const failure = await runValidation(analyticsAlertsValidation, reqInvalid);
    assert.ok(failure);
    assert.equal(failure.statusCode, 400);
    assert.ok(failure.errors && failure.errors.length > 0);
  });
});
