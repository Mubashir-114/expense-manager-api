import { body, param, query } from "express-validator";

export const budgetValidation = [
  body("categoryId")
    .isInt({ min: 1 })
    .withMessage("Category is required")
    .toInt(),

  body("amount")
    .isFloat({ gt: 0 })
    .withMessage("Amount must be greater than zero")
    .toFloat(),

  body("month")
    .isInt({ min: 1, max: 12 })
    .withMessage("Month must be between 1 and 12")
    .toInt(),

  body("year")
    .isInt({ min: 2000, max: 2100 })
    .withMessage("Year must be between 2000 and 2100")
    .toInt(),
];

export const budgetIdValidation = [
  param("id")
    .isInt({ min: 1 })
    .withMessage("Invalid budget id")
    .toInt(),
];

export const budgetQueryValidation = [
  query("categoryId")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Invalid category")
    .toInt(),

  query("month")
    .optional()
    .isInt({ min: 1, max: 12 })
    .withMessage("Month must be between 1 and 12")
    .toInt(),

  query("year")
    .optional()
    .isInt({ min: 2000, max: 2100 })
    .withMessage("Year must be between 2000 and 2100")
    .toInt(),
];

export const budgetStatusValidation = [
  query("month")
    .optional()
    .isInt({ min: 1, max: 12 })
    .withMessage("Month must be between 1 and 12")
    .toInt(),

  query("year")
    .optional()
    .isInt({ min: 2000, max: 2100 })
    .withMessage("Year must be between 2000 and 2100")
    .toInt(),
];

export const budgetProgressValidation = [
  query("month")
    .optional()
    .isInt({ min: 1, max: 12 })
    .withMessage("Month must be between 1 and 12")
    .toInt(),

  query("year")
    .optional()
    .isInt({ min: 2000, max: 2100 })
    .withMessage("Year must be between 2000 and 2100")
    .toInt(),

  query("savingsTarget")
    .optional()
    .isFloat({ gt: 0 })
    .withMessage("Savings target must be greater than zero"),
];

export const budgetAlertsValidation = [
  query("month")
    .optional()
    .isInt({ min: 1, max: 12 })
    .withMessage("Month must be between 1 and 12")
    .toInt(),

  query("year")
    .optional()
    .isInt({ min: 2000, max: 2100 })
    .withMessage("Year must be between 2000 and 2100")
    .toInt(),
];

export const budgetSuggestionsValidation = [
  query("month")
    .optional()
    .isInt({ min: 1, max: 12 })
    .withMessage("Month must be between 1 and 12")
    .toInt(),

  query("year")
    .optional()
    .isInt({ min: 2000, max: 2100 })
    .withMessage("Year must be between 2000 and 2100")
    .toInt(),

  query("savingsTarget")
    .optional()
    .isFloat({ gt: 0 })
    .withMessage("Savings target must be greater than zero"),
];

export const budgetHistoryValidation = [
  query("months")
    .optional()
    .isInt({ min: 1, max: 24 })
    .withMessage("Months must be between 1 and 24")
    .toInt(),
];

export const budgetSavingsTargetValidation = [
  query("month")
    .optional()
    .isInt({ min: 1, max: 12 })
    .withMessage("Month must be between 1 and 12")
    .toInt(),

  query("year")
    .optional()
    .isInt({ min: 2000, max: 2100 })
    .withMessage("Year must be between 2000 and 2100")
    .toInt(),

  query("targetAmount")
    .optional()
    .isFloat({ gt: 0 })
    .withMessage("Target amount must be greater than zero"),
];
