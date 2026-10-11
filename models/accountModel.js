import { createHash } from "node:crypto";

import db from "../config/db.js";
import AppError from "../utils/AppError.js";
import { formatMinorAsDecimal } from "../utils/money.js";

const ACCOUNT_COLUMNS = `
  id, user_id, type, subtype, display_name, institution_name,
  masked_last4, currency_code, opening_amount_minor, credit_limit_minor,
  is_default, status, created_at, updated_at
`;

const fromMysqlBoolean = (value) => value === true || value === 1 || value === "1";

const toAccountJson = (row) => row && ({
  id: row.id,
  type: row.type,
  subtype: row.subtype,
  displayName: row.display_name,
  institutionName: row.institution_name,
  maskedLast4: row.masked_last4,
  currencyCode: row.currency_code,
  openingAmount: formatMinorAsDecimal(row.opening_amount_minor),
  creditLimit: row.credit_limit_minor === null
    ? null
    : formatMinorAsDecimal(row.credit_limit_minor),
  isDefault: fromMysqlBoolean(row.is_default),
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const fingerprintCreation = (account) => createHash("sha256")
  .update(JSON.stringify({
    type: account.type,
    subtype: account.subtype,
    displayName: account.displayName,
    institutionName: account.institutionName,
    maskedLast4: account.maskedLast4,
    currencyCode: account.currencyCode,
    openingAmountMinor: account.openingAmountMinor,
    creditLimitMinor: account.creditLimitMinor,
    isDefault: account.isDefault,
  }))
  .digest("hex");

const selectById = async (executor, accountId, userId, forUpdate = false) => {
  const [rows] = await executor.execute(
    `SELECT ${ACCOUNT_COLUMNS}
       FROM accounts
      WHERE id = ? AND user_id = ?${forUpdate ? " FOR UPDATE" : ""}`,
    [accountId, userId],
  );
  return rows[0] || null;
};

const withTransaction = async (userId, operation) => {
  const connection = await db.getConnection();
  const lockName = `fintrack:accounts:${userId}`;
  let transactionStarted = false;
  let lockAcquired = false;
  try {
    const [lockRows] = await connection.execute(
      "SELECT GET_LOCK(?, 10) AS acquired",
      [lockName],
    );
    if (Number(lockRows[0]?.acquired) !== 1) {
      throw new AppError("Account operation is busy; please retry", 503);
    }
    lockAcquired = true;
    await connection.beginTransaction();
    transactionStarted = true;
    const result = await operation(connection);
    await connection.commit();
    transactionStarted = false;
    return result;
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  } finally {
    let releaseFailed = false;
    if (lockAcquired) {
      try {
        await connection.execute("SELECT RELEASE_LOCK(?) AS released", [lockName]);
      } catch {
        releaseFailed = true;
      }
    }
    if (releaseFailed && typeof connection.destroy === "function") {
      connection.destroy();
    } else {
      connection.release();
    }
  }
};

export const createAccount = async (userId, account) => withTransaction(userId, async (connection) => {
  const fingerprint = fingerprintCreation(account);
  const [existingRows] = await connection.execute(
    `SELECT ${ACCOUNT_COLUMNS}, creation_fingerprint
       FROM accounts
      WHERE user_id = ? AND client_creation_key = ?
      FOR UPDATE`,
    [userId, account.clientCreationKey],
  );

  if (existingRows[0]) {
    if (existingRows[0].creation_fingerprint !== fingerprint) {
      throw new AppError("Idempotency key was already used for a different account", 409);
    }
    return { account: toAccountJson(existingRows[0]), created: false };
  }

  const isAsset = account.type !== "credit_card";
  let makeDefault = isAsset && account.isDefault;

  if (isAsset) {
    const [defaultRows] = await connection.execute(
      `SELECT id FROM accounts
        WHERE user_id = ? AND status = 'active'
          AND type <> 'credit_card' AND is_default = TRUE
        FOR UPDATE`,
      [userId],
    );
    makeDefault ||= defaultRows.length === 0;

    if (makeDefault && defaultRows.length > 0) {
      await connection.execute(
        `UPDATE accounts SET is_default = FALSE
          WHERE user_id = ? AND status = 'active'
            AND type <> 'credit_card' AND is_default = TRUE`,
        [userId],
      );
    }
  }

  const [result] = await connection.execute(
    `INSERT INTO accounts (
       user_id, type, subtype, display_name, institution_name, masked_last4,
       currency_code, opening_amount_minor, credit_limit_minor, is_default,
       client_creation_key, creation_fingerprint
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      account.type,
      account.subtype,
      account.displayName,
      account.institutionName,
      account.maskedLast4,
      account.currencyCode,
      account.openingAmountMinor,
      account.creditLimitMinor,
      makeDefault,
      account.clientCreationKey,
      fingerprint,
    ],
  );

  const row = await selectById(connection, result.insertId, userId);
  return { account: toAccountJson(row), created: true };
});

export const getAccounts = async (userId, filters) => {
  const conditions = ["user_id = ?"];
  const values = [userId];

  if (filters.status) {
    conditions.push("status = ?");
    values.push(filters.status);
  } else {
    conditions.push("status = 'active'");
  }
  if (filters.type) {
    conditions.push("type = ?");
    values.push(filters.type);
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
    `SELECT ${ACCOUNT_COLUMNS}
       FROM accounts
      WHERE ${where}
      ORDER BY is_default DESC, created_at ASC, id ASC
      LIMIT ${limit} OFFSET ${offset}`,
    values,
  );
  const [countRows] = await db.execute(
    `SELECT COUNT(*) AS total FROM accounts WHERE ${where}`,
    values,
  );

  return {
    accounts: rows.map(toAccountJson),
    total: Number(countRows[0].total),
    page,
    limit,
  };
};

export const getAccountById = async (accountId, userId) => {
  const row = await selectById(db, accountId, userId);
  return toAccountJson(row);
};

export const updateAccount = async (accountId, userId, changes) => withTransaction(userId, async (connection) => {
  const account = await selectById(connection, accountId, userId, true);
  if (!account) return null;
  if (account.status === "archived") {
    throw new AppError("Archived accounts cannot be updated", 409);
  }

  if (account.type === "cash" && (changes.institutionName || changes.maskedLast4)) {
    throw new AppError("Cash accounts cannot have institution or masked account metadata", 400);
  }
  if (["bank", "credit_card"].includes(account.type) && !changes.institutionName) {
    throw new AppError("Institution name is required for this account type", 400);
  }

  await connection.execute(
    `UPDATE accounts
        SET display_name = ?, institution_name = ?, masked_last4 = ?
      WHERE id = ? AND user_id = ?`,
    [
      changes.displayName,
      changes.institutionName,
      changes.maskedLast4,
      accountId,
      userId,
    ],
  );

  return toAccountJson(await selectById(connection, accountId, userId));
});

export const setDefaultAccount = async (accountId, userId) => withTransaction(userId, async (connection) => {
  const account = await selectById(connection, accountId, userId, true);
  if (!account) return null;
  if (account.status !== "active") {
    throw new AppError("Archived accounts cannot become default", 409);
  }
  if (account.type === "credit_card") {
    throw new AppError("Credit cards cannot be the default asset account", 400);
  }

  await connection.execute(
    `UPDATE accounts SET is_default = FALSE
      WHERE user_id = ? AND status = 'active'
        AND type <> 'credit_card' AND is_default = TRUE`,
    [userId],
  );
  await connection.execute(
    "UPDATE accounts SET is_default = TRUE WHERE id = ? AND user_id = ?",
    [accountId, userId],
  );

  return toAccountJson(await selectById(connection, accountId, userId));
});

export const archiveAccount = async (accountId, userId) => withTransaction(userId, async (connection) => {
  const account = await selectById(connection, accountId, userId, true);
  if (!account) return null;
  if (account.status === "archived") return toAccountJson(account);

  const wasDefault = fromMysqlBoolean(account.is_default);
  await connection.execute(
    `UPDATE accounts
        SET status = 'archived', is_default = FALSE
      WHERE id = ? AND user_id = ?`,
    [accountId, userId],
  );

  if (wasDefault) {
    const [replacementRows] = await connection.execute(
      `SELECT id FROM accounts
        WHERE user_id = ? AND status = 'active' AND type <> 'credit_card'
        ORDER BY created_at ASC, id ASC
        LIMIT 1 FOR UPDATE`,
      [userId],
    );
    if (replacementRows[0]) {
      await connection.execute(
        "UPDATE accounts SET is_default = TRUE WHERE id = ? AND user_id = ?",
        [replacementRows[0].id, userId],
      );
    }
  }

  return toAccountJson(await selectById(connection, accountId, userId));
});

export { toAccountJson };
