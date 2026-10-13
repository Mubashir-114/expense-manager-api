import asyncHandler from "../utils/asyncHandler.js";
import {
  parseUserQuery,
  SUPPORTED_INTENTS,
  SUGGESTED_QUESTIONS,
} from "../services/analytics/intentParser.js";
import {
  executeAnalyticsQuery,
  getDeterministicInsights,
} from "../services/analytics/analyticsEngine.js";
import {
  generateProactiveAlerts,
  DEFAULT_ALERT_PREFERENCES,
} from "../services/analytics/proactiveEngine.js";
import { PRIVACY_NOTICE } from "../services/analytics/responseTemplater.js";

/**
 * POST /api/analytics/query
 * Processes a financial analytics question or structured intent.
 * Scoped strictly to req.user.id.
 */
export const queryAnalytics = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const parsed = parseUserQuery({
    question: req.body.question,
    intent: req.body.intent,
    period: req.body.period,
    startDate: req.body.startDate,
    endDate: req.body.endDate,
    month: req.body.month,
    category: req.body.category,
    conversationContext: req.body.conversationContext,
  });

  const result = await executeAnalyticsQuery(userId, parsed);

  res.json({
    success: true,
    message: result.isRefusal ? "Query processed with safety refusal" : "Analytics query processed successfully",
    data: result,
  });
});

/**
 * GET /api/analytics/insights
 * Returns deterministic financial insights for the active period.
 * Scoped strictly to req.user.id.
 */
export const getInsights = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const data = await getDeterministicInsights(userId, req.query);

  res.json({
    success: true,
    message: "Financial insights fetched successfully",
    data,
  });
});

/**
 * GET /api/analytics/alerts
 * Returns deterministic proactive financial alerts for authenticated user.
 * Scoped strictly to req.user.id.
 */
export const getProactiveAlerts = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const preferences = {
    enableProactiveInsights: req.query.enableProactiveInsights !== "false",
    enableBudgetAlerts: req.query.enableBudgetAlerts !== "false",
    enableUnusualAlerts: req.query.enableUnusualAlerts !== "false",
    enableSavingsAlerts: req.query.enableSavingsAlerts !== "false",
    enableSpendingTrends: req.query.enableSpendingTrends !== "false",
    budgetWarningThreshold: req.query.budgetThreshold
      ? Number(req.query.budgetThreshold)
      : DEFAULT_ALERT_PREFERENCES.budgetWarningThreshold,
  };

  const data = await generateProactiveAlerts(userId, req.query, preferences);

  res.json({
    success: true,
    message: "Proactive financial alerts fetched successfully",
    data,
  });
});

/**
 * GET /api/analytics/capabilities
 * Returns the allowlisted capabilities, example questions, and privacy guarantee.
 */
export const getCapabilities = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    message: "Analytics capabilities fetched successfully",
    data: {
      supportedIntents: SUPPORTED_INTENTS,
      suggestedQuestions: SUGGESTED_QUESTIONS,
      constraints: {
        maxDateRangeDays: 365,
        maxQuestionLength: 200,
        readOnly: true,
        prohibitsMutations: true,
        prohibitsBankAccess: true,
        prohibitsSmsInboxAccess: true,
        prohibitsExternalAi: true,
      },
      proactiveAlerts: {
        supportedAlertTypes: [
          "budget_exceeded",
          "budget_reached",
          "budget_approaching",
          "budget_rapid_spending",
          "unusual_category_spike",
          "unusual_large_transaction",
          "spending_trend_increase",
          "spending_trend_decrease",
          "savings_budget_alignment",
          "savings_discretionary_trim",
          "informational_summary",
        ],
        defaultThresholds: {
          budgetApproaching: 80,
          budgetReached: 100,
          budgetExceeded: 100,
        },
      },
      privacyNotice: PRIVACY_NOTICE,
    },
  });
});
