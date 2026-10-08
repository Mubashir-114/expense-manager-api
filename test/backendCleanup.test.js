import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import test from "node:test";
import { body } from "express-validator";

import db from "../config/db.js";
import errorHandler from "../middleware/errorHandler.js";
import { createRequestLogger } from "../middleware/requestLogger.js";
import validate from "../middleware/validate.js";
import {
  getTransactionByHash,
  getTransactions,
} from "../models/transactionModel.js";
import TransactionImportService, {
  isDuplicateSmsHash,
} from "../services/transactionImportService.js";
import { importSmsValidation } from "../validators/transactionValidation.js";
import logger from "../utils/logger.js";
import { validateTestDatabaseConfig } from "../utils/configValidation.js";

test("transaction listing applies either date bound to rows and count", async () => {
  const originalExecute = db.execute;
  const calls = [];
  db.execute = async (sql, values) => {
    calls.push({ sql, values });
    return sql.includes("COUNT") ? [[{ total: 0 }]] : [[]];
  };

  try {
    await getTransactions(42, { from: "2026-02-01" });
    await getTransactions(42, { to: "2026-02-28" });
    await getTransactions(42, {
      from: "2026-02-01",
      to: "2026-02-28",
    });
  } finally {
    db.execute = originalExecute;
  }

  assert.equal(calls.length, 6);
  assert.match(calls[0].sql, /t\.transaction_date >= \?/);
  assert.deepEqual(calls[0].values, [42, "2026-02-01"]);
  assert.match(calls[1].sql, /t\.transaction_date >= \?/);
  assert.deepEqual(calls[1].values, [42, "2026-02-01"]);
  assert.match(calls[2].sql, /t\.transaction_date <= \?/);
  assert.deepEqual(calls[2].values, [42, "2026-02-28"]);
  assert.match(calls[3].sql, /t\.transaction_date <= \?/);
  assert.deepEqual(calls[3].values, [42, "2026-02-28"]);
  assert.match(calls[4].sql, /t\.transaction_date >= \?/);
  assert.match(calls[4].sql, /t\.transaction_date <= \?/);
  assert.deepEqual(calls[4].values, [42, "2026-02-01", "2026-02-28"]);
  assert.deepEqual(calls[5].values, [42, "2026-02-01", "2026-02-28"]);
});

test("validation errors redact credentials and private financial text", async () => {
  const req = {
    body: {
      password: "do-not-return-this",
      note: "private transaction detail",
    },
  };
  await body("password").isLength({ min: 100 }).run(req);
  await body("note").isLength({ max: 3 }).run(req);

  let validationError;
  validate(req, {}, (error) => {
    validationError = error;
  });

  assert.deepEqual(
    validationError.errors.map(({ field, value }) => ({ field, value })),
    [
      { field: "password", value: "[REDACTED]" },
      { field: "note", value: "[REDACTED]" },
    ],
  );
});

test("SMS import rejects values that exceed persisted column sizes", async () => {
  const req = {
    body: [
      {
        amount: 12.5,
        type: "expense",
        merchant: "Market",
        bank: "B".repeat(51),
        category: "Food",
        date: "2026-03-10",
        sender: "Bank",
        sms_hash: "hash",
        message: "Payment",
        reference: "R".repeat(101),
      },
    ],
  };
  await Promise.all(importSmsValidation.map((validator) => validator.run(req)));

  let validationError;
  validate(req, {}, (error) => {
    validationError = error;
  });

  assert.deepEqual(
    validationError.errors.map(({ field, value }) => ({ field, value })),
    [
      { field: "[0].reference", value: "[REDACTED]" },
      { field: "[0].bank", value: "[REDACTED]" },
    ],
  );
});

