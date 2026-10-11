import { createHash } from "node:crypto";

import db from "../config/db.js";
import AppError from "../utils/AppError.js";
import { formatMinorAsDecimal, parseDecimalToMinor } from "../utils/money.js";
import { withTransaction } from "./accountModel.js";

const TRANSFER_COLUMNS = `
  t.id, t.user_id, t.source_account_id, t.destination_account_id,
  t.amount_minor, t.currency_code, t.transfer_date, t.note,
  t.client_transfer_key, t.transfer_fingerprint, t.created_at, t.updated_at,
  sa.display_name AS source_account_name,
  da.display_name AS destination_account_name
`;

export const toTransferJson = (row) => row && ({
  id: row.id,
  sourceAccountId: row.source_account_id,
  destinationAccountId: row.destination_account_id,
  sourceAccountName: row.source_account_name ?? null,
  destinationAccountName: row.destination_account_name ?? null,
  amount: formatMinorAsDecimal(row.amount_minor),
  currencyCode: row.currency_code,
  transferDate: row.transfer_date instanceof Date
    ? row.transfer_date.toISOString().slice(0, 10)
    : String(row.transfer_date).slice(0, 10),
  note: row.note ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const fingerprintTransfer = (transfer) => createHash("sha256")
  .update(JSON.stringify({
    sourceAccountId: transfer.sourceAccountId,
    destinationAccountId: transfer.destinationAccountId,
    amountMinor: transfer.amountMinor,
    transferDate: transfer.transferDate,
    currencyCode: transfer.currencyCode,
  }))
  .digest("hex");

const selectTransferById = async (executor, transferId, userId) => {
  const [rows] = await executor.execute(
    `SELECT ${TRANSFER_COLUMNS}
       FROM transfers t
       LEFT JOIN accounts sa ON sa.id = t.source_account_id
       LEFT JOIN accounts da ON da.id = t.destination_account_id
      WHERE t.id = ? AND t.user_id = ?`,
    [transferId, userId],
  );
  return rows[0] || null;
};

export const createTransfer = async (userId, data) => withTransaction(userId, async (connection) => {
  if (data.sourceAccountId === data.destinationAccountId) {
    throw new AppError("Source and destination accounts must be different", 400);
  }

  const amountMinor = parseDecimalToMinor(data.amount);
  if (amountMinor <= 0n) {
    throw new AppError("Transfer amount must be greater than zero", 400);
  }

  const currencyCode = data.currencyCode ?? "INR";
  const fingerprint = fingerprintTransfer({
    sourceAccountId: data.sourceAccountId,
    destinationAccountId: data.destinationAccountId,
    amountMinor: amountMinor.toString(),
    transferDate: data.transferDate,
    currencyCode,
  });

  // Check idempotency
  const [existingRows] = await connection.execute(
    `SELECT ${TRANSFER_COLUMNS}
       FROM transfers t
       LEFT JOIN accounts sa ON sa.id = t.source_account_id
       LEFT JOIN accounts da ON da.id = t.destination_account_id
      WHERE t.user_id = ? AND t.client_transfer_key = ?
      FOR UPDATE`,
    [userId, data.clientTransferKey],
  );

  if (existingRows[0]) {
    if (existingRows[0].transfer_fingerprint !== fingerprint) {
      throw new AppError("Idempotency key was already used for a different transfer", 409);
    }
    return { transfer: toTransferJson(existingRows[0]), created: false };
  }

  // Lock and verify both accounts
  const [sourceRows] = await connection.execute(
    "SELECT id, status, type, subtype, display_name FROM accounts WHERE id = ? AND user_id = ? FOR UPDATE",
    [data.sourceAccountId, userId],
  );
  if (!sourceRows[0] || sourceRows[0].status !== "active") {
    throw new AppError("Source account not found or inactive", 400);
  }

  const [destRows] = await connection.execute(
    "SELECT id, status, type, subtype, display_name FROM accounts WHERE id = ? AND user_id = ? FOR UPDATE",
    [data.destinationAccountId, userId],
  );
  if (!destRows[0] || destRows[0].status !== "active") {
    throw new AppError("Destination account not found or inactive", 400);
  }

  const [result] = await connection.execute(
    `INSERT INTO transfers (
       user_id, source_account_id, destination_account_id,
       amount_minor, currency_code, transfer_date, note,
       client_transfer_key, transfer_fingerprint
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      data.sourceAccountId,
      data.destinationAccountId,
      amountMinor.toString(),
      currencyCode,
      data.transferDate,
      data.note ?? null,
      data.clientTransferKey,
      fingerprint,
    ],
  );

  const row = await selectTransferById(connection, result.insertId, userId);
  return { transfer: toTransferJson(row), created: true };
});

export const getTransfers = async (userId, filters = {}) => {
  const conditions = ["t.user_id = ?"];
  const values = [userId];

  if (filters.accountId) {
    conditions.push("(t.source_account_id = ? OR t.destination_account_id = ?)");
    values.push(filters.accountId, filters.accountId);
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

  const where = conditions.join(" AND ");

  const [rows] = await db.execute(
    `SELECT ${TRANSFER_COLUMNS}
       FROM transfers t
       LEFT JOIN accounts sa ON sa.id = t.source_account_id
       LEFT JOIN accounts da ON da.id = t.destination_account_id
      WHERE ${where}
      ORDER BY t.transfer_date DESC, t.id DESC
      LIMIT ${limit} OFFSET ${offset}`,
    values,
  );

  const [countRows] = await db.execute(
    `SELECT COUNT(*) AS total FROM transfers t WHERE ${where}`,
    values,
  );

  return {
    transfers: rows.map(toTransferJson),
    total: Number(countRows[0].total),
    page,
    limit,
  };
};

export const getTransferById = async (transferId, userId) => {
  const row = await selectTransferById(db, transferId, userId);
  return toTransferJson(row);
};
