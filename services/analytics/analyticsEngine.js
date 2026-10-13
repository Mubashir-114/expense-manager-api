/**
 * FinTrack 2.0 - Phase 5B Deterministic Financial Analytics Engine
 *
 * Invariants:
 * 1. Read-only: Zero mutating database queries (no INSERT, UPDATE, DELETE).
 * 2. User ownership: Every database query enforces `user_id = ?` scoping at the SQL level.
 * 3. Scope isolation: Reads ONLY persisted records from `transactions`, `categories`, `budgets`, `accounts`.
 *    Has no capability or connection to banking APIs, SMS inboxes, or unconfirmed `detected_transactions`.
 * 4. Deterministic: Computations use exact numeric / BigInt decimal arithmetic without external AI.
 */

import analyticsDb from "../../config/analyticsDb.js";
import AppError from "../../utils/AppError.js";
import { formatTemplateResponse } from "./responseTemplater.js";

const getDaysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/**
 * Resolves a bounded analytics period.
 * Enforces maximum 365-day range to prevent unbounded queries.
 */
export const resolveAnalyticsPeriod = (options = {}) => {
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1; // 1-12

  // 1. Explicit custom date range
  if (options.startDate && options.endDate) {
    const start = new Date(options.startDate);
    const end = new Date(options.endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new AppError("Invalid date format. Expected YYYY-MM-DD.", 400);
    }
    if (start > end) {
      throw new AppError("Start date cannot be after end date.", 400);
    }

    const diffDays = Math.round((end - start) / (1000 * 60 * 60 * 24));
    if (diffDays > 365) {
      throw new AppError("Requested date range exceeds the maximum limit of 365 days.", 400);
    }

    // Previous comparable period with equal duration
    const prevEnd = new Date(start.getTime() - 24 * 60 * 60 * 1000);
    const prevStart = new Date(prevEnd.getTime() - diffDays * 24 * 60 * 60 * 1000);

    return {
      type: "custom",
      startDate: options.startDate,
      endDate: options.endDate,
      label: `${options.startDate} to ${options.endDate}`,
      year: start.getUTCFullYear(),
      month: start.getUTCMonth() + 1,
      previousPeriod: {
        startDate: prevStart.toISOString().slice(0, 10),
        endDate: prevEnd.toISOString().slice(0, 10),
        label: `${prevStart.toISOString().slice(0, 10)} to ${prevEnd.toISOString().slice(0, 10)}`,
      },
    };
  }

  // 2. Specific Year-Month (e.g., '2026-10')
  if (options.month && /^\d{4}-\d{2}$/.test(options.month)) {
    const [yStr, mStr] = options.month.split("-");
    const year = Number(yStr);
    const month = Number(mStr);
    const days = getDaysInMonth(year, month);
    const padMonth = String(month).padStart(2, "0");

    const prevYear = month === 1 ? year - 1 : year;
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevDays = getDaysInMonth(prevYear, prevMonth);
    const padPrevMonth = String(prevMonth).padStart(2, "0");

    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];

    return {
      type: "month",
      startDate: `${year}-${padMonth}-01`,
      endDate: `${year}-${padMonth}-${String(days).padStart(2, "0")}`,
      label: `${monthNames[month - 1]} ${year}`,
      year,
      month,
      previousPeriod: {
        startDate: `${prevYear}-${padPrevMonth}-01`,
        endDate: `${prevYear}-${padPrevMonth}-${String(prevDays).padStart(2, "0")}`,
        label: `${monthNames[prevMonth - 1]} ${prevYear}`,
      },
    };
  }

  // 3. Previous month
  if (options.period === "previous_month") {
    const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;
    const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const days = getDaysInMonth(prevYear, prevMonth);
    const padMonth = String(prevMonth).padStart(2, "0");

    const pprevYear = prevMonth === 1 ? prevYear - 1 : prevYear;
    const pprevMonth = prevMonth === 1 ? 12 : prevMonth - 1;
    const pprevDays = getDaysInMonth(pprevYear, pprevMonth);
    const padPprevMonth = String(pprevMonth).padStart(2, "0");

    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];

    return {
      type: "previous_month",
      startDate: `${prevYear}-${padMonth}-01`,
      endDate: `${prevYear}-${padMonth}-${String(days).padStart(2, "0")}`,
      label: `${monthNames[prevMonth - 1]} ${prevYear}`,
      year: prevYear,
      month: prevMonth,
      previousPeriod: {
        startDate: `${pprevYear}-${padPprevMonth}-01`,
        endDate: `${pprevYear}-${padPprevMonth}-${String(pprevDays).padStart(2, "0")}`,
        label: `${monthNames[pprevMonth - 1]} ${pprevYear}`,
      },
    };
  }

  // 4. Last 30 days
  if (options.period === "last_30_days") {
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const start = new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000);
    const prevEnd = new Date(start.getTime() - 24 * 60 * 60 * 1000);
    const prevStart = new Date(prevEnd.getTime() - 29 * 24 * 60 * 60 * 1000);

    return {
      type: "last_30_days",
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      label: "Last 30 Days",
      year: currentYear,
      month: currentMonth,
      previousPeriod: {
        startDate: prevStart.toISOString().slice(0, 10),
        endDate: prevEnd.toISOString().slice(0, 10),
        label: "Prior 30 Days",
      },
    };
  }

  // 5. Default: Current month
  const days = getDaysInMonth(currentYear, currentMonth);
  const padMonth = String(currentMonth).padStart(2, "0");

  const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;
  const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
  const prevDays = getDaysInMonth(prevYear, prevMonth);
  const padPrevMonth = String(prevMonth).padStart(2, "0");

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  return {
    type: "current_month",
    startDate: `${currentYear}-${padMonth}-01`,
    endDate: `${currentYear}-${padMonth}-${String(days).padStart(2, "0")}`,
    label: `${monthNames[currentMonth - 1]} ${currentYear}`,
    year: currentYear,
    month: currentMonth,
    previousPeriod: {
      startDate: `${prevYear}-${padPrevMonth}-01`,
      endDate: `${prevYear}-${padPrevMonth}-${String(prevDays).padStart(2, "0")}`,
      label: `${monthNames[prevMonth - 1]} ${prevYear}`,
    },
  };
};

