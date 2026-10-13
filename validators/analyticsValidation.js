import { body, query } from "express-validator";
import { SUPPORTED_INTENTS } from "../services/analytics/intentParser.js";

const ALLOWED_QUERY_BODY_FIELDS = Object.freeze([
  "question",
  "intent",
  "period",
  "startDate",
  "endDate",
  "month",
  "category",
  "conversationContext",
]);

const ALLOWED_CONTEXT_FIELDS = Object.freeze([
  "previousIntent",
  "activePeriod",
  "activeCategory",
  "activeMonth",
  "turnCount",
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

  body("category")
    .optional({ values: "falsy" })
    .isString()
    .withMessage("Category must be a string")
    .isLength({ max: 50 })
    .withMessage("Category must not exceed 50 characters"),

  body("conversationContext")
    .optional({ values: "falsy" })
    .custom((ctx) => {
      if (typeof ctx !== "object" || ctx === null || Array.isArray(ctx)) {
        throw new Error("conversationContext must be an object");
      }
      const extraContextFields = Object.keys(ctx).filter(
        (k) => !ALLOWED_CONTEXT_FIELDS.includes(k)
      );
      if (extraContextFields.length > 0) {
        throw new Error(
          `Unknown field(s) in conversationContext: ${extraContextFields.join(", ")}`
        );
      }
      if (ctx.previousIntent && !SUPPORTED_INTENTS.includes(ctx.previousIntent)) {
        throw new Error(`Invalid previousIntent in conversationContext: ${ctx.previousIntent}`);
      }
      if (
        ctx.activePeriod &&
        !["current_month", "previous_month", "last_30_days", "custom"].includes(ctx.activePeriod)
      ) {
        throw new Error(`Invalid activePeriod in conversationContext: ${ctx.activePeriod}`);
      }
      if (ctx.activeCategory && (typeof ctx.activeCategory !== "string" || ctx.activeCategory.length > 50)) {
        throw new Error("activeCategory in conversationContext must be a string up to 50 characters");
      }
      if (ctx.activeMonth && !/^\d{4}-\d{2}$/.test(ctx.activeMonth)) {
        throw new Error("activeMonth in conversationContext must be in YYYY-MM format");
      }
      if (
        ctx.turnCount !== undefined &&
        (!Number.isInteger(ctx.turnCount) || ctx.turnCount < 0 || ctx.turnCount > 1000)
      ) {
        throw new Error("turnCount in conversationContext must be a non-negative integer up to 1000");
      }
      return true;
    }),
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