test("SMS duplicate detection handles the unique-index race only", () => {
  assert.equal(
    isDuplicateSmsHash({
      code: "ER_DUP_ENTRY",
      sqlMessage: "Duplicate entry for key 'uq_transaction_sms_hash'",
    }),
    true,
  );
  assert.equal(
    isDuplicateSmsHash({
      code: "ER_DUP_ENTRY",
      sqlMessage: "Duplicate entry for key 'users.email'",
    }),
    false,
  );
  assert.equal(isDuplicateSmsHash({ code: "ER_DUP_ENTRY" }), false);
});

test("SMS hash lookup scopes duplicate detection to the user", async () => {
  const originalExecute = db.execute;
  let query;
  db.execute = async (sql, values) => {
    query = { sql, values };
    return [[{ id: 13 }]];
  };

  try {
    assert.deepEqual(await getTransactionByHash(42, "same-hash"), { id: 13 });
  } finally {
    db.execute = originalExecute;
  }

  assert.match(query.sql, /WHERE user_id = \? AND sms_hash = \?/);
  assert.deepEqual(query.values, [42, "same-hash"]);
});

test("test database configuration rejects remote and non-disposable targets", () => {
  const validConfig = {
    FINTRACK_TEST_RUN_ID: "0123456789ab",
    DB_HOST: "127.0.0.1",
    DB_PORT: "13307",
    DB_NAME: "fintrack_test_0123456789ab",
    DB_USER: "fintrack_test_0123456789ab",
    DB_PASSWORD: "fintrack-test-synthetic",
  };

  assert.doesNotThrow(() => validateTestDatabaseConfig(validConfig));
  assert.throws(
    () => validateTestDatabaseConfig({ ...validConfig, DB_HOST: "db.example.test" }),
    /must be 127\.0\.0\.1/,
  );
  assert.throws(
    () => validateTestDatabaseConfig({ ...validConfig, DB_NAME: "finance" }),
    /must match the generated test run ID/,
  );
  assert.throws(
    () => validateTestDatabaseConfig({ ...validConfig, DB_PASSWORD: "application-secret" }),
    /synthetic test-only password prefix/,
  );
});

test("SMS import logs do not include hashes, SMS content, or user identifiers", async () => {
  const originalExecute = db.execute;
  const originalInfo = logger.info;
  const originalError = logger.error;
  const logEntries = [];
  let mode = "existing";
  db.execute = async (sql) => {
    if (sql.includes("FROM categories")) {
      return [[{ id: 2, name: "Food", type: "expense" }]];
    }
    if (sql.includes("SELECT id FROM transactions")) {
      return [mode === "existing" ? [{ id: 1 }] : []];
    }
    if (sql.includes("INSERT INTO transactions")) {
      if (mode === "race") {
        const error = new Error("private SMS content and transaction data");
        error.code = "ER_DUP_ENTRY";
        error.sqlMessage = "Duplicate entry for key 'uq_transaction_sms_hash'";
        throw error;
      }
      const error = new Error("private SMS content and transaction data");
      error.code = "private-sms-hash";
      throw error;
    }
    throw new Error("Unexpected query during SMS privacy test");
  };
  logger.info = (entry) => logEntries.push(entry);
  logger.error = (entry) => logEntries.push(entry);

  try {
    const syntheticTransaction = {
      amount: 18.25,
      type: "expense",
      merchant: "private merchant",
      bank: "Synthetic Bank",
      category: "Food",
      date: "2026-03-10",
      sender: "Synthetic Sender",
      reference: "private reference",
      sms_hash: "private-sms-hash",
      message: "private SMS content",
    };
    await TransactionImportService.importSmsTransactions(987654321, [
      syntheticTransaction,
    ]);
    mode = "race";
    await TransactionImportService.importSmsTransactions(987654321, [
      syntheticTransaction,
    ]);
    mode = "error";
    await TransactionImportService.importSmsTransactions(987654321, [
      syntheticTransaction,
    ]);
  } finally {
    db.execute = originalExecute;
    logger.info = originalInfo;
    logger.error = originalError;
  }

  const output = JSON.stringify(logEntries);
  for (const privateValue of [
    "987654321",
    "private-sms-hash",
    "private SMS content",
    "private merchant",
    "private reference",
    "18.25",
  ]) {
    assert.equal(output.includes(privateValue), false);
  }
});

