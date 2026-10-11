import assert from "node:assert/strict";
import test from "node:test";

import db from "../config/db.js";
import { parseBankSms, generateSmsHash } from "../utils/smsBankParser.js";
import { normalizeMerchant } from "../utils/merchantNormalizer.js";
import { predictCategory } from "../utils/smartCategorizer.js";
import { matchAccount } from "../utils/accountMatcher.js";
import {
  detectSmartTransactions,
  getDetectedTransactions,
  getDetectedTransactionById,
  updateDetectedTransaction,
  confirmDetectedTransaction,
  rejectDetectedTransaction,
  batchConfirmDetected,
  batchRejectDetected,
  toDetectedTxJson,
} from "../models/detectedTransactionModel.js";
import validate from "../middleware/validate.js";
import {
  detectValidation,
  smartTxIdValidation,
  updateSmartTxValidation,
  confirmSmartTxValidation,
  rejectSmartTxValidation,
  smartTxQueryValidation,
} from "../validators/smartTransactionValidation.js";

const runValidation = async (validators, payload, params = {}, query = {}) => {
  const req = { body: structuredClone(payload), params: structuredClone(params), query: structuredClone(query) };
  for (const validator of validators) await validator.run(req);
  let failure;
  validate(req, {}, (error) => { failure = error; });
  return failure;
};

// ── 1. Bank SMS Parser Unit Tests ──────────────────────────────────────────

test("parseBankSms correctly parses HDFC Bank UPI debit SMS", () => {
  const sms = {
    sender: "HDFCBK",
    message: "Sent Rs.450.00 from HDFC Bank A/C **1234 to SWIGGY on 11-OCT-26 via UPI Ref 987654321012",
    timestamp: "2026-10-11T12:00:00Z",
  };
  const parsed = parseBankSms(sms);

  assert.ok(parsed, "Expected parsed result");
  assert.equal(parsed.amount, "450.00");
  assert.equal(parsed.direction, "debit");
  assert.equal(parsed.classification, "expense");
  assert.equal(parsed.bank, "HDFC");
  assert.equal(parsed.maskedAccountHint, "1234");
  assert.equal(parsed.referenceNumber, "987654321012");
  assert.equal(parsed.merchantRaw, "SWIGGY");
  assert.ok(parsed.smsHash);
});

test("parseBankSms correctly parses SBI credit SMS with commas and salary transfer", () => {
  const sms = {
    sender: "SBIBNK",
    message: "Your A/C ending 5678 is credited by INR 25,000.00 on 10/10/26 by SALARY transfer Ref 11223344",
    timestamp: "2026-10-10T09:30:00Z",
  };
  const parsed = parseBankSms(sms);

  assert.ok(parsed, "Expected parsed result");
  assert.equal(parsed.amount, "25000.00");
  assert.equal(parsed.direction, "credit");
  assert.equal(parsed.classification, "income");
  assert.equal(parsed.bank, "SBI");
  assert.equal(parsed.maskedAccountHint, "5678");
  assert.equal(parsed.referenceNumber, "11223344");
});

test("parseBankSms correctly parses ICICI Bank credit card spent SMS", () => {
  const sms = {
    sender: "ICICIB",
    message: "INR 1,299.00 spent on ICICI Bank Card XX4321 on 11-Oct-26 at AMAZON INDIA. Avl Lmt: INR 45,000",
    timestamp: "2026-10-11T14:15:00Z",
  };
  const parsed = parseBankSms(sms);

  assert.ok(parsed, "Expected parsed result");
  assert.equal(parsed.amount, "1299.00");
  assert.equal(parsed.direction, "debit");
  assert.equal(parsed.classification, "credit_card_purchase");
  assert.equal(parsed.bank, "ICICI");
  assert.equal(parsed.maskedAccountHint, "4321");
  assert.equal(parsed.merchantRaw, "AMAZON INDIA");
});

