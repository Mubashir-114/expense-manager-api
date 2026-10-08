import morgan from "morgan";

import logger from "../utils/logger.js";

/**
 * Returns the request path without the query string.
 * Query strings can carry private financial search terms (e.g. ?search=...),
 * so they must never reach the log files.
 */
export const getSafePath = (req) => {
  const rawUrl = req.originalUrl || req.url || "";
  const queryIndex = rawUrl.search(/[?#]/);

  return queryIndex === -1 ? rawUrl : rawUrl.slice(0, queryIndex);
};

morgan.token("safe-path", getSafePath);

// Intentionally omits :url, :referrer (may hold a page URL with a query string),
// :user-agent, and request headers/bodies.
export const REQUEST_LOG_FORMAT =
  ":method :safe-path HTTP/:http-version :status :res[content-length] - :response-time ms";

export const createRequestLogger = (stream = logger.stream) =>
  morgan(REQUEST_LOG_FORMAT, { stream });

export default createRequestLogger;
