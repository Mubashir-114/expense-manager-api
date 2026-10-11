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
    } else if (payload.creditLimit !== undefined) {
      throw new Error("Credit limit is valid only for credit cards");
    }
    return true;
  }),
];

export const accountUpdateValidation = [
  rejectUnknownFields(["displayName", "institutionName", "maskedLast4"]),
  body("displayName").trim().notEmpty().isLength({ max: 100 })
    .withMessage("Display name is required and must not exceed 100 characters"),
  body("institutionName").optional({ nullable: true }).trim().isLength({ min: 1, max: 100 })
    .withMessage("Institution name must be between 1 and 100 characters"),
  body("maskedLast4").optional({ nullable: true }).matches(/^\d{4}$/)
    .withMessage("Masked last four must contain exactly four digits"),
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
