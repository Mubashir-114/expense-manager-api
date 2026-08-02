import logger from "../utils/logger.js";

const getDuplicateMessage = (error) => {
  if (error.sqlMessage && error.sqlMessage.includes("users.email")) {
    return "Email already exists";
  }

  if (error.sqlMessage && error.sqlMessage.includes("uq_user_category_month_year")) {
    return "Budget already exists for this category, month, and year";
  }

  return "Duplicate entry";
};

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal Server Error";
  let errors = err.errors || null;

  // Handle MySQL errors
  if (err.code === "ER_DUP_ENTRY") {
    statusCode = 409;
    message = getDuplicateMessage(err);
  }

  if (err.code === "ER_NO_REFERENCED_ROW_2" || err.code === "ER_NO_REFERENCED_ROW") {
    statusCode = 400;
    message = "Referenced record does not exist";
  }

  if (err.code === "ER_ROW_IS_REFERENCED_2" || err.code === "ER_ROW_IS_REFERENCED") {
    statusCode = 400;
    message = "Cannot delete this record because it is being used";
  }

  // Handle JWT errors
  if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Invalid token";
  }

  if (err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Token expired";
  }

  // Handle CORS errors
  if (err.message === "Not allowed by CORS") {
    statusCode = 403;
    message = "Not allowed by CORS";
  }

  // Handle JSON parsing syntax errors
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    statusCode = 400;
    message = "Invalid JSON payload";
  }

  // Log all errors
  logger.error({
    message: err.message || message,
    statusCode,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    stack: err.stack,
    errors,
  });

  const response = {
    success: false,
    message,
    errors,
  };

  if (process.env.NODE_ENV !== "production") {
    response.stack = err.stack;
  }

  return res.status(statusCode).json(response);
};

export default errorHandler;
