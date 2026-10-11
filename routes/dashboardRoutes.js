import express from "express";

import authMiddleware from "../middleware/authMiddleware.js";
import validate from "../middleware/validate.js";
import {
  dashboard,
  dashboardOverview,
  monthlySummary,
  categorySummary,
  recentTransactions,
  dashboardInsights,
  accountsOverview,
} from "../controllers/dashboardController.js";
import { dashboardQueryValidation } from "../validators/dashboardValidation.js";

const router = express.Router();

router.use(authMiddleware);

// Main dashboard analytics
router.get("/", dashboardQueryValidation, validate, dashboard);
router.get("/summary", dashboardQueryValidation, validate, dashboard);
router.get("/overview", dashboardQueryValidation, validate, dashboardOverview);

// Specialized analytics sub-routes
router.get("/monthly", monthlySummary);
router.get("/monthly-summary", monthlySummary);

router.get("/categories", dashboardQueryValidation, validate, categorySummary);
router.get("/category-summary", dashboardQueryValidation, validate, categorySummary);

router.get("/recent", recentTransactions);
router.get("/recent-transactions", recentTransactions);

router.get("/insights", dashboardQueryValidation, validate, dashboardInsights);
router.get("/accounts-overview", accountsOverview);

export default router;
