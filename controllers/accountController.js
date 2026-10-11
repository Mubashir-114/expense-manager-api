import {
  archiveAccount,
  createAccount,
  createCardRepayment,
  getAccountActivity,
  getAccountById,
  getAccountLedgerBalance,
  getAccounts,
  getCardPayments,
  getCreditCardDetails,
  setDefaultAccount,
  updateAccount,
  updateCreditCardBilling,
} from "../models/accountModel.js";
import AppError from "../utils/AppError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { parseDecimalToMinor } from "../utils/money.js";

export const addAccount = asyncHandler(async (req, res) => {
  const result = await createAccount(req.user.id, {
    type: req.body.type,
    subtype: req.body.subtype,
    displayName: req.body.displayName,
    institutionName: req.body.institutionName ?? null,
    maskedLast4: req.body.maskedLast4 ?? null,
    currencyCode: req.body.currencyCode ?? "INR",
    openingAmountMinor: parseDecimalToMinor(req.body.openingAmount ?? "0.00"),
    creditLimitMinor: req.body.creditLimit === undefined
      ? null
      : parseDecimalToMinor(req.body.creditLimit),
    statementClosingDay: req.body.statementClosingDay ?? null,
    paymentDueDay: req.body.paymentDueDay ?? null,
    isDefault: req.body.isDefault ?? false,
    clientCreationKey: req.body.clientCreationKey,
  });

  res.status(result.created ? 201 : 200).json({
    success: true,
    message: result.created ? "Account created" : "Account creation replayed",
    data: { account: result.account },
  });
});

export const getAllAccounts = asyncHandler(async (req, res) => {
  const data = await getAccounts(req.user.id, req.query);
  res.json({ success: true, message: "Accounts fetched", data });
});

export const getSingleAccount = asyncHandler(async (req, res) => {
  const account = await getAccountById(req.params.id, req.user.id);
  if (!account) throw new AppError("Account not found", 404);
  res.json({ success: true, message: "Account fetched", data: { account } });
});

export const editAccount = asyncHandler(async (req, res) => {
  const account = await updateAccount(req.params.id, req.user.id, {
    displayName: req.body.displayName,
    institutionName: req.body.institutionName ?? null,
    maskedLast4: req.body.maskedLast4 ?? null,
    statementClosingDay: req.body.statementClosingDay,
    paymentDueDay: req.body.paymentDueDay,
  });
  if (!account) throw new AppError("Account not found", 404);
  res.json({ success: true, message: "Account updated", data: { account } });
});

export const makeDefaultAccount = asyncHandler(async (req, res) => {
  const account = await setDefaultAccount(req.params.id, req.user.id);
  if (!account) throw new AppError("Account not found", 404);
  res.json({ success: true, message: "Default account updated", data: { account } });
});

export const archiveSingleAccount = asyncHandler(async (req, res) => {
  const account = await archiveAccount(req.params.id, req.user.id);
  if (!account) throw new AppError("Account not found", 404);
  res.json({ success: true, message: "Account archived", data: { account } });
});

export const getAccountBalance = asyncHandler(async (req, res) => {
  const balance = await getAccountLedgerBalance(req.params.id, req.user.id);
  if (!balance) throw new AppError("Account not found", 404);
  res.json({ success: true, message: "Account balance fetched", data: { balance } });
});

export const getAccountActivityLog = asyncHandler(async (req, res) => {
  const result = await getAccountActivity(req.params.id, req.user.id, req.query);
  if (!result) throw new AppError("Account not found", 404);
  res.json({ success: true, message: "Account activity fetched", data: result });
});

export const getCreditCardInfo = asyncHandler(async (req, res) => {
  const result = await getCreditCardDetails(req.params.id, req.user.id);
  if (!result) throw new AppError("Account not found", 404);
  res.json({ success: true, message: "Credit card details fetched", data: result });
});

export const updateBillingSettings = asyncHandler(async (req, res) => {
  const account = await updateCreditCardBilling(req.params.id, req.user.id, req.body);
  if (!account) throw new AppError("Account not found", 404);
  res.json({ success: true, message: "Billing settings updated", data: { account } });
});

export const repayCreditCardAccount = asyncHandler(async (req, res) => {
  const result = await createCardRepayment(req.user.id, Number(req.params.id), req.body);
  res.status(result.created ? 201 : 200).json({
    success: true,
    message: result.created ? "Credit card repayment recorded" : "Credit card repayment replayed",
    data: result,
  });
});

export const getCreditCardPayments = asyncHandler(async (req, res) => {
  const data = await getCardPayments(Number(req.params.id), req.user.id, req.query);
  if (!data) throw new AppError("Account not found", 404);
  res.json({ success: true, message: "Credit card payments fetched", data });
});
