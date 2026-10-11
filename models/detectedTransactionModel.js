import db from "../config/db.js";
import AppError from "../utils/AppError.js";
import { parseBankSms, generateSmsHash } from "../utils/smsBankParser.js";
import { normalizeMerchant } from "../utils/merchantNormalizer.js";
import { predictCategory } from "../utils/smartCategorizer.js";
import { matchAccount } from "../utils/accountMatcher.js";
import {
  createTransaction,
  getCategories,
  getTransactionByHash,
} from "./transactionModel.js";
import { createTransfer } from "./transferModel.js";
import { createCardRepayment, withTransaction } from "./accountModel.js";

const DETECTED_TX_COLUMNS = `
  d.id, d.user_id, d.account_id, d.category_id, d.classification,
  d.amount, d.transaction_date, d.merchant_raw, d.merchant_clean,
  d.bank, d.sender, d.reference_number, d.masked_account_hint,
  d.sms_hash, d.confidence, d.confidence_reason,
  d.suggested_account_id, d.suggested_category_id, d.is_account_ambiguous,
  d.status, d.rejection_reason, d.confirmed_transaction_id,
  d.created_at, d.updated_at,
  a.display_name AS account_name,
  c.name AS category_name,
  sa.display_name AS suggested_account_name,
  sc.name AS suggested_category_name
`;

