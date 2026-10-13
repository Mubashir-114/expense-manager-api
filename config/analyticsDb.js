import mysql from "mysql2/promise";
import dotenv from "dotenv";
import AppError from "../utils/AppError.js";

if (process.env.NODE_ENV !== "test") {
  dotenv.config();
}

/**
 * Dedicated Read-Only Connection Pool for Analytics (Phase 5A)
 *
 * Invariants:
 * 1. Least-Privilege Identity: Connects with dedicated read-only credentials
 *    (ANALYTICS_DB_USER / ANALYTICS_DB_PASSWORD).
 * 2. Fail-Closed: Never silently falls back to the privileged application pool (db.js).
 *    If ANALYTICS_DB_USER is unconfigured or the connection fails, throws 503.
 * 3. Defense-in-depth SQL Guard: Enforces that queries executed through this pool
 *    are strictly read-only SELECT statements and blocks any mutations or access to
 *    sensitive tables (such as detected_transactions or users).
 */

const BLOCKED_SQL_KEYWORDS = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|REPLACE|CREATE|GRANT|REVOKE)\b/i;
const BLOCKED_TABLES = /\b(detected_transactions|users)\b/i;

let analyticsPool = null;

export const resetAnalyticsPool = () => {
  analyticsPool = null;
};

export const getAnalyticsPool = () => {
  if (analyticsPool) {
    return analyticsPool;
  }

  const user = process.env.ANALYTICS_DB_USER;
  const password = process.env.ANALYTICS_DB_PASSWORD;
  const host = process.env.ANALYTICS_DB_HOST || process.env.DB_HOST || "localhost";
  const port = Number(process.env.ANALYTICS_DB_PORT || process.env.DB_PORT || 3306);
  const database = process.env.ANALYTICS_DB_NAME || process.env.DB_NAME;

  // In all environments, if ANALYTICS_DB_USER is not configured, FAIL CLOSED.
  // Never fall back to the privileged application user (DB_USER/DB_PASSWORD).
  if (!user) {
    throw new AppError(
      "Dedicated read-only analytics database user (ANALYTICS_DB_USER) is not configured. Analytics connection unavailable.",
      503
    );
  }

  analyticsPool = mysql.createPool({
    host,
    port,
    user,
    password: password || "",
    database,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    supportBigNumbers: true,
    bigNumberStrings: false,
  });

  return analyticsPool;
};

export const validateAnalyticsQuery = (sql) => {
  if (typeof sql !== "string") {
    throw new AppError("Invalid SQL query for analytics", 400);
  }

  const trimmed = sql.trim();
  const upper = trimmed.toUpperCase();

  // Must begin with SELECT or WITH (for CTEs)
  if (!upper.startsWith("SELECT") && !upper.startsWith("WITH")) {
    throw new AppError("Analytics database allows read-only SELECT queries only.", 403);
  }

  // Must not contain mutating keywords anywhere
  if (BLOCKED_SQL_KEYWORDS.test(trimmed)) {
    throw new AppError("Mutating SQL statements are forbidden on the analytics database connection.", 403);
  }

  // Must not access unconfirmed detected_transactions or users table
  if (BLOCKED_TABLES.test(trimmed)) {
    throw new AppError("Access to sensitive/unconfirmed tables is forbidden on the analytics database connection.", 403);
  }
};

const analyticsDb = {
  execute: async (sql, params = []) => {
    validateAnalyticsQuery(sql);
    const pool = getAnalyticsPool();
    return pool.execute(sql, params);
  },
};

export default analyticsDb;
