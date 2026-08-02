import { query } from "express-validator";

export const reportValidation = [
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

  query("from")
    .optional()
    .isISO8601({ strict: true })
    .withMessage("Invalid from date format (must be YYYY-MM-DD)"),

  query("to")
    .optional()
    .isISO8601({ strict: true })
    .withMessage("Invalid to date format (must be YYYY-MM-DD)"),

  query("categoryId")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Category ID must be a positive integer")
    .toInt(),

  query("type")
    .optional()
    .trim()
    .isIn(["income", "expense"])
    .withMessage("Type must be either income or expense"),
];

export const exportValidation = [
  ...reportValidation,
  query("format")
    .optional()
    .trim()
    .toLowerCase()
    .isIn(["csv", "json"])
    .withMessage("Format must be either csv or json"),
];
