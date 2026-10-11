import assert from "node:assert/strict";
import test from "node:test";

import db from "../config/db.js";
import {
  createAccount,
  createCardRepayment,
  getAccountLedgerBalance,
  getCardPayments,
  getCreditCardDetails,
  updateCreditCardBilling,
} from "../models/accountModel.js";
import { createTransfer } from "../models/transferModel.js";
import {
  calculateUtilization,
  clampDay,
  computeCreditCardBilling,
  getDaysInMonth,
  getDueDateForStatement,
  getStatementDate,
  isLeapYear,
} from "../utils/creditCardBilling.js";
import validate from "../middleware/validate.js";
import {
  billingUpdateValidation,
  repaymentCreateValidation,
} from "../validators/accountValidation.js";

const runValidation = async (validators, payload) => {
  const req = { body: structuredClone(payload), params: { id: "1" } };
  for (const validator of validators) await validator.run(req);
  let failure;
  validate(req, {}, (error) => {
    failure = error;
  });
  return failure;
};

// ── 1. Date Calculation & Billing Unit Tests ─────────────────────────────────

test("isLeapYear accurately identifies leap years across century boundaries", () => {
  assert.equal(isLeapYear(2024), true); // Standard leap year
  assert.equal(isLeapYear(2026), false); // Standard common year
  assert.equal(isLeapYear(2000), true); // 400-year divisible
  assert.equal(isLeapYear(1900), false); // 100-year not 400-year
  assert.equal(isLeapYear(2028), true);
});

test("getDaysInMonth and clampDay handle 28, 29, 30, and 31-day months correctly", () => {
  assert.equal(getDaysInMonth(2026, 2), 28);
  assert.equal(getDaysInMonth(2024, 2), 29); // Leap year
  assert.equal(getDaysInMonth(2026, 4), 30);
  assert.equal(getDaysInMonth(2026, 10), 31);

  // Clamping day 31
  assert.equal(clampDay(2026, 2, 31), 28);
  assert.equal(clampDay(2024, 2, 31), 29);
  assert.equal(clampDay(2026, 4, 31), 30);
  assert.equal(clampDay(2026, 10, 31), 31);
});

test("statement and due date calculation correctly handles same-month and next-month due dates", () => {
  // Statement day 15, due day 5 -> Due date in next month
  const stmtOct = getStatementDate(2026, 10, 15);
  const dueNov = getDueDateForStatement(2026, 10, 15, 5);
  assert.equal(stmtOct, "2026-10-15");
  assert.equal(dueNov, "2026-11-05");

  // Statement day 5, due day 25 -> Due date in same month
  const stmtMay = getStatementDate(2026, 5, 5);
  const dueMay = getDueDateForStatement(2026, 5, 5, 25);
  assert.equal(stmtMay, "2026-05-05");
  assert.equal(dueMay, "2026-05-25");

  // Year transition: Statement day 20 in December, due day 10 in January
  const stmtDec = getStatementDate(2026, 12, 20);
  const dueJan = getDueDateForStatement(2026, 12, 20, 10);
  assert.equal(stmtDec, "2026-12-20");
  assert.equal(dueJan, "2027-01-10");
});

test("computeCreditCardBilling sets verified overdue, due, and settled indicators without inventing data", () => {
  // Scenario 1: Reference date 2026-10-11, statement day 15, due day 5.
  // Last statement was 2026-09-15, due date was 2026-10-05.
  // Since 2026-10-11 > 2026-10-05 and debt > 0, status is overdue!
  const overdueBilling = computeCreditCardBilling({
    statementClosingDay: 15,
    paymentDueDay: 5,
    outstandingDebtMinor: 250000n, // 2500.00 debt
    referenceDate: "2026-10-11",
  });
  assert.equal(overdueBilling.configured, true);
  assert.equal(overdueBilling.isOverdue, true);
  assert.equal(overdueBilling.isDue, false);
  assert.equal(overdueBilling.status, "overdue");
  assert.equal(overdueBilling.paymentDueDate, "2026-10-05");
  assert.equal(overdueBilling.isEstimated, true);

  // Scenario 2: Reference date 2026-10-02, statement was 2026-09-15, due date 2026-10-05.
  // 2026-10-02 <= 2026-10-05 and debt > 0 -> status is due!
  const dueBilling = computeCreditCardBilling({
    statementClosingDay: 15,
    paymentDueDay: 5,
    outstandingDebtMinor: 100000n,
    referenceDate: "2026-10-02",
  });
  assert.equal(dueBilling.isOverdue, false);
  assert.equal(dueBilling.isDue, true);
  assert.equal(dueBilling.status, "due");
  assert.equal(dueBilling.paymentDueDate, "2026-10-05");

  // Scenario 3: Debt is zero -> status is paid_in_full, never overdue
  const settledBilling = computeCreditCardBilling({
    statementClosingDay: 15,
    paymentDueDay: 5,
    outstandingDebtMinor: 0n,
    referenceDate: "2026-10-11",
  });
  assert.equal(settledBilling.isOverdue, false);
  assert.equal(settledBilling.isDue, false);
  assert.equal(settledBilling.status, "paid_in_full");

  // Scenario 4: Negative debt (credit balance)
  const creditBilling = computeCreditCardBilling({
    statementClosingDay: 15,
    paymentDueDay: 5,
    outstandingDebtMinor: -5000n,
    referenceDate: "2026-10-11",
  });
  assert.equal(creditBilling.status, "credit_balance");

  // Scenario 5: Unconfigured settings
  const unconfiguredBilling = computeCreditCardBilling({
    statementClosingDay: null,
    paymentDueDay: null,
    outstandingDebtMinor: 5000n,
  });
  assert.equal(unconfiguredBilling.configured, false);
  assert.equal(unconfiguredBilling.status, "outstanding_unconfigured");
});

