import { body, param, query } from "express-validator";

export const createGoalValidation = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Goal name is required")
    .isLength({ max: 150 })
    .withMessage("Goal name must not exceed 150 characters"),

  body("description")
    .optional({ values: "falsy" })
    .isString()
    .withMessage("Description must be a string")
    .isLength({ max: 1000 })
    .withMessage("Description must not exceed 1000 characters"),

  body("targetAmount")
    .notEmpty()
    .withMessage("Target amount is required")
    .isFloat({ min: 0.01 })
    .withMessage("Target amount must be a positive number greater than zero"),

  body("currency")
    .optional({ values: "falsy" })
    .isString()
    .isLength({ min: 2, max: 10 })
    .withMessage("Currency must be between 2 and 10 characters"),

  body("targetDate")
    .optional({ values: "falsy" })
    .isISO8601()
    .withMessage("Target date must be a valid date (YYYY-MM-DD)"),

  body("startingAmount")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Starting amount must be non-negative (>= 0)"),
];

export const updateGoalValidation = [
  param("id")
    .isInt({ min: 1 })
    .withMessage("Goal ID must be a positive integer"),

  body("name")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Goal name cannot be empty")
    .isLength({ max: 150 })
    .withMessage("Goal name must not exceed 150 characters"),

  body("description")
    .optional({ values: "null" })
    .isString()
    .isLength({ max: 1000 })
    .withMessage("Description must not exceed 1000 characters"),

  body("targetAmount")
    .optional()
    .isFloat({ min: 0.01 })
    .withMessage("Target amount must be a positive number greater than zero"),

  body("currency")
    .optional()
    .isString()
    .isLength({ min: 2, max: 10 })
    .withMessage("Currency must be between 2 and 10 characters"),

  body("targetDate")
    .optional({ values: "null" })
    .isISO8601()
    .withMessage("Target date must be a valid date (YYYY-MM-DD)"),

  body("startingAmount")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Starting amount must be non-negative (>= 0)"),

  body("status")
    .optional()
    .isIn(["active", "completed", "archived"])
    .withMessage("Status must be one of: active, completed, archived"),
];

export const goalIdValidation = [
  param("id")
    .isInt({ min: 1 })
    .withMessage("Goal ID must be a positive integer"),
];

export const addContributionValidation = [
  param("id")
    .isInt({ min: 1 })
    .withMessage("Goal ID must be a positive integer"),

  body("amount")
    .notEmpty()
    .withMessage("Contribution amount is required")
    .isFloat({ min: 0.01 })
    .withMessage("Contribution amount must be a positive number greater than zero"),

  body("contributionDate")
    .optional({ values: "falsy" })
    .isISO8601()
    .withMessage("Contribution date must be a valid date (YYYY-MM-DD)"),

  body("note")
    .optional({ values: "falsy" })
    .isString()
    .isLength({ max: 500 })
    .withMessage("Note must not exceed 500 characters"),
];

export const updateContributionValidation = [
  param("id")
    .isInt({ min: 1 })
    .withMessage("Goal ID must be a positive integer"),

  param("contributionId")
    .isInt({ min: 1 })
    .withMessage("Contribution ID must be a positive integer"),

  body("amount")
    .optional()
    .isFloat({ min: 0.01 })
    .withMessage("Contribution amount must be a positive number greater than zero"),

  body("contributionDate")
    .optional()
    .isISO8601()
    .withMessage("Contribution date must be a valid date (YYYY-MM-DD)"),

  body("note")
    .optional({ values: "null" })
    .isString()
    .isLength({ max: 500 })
    .withMessage("Note must not exceed 500 characters"),
];

export const contributionIdValidation = [
  param("id")
    .isInt({ min: 1 })
    .withMessage("Goal ID must be a positive integer"),

  param("contributionId")
    .isInt({ min: 1 })
    .withMessage("Contribution ID must be a positive integer"),
];

export const forecastQueryValidation = [
  query("horizon")
    .optional({ values: "falsy" })
    .isIn(["next_30_days", "next_3_months", "next_6_months", "next_12_months"])
    .withMessage("Horizon must be one of: next_30_days, next_3_months, next_6_months, next_12_months"),
];

export const simulationValidation = [
  body("scenarioType")
    .notEmpty()
    .withMessage("scenarioType is required")
    .isIn(["savings_adjustment", "expense_reduction", "goal_timeline", "income_change"])
    .withMessage("scenarioType must be one of: savings_adjustment, expense_reduction, goal_timeline, income_change"),

  body("monthlySavingsAdjustment")
    .optional()
    .isNumeric()
    .withMessage("monthlySavingsAdjustment must be a number"),

  body("expenseReductionPercentage")
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage("expenseReductionPercentage must be between 0 and 100"),

  body("expenseReductionAmount")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("expenseReductionAmount must be non-negative"),

  body("goalId")
    .optional({ values: "null" })
    .isInt({ min: 1 })
    .withMessage("goalId must be a positive integer"),

  body("targetMonths")
    .optional({ values: "null" })
    .isInt({ min: 1, max: 240 })
    .withMessage("targetMonths must be an integer between 1 and 240"),

  body("incomeChangeAmount")
    .optional()
    .isNumeric()
    .withMessage("incomeChangeAmount must be a number"),
];
