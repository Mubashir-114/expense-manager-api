import { createHash } from "node:crypto";

/**
 * Generates a deterministic SHA-256 hash for an SMS.
 * Scoped to sender + timestamp + normalized message content.
 */
export const generateSmsHash = (sender = "", timestampMs = 0, body = "") => {
  const input = `${String(sender).trim()}_${timestampMs}_${String(body).trim()}`;
  return createHash("sha256").update(input).digest("hex");
};

// Currency amount regex: Rs 500, Rs. 500.50, INR 1,500.00, Rs.1200
const AMOUNT_REGEX = /(?:Rs\.?|INR)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i;

// Reference number / UTR / Txn ID regex
const REF_REGEX = /(?:Ref(?:\s*No)?\.?\s*[:\-]?\s*|UPI\s*(?:ref|txn)(?:\s*no)?\.?\s*[:\-]?\s*|UTR(?:\s*no)?\.?\s*[:\-]?\s*|Txn\s*ID\s*[:\-]?\s*|RR\s*No\.?\s*[:\-]?\s*|IMPS\s*ref(?:\s*no)?\.?\s*[:\-]?\s*)([A-Za-z0-9]+)/i;

// Masked account number hints:
// "a/c ending 1234", "A/C **1234", "Acct XX1234", "Card ending 5678", "Card XX5678", "A/c no. XX1234"
const ACCOUNT_HINT_REGEX = /(?:(?:a\/c|acct|account|card)\s*(?:no\.?|number)?\s*(?:ending(?:\s*(?:in|with))?|ending)?\s*[\*xX\-]*\s*([0-9]{4})\b|(?:ending\s*(?:in|with)?\s*[\*xX\-]*\s*([0-9]{4})\b))/i;

// Debit indicators
const DEBIT_KEYWORDS = [
  "debited",
  "spent",
  "paid",
  "withdrawn",
  "withdrawal",
  "sent",
  "card purchase",
  "payment successful",
  "used for",
  "purchase at",
];

// Credit indicators
const CREDIT_KEYWORDS = [
  "credited",
  "received",
  "deposited",
  "added",
  "salary",
  "cashback",
  "reversal",
  "refund",
];

// Credit card indicators
const CC_KEYWORDS = [
  "credit card",
  "card ending",
  "card xx",
  "card **",
  "creditcard",
  "credit limit",
];

// Repayment indicators
const REPAYMENT_KEYWORDS = [
  "payment received towards",
  "received towards your",
  "credit card payment",
  "bill payment received",
  "card payment received",
  "towards your credit card",
];

// Refund indicators
const REFUND_KEYWORDS = [
  "refund",
  "credited back",
  "reversal",
  "refund credited",
];

// Transfer indicators
const TRANSFER_KEYWORDS = [
  "transfer to",
  "transferred to",
  "p2p",
  "sent to",
  "fund transfer",
];

// Common Indian Banks
const BANK_NAMES = [
  "HDFC",
  "SBI",
  "ICICI",
  "AXIS",
  "KOTAK",
  "PNB",
  "BOB",
  "YES",
  "INDUSIND",
  "CANARA",
  "UNION",
  "IDBI",
  "HSBC",
  "CITI",
  "RBL",
  "FEDERAL",
];

/**
 * Extracts the bank identifier from sender code or message body.
 */
export const extractBank = (sender = "", body = "") => {
  const upperSender = String(sender).toUpperCase();
  const upperBody = String(body).toUpperCase();

  // 1. Check sender prefix (e.g. AD-HDFCBK, VM-SBIINB, BZ-ICICIB)
  for (const bank of BANK_NAMES) {
    if (upperSender.includes(bank)) return bank;
  }

  // 2. Check body mentions
  for (const bank of BANK_NAMES) {
    if (upperBody.includes(`${bank} BANK`)) return bank;
    if (upperBody.includes(bank)) return bank;
  }

  return upperSender.length > 0 ? upperSender : "Unknown";
};

/**
 * Extracts masked account hint (last 4 digits) from message body.
 */
export const extractAccountHint = (body = "") => {
  const match = ACCOUNT_HINT_REGEX.exec(body);
  if (!match) return null;
  return match[1] || match[2] || null;
};

/**
 * Extracts amount in standard decimal format ('1500.00').
 */
export const extractAmount = (body = "") => {
  const match = AMOUNT_REGEX.exec(body);
  if (!match) return null;
  const raw = match[1].replace(/,/g, "");
  const num = Number.parseFloat(raw);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num.toFixed(2);
};

/**
 * Extracts reference number from message body.
 */
export const extractReference = (body = "") => {
  const match = REF_REGEX.exec(body);
  return match ? match[1].trim() : null;
};

/**
 * Extracts raw merchant string using positional and prefix patterns.
 */
