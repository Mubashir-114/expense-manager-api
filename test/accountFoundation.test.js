import assert from "node:assert/strict";
import test from "node:test";

import db from "../config/db.js";
import swaggerDocument from "../config/swagger.js";
import authMiddleware from "../middleware/authMiddleware.js";
import validate from "../middleware/validate.js";
import {
  archiveAccount,
  createAccount,
  getAccountById,
  getAccounts,
  setDefaultAccount,
  toAccountJson,
  updateAccount,
} from "../models/accountModel.js";
import {
  accountCreateValidation,
  accountUpdateValidation,
} from "../validators/accountValidation.js";
import { formatMinorAsDecimal, parseDecimalToMinor } from "../utils/money.js";

const runValidation = async (validators, payload) => {
  const req = { body: structuredClone(payload) };
  for (const validator of validators) await validator.run(req);
  let failure;
  validate(req, {}, (error) => { failure = error; });
  return failure;
};

const baseAccount = (overrides = {}) => ({
  type: "bank",
  subtype: "savings",
  displayName: "Synthetic savings",
  institutionName: "Synthetic Bank",
  maskedLast4: "1234",
  currencyCode: "INR",
  openingAmount: "1000.25",
  isDefault: true,
  clientCreationKey: "test-create-0001",
  ...overrides,
});

const modelAccount = (overrides = {}) => ({
  type: "bank",
  subtype: "savings",
  displayName: "Synthetic savings",
  institutionName: "Synthetic Bank",
  maskedLast4: "1234",
  currencyCode: "INR",
  openingAmountMinor: "100025",
  creditLimitMinor: null,
  isDefault: true,
  clientCreationKey: "test-create-0001",
  ...overrides,
});

const rowAccount = (overrides = {}) => ({
  id: 7,
  user_id: 42,
  type: "bank",
  subtype: "savings",
  display_name: "Synthetic savings",
  institution_name: "Synthetic Bank",
  masked_last4: "1234",
  currency_code: "INR",
  opening_amount_minor: "100025",
  credit_limit_minor: null,
  is_default: 1,
  status: "active",
  created_at: "2026-10-11T00:00:00.000Z",
  updated_at: "2026-10-11T00:00:00.000Z",
  ...overrides,
});

test("MySQL pool preserves unsafe BIGINT values as exact strings", () => {
  const config = db.pool.config.connectionConfig;
  assert.equal(config.supportBigNumbers, true);
  assert.equal(config.bigNumberStrings, false);
});

test("money conversion is exact, canonical, and supports signed BIGINT boundaries", () => {
  assert.equal(parseDecimalToMinor("0"), "0");
  assert.equal(parseDecimalToMinor("12.3"), "1230");
  assert.equal(parseDecimalToMinor("-12.34"), "-1234");
  assert.equal(parseDecimalToMinor("92233720368547758.07"), "9223372036854775807");
  assert.equal(parseDecimalToMinor("-92233720368547758.08"), "-9223372036854775808");
  assert.equal(formatMinorAsDecimal("-1234"), "-12.34");
  assert.equal(formatMinorAsDecimal("0"), "0.00");
  assert.equal(formatMinorAsDecimal("9223372036854775807"), "92233720368547758.07");
  assert.equal(formatMinorAsDecimal("-9223372036854775808"), "-92233720368547758.08");
  assert.equal(formatMinorAsDecimal(Number.MAX_SAFE_INTEGER), "90071992547409.91");
  assert.throws(() => parseDecimalToMinor(1.25), /decimal string/);
  assert.throws(() => parseDecimalToMinor("1.234"), /decimal string/);
  assert.throws(() => parseDecimalToMinor("01.00"), /decimal string/);
  assert.throws(() => parseDecimalToMinor("-0.00"), /Negative zero/);
  assert.throws(() => parseDecimalToMinor("92233720368547758.08"), /supported range/);
  assert.throws(() => parseDecimalToMinor("-92233720368547758.09"), /supported range/);
  assert.throws(() => formatMinorAsDecimal(Number.MAX_SAFE_INTEGER + 1), /exact integer/);
  assert.throws(() => formatMinorAsDecimal("9223372036854775808"), /BIGINT range/);
});

