import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import path from "path";

const logDir = "logs";

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Errors are already written to error-%DATE%.log; keep them out of the
// access log so they are not stored twice.
const excludeErrors = winston.format((info) => (info.level === "error" ? false : info));

export const getSafeErrorDetails = (error) => {
  const details = {};

  if (
    typeof error?.name === "string" &&
    /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(error.name)
  ) {
    details.errorName = error.name;
  }

  if (
    typeof error?.code === "string" &&
    /^[A-Z0-9_]{1,64}$/.test(error.code)
  ) {
    details.errorCode = error.code;
  }

  return details;
};

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: logFormat,
  transports: [
    new DailyRotateFile({
      filename: path.join(logDir, "error-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      level: "error",
      zippedArchive: true,
      maxSize: "20m",
      maxFiles: "14d",
    }),
    new DailyRotateFile({
      filename: path.join(logDir, "access-%DATE%.log"),
      format: excludeErrors(),
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: "20m",
      maxFiles: "14d",
    }),
  ],
});

if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(
          (info) => `${info.timestamp} ${info.level}: ${info.message}${info.stack ? `\n${info.stack}` : ""}`
        )
      ),
    })
  );
}

logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  },
};

export default logger;
