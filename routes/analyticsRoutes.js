import express from "express";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";

import authMiddleware from "../middleware/authMiddleware.js";
import validate from "../middleware/validate.js";
import {
  analyticsQueryValidation,
  analyticsInsightsValidation,
  analyticsAlertsValidation,
  companionPreferencesValidation,
  companionActionConfirmValidation,
} from "../validators/analyticsValidation.js";
import {
  queryAnalytics,
  getInsights,
  getCapabilities,
  getProactiveAlerts,
  getCompanionPreferencesController,
  updateCompanionPreferencesController,
  resetCompanionPreferencesController,
  confirmCompanionActionController,
} from "../controllers/analyticsController.js";

const router = express.Router();

export const analyticsKeyGenerator = (req) => {
  if (req.user?.id) return `user:${req.user.id}`;
  return `ip:${ipKeyGenerator(req.ip)}`;
};

// Per-user and per-IP rate limiter for analytics queries
export const analyticsRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 60, // 60 requests per window
  keyGenerator: analyticsKeyGenerator,
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

// Get deterministic proactive financial alerts
router.get(
  "/alerts",
  analyticsRateLimiter,
  analyticsAlertsValidation,
  validate,
  getProactiveAlerts
);

// ── Phase 5E: FIN Companion Routes ─────────────────────────────────────────

// Get persistent relationship preferences
router.get(
  "/companion/preferences",
  analyticsRateLimiter,
  getCompanionPreferencesController
);

// Update persistent relationship preferences
router.put(
  "/companion/preferences",
  analyticsRateLimiter,
  companionPreferencesValidation,
  validate,
  updateCompanionPreferencesController
);

// Reset persistent relationship preferences to defaults
router.delete(
  "/companion/preferences",
  analyticsRateLimiter,
  resetCompanionPreferencesController
);

// Confirm and execute an authorized application write action (e.g. goal creation)
router.post(
  "/companion/action/confirm",
  analyticsRateLimiter,
  companionActionConfirmValidation,
  validate,
  confirmCompanionActionController
);

export default router;
