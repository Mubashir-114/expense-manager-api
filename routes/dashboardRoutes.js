import express from "express";

import authMiddleware from "../middleware/authMiddleware.js";

import {
  dashboard,
  monthlySummary,
  categorySummary,
  recentTransactions,
} from "../controllers/dashboardController.js";

const router = express.Router();

router.use(authMiddleware);

router.get("/", dashboard);
router.get("/summary", dashboard);

router.get("/monthly", monthlySummary);
router.get("/monthly-summary", monthlySummary);

router.get("/categories", categorySummary);
router.get("/category-summary", categorySummary);

router.get("/recent", recentTransactions);
router.get("/recent-transactions", recentTransactions);

export default router;
