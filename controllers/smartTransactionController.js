import asyncHandler from "../utils/asyncHandler.js";
import AppError from "../utils/AppError.js";
import {
  detectSmartTransactions,
  getDetectedTransactions,
  getDetectedTransactionById,
  updateDetectedTransaction,
  confirmDetectedTransaction,
  rejectDetectedTransaction,
  batchConfirmDetected,
  batchRejectDetected,
} from "../models/detectedTransactionModel.js";

/**
 * Ingests SMS messages, runs parsing, normalization, categorization,
 * and account matching, then stores as 'suggested' detected transactions.
 */
export const detectTransactions = asyncHandler(async (req, res) => {
  const items = Array.isArray(req.body)
    ? req.body
    : req.body.messages || req.body.transactions || [];

  if (!items || items.length === 0) {
    throw new AppError("No SMS messages provided for detection", 400);
  }

  const result = await detectSmartTransactions(req.user.id, items);

  res.status(200).json({
    success: true,
    message: `Processed ${items.length} messages: ${result.inserted} detected, ${result.skipped} skipped`,
    data: result,
  });
});

/**
 * Lists detected transactions for current user.
 */
export const getAllDetectedTransactions = asyncHandler(async (req, res) => {
  const data = await getDetectedTransactions(req.user.id, req.query);
  res.status(200).json({
    success: true,
    message: "Detected transactions fetched",
    data,
  });
});

/**
 * Gets a single detected transaction by ID.
 */
export const getSingleDetectedTransaction = asyncHandler(async (req, res) => {
  const item = await getDetectedTransactionById(req.params.id, req.user.id);
  if (!item) {
    throw new AppError("Detected transaction not found", 404);
  }
  res.status(200).json({
    success: true,
    message: "Detected transaction fetched",
    data: { transaction: item },
  });
});

/**
 * Updates manual corrections (merchantClean, classification, categoryId, accountId).
 */
export const editDetectedTransaction = asyncHandler(async (req, res) => {
  const updated = await updateDetectedTransaction(req.params.id, req.user.id, req.body);
  res.status(200).json({
    success: true,
    message: "Detected transaction updated",
    data: { transaction: updated },
  });
});

/**
 * Confirms a detected transaction and commits to ledger.
 */
export const confirmTransaction = asyncHandler(async (req, res) => {
  const confirmed = await confirmDetectedTransaction(req.params.id, req.user.id, req.body);
  res.status(200).json({
    success: true,
    message: "Transaction confirmed and added to ledger",
    data: confirmed,
  });
});

/**
 * Rejects a detected transaction.
 */
export const rejectTransaction = asyncHandler(async (req, res) => {
  const reason = req.body?.reason || "User rejected";
  const rejected = await rejectDetectedTransaction(req.params.id, req.user.id, reason);
  res.status(200).json({
    success: true,
    message: "Detected transaction rejected",
    data: rejected,
  });
});

/**
 * Batch confirms multiple detected transactions.
 */
export const batchConfirm = asyncHandler(async (req, res) => {
  const items = req.body.items || [];
  const result = await batchConfirmDetected(req.user.id, items);
  res.status(200).json({
    success: true,
    message: `Batch confirmed: ${result.confirmed.length} confirmed, ${result.errors.length} failed`,
    data: result,
  });
});

/**
 * Batch rejects multiple detected transactions.
 */
export const batchReject = asyncHandler(async (req, res) => {
  const ids = req.body.ids || [];
  const reason = req.body.reason || "Batch user rejection";
  const result = await batchRejectDetected(req.user.id, ids, reason);
  res.status(200).json({
    success: true,
    message: `Batch rejected: ${result.rejected.length} rejected, ${result.errors.length} failed`,
    data: result,
  });
});
