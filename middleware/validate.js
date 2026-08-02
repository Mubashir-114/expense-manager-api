import { validationResult } from "express-validator";

import AppError from "../utils/AppError.js";

const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map((error) => ({
      field: error.path,
      message: error.msg,
      value: error.value,
    }));

    return next(new AppError("Validation failed", 400, formattedErrors));
  }

  return next();
};

export default validate;
