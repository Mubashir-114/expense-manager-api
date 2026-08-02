import {
  createTransaction,
  getTransactions,
  getTransactionById,
  updateTransaction,
  deleteTransaction,
  getCategoryById,
} from "../models/transactionModel.js";

import AppError from "../utils/AppError.js";
import asyncHandler from "../utils/asyncHandler.js";
import TransactionImportService from "../services/transactionImportService.js";

export const addTransaction = asyncHandler(async (req, res) => {
  const { categoryId, type, title, amount, transactionDate, note } = req.body;

  const category = await getCategoryById(categoryId);

  if (!category) {
    throw new AppError("Invalid category", 400);
  }

  if (category.type !== type) {
    throw new AppError(
      `Category ${category.name} is of type ${category.type}, but transaction type is ${type}`,
      400,
    );
  }

  const id = await createTransaction(
    req.user.id,
    categoryId,
    type,
    title,
    amount,
    transactionDate,
    note,
  );

  res.status(201).json({
    success: true,
    message: "Transaction added",
    data: {
      transactionId: id,
    },
  });
});

export const getAllTransactions = asyncHandler(async (req, res) => {
  const result = await getTransactions(req.user.id, req.query);

  res.json({
    success: true,
    message: "Transactions fetched",
    data: result,
  });
});

export const getSingleTransaction = asyncHandler(async (req, res) => {
  const transaction = await getTransactionById(req.params.id, req.user.id);

  if (!transaction) {
    throw new AppError("Transaction not found", 404);
  }

  res.json({
    success: true,
    message: "Transaction fetched",
    data: {
      transaction,
    },
  });
});

export const editTransaction = asyncHandler(async (req, res) => {
  const { categoryId, type, title, amount, transactionDate, note } = req.body;

  const category = await getCategoryById(categoryId);

  if (!category) {
    throw new AppError("Category not found", 404);
  }

  if (category.type !== type) {
    throw new AppError(
      `Category '${category.name}' belongs to ${category.type}, not ${type}`,
      400,
    );
  }

  const updated = await updateTransaction(
    req.params.id,
    req.user.id,
    categoryId,
    type,
    title,
    amount,
    transactionDate,
    note,
  );

  if (!updated) {
    throw new AppError("Transaction not found", 404);
  }

  const transaction = await getTransactionById(req.params.id, req.user.id);

  res.json({
    success: true,
    message: "Transaction updated",
    data: {
      transaction,
    },
  });
});

export const removeTransaction = asyncHandler(async (req, res) => {
  const deleted = await deleteTransaction(req.params.id, req.user.id);

  if (!deleted) {
    throw new AppError("Transaction not found", 404);
  }

  res.json({
    success: true,
    message: "Transaction deleted",
    data: null,
  });
});

export const importSmsTransactions = asyncHandler(async (req, res) => {
  const transactions = req.body;

  const result = await TransactionImportService.importSmsTransactions(
    req.user.id,
    transactions,
  );

  res.json({
    success: true,
    message: `${result.imported} transactions imported`,
    imported: result.imported,
    duplicates: result.skipped,
    failed: result.failed,
  });
});