test("account serialization preserves exact signed BIGINT boundary values", () => {
  const maximum = toAccountJson(rowAccount({
    opening_amount_minor: "9223372036854775807",
    credit_limit_minor: "9223372036854775807",
  }));
  const minimum = toAccountJson(rowAccount({ opening_amount_minor: "-9223372036854775808" }));

  assert.equal(maximum.openingAmount, "92233720368547758.07");
  assert.equal(maximum.creditLimit, "92233720368547758.07");
  assert.equal(minimum.openingAmount, "-92233720368547758.08");
});

test("every supported account type and subtype validates", async () => {
  const payloads = [
    baseAccount({ subtype: "savings" }),
    baseAccount({ subtype: "current", openingAmount: "-100.00", clientCreationKey: "test-create-0002" }),
    baseAccount({ subtype: "salary", clientCreationKey: "test-create-0003" }),
    baseAccount({ type: "cash", subtype: "cash", institutionName: undefined, maskedLast4: undefined, clientCreationKey: "test-create-0004" }),
    baseAccount({ type: "wallet", subtype: "stored_value", maskedLast4: undefined, clientCreationKey: "test-create-0005" }),
    baseAccount({ type: "credit_card", subtype: "credit_card", openingAmount: "5000.00", creditLimit: "100000.00", isDefault: false, clientCreationKey: "test-create-0006" }),
  ];

  for (const payload of payloads) {
    assert.equal(await runValidation(accountCreateValidation, payload), undefined);
  }
});

test("invalid subtype, unsafe balance states, and full-number-like metadata are rejected", async () => {
  const invalid = [
    baseAccount({ type: "cash", subtype: "savings", institutionName: undefined, maskedLast4: undefined }),
    baseAccount({ subtype: "savings", openingAmount: "-0.01" }),
    baseAccount({ type: "credit_card", subtype: "credit_card", creditLimit: "0.00", isDefault: false }),
    baseAccount({ type: "credit_card", subtype: "credit_card", creditLimit: "100.00", isDefault: true }),
    baseAccount({ maskedLast4: "1234567890123456" }),
    baseAccount({ openingAmount: 1.25 }),
  ];
  for (const payload of invalid) assert.ok(await runValidation(accountCreateValidation, payload));
});

test("metadata updates reject opening-balance and type edits", async () => {
  assert.ok(await runValidation(accountUpdateValidation, {
    displayName: "Changed",
    openingAmount: "500.00",
  }));
  assert.ok(await runValidation(accountUpdateValidation, {
    displayName: "Changed",
    type: "cash",
  }));
});

test("account authentication middleware rejects missing bearer credentials", async () => {
  const failure = await new Promise((resolve) => {
    authMiddleware({ headers: {} }, {}, (error) => resolve(error));
  });
  assert.equal(failure.statusCode, 401);
});

test("Swagger documents all six authenticated account operations", () => {
  const operations = Object.values(swaggerDocument.paths)
    .flatMap((path) => Object.values(path))
    .filter((operation) => operation.tags?.includes("Accounts"));

  assert.equal(operations.length, 6);
  for (const operation of operations) {
    assert.deepEqual(operation.security, [{ BearerAuth: [] }]);
    assert.ok(operation.responses[200] || operation.responses[201]);
    for (const [status, response] of Object.entries(operation.responses)) {
      assert.ok(response.description, `response ${status} needs a description`);
      assert.ok(response.content?.["application/json"]?.schema, `response ${status} needs a schema`);
    }
  }
});

