import { body, param, query } from "express-validator";

const DECIMAL_REGEX = /^(0|[1-9]\d*)(\.\d{1,2})?$/;

const rejectUnknownFields = (allowedFields) => (value, { req }) => {
  const payloadKeys = Object.keys(req.body ?? {});
  const extraKeys = payloadKeys.filter((key) => !allowedFields.includes(key));
  if (extraKeys.length > 0) {
    throw new Error(`Unknown fields are not allowed: ${extraKeys.join(", ")}`);
  }
  return true;
};

export const transferCreateValidation = [
  body().custom(
    rejectUnknownFields([
      "sourceAccountId",
      "destinationAccountId",
      "amount",
      "transferDate",
      "note",
      "clientTransferKey",
    ]),
  ),
  body("sourceAccountId")
    .isInt({ min: 1 })
    .withMessage("Source account ID must be a positive integer")
    .toInt(),
  body("destinationAccountId")
    .isInt({ min: 1 })
    .withMessage("Destination account ID must be a positive integer")
    .toInt()
    .custom((destinationId, { req }) => {
      if (destinationId === req.body.sourceAccountId) {
        throw new Error("Source and destination accounts must be different");
      }
      return true;
    }),
  body("amount")
    .isString()
    .withMessage("Amount must be a decimal string")
    .bail()
    .trim()
    .matches(DECIMAL_REGEX)
    .withMessage("Amount must be a valid positive decimal string with up to 2 decimal places")
    .bail()
    .custom((val) => {
      if (val === "0" || val === "0.00" || val === "0.0") {
        throw new Error("Transfer amount must be greater than zero");
      }
      return true;
    }),
  body("transferDate")
    .isISO8601({ strict: true })
    .withMessage("Transfer date must be a valid ISO8601 date (YYYY-MM-DD)"),
  body("note")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 1000 })
    .withMessage("Note must not exceed 1000 characters"),
  body("clientTransferKey")
    .isString()
    .withMessage("Client transfer key is required")
    .bail()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Client transfer key must be between 1 and 100 characters"),
];

export const transferQueryValidation = [
  query("accountId")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Account ID must be a positive integer")
    .toInt(),
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

export const transferIdValidation = [
  param("id")
    .isInt({ min: 1 })
    .withMessage("Transfer ID must be a positive integer")
    .toInt(),
];
