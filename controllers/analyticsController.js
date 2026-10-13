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
import {
  getCompanionPreferences,
  upsertCompanionPreferences,
  deleteCompanionPreferences,
} from "../models/companionModel.js";
import {
  FINTRACK_CAPABILITIES,
  validateActionParameters,
} from "../services/analytics/capabilityRegistry.js";
import {
  createGoal,
  addContribution,
  getGoalById,
} from "../models/goalModel.js";
import AppError from "../utils/AppError.js";

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
      finCompanion: {
        companionName: "FIN",
        title: "Living Financial Companion",
        characterStates: [
          "idle",
          "greeting",
          "listening",
          "thinking",
          "explaining",
          "happy",
          "celebrating",
          "concerned",
          "confused",
          "error",
        ],
        capabilities: FINTRACK_CAPABILITIES,
      },
      privacyNotice: PRIVACY_NOTICE,
    },
  });
});

/**
 * GET /api/analytics/companion/preferences
 * Returns persistent companion relationship preferences for authenticated user.
 */
export const getCompanionPreferencesController = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const data = await getCompanionPreferences(userId);
  res.json({
    success: true,
    message: "Companion preferences fetched successfully",
    data,
  });
});

/**
 * PUT /api/analytics/companion/preferences
 * Updates persistent companion relationship preferences for authenticated user.
 */
export const updateCompanionPreferencesController = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const data = await upsertCompanionPreferences(userId, req.body);
  res.json({
    success: true,
    message: "Companion preferences updated successfully",
    data,
  });
});

/**
 * DELETE /api/analytics/companion/preferences
 * Resets persistent companion relationship preferences for authenticated user.
 */
export const resetCompanionPreferencesController = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const result = await deleteCompanionPreferences(userId);
  const data = await getCompanionPreferences(userId);
  res.json({
    success: true,
    message: result.message || "Companion preferences reset to default",
    data,
  });
});

/**
 * POST /api/analytics/companion/action/confirm
 * Executes a user-confirmed authorized write operation (e.g. creating savings goal).
 * Strictly scoped to req.user.id with full server-side authorization.
 */
export const confirmCompanionActionController = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { capabilityId, parameters } = req.body;

  const validation = validateActionParameters(capabilityId, parameters);
  if (!validation.isValid) {
    throw new AppError(validation.message, 400);
  }

  let result;
  let successMessage = "Action executed successfully";

  switch (capabilityId) {
    case "create_savings_goal": {
      result = await createGoal(userId, {
        name: parameters.name,
        description: parameters.description,
        targetAmount: Number(parameters.targetAmount),
        currency: parameters.currency || "INR",
        targetDate: parameters.targetDate || null,
        startingAmount: Number(parameters.startingAmount || 0),
      });
      successMessage = `Savings goal '${result.name}' created successfully`;
      break;
    }

    case "add_goal_contribution": {
      const goal = await getGoalById(parameters.goalId, userId);
      if (!goal) {
        throw new AppError("Goal not found or unauthorized", 404);
      }
      result = await addContribution(userId, {
        goalId: Number(parameters.goalId),
        amount: Number(parameters.amount),
        contributionDate: parameters.contributionDate || new Date().toISOString().slice(0, 10),
        note: parameters.note || "Added via FIN Companion",
      });
      successMessage = `Contribution of ₹${parameters.amount} added to '${goal.name}'`;
      break;
    }

    case "update_companion_preferences": {
      result = await upsertCompanionPreferences(userId, parameters);
      successMessage = "Companion preferences updated successfully";
      break;
    }

    default:
      throw new AppError(`Action capability '${capabilityId}' is not authorized for write execution.`, 403);
  }

  res.json({
    success: true,
    message: successMessage,
    data: result,
    characterState: "celebrating",
  });
});
