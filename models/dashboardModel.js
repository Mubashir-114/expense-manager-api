import db from "../config/db.js";
import { formatMinorAsDecimal, parseDecimalToMinor } from "../utils/money.js";
import {
  calculateUtilization,
  computeCreditCardBilling,
} from "../utils/creditCardBilling.js";

const getDaysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

export const resolveDateRange = (filters = {}) => {
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonthNum = now.getUTCMonth() + 1; // 1-12

  let startDate;
  let endDate;
  let selectedMonth;
  let periodType = filters.period || "current_month";

  if (filters.startDate && filters.endDate) {
    startDate = filters.startDate;
    endDate = filters.endDate;
    periodType = "custom";
    selectedMonth = startDate.slice(0, 7);
  } else if (filters.month) {
    selectedMonth = filters.month;
    const [y, m] = filters.month.split("-").map(Number);
    const lastDay = getDaysInMonth(y, m);
    startDate = `${filters.month}-01`;
    endDate = `${filters.month}-${String(lastDay).padStart(2, "0")}`;
    periodType = "month";
  } else if (filters.period === "previous_month") {
    let prevYear = currentYear;
    let prevMonth = currentMonthNum - 1;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear -= 1;
    }
    const mStr = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
    selectedMonth = mStr;
    const lastDay = getDaysInMonth(prevYear, prevMonth);
    startDate = `${mStr}-01`;
    endDate = `${mStr}-${String(lastDay).padStart(2, "0")}`;
  } else {
    // default: current_month
    const mStr = `${currentYear}-${String(currentMonthNum).padStart(2, "0")}`;
    selectedMonth = mStr;
    const lastDay = getDaysInMonth(currentYear, currentMonthNum);
    startDate = `${mStr}-01`;
    endDate = `${mStr}-${String(lastDay).padStart(2, "0")}`;
  }

  // Previous period for MoM comparison
  let prevStartDate;
  let prevEndDate;

  if (periodType === "custom") {
    const startMs = Date.parse(startDate);
    const endMs = Date.parse(endDate);
    const diffMs = endMs - startMs;
    const prevEnd = new Date(startMs - 86400000);
    const prevStart = new Date(prevEnd.getTime() - diffMs);
    prevStartDate = prevStart.toISOString().slice(0, 10);
    prevEndDate = prevEnd.toISOString().slice(0, 10);
  } else {
    const [y, m] = selectedMonth.split("-").map(Number);
    let prevY = y;
    let prevM = m - 1;
    if (prevM === 0) {
      prevM = 12;
      prevY -= 1;
    }
    const prevMStr = `${prevY}-${String(prevM).padStart(2, "0")}`;
    const prevLastDay = getDaysInMonth(prevY, prevM);
    prevStartDate = `${prevMStr}-01`;
    prevEndDate = `${prevMStr}-${String(prevLastDay).padStart(2, "0")}`;
  }

  return {
    periodType,
    selectedMonth,
    startDate,
    endDate,
    previousPeriod: {
      startDate: prevStartDate,
      endDate: prevEndDate,
    },
  };
};

export const calculateChangePercent = (currentMinor, prevMinor) => {
  if (prevMinor === 0n) {
    if (currentMinor === 0n) return "0.0";
    if (currentMinor > 0n) return "+100.0";
    return "-100.0";
  }
  const diff = currentMinor - prevMinor;
  const absPrev = prevMinor < 0n ? -prevMinor : prevMinor;
  const pct = (Number(diff) / Number(absPrev)) * 100;
  const formatted = pct.toFixed(1);
  return pct > 0 ? `+${formatted}` : formatted;
};

/**
 * Computes exact ledger-derived balances and metrics for all accounts owned by a user.
 */
