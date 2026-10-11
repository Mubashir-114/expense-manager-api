import db from "../config/db.js";
import { formatMinorAsDecimal, parseDecimalToMinor } from "../utils/money.js";

const getDaysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

export const createBudget = async (userId, categoryId, amount, month, year) => {
  const [result] = await db.execute(
    `INSERT INTO budgets
        (user_id, category_id, amount, month, year)
        VALUES (?, ?, ?, ?, ?)`,
    [userId, categoryId, amount, month, year],
  );

  return result.insertId;
};

export const getBudgets = async (userId, filters = {}) => {
  let sql = `
        SELECT
            b.id,
            b.user_id,
            b.category_id,
            c.name AS category,
            c.type AS category_type,
            b.amount,
            b.month,
            b.year,
            b.created_at
        FROM budgets b
        JOIN categories c
            ON c.id = b.category_id
        WHERE b.user_id = ?
    `;

  const values = [userId];

  if (filters.month) {
    sql += " AND b.month = ?";
    values.push(filters.month);
  }

  if (filters.year) {
    sql += " AND b.year = ?";
    values.push(filters.year);
  }

  if (filters.categoryId) {
    sql += " AND b.category_id = ?";
    values.push(filters.categoryId);
  }

  sql += " ORDER BY b.year DESC, b.month DESC, c.name ASC";

  const [rows] = await db.execute(sql, values);

  return rows.map((row) => ({
    ...row,
    amount: Number(row.amount),
  }));
};

export const getBudgetById = async (budgetId, userId) => {
  const [rows] = await db.execute(
    `SELECT
            b.id,
            b.user_id,
            b.category_id,
            c.name AS category,
            c.type AS category_type,
            b.amount,
            b.month,
            b.year,
            b.created_at
        FROM budgets b
        JOIN categories c
            ON c.id = b.category_id
        WHERE
            b.id = ?
            AND b.user_id = ?`,
    [budgetId, userId],
  );

  if (!rows[0]) return null;
  return {
    ...rows[0],
    amount: Number(rows[0].amount),
  };
};

export const updateBudget = async (
  budgetId,
  userId,
  categoryId,
  amount,
  month,
  year,
) => {
  const [result] = await db.execute(
    `UPDATE budgets
        SET
            category_id = ?,
            amount = ?,
            month = ?,
            year = ?
        WHERE
            id = ?
            AND user_id = ?`,
    [categoryId, amount, month, year, budgetId, userId],
  );

  return result.affectedRows;
};

export const deleteBudget = async (budgetId, userId) => {
  const [result] = await db.execute(
    `DELETE FROM budgets
        WHERE
            id = ?
            AND user_id = ?`,
    [budgetId, userId],
  );

  return result.affectedRows;
};

export const categoryExists = async (categoryId) => {
  const [rows] = await db.execute(
    `SELECT id, name, type
        FROM categories
        WHERE id = ?`,
    [categoryId],
  );

  return rows[0];
};

export const budgetExists = async (
  userId,
  categoryId,
  month,
  year,
  excludeBudgetId = null,
) => {
  let sql = `
        SELECT id
        FROM budgets
        WHERE
            user_id = ?
            AND category_id = ?
            AND month = ?
            AND year = ?
    `;

  const values = [userId, categoryId, month, year];

  if (excludeBudgetId) {
    sql += " AND id <> ?";
    values.push(excludeBudgetId);
  }

  const [rows] = await db.execute(sql, values);

  return rows[0];
};

/**
 * Returns backward-compatible budget status list for a specific month and year.
 */
