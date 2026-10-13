import { body, query } from "express-validator";
import { SUPPORTED_INTENTS } from "../services/analytics/intentParser.js";

const ALLOWED_QUERY_BODY_FIELDS = Object.freeze([
  "question",
  "intent",
  "period",
  "startDate",
  "endDate",
  "month",
]);

const ALLOWED_INSIGHTS_QUERY_FIELDS = Object.freeze([
  "period",
  "month",
  "startDate",
  "endDate",
]);

export const analyticsQueryValidation = [
  // Reject unknown fields in request body
  body().custom((value, { req }) => {
    if (typeof req.body !== "object" || req.body === null || Array.isArray(req.body)) {
      throw new Error("Request body must be a JSON object");
    }
    const extraFields = Object.keys(req.body).filter(
      (k) => !ALLOWED_QUERY_BODY_FIELDS.includes(k)
    );
    if (extraFields.length > 0) {
      throw new Error(`Unknown field(s) not allowed: ${extraFields.join(", ")}`);
    }
    return true;
  }),

  body("question")
    .optional({ values: "falsy" })
    .isString()
    .withMessage("Question must be a string")
    .isLength({ max: 200 })
    .withMessage("Question must not exceed 200 characters"),

  body("intent")
    .optional({ values: "falsy" })
    .isString()
    .isIn(SUPPORTED_INTENTS)
    .withMessage(`Intent must be one of: ${SUPPORTED_INTENTS.join(", ")}`),

  body("period")
    .optional({ values: "falsy" })
    .isString()
    .isIn(["current_month", "previous_month", "last_30_days", "custom"])
    .withMessage("Period must be one of: current_month, previous_month, last_30_days, custom"),

  body("startDate")
    .optional({ values: "falsy" })
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage("startDate must be in YYYY-MM-DD format"),

  body("endDate")
    .optional({ values: "falsy" })
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage("endDate must be in YYYY-MM-DD format")
    .custom((endDate, { req }) => {
      if (req.body.startDate && endDate) {
        if (req.body.startDate > endDate) {
          throw new Error("startDate cannot be after endDate");
        }
        const start = new Date(req.body.startDate);
        const end = new Date(endDate);
        const diffDays = Math.round((end - start) / (1000 * 60 * 60 * 24));
        if (diffDays > 365) {
          throw new Error("Date range exceeds maximum allowed limit of 365 days");
        }
      }
      return true;
    }),

  body("month")
    .optional({ values: "falsy" })
    .matches(/^\d{4}-\d{2}$/)
    .withMessage("Month must be in YYYY-MM format"),
];

export const analyticsInsightsValidation = [
  // Reject unknown fields in query params
  query().custom((value, { req }) => {
    const extraFields = Object.keys(req.query || {}).filter(
      (k) => !ALLOWED_INSIGHTS_QUERY_FIELDS.includes(k)
    );
    if (extraFields.length > 0) {
      throw new Error(`Unknown query parameter(s) not allowed: ${extraFields.join(", ")}`);
    }
    return true;
  }),

  query("period")
    .optional({ values: "falsy" })
    .isString()
    .isIn(["current_month", "previous_month", "last_30_days", "custom"])
    .withMessage("Period must be one of: current_month, previous_month, last_30_days, custom"),

  query("month")
    .optional({ values: "falsy" })
    .matches(/^\d{4}-\d{2}$/)
    .withMessage("Month must be in YYYY-MM format"),

  query("startDate")
    .optional({ values: "falsy" })
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage("startDate must be in YYYY-MM-DD format"),

  query("endDate")
    .optional({ values: "falsy" })
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage("endDate must be in YYYY-MM-DD format"),
];
