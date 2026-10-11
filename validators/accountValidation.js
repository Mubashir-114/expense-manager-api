import { body, param, query } from "express-validator";

import { isNegativeMinor, isPositiveMinor, parseDecimalToMinor } from "../utils/money.js";

const TYPES = ["bank", "cash", "wallet", "credit_card"];
const SUBTYPES = {
  bank: ["savings", "current", "salary"],
  cash: ["cash"],
  wallet: ["stored_value"],
  credit_card: ["credit_card"],
};

const rejectUnknownFields = (allowed) => body().custom((payload) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return true;
  const unknown = Object.keys(payload).filter((key) => !allowed.includes(key));
  if (unknown.length) throw new Error(`Unsupported field: ${unknown[0]}`);
  return true;
});

const decimalString = (field, optional = false) => {
  let validator = body(field);
  if (optional) validator = validator.optional({ nullable: false });
  return validator
    .isString()
    .withMessage(`${field} must be a decimal string`)
    .custom((value) => {
      parseDecimalToMinor(value);
      return true;
    })
    .withMessage(`${field} must be an exact decimal string with at most two fractional digits`);
};

export const accountCreateValidation = [
  rejectUnknownFields([
    "type", "subtype", "displayName", "institutionName", "maskedLast4",
    "currencyCode", "openingAmount", "creditLimit", "isDefault", "clientCreationKey",
    "statementClosingDay", "paymentDueDay",
  ]),
  body("type").isIn(TYPES).withMessage("Invalid account type"),
  body("subtype").isString().custom((value, { req }) => {
    if (!SUBTYPES[req.body.type]?.includes(value)) throw new Error("Invalid subtype for account type");
    return true;
  }),
  body("displayName").trim().notEmpty().isLength({ max: 100 })
    .withMessage("Display name is required and must not exceed 100 characters"),
  body("institutionName").optional({ nullable: true }).trim().isLength({ min: 1, max: 100 })
    .withMessage("Institution name must be between 1 and 100 characters"),
  body("maskedLast4").optional({ nullable: true }).matches(/^\d{4}$/)
    .withMessage("Masked last four must contain exactly four digits"),
  body("currencyCode").optional().isIn(["INR"]).withMessage("Only INR is supported in Phase 3A.1"),
  decimalString("openingAmount", true),
  decimalString("creditLimit", true),
  body("isDefault").optional().isBoolean({ strict: true }).withMessage("isDefault must be a boolean"),
  body("clientCreationKey").isString().matches(/^[A-Za-z0-9._:-]{8,100}$/)
    .withMessage("Client creation key must be 8-100 safe characters"),
  body("statementClosingDay").optional({ nullable: true }).isInt({ min: 1, max: 31 })
    .withMessage("Statement closing day must be an integer between 1 and 31").toInt(),
  body("paymentDueDay").optional({ nullable: true }).isInt({ min: 1, max: 31 })
    .withMessage("Payment due day must be an integer between 1 and 31").toInt(),
  body().custom((payload) => {
    const institution = payload.institutionName;
    if (["bank", "credit_card"].includes(payload.type) && !institution) {
      throw new Error("Institution name is required for this account type");
    }
    if (payload.type === "cash" && (institution || payload.maskedLast4)) {
      throw new Error("Cash accounts cannot have institution or masked account metadata");
    }
    if (payload.type === "credit_card" && payload.isDefault === true) {
      throw new Error("Credit cards cannot be the default asset account");
    }

    const opening = parseDecimalToMinor(payload.openingAmount ?? "0.00");
    if (!(payload.type === "bank" && payload.subtype === "current") && isNegativeMinor(opening)) {
      throw new Error("Negative opening amounts are allowed only for current bank accounts");
    }

    if (payload.type === "credit_card") {
      if (payload.creditLimit === undefined || !isPositiveMinor(parseDecimalToMinor(payload.creditLimit))) {
        throw new Error("Credit cards require a positive credit limit");
      }
    } else {
      if (payload.creditLimit !== undefined) {
        throw new Error("Credit limit is valid only for credit cards");
      }
      if (payload.statementClosingDay !== undefined || payload.paymentDueDay !== undefined) {
        throw new Error("Billing cycle settings are valid only for credit cards");
      }
    }
    return true;
  }),
];

export const accountUpdateValidation = [
  rejectUnknownFields(["displayName", "institutionName", "maskedLast4", "statementClosingDay", "paymentDueDay"]),
  body("displayName").trim().notEmpty().isLength({ max: 100 })
    .withMessage("Display name is required and must not exceed 100 characters"),
  body("institutionName").optional({ nullable: true }).trim().isLength({ min: 1, max: 100 })
    .withMessage("Institution name must be between 1 and 100 characters"),
  body("maskedLast4").optional({ nullable: true }).matches(/^\d{4}$/)
    .withMessage("Masked last four must contain exactly four digits"),
  body("statementClosingDay").optional({ nullable: true }).isInt({ min: 1, max: 31 })
    .withMessage("Statement closing day must be an integer between 1 and 31").toInt(),
  body("paymentDueDay").optional({ nullable: true }).isInt({ min: 1, max: 31 })
    .withMessage("Payment due day must be an integer between 1 and 31").toInt(),
];

export const billingUpdateValidation = [
  rejectUnknownFields(["statementClosingDay", "paymentDueDay"]),
  body("statementClosingDay").optional({ nullable: true }).isInt({ min: 1, max: 31 })
    .withMessage("Statement closing day must be an integer between 1 and 31").toInt(),
  body("paymentDueDay").optional({ nullable: true }).isInt({ min: 1, max: 31 })
    .withMessage("Payment due day must be an integer between 1 and 31").toInt(),
];

export const repaymentCreateValidation = [
  rejectUnknownFields(["sourceAccountId", "amount", "paymentDate", "clientPaymentKey", "note"]),
  body("sourceAccountId")
    .isInt({ min: 1 })
    .withMessage("Source account ID must be a positive integer")
    .toInt(),
  decimalString("amount", false),
  body("amount").custom((val) => {
    const minor = parseDecimalToMinor(val);
    if (!isPositiveMinor(minor)) {
      throw new Error("Repayment amount must be greater than zero");
    }
    return true;
  }),
  body("paymentDate")
    .isISO8601({ strict: true })
    .withMessage("Payment date must be a valid ISO8601 date (YYYY-MM-DD)"),
  body("clientPaymentKey")
    .isString()
    .matches(/^[A-Za-z0-9._:-]{1,100}$/)
    .withMessage("Client payment key must be 1-100 safe characters"),
  body("note")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 1000 })
    .withMessage("Note must not exceed 1000 characters"),
];

export const accountIdValidation = [
  param("id").isInt({ min: 1, max: 4294967295 }).withMessage("Invalid account id").toInt(),
];

export const accountQueryValidation = [
  query("type").optional().isIn(TYPES).withMessage("Invalid account type"),
  query("status").optional().isIn(["active", "archived"]).withMessage("Invalid account status"),
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be positive").toInt(),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be 1-100").toInt(),
];

export const paymentQueryValidation = [
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be positive").toInt(),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be 1-100").toInt(),
];