/**
 * Total Spending Engine
 */
const computeTotalSpending = async (userId, period) => {
  const [rows] = await analyticsDb.execute(
    `SELECT COALESCE(SUM(amount), 0) AS total_spending,
            COUNT(*) AS transaction_count
       FROM transactions
      WHERE user_id = ?
        AND type = 'expense'
        AND DATE(transaction_date) >= ?
        AND DATE(transaction_date) <= ?`,
    [userId, period.startDate, period.endDate]
  );

  const row = rows[0] || {};
  return {
    totalSpending: Number(row.total_spending || 0),
    transactionCount: Number(row.transaction_count || 0),
  };
};

/**
 * Spending By Category Engine
 */
const computeSpendingByCategory = async (userId, period) => {
  const [rows] = await analyticsDb.execute(
    `SELECT c.id, c.name,
            COALESCE(SUM(t.amount), 0) AS total,
            COUNT(t.id) AS count
       FROM transactions t
       JOIN categories c ON c.id = t.category_id
      WHERE t.user_id = ?
        AND t.type = 'expense'
        AND DATE(t.transaction_date) >= ?
        AND DATE(t.transaction_date) <= ?
      GROUP BY c.id, c.name
      ORDER BY total DESC, c.name ASC`,
    [userId, period.startDate, period.endDate]
  );

  let grandTotal = 0;
  let totalTransactions = 0;
  for (const r of rows) {
    grandTotal += Number(r.total);
    totalTransactions += Number(r.count);
  }

  const categories = rows.map((r) => {
    const total = Number(r.total);
    const percentage = grandTotal > 0 ? ((total / grandTotal) * 100).toFixed(1) : "0.0";
    return {
      id: r.id,
      name: r.name,
      total,
      count: Number(r.count),
      percentage,
    };
  });

  return {
    totalSpending: grandTotal,
    transactionCount: totalTransactions,
    categories,
  };
};