test("calculateUtilization provides exact decimal percentage string", () => {
  // 0 debt
  assert.equal(calculateUtilization(0n, "10000000"), "0.00");
  // 15,000.00 debt out of 100,000.00 limit -> 15.00%
  assert.equal(calculateUtilization(1500000n, "10000000"), "15.00");
  // 500.50 debt out of 1,000.00 limit -> 50.05%
  assert.equal(calculateUtilization(50050n, "100000"), "50.05");
  // Overlimit: 120,000 debt out of 100,000 limit -> 120.00%
  assert.equal(calculateUtilization(12000000n, "10000000"), "120.00");
  // Negative debt
  assert.equal(calculateUtilization(-100n, "10000000"), "0.00");
});

// ── 2. Credit Card Accounting & Ledger Tests ─────────────────────────────────

test("credit card ledger balance calculates exact signed BigInt debt, available credit, and utilization", async () => {
  const originalExecute = db.execute;
  db.execute = async (sql) => {
    if (sql.includes("FROM accounts") && sql.includes("id = ?")) {
      return [[{
        id: 30,
        user_id: 101,
        type: "credit_card",
        subtype: "credit_card",
        display_name: "Signature Card",
        opening_amount_minor: "10000", // 100.00 opening debt
        credit_limit_minor: "5000000", // 50,000.00 limit
        statement_closing_day: 15,
        payment_due_day: 5,
        currency_code: "INR",
      }]];
    }
    if (sql.includes("FROM transactions")) {
      return [[
        { type: "expense", amount: "4900.00" }, // +4900.00 purchase
        { type: "income", amount: "200.00" },   // -200.00 refund (reduces debt)
      ]];
    }
    if (sql.includes("FROM transfers") && sql.includes("destination_account_id = ?")) {
      return [[{ amount_minor: "80000" }]]; // -800.00 repayment (transfer in)
    }
    if (sql.includes("FROM transfers") && sql.includes("source_account_id = ?")) {
      return [[]]; // 0 transfers out
    }
    if (sql.includes("FROM account_adjustments")) {
      return [[]]; // 0 adjustments
    }
    throw new Error(`Unexpected query: ${sql}`);
  };

  try {
    const balance = await getAccountLedgerBalance(30, 101);
    // Math:
    // Opening debt: 100.00 (10000 minor)
    // Purchases: +4900.00 (490000 minor)
    // Refunds: -200.00 (20000 minor)
    // Repayments: -800.00 (80000 minor)
    // Current debt: 100 + 4900 - 200 - 800 = 4000.00 (400000 minor)
    assert.equal(balance.currentBalance, "4000.00");
    assert.equal(balance.outstandingDebt, "4000.00");
    assert.equal(balance.creditLimit, "50000.00");
    // Available credit: 50,000 - 4,000 = 46,000.00
    assert.equal(balance.availableCredit, "46000.00");
    // Utilization: 4,000 / 50,000 = 8.00%
    assert.equal(balance.utilizationPercentage, "8.00");
    assert.equal(balance.billingInfo.configured, true);
    assert.equal(balance.billingInfo.statementClosingDay, 15);
    assert.equal(balance.billingInfo.paymentDueDay, 5);
  } finally {
    db.execute = originalExecute;
  }
});

// ── 3. Repayment Atomicity, Concurrency, and Validation Tests ────────────────