export const getDashboardAccountsData = async (userId) => {
  const [accounts] = await db.execute(
    `SELECT id, user_id, type, subtype, display_name, institution_name,
            masked_last4, currency_code, opening_amount_minor, credit_limit_minor,
            is_default, status, statement_closing_day, payment_due_day
       FROM accounts
      WHERE user_id = ?
      ORDER BY is_default DESC, id ASC`,
    [userId],
  );

  const [txRows] = await db.execute(
    "SELECT account_id, type, amount FROM transactions WHERE user_id = ? AND account_id IS NOT NULL",
    [userId],
  );

  const [transfersRows] = await db.execute(
    "SELECT source_account_id, destination_account_id, amount_minor FROM transfers WHERE user_id = ?",
    [userId],
  );

  const [adjustmentRows] = await db.execute(
    "SELECT account_id, amount_minor FROM account_adjustments WHERE user_id = ?",
    [userId],
  );

  // Index transaction amounts by account and type
  const txByAccount = new Map();
  for (const row of txRows) {
    const accId = row.account_id;
    if (!txByAccount.has(accId)) {
      txByAccount.set(accId, { incomeMinor: 0n, expenseMinor: 0n });
    }
    const accTotals = txByAccount.get(accId);
    const minor = BigInt(parseDecimalToMinor(String(row.amount)));
    if (row.type === "income") {
      accTotals.incomeMinor += minor;
    } else if (row.type === "expense") {
      accTotals.expenseMinor += minor;
    }
  }

  // Index transfers by account
  const transfersInByAccount = new Map();
  const transfersOutByAccount = new Map();
  for (const t of transfersRows) {
    const amountMinor = BigInt(t.amount_minor);
    if (t.destination_account_id) {
      const cur = transfersInByAccount.get(t.destination_account_id) ?? 0n;
      transfersInByAccount.set(t.destination_account_id, cur + amountMinor);
    }
    if (t.source_account_id) {
      const cur = transfersOutByAccount.get(t.source_account_id) ?? 0n;
      transfersOutByAccount.set(t.source_account_id, cur + amountMinor);
    }
  }

  // Index adjustments by account
  const adjustmentsByAccount = new Map();
  for (const a of adjustmentRows) {
    const cur = adjustmentsByAccount.get(a.account_id) ?? 0n;
    adjustmentsByAccount.set(a.account_id, cur + BigInt(a.amount_minor));
  }

  let totalAssetsMinor = 0n;
  let totalLiabilitiesMinor = 0n;

  const accountItems = [];
  const creditCards = [];

  for (const acc of accounts) {
    const openingMinor = BigInt(acc.opening_amount_minor ?? 0);
    const tx = txByAccount.get(acc.id) ?? { incomeMinor: 0n, expenseMinor: 0n };
    const transfersInMinor = transfersInByAccount.get(acc.id) ?? 0n;
    const transfersOutMinor = transfersOutByAccount.get(acc.id) ?? 0n;
    const adjustmentsMinor = adjustmentsByAccount.get(acc.id) ?? 0n;

    const isCreditCard = acc.type === "credit_card";
    const isActive = acc.status === "active";
    const isDefault = acc.is_default === true || acc.is_default === 1 || acc.is_default === "1";

    let currentBalanceMinor;
    let availableCredit = null;
    let outstandingDebt = null;
    let utilizationPercentage = null;
    let billingStatus = null;

    if (!isCreditCard) {
      currentBalanceMinor =
        openingMinor +
        tx.incomeMinor -
        tx.expenseMinor +
        transfersInMinor -
        transfersOutMinor +
        adjustmentsMinor;

      if (isActive) {
        totalAssetsMinor += currentBalanceMinor;
      }
    } else {
      // For credit card, balance is outstanding debt
      currentBalanceMinor =
        openingMinor +
        tx.expenseMinor -
        tx.incomeMinor +
        transfersOutMinor -
        transfersInMinor -
        adjustmentsMinor;

      outstandingDebt = formatMinorAsDecimal(currentBalanceMinor);

      if (isActive && currentBalanceMinor > 0n) {
        totalLiabilitiesMinor += currentBalanceMinor;
      }

      if (acc.credit_limit_minor !== null && acc.credit_limit_minor !== undefined) {
        const limitMinor = BigInt(acc.credit_limit_minor);
        const availableMinor = limitMinor - currentBalanceMinor;
        availableCredit = formatMinorAsDecimal(availableMinor);
        utilizationPercentage = calculateUtilization(currentBalanceMinor, limitMinor);
      }

      const billing = computeCreditCardBilling({
        statementClosingDay: acc.statement_closing_day,
        paymentDueDay: acc.payment_due_day,
        outstandingDebtMinor: currentBalanceMinor,
      });
      billingStatus = billing.paymentStatus;

      creditCards.push({
        id: acc.id,
        displayName: acc.display_name,
        maskedLast4: acc.masked_last4,
        creditLimit: acc.credit_limit_minor !== null ? formatMinorAsDecimal(acc.credit_limit_minor) : null,
        outstandingDebt,
        availableCredit,
        utilizationPercentage,
        statementClosingDay: acc.statement_closing_day,
        paymentDueDay: acc.payment_due_day,
        billingStatus,
        isDefault,
        status: acc.status,
      });
    }

    accountItems.push({
      id: acc.id,
      displayName: acc.display_name,
      type: acc.type,
      subtype: acc.subtype,
      currencyCode: acc.currency_code,
      currentBalance: formatMinorAsDecimal(currentBalanceMinor),
      isDefault,
      status: acc.status,
      isArchived: acc.status === "archived",
      creditLimit: acc.credit_limit_minor !== null ? formatMinorAsDecimal(acc.credit_limit_minor) : null,
      outstandingDebt,
      availableCredit,
      utilizationPercentage,
      billingStatus,
      rawBalanceMinor: currentBalanceMinor,
    });
  }

  // Calculate asset distribution percentages for positive active asset accounts
  const assetDistribution = [];
  for (const item of accountItems) {
    if (item.type !== "credit_card" && item.status === "active") {
      let percentage = "0.0";
      if (item.rawBalanceMinor > 0n && totalAssetsMinor > 0n) {
        percentage = ((Number(item.rawBalanceMinor) / Number(totalAssetsMinor)) * 100).toFixed(1);
      }
      item.assetPercentage = percentage;
      if (item.rawBalanceMinor > 0n) {
        assetDistribution.push({
          accountId: item.id,
          displayName: item.displayName,
          type: item.type,
          subtype: item.subtype,
          balance: item.currentBalance,
          percentage,
        });
      }
    } else {
      item.assetPercentage = null;
    }
    delete item.rawBalanceMinor;
  }

  const netWorthMinor = totalAssetsMinor - totalLiabilitiesMinor;

  return {
    totalAssets: formatMinorAsDecimal(totalAssetsMinor),
    totalLiabilities: formatMinorAsDecimal(totalLiabilitiesMinor),
    netWorth: formatMinorAsDecimal(netWorthMinor),
    accounts: accountItems,
    assetDistribution,
    creditCards,
  };
};