const calculatePercentChange = (current, previous) => {
  if (previous === 0) {
    if (current === 0) return { changePercent: "0.0", direction: "unchanged" };
    return { changePercent: "+100.0", direction: "increased" };
  }
  const diff = current - previous;
  if (diff === 0) return { changePercent: "0.0", direction: "unchanged" };

  const pct = Math.abs((diff / previous) * 100).toFixed(1);
  return {
    changePercent: pct,
    direction: diff > 0 ? "increased" : "decreased",
  };
};

/**
 * Spending Trend Engine
 */
const computeSpendingTrend = async (userId, period) => {
  const [currentMetrics, prevMetrics] = await Promise.all([
    computeTotalSpending(userId, period),
    computeTotalSpending(userId, period.previousPeriod),
  ]);

  const { changePercent, direction } = calculatePercentChange(
    currentMetrics.totalSpending,
    prevMetrics.totalSpending
  );

  return {
    currentSpending: currentMetrics.totalSpending,
    previousSpending: prevMetrics.totalSpending,
    transactionCount: currentMetrics.transactionCount,
    percentChange: changePercent,
    direction,
    previousPeriod: period.previousPeriod,
  };
};

/**
 * Budget Status Engine (Overall & Category-Specific)
 */
const computeBudgetStatus = async (userId, period, options = {}) => {
  const [budgetRows] = await analyticsDb.execute(
    `SELECT b.id, b.category_id, b.amount AS budget_limit, c.name AS category_name
       FROM budgets b
       JOIN categories c ON c.id = b.category_id
      WHERE b.user_id = ?
        AND b.month = ?
        AND b.year = ?
      ORDER BY b.id ASC`,
    [userId, period.month, period.year]
  );

  let totalBudget = 0;
  let totalSpent = 0;
  let totalTransactions = 0;
  let exceededCount = 0;
  let warningCount = 0;

  const budgetItems = [];

  for (const b of budgetRows) {
    const [spentRows] = await analyticsDb.execute(
      `SELECT COALESCE(SUM(amount), 0) AS spent,
              COUNT(*) AS count
         FROM transactions
        WHERE user_id = ?
          AND category_id = ?
          AND type = 'expense'
          AND DATE(transaction_date) >= ?
          AND DATE(transaction_date) <= ?`,
      [userId, b.category_id, period.startDate, period.endDate]
    );

    const spent = Number(spentRows[0]?.spent || 0);
    const count = Number(spentRows[0]?.count || 0);
    const limit = Number(b.budget_limit);

    totalBudget += limit;
    totalSpent += spent;
    totalTransactions += count;

    const remaining = Math.max(0, limit - spent);
    const percentage = limit > 0 ? ((spent / limit) * 100).toFixed(1) : "0.0";

    let status = "on_track";
    if (spent > limit) {
      status = "exceeded";
      exceededCount++;
    } else if (limit > 0 && spent / limit >= 0.8) {
      status = "approaching_limit";
      warningCount++;
    }

    budgetItems.push({
      budgetId: b.id,
      categoryId: b.category_id,
      categoryName: b.category_name,
      budgetLimit: limit,
      spent,
      remaining,
      percentage,
      status,
    });
  }

  const overallPercentage = totalBudget > 0 ? ((totalSpent / totalBudget) * 100).toFixed(1) : "0.0";

  let categoryBudget = null;
  if (options.category) {
    const target = options.category.toLowerCase().trim();
    categoryBudget =
      budgetItems.find((item) => {
        const catLower = item.categoryName.toLowerCase();
        return catLower === target || catLower.includes(target) || target.includes(catLower);
      }) || null;
  }

  return {
    totalBudgets: budgetRows.length,
    totalBudget,
    totalSpent,
    overallPercentage,
    transactionCount: totalTransactions,
    exceededCount,
    warningCount,
    items: budgetItems,
    categoryBudget,
    requestedCategory: options.category || null,
  };
};

/**
 * Category Spending Comparison Engine (Month-over-Month & Breakdown by Category)
 */