test("owned account lookup always scopes by authenticated user", async () => {
  const originalExecute = db.execute;
  let call;
  db.execute = async (sql, values) => {
    call = { sql, values };
    return [[rowAccount()]];
  };
  try {
    const account = await getAccountById(7, 42);
    assert.equal(account.openingAmount, "1000.25");
  } finally {
    db.execute = originalExecute;
  }
  assert.match(call.sql, /id = \? AND user_id = \?/);
  assert.deepEqual(call.values, [7, 42]);
});

test("listing applies ownership, filters, and bounded pagination", async () => {
  const originalExecute = db.execute;
  const calls = [];
  db.execute = async (sql, values) => {
    calls.push({ sql, values });
    return sql.includes("COUNT") ? [[{ total: 1 }]] : [[rowAccount()]];
  };
  try {
    const result = await getAccounts(42, { type: "bank", status: "archived", page: 2, limit: 5 });
    assert.equal(result.total, 1);
    assert.equal(result.accounts[0].openingAmount, "1000.25");
  } finally {
    db.execute = originalExecute;
  }
  assert.match(calls[0].sql, /user_id = \?/);
  assert.match(calls[0].sql, /status = \?/);
  assert.match(calls[0].sql, /type = \?/);
  assert.match(calls[0].sql, /LIMIT 5 OFFSET 5/);
  assert.deepEqual(calls[0].values, [42, "archived", "bank"]);
});

test("listing rejects unsafe pagination before SQL interpolation", async () => {
  await assert.rejects(
    () => getAccounts(42, { page: Number.MAX_SAFE_INTEGER, limit: 100 }),
    (error) => error.statusCode === 400 && /offset/.test(error.message),
  );
  await assert.rejects(
    () => getAccounts(42, { page: "9007199254740992", limit: 20 }),
    (error) => error.statusCode === 400 && /Page/.test(error.message),
  );
  await assert.rejects(
    () => getAccounts(42, { page: 1, limit: 101 }),
    (error) => error.statusCode === 400 && /Limit/.test(error.message),
  );
});