/**
 * Returns comprehensive Dashboard 2.0 analytics including financial overview,
 * spending breakdowns, trends, deterministic insights, and recent transactions.
 */
export const getDashboardAnalytics = async (userId, filters = {}) => {
  const dateRange = resolveDateRange(filters);
  const { startDate, endDate, previousPeriod, selectedMonth, periodType } = dateRange;

  // 1. Account balances & financial overview
  const accountsData = await getDashboardAccountsData(userId);

  // 2. Period transactions (Income & Expense)
  const [periodTxRows] = await db.execute(
    `SELECT t.id, t.category_id, t.account_id, t.type, t.title, t.amount,
            t.transaction_date, t.note, t.source,
            c.name AS category_name, c.icon AS category_icon, c.color AS category_color,
            a.display_name AS account_name, a.type AS account_type
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       LEFT JOIN accounts a ON a.id = t.account_id
      WHERE t.user_id = ?
        AND DATE(t.transaction_date) >= ?
        AND DATE(t.transaction_date) <= ?
      ORDER BY t.transaction_date DESC, t.id DESC`,
    [userId, startDate, endDate],
  );

  let periodIncomeMinor = 0n;
  let periodExpenseMinor = 0n;
  const categoryExpensesMap = new Map();
  const merchantExpensesMap = new Map();
  const dailyExpensesMap = new Map();
  let largestExpense = null;
  let largestExpenseMinor = 0n;

  for (const tx of periodTxRows) {
    const minor = BigInt(parseDecimalToMinor(String(tx.amount)));
    const dateStr = tx.transaction_date instanceof Date
      ? tx.transaction_date.toISOString().slice(0, 10)
      : String(tx.transaction_date).slice(0, 10);

    if (tx.type === "income") {
      periodIncomeMinor += minor;
    } else if (tx.type === "expense") {
      periodExpenseMinor += minor;

      // Track largest expense
      if (minor > largestExpenseMinor) {
        largestExpenseMinor = minor;
        largestExpense = {
          id: tx.id,
          title: tx.title,
          amount: formatMinorAsDecimal(minor),
          date: dateStr,
          category: tx.category_name || "Uncategorized",
        };
      }

      // Group by Category
      const catKey = tx.category_id || 0;
      if (!categoryExpensesMap.has(catKey)) {
        categoryExpensesMap.set(catKey, {
          id: tx.category_id,
          name: tx.category_name || "Uncategorized",
          icon: tx.category_icon || "category",
          color: tx.category_color || "#888888",
          totalMinor: 0n,
        });
      }
      categoryExpensesMap.get(catKey).totalMinor += minor;

      // Group by Merchant
      const merchantKey = (tx.title || "Unknown").trim();
      if (!merchantExpensesMap.has(merchantKey)) {
        merchantExpensesMap.set(merchantKey, {
          merchant: merchantKey,
          totalMinor: 0n,
          count: 0,
        });
      }
      const mEntry = merchantExpensesMap.get(merchantKey);
      mEntry.totalMinor += minor;
      mEntry.count += 1;

      // Group by Day
      if (!dailyExpensesMap.has(dateStr)) {
        dailyExpensesMap.set(dateStr, { date: dateStr, amountMinor: 0n, count: 0 });
      }
      const dEntry = dailyExpensesMap.get(dateStr);
      dEntry.amountMinor += minor;
      dEntry.count += 1;
    }
  }

  // 3. Format category breakdown & top categories
  const byCategory = [];
  for (const cat of categoryExpensesMap.values()) {
    const percentage = periodExpenseMinor > 0n
      ? ((Number(cat.totalMinor) / Number(periodExpenseMinor)) * 100).toFixed(1)
      : "0.0";
    byCategory.push({
      id: cat.id,
      name: cat.name,
      icon: cat.icon,
      color: cat.color,
      total: formatMinorAsDecimal(cat.totalMinor),
      percentage,
      _totalMinor: cat.totalMinor,
    });
  }
  byCategory.sort((a, b) => (b._totalMinor > a._totalMinor ? 1 : b._totalMinor < a._totalMinor ? -1 : 0));
  byCategory.forEach((c) => delete c._totalMinor);
  const topCategories = byCategory.slice(0, 5);

  // 4. Format top merchants
  const topMerchants = Array.from(merchantExpensesMap.values())
    .map((m) => ({
      merchant: m.merchant,
      total: formatMinorAsDecimal(m.totalMinor),
      count: m.count,
      percentage: periodExpenseMinor > 0n
        ? ((Number(m.totalMinor) / Number(periodExpenseMinor)) * 100).toFixed(1)
        : "0.0",
      _totalMinor: m.totalMinor,
    }))
    .sort((a, b) => (b._totalMinor > a._totalMinor ? 1 : b._totalMinor < a._totalMinor ? -1 : 0))
    .slice(0, 5);
  topMerchants.forEach((m) => delete m._totalMinor);

  // 5. Daily trends
  const dailyTrends = Array.from(dailyExpensesMap.values())
    .map((d) => ({
      date: d.date,
      amount: formatMinorAsDecimal(d.amountMinor),
      count: d.count,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // 6. Previous period comparison
  const [prevTxRows] = await db.execute(
    `SELECT type, amount
       FROM transactions
      WHERE user_id = ?
        AND DATE(transaction_date) >= ?
        AND DATE(transaction_date) <= ?`,
    [userId, previousPeriod.startDate, previousPeriod.endDate],
  );

  let prevIncomeMinor = 0n;
  let prevExpenseMinor = 0n;
  for (const row of prevTxRows) {
    const minor = BigInt(parseDecimalToMinor(String(row.amount)));
    if (row.type === "income") prevIncomeMinor += minor;
    else if (row.type === "expense") prevExpenseMinor += minor;
  }
  const prevSavingsMinor = prevIncomeMinor - prevExpenseMinor;
  const periodSavingsMinor = periodIncomeMinor - periodExpenseMinor;

  const incomeChangePercent = calculateChangePercent(periodIncomeMinor, prevIncomeMinor);
  const expenseChangePercent = calculateChangePercent(periodExpenseMinor, prevExpenseMinor);
  const savingsChangePercent = calculateChangePercent(periodSavingsMinor, prevSavingsMinor);

  // 7. Monthly trends (historical 6 months)
  const [monthlyRows] = await db.execute(
    `SELECT DATE_FORMAT(transaction_date, '%Y-%m') AS month, type, amount
       FROM transactions
      WHERE user_id = ?
        AND transaction_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
      ORDER BY month ASC`,
    [userId],
  );

  const monthMap = new Map();
  for (const row of monthlyRows) {
    if (!monthMap.has(row.month)) {
      monthMap.set(row.month, { month: row.month, incomeMinor: 0n, expenseMinor: 0n });
    }
    const m = monthMap.get(row.month);
    if (row.amount !== undefined && row.amount !== null) {
      const minor = BigInt(parseDecimalToMinor(String(row.amount)));
      if (row.type === "income") m.incomeMinor += minor;
      else if (row.type === "expense") m.expenseMinor += minor;
    } else {
      if (row.income !== undefined && row.income !== null) {
        m.incomeMinor += BigInt(parseDecimalToMinor(String(row.income)));
      }
      if (row.expense !== undefined && row.expense !== null) {
        m.expenseMinor += BigInt(parseDecimalToMinor(String(row.expense)));
      }
    }
  }

  const monthlyTrends = Array.from(monthMap.values()).map((m) => ({
    month: m.month,
    income: formatMinorAsDecimal(m.incomeMinor),
    expense: formatMinorAsDecimal(m.expenseMinor),
    netSavings: formatMinorAsDecimal(m.incomeMinor - m.expenseMinor),
  }));

  // 8. SMS statistics
  const [smsRows] = await db.execute(
    `SELECT COALESCE(SUM(CASE WHEN source = 'sms' AND DATE(transaction_date) = CURDATE() THEN 1 ELSE 0 END), 0) AS smsImportedToday,
            COALESCE(SUM(CASE WHEN source = 'sms' THEN 1 ELSE 0 END), 0) AS totalSmsImported
       FROM transactions
      WHERE user_id = ?`,
    [userId],
  );
  const smsStats = smsRows[0] || { smsImportedToday: 0, totalSmsImported: 0 };

  // 9. Recent transactions bounded (limit 10)
  const [recentRows] = await db.execute(
    `SELECT t.id, t.category_id, t.account_id, t.type, t.title, t.amount,
            t.transaction_date, t.note, t.source,
            c.name AS category_name, c.icon AS category_icon, c.color AS category_color,
            a.display_name AS account_name, a.type AS account_type
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       LEFT JOIN accounts a ON a.id = t.account_id
      WHERE t.user_id = ?
      ORDER BY t.transaction_date DESC, t.id DESC
      LIMIT 10`,
    [userId],
  );

  const recentTransactions = recentRows.map((r) => {
    const dStr = r.transaction_date instanceof Date
      ? r.transaction_date.toISOString().slice(0, 10)
      : String(r.transaction_date).slice(0, 10);
    return {
      id: r.id,
      title: r.title,
      amount: formatMinorAsDecimal(parseDecimalToMinor(String(r.amount))),
      type: r.type,
      date: dStr,
      categoryName: r.category_name || "Uncategorized",
      categoryIcon: r.category_icon || "category",
      categoryColor: r.category_color || "#888888",
      accountName: r.account_name || null,
      accountType: r.account_type || null,
      source: r.source,
    };
  });

  // 10. Deterministic financial observations
  const insights = [];
  if (topCategories.length > 0) {
    const topCat = topCategories[0];
    insights.push({
      type: "highest_category",
      message: `Highest spending category is ${topCat.name} at ₹${topCat.total} (${topCat.percentage}% of expenses).`,
    });
  }
  if (largestExpense) {
    insights.push({
      type: "largest_expense",
      message: `Largest single expense was ₹${largestExpense.amount} for "${largestExpense.title}" on ${largestExpense.date}.`,
    });
  }
  if (prevExpenseMinor > 0n || periodExpenseMinor > 0n) {
    const dir = expenseChangePercent.startsWith("+") ? "increased" : "decreased";
    const cleanPct = expenseChangePercent.replace("+", "");
    insights.push({
      type: "spending_trend",
      message: `Expenses ${dir} by ${cleanPct}% compared to the previous period.`,
    });
  }
  if (periodIncomeMinor > 0n) {
    const savingsRate = ((Number(periodSavingsMinor) / Number(periodIncomeMinor)) * 100).toFixed(1);
    insights.push({
      type: "savings_rate",
      message: `Savings rate is ${savingsRate}% with net cash flow of ₹${formatMinorAsDecimal(periodSavingsMinor)}.`,
    });
  } else if (periodExpenseMinor > 0n) {
    insights.push({
      type: "cash_flow",
      message: `Expenses totaled ₹${formatMinorAsDecimal(periodExpenseMinor)} with no income recorded this period.`,
    });
  }
  if (accountsData.creditCards.length > 0) {
    const cardWithDebt = accountsData.creditCards.find((c) => c.utilizationPercentage && Number(c.utilizationPercentage) > 0);
    if (cardWithDebt) {
      insights.push({
        type: "credit_utilization",
        message: `Credit card ${cardWithDebt.displayName} utilization is ${cardWithDebt.utilizationPercentage}%.`,
      });
    }
  }

  // Savings rate string
  const savingsRate = periodIncomeMinor > 0n
    ? ((Number(periodSavingsMinor) / Number(periodIncomeMinor)) * 100).toFixed(1)
    : "0.0";

  return {
    // Top-level backwards compatibility fields (exact numbers)
    totalIncome: Number(formatMinorAsDecimal(periodIncomeMinor)),
    totalExpense: Number(formatMinorAsDecimal(periodExpenseMinor)),
    balance: Number(formatMinorAsDecimal(periodSavingsMinor)),
    smsImportedToday: Number(smsStats.smsImportedToday),
    totalSmsImported: Number(smsStats.totalSmsImported),

    // Dashboard 2.0 Period Metadata
    period: {
      type: periodType,
      selectedMonth,
      startDate,
      endDate,
      previousPeriod,
    },

    // A. Financial Overview
    overview: {
      totalAssets: accountsData.totalAssets,
      totalLiabilities: accountsData.totalLiabilities,
      netWorth: accountsData.netWorth,
      monthlyIncome: formatMinorAsDecimal(periodIncomeMinor),
      monthlyExpenses: formatMinorAsDecimal(periodExpenseMinor),
      monthlyNetSavings: formatMinorAsDecimal(periodSavingsMinor),
      savingsRate,
      monthOverMonth: {
        incomeChangePercent,
        expenseChangePercent,
        savingsChangePercent,
      },
    },

    // B. Spending Analytics
    spending: {
      byCategory,
      topCategories,
      topMerchants,
      dailyTrends,
      largestExpense,
    },

    // C. Accounts Overview
    accounts: {
      items: accountsData.accounts,
      assetDistribution: accountsData.assetDistribution,
      creditCards: accountsData.creditCards,
    },

    // D. Financial Insights
    insights,

    // Historical & Recent
    monthlyTrends,
    recentTransactions,
  };
};

/**
 * Backward compatibility functions
 */
export const getDashboardSummary = async (userId, filters = {}) => {
  return getDashboardAnalytics(userId, filters);
};

export const getMonthlySummary = async (userId) => {
  const [rows] = await db.execute(
    `SELECT DATE_FORMAT(transaction_date, '%Y-%m') AS month,
            COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income,
            COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expense
       FROM transactions
      WHERE user_id = ?
      GROUP BY month
      ORDER BY month DESC`,
    [userId],
  );

  return rows.map((row) => ({
    month: row.month,
    income: Number(row.income),
    expense: Number(row.expense),
  }));
};

export const getExpenseByCategory = async (userId, filters = {}) => {
  const dateRange = resolveDateRange(filters);
  const [rows] = await db.execute(
    `SELECT c.id, c.name, c.icon, c.color,
            COALESCE(SUM(t.amount), 0) AS total
       FROM transactions t
       JOIN categories c ON c.id = t.category_id
      WHERE t.user_id = ?
        AND t.type = 'expense'
        AND DATE(t.transaction_date) >= ?
        AND DATE(t.transaction_date) <= ?
      GROUP BY c.id, c.name, c.icon, c.color
      ORDER BY total DESC`,
    [userId, dateRange.startDate, dateRange.endDate],
  );

  return rows.map((row) => ({
    ...row,
    total: Number(row.total),
  }));
};

export const getRecentTransactions = async (userId, limit = 10) => {
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const [rows] = await db.execute(
    `SELECT t.*, c.name AS category
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.user_id = ?
      ORDER BY t.transaction_date DESC, t.id DESC
      LIMIT ${safeLimit}`,
    [userId],
  );

  return rows.map((row) => ({
    ...row,
    amount: Number(row.amount),
  }));
};