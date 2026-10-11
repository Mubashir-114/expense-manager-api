import { query } from "express-validator";

const DATE_REGEX = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const MONTH_REGEX = /^\d{4}-(?:0[1-9]|1[0-2])$/;

export const dashboardQueryValidation = [
  query("period")
    .optional()
    .isIn(["current_month", "previous_month", "custom"])
    .withMessage("Period must be one of: current_month, previous_month, custom"),

  query("month")
    .optional()
    .matches(MONTH_REGEX)
    .withMessage("Month must be in YYYY-MM format"),

  query("startDate")
    .optional()
    .matches(DATE_REGEX)
    .withMessage("startDate must be in YYYY-MM-DD format"),

  query("endDate")
    .optional()
    .matches(DATE_REGEX)
    .withMessage("endDate must be in YYYY-MM-DD format")
    .custom((endDate, { req }) => {
      if (req.query?.startDate && endDate < req.query.startDate) {
        throw new Error("endDate must be on or after startDate");
      }
      return true;
    }),

  query("limit")
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage("limit must be an integer between 1 and 50"),
];