test("parseBankSms correctly parses Axis Bank UPI payment", () => {
  const sms = {
    sender: "AXISBK",
    message: "Rs. 120.00 debited from Axis Bank A/c no. XX9988 on 11-10-2026 at uber@icici UPI Ref 44556677",
    timestamp: "2026-10-11T16:00:00Z",
  };
  const parsed = parseBankSms(sms);

  assert.ok(parsed, "Expected parsed result");
  assert.equal(parsed.amount, "120.00");
  assert.equal(parsed.direction, "debit");
  assert.equal(parsed.classification, "expense");
  assert.equal(parsed.bank, "AXIS");
  assert.equal(parsed.maskedAccountHint, "9988");
  assert.equal(parsed.referenceNumber, "44556677");
});

test("parseBankSms returns null for non-financial or OTP SMS", () => {
  const otpSms = {
    sender: "HDFCBK",
    message: "Your OTP for login is 123456. Do not share it with anyone.",
    timestamp: "2026-10-11T12:00:00Z",
  };
  assert.equal(parseBankSms(otpSms), null);

  const promoSms = {
    sender: "SWIGGY",
    message: "50% OFF on your favourite biryani! Order now.",
    timestamp: "2026-10-11T12:00:00Z",
  };
  assert.equal(parseBankSms(promoSms), null);
});

test("generateSmsHash creates deterministic, collision-resistant hashes", () => {
  const hash1 = generateSmsHash("HDFCBK", 1760000000000, "Sent Rs.500 to Swiggy");
  const hash2 = generateSmsHash("HDFCBK", 1760000000000, "Sent Rs.500 to Swiggy");
  const hash3 = generateSmsHash("HDFCBK", 1760000000001, "Sent Rs.500 to Swiggy");

  assert.equal(hash1, hash2);
  assert.notEqual(hash1, hash3);
});

// ── 2. Merchant Normalization Unit Tests ────────────────────────────────────

test("normalizeMerchant strips noise and identifies known Indian merchants", () => {
  assert.equal(normalizeMerchant("SWIGGY BANGALORE IN").clean, "Swiggy");
  assert.equal(normalizeMerchant("ZOMATO RESTAURANT GURGAON").clean, "Zomato");
  assert.equal(normalizeMerchant("AMAZON PAY INDIA PVT LTD").clean, "Amazon");
  assert.equal(normalizeMerchant("UBER TRIP MUMBAI").clean, "Uber");
  assert.equal(normalizeMerchant("FLIPKART INTERNET BLR").clean, "Flipkart");
  assert.equal(normalizeMerchant("BESCOM ELECTRICITY BILL").clean, "BESCOM");
  assert.equal(normalizeMerchant("NETFLIX ENTERTAINMENT").clean, "Netflix");
  assert.equal(normalizeMerchant("ZEPTO QUICK COMMERCE").clean, "Zepto");

  // Preserves raw merchant name
  const res = normalizeMerchant("SWIGGY BANGALORE IN");
  assert.equal(res.raw, "SWIGGY BANGALORE IN");
});

test("normalizeMerchant falls back gracefully on unknown merchants", () => {
  const normalized = normalizeMerchant("LOCAL GENERAL STORE 5432");
  assert.equal(normalized.clean, "Local General Store");
  assert.equal(normalized.raw, "LOCAL GENERAL STORE 5432");
});

// ── 3. Smart Categorization Unit Tests ──────────────────────────────────────

test("predictCategory maps recognized brands to accurate categories with high confidence", () => {
  const categories = [
    { id: 1, name: "Food", type: "expense" },
    { id: 2, name: "Transport", type: "expense" },
    { id: 3, name: "Shopping", type: "expense" },
    { id: 4, name: "Bills", type: "expense" },
    { id: 5, name: "Income", type: "income" },
  ];

  const swiggyPred = predictCategory({
    cleanMerchant: "Swiggy",
    rawMessage: "Sent Rs 450 to Swiggy",
    direction: "debit",
    availableCategories: categories,
  });
  assert.equal(swiggyPred.categoryId, 1);
  assert.equal(swiggyPred.categoryName, "Food");
  assert.ok(swiggyPred.confidence >= 0.9);
  assert.ok(swiggyPred.reason.includes("food & dining"));

  const uberPred = predictCategory({
    cleanMerchant: "Uber",
    rawMessage: "Paid Rs 120 to Uber",
    direction: "debit",
    availableCategories: categories,
  });
  assert.equal(uberPred.categoryId, 2);
  assert.equal(uberPred.categoryName, "Transport");
  assert.ok(uberPred.confidence >= 0.9);

  const salaryPred = predictCategory({
    cleanMerchant: "Salary",
    rawMessage: "Credited by INR 50000 by SALARY transfer",
    direction: "credit",
    availableCategories: categories,
  });
  assert.equal(salaryPred.categoryId, 5);
  assert.equal(salaryPred.categoryName, "Income");
  assert.ok(salaryPred.confidence >= 0.85);
});

