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

router.get("/monthly", monthlySummary);

router.get("/categories", categorySummary);

router.get("/recent", recentTransactions);

export default router;