const computeCategoryComparison = async (userId, period, options = {}) => {
  const [curByCat, prevByCat] = await Promise.all([
    computeSpendingByCategory(userId, period),
    computeSpendingByCategory(userId, period.previousPeriod),
  ]);

  const currentRows = curByCat.categories;
  const prevRows = prevByCat.categories;

  const prevMap = new Map();
  for (const r of prevRows) {
    prevMap.set(r.name, {
      id: r.id,
      total: Number(r.total),
      count: Number(r.count),
    });
  }

  const allCategoryNames = new Set([
    ...currentRows.map((r) => r.name),
    ...prevRows.map((r) => r.name),
  ]);

  let totalCurrentSpending = 0;
  let totalPrevSpending = 0;
  let totalTransactions = 0;

  const comparisonCategories = [];

  for (const name of allCategoryNames) {
    const cur = currentRows.find((r) => r.name === name);
    const prev = prevMap.get(name);

    const curTotal = cur ? Number(cur.total) : 0;
    const prevTotal = prev ? prev.total : 0;
    const curCount = cur ? Number(cur.count) : 0;

    totalCurrentSpending += curTotal;
    totalPrevSpending += prevTotal;
    totalTransactions += curCount;

    const diff = curTotal - prevTotal;
    const { changePercent, direction } = calculatePercentChange(curTotal, prevTotal);

    comparisonCategories.push({
      id: cur ? cur.id : prev ? prev.id : 0,
      name,
      currentTotal: curTotal,
      previousTotal: prevTotal,
      difference: diff,
      percentChange: changePercent,
      direction,
      currentCount: curCount,
      previousCount: prev ? prev.count : 0,
    });
  }

  // Sort by difference descending (largest increase first)
  comparisonCategories.sort((a, b) => b.difference - a.difference);

  const largestIncrease = comparisonCategories.length > 0 ? comparisonCategories[0] : null;
  const largestDecrease =
    comparisonCategories.length > 0
      ? [...comparisonCategories].sort((a, b) => a.difference - b.difference)[0]
      : null;

  let targetCategoryComparison = null;
  if (options.category) {
    const target = options.category.toLowerCase().trim();
    targetCategoryComparison =
      comparisonCategories.find((c) => {
        const catLower = c.name.toLowerCase();
        return catLower === target || catLower.includes(target) || target.includes(catLower);
      }) || null;
  }

  return {
    categories: comparisonCategories,
    totalCurrentSpending,
    totalPrevSpending,
    totalDifference: totalCurrentSpending - totalPrevSpending,
    transactionCount: totalTransactions,
    largestIncrease,
    largestDecrease,
    targetCategoryComparison,
    previousPeriodLabel: period.previousPeriod.label,
    currentPeriodLabel: period.label,
  };
};

/**
 * Remaining Allowance Engine
 */
const computeRemainingAllowance = async (userId, period, options = {}) => {
  const [budgetStatus, incExp] = await Promise.all([
    computeBudgetStatus(userId, period, options),
    computeIncomeVsExpense(userId, period),
  ]);

  const remainingBudgetAllowance = Math.max(0, budgetStatus.totalBudget - budgetStatus.totalSpent);
  const discretionaryCashFlow = Math.max(0, incExp.totalIncome - incExp.totalExpense);

  return {
    totalBudgets: budgetStatus.totalBudgets,
    totalBudget: budgetStatus.totalBudget,
    totalSpent: budgetStatus.totalSpent,
    remainingBudgetAllowance,
    totalIncome: incExp.totalIncome,
    totalExpense: incExp.totalExpense,
    discretionaryCashFlow,
    categoryBudget: budgetStatus.categoryBudget,
    requestedCategory: options.category || null,
    transactionCount: budgetStatus.transactionCount,
  };
};

/**
 * Unusual Spending Indicators Engine
 */