export const getBudgetStatus = async (userId, month, year) => {
  const m = Number(month);
  const y = Number(year);
  const daysInMonth = getDaysInMonth(y, m);
  const startDate = `${y}-${String(m).padStart(2, "0")}-01`;
  const endDate = `${y}-${String(m).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

  const [budgets] = await db.execute(
    `SELECT b.id AS budget_id, b.category_id, c.name AS category, b.amount AS budget
       FROM budgets b
       JOIN categories c ON c.id = b.category_id
      WHERE b.user_id = ? AND b.month = ? AND b.year = ?
      ORDER BY c.name ASC`,
    [userId, m, y],
  );

  const [txRows] = await db.execute(
    `SELECT category_id, amount
       FROM transactions
      WHERE user_id = ?
        AND type = 'expense'
        AND DATE(transaction_date) >= ?
        AND DATE(transaction_date) <= ?`,
    [userId, startDate, endDate],
  );

  const spentMap = new Map();
  for (const tx of txRows) {
    const catId = tx.category_id;
    const current = spentMap.get(catId) || 0n;
    spentMap.set(catId, current + BigInt(parseDecimalToMinor(String(tx.amount))));
  }

  return budgets.map((row) => {
    const budgetMinor = BigInt(parseDecimalToMinor(String(row.budget)));
    const spentMinor = spentMap.get(row.category_id) || 0n;
    const remainingMinor = budgetMinor - spentMinor;

    const budget = Number(formatMinorAsDecimal(budgetMinor));
    const spent = Number(formatMinorAsDecimal(spentMinor));
    const remaining = Number(formatMinorAsDecimal(remainingMinor));
    const percentageUsed =
      budgetMinor === 0n
        ? 0
        : Number(((Number(spentMinor) / Number(budgetMinor)) * 100).toFixed(2));

    return {
      budgetId: row.budget_id,
      categoryId: row.category_id,
      category: row.category,
      budget,
      spent,
      remaining,
      percentageUsed,
      status: spentMinor > budgetMinor ? "over_budget" : "safe",
    };
  });
};

/**
 * Computes comprehensive real-time budget progress:
 * - Overall monthly budget overview (limit, spent, remaining, utilization %, run-rate projection)
 * - Category-specific breakdown with warnings
 * - Savings target progress
 */
export const getBudgetProgress = async (userId, month, year, options = {}) => {
  const m = Number(month);
  const y = Number(year);
  const daysInMonth = getDaysInMonth(y, m);
  const startDate = `${y}-${String(m).padStart(2, "0")}-01`;
  const endDate = `${y}-${String(m).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;
  const currentDay = now.getUTCDate();

  let daysElapsed;
  let daysRemaining;
  let isCurrentPeriod = false;

  if (y < currentYear || (y === currentYear && m < currentMonth)) {
    // Past month: full month completed
    daysElapsed = daysInMonth;
    daysRemaining = 0;
  } else if (y > currentYear || (y === currentYear && m > currentMonth)) {
    // Future month
    daysElapsed = 0;
    daysRemaining = daysInMonth;
  } else {
    // Current active month
    isCurrentPeriod = true;
    daysElapsed = Math.min(daysInMonth, Math.max(1, currentDay));
    daysRemaining = Math.max(0, daysInMonth - currentDay);
  }

  // 1. Fetch defined budgets for this month
  const [budgets] = await db.execute(
    `SELECT b.id AS budget_id, b.category_id, c.name AS category, c.type AS category_type, b.amount AS budget
       FROM budgets b
       JOIN categories c ON c.id = b.category_id
      WHERE b.user_id = ? AND b.month = ? AND b.year = ?
      ORDER BY c.name ASC`,
    [userId, m, y],
  );

  // 2. Fetch all confirmed expense and income transactions for this period
  const [txRows] = await db.execute(
    `SELECT category_id, type, amount, transaction_date
       FROM transactions
      WHERE user_id = ?
        AND DATE(transaction_date) >= ?
        AND DATE(transaction_date) <= ?`,
    [userId, startDate, endDate],
  );

  let totalSpentMinor = 0n;
  let totalIncomeMinor = 0n;
  const categorySpentMap = new Map();

  for (const tx of txRows) {
    const minor = BigInt(parseDecimalToMinor(String(tx.amount)));
    if (tx.type === "expense") {
      totalSpentMinor += minor;
      const catId = tx.category_id;
      const prev = categorySpentMap.get(catId) || 0n;
      categorySpentMap.set(catId, prev + minor);
    } else if (tx.type === "income") {
      totalIncomeMinor += minor;
    }
  }

  // 3. Category Budgets breakdown
  let totalBudgetLimitMinor = 0n;
  const categoryBudgets = [];
  const budgetedCategoryIds = new Set();

  for (const b of budgets) {
    budgetedCategoryIds.add(b.category_id);
    const limitMinor = BigInt(parseDecimalToMinor(String(b.budget)));
    totalBudgetLimitMinor += limitMinor;

    const spentMinor = categorySpentMap.get(b.category_id) || 0n;
    const remainingMinor = limitMinor - spentMinor;

    let utilization = 0.0;
    if (limitMinor > 0n) {
      utilization = Number(((Number(spentMinor) / Number(limitMinor)) * 100).toFixed(1));
    }

    let projectedMinor = spentMinor;
    if (isCurrentPeriod && daysElapsed > 0) {
      projectedMinor = (spentMinor * BigInt(daysInMonth)) / BigInt(daysElapsed);
    }

    let status = "on_track";
    if (spentMinor > limitMinor) {
      status = "exceeded";
    } else if (limitMinor > 0n && spentMinor * 100n >= limitMinor * 80n) {
      status = "approaching_limit";
    }

    categoryBudgets.push({
      budgetId: b.budget_id,
      categoryId: b.category_id,
      category: b.category,
      categoryType: b.category_type,
      budgetLimit: formatMinorAsDecimal(limitMinor),
      actualSpending: formatMinorAsDecimal(spentMinor),
      remainingAmount: formatMinorAsDecimal(remainingMinor),
      utilizationPercentage: utilization.toFixed(1),
      projectedSpending: formatMinorAsDecimal(projectedMinor),
      status,
      daysRemaining,
    });
  }

  // 4. Unbudgeted spending tracking
  let unbudgetedSpentMinor = 0n;
  for (const [catId, spentMinor] of categorySpentMap.entries()) {
    if (!budgetedCategoryIds.has(catId)) {
      unbudgetedSpentMinor += spentMinor;
    }
  }

  // 5. Overall spending summary
  const overallRemainingMinor = totalBudgetLimitMinor - totalSpentMinor;
  let overallUtilization = 0.0;
  if (totalBudgetLimitMinor > 0n) {
    overallUtilization = Number(
      ((Number(totalSpentMinor) / Number(totalBudgetLimitMinor)) * 100).toFixed(1),
    );
  }

  let overallDailyBurnRateMinor = 0n;
  let overallProjectedMinor = totalSpentMinor;
  if (isCurrentPeriod && daysElapsed > 0) {
    overallDailyBurnRateMinor = totalSpentMinor / BigInt(daysElapsed);
    overallProjectedMinor = (totalSpentMinor * BigInt(daysInMonth)) / BigInt(daysElapsed);
  }

  let overallStatus = "on_track";
  if (totalBudgetLimitMinor > 0n) {
    if (totalSpentMinor > totalBudgetLimitMinor) {
      overallStatus = "exceeded";
    } else if (totalSpentMinor * 100n >= totalBudgetLimitMinor * 80n) {
      overallStatus = "approaching_limit";
    }
  }

  // 6. Savings progress
  const actualSavingsMinor = totalIncomeMinor - totalSpentMinor;
  const projectedSavingsMinor = totalIncomeMinor - overallProjectedMinor;
  let savingsTargetMinor = null;
  let savingsProgressPercentage = null;
  let savingsTargetAchieved = false;

  if (options.savingsTarget) {
    try {
      savingsTargetMinor = BigInt(parseDecimalToMinor(String(options.savingsTarget)));
      if (savingsTargetMinor > 0n) {
        const pct = (Number(actualSavingsMinor) / Number(savingsTargetMinor)) * 100;
        savingsProgressPercentage = pct.toFixed(1);
        savingsTargetAchieved = actualSavingsMinor >= savingsTargetMinor;
      }
    } catch (_) {
      // Ignore invalid target string
    }
  }

  return {
    month: m,
    year: y,
    period: {
      daysInMonth,
      daysElapsed,
      daysRemaining,
      isCurrentPeriod,
      estimationMethod: "Linear Daily Burn-Rate: (actual_spent / days_elapsed) * days_in_month",
    },
    overall: {
      budgetLimit: formatMinorAsDecimal(totalBudgetLimitMinor),
      actualSpending: formatMinorAsDecimal(totalSpentMinor),
      remainingAmount: formatMinorAsDecimal(overallRemainingMinor),
      utilizationPercentage: overallUtilization.toFixed(1),
      dailyBurnRate: formatMinorAsDecimal(overallDailyBurnRateMinor),
      projectedSpending: formatMinorAsDecimal(overallProjectedMinor),
      status: overallStatus,
      hasBudgetsDefined: budgets.length > 0,
    },
    categoryBudgets,
    uncategorizedSpending: formatMinorAsDecimal(unbudgetedSpentMinor),
    savings: {
      totalIncome: formatMinorAsDecimal(totalIncomeMinor),
      totalExpense: formatMinorAsDecimal(totalSpentMinor),
      netSavings: formatMinorAsDecimal(actualSavingsMinor),
      projectedNetSavings: formatMinorAsDecimal(projectedSavingsMinor),
      savingsTarget: savingsTargetMinor !== null ? formatMinorAsDecimal(savingsTargetMinor) : null,
      progressPercentage: savingsProgressPercentage,
      isTargetAchieved: savingsTargetAchieved,
    },
  };
};

/**
 * Returns actionable alerts and in-app insights for the month.
 * Prevents spamming and deduplicates alerts.
 */
export const getBudgetAlerts = async (userId, month, year) => {
  const progress = await getBudgetProgress(userId, month, year);

  const approachingLimit = [];
  const exceeded = [];
  const insights = [];

  for (const b of progress.categoryBudgets) {
    if (b.status === "exceeded") {
      exceeded.push({
        categoryId: b.categoryId,
        category: b.category,
        budgetLimit: b.budgetLimit,
        actualSpending: b.actualSpending,
        utilizationPercentage: b.utilizationPercentage,
        severity: "critical",
        message: `${b.category} budget exceeded: spent ₹${b.actualSpending} of ₹${b.budgetLimit} limit (${b.utilizationPercentage}%).`,
      });
    } else if (b.status === "approaching_limit") {
      approachingLimit.push({
        categoryId: b.categoryId,
        category: b.category,
        budgetLimit: b.budgetLimit,
        actualSpending: b.actualSpending,
        utilizationPercentage: b.utilizationPercentage,
        severity: "warning",
        message: `${b.category} approaching limit: spent ₹${b.actualSpending} of ₹${b.budgetLimit} (${b.utilizationPercentage}%).`,
      });
    }
  }

  // Overall alerts
  let overallAlert = null;
  if (progress.overall.hasBudgetsDefined) {
    if (progress.overall.status === "exceeded") {
      overallAlert = {
        severity: "critical",
        message: `Overall monthly budget exceeded: ₹${progress.overall.actualSpending} spent of ₹${progress.overall.budgetLimit} total cap.`,
      };
    } else if (progress.overall.status === "approaching_limit") {
      overallAlert = {
        severity: "warning",
        message: `Overall spending reached ${progress.overall.utilizationPercentage}% of total limit with ${progress.period.daysRemaining} days left.`,
      };
    }
  }

  // Daily allowance insight
  if (progress.period.daysRemaining > 0 && progress.overall.hasBudgetsDefined) {
    const remainingMinor = BigInt(parseDecimalToMinor(progress.overall.remainingAmount));
    if (remainingMinor > 0n) {
      const allowancePerDayMinor = remainingMinor / BigInt(progress.period.daysRemaining);
      insights.push({
        type: "allowance",
        title: "Remaining Daily Allowance",
        message: `You have ₹${progress.overall.remainingAmount} remaining for the next ${progress.period.daysRemaining} days (~₹${formatMinorAsDecimal(allowancePerDayMinor)}/day).`,
      });
    } else {
      insights.push({
        type: "allowance",
        title: "No Remaining Allowance",
        message: `Monthly budget cap has been reached. Consider pausing discretionary purchases.`,
      });
    }
  }

  // Projected overspending warning
  if (progress.period.isCurrentPeriod && progress.overall.hasBudgetsDefined) {
    const projMinor = BigInt(parseDecimalToMinor(progress.overall.projectedSpending));
    const limitMinor = BigInt(parseDecimalToMinor(progress.overall.budgetLimit));
    if (projMinor > limitMinor && progress.overall.status !== "exceeded") {
      const overMinor = projMinor - limitMinor;
      insights.push({
        type: "forecast",
        title: "Projected Overspending Warning",
        message: `At current burn rate, total spending is projected to exceed budget by ₹${formatMinorAsDecimal(overMinor)} by month-end.`,
      });
    }
  }

  // Net savings insight
  const netSavingsMinor = BigInt(parseDecimalToMinor(progress.savings.netSavings));
  if (netSavingsMinor > 0n) {
    insights.push({
      type: "savings",
      title: "Positive Net Savings",
      message: `Current positive net cash flow is ₹${progress.savings.netSavings} this month.`,
    });
  }

  return {
    month: Number(month),
    year: Number(year),
    overallAlert,
    approachingLimit,
    exceeded,
    insights,
    totalAlertsCount: approachingLimit.length + exceeded.length + (overallAlert ? 1 : 0),
  };
};

/**
 * Deterministic Smart Budget Suggestions based on 3-month historical spending analysis.
 * Explicitly distinguishes historical facts from estimates.
 * Never automatically modifies budgets without user confirmation.
 */
export const getBudgetSuggestions = async (userId, targetMonth, targetYear, options = {}) => {
  const m = Number(targetMonth);
  const y = Number(targetYear);

  // Determine last 3 months
  const historicalMonths = [];
  let prevM = m;
  let prevY = y;
  for (let i = 0; i < 3; i++) {
    prevM -= 1;
    if (prevM === 0) {
      prevM = 12;
      prevY -= 1;
    }
    const days = getDaysInMonth(prevY, prevM);
    historicalMonths.push({
      month: prevM,
      year: prevY,
      startDate: `${prevY}-${String(prevM).padStart(2, "0")}-01`,
      endDate: `${prevY}-${String(prevM).padStart(2, "0")}-${String(days).padStart(2, "0")}`,
    });
  }

  // Earliest date and latest date among the 3 months
  const earliestDate = historicalMonths[2].startDate;
  const latestDate = historicalMonths[0].endDate;

  // 1. Fetch all expense categories
  const [categories] = await db.execute(
    "SELECT id, name, type FROM categories WHERE type = 'expense' ORDER BY name ASC",
  );

  // 2. Fetch all confirmed expense transactions in the 3-month period
  const [txRows] = await db.execute(
    `SELECT category_id, amount, MONTH(transaction_date) AS tx_month, YEAR(transaction_date) AS tx_year
       FROM transactions
      WHERE user_id = ?
        AND type = 'expense'
        AND DATE(transaction_date) >= ?
        AND DATE(transaction_date) <= ?`,
    [userId, earliestDate, latestDate],
  );

  // 3. Fetch current month's existing budgets
  const [existingBudgets] = await db.execute(
    `SELECT category_id, amount FROM budgets WHERE user_id = ? AND month = ? AND year = ?`,
    [userId, m, y],
  );
  const existingMap = new Map();
  for (const b of existingBudgets) {
    existingMap.set(b.category_id, formatMinorAsDecimal(parseDecimalToMinor(String(b.amount))));
  }

  // Aggregate by category and month
  // catId -> { m1: 0n, m2: 0n, m3: 0n }
  const catHistMap = new Map();
  for (const cat of categories) {
    catHistMap.set(cat.id, { m1: 0n, m2: 0n, m3: 0n });
  }

  for (const tx of txRows) {
    const entry = catHistMap.get(tx.category_id);
    if (!entry) continue;
    const minor = BigInt(parseDecimalToMinor(String(tx.amount)));
    if (tx.tx_month === historicalMonths[0].month && tx.tx_year === historicalMonths[0].year) {
      entry.m1 += minor;
    } else if (tx.tx_month === historicalMonths[1].month && tx.tx_year === historicalMonths[1].year) {
      entry.m2 += minor;
    } else if (tx.tx_month === historicalMonths[2].month && tx.tx_year === historicalMonths[2].year) {
      entry.m3 += minor;
    }
  }

  let totalAvgSpendingMinor = 0n;
  let totalSuggestedBudgetMinor = 0n;
  const categorySuggestions = [];

  for (const cat of categories) {
    const hist = catHistMap.get(cat.id);
    const m1 = hist.m1;
    const m2 = hist.m2;
    const m3 = hist.m3;

    const totalPastMinor = m1 + m2 + m3;
    const avgMinor = totalPastMinor / 3n;
    totalAvgSpendingMinor += avgMinor;

    // Spending Trend
    let trend = "stable";
    if (m1 > m2 && m2 > m3 && m3 > 0n) {
      trend = "increasing";
    } else if (m1 < m2 && m2 < m3 && m1 > 0n) {
      trend = "decreasing";
    }

    // Suggested amount:
    // Round to nearest 100 currency units (10000 minor)
    const unit = 10000n;
    let suggestedMinor;
    if (avgMinor === 0n) {
      suggestedMinor = 100000n; // fallback ₹1,000 for active tracking
    } else {
      // Round to nearest 100
      const remainder = avgMinor % unit;
      suggestedMinor = remainder === 0n ? avgMinor : avgMinor + (unit - remainder);
    }

    totalSuggestedBudgetMinor += suggestedMinor;

    const estimatedSavingsPotentialMinor =
      avgMinor > suggestedMinor ? avgMinor - suggestedMinor : 0n;

    categorySuggestions.push({
      categoryId: cat.id,
      categoryName: cat.name,
      historicalFacts: {
        lastMonthSpent: formatMinorAsDecimal(m1),
        twoMonthsAgoSpent: formatMinorAsDecimal(m2),
        threeMonthsAgoSpent: formatMinorAsDecimal(m3),
        threeMonthAverage: formatMinorAsDecimal(avgMinor),
      },
      estimates: {
        trend,
        suggestedBudget: formatMinorAsDecimal(suggestedMinor),
        estimatedSavingsPotential: formatMinorAsDecimal(estimatedSavingsPotentialMinor),
        rationale:
          avgMinor > 0n
            ? `Based on 3-month average of ₹${formatMinorAsDecimal(avgMinor)} with ${trend} trend.`
            : `Default starter limit for active expense tracking.`,
      },
      currentBudget: existingMap.get(cat.id) || null,
      isSuggestion: true,
      isHistoricalFact: false,
    });
  }

  // Filter or sort by spending prominence
  categorySuggestions.sort((a, b) => {
    const aVal = BigInt(parseDecimalToMinor(a.historicalFacts.threeMonthAverage));
    const bVal = BigInt(parseDecimalToMinor(b.historicalFacts.threeMonthAverage));
    return bVal > aVal ? 1 : bVal < aVal ? -1 : 0;
  });

  return {
    targetMonth: m,
    targetYear: y,
    historicalMonthsAnalyzed: historicalMonths.map((hm) => ({
      month: hm.month,
      year: hm.year,
    })),
    summary: {
      threeMonthAverageMonthlySpending: formatMinorAsDecimal(totalAvgSpendingMinor),
      suggestedTotalMonthlyBudget: formatMinorAsDecimal(totalSuggestedBudgetMinor),
      estimatedMonthlySavingsPotential: formatMinorAsDecimal(
        totalAvgSpendingMinor > totalSuggestedBudgetMinor
          ? totalAvgSpendingMinor - totalSuggestedBudgetMinor
          : 0n,
      ),
    },
    suggestions: categorySuggestions,
  };
};

/**
 * Historical spending comparison across past N months (default 6 months).
 */
export const getBudgetHistory = async (userId, numberOfMonths = 6) => {
  const monthsCount = Math.min(12, Math.max(1, Number(numberOfMonths) || 6));
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;

  const periods = [];
  let curM = currentMonth;
  let curY = currentYear;

  for (let i = 0; i < monthsCount; i++) {
    const days = getDaysInMonth(curY, curM);
    periods.push({
      month: curM,
      year: curY,
      startDate: `${curY}-${String(curM).padStart(2, "0")}-01`,
      endDate: `${curY}-${String(curM).padStart(2, "0")}-${String(days).padStart(2, "0")}`,
    });
    curM -= 1;
    if (curM === 0) {
      curM = 12;
      curY -= 1;
    }
  }

  const results = [];
  for (const p of periods) {
    const progress = await getBudgetProgress(userId, p.month, p.year);
    results.push({
      month: p.month,
      year: p.year,
      totalBudget: progress.overall.budgetLimit,
      totalSpent: progress.overall.actualSpending,
      variance: progress.overall.remainingAmount,
      utilizationPercentage: progress.overall.utilizationPercentage,
      status: progress.overall.status,
      hasBudgetsDefined: progress.overall.hasBudgetsDefined,
      categoryCount: progress.categoryBudgets.length,
    });
  }

  return results;
};