test("production 500 responses do not expose internal error details", () => {
  const oldEnvironment = process.env.NODE_ENV;
  const originalLoggerError = logger.error;
  let response;
  let statusCode;
  process.env.NODE_ENV = "production";
  logger.error = () => {};

  try {
    errorHandler(
      new Error("database connection details"),
      { method: "GET", originalUrl: "/api/transactions", ip: "127.0.0.1" },
      {
        status(code) {
          statusCode = code;
          return this;
        },
        json(body) {
          response = body;
          return body;
        },
      },
      () => {},
    );
  } finally {
    logger.error = originalLoggerError;
    if (oldEnvironment === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = oldEnvironment;
    }
  }

  assert.equal(statusCode, 500);
  assert.equal(response.message, "Internal Server Error");
  assert.equal(response.stack, undefined);
  assert.equal(response.errors, null);
});

test("request logs omit query strings, headers, and request bodies", async () => {
  const lines = [];
  const server = createServer((req, res) => {
    createRequestLogger({ write: (line) => lines.push(line) })(req, res, () => {
      req.resume();
      res.end("ok");
    });
  });

  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });

    const address = server.address();
    assert.ok(address && typeof address !== "string");

    await new Promise((resolve, reject) => {
      const request = httpRequest(
        {
          hostname: "127.0.0.1",
          port: address.port,
          method: "POST",
          path: "/api/transactions?search=private%20merchant&token=private-jwt",
          headers: {
            authorization: "Bearer private-jwt",
            "content-type": "application/json",
          },
        },
        (response) => {
          response.resume();
          response.once("end", resolve);
        },
      );
      request.once("error", reject);
      request.end(
        JSON.stringify({
          password: "private-password",
          message: "raw SMS body",
          amount: 1234.56,
        }),
      );
    });
  } finally {
    if (server.listening) {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  }

  assert.equal(lines.length, 1);
  assert.match(lines[0], /POST \/api\/transactions HTTP\/1\.1 200/);
  for (const privateValue of [
    "private%20merchant",
    "private-jwt",
    "private-password",
    "raw SMS body",
    "1234.56",
    "127.0.0.1",
  ]) {
    assert.equal(lines[0].includes(privateValue), false);
  }
  assert.match(lines[0], /ms\n?$/);
});

test("error logs and 5xx responses omit query, credentials, and raw SMS", () => {
  const oldEnvironment = process.env.NODE_ENV;
  const originalLoggerError = logger.error;
  const logged = [];
  let response;
  let statusCode;
  const secrets = [
    "private-search-term",
    "private-jwt",
    "private-password",
    "raw SMS message",
    "private database detail",
  ];
  const error = new Error(
    "private database detail; raw SMS message; private-password",
  );
  error.code = "ER_BAD_DB_ERROR";
  error.sql = "INSERT ... private transaction body";
  error.sqlMessage = "private database detail";

  process.env.NODE_ENV = "production";
  logger.error = (entry) => logged.push(entry);

  try {
    errorHandler(
      error,
      {
        method: "POST",
        originalUrl:
          "/api/transactions?search=private-search-term&token=private-jwt",
        body: {
          password: "private-password",
          message: "raw SMS message",
        },
      },
      {
        status(code) {
          statusCode = code;
          return this;
        },
        json(body) {
          response = body;
          return body;
        },
      },
      () => {},
    );
  } finally {
    logger.error = originalLoggerError;
    if (oldEnvironment === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = oldEnvironment;
    }
  }

  const output = JSON.stringify(logged);
  for (const secret of secrets) {
    assert.equal(output.includes(secret), false);
  }
  assert.equal(logged[0].path, "/api/transactions");
  assert.equal(logged[0].statusCode, 500);
  assert.equal(statusCode, 500);
  assert.deepEqual(response, {
    success: false,
    message: "Internal Server Error",
    errors: null,
  });
});