const computeUnusualSpending = async (userId, period) => {
  const [comp, largest, totalSpending, budgetStatus] = await Promise.all([
    computeCategoryComparison(userId, period),
    computeLargestExpenses(userId, period),
    computeTotalSpending(userId, period),
    computeBudgetStatus(userId, period),
  ]);

  const indicators = [];

  // Rule 1: Category spending surge (> 50% increase AND increase >= ₹1,000)
  for (const cat of comp.categories) {
    if (cat.difference >= 1000 && cat.previousTotal > 0 && (cat.difference / cat.previousTotal) >= 0.5) {
      indicators.push({
        type: "category_spike",
        severity: "warning",
        title: `${cat.name} Spending Surge`,
        description: `${cat.name} spending increased by ${cat.percentChange}% (+₹${cat.difference.toLocaleString("en-IN")}) compared to ${period.previousPeriod.label}`,
        amount: cat.difference,
        category: cat.name,
      });
    }
  }

  // Rule 2: Exceptionally large single transactions (>= 2.5x avg transaction amount and >= ₹1,000)
  const avgTx =
    totalSpending.transactionCount > 0
      ? totalSpending.totalSpending / totalSpending.transactionCount
      : 0;

  if (avgTx > 0) {
    for (const tx of largest.largestExpenses) {
      if (tx.amount >= 2.5 * avgTx && tx.amount >= 1000) {
        indicators.push({
          type: "large_transaction",
          severity: "notice",
          title: `Large Expense: ${tx.title}`,
          description: `Single expense of ₹${tx.amount.toLocaleString("en-IN")} on ${tx.date} (${tx.category}) is ${(tx.amount / avgTx).toFixed(1)}x your average transaction (₹${Math.round(avgTx).toLocaleString("en-IN")})`,
          amount: tx.amount,
          category: tx.category,
        });
      }
    }
  }

  // Rule 3: Budget overrun indicator
  for (const b of budgetStatus.items) {
    if (b.status === "exceeded") {
      const overrun = b.spent - b.budgetLimit;
      indicators.push({
        type: "budget_exceeded",
        severity: "warning",
        title: `${b.categoryName} Budget Exceeded`,
        description: `${b.categoryName} has exceeded its budget limit by ₹${overrun.toLocaleString("en-IN")} (${b.percentage}% utilized)`,
        amount: overrun,
        category: b.categoryName,
      });
    }
  }

  return {
    indicators,
    totalIndicators: indicators.length,
    transactionCount: totalSpending.transactionCount,
    averageTransactionAmount: avgTx,
  };
};

/**
 * Explainable Savings Opportunities Engine
 */
const computeSavingsOpportunities = async (userId, period) => {
  const [budgetStatus, comp, incExp] = await Promise.all([
    computeBudgetStatus(userId, period),
    computeCategoryComparison(userId, period),
    computeIncomeVsExpense(userId, period),
  ]);

  const opportunities = [];
  let totalPotentialSavings = 0;

  // Opportunity 1: Over-budget categories
  for (const b of budgetStatus.items) {
    if (b.status === "exceeded") {
      const overrun = b.spent - b.budgetLimit;
      totalPotentialSavings += overrun;
      opportunities.push({
        type: "budget_overrun",
        category: b.categoryName,
        potentialSavings: overrun,
        reason: `Exceeded ${b.categoryName} budget by ₹${overrun.toLocaleString("en-IN")}. Aligning spending to the ₹${b.budgetLimit.toLocaleString("en-IN")} limit would save ₹${overrun.toLocaleString("en-IN")}.`,
      });
    }
  }

  // Opportunity 2: Discretionary categories with surges
  const discretionaryKeywords = ["entertainment", "dining", "shopping", "food", "travel", "recreation"];
  for (const cat of comp.categories) {
    const isDiscretionary = discretionaryKeywords.some((k) => cat.name.toLowerCase().includes(k));
    if (isDiscretionary && cat.difference >= 1000 && !opportunities.some((o) => o.category === cat.name)) {
      const trimAmount = Math.round(cat.difference * 0.5);
      totalPotentialSavings += trimAmount;
      opportunities.push({
        type: "discretionary_reduction",
        category: cat.name,
        potentialSavings: trimAmount,
        reason: `${cat.name} spending grew by ₹${cat.difference.toLocaleString("en-IN")} (+${cat.percentChange}%) this period. Trimming half this increase could save ₹${trimAmount.toLocaleString("en-IN")}.`,
      });
    }
  }

  return {
    opportunities,
    totalPotentialSavings,
    savingsRate: incExp.savingsRate,
    netSavings: incExp.netSavings,
    transactionCount: incExp.transactionCount,
  };
};

/**
 * Income vs Expense Engine
 */
