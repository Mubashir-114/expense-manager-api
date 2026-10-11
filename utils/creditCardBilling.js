import { formatMinorAsDecimal } from "./money.js";

/**
 * Checks if a given year is a leap year according to the Gregorian calendar.
 * @param {number} year
 * @returns {boolean}
 */
export const isLeapYear = (year) =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/**
 * Returns the exact number of days in a month (1-12) for a given year.
 * Correctly accounts for leap years in February.
 * @param {number} year
 * @param {number} month 1-12
 * @returns {number}
 */
export const getDaysInMonth = (year, month) => {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
};

/**
 * Clamps a calendar day to the valid day range of the target month.
 * e.g., Day 31 clamped to Feb 2026 -> 28, Feb 2024 -> 29, Apr 2026 -> 30.
 * @param {number} year
 * @param {number} month 1-12
 * @param {number} targetDay 1-31
 * @returns {number}
 */
export const clampDay = (year, month, targetDay) => {
  const maxDays = getDaysInMonth(year, month);
  return Math.min(Math.max(1, targetDay), maxDays);
};

/**
 * Formats year, month, day into canonical ISO YYYY-MM-DD string.
 * @param {number} year
 * @param {number} month
 * @param {number} day
 * @returns {string}
 */
export const formatDateString = (year, month, day) => {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
};

/**
 * Calculates the exact statement closing date for a given year and month.
 * @param {number} year
 * @param {number} month 1-12
 * @param {number} statementClosingDay 1-31
 * @returns {string} YYYY-MM-DD
 */
export const getStatementDate = (year, month, statementClosingDay) => {
  const day = clampDay(year, month, statementClosingDay);
  return formatDateString(year, month, day);
};

/**
 * Calculates the payment due date associated with a given statement cycle.
 * If paymentDueDay > statementClosingDay, the due date is in the same month.
 * If paymentDueDay <= statementClosingDay, the due date is in the following month.
 * @param {number} year Statement year
 * @param {number} month Statement month (1-12)
 * @param {number} statementClosingDay 1-31
 * @param {number} paymentDueDay 1-31
 * @returns {string} YYYY-MM-DD
 */
export const getDueDateForStatement = (
  year,
  month,
  statementClosingDay,
  paymentDueDay,
) => {
  if (paymentDueDay > statementClosingDay) {
    const day = clampDay(year, month, paymentDueDay);
    return formatDateString(year, month, day);
  }
  const dueYear = month === 12 ? year + 1 : year;
  const dueMonth = month === 12 ? 1 : month + 1;
  const day = clampDay(dueYear, dueMonth, paymentDueDay);
  return formatDateString(dueYear, dueMonth, day);
};

/**
 * Calculates credit utilization percentage as an exact 2-decimal string.
 * @param {bigint} outstandingDebtMinor Signed minor units of debt
 * @param {bigint|number|string|null} creditLimitMinor Credit limit in minor units
 * @returns {string} e.g. "15.00"
 */
export const calculateUtilization = (outstandingDebtMinor, creditLimitMinor) => {
  if (!creditLimitMinor) return "0.00";
  const limitMinor = BigInt(creditLimitMinor);
  if (limitMinor <= 0n || outstandingDebtMinor <= 0n) return "0.00";

  // Compute basis points of percentage: (debt * 10000) / limit
  const basisPoints = (outstandingDebtMinor * 10000n) / limitMinor;
  return formatMinorAsDecimal(basisPoints);
};

/**
 * Computes scheduled billing dates and verified status indicators.
 *
 * @param {Object} options
 * @param {number|null} options.statementClosingDay 1-31
 * @param {number|null} options.paymentDueDay 1-31
 * @param {bigint} options.outstandingDebtMinor Outstanding debt in minor units
 * @param {Date|string} [options.referenceDate] Defaults to current UTC date
 * @returns {Object} Verified billing information object
 */
export const computeCreditCardBilling = ({
  statementClosingDay,
  paymentDueDay,
  outstandingDebtMinor = 0n,
  referenceDate = new Date(),
}) => {
  const debt = BigInt(outstandingDebtMinor);

  if (
    statementClosingDay === null ||
    statementClosingDay === undefined ||
    paymentDueDay === null ||
    paymentDueDay === undefined
  ) {
    return {
      configured: false,
      statementClosingDay: statementClosingDay ?? null,
      paymentDueDay: paymentDueDay ?? null,
      lastStatementDate: null,
      nextStatementDate: null,
      paymentDueDate: null,
      isOverdue: false,
      isDue: false,
      status: debt > 0n ? "outstanding_unconfigured" : "settled",
      isEstimated: true,
      note: "Statement and due dates are not configured for this card.",
    };
  }

  const sDay = Number(statementClosingDay);
  const pDay = Number(paymentDueDay);

  let refYear;
  let refMonth;
  let refDay;

  if (typeof referenceDate === "string") {
    const parts = referenceDate.split("-").map(Number);
    refYear = parts[0];
    refMonth = parts[1];
    refDay = parts[2];
  } else {
    refYear = referenceDate.getUTCFullYear();
    refMonth = referenceDate.getUTCMonth() + 1;
    refDay = referenceDate.getUTCDate();
  }

  const todayStr = formatDateString(refYear, refMonth, refDay);
  const currentMonthStmt = getStatementDate(refYear, refMonth, sDay);

  let lastStmtYear;
  let lastStmtMonth;
  let lastStatementDate;
  let nextStmtYear;
  let nextStmtMonth;
  let nextStatementDate;

  if (todayStr >= currentMonthStmt) {
    // Current month statement has closed
    lastStmtYear = refYear;
    lastStmtMonth = refMonth;
    lastStatementDate = currentMonthStmt;

    nextStmtYear = refMonth === 12 ? refYear + 1 : refYear;
    nextStmtMonth = refMonth === 12 ? 1 : refMonth + 1;
    nextStatementDate = getStatementDate(nextStmtYear, nextStmtMonth, sDay);
  } else {
    // Current month statement has not closed yet
    nextStmtYear = refYear;
    nextStmtMonth = refMonth;
    nextStatementDate = currentMonthStmt;

    lastStmtYear = refMonth === 1 ? refYear - 1 : refYear;
    lastStmtMonth = refMonth === 1 ? 12 : refMonth - 1;
    lastStatementDate = getStatementDate(lastStmtYear, lastStmtMonth, sDay);
  }

  const lastDueDate = getDueDateForStatement(
    lastStmtYear,
    lastStmtMonth,
    sDay,
    pDay,
  );
  const nextDueDate = getDueDateForStatement(
    nextStmtYear,
    nextStmtMonth,
    sDay,
    pDay,
  );

  let isOverdue = false;
  let isDue = false;
  let paymentDueDate = null;
  let status = "settled";

  if (debt > 0n) {
    if (todayStr > lastDueDate) {
      isOverdue = true;
      isDue = false;
      paymentDueDate = lastDueDate;
      status = "overdue";
    } else {
      isOverdue = false;
      isDue = true;
      paymentDueDate = lastDueDate;
      status = "due";
    }
  } else if (debt < 0n) {
    status = "credit_balance";
    paymentDueDate = null;
  } else {
    status = "paid_in_full";
    paymentDueDate = null;
  }

  return {
    configured: true,
    statementClosingDay: sDay,
    paymentDueDay: pDay,
    lastStatementDate,
    nextStatementDate,
    paymentDueDate,
    nextCycleDueDate: nextDueDate,
    isOverdue,
    isDue,
    status,
    isEstimated: true,
    note: "Dates are estimated from scheduled billing configuration; actual issuer statements may vary.",
  };
};