// ── 4. Account Matching Unit Tests ──────────────────────────────────────────

test("matchAccount matches exact masked last 4 digits uniquely", () => {
  const userAccounts = [
    { id: 10, display_name: "HDFC Savings", masked_last4: "1234", institution_name: "HDFC Bank", type: "bank" },
    { id: 20, display_name: "SBI Current", masked_last4: "5678", institution_name: "State Bank of India", type: "bank" },
  ];

  const match = matchAccount({
    maskedAccountHint: "1234",
    bank: "HDFC",
    classification: "expense",
    userAccounts,
  });

  assert.equal(match.suggestedAccountId, 10);
  assert.equal(match.isAmbiguous, false);
  assert.ok(match.matchConfidence >= 0.9);
});

test("matchAccount flags ambiguity when multiple accounts share masked digits", () => {
  const userAccounts = [
    { id: 10, display_name: "HDFC Primary Card", masked_last4: "1234", institution_name: "HDFC Bank", type: "credit_card" },
    { id: 11, display_name: "HDFC Add-on Card", masked_last4: "1234", institution_name: "HDFC Bank", type: "credit_card" },
  ];

  const match = matchAccount({
    maskedAccountHint: "1234",
    bank: "HDFC",
    classification: "credit_card_purchase",
    userAccounts,
  });

  assert.equal(match.suggestedAccountId, null);
  assert.equal(match.isAmbiguous, true);
  assert.ok(match.reason.includes("Ambiguous"));
});

test("matchAccount never guesses or associates when hint is missing or unmatched", () => {
  const userAccounts = [
    { id: 10, display_name: "HDFC Savings", masked_last4: "1234", institution_name: "HDFC Bank", type: "bank" },
  ];

  const match = matchAccount({
    maskedAccountHint: null,
    bank: "Unknown",
    classification: "expense",
    userAccounts,
  });

  assert.equal(match.suggestedAccountId, null);
  assert.equal(match.isAmbiguous, false);
  assert.equal(match.matchConfidence, 0.0);
});

// ── 5. End-to-End Detection, Confirmation, and Ledger Isolation Tests ─────────

test("detectSmartTransactions stores unconfirmed records with suggested status and isolates ledger", async () => {
  const originalExecute = db.execute;
  const calls = [];

  const fakeAccounts = [
    { id: 10, type: "bank", subtype: "savings", display_name: "HDFC Bank", institution_name: "HDFC Bank", masked_last4: "1234", status: "active" },
  ];

  let detectedRowInserted = false;

  db.execute = async (sql, values) => {
    calls.push({ sql, values });

    // 1. Fetch user accounts
    if (sql.includes("FROM accounts WHERE user_id = ?")) {
      return [fakeAccounts];
    }
    // 2. Fetch categories
    if (sql.includes("FROM categories")) {
      return [[
        { id: 1, name: "Food", type: "expense" },
        { id: 2, name: "Income", type: "income" },
      ]];
    }
    // 3. Uniqueness check on detected_transactions
    if (sql.includes("FROM detected_transactions WHERE user_id = ? AND sms_hash = ?")) {
      return [[]]; // No existing record
    }
    // 4. Uniqueness check on transactions
    if (sql.includes("FROM transactions WHERE user_id = ? AND sms_hash = ?")) {
      return [[]]; // No existing confirmed tx
    }
    // 5. Insert detected transaction
    if (sql.includes("INSERT INTO detected_transactions")) {
      detectedRowInserted = true;
      return [{ insertId: 77 }];
    }

    throw new Error(`Unexpected query in test: ${sql}`);
  };

  try {
    const messages = [{
      sender: "HDFCBK",
      message: "Sent Rs.450.00 from HDFC Bank A/C **1234 to SWIGGY on 11-OCT-26 via UPI Ref 998877",
      timestamp: "2026-10-11T12:00:00Z",
    }];

    const result = await detectSmartTransactions(42, messages);

    assert.equal(result.inserted, 1);
    assert.equal(result.skipped, 0);
    assert.equal(result.detected.length, 1);
    assert.equal(result.detected[0].id, 77);
    assert.equal(result.detected[0].status, "suggested");
    assert.equal(result.detected[0].merchantClean, "Swiggy");
    assert.equal(result.detected[0].suggestedAccountId, 10);
    assert.equal(detectedRowInserted, true);

    // Ledger isolation guarantee: No insert into 'transactions' table was performed during detect
    const txInsertCalls = calls.filter((c) => c.sql.includes("INSERT INTO transactions"));
    assert.equal(txInsertCalls.length, 0, "Detect operation must NOT modify the transactions ledger");
  } finally {
    db.execute = originalExecute;
  }
});

