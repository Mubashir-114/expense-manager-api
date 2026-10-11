import express from "express";

import authMiddleware from "../middleware/authMiddleware.js";

import {
  addBudget,
  getAllBudgets,
  getSingleBudget,
  editBudget,
  removeBudget,
  budgetStatus,
  budgetProgress,
  budgetAlerts,
  budgetSuggestions,
  budgetHistory,
  budgetSavingsTarget,
} from "../controllers/budgetController.js";

import {
  budgetValidation,
  budgetIdValidation,
  budgetQueryValidation,
  budgetStatusValidation,
  budgetProgressValidation,
  budgetAlertsValidation,
  budgetSuggestionsValidation,
  budgetHistoryValidation,
  budgetSavingsTargetValidation,
} from "../validators/budgetValidation.js";

import validate from "../middleware/validate.js";

const router = express.Router();

router.use(authMiddleware);

router.post("/", budgetValidation, validate, addBudget);

router.get("/", budgetQueryValidation, validate, getAllBudgets);

router.get("/status", budgetStatusValidation, validate, budgetStatus);

router.get("/progress", budgetProgressValidation, validate, budgetProgress);

router.get("/alerts", budgetAlertsValidation, validate, budgetAlerts);

router.get("/suggestions", budgetSuggestionsValidation, validate, budgetSuggestions);

router.get("/history", budgetHistoryValidation, validate, budgetHistory);

router.get("/savings-target", budgetSavingsTargetValidation, validate, budgetSavingsTarget);

router.get("/:id", budgetIdValidation, validate, getSingleBudget);

router.put("/:id", budgetIdValidation, budgetValidation, validate, editBudget);

router.delete("/:id", budgetIdValidation, validate, removeBudget);

export default router;
