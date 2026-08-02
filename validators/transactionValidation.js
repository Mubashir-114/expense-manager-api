import { body, param, query } from "express-validator";

export const transactionValidation = [
  body("categoryId")
    .isInt({ min: 1 })
    .withMessage("Category is required")
    .toInt(),

  body("type")
    .trim()
    .isIn(["income", "expense"])
    .withMessage("Invalid type"),

  body("title")
    .trim()
    .notEmpty()
    .withMessage("Title is required")
    .isLength({ max: 150 })
    .withMessage("Title must not exceed 150 characters"),

  body("amount")
    .isFloat({ gt: 0 })
    .withMessage("Amount must be greater than zero")
    .toFloat(),

  body("transactionDate")
    .isISO8601({ strict: true })
    .withMessage("Invalid date")
    .toDate(),

  body("note")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 1000 })
    .withMessage("Note must not exceed 1000 characters"),
];

export const transactionIdValidation = [
  param("id")
    .isInt({ min: 1 })
    .withMessage("Invalid transaction id")
    .toInt(),
];

export const transactionQueryValidation = [
  query("type")
    .optional()
    .trim()
    .isIn(["income", "expense"])
    .withMessage("Invalid type"),

  query("categoryId")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Invalid category")
    .toInt(),

  query("search")
    .optional()
    .trim()
    .isLength({ max: 150 })
    .withMessage("Search must not exceed 150 characters"),

  query("from")
    .optional()
    .isISO8601({ strict: true })
    .withMessage("Invalid from date"),

  query("to")
    .optional()
    .isISO8601({ strict: true })
    .withMessage("Invalid to date"),

  query("sort")
    .optional()
    .trim()
    .isIn(["transaction_date", "amount", "created_at"])
    .withMessage("Invalid sort field"),

  query("order")
    .optional()
    .trim()
    .isIn(["asc", "desc"])
    .withMessage("Invalid order"),

  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer")
    .toInt(),

  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100")
    .toInt(),
];