test("confirmDetectedTransaction commits detected record to transactions ledger atomically", async () => {
  const originalGetConnection = db.getConnection;
  const originalExecute = db.execute;
  const connCalls = [];

  const fakeDetected = {
    id: 77,
    user_id: 42,
    account_id: 10,
    category_id: 1,
    classification: "expense",
    amount: "450.00",
    transaction_date: "2026-10-11",
    merchant_raw: "SWIGGY BANGALORE",
    merchant_clean: "Swiggy",
    bank: "HDFC",
    sender: "HDFCBK",
    reference_number: "998877",
    sms_hash: "hash1234",
    status: "suggested",
    suggested_account_id: 10,
    suggested_category_id: 1,
  };

  let ledgerInserted = false;
  let statusUpdated = false;

  const mockConnection = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    execute: async (sql, values) => {
      connCalls.push({ sql, values });
      if (sql.includes("GET_LOCK")) return [[{ acquired: 1 }]];
      if (sql.includes("RELEASE_LOCK")) return [[{ released: 1 }]];

      // Lock detected row
      if (sql.includes("FROM detected_transactions") && sql.includes("FOR UPDATE")) {
        return [[fakeDetected]];
      }

      // Check account validity
      if (sql.includes("FROM accounts WHERE id = ?")) {
        return [[{ id: 10, status: "active", type: "bank" }]];
      }

      // Insert confirmed ledger transaction
      if (sql.includes("INSERT INTO transactions")) {
        ledgerInserted = true;
        return [{ insertId: 101 }];
      }

      // Update detected status to confirmed
      if (sql.includes("UPDATE detected_transactions") && sql.includes("status = 'confirmed'")) {
        statusUpdated = true;
        return [{ affectedRows: 1 }];
      }

      throw new Error(`Unexpected transaction query: ${sql}`);
    },
  };

  db.getConnection = async () => mockConnection;

  try {
    const confirmed = await confirmDetectedTransaction(77, 42);

    assert.equal(confirmed.status, "confirmed");
    assert.equal(confirmed.confirmedTransactionId, 101);
    assert.equal(ledgerInserted, true, "Ledger transaction must be inserted");
    assert.equal(statusUpdated, true, "Detected record status must be set to confirmed");
  } finally {
    db.getConnection = originalGetConnection;
    db.execute = originalExecute;
  }
});

test("confirmDetectedTransaction rejects confirmation of already confirmed or rejected records", async () => {
  const originalGetConnection = db.getConnection;

  const mockConnection = (status) => ({
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    execute: async (sql) => {
      if (sql.includes("GET_LOCK")) return [[{ acquired: 1 }]];
      if (sql.includes("RELEASE_LOCK")) return [[{ released: 1 }]];
      if (sql.includes("FROM detected_transactions")) {
        return [[{ id: 77, user_id: 42, status }]];
      }
      return [[]];
    },
  });

  try {
    db.getConnection = async () => mockConnection("confirmed");
    await assert.rejects(
      async () => confirmDetectedTransaction(77, 42),
      { message: "Transaction is already confirmed", statusCode: 409 },
    );

    db.getConnection = async () => mockConnection("rejected");
    await assert.rejects(
      async () => confirmDetectedTransaction(77, 42),
      { message: "Transaction was rejected and cannot be confirmed", statusCode: 409 },
    );
  } finally {
    db.getConnection = originalGetConnection;
  }
});