const computeIncomeVsExpense = async (userId, period) => {
  const [rows] = await analyticsDb.execute(
    `SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS total_income,
            COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS total_expense,
            COUNT(*) AS transaction_count
       FROM transactions
      WHERE user_id = ?
        AND DATE(transaction_date) >= ?
        AND DATE(transaction_date) <= ?`,
    [userId, period.startDate, period.endDate]
  );

  const row = rows[0] || {};
  const totalIncome = Number(row.total_income || 0);
  const totalExpense = Number(row.total_expense || 0);
  const netSavings = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? ((netSavings / totalIncome) * 100).toFixed(1) : "0.0";

  return {
    totalIncome,
    totalExpense,
    netSavings,
    savingsRate,
    transactionCount: Number(row.transaction_count || 0),
  };
};

/**
 * Largest Expenses Engine
 */
const computeLargestExpenses = async (userId, period) => {
  const [rows] = await analyticsDb.execute(
    `SELECT t.id, t.title, t.amount, t.transaction_date,
            c.name AS category_name
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.user_id = ?
        AND t.type = 'expense'
        AND DATE(t.transaction_date) >= ?
        AND DATE(t.transaction_date) <= ?
      ORDER BY t.amount DESC, t.transaction_date DESC, t.id DESC
      LIMIT 5`,
    [userId, period.startDate, period.endDate]
  );

  const [countRows] = await analyticsDb.execute(
    `SELECT COUNT(*) AS total_count
       FROM transactions
      WHERE user_id = ?
        AND type = 'expense'
        AND DATE(transaction_date) >= ?
        AND DATE(transaction_date) <= ?`,
    [userId, period.startDate, period.endDate]
  );

  let topExpensesTotal = 0;
  const largestExpenses = rows.map((r) => {
    const amt = Number(r.amount);
    topExpensesTotal += amt;
    return {
      id: r.id,
      title: r.title,
      amount: amt,
      date: r.transaction_date instanceof Date ? r.transaction_date.toISOString().slice(0, 10) : String(r.transaction_date).slice(0, 10),
      category: r.category_name || "Uncategorized",
    };
  });

  return {
    largestExpenses,
    topExpensesTotal,
    transactionCount: Number(countRows[0]?.total_count || 0),
  };
};

/**
 * Deterministic Financial Insights Engine
 */
const computeDeterministicInsights = async (userId, period) => {
  const [incExp, byCat, trend, budgets, largest] = await Promise.all([
    computeIncomeVsExpense(userId, period),
    computeSpendingByCategory(userId, period),
    computeSpendingTrend(userId, period),
    computeBudgetStatus(userId, period),
    computeLargestExpenses(userId, period),
  ]);

  const insights = [];

  // 1. Highest category observation
  if (byCat.categories.length > 0) {
    const top = byCat.categories[0];
    insights.push({
      type: "highest_category",
      title: "Top Spending Category",
      message: `Highest spending was in ${top.name} at ₹${top.total.toLocaleString("en-IN")} (${top.percentage}% of expenses).`,
    });
  }

  // 2. Spending trend observation
  if (trend.direction !== "unchanged" && trend.percentChange !== "0.0") {
    insights.push({
      type: "spending_trend",
      title: "Period Spending Trend",
      message: `Expenses ${trend.direction} by ${trend.percentChange}% compared to ${period.previousPeriod.label}.`,
    });
  }

  // 3. Cash flow / Savings rate observation
  if (incExp.totalIncome > 0) {
    insights.push({
      type: "savings_rate",
      title: "Savings Rate",
      message: `Net savings for ${period.label} is ₹${incExp.netSavings.toLocaleString("en-IN")} (savings rate: ${incExp.savingsRate}%).`,
    });
  } else if (incExp.totalExpense > 0) {
    insights.push({
      type: "cash_flow",
      title: "Expense Cash Flow",
      message: `Total expenses recorded at ₹${incExp.totalExpense.toLocaleString("en-IN")} with no income recorded.`,
    });
  }

  // 4. Budget status observation
  if (budgets.exceededCount > 0) {
    insights.push({
      type: "budget_exceeded",
      title: "Budget Alert",
      message: `${budgets.exceededCount} of your budgets have exceeded their allocated limit this period.`,
    });
  } else if (budgets.warningCount > 0) {
    insights.push({
      type: "budget_warning",
      title: "Budget Notice",
      message: `${budgets.warningCount} budget${budgets.warningCount === 1 ? " is" : "s are"} approaching limit (above 80% utilized).`,
    });
  }

  // 5. Largest expense observation
  if (largest.largestExpenses.length > 0) {
    const topTx = largest.largestExpenses[0];
    insights.push({
      type: "largest_expense",
      title: "Largest Single Expense",
      message: `Single largest expense was ₹${topTx.amount.toLocaleString("en-IN")} for "${topTx.title}" on ${topTx.date}.`,
    });
  }

  return {
    totalIncome: incExp.totalIncome,
    totalExpense: incExp.totalExpense,
    netSavings: incExp.netSavings,
    savingsRate: incExp.savingsRate,
    transactionCount: incExp.transactionCount,
    insights,
  };
};

