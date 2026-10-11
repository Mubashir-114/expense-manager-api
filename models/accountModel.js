import { createHash } from "node:crypto";

import db from "../config/db.js";
import AppError from "../utils/AppError.js";
import { formatMinorAsDecimal, parseDecimalToMinor } from "../utils/money.js";
import {
  calculateUtilization,
  computeCreditCardBilling,
} from "../utils/creditCardBilling.js";
import { toTransferJson } from "./transferModel.js";

const ACCOUNT_COLUMNS = `
  id, user_id, type, subtype, display_name, institution_name,
  masked_last4, currency_code, opening_amount_minor, credit_limit_minor,
  is_default, status, client_creation_key, creation_fingerprint,
  statement_closing_day, payment_due_day,
  created_at, updated_at
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
  creditLimit: row.credit_limit_minor === null || row.credit_limit_minor === undefined
    ? null
    : formatMinorAsDecimal(row.credit_limit_minor),
  statementClosingDay: row.statement_closing_day === null || row.statement_closing_day === undefined
    ? null
    : Number(row.statement_closing_day),
  paymentDueDay: row.payment_due_day === null || row.payment_due_day === undefined
    ? null
    : Number(row.payment_due_day),
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

export const withTransaction = async (userId, operation) => {
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

  const sDay = account.type === "credit_card" ? (account.statementClosingDay ?? null) : null;
  const pDay = account.type === "credit_card" ? (account.paymentDueDay ?? null) : null;

  const [result] = await connection.execute(
    `INSERT INTO accounts (
       user_id, type, subtype, display_name, institution_name, masked_last4,
       currency_code, opening_amount_minor, credit_limit_minor, is_default,
       client_creation_key, creation_fingerprint, statement_closing_day, payment_due_day
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      sDay,
      pDay,
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

  const setClauses = ["display_name = ?", "institution_name = ?", "masked_last4 = ?"];
  const setValues = [changes.displayName, changes.institutionName, changes.maskedLast4];

  if (account.type === "credit_card") {
    if (changes.statementClosingDay !== undefined) {
      setClauses.push("statement_closing_day = ?");
      setValues.push(changes.statementClosingDay ?? null);
    }
    if (changes.paymentDueDay !== undefined) {
      setClauses.push("payment_due_day = ?");
      setValues.push(changes.paymentDueDay ?? null);
    }
  } else if (changes.statementClosingDay !== undefined || changes.paymentDueDay !== undefined) {
    throw new AppError("Billing cycle settings are valid only for credit cards", 400);
  }

  setValues.push(accountId, userId);

  await connection.execute(
    `UPDATE accounts
        SET ${setClauses.join(", ")}
      WHERE id = ? AND user_id = ?`,
    setValues,
  );

  return toAccountJson(await selectById(connection, accountId, userId));
});

