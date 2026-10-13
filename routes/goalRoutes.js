import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import validate from "../middleware/validate.js";
import {
  createGoalValidation,
  updateGoalValidation,
  goalIdValidation,
  addContributionValidation,
  updateContributionValidation,
  contributionIdValidation,
  forecastQueryValidation,
  simulationValidation,
} from "../validators/goalValidation.js";
import {
  createGoal,
  getGoals,
  getGoalsSummary,
  getCashFlowForecast,
  simulateScenario,
  getGoalById,
  updateGoal,
  deleteGoal,
  addContribution,
  getContributions,
  updateContribution,
  deleteContribution,
} from "../controllers/goalController.js";

const router = express.Router();

// All goals routes require authenticated session
router.use(authMiddleware);

// Aggregated Summary & Planning Services
router.get("/summary", getGoalsSummary);
router.get("/forecast", forecastQueryValidation, validate, getCashFlowForecast);
router.post("/simulate", simulationValidation, validate, simulateScenario);

// Savings Goal CRUD
router.post("/", createGoalValidation, validate, createGoal);
router.get("/", getGoals);
router.get("/:id", goalIdValidation, validate, getGoalById);
router.put("/:id", updateGoalValidation, validate, updateGoal);
router.delete("/:id", goalIdValidation, validate, deleteGoal);

// Goal Contributions
router.post("/:id/contributions", addContributionValidation, validate, addContribution);
router.get("/:id/contributions", goalIdValidation, validate, getContributions);
router.put("/:id/contributions/:contributionId", updateContributionValidation, validate, updateContribution);
router.delete("/:id/contributions/:contributionId", contributionIdValidation, validate, deleteContribution);

export default router;
