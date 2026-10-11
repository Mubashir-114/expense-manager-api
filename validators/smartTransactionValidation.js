import { body, param, query } from "express-validator";

export const detectValidation = [
  body()
    .custom((val) => {
      if (Array.isArray(val) && val.length > 0) return true;
      if (val && Array.isArray(val.messages) && val.messages.length > 0) return true;
      if (val && Array.isArray(val.transactions) && val.transactions.length > 0) return true;
      throw new Error("Must provide a non-empty array of messages or transactions");
    }),
];

export const smartTxIdValidation = [
  param("id")
    .isInt({ min: 1 })
    .withMessage("Invalid smart transaction ID")
    .toInt(),
];

export const updateSmartTxValidation = [
  body("merchantClean")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Merchant name cannot be empty")
    .isLength({ max: 150 })
    .withMessage("Merchant name must not exceed 150 characters"),

  body("classification")
    .optional()
    .isIn([
      "expense",
      "income",
      "transfer",
      "refund",
      "credit_card_purchase",
      "credit_card_repayment",
    ])
    .withMessage("Invalid transaction classification"),

  body("categoryId")
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .withMessage("Invalid category ID")
    .toInt(),

  body("accountId")
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .withMessage("Invalid account ID")
    .toInt(),
];

export const confirmSmartTxValidation = [
  body("merchantClean")
    .optional()
    .trim()
    .isLength({ max: 150 }),

  body("classification")
    .optional()
    .isIn([
      "expense",
      "income",
      "transfer",
      "refund",
      "credit_card_purchase",
      "credit_card_repayment",
    ]),

  body("categoryId")
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .toInt(),

  body("accountId")
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .toInt(),
];

export const rejectSmartTxValidation = [
  body("reason")
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage("Rejection reason must not exceed 255 characters"),
];

export const batchConfirmValidation = [
  body("items")
    .isArray({ min: 1, max: 100 })
    .withMessage("Items must be an array of 1 to 100 items"),
];

export const batchRejectValidation = [
  body("ids")
    .isArray({ min: 1, max: 100 })
    .withMessage("IDs must be an array of 1 to 100 transaction IDs"),
  body("reason")
    .optional()
    .trim()
    .isLength({ max: 255 }),
];

export const smartTxQueryValidation = [
  query("status")
    .optional()
    .isIn(["suggested", "detected", "confirmed", "rejected", "all"])
    .withMessage("Invalid status filter"),

  query("classification")
    .optional()
    .isIn([
      "expense",
      "income",
      "transfer",
      "refund",
      "credit_card_purchase",
      "credit_card_repayment",
    ])
    .withMessage("Invalid classification filter"),

  query("search")
    .optional()
    .trim()
    .isLength({ max: 150 }),

  query("page")
    .optional()
    .isInt({ min: 1 })
    .toInt(),

  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .toInt(),
];

export default {
  detectValidation,
  smartTxIdValidation,
  updateSmartTxValidation,
  confirmSmartTxValidation,
  rejectSmartTxValidation,
  batchConfirmValidation,
  batchRejectValidation,
  smartTxQueryValidation,
};
