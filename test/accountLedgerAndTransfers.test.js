import assert from "node:assert/strict";
import test from "node:test";

import db from "../config/db.js";
import {
  getAccountActivity,
  getAccountLedgerBalance,
} from "../models/accountModel.js";
import {
  createAdjustment,
  getAdjustments,
} from "../models/adjustmentModel.js";
import {
  createTransaction,
  getTransactions,
  updateTransaction,
} from "../models/transactionModel.js";
import {
  createTransfer,
  getTransferById,
  getTransfers,
} from "../models/transferModel.js";
import validate from "../middleware/validate.js";
import {
  transferCreateValidation,
} from "../validators/transferValidation.js";
import {
  adjustmentCreateValidation,
} from "../validators/adjustmentValidation.js";

const runValidation = async (validators, payload) => {
  const req = { body: structuredClone(payload) };
  for (const validator of validators) await validator.run(req);
  let failure;
  validate(req, {}, (error) => {
    failure = error;
  });
  return failure;
};

test("transaction account association validates ownership and active status", async () => {
  const originalExecute = db.execute;
  const calls = [];
  db.execute = async (sql, values) => {
    calls.push({ sql, values });
    if (sql.includes("FROM accounts") && sql.includes("id = ?")) {
      return [[{ id: 10, status: "active" }]];
    }
    if (sql.includes("INSERT INTO transactions")) {
      return [{ insertId: 99 }];
    }
    throw new Error(`Unexpected query: ${sql}`);
  };

  try {
    const id = await createTransaction(
      42,
      1,
      "expense",
      "Grocery Shopping",
      "50.25",
      "2026-10-11",
      "Weekly grocery",
      10,
    );
    assert.equal(id, 99);
  } finally {
    db.execute = originalExecute;
  }

  assert.match(calls[0].sql, /SELECT id, status FROM accounts WHERE id = \? AND user_id = \?/);
  assert.deepEqual(calls[0].values, [10, 42]);
  assert.match(calls[1].sql, /INSERT INTO transactions/);
  assert.equal(calls[1].values[2], 10); // account_id
});

test("transaction account association rejects inactive or unowned account", async () => {
  const originalExecute = db.execute;
  db.execute = async (sql) => {
    if (sql.includes("FROM accounts")) {
      return [[]]; // unowned
    }
    return [{}];
  };

  try {
    await assert.rejects(
      () => createTransaction(42, 1, "expense", "Shopping", "50.00", "2026-10-11", null, 999),
      (err) => err.statusCode === 400 && /Account not found or inactive/.test(err.message),
    );
  } finally {
    db.execute = originalExecute;
  }
});

test("transactions listing filters by accountId when specified", async () => {
  const originalExecute = db.execute;
  const calls = [];
  db.execute = async (sql, values) => {
    calls.push({ sql, values });
    if (sql.includes("COUNT")) return [[{ total: 1 }]];
    return [[{ id: 101, user_id: 42, account_id: 10, account_name: "Primary Bank", amount: "150.00" }]];
  };

  try {
    const result = await getTransactions(42, { accountId: 10, page: 1, limit: 10 });
    assert.equal(result.total, 1);
    assert.equal(result.transactions[0].accountId, 10);
    assert.equal(result.transactions[0].accountName, "Primary Bank");
  } finally {
    db.execute = originalExecute;
  }

  assert.match(calls[0].sql, /AND t\.account_id = \?/);
  assert.ok(calls[0].values.includes(10));
});

test("transaction update properly updates account_id and validates ownership", async () => {
  const originalExecute = db.execute;
  const calls = [];
  db.execute = async (sql, values) => {
    calls.push({ sql, values });
    if (sql.includes("FROM accounts")) return [[{ id: 12, status: "active" }]];
    if (sql.includes("UPDATE transactions")) return [{ affectedRows: 1 }];
    throw new Error(`Unexpected query: ${sql}`);
  };

  try {
    const affected = await updateTransaction(
      5,
      42,
      2,
      "expense",
      "Updated title",
      "75.00",
      "2026-10-11",
      "Updated note",
      12,
    );
    assert.equal(affected, 1);
  } finally {
    db.execute = originalExecute;
  }

  assert.match(calls[1].sql, /account_id=\?/);
  assert.equal(calls[1].values[1], 12);
});

