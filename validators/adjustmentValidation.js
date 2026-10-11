import { body, param, query } from "express-validator";

const SIGNED_DECIMAL_REGEX = /^-?(0|[1-9]\d*)(\.\d{1,2})?$/;

const rejectUnknownFields = (allowedFields) => (value, { req }) => {
  const payloadKeys = Object.keys(req.body ?? {});
  const extraKeys = payloadKeys.filter((key) => !allowedFields.includes(key));
  if (extraKeys.length > 0) {
    throw new Error(`Unknown fields are not allowed: ${extraKeys.join(", ")}`);
  }
  return true;
};

export const adjustmentCreateValidation = [
  body().custom(
    rejectUnknownFields([
      "amount",
      "reason",
      "adjustmentDate",
      "clientAdjustmentKey",
    ]),
  ),
  body("amount")
    .isString()
    .withMessage("Adjustment amount must be a decimal string")
    .bail()
    .trim()
    .matches(SIGNED_DECIMAL_REGEX)
    .withMessage("Adjustment amount must be a valid signed decimal string with up to 2 decimal places")
    .bail()
    .custom((val) => {
      if (val === "0" || val === "0.00" || val === "-0" || val === "-0.00") {
        throw new Error("Adjustment amount cannot be zero");
      }
      return true;
    }),
  body("reason")
    .isString()
    .withMessage("Reason is required")
    .bail()
    .trim()
    .isLength({ min: 3, max: 255 })
    .withMessage("Reason must be between 3 and 255 characters"),
  body("adjustmentDate")
    .isISO8601({ strict: true })
    .withMessage("Adjustment date must be a valid ISO8601 date (YYYY-MM-DD)"),
  body("clientAdjustmentKey")
    .isString()
    .withMessage("Client adjustment key is required")
    .bail()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Client adjustment key must be between 1 and 100 characters"),
];

export const adjustmentQueryValidation = [
  param("id")
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
