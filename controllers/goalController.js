import asyncHandler from "../utils/asyncHandler.js";
import AppError from "../utils/AppError.js";
import {
  createGoal as createGoalModel,
  getGoals as getGoalsModel,
  getGoalById as getGoalByIdModel,
  updateGoal as updateGoalModel,
  deleteGoal as deleteGoalModel,
  addContribution as addContributionModel,
  getContributions as getContributionsModel,
  getContributionById as getContributionByIdModel,
  updateContribution as updateContributionModel,
  deleteContribution as deleteContributionModel,
  getGoalsSummary as getGoalsSummaryModel,
} from "../models/goalModel.js";
import {
  enrichGoalProgress,
  generateCashFlowForecast,
  runWhatIfSimulation,
} from "../services/planningService.js";

/**
 * POST /api/goals
 * Creates a new savings goal.
 */
export const createGoal = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const goal = await createGoalModel(userId, req.body);
  const enriched = enrichGoalProgress(goal);

  res.status(201).json({
    success: true,
    message: "Savings goal created successfully",
    data: enriched,
  });
});

/**
 * GET /api/goals
 * Lists all goals for the authenticated user with computed progress.
 */
export const getGoals = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const rawGoals = await getGoalsModel(userId, { status: req.query.status });

  // Fetch contributions for each goal to enrich with intelligence
  const enrichedGoals = await Promise.all(
    rawGoals.map(async (g) => {
      const { contributions } = await getContributionsModel(g.id, userId, { limit: 100 });
      return enrichGoalProgress(g, contributions);
    })
  );

  res.json({
    success: true,
    message: "Savings goals retrieved successfully",
    data: enrichedGoals,
  });
});

/**
 * GET /api/goals/summary
 * Returns aggregated savings goals dashboard metrics.
 */
export const getGoalsSummary = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const summary = await getGoalsSummaryModel(userId);

  res.json({
    success: true,
    message: "Savings goals summary retrieved successfully",
    data: summary,
  });
});

/**
 * GET /api/goals/forecast
 * Deterministic cash-flow forecast across selected horizon.
 */
export const getCashFlowForecast = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const horizon = req.query.horizon || "next_3_months";
  const forecast = await generateCashFlowForecast(userId, horizon);

  res.json({
    success: true,
    message: "Cash-flow forecast generated successfully",
    data: forecast,
  });
});

/**
 * POST /api/goals/simulate
 * Interactive what-if financial scenario simulation.
 */
export const simulateScenario = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const simulation = await runWhatIfSimulation(userId, req.body);

  res.json({
    success: true,
    message: "What-if simulation executed successfully",
    data: simulation,
  });
});

/**
 * GET /api/goals/:id
 * Retrieves a single goal with full progress intelligence and recent contributions.
 */
export const getGoalById = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const goalId = Number(req.params.id);

  const goal = await getGoalByIdModel(goalId, userId);
  if (!goal) {
    throw new AppError("Savings goal not found", 404);
  }

  const { contributions, total } = await getContributionsModel(goalId, userId, { limit: 100 });
  const enriched = enrichGoalProgress(goal, contributions);

  res.json({
    success: true,
    message: "Savings goal retrieved successfully",
    data: {
      ...enriched,
      recentContributions: contributions,
      totalContributionsCount: total,
    },
  });
});

/**
 * PUT /api/goals/:id
 * Updates goal details with strict ownership checks.
 */
export const updateGoal = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const goalId = Number(req.params.id);

  const updated = await updateGoalModel(goalId, userId, req.body);
  const { contributions } = await getContributionsModel(goalId, userId, { limit: 100 });
  const enriched = enrichGoalProgress(updated, contributions);

  res.json({
    success: true,
    message: "Savings goal updated successfully",
    data: enriched,
  });
});

/**
 * DELETE /api/goals/:id
 * Deletes a goal and its contributions.
 */
export const deleteGoal = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const goalId = Number(req.params.id);

  const existing = await getGoalByIdModel(goalId, userId);
  if (!existing) {
    throw new AppError("Savings goal not found", 404);
  }

  await deleteGoalModel(goalId, userId);

  res.json({
    success: true,
    message: "Savings goal deleted successfully",
    data: null,
  });
});

/**
 * POST /api/goals/:id/contributions
 * Records a contribution toward a goal.
 * Important: Tracking record only. Does not withdraw money from bank accounts.
 */
export const addContribution = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const goalId = Number(req.params.id);

  const contribution = await addContributionModel(goalId, userId, req.body);
  const updatedGoal = await getGoalByIdModel(goalId, userId);
  const { contributions } = await getContributionsModel(goalId, userId, { limit: 100 });
  const enriched = enrichGoalProgress(updatedGoal, contributions);

  res.status(201).json({
    success: true,
    message: "Goal contribution recorded successfully",
    data: {
      contribution,
      goal: enriched,
    },
  });
});

/**
 * GET /api/goals/:id/contributions
 * Retrieves paginated contributions for a goal.
 */
export const getContributions = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const goalId = Number(req.params.id);

  const result = await getContributionsModel(goalId, userId, req.query);

  res.json({
    success: true,
    message: "Goal contributions retrieved successfully",
    data: result,
  });
});

/**
 * PUT /api/goals/:id/contributions/:contributionId
 * Updates/corrects an existing contribution record.
 */
export const updateContribution = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const goalId = Number(req.params.id);
  const contributionId = Number(req.params.contributionId);

  const updated = await updateContributionModel(contributionId, goalId, userId, req.body);
  const updatedGoal = await getGoalByIdModel(goalId, userId);
  const { contributions } = await getContributionsModel(goalId, userId, { limit: 100 });
  const enriched = enrichGoalProgress(updatedGoal, contributions);

  res.json({
    success: true,
    message: "Contribution updated successfully",
    data: {
      contribution: updated,
      goal: enriched,
    },
  });
});

/**
 * DELETE /api/goals/:id/contributions/:contributionId
 * Deletes a contribution record.
 */
export const deleteContribution = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const goalId = Number(req.params.id);
  const contributionId = Number(req.params.contributionId);

  const deleted = await deleteContributionModel(contributionId, goalId, userId);
  if (!deleted) {
    throw new AppError("Contribution not found", 404);
  }

  const updatedGoal = await getGoalByIdModel(goalId, userId);
  const { contributions } = await getContributionsModel(goalId, userId, { limit: 100 });
  const enriched = enrichGoalProgress(updatedGoal, contributions);

  res.json({
    success: true,
    message: "Contribution deleted successfully",
    data: {
      goal: enriched,
    },
  });
});
