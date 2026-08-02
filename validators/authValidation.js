import { body } from "express-validator";

export const registerValidation = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required")
    .isLength({ min: 3, max: 100 })
    .withMessage("Name must be between 3 and 100 characters"),

  body("email")
    .trim()
    .normalizeEmail()
    .isEmail()
    .withMessage("Valid email required")
    .isLength({ max: 150 })
    .withMessage("Email must not exceed 150 characters"),

  body("password")
    .isString()
    .withMessage("Password must be a string")
    .isLength({ min: 6, max: 100 })
    .withMessage("Password must be between 6 and 100 characters"),
];

export const loginValidation = [
  body("email")
    .trim()
    .normalizeEmail()
    .isEmail()
    .withMessage("Valid email required"),

  body("password")
    .isString()
    .withMessage("Password must be a string")
    .notEmpty()
    .withMessage("Password required"),
];
