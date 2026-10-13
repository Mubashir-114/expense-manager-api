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
      privacyNotice: PRIVACY_NOTICE,
    },
  });
});
