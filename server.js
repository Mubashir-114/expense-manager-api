import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import swaggerUi from "swagger-ui-express";

import authRoutes from "./routes/authRoutes.js";
import transactionRoutes from "./routes/transactionRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import budgetRoutes from "./routes/budgetRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";

import notFound from "./middleware/notFound.js";
import errorHandler from "./middleware/errorHandler.js";

import { validateConfig } from "./utils/configValidation.js";
import logger from "./utils/logger.js";
import swaggerDocument from "./config/swagger.js";
import pool from "./config/db.js";

// Load environment variables
dotenv.config();

// Validate config variables
validateConfig();

const app = express();

// Hide X-Powered-By header
app.disable("x-powered-by");

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((origin) => origin.trim())
  : ["http://localhost:3000", "http://localhost:5173"];

const corsOptions = {
  origin(origin, callback) {
    if (
      !origin ||
      allowedOrigins.includes(origin) ||
      origin.startsWith("http://localhost:") ||
      origin.startsWith("http://127.0.0.1:") ||
      origin.startsWith("https://localhost:") ||
      origin.startsWith("https://127.0.0.1:")
    ) {
      return callback(null, true);
    }
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: Number(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests, please try again later",
  },
});

app.set("trust proxy", 1);

// Security and compression middlewares
app.use(helmet());
app.use(compression());
app.use(cors(corsOptions));
app.use(express.json({ limit: process.env.JSON_LIMIT || "1mb" }));
app.use(express.urlencoded({ extended: true, limit: process.env.JSON_LIMIT || "1mb" }));
app.use(cookieParser(process.env.COOKIE_SECRET));
app.use(limiter);

// Access logging middleware
if (process.env.NODE_ENV !== "test") {
  const format = process.env.NODE_ENV === "production" ? "combined" : "dev";
  app.use(morgan(format, { stream: logger.stream }));
}

// Swagger documentation
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Health check endpoint
app.get("/health", async (req, res) => {
  let dbStatus = "healthy";
  try {
    await pool.query("SELECT 1");
  } catch (error) {
    dbStatus = "unhealthy";
    logger.error("Health check database query failure:", error);
  }

  const isHealthy = dbStatus === "healthy";
  const statusCode = isHealthy ? 200 : 500;

  res.status(statusCode).json({
    success: isHealthy,
    message: isHealthy ? "System is healthy" : "System is unhealthy",
    data: {
      database: dbStatus,
      api: "healthy",
      environment: process.env.NODE_ENV || "development",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
  });
});

// App routes
app.use("/api/auth", authRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/budgets", budgetRoutes);
app.use("/api/reports", reportRoutes);

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Personal Finance API Running",
    data: null,
  });
});

// Route not found and global error handlers
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

// Graceful shutdown handler
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  server.close(async () => {
    logger.info("Express server closed.");
    try {
      await pool.end();
      logger.info("Database connection pool closed.");
      process.exit(0);
    } catch (err) {
      logger.error("Error during database pool shutdown:", err);
      process.exit(1);
    }
  });

  // Force shutdown after 10s timeout
  setTimeout(() => {
    logger.error("Could not close active connections in time, forcefully shutting down.");
    process.exit(1);
  }, 10000);
};

// Listen for process signals
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

// Handle unhandled exceptions & promise rejections
process.on("uncaughtException", (error) => {
  logger.error("UNCAUGHT EXCEPTION: Server shutting down...", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("UNHANDLED REJECTION: Server shutting down...", reason);
  process.exit(1);
});