export const toDetectedTxJson = (row) => row && ({
  id: row.id,
  userId: row.user_id,
  accountId: row.account_id,
  accountName: row.account_name ?? null,
  categoryId: row.category_id,
  categoryName: row.category_name ?? null,
  classification: row.classification,
  amount: typeof row.amount === "number" ? row.amount.toFixed(2) : String(row.amount),
  transactionDate: row.transaction_date instanceof Date
    ? row.transaction_date.toISOString().slice(0, 10)
    : String(row.transaction_date).slice(0, 10),
  merchantRaw: row.merchant_raw,
  merchantClean: row.merchant_clean,
  bank: row.bank,
  sender: row.sender,
  referenceNumber: row.reference_number,
  maskedAccountHint: row.masked_account_hint,
  smsHash: row.sms_hash,
  confidence: Number.parseFloat(row.confidence),
  confidenceReason: row.confidence_reason,
  suggestedAccountId: row.suggested_account_id,
  suggestedAccountName: row.suggested_account_name ?? null,
  suggestedCategoryId: row.suggested_category_id,
  suggestedCategoryName: row.suggested_category_name ?? null,
  isAccountAmbiguous: Boolean(row.is_account_ambiguous),
  status: row.status,
  rejectionReason: row.rejection_reason,
  confirmedTransactionId: row.confirmed_transaction_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/**
 * Parses raw or semi-structured SMS items, categorizes and matches accounts,
 * and saves them into detected_transactions with 'suggested' review status.
 */
export const detectSmartTransactions = async (userId, smsItems = []) => {
  if (!Array.isArray(smsItems) || smsItems.length === 0) {
    return { detected: [], inserted: 0, skipped: 0 };
  }

  // Fetch user accounts and categories
  const [accountRows] = await db.execute(
    "SELECT id, type, subtype, display_name, institution_name, masked_last4, status FROM accounts WHERE user_id = ? AND status = 'active'",
    [userId],
  );
  const categories = await getCategories();

  let insertedCount = 0;
  let skippedCount = 0;
  const processedRecords = [];

  for (const item of smsItems) {
    const rawMessage = item.message ?? item.messageBody ?? item.body ?? "";
    const sender = item.sender ?? "";
    const timestamp = item.date ?? item.timestamp ?? new Date();

    // 1. Bank SMS Parser
    let parsed = parseBankSms({ sender, message: rawMessage, timestamp });

    // Fallback: If client already supplied pre-parsed fields (amount, merchant, etc.)
    if (!parsed && item.amount) {
      const amountNum = Number.parseFloat(String(item.amount));
      if (Number.isFinite(amountNum) && amountNum > 0) {
        const hash = item.sms_hash ?? item.smsHash ?? generateSmsHash(sender, new Date(timestamp).getTime(), rawMessage);
        parsed = {
          amount: amountNum.toFixed(2),
          classification: item.type === "income" ? "income" : "expense",
          direction: item.type === "income" ? "credit" : "debit",
          bank: item.bank ?? "Unknown",
          maskedAccountHint: item.maskedAccountHint ?? null,
          referenceNumber: item.reference ?? item.referenceNumber ?? null,
          merchantRaw: item.merchant ?? "Merchant",
          transactionDate: item.date ? String(item.date).slice(0, 10) : new Date().toISOString().slice(0, 10),
          smsHash: hash,
          rawMessage,
          sender,
        };
      }
    }

    if (!parsed) {
      skippedCount++;
      continue;
    }

    // 2. Uniqueness checks
    // Check detected_transactions
    const [existingDetected] = await db.execute(
      "SELECT id, status FROM detected_transactions WHERE user_id = ? AND sms_hash = ?",
      [userId, parsed.smsHash],
    );
    if (existingDetected.length > 0) {
      skippedCount++;
      continue;
    }

    // Check confirmed transactions
    const existingConfirmed = await getTransactionByHash(userId, parsed.smsHash);
    if (existingConfirmed) {
      skippedCount++;
      continue;
    }

    // 3. Merchant Normalization
    const normalized = normalizeMerchant(parsed.merchantRaw);

    // 4. Smart Categorization
    const predictedCat = predictCategory({
      cleanMerchant: normalized.clean,
      rawMessage,
      direction: parsed.direction,
      availableCategories: categories,
    });

    // 5. Account Matching
    const matchedAcc = matchAccount({
      maskedAccountHint: parsed.maskedAccountHint,
      bank: parsed.bank,
      classification: parsed.classification,
      userAccounts: accountRows,
    });

    // 6. Overall Confidence Calculation
    const overallConfidence = (
      predictedCat.confidence * 0.6 +
      matchedAcc.matchConfidence * 0.4
    ).toFixed(2);

    const confidenceReason = [
      predictedCat.reason,
      matchedAcc.reason,
    ].filter(Boolean).join("; ");

    // 7. Store as detected transaction
    const [insertResult] = await db.execute(
      `INSERT INTO detected_transactions (
         user_id, account_id, category_id, classification,
         amount, transaction_date, merchant_raw, merchant_clean,
         bank, sender, reference_number, masked_account_hint,
         sms_hash, confidence, confidence_reason,
         suggested_account_id, suggested_category_id, is_account_ambiguous,
         status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'suggested')`,
      [
        userId,
        matchedAcc.isAmbiguous ? null : matchedAcc.suggestedAccountId,
        predictedCat.categoryId,
        parsed.classification,
        parsed.amount,
        parsed.transactionDate,
        normalized.raw,
        normalized.clean,
        parsed.bank,
        parsed.sender,
        parsed.referenceNumber,
        parsed.maskedAccountHint,
        parsed.smsHash,
        overallConfidence,
        confidenceReason,
        matchedAcc.suggestedAccountId,
        predictedCat.categoryId,
        matchedAcc.isAmbiguous ? 1 : 0,
      ],
    );

    insertedCount++;
    processedRecords.push({
      id: insertResult.insertId,
      amount: parsed.amount,
      merchantClean: normalized.clean,
      classification: parsed.classification,
      suggestedCategory: predictedCat.categoryName,
      suggestedAccountId: matchedAcc.suggestedAccountId,
      isAccountAmbiguous: matchedAcc.isAmbiguous,
      confidence: Number.parseFloat(overallConfidence),
      status: "suggested",
    });
  }

  return {
    inserted: insertedCount,
    skipped: skippedCount,
    detected: processedRecords,
  };
};

/**
 * Lists detected transactions for a user with filters and pagination.
 */
export const getDetectedTransactions = async (userId, filters = {}) => {
  const conditions = ["d.user_id = ?"];
  const values = [userId];

  if (filters.status && filters.status !== "all") {
    conditions.push("d.status = ?");
    values.push(filters.status);
  } else if (!filters.status) {
    conditions.push("d.status = 'suggested'");
  }

  if (filters.classification) {
    conditions.push("d.classification = ?");
    values.push(filters.classification);
  }

  if (filters.search) {
    conditions.push("(d.merchant_clean LIKE ? OR d.merchant_raw LIKE ? OR d.reference_number LIKE ?)");
    values.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
  }

  const page = Number(filters.page ?? 1);
  const limit = Number(filters.limit ?? 20);
  if (!Number.isSafeInteger(page) || page < 1) {
    throw new AppError("Page must be a positive safe integer", 400);
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new AppError("Limit must be a safe integer between 1 and 100", 400);
  }
  const offset = (page - 1) * limit;

  const where = conditions.join(" AND ");

  const [rows] = await db.execute(
    `SELECT ${DETECTED_TX_COLUMNS}
       FROM detected_transactions d
       LEFT JOIN accounts a ON a.id = d.account_id
       LEFT JOIN categories c ON c.id = d.category_id
       LEFT JOIN accounts sa ON sa.id = d.suggested_account_id
       LEFT JOIN categories sc ON sc.id = d.suggested_category_id
      WHERE ${where}
      ORDER BY d.transaction_date DESC, d.id DESC
      LIMIT ${limit} OFFSET ${offset}`,
    values,
  );

  const [countRows] = await db.execute(
    `SELECT COUNT(*) AS total FROM detected_transactions d WHERE ${where}`,
    values,
  );

  return {
    detectedTransactions: rows.map(toDetectedTxJson),
    total: Number(countRows[0].total),
    page,
    limit,
  };
};

/**
 * Gets a single detected transaction by ID.
 */
export const getDetectedTransactionById = async (id, userId) => {
  const [rows] = await db.execute(
    `SELECT ${DETECTED_TX_COLUMNS}
       FROM detected_transactions d
       LEFT JOIN accounts a ON a.id = d.account_id
       LEFT JOIN categories c ON c.id = d.category_id
       LEFT JOIN accounts sa ON sa.id = d.suggested_account_id
       LEFT JOIN categories sc ON sc.id = d.suggested_category_id
      WHERE d.id = ? AND d.user_id = ?`,
    [id, userId],
  );

  return rows[0] ? toDetectedTxJson(rows[0]) : null;
};

/**
 * Updates a detected transaction with manual corrections.
 */
export const updateDetectedTransaction = async (id, userId, changes = {}) => {
  const current = await getDetectedTransactionById(id, userId);
  if (!current) {
    throw new AppError("Detected transaction not found", 404);
  }

  if (current.status !== "suggested" && current.status !== "detected") {
    throw new AppError(`Cannot update transaction with status '${current.status}'`, 409);
  }

  const updates = [];
  const values = [];

  if (changes.merchantClean !== undefined) {
    const clean = String(changes.merchantClean).trim();
    if (!clean) throw new AppError("Merchant name cannot be empty", 400);
    updates.push("merchant_clean = ?");
    values.push(clean);
  }

  if (changes.classification !== undefined) {
    const valid = ["expense", "income", "transfer", "refund", "credit_card_purchase", "credit_card_repayment"];
    if (!valid.includes(changes.classification)) {
      throw new AppError(`Invalid classification: ${changes.classification}`, 400);
    }
    updates.push("classification = ?");
    values.push(changes.classification);
  }

  if (changes.categoryId !== undefined) {
    if (changes.categoryId !== null) {
      const [catRows] = await db.execute("SELECT id FROM categories WHERE id = ?", [changes.categoryId]);
      if (!catRows[0]) throw new AppError("Invalid category id", 400);
    }
    updates.push("category_id = ?");
    values.push(changes.categoryId);
  }

  if (changes.accountId !== undefined) {
    if (changes.accountId !== null) {
      const [accRows] = await db.execute(
        "SELECT id, status FROM accounts WHERE id = ? AND user_id = ?",
        [changes.accountId, userId],
      );
      if (!accRows[0] || accRows[0].status !== "active") {
        throw new AppError("Account not found or inactive", 400);
      }
    }
    updates.push("account_id = ?");
    values.push(changes.accountId);
  }

  if (updates.length === 0) {
    return current;
  }

  values.push(id, userId);
  await db.execute(
    `UPDATE detected_transactions SET ${updates.join(", ")} WHERE id = ? AND user_id = ?`,
    values,
  );

  return getDetectedTransactionById(id, userId);
};

/**
 * Confirms a detected transaction and commits it to the ledger atomically.
 */
export const confirmDetectedTransaction = async (id, userId, overrides = {}) => withTransaction(userId, async (connection) => {
  const [rows] = await connection.execute(
    "SELECT * FROM detected_transactions WHERE id = ? AND user_id = ? FOR UPDATE",
    [id, userId],
  );
  const detected = rows[0];
  if (!detected) {
    throw new AppError("Detected transaction not found", 404);
  }

  if (detected.status === "confirmed") {
    throw new AppError("Transaction is already confirmed", 409);
  }
  if (detected.status === "rejected") {
    throw new AppError("Transaction was rejected and cannot be confirmed", 409);
  }

  // Resolve final values with overrides
  const finalMerchant = overrides.merchantClean?.trim() || detected.merchant_clean;
  const finalClassification = overrides.classification || detected.classification;
  let finalAccountId = overrides.accountId !== undefined ? overrides.accountId : (detected.account_id ?? detected.suggested_account_id);
  let finalCategoryId = overrides.categoryId !== undefined ? overrides.categoryId : (detected.category_id ?? detected.suggested_category_id);

  // Validate account if present
  if (finalAccountId) {
    const [accRows] = await connection.execute(
      "SELECT id, status, type FROM accounts WHERE id = ? AND user_id = ?",
      [finalAccountId, userId],
    );
    if (!accRows[0] || accRows[0].status !== "active") {
      throw new AppError("Selected account not found or inactive", 400);
    }
  }

  // Fallback category if none selected
  if (!finalCategoryId) {
    const isIncome = ["income", "refund"].includes(finalClassification);
    const targetType = isIncome ? "income" : "expense";
    const [defCat] = await connection.execute(
      "SELECT id FROM categories WHERE type = ? ORDER BY id ASC LIMIT 1",
      [targetType],
    );
    finalCategoryId = defCat[0]?.id;
  }

  let confirmedTxId = null;

  // 1. Commit to actual transactions ledger
  const txType = ["income", "refund"].includes(finalClassification) ? "income" : "expense";
  const note = detected.merchant_raw ? `SMS: ${detected.merchant_raw}` : null;
  const dateStr = detected.transaction_date instanceof Date
    ? detected.transaction_date.toISOString().slice(0, 10)
    : String(detected.transaction_date).slice(0, 10);

  const [txResult] = await connection.execute(
    `INSERT INTO transactions
       (user_id, category_id, account_id, type, title, amount, transaction_date, note, sms_hash, sender, bank, reference_number, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sms')`,
    [
      userId,
      finalCategoryId,
      finalAccountId || null,
      txType,
      finalMerchant,
      detected.amount,
      dateStr,
      note,
      detected.sms_hash,
      detected.sender,
      detected.bank,
      detected.reference_number,
    ],
  );
  confirmedTxId = txResult.insertId;

  // 2. Update detected_transactions to 'confirmed'
  await connection.execute(
    `UPDATE detected_transactions
        SET status = 'confirmed',
            confirmed_transaction_id = ?,
            account_id = ?,
            category_id = ?,
            classification = ?,
            merchant_clean = ?
      WHERE id = ? AND user_id = ?`,
    [
      confirmedTxId,
      finalAccountId || null,
      finalCategoryId,
      finalClassification,
      finalMerchant,
      id,
      userId,
    ],
  );

  return {
    id,
    status: "confirmed",
    confirmedTransactionId: confirmedTxId,
    accountId: finalAccountId,
    categoryId: finalCategoryId,
    merchantClean: finalMerchant,
  };
});

/**
 * Rejects a detected transaction so it never enters the ledger.
 */
export const rejectDetectedTransaction = async (id, userId, rejectionReason = "User rejected") => {
  const [rows] = await db.execute(
    "SELECT id, status FROM detected_transactions WHERE id = ? AND user_id = ?",
    [id, userId],
  );
  if (!rows[0]) {
    throw new AppError("Detected transaction not found", 404);
  }

  if (rows[0].status === "confirmed") {
    throw new AppError("Cannot reject an already confirmed transaction", 409);
  }

  await db.execute(
    "UPDATE detected_transactions SET status = 'rejected', rejection_reason = ? WHERE id = ? AND user_id = ?",
    [rejectionReason, id, userId],
  );

  return {
    id,
    status: "rejected",
    rejectionReason,
  };
};

/**
 * Batch confirms multiple detected transactions by ID.
 */
export const batchConfirmDetected = async (userId, items = []) => {
  const results = [];
  const errors = [];

  for (const item of items) {
    const id = typeof item === "object" ? item.id : item;
    const overrides = typeof item === "object" ? item : {};
    try {
      const confirmed = await confirmDetectedTransaction(id, userId, overrides);
      results.push(confirmed);
    } catch (err) {
      errors.push({ id, error: err.message });
    }
  }

  return { confirmed: results, errors };
};

/**
 * Batch rejects multiple detected transactions by ID.
 */
export const batchRejectDetected = async (userId, ids = [], reason = "Batch user rejection") => {
  const rejected = [];
  const errors = [];

  for (const id of ids) {
    try {
      const res = await rejectDetectedTransaction(id, userId, reason);
      rejected.push(res);
    } catch (err) {
      errors.push({ id, error: err.message });
    }
  }

  return { rejected, errors };
};

export default {
  toDetectedTxJson,
  detectSmartTransactions,
  getDetectedTransactions,
  getDetectedTransactionById,
  updateDetectedTransaction,
  confirmDetectedTransaction,
  rejectDetectedTransaction,
  batchConfirmDetected,
  batchRejectDetected,
};
