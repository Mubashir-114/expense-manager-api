import { createHash } from "node:crypto";

import db from "../config/db.js";
import AppError from "../utils/AppError.js";
import { formatMinorAsDecimal, parseDecimalToMinor } from "../utils/money.js";
import { withTransaction } from "./accountModel.js";

const ADJUSTMENT_COLUMNS = `
  id, user_id, account_id, amount_minor, reason, adjustment_date,
  client_adjustment_key, adjustment_fingerprint, created_at
`;

export const toAdjustmentJson = (row) => row && ({
  id: row.id,
  accountId: row.account_id,
  amount: formatMinorAsDecimal(row.amount_minor),
  reason: row.reason,
  adjustmentDate: row.adjustment_date instanceof Date
    ? row.adjustment_date.toISOString().slice(0, 10)
    : String(row.adjustment_date).slice(0, 10),
  createdAt: row.created_at,
});

const fingerprintAdjustment = (data) => createHash("sha256")
  .update(JSON.stringify({
    accountId: data.accountId,
    amountMinor: data.amountMinor,
    adjustmentDate: data.adjustmentDate,
    reason: data.reason,
  }))
  .digest("hex");

const selectAdjustmentById = async (executor, id, userId) => {
  const [rows] = await executor.execute(
    `SELECT ${ADJUSTMENT_COLUMNS}
       FROM account_adjustments
      WHERE id = ? AND user_id = ?`,
    [id, userId],
  );
  return rows[0] || null;
};

export const createAdjustment = async (userId, accountId, data) => withTransaction(userId, async (connection) => {
  const amountMinor = parseDecimalToMinor(data.amount);
  if (amountMinor === 0n) {
    throw new AppError("Adjustment amount cannot be zero", 400);
  }

  const fingerprint = fingerprintAdjustment({
    accountId,
    amountMinor: amountMinor.toString(),
    adjustmentDate: data.adjustmentDate,
    reason: data.reason,
  });

  // Check idempotency
  const [existingRows] = await connection.execute(
    `SELECT ${ADJUSTMENT_COLUMNS}
       FROM account_adjustments
      WHERE user_id = ? AND client_adjustment_key = ?`,
    [userId, data.clientAdjustmentKey],
  );

  if (existingRows[0]) {
    if (existingRows[0].adjustment_fingerprint !== fingerprint) {
      throw new AppError("Idempotency key was already used for a different adjustment", 409);
    }
    return { adjustment: toAdjustmentJson(existingRows[0]), created: false };
  }

  // Lock and verify account
  const [accRows] = await connection.execute(
    "SELECT id, status FROM accounts WHERE id = ? AND user_id = ? FOR UPDATE",
    [accountId, userId],
  );
  if (!accRows[0] || accRows[0].status !== "active") {
    throw new AppError("Account not found or inactive", 400);
  }

  const [result] = await connection.execute(
    `INSERT INTO account_adjustments (
       user_id, account_id, amount_minor, reason,
       adjustment_date, client_adjustment_key, adjustment_fingerprint
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      accountId,
      amountMinor.toString(),
      data.reason,
      data.adjustmentDate,
      data.clientAdjustmentKey,
      fingerprint,
    ],
  );

  const row = await selectAdjustmentById(connection, result.insertId, userId);
  return { adjustment: toAdjustmentJson(row), created: true };
});

export const getAdjustments = async (userId, accountId, filters = {}) => {
  // Verify account belongs to user
  const [accRows] = await db.execute(
    "SELECT id FROM accounts WHERE id = ? AND user_id = ?",
    [accountId, userId],
  );
  if (!accRows[0]) {
    throw new AppError("Account not found", 404);
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
  if (!Number.isSafeInteger(offset)) {
    throw new AppError("Pagination offset exceeds the supported range", 400);
  }

  const [rows] = await db.execute(
    `SELECT ${ADJUSTMENT_COLUMNS}
       FROM account_adjustments
      WHERE user_id = ? AND account_id = ?
      ORDER BY adjustment_date DESC, id DESC
      LIMIT ${limit} OFFSET ${offset}`,
    [userId, accountId],
  );

  const [countRows] = await db.execute(
    "SELECT COUNT(*) AS total FROM account_adjustments WHERE user_id = ? AND account_id = ?",
    [userId, accountId],
  );

  return {
    adjustments: rows.map(toAdjustmentJson),
    total: Number(countRows[0].total),
    page,
    limit,
  };
};
