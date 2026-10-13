import express from "express";
import rateLimit from "express-rate-limit";

import authMiddleware from "../middleware/authMiddleware.js";
import validate from "../middleware/validate.js";
import {
  analyticsQueryValidation,
  analyticsInsightsValidation,
} from "../validators/analyticsValidation.js";
import {
  queryAnalytics,
  getInsights,
  getCapabilities,
} from "../controllers/analyticsController.js";

const router = express.Router();

// Per-user and per-IP rate limiter for analytics queries
const analyticsRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 60, // 60 requests per window
  keyGenerator: (req) => (req.user?.id ? `user_${req.user.id}` : req.ip || "unknown"),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many analytics requests, please try again later",
  },
});

// All analytics routes require authenticated session
router.use(authMiddleware);

// Get capabilities and privacy guarantees
router.get("/capabilities", getCapabilities);

// Process a financial question or structured query
router.post(
  "/query",
  analyticsRateLimiter,
  analyticsQueryValidation,
  validate,
  queryAnalytics
);

// Get deterministic financial insights for current/requested period
router.get(
  "/insights",
  analyticsRateLimiter,
  analyticsInsightsValidation,
  validate,
  getInsights
);

export default router;