/**
 * Main query dispatcher for Phase 5B Assistant & Analytics.
 */
export const executeAnalyticsQuery = async (userId, parsedQuery) => {
  // If query was refused or classified as unsupported by parser, return safe formatted refusal
  if (parsedQuery.isRefusal || parsedQuery.intent === "unsupported") {
    return formatTemplateResponse({
      intent: parsedQuery.intent,
      isRefusal: parsedQuery.isRefusal,
      refusalReason: parsedQuery.refusalReason,
      refusalMessage: parsedQuery.refusalMessage,
      question: parsedQuery.question,
      confidence: parsedQuery.confidence,
      suggestions: parsedQuery.suggestions,
      conversationContext: parsedQuery.conversationContext,
    });
  }

  // If clarification is requested for ambiguous input
  if (parsedQuery.intent === "clarification_needed") {
    return formatTemplateResponse({
      intent: "clarification_needed",
      isRefusal: false,
      confidence: "low",
      question: parsedQuery.question,
      category: parsedQuery.category,
      clarificationOptions: parsedQuery.clarificationOptions,
      suggestions: parsedQuery.suggestions,
      conversationContext: parsedQuery.conversationContext,
    });
  }

  const period = resolveAnalyticsPeriod({
    period: parsedQuery.period,
    startDate: parsedQuery.startDate,
    endDate: parsedQuery.endDate,
    month: parsedQuery.month,
  });

  let metrics;

  switch (parsedQuery.intent) {
    case "total_spending":
      metrics = await computeTotalSpending(userId, period);
      break;

    case "spending_by_category":
      metrics = await computeSpendingByCategory(userId, period);
      break;

    case "spending_trend":
      metrics = await computeSpendingTrend(userId, period);
      break;

    case "budget_status":
      metrics = await computeBudgetStatus(userId, period, { category: parsedQuery.category });
      break;

    case "income_vs_expense":
      metrics = await computeIncomeVsExpense(userId, period);
      break;

    case "largest_expenses":
      metrics = await computeLargestExpenses(userId, period);
      break;

    case "overview_insights":
      metrics = await computeDeterministicInsights(userId, period);
      break;

    case "category_comparison":
      metrics = await computeCategoryComparison(userId, period, {
        category: parsedQuery.category,
        comparisonType: parsedQuery.comparisonType,
      });
      break;

    case "remaining_allowance":
      metrics = await computeRemainingAllowance(userId, period, { category: parsedQuery.category });
      break;

    case "unusual_spending":
      metrics = await computeUnusualSpending(userId, period);
      break;

    case "savings_opportunities":
      metrics = await computeSavingsOpportunities(userId, period);
      break;

    default:
      throw new AppError("Unsupported intent", 400);
  }

  return formatTemplateResponse({
    intent: parsedQuery.intent,
    period,
    metrics,
    question: parsedQuery.question,
    confidence: parsedQuery.confidence || "high",
    category: parsedQuery.category,
    comparisonType: parsedQuery.comparisonType,
    conversationContext: parsedQuery.conversationContext,
    suggestions: parsedQuery.suggestions,
  });
};

/**
 * Direct insights retrieval for dashboard or insights views.
 */
export const getDeterministicInsights = async (userId, options = {}) => {
  const period = resolveAnalyticsPeriod(options);
  const data = await computeDeterministicInsights(userId, period);
  return {
    period: {
      startDate: period.startDate,
      endDate: period.endDate,
      label: period.label,
    },
    ...data,
  };
};