test("rejectDetectedTransaction updates status to rejected without touching ledger", async () => {
  const originalExecute = db.execute;
  const calls = [];

  db.execute = async (sql, values) => {
    calls.push({ sql, values });
    if (sql.includes("SELECT id, status FROM detected_transactions")) {
      return [[{ id: 77, status: "suggested" }]];
    }
    if (sql.includes("UPDATE detected_transactions SET status = 'rejected'")) {
      return [{ affectedRows: 1 }];
    }
    throw new Error(`Unexpected query: ${sql}`);
  };

  try {
    const res = await rejectDetectedTransaction(77, 42, "Irrelevant notification");
    assert.equal(res.status, "rejected");
    assert.equal(res.rejectionReason, "Irrelevant notification");
  } finally {
    db.execute = originalExecute;
  }
});

test("updateDetectedTransaction allows safe manual corrections", async () => {
  const originalExecute = db.execute;

  const fakeItem = {
    id: 77,
    user_id: 42,
    status: "suggested",
    amount: "450.00",
    transaction_date: "2026-10-11",
    merchant_raw: "SWIGGY BANGALORE",
    merchant_clean: "Swiggy",
    confidence: "0.90",
  };

  db.execute = async (sql, values) => {
    if (sql.includes("FROM detected_transactions d") && sql.includes("d.id = ?")) {
      return [[fakeItem]];
    }
    if (sql.includes("FROM categories WHERE id = ?")) {
      return [[{ id: 3 }]];
    }
    if (sql.includes("FROM accounts WHERE id = ?")) {
      return [[{ id: 10, status: "active" }]];
    }
    if (sql.includes("UPDATE detected_transactions SET")) {
      return [{ affectedRows: 1 }];
    }
    throw new Error(`Unexpected query: ${sql}`);
  };

  try {
    const updated = await updateDetectedTransaction(77, 42, {
      merchantClean: "Swiggy Food Delivery",
      classification: "expense",
      categoryId: 3,
      accountId: 10,
    });

    assert.ok(updated);
  } finally {
    db.execute = originalExecute;
  }
});

// ── 6. Validation Schema Unit Tests ─────────────────────────────────────────

test("detectValidation enforces non-empty payload array", async () => {
  const emptyErr = await runValidation(detectValidation, []);
  assert.ok(emptyErr, "Expected validation failure for empty array");

  const validArr = await runValidation(detectValidation, [{ sender: "HDFCBK", message: "Rs 500 debited" }]);
  assert.equal(validArr, undefined);

  const validObj = await runValidation(detectValidation, { messages: [{ sender: "HDFCBK", message: "Rs 500 debited" }] });
  assert.equal(validObj, undefined);
});

test("updateSmartTxValidation validates classification and merchant length", async () => {
  const invalidClass = await runValidation(updateSmartTxValidation, { classification: "gambling" });
  assert.ok(invalidClass);

  const validClass = await runValidation(updateSmartTxValidation, { classification: "expense", merchantClean: "Valid Merchant" });
  assert.equal(validClass, undefined);
});

test("smartTxIdValidation enforces positive integer id", async () => {
  const invalidId = await runValidation(smartTxIdValidation, {}, { id: "abc" });
  assert.ok(invalidId);

  const validId = await runValidation(smartTxIdValidation, {}, { id: "42" });
  assert.equal(validId, undefined);
});

test("smartTxQueryValidation enforces valid query status enum", async () => {
  const invalidStatus = await runValidation(smartTxQueryValidation, {}, {}, { status: "pending" });
  assert.ok(invalidStatus);

  const validStatus = await runValidation(smartTxQueryValidation, {}, {}, { status: "suggested" });
  assert.equal(validStatus, undefined);
});