export const updateCreditCardBilling = async (cardId, userId, settings) => withTransaction(userId, async (connection) => {
  const card = await selectById(connection, cardId, userId, true);
  if (!card) return null;
  if (card.type !== "credit_card") {
    throw new AppError("Billing settings are only supported for credit cards", 400);
  }
  if (card.status === "archived") {
    throw new AppError("Archived accounts cannot be updated", 409);
  }

  const sDay = settings.statementClosingDay !== undefined ? settings.statementClosingDay : card.statement_closing_day;
  const pDay = settings.paymentDueDay !== undefined ? settings.paymentDueDay : card.payment_due_day;

  await connection.execute(
    `UPDATE accounts
        SET statement_closing_day = ?, payment_due_day = ?
      WHERE id = ? AND user_id = ?`,
    [sDay ?? null, pDay ?? null, cardId, userId],
  );

  return toAccountJson(await selectById(connection, cardId, userId));
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

/**
 * Calculates current ledger balance within an existing transaction connection with FOR UPDATE.
 */
export const getAccountBalanceWithinTx = async (connection, accountId, userId) => {
  const [rows] = await connection.execute(
    `SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE id = ? AND user_id = ? FOR UPDATE`,
    [accountId, userId],
  );
  const account = rows[0];
  if (!account) return null;

  const openingMinor = BigInt(account.opening_amount_minor ?? 0);

  // Transactions
  const [txRows] = await connection.execute(
    "SELECT type, amount FROM transactions WHERE user_id = ? AND account_id = ?",
    [userId, accountId],
  );
  let incomeMinor = 0n;
  let expenseMinor = 0n;
  for (const row of txRows) {
    const minor = BigInt(parseDecimalToMinor(String(row.amount)));
    if (row.type === "income") {
      incomeMinor += minor;
    } else if (row.type === "expense") {
      expenseMinor += minor;
    }
  }

  // Transfers
  const [transfersInRows] = await connection.execute(
    "SELECT amount_minor FROM transfers WHERE user_id = ? AND destination_account_id = ?",
    [userId, accountId],
  );
  let transfersInMinor = 0n;
  for (const row of transfersInRows) {
    transfersInMinor += BigInt(row.amount_minor);
  }

  const [transfersOutRows] = await connection.execute(
    "SELECT amount_minor FROM transfers WHERE user_id = ? AND source_account_id = ?",
    [userId, accountId],
  );
  let transfersOutMinor = 0n;
  for (const row of transfersOutRows) {
    transfersOutMinor += BigInt(row.amount_minor);
  }

  // Adjustments
  const [adjustmentRows] = await connection.execute(
    "SELECT amount_minor FROM account_adjustments WHERE user_id = ? AND account_id = ?",
    [userId, accountId],
  );
  let adjustmentsMinor = 0n;
  for (const row of adjustmentRows) {
    adjustmentsMinor += BigInt(row.amount_minor);
  }

  if (account.type !== "credit_card") {
    return (
      openingMinor +
      incomeMinor -
      expenseMinor +
      transfersInMinor -
      transfersOutMinor +
      adjustmentsMinor
    );
  }

  // For credit card, returns current debt
  return (
    openingMinor +
    expenseMinor -
    incomeMinor +
    transfersOutMinor -
    transfersInMinor -
    adjustmentsMinor
  );
};

export const getAccountLedgerBalance = async (accountId, userId) => {
  const account = await selectById(db, accountId, userId);
  if (!account) return null;

  const openingMinor = BigInt(account.opening_amount_minor ?? 0);

  // 1. Transactions
  const [txRows] = await db.execute(
    "SELECT type, amount FROM transactions WHERE user_id = ? AND account_id = ?",
    [userId, accountId],
  );
  let incomeMinor = 0n;
  let expenseMinor = 0n;
  for (const row of txRows) {
    const minor = BigInt(parseDecimalToMinor(String(row.amount)));
    if (row.type === "income") {
      incomeMinor += minor;
    } else if (row.type === "expense") {
      expenseMinor += minor;
    }
  }

  // 2. Transfers
  const [transfersInRows] = await db.execute(
    "SELECT amount_minor FROM transfers WHERE user_id = ? AND destination_account_id = ?",
    [userId, accountId],
  );
  let transfersInMinor = 0n;
  for (const row of transfersInRows) {
    transfersInMinor += BigInt(row.amount_minor);
  }

  const [transfersOutRows] = await db.execute(
    "SELECT amount_minor FROM transfers WHERE user_id = ? AND source_account_id = ?",
    [userId, accountId],
  );
  let transfersOutMinor = 0n;
  for (const row of transfersOutRows) {
    transfersOutMinor += BigInt(row.amount_minor);
  }

  // 3. Adjustments
  const [adjustmentRows] = await db.execute(
    "SELECT amount_minor FROM account_adjustments WHERE user_id = ? AND account_id = ?",
    [userId, accountId],
  );
  let adjustmentsMinor = 0n;
  for (const row of adjustmentRows) {
    adjustmentsMinor += BigInt(row.amount_minor);
  }

  const isCreditCard = account.type === "credit_card";
  let currentBalanceMinor;
  let availableCredit = null;
  let outstandingDebt = null;
  let utilizationPercentage = null;
  let billingInfo = null;

  if (!isCreditCard) {
    currentBalanceMinor =
      openingMinor +
      incomeMinor -
      expenseMinor +
      transfersInMinor -
      transfersOutMinor +
      adjustmentsMinor;
  } else {
    currentBalanceMinor =
      openingMinor +
      expenseMinor -
      incomeMinor +
      transfersOutMinor -
      transfersInMinor -
      adjustmentsMinor;

    outstandingDebt = formatMinorAsDecimal(currentBalanceMinor);

    if (account.credit_limit_minor !== null && account.credit_limit_minor !== undefined) {
      const limitMinor = BigInt(account.credit_limit_minor);
      const availableMinor = limitMinor - currentBalanceMinor;
      availableCredit = formatMinorAsDecimal(availableMinor);
      utilizationPercentage = calculateUtilization(currentBalanceMinor, limitMinor);
    }

    billingInfo = computeCreditCardBilling({
      statementClosingDay: account.statement_closing_day,
      paymentDueDay: account.payment_due_day,
      outstandingDebtMinor: currentBalanceMinor,
    });
  }

  return {
    accountId: account.id,
    displayName: account.display_name,
    type: account.type,
    subtype: account.subtype,
    currencyCode: account.currency_code,
    openingAmount: formatMinorAsDecimal(openingMinor),
    currentBalance: formatMinorAsDecimal(currentBalanceMinor),
    totalIncome: formatMinorAsDecimal(incomeMinor),
    totalExpense: formatMinorAsDecimal(expenseMinor),
    transfersIn: formatMinorAsDecimal(transfersInMinor),
    transfersOut: formatMinorAsDecimal(transfersOutMinor),
    totalAdjustments: formatMinorAsDecimal(adjustmentsMinor),
    creditLimit:
      account.credit_limit_minor !== null && account.credit_limit_minor !== undefined
        ? formatMinorAsDecimal(account.credit_limit_minor)
        : null,
    availableCredit,
    outstandingDebt,
    utilizationPercentage,
    billingInfo,
  };
};

export const getCreditCardDetails = async (cardId, userId) => {
  const account = await selectById(db, cardId, userId);
  if (!account) return null;
  if (account.type !== "credit_card") {
    throw new AppError("Account is not a credit card", 400);
  }

  const ledger = await getAccountLedgerBalance(cardId, userId);
  return {
    account: toAccountJson(account),
    balance: {
      creditLimit: ledger.creditLimit,
      outstandingDebt: ledger.outstandingDebt,
      availableCredit: ledger.availableCredit,
      utilizationPercentage: ledger.utilizationPercentage,
      currencyCode: ledger.currencyCode,
    },
    billing: ledger.billingInfo,
  };
};

export const createCardRepayment = async (userId, cardId, data) => {
  if (Number(data.sourceAccountId) === Number(cardId)) {
    throw new AppError("Source and credit card accounts must be different", 400);
  }

  return withTransaction(userId, async (connection) => {
    const targetCard = await selectById(connection, cardId, userId, true);
    if (!targetCard || targetCard.status !== "active") {
      throw new AppError("Credit card not found or inactive", 400);
    }
    if (targetCard.type !== "credit_card") {
      throw new AppError("Target account is not a credit card", 400);
    }

  const sourceAccount = await selectById(connection, data.sourceAccountId, userId, true);
  if (!sourceAccount || sourceAccount.status !== "active") {
    throw new AppError("Source account not found or inactive", 400);
  }
  if (sourceAccount.type === "credit_card") {
    throw new AppError("Repayment must come from an asset account, not another credit card", 400);
  }

  const amountMinor = parseDecimalToMinor(data.amount);
  if (amountMinor <= 0n) {
    throw new AppError("Repayment amount must be greater than zero", 400);
  }

  const currencyCode = data.currencyCode ?? "INR";
  const paymentDate = data.paymentDate;

  // Fingerprint payment
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({
      sourceAccountId: data.sourceAccountId,
      destinationAccountId: cardId,
      amountMinor: amountMinor.toString(),
      transferDate: paymentDate,
      currencyCode,
    }))
    .digest("hex");

  // Check idempotency in transfers
  const [existingRows] = await connection.execute(
    `SELECT t.id, t.user_id, t.source_account_id, t.destination_account_id,
            t.amount_minor, t.currency_code, t.transfer_date, t.note,
            t.client_transfer_key, t.transfer_fingerprint, t.created_at, t.updated_at,
            sa.display_name AS source_account_name,
            da.display_name AS destination_account_name
       FROM transfers t
       LEFT JOIN accounts sa ON sa.id = t.source_account_id
       LEFT JOIN accounts da ON da.id = t.destination_account_id
      WHERE t.user_id = ? AND t.client_transfer_key = ?
      FOR UPDATE`,
    [userId, data.clientPaymentKey],
  );

  if (existingRows[0]) {
    if (existingRows[0].transfer_fingerprint !== fingerprint) {
      throw new AppError("Idempotency key was already used for a different payment", 409);
    }
    const cardDebtMinor = await getAccountBalanceWithinTx(connection, cardId, userId);
    const limitMinor = BigInt(targetCard.credit_limit_minor ?? 0);
    return {
      payment: toTransferJson(existingRows[0]),
      created: false,
      cardDebt: formatMinorAsDecimal(cardDebtMinor),
      availableCredit: formatMinorAsDecimal(limitMinor - cardDebtMinor),
    };
  }

  // Verify source account balance
  const sourceBalanceMinor = await getAccountBalanceWithinTx(connection, data.sourceAccountId, userId);
  if (sourceBalanceMinor < amountMinor) {
    throw new AppError("Insufficient funds in source account", 400);
  }

  // Insert into transfers
  const note = data.note ? data.note : `Repayment for ${targetCard.display_name}`;
  const [result] = await connection.execute(
    `INSERT INTO transfers (
       user_id, source_account_id, destination_account_id,
       amount_minor, currency_code, transfer_date, note,
       client_transfer_key, transfer_fingerprint
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      data.sourceAccountId,
      cardId,
      amountMinor.toString(),
      currencyCode,
      paymentDate,
      note,
      data.clientPaymentKey,
      fingerprint,
    ],
  );

  const [insertedRows] = await connection.execute(
    `SELECT t.id, t.user_id, t.source_account_id, t.destination_account_id,
            t.amount_minor, t.currency_code, t.transfer_date, t.note,
            t.client_transfer_key, t.transfer_fingerprint, t.created_at, t.updated_at,
            sa.display_name AS source_account_name,
            da.display_name AS destination_account_name
       FROM transfers t
       LEFT JOIN accounts sa ON sa.id = t.source_account_id
       LEFT JOIN accounts da ON da.id = t.destination_account_id
      WHERE t.id = ? AND t.user_id = ?`,
    [result.insertId, userId],
  );

  const updatedSourceBalance = await getAccountBalanceWithinTx(connection, data.sourceAccountId, userId);
  const updatedCardDebt = await getAccountBalanceWithinTx(connection, cardId, userId);
  const limitMinor = BigInt(targetCard.credit_limit_minor ?? 0);

  return {
    payment: toTransferJson(insertedRows[0]),
    created: true,
    sourceBalance: formatMinorAsDecimal(updatedSourceBalance),
    cardDebt: formatMinorAsDecimal(updatedCardDebt),
    availableCredit: formatMinorAsDecimal(limitMinor - updatedCardDebt),
  };
});
};

export const getCardPayments = async (cardId, userId, filters = {}) => {
  const card = await selectById(db, cardId, userId);
  if (!card) return null;
  if (card.type !== "credit_card") {
    throw new AppError("Account is not a credit card", 400);
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

  const [rows] = await db.execute(
    `SELECT t.id, t.user_id, t.source_account_id, t.destination_account_id,
            t.amount_minor, t.currency_code, t.transfer_date, t.note,
            t.client_transfer_key, t.transfer_fingerprint, t.created_at, t.updated_at,
            sa.display_name AS source_account_name,
            da.display_name AS destination_account_name
       FROM transfers t
       LEFT JOIN accounts sa ON sa.id = t.source_account_id
       LEFT JOIN accounts da ON da.id = t.destination_account_id
      WHERE t.user_id = ? AND t.destination_account_id = ?
      ORDER BY t.transfer_date DESC, t.id DESC
      LIMIT ${limit} OFFSET ${offset}`,
    [userId, cardId],
  );

  const [countRows] = await db.execute(
    `SELECT COUNT(*) AS total FROM transfers t WHERE t.user_id = ? AND t.destination_account_id = ?`,
    [userId, cardId],
  );

  return {
    payments: rows.map(toTransferJson),
    total: Number(countRows[0].total),
    page,
    limit,
  };
};

export const getAccountActivity = async (accountId, userId, filters = {}) => {
  const account = await selectById(db, accountId, userId);
  if (!account) return null;

  const page = Number(filters.page ?? 1);
  const limit = Number(filters.limit ?? 20);
  if (!Number.isSafeInteger(page) || page < 1) {
    throw new AppError("Page must be a positive safe integer", 400);
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new AppError("Limit must be a safe integer between 1 and 100", 400);
  }
  const offset = (page - 1) * limit;

  // Transactions on this account
  const [txRows] = await db.execute(
    `SELECT t.id, t.type, t.title, t.amount, t.transaction_date, t.note, t.created_at,
            c.name AS category_name, 'transaction' AS activity_type
       FROM transactions t
       JOIN categories c ON c.id = t.category_id
      WHERE t.user_id = ? AND t.account_id = ?`,
    [userId, accountId],
  );

  // Transfers out
  const [txOutRows] = await db.execute(
    `SELECT t.id, 'transfer_out' AS type,
            CONCAT('Transfer to ', da.display_name) AS title,
            t.amount_minor, t.transfer_date AS transaction_date, t.note, t.created_at,
            'Transfer' AS category_name, 'transfer' AS activity_type
       FROM transfers t
       JOIN accounts da ON da.id = t.destination_account_id
      WHERE t.user_id = ? AND t.source_account_id = ?`,
    [userId, accountId],
  );

  // Transfers in
  const [txInRows] = await db.execute(
    `SELECT t.id, 'transfer_in' AS type,
            CONCAT('Transfer from ', sa.display_name) AS title,
            t.amount_minor, t.transfer_date AS transaction_date, t.note, t.created_at,
            'Transfer' AS category_name, 'transfer' AS activity_type
       FROM transfers t
       JOIN accounts sa ON sa.id = t.source_account_id
      WHERE t.user_id = ? AND t.destination_account_id = ?`,
    [userId, accountId],
  );

  // Adjustments
  const [adjRows] = await db.execute(
    `SELECT id,
            (CASE WHEN amount_minor > 0 THEN 'adjustment_credit' ELSE 'adjustment_debit' END) AS type,
            reason AS title,
            amount_minor, adjustment_date AS transaction_date, NULL AS note, created_at,
            'Adjustment' AS category_name, 'adjustment' AS activity_type
       FROM account_adjustments
      WHERE user_id = ? AND account_id = ?`,
    [userId, accountId],
  );

  const activities = [
    ...txRows.map((r) => ({
      id: `tx-${r.id}`,
      activityType: "transaction",
      type: r.type,
      title: r.title,
      amount: typeof r.amount === "number" ? r.amount.toFixed(2) : String(r.amount),
      date: r.transaction_date instanceof Date ? r.transaction_date.toISOString().slice(0, 10) : String(r.transaction_date).slice(0, 10),
      note: r.note ?? null,
      category: r.category_name ?? null,
      createdAt: r.created_at,
    })),
    ...txOutRows.map((r) => ({
      id: `tr-out-${r.id}`,
      activityType: "transfer",
      type: "transfer_out",
      title: r.title,
      amount: formatMinorAsDecimal(r.amount_minor),
      date: r.transaction_date instanceof Date ? r.transaction_date.toISOString().slice(0, 10) : String(r.transaction_date).slice(0, 10),
      note: r.note ?? null,
      category: "Transfer",
      createdAt: r.created_at,
    })),
    ...txInRows.map((r) => ({
      id: `tr-in-${r.id}`,
      activityType: "transfer",
      type: "transfer_in",
      title: r.title,
      amount: formatMinorAsDecimal(r.amount_minor),
      date: r.transaction_date instanceof Date ? r.transaction_date.toISOString().slice(0, 10) : String(r.transaction_date).slice(0, 10),
      note: r.note ?? null,
      category: "Transfer",
      createdAt: r.created_at,
    })),
    ...adjRows.map((r) => ({
      id: `adj-${r.id}`,
      activityType: "adjustment",
      type: r.type,
      title: r.title,
      amount: formatMinorAsDecimal(BigInt(r.amount_minor) < 0n ? -BigInt(r.amount_minor) : BigInt(r.amount_minor)),
      date: r.transaction_date instanceof Date ? r.transaction_date.toISOString().slice(0, 10) : String(r.transaction_date).slice(0, 10),
      note: null,
      category: "Adjustment",
      createdAt: r.created_at,
    })),
  ];

  activities.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""));
  });

  const total = activities.length;
  const paginated = activities.slice(offset, offset + limit);

  return {
    activities: paginated,
    total,
    page,
    limit,
  };
};

export { toAccountJson };