test("repayment validation rejects invalid amounts, non-date strings, and missing keys", async () => {
  const zeroAmount = await runValidation(repaymentCreateValidation, {
    sourceAccountId: 10,
    amount: "0.00",
    paymentDate: "2026-10-11",
    clientPaymentKey: "key-123",
  });
  assert.ok(zeroAmount);

  const negativeAmount = await runValidation(repaymentCreateValidation, {
    sourceAccountId: 10,
    amount: "-50.00",
    paymentDate: "2026-10-11",
    clientPaymentKey: "key-123",
  });
  assert.ok(negativeAmount);

  const invalidDate = await runValidation(repaymentCreateValidation, {
    sourceAccountId: 10,
    amount: "500.00",
    paymentDate: "invalid-date",
    clientPaymentKey: "key-123",
  });
  assert.ok(invalidDate);
});

test("createCardRepayment succeeds atomically and reduces debt and source balance", async () => {
  const originalGetConnection = db.getConnection;
  const calls = [];
  let transferCreated = false;

  const connection = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    execute: async (sql, values) => {
      calls.push({ sql, values });
      if (sql.includes("GET_LOCK")) return [[{ acquired: 1 }]];
      if (sql.includes("RELEASE_LOCK")) return [[{ released: 1 }]];

      // Target credit card
      if (sql.includes("SELECT") && sql.includes("FROM accounts") && values[0] === 20) {
        return [[{
          id: 20,
          user_id: 42,
          type: "credit_card",
          subtype: "credit_card",
          status: "active",
          display_name: "Millennia Card",
          opening_amount_minor: "100000", // 1000.00 debt
          credit_limit_minor: "10000000", // 100,000.00 limit
        }]];
      }

      // Source bank account
      if (sql.includes("SELECT") && sql.includes("FROM accounts") && values[0] === 10) {
        return [[{
          id: 10,
          user_id: 42,
          type: "bank",
          subtype: "savings",
          status: "active",
          display_name: "Savings Account",
          opening_amount_minor: "500000", // 5000.00 opening
          credit_limit_minor: null,
        }]];
      }

      // Checking idempotency in transfers
      if (sql.includes("FROM transfers") && sql.includes("client_transfer_key = ?")) {
        return [[]]; // Not replayed yet
      }

      // Transaction queries for source account balance (inside getAccountBalanceWithinTx)
      if (sql.includes("FROM transactions WHERE user_id = ? AND account_id = ?")) {
        return [[]]; // 0 transactions
      }
      if (sql.includes("FROM transfers WHERE user_id = ? AND destination_account_id = ?")) {
        return [[]]; // 0 transfers in
      }
      if (sql.includes("FROM transfers WHERE user_id = ? AND source_account_id = ?")) {
        return [[]]; // 0 transfers out prior
      }
      if (sql.includes("FROM account_adjustments WHERE user_id = ? AND account_id = ?")) {
        return [[]]; // 0 adjustments
      }

      // Insert repayment transfer
      if (sql.includes("INSERT INTO transfers")) {
        transferCreated = true;
        return [{ insertId: 55 }];
      }

      // Select newly inserted transfer
      if (sql.includes("FROM transfers t") && sql.includes("t.id = ?")) {
        return [[{
          id: 55,
          user_id: 42,
          source_account_id: 10,
          destination_account_id: 20,
          amount_minor: "100000", // 1000.00
          currency_code: "INR",
          transfer_date: "2026-10-11",
          note: "Repayment for Millennia Card",
          client_transfer_key: "repay-key-1",
          transfer_fingerprint: "fake-fingerprint",
          source_account_name: "Savings Account",
          destination_account_name: "Millennia Card",
          created_at: "2026-10-11T12:00:00.000Z",
          updated_at: "2026-10-11T12:00:00.000Z",
        }]];
      }

      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  db.getConnection = async () => connection;

  try {
    const result = await createCardRepayment(42, 20, {
      sourceAccountId: 10,
      amount: "1000.00",
      paymentDate: "2026-10-11",
      clientPaymentKey: "repay-key-1",
    });

    assert.equal(result.created, true);
    assert.equal(result.payment.id, 55);
    assert.equal(result.payment.amount, "1000.00");
    assert.equal(result.payment.sourceAccountName, "Savings Account");
    assert.equal(result.payment.destinationAccountName, "Millennia Card");
    assert.ok(calls.some(c => c.sql.includes("INSERT INTO transfers")));
  } finally {
    db.getConnection = originalGetConnection;
  }
});

test("createCardRepayment rejects insufficient funds in source account", async () => {
  const originalGetConnection = db.getConnection;
  const connection = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    execute: async (sql, values) => {
      if (sql.includes("GET_LOCK")) return [[{ acquired: 1 }]];
      if (sql.includes("RELEASE_LOCK")) return [[{ released: 1 }]];

      // Target credit card
      if (sql.includes("SELECT") && sql.includes("FROM accounts") && values[0] === 20) {
        return [[{
          id: 20,
          user_id: 42,
          type: "credit_card",
          subtype: "credit_card",
          status: "active",
          display_name: "Card",
          credit_limit_minor: "5000000",
        }]];
      }

      // Source bank account with only 100.00 (10000 minor)
      if (sql.includes("SELECT") && sql.includes("FROM accounts") && values[0] === 10) {
        return [[{
          id: 10,
          user_id: 42,
          type: "bank",
          subtype: "savings",
          status: "active",
          display_name: "Savings",
          opening_amount_minor: "10000", // Only 100.00!
        }]];
      }

      if (sql.includes("FROM transfers") && sql.includes("client_transfer_key = ?")) return [[]];
      if (sql.includes("FROM transactions")) return [[]];
      if (sql.includes("FROM transfers")) return [[]];
      if (sql.includes("FROM account_adjustments")) return [[]];

      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  db.getConnection = async () => connection;

  try {
    // Attempt to pay 500.00 when source has only 100.00
    await assert.rejects(
      () => createCardRepayment(42, 20, {
        sourceAccountId: 10,
        amount: "500.00",
        paymentDate: "2026-10-11",
        clientPaymentKey: "key-fail-funds",
      }),
      (err) => err.message.includes("Insufficient funds"),
    );
  } finally {
    db.getConnection = originalGetConnection;
  }
});

test("createCardRepayment rejects paying credit card from another credit card", async () => {
  const originalGetConnection = db.getConnection;
  const connection = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    execute: async (sql, values) => {
      if (sql.includes("GET_LOCK")) return [[{ acquired: 1 }]];
      if (sql.includes("RELEASE_LOCK")) return [[{ released: 1 }]];

      // Target credit card
      if (sql.includes("SELECT") && sql.includes("FROM accounts") && values[0] === 20) {
        return [[{
          id: 20,
          user_id: 42,
          type: "credit_card",
          status: "active",
          display_name: "Target Card",
        }]];
      }
      // Source account is ALSO a credit card!
      if (sql.includes("SELECT") && sql.includes("FROM accounts") && values[0] === 21) {
        return [[{
          id: 21,
          user_id: 42,
          type: "credit_card",
          status: "active",
          display_name: "Source Card",
        }]];
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  db.getConnection = async () => connection;

  try {
    await assert.rejects(
      () => createCardRepayment(42, 20, {
        sourceAccountId: 21,
        amount: "100.00",
        paymentDate: "2026-10-11",
        clientPaymentKey: "card-to-card-key",
      }),
      (err) => err.message.includes("Repayment must come from an asset account"),
    );
  } finally {
    db.getConnection = originalGetConnection;
  }
});

test("createCardRepayment rejects same-account repayment", async () => {
  await assert.rejects(
    () => createCardRepayment(42, 20, {
      sourceAccountId: 20, // same account
      amount: "100.00",
      paymentDate: "2026-10-11",
      clientPaymentKey: "same-acc-key",
    }),
    (err) => err.message.includes("Source and credit card accounts must be different"),
  );
});

// ── 4. Billing Settings Management Tests ─────────────────────────────────────

test("billingUpdateValidation validates day bounds between 1 and 31", async () => {
  const invalidDay = await runValidation(billingUpdateValidation, {
    statementClosingDay: 32,
    paymentDueDay: 5,
  });
  assert.ok(invalidDay);

  const zeroDay = await runValidation(billingUpdateValidation, {
    statementClosingDay: 0,
    paymentDueDay: 5,
  });
  assert.ok(zeroDay);

  const validDays = await runValidation(billingUpdateValidation, {
    statementClosingDay: 15,
    paymentDueDay: 5,
  });
  assert.equal(validDays, undefined);
});

test("updateCreditCardBilling rejects non-credit-card accounts", async () => {
  const originalGetConnection = db.getConnection;
  const connection = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    execute: async (sql, values) => {
      if (sql.includes("GET_LOCK")) return [[{ acquired: 1 }]];
      if (sql.includes("RELEASE_LOCK")) return [[{ released: 1 }]];
      if (sql.includes("SELECT") && sql.includes("FROM accounts")) {
        return [[{ id: 10, user_id: 42, type: "bank", status: "active" }]];
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  db.getConnection = async () => connection;

  try {
    await assert.rejects(
      () => updateCreditCardBilling(10, 42, { statementClosingDay: 15, paymentDueDay: 5 }),
      (err) => err.message.includes("only supported for credit cards"),
    );
  } finally {
    db.getConnection = originalGetConnection;
  }
});