export const extractRawMerchant = (body = "", direction = "debit") => {
  // 1. UPI VPA format: e.g. "to merchant@okaxis", "at uber@icici", or "UPI/SWIGGY/12345"
  const upiMatch = /(?:(?:to|at)\s+([a-zA-Z0-9.\-_]+@[a-zA-Z0-9]+)|UPI\/([a-zA-Z0-9.\-_]+)\/)/i.exec(body);
  if (upiMatch) {
    return (upiMatch[1] || upiMatch[2]).trim().replace(/[.,;:*_\-]+$/, "");
  }

  // 2. Standard merchant preposition patterns:
  const patterns = [
    /(?:spent\s+at|\bat\b|paid\s+to|transfer\s+to|sent\s+to|\bto\b|towards\s+(?:refund\s+from)?|info\s*:\s*(?:UPI\/)?)\s*([a-zA-Z0-9\s.\-_*]+?)(?:\s+(?:on|via|ref|using|avbl|avl|bal|limit|dated?|\.|$))/i,
    /(?:by\s+([a-zA-Z0-9\s.\-_*]+?)\s+(?:transfer|ref|on|via))/i,
    /(?:from\s+([a-zA-Z0-9\s.\-_*]+?)\s+on)/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(body);
    if (match && match[1]) {
      let candidate = match[1].trim().replace(/[.,;:*_\-]+$/, "").trim();
      if (
        candidate.length > 1 &&
        !/^your\s*(?:account|a\/c)?$/i.test(candidate) &&
        !/^upi$/i.test(candidate) &&
        !/^imps$/i.test(candidate) &&
        !/^[a-zA-Z]+\s*bank\s*a\/c/i.test(candidate)
      ) {
        return candidate;
      }
    }
  }

  return direction === "credit" ? "Deposit" : "Merchant";
};

/**
 * Classifies transaction type based on SMS text markers and account hints.
 */
export const classifyTransaction = (body = "") => {
  const lower = body.toLowerCase();

  const isCc = CC_KEYWORDS.some((kw) => lower.includes(kw));
  const isRepayment = REPAYMENT_KEYWORDS.some((kw) => lower.includes(kw));
  const isRefund = REFUND_KEYWORDS.some((kw) => lower.includes(kw));
  const isTransfer = TRANSFER_KEYWORDS.some((kw) => lower.includes(kw));
  const isCredit = CREDIT_KEYWORDS.some((kw) => lower.includes(kw));
  const isDebit = DEBIT_KEYWORDS.some((kw) => lower.includes(kw));

  if (isRepayment && isCc) {
    return "credit_card_repayment";
  }

  if (isRefund) {
    return "refund";
  }

  if (isCc && isDebit) {
    return "credit_card_purchase";
  }

  if (isTransfer && isDebit) {
    return "transfer";
  }

  if (isCredit && !isDebit) {
    return "income";
  }

  if (isDebit) {
    return "expense";
  }

  return isCredit ? "income" : "expense";
};

/**
 * Parses timestamp from SMS body or falls back to provided Date.
 */
export const extractDate = (body = "", fallbackDate = new Date()) => {
  // Formats like: 11-OCT-26, 11-10-2026, 11Oct26, 11/10/26, 11-10-26
  const dateRegex = /\b(\d{1,2})[-\/]([a-zA-Z]{3}|\d{1,2})[-\/](\d{2,4})\b/i;
  const match = dateRegex.exec(body);

  if (match) {
    const day = Number.parseInt(match[1], 10);
    const monthStr = match[2];
    let year = Number.parseInt(match[3], 10);
    if (year < 100) year += 2000;

    const monthMap = {
      jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
      jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
    };

    let month = Number.parseInt(monthStr, 10);
    if (Number.isNaN(month)) {
      month = monthMap[monthStr.slice(0, 3).toLowerCase()] || 0;
    }

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const yyyy = String(year).padStart(4, "0");
      const mm = String(month).padStart(2, "0");
      const dd = String(day).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  const d = fallbackDate instanceof Date ? fallbackDate : new Date(fallbackDate);
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
};

/**
 * Main parser entry point. Parses an SMS message into structured transaction data.
 */
export const parseBankSms = ({ sender = "", message = "", timestamp = null }) => {
  const trimmedMessage = String(message || "").trim();
  if (!trimmedMessage) return null;

  const amount = extractAmount(trimmedMessage);
  if (!amount) return null; // Not a monetary transaction

  const classification = classifyTransaction(trimmedMessage);
  const direction = ["income", "refund", "credit_card_repayment"].includes(classification)
    ? "credit"
    : "debit";

  const bank = extractBank(sender, trimmedMessage);
  const maskedAccountHint = extractAccountHint(trimmedMessage);
  const referenceNumber = extractReference(trimmedMessage);
  const merchantRaw = extractRawMerchant(trimmedMessage, direction);
  const transactionDate = extractDate(
    trimmedMessage,
    timestamp ? new Date(timestamp) : new Date(),
  );

  const timestampMs = timestamp
    ? new Date(timestamp).getTime()
    : new Date().getTime();
  const smsHash = generateSmsHash(sender, timestampMs, trimmedMessage);

  return {
    amount,
    classification,
    direction,
    bank,
    maskedAccountHint,
    referenceNumber,
    merchantRaw,
    transactionDate,
    smsHash,
    rawMessage: trimmedMessage,
    sender: String(sender).trim(),
  };
};

export default {
  parseBankSms,
  extractAmount,
  extractBank,
  extractAccountHint,
  extractReference,
  extractRawMerchant,
  classifyTransaction,
  extractDate,
  generateSmsHash,
};