test("metadata update is ownership-scoped and preserves immutable financial fields", async () => {
  const originalGetConnection = db.getConnection;
  const calls = [];
  let updated = false;
  const connection = {
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
    execute: async (sql, values) => {
      calls.push({ sql, values });
      if (sql.includes("GET_LOCK")) return [[{ acquired: 1 }]];
      if (sql.includes("RELEASE_LOCK")) return [[{ released: 1 }]];
      if (sql.includes("FROM accounts") && sql.includes("id = ?")) {
        return [[rowAccount(updated ? { display_name: "Renamed", masked_last4: "4321" } : {})]];
      }
      if (sql.includes("UPDATE accounts")) { updated = true; return [{ affectedRows: 1 }]; }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  db.getConnection = async () => connection;
  try {
    const account = await updateAccount(7, 42, {
      displayName: "Renamed",
      institutionName: "Synthetic Bank",
      maskedLast4: "4321",
    });
    assert.equal(account.displayName, "Renamed");
    assert.equal(account.openingAmount, "1000.25");
  } finally {
    db.getConnection = originalGetConnection;
  }
  const update = calls.find(({ sql }) => sql.includes("UPDATE accounts"));
  assert.deepEqual(update.values, ["Renamed", "Synthetic Bank", "4321", 7, 42]);
  assert.doesNotMatch(update.sql, /opening_amount_minor|credit_limit_minor|type\s*=/);
});

test("creation is transactionally idempotent and conflicting retries fail", async () => {
  const originalGetConnection = db.getConnection;
  let stored;
  let insertCount = 0;
  const connection = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    execute: async (sql, values) => {
      if (sql.includes("GET_LOCK")) return [[{ acquired: 1 }]];
      if (sql.includes("RELEASE_LOCK")) return [[{ released: 1 }]];
      if (sql.includes("SELECT") && sql.includes("client_creation_key")) return [stored ? [stored] : []];
      if (sql.includes("type <> 'credit_card'") && sql.includes("SELECT id")) return [[]];
      if (sql.includes("INSERT INTO accounts")) {
        insertCount += 1;
        stored = rowAccount({
          creation_fingerprint: values[11],
          is_default: values[9] ? 1 : 0,
        });
        return [{ insertId: 7 }];
      }
      if (sql.includes("WHERE id = ? AND user_id = ?")) return [[stored]];
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  db.getConnection = async () => connection;
  try {
    assert.equal((await createAccount(42, modelAccount())).created, true);
    assert.equal((await createAccount(42, modelAccount())).created, false);
    await assert.rejects(
      () => createAccount(42, modelAccount({ displayName: "Conflicting retry" })),
      (error) => error.statusCode === 409,
    );
  } finally {
    db.getConnection = originalGetConnection;
  }
  assert.equal(insertCount, 1);
});

test("default selection locks the user and clears the prior default before setting target", async () => {
  const originalGetConnection = db.getConnection;
  const calls = [];
  const connection = {
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
    execute: async (sql, values) => {
      calls.push({ sql, values });
      if (sql.includes("GET_LOCK")) return [[{ acquired: 1 }]];
      if (sql.includes("RELEASE_LOCK")) return [[{ released: 1 }]];
      if (sql.includes("FROM accounts") && sql.includes("id = ?")) return [[rowAccount({ is_default: calls.length > 3 ? 1 : 0 })]];
      if (sql.includes("UPDATE accounts")) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  db.getConnection = async () => connection;
  try { await setDefaultAccount(7, 42); } finally { db.getConnection = originalGetConnection; }
  assert.match(calls[0].sql, /GET_LOCK/);
  assert.match(calls[1].sql, /FOR UPDATE/);
  assert.match(calls[2].sql, /SET is_default = FALSE/);
  assert.match(calls[3].sql, /SET is_default = TRUE/);
});

test("archiving preserves the row and promotes a replacement default", async () => {
  const originalGetConnection = db.getConnection;
  const calls = [];
  let archived = false;
  const connection = {
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
    execute: async (sql, values) => {
      calls.push({ sql, values });
      if (sql.includes("GET_LOCK")) return [[{ acquired: 1 }]];
      if (sql.includes("RELEASE_LOCK")) return [[{ released: 1 }]];
      if (sql.includes("FROM accounts") && sql.includes("id = ?")) {
        return [[rowAccount({ status: archived ? "archived" : "active", is_default: archived ? 0 : 1 })]];
      }
      if (sql.includes("status = 'archived'")) { archived = true; return [{ affectedRows: 1 }]; }
      if (sql.includes("LIMIT 1 FOR UPDATE")) return [[{ id: 8 }]];
      if (sql.includes("SET is_default = TRUE")) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  db.getConnection = async () => connection;
  try {
    const account = await archiveAccount(7, 42);
    assert.equal(account.status, "archived");
  } finally {
    db.getConnection = originalGetConnection;
  }
  assert.equal(calls.some(({ sql }) => /DELETE FROM accounts/i.test(sql)), false);
  assert.equal(calls.some(({ sql }) => /SET is_default = TRUE/.test(sql)), true);
});

test("archiving normalizes a string zero default flag as false", async () => {
  const originalGetConnection = db.getConnection;
  const calls = [];
  let archived = false;
  const connection = {
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
    execute: async (sql, values) => {
      calls.push({ sql, values });
      if (sql.includes("GET_LOCK")) return [[{ acquired: 1 }]];
      if (sql.includes("RELEASE_LOCK")) return [[{ released: 1 }]];
      if (sql.includes("FROM accounts") && sql.includes("id = ?")) {
        return [[rowAccount({ status: archived ? "archived" : "active", is_default: "0" })]];
      }
      if (sql.includes("status = 'archived'")) { archived = true; return [{ affectedRows: 1 }]; }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  db.getConnection = async () => connection;
  try { await archiveAccount(7, 42); } finally { db.getConnection = originalGetConnection; }
  assert.equal(calls.some(({ sql }) => sql.includes("LIMIT 1 FOR UPDATE")), false);
});