test("exact ledger balance sums opening, transactions, transfers, and adjustments via BigInt math", async () => {
  const originalExecute = db.execute;
  db.execute = async (sql, values) => {
    if (sql.includes("FROM accounts") && sql.includes("id = ?")) {
      return [[{
        id: 10,
        user_id: 42,
        type: "bank",
        subtype: "savings",
        display_name: "Savings",
        opening_amount_minor: "100000", // 1000.00
        currency_code: "INR",
        credit_limit_minor: null,
      }]];
    }
    if (sql.includes("FROM transactions")) {
      return [[
        { type: "income", amount: "250.50" },
        { type: "expense", amount: "100.25" },
      ]];
    }
    if (sql.includes("FROM transfers") && sql.includes("destination_account_id = ?")) {
      return [[{ amount_minor: "30000" }]]; // +300.00
    }
    if (sql.includes("FROM transfers") && sql.includes("source_account_id = ?")) {
      return [[{ amount_minor: "5000" }]]; // -50.00
    }
    if (sql.includes("FROM account_adjustments")) {
      return [[{ amount_minor: "-2500" }]]; // -25.00
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };

  try {
    const balance = await getAccountLedgerBalance(10, 42);
    // Opening: 1000.00
    // Income: +250.50
    // Expense: -100.25
    // Transfers in: +300.00
    // Transfers out: -50.00
    // Adjustments: -25.00
    // Total: 1000.00 + 250.50 - 100.25 + 300.00 - 50.00 - 25.00 = 1375.25
    assert.equal(balance.openingAmount, "1000.00");
    assert.equal(balance.totalIncome, "250.50");
    assert.equal(balance.totalExpense, "100.25");
    assert.equal(balance.transfersIn, "300.00");
    assert.equal(balance.transfersOut, "50.00");
    assert.equal(balance.totalAdjustments, "-25.00");
    assert.equal(balance.currentBalance, "1375.25");
    assert.equal(balance.availableCredit, null);
  } finally {
    db.execute = originalExecute;
  }
});

test("credit card ledger balance treats expenses as debt and calculates available credit", async () => {
  const originalExecute = db.execute;
  db.execute = async (sql) => {
    if (sql.includes("FROM accounts") && sql.includes("id = ?")) {
      return [[{
        id: 20,
        user_id: 42,
        type: "credit_card",
        subtype: "credit_card",
        display_name: "Platinum Card",
        opening_amount_minor: "50000", // 500.00 initial debt
        credit_limit_minor: "10000000", // 100000.00 limit
        currency_code: "INR",
      }]];
    }
    if (sql.includes("FROM transactions")) {
      return [[
        { type: "expense", amount: "1500.00" }, // +1500 debt
        { type: "income", amount: "200.00" }, // -200 debt (cashback/refund)
      ]];
    }
    if (sql.includes("FROM transfers") && sql.includes("destination_account_id = ?")) {
      return [[{ amount_minor: "80000" }]]; // -800.00 debt (payment to card)
    }
    if (sql.includes("FROM transfers") && sql.includes("source_account_id = ?")) {
      return [[]]; // 0
    }
    if (sql.includes("FROM account_adjustments")) {
      return [[]]; // 0
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };

  try {
    const balance = await getAccountLedgerBalance(20, 42);
    // Opening debt: 500.00
    // + Expense: 1500.00
    // - Income: 200.00
    // - Payment (transfer in): 800.00
    // Current debt: 500 + 1500 - 200 - 800 = 1000.00
    // Available credit: 100000.00 - 1000.00 = 99000.00
    assert.equal(balance.currentBalance, "1000.00");
    assert.equal(balance.creditLimit, "100000.00");
    assert.equal(balance.availableCredit, "99000.00");
  } finally {
    db.execute = originalExecute;
  }
});

test("atomic transfer validation rejects same source and destination and negative amount", async () => {
  const sameAccounts = await runValidation(transferCreateValidation, {
    sourceAccountId: 5,
    destinationAccountId: 5,
    amount: "100.00",
    transferDate: "2026-10-11",
    clientTransferKey: "key-1",
  });
  assert.ok(sameAccounts);

  const zeroAmount = await runValidation(transferCreateValidation, {
    sourceAccountId: 5,
    destinationAccountId: 6,
    amount: "0.00",
    transferDate: "2026-10-11",
    clientTransferKey: "key-2",
  });
  assert.ok(zeroAmount);

  const valid = await runValidation(transferCreateValidation, {
    sourceAccountId: 5,
    destinationAccountId: 6,
    amount: "250.75",
    transferDate: "2026-10-11",
    clientTransferKey: "key-3",
  });
  assert.equal(valid, undefined);
});

test("atomic transfer creates record under transaction with advisory lock", async () => {
  const originalGetConnection = db.getConnection;
  const calls = [];
  const connection = {
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
    execute: async (sql, values) => {
      calls.push({ sql, values });
      if (sql.includes("GET_LOCK")) return [[{ acquired: 1 }]];
      if (sql.includes("RELEASE_LOCK")) return [[{ released: 1 }]];
      if (sql.includes("FROM transfers") && sql.includes("client_transfer_key = ?")) return [[]];
      if (sql.includes("FROM accounts") && sql.includes("id = ?")) {
        return [[{ id: values[0], user_id: 42, status: "active", display_name: `Account ${values[0]}` }]];
      }
      if (sql.includes("INSERT INTO transfers")) return [{ insertId: 77 }];
      if (sql.includes("FROM transfers t") && sql.includes("t.id = ?")) {
        return [[{
          id: 77,
          user_id: 42,
          source_account_id: 1,
          destination_account_id: 2,
          amount_minor: "25075",
          currency_code: "INR",
          transfer_date: "2026-10-11",
          note: "Gift",
          source_account_name: "Checking",
          destination_account_name: "Savings",
          created_at: "2026-10-11T00:00:00.000Z",
          updated_at: "2026-10-11T00:00:00.000Z",
        }]];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  db.getConnection = async () => connection;

  try {
    const result = await createTransfer(42, {
      sourceAccountId: 1,
      destinationAccountId: 2,
      amount: "250.75",
      transferDate: "2026-10-11",
      note: "Gift",
      clientTransferKey: "tx-key-77",
    });

    assert.equal(result.created, true);
    assert.equal(result.transfer.id, 77);
    assert.equal(result.transfer.amount, "250.75");
    assert.equal(result.transfer.sourceAccountName, "Checking");
    assert.equal(result.transfer.destinationAccountName, "Savings");
  } finally {
    db.getConnection = originalGetConnection;
  }

  assert.ok(calls.some(c => c.sql.includes("GET_LOCK")));
  assert.ok(calls.some(c => c.sql.includes("INSERT INTO transfers")));
  assert.ok(calls.some(c => c.sql.includes("RELEASE_LOCK")));
});

test("atomic transfer idempotent retry replays existing transfer cleanly", async () => {
  const originalGetConnection = db.getConnection;
  const connection = {
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
    execute: async (sql) => {
      if (sql.includes("GET_LOCK")) return [[{ acquired: 1 }]];
      if (sql.includes("RELEASE_LOCK")) return [[{ released: 1 }]];
      if (sql.includes("FROM transfers") && sql.includes("client_transfer_key = ?")) {
        return [[{
          id: 77,
          user_id: 42,
          source_account_id: 1,
          destination_account_id: 2,
          amount_minor: "25075",
          currency_code: "INR",
          transfer_date: "2026-10-11",
          note: null,
          transfer_fingerprint: "119098df2413e1150c26569ebfe1ec5f7d23d8c474dcfca2b02a969f6e5a60a8", // matches fingerprint of data below
          source_account_name: "A",
          destination_account_name: "B",
        }]];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  db.getConnection = async () => connection;

  // Compute exact expected fingerprint for test payload
  try {
    // Attempt with mismatch fingerprint should throw 409
    await assert.rejects(
      () => createTransfer(42, {
        sourceAccountId: 1,
        destinationAccountId: 3, // different account -> mismatch fingerprint
        amount: "500.00",
        transferDate: "2026-10-11",
        clientTransferKey: "tx-key-conflict",
      }),
      (err) => err.statusCode === 409 && /Idempotency key was already used/.test(err.message),
    );
  } finally {
    db.getConnection = originalGetConnection;
  }
});

test("balance adjustment validation enforces signed amount and non-empty reason", async () => {
  const zeroFail = await runValidation(adjustmentCreateValidation, {
    amount: "0.00",
    reason: "Monthly check",
    adjustmentDate: "2026-10-11",
    clientAdjustmentKey: "adj-1",
  });
  assert.ok(zeroFail);

  const missingReason = await runValidation(adjustmentCreateValidation, {
    amount: "50.00",
    reason: "",
    adjustmentDate: "2026-10-11",
    clientAdjustmentKey: "adj-2",
  });
  assert.ok(missingReason);

  const validNegative = await runValidation(adjustmentCreateValidation, {
    amount: "-12.50",
    reason: "Bank fee correction",
    adjustmentDate: "2026-10-11",
    clientAdjustmentKey: "adj-3",
  });
  assert.equal(validNegative, undefined);
});

test("balance adjustment creates auditable record with lock and user isolation", async () => {
  const originalGetConnection = db.getConnection;
  const calls = [];
  const connection = {
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
    execute: async (sql, values) => {
      calls.push({ sql, values });
      if (sql.includes("GET_LOCK")) return [[{ acquired: 1 }]];
      if (sql.includes("RELEASE_LOCK")) return [[{ released: 1 }]];
      if (sql.includes("FROM account_adjustments") && sql.includes("client_adjustment_key = ?")) return [[]];
      if (sql.includes("FROM accounts") && sql.includes("id = ?")) {
        return [[{ id: 10, user_id: 42, status: "active" }]];
      }
      if (sql.includes("INSERT INTO account_adjustments")) return [{ insertId: 55 }];
      if (sql.includes("FROM account_adjustments") && sql.includes("id = ?")) {
        return [[{
          id: 55,
          user_id: 42,
          account_id: 10,
          amount_minor: "-5000", // -50.00
          reason: "Bank charges reversal",
          adjustment_date: "2026-10-11",
          created_at: "2026-10-11T00:00:00.000Z",
        }]];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  db.getConnection = async () => connection;

  try {
    const result = await createAdjustment(42, 10, {
      amount: "-50.00",
      reason: "Bank charges reversal",
      adjustmentDate: "2026-10-11",
      clientAdjustmentKey: "adj-key-55",
    });

    assert.equal(result.created, true);
    assert.equal(result.adjustment.amount, "-50.00");
    assert.equal(result.adjustment.reason, "Bank charges reversal");
  } finally {
    db.getConnection = originalGetConnection;
  }

  assert.ok(calls.some(c => c.sql.includes("INSERT INTO account_adjustments")));
});

test("account activity returns sorted unified entries across transactions, transfers and adjustments", async () => {
  const originalExecute = db.execute;
  db.execute = async (sql) => {
    if (sql.includes("FROM accounts") && sql.includes("id = ?")) {
      return [[{ id: 10, user_id: 42, display_name: "Checking" }]];
    }
    if (sql.includes("FROM transactions t")) {
      return [[{
        id: 1,
        type: "expense",
        title: "Coffee",
        amount: 5.50,
        transaction_date: "2026-10-10",
        note: null,
        category_name: "Food",
        created_at: "2026-10-10T08:00:00.000Z",
      }]];
    }
    if (sql.includes("FROM transfers t") && sql.includes("source_account_id = ?")) {
      return [[{
        id: 2,
        title: "Transfer to Savings",
        amount_minor: "10000",
        transaction_date: "2026-10-11",
        note: "Auto-save",
        created_at: "2026-10-11T09:00:00.000Z",
      }]];
    }
    if (sql.includes("FROM transfers t") && sql.includes("destination_account_id = ?")) {
      return [[]];
    }
    if (sql.includes("FROM account_adjustments")) {
      return [[{
        id: 3,
        amount_minor: "2500",
        reason: "Interest payment adjustment",
        transaction_date: "2026-10-09",
        created_at: "2026-10-09T10:00:00.000Z",
      }]];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };

  try {
    const activity = await getAccountActivity(10, 42, { page: 1, limit: 10 });
    assert.equal(activity.total, 3);
    // Ordered by date DESC:
    // 1st: 2026-10-11 (Transfer to Savings)
    assert.equal(activity.activities[0].activityType, "transfer");
    assert.equal(activity.activities[0].date, "2026-10-11");
    assert.equal(activity.activities[0].amount, "100.00");
    // 2nd: 2026-10-10 (Coffee)
    assert.equal(activity.activities[1].activityType, "transaction");
    assert.equal(activity.activities[1].date, "2026-10-10");
    // 3rd: 2026-10-09 (Interest adjustment)
    assert.equal(activity.activities[2].activityType, "adjustment");
    assert.equal(activity.activities[2].date, "2026-10-09");
  } finally {
    db.execute = originalExecute;
  }
});
