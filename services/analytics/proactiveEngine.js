/**
 * FinTrack 2.0 - Phase 5C Proactive Financial Intelligence & Smart Alert Engine
 *
 * Invariants:
 * 1. Read-Only: Queries executed strictly via dedicated read-only analytics pool.
 * 2. Multi-Tenant Scoping: Every query enforces `user_id = ?` parameter binding.
 * 3. Privacy Preservation: Zero external AI APIs, zero bank credentials, zero SMS inbox reading.
 * 4. Deterministic: Computations use verified decimal arithmetic with proven mathematical formulas.
 * 5. Sample Guardrails: Requires sufficient historical records before asserting anomalies.
 * 6. Incomplete-Month Safety: Compares normalized like-for-like periods to prevent misleading trends.
 */

import analyticsDb from "../../config/analyticsDb.js";
import { resolveAnalyticsPeriod } from "./analyticsEngine.js";
import { PRIVACY_NOTICE } from "./responseTemplater.js";

const getDaysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

export const DEFAULT_ALERT_PREFERENCES = Object.freeze({
  enableProactiveInsights: true,
  enableBudgetAlerts: true,
  enableUnusualAlerts: true,
  enableSavingsAlerts: true,
  enableSpendingTrends: true,
  budgetWarningThreshold: 80, // Default 80%
});

export const ALERT_SEVERITY = Object.freeze({
  CRITICAL: "critical",
  WARNING: "warning",
  NOTICE: "notice",
  TIP: "tip",
  INFO: "info",
});

// Priority ranking order (1 = highest priority)
const SEVERITY_RANK = Object.freeze({
  [ALERT_SEVERITY.CRITICAL]: 1,
  [ALERT_SEVERITY.WARNING]: 2,
  [ALERT_SEVERITY.NOTICE]: 3,
  [ALERT_SEVERITY.TIP]: 4,
  [ALERT_SEVERITY.INFO]: 5,
});

const DISCRETIONARY_KEYWORDS = [
  "food", "dining", "shopping", "entertainment", "recreation", "travel", "cafe", "restaurant"
];

const isDiscretionaryCategory = (name) => {
  if (!name || typeof name !== "string") return false;
  const lower = name.toLowerCase();
  return DISCRETIONARY_KEYWORDS.some((k) => lower.includes(k));
};

/**
 * 1. Evaluate Budget Threshold Alerts (Feature 5C.1.A)
 * - Exceeded (> 100%)
 * - Reached (100%)
 * - Approaching (configurable >= threshold, default 80%)
 * - Rapid spending velocity
 * Deduplication guarantee: Emits only the single highest-severity alert per budget.
 */
export const evaluateBudgetAlerts = async (userId, period, thresholdPercent = 80, now = new Date()) => {
  const [budgetRows] = await analyticsDb.execute(
    `SELECT b.id, b.category_id, b.amount AS budget_limit, c.name AS category_name
       FROM budgets b
       JOIN categories c ON c.id = b.category_id
      WHERE b.user_id = ?
        AND b.month = ?
        AND b.year = ?
      ORDER BY b.amount DESC, c.name ASC`,
    [userId, period.month, period.year]
  );

  const alerts = [];
  const daysInMonth = getDaysInMonth(period.year, period.month);
  const currentDay = Math.min(now.getUTCDate(), daysInMonth);

  for (const b of budgetRows) {
    const limit = Number(b.budget_limit || 0);
    if (limit <= 0) continue; // Zero or negative budget handled gracefully

    const [spentRows] = await analyticsDb.execute(
      `SELECT COALESCE(SUM(amount), 0) AS spent,
              COUNT(id) AS count
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
    const utilization = (spent / limit) * 100;
    const utilizationStr = utilization.toFixed(1);

    // Contextual questions generator
    const makeQuestions = (categoryName) => [
      {
        question: `Why am I over budget in ${categoryName}?`,
        label: "Why Over Budget",
        intent: "budget_status",
      },
      {
        question: "How was this calculated?",
        label: "How Calculated",
        intent: "budget_status",
      },
      {
        question: `What can I do to improve ${categoryName} spending?`,
        label: "Improvement Tips",
        intent: "savings_opportunities",
      },
    ];

    // Priority 1: Exceeded limit
    if (spent > limit) {
      const overrun = spent - limit;
      alerts.push({
        id: `budget_exceeded_${b.id}_${period.year}_${period.month}`,
        type: "budget_exceeded",
        severity: ALERT_SEVERITY.CRITICAL,
        category: b.category_name,
        categoryId: b.category_id,
        title: `${b.category_name} Budget Exceeded`,
        explanation: `You have spent ₹${spent.toLocaleString("en-IN")} against your ₹${limit.toLocaleString("en-IN")} budget for ${b.category_name} (₹${overrun.toLocaleString("en-IN")} over budget, ${utilizationStr}% utilized).`,
        calculatedValues: {
          spent,
          budgetLimit: limit,
          difference: overrun,
          percentage: utilizationStr,
          threshold: 100,
          transactionCount: count,
        },
        period: {
          startDate: period.startDate,
          endDate: period.endDate,
          label: period.label,
        },
        provenance: {
          source: "budgets and transactions tables",
          formula: "overrun = spent - budget_limit",
          sampleCount: count,
          evaluatedAt: now.toISOString(),
          privacyGuarantee: PRIVACY_NOTICE,
        },
        suggestedQuestions: makeQuestions(b.category_name),
      });
      continue; // Highest severity for this budget, skip lower states
    }

    // Priority 2: Exactly reached limit (100%)
    if (spent === limit) {
      alerts.push({
        id: `budget_reached_${b.id}_${period.year}_${period.month}`,
        type: "budget_reached",
        severity: ALERT_SEVERITY.WARNING,
        category: b.category_name,
        categoryId: b.category_id,
        title: `${b.category_name} Budget Limit Reached`,
        explanation: `You have spent exactly 100% of your ₹${limit.toLocaleString("en-IN")} budget for ${b.category_name}. Any additional expense will exceed your limit.`,
        calculatedValues: {
          spent,
          budgetLimit: limit,
          difference: 0,
          percentage: "100.0",
          threshold: 100,
          transactionCount: count,
        },
        period: {
          startDate: period.startDate,
          endDate: period.endDate,
          label: period.label,
        },
        provenance: {
          source: "budgets and transactions tables",
          formula: "spent == budget_limit (100.0%)",
          sampleCount: count,
          evaluatedAt: now.toISOString(),
          privacyGuarantee: PRIVACY_NOTICE,
        },
        suggestedQuestions: makeQuestions(b.category_name),
      });
      continue;
    }

    // Priority 3: Approaching limit (>= thresholdPercent)
    if (utilization >= thresholdPercent) {
      const remaining = limit - spent;
      alerts.push({
        id: `budget_approaching_${b.id}_${period.year}_${period.month}`,
        type: "budget_approaching",
        severity: ALERT_SEVERITY.WARNING,
        category: b.category_name,
        categoryId: b.category_id,
        title: `${b.category_name} Approaching Budget Limit`,
        explanation: `You have utilized ${utilizationStr}% (₹${spent.toLocaleString("en-IN")}) of your ₹${limit.toLocaleString("en-IN")} ${b.category_name} budget. Remaining allowance: ₹${remaining.toLocaleString("en-IN")}.`,
        calculatedValues: {
          spent,
          budgetLimit: limit,
          difference: remaining,
          percentage: utilizationStr,
          threshold: thresholdPercent,
          transactionCount: count,
        },
        period: {
          startDate: period.startDate,
          endDate: period.endDate,
          label: period.label,
        },
        provenance: {
          source: "budgets and transactions tables",
          formula: "utilization >= thresholdPercent",
          sampleCount: count,
          evaluatedAt: now.toISOString(),
          privacyGuarantee: PRIVACY_NOTICE,
        },
        suggestedQuestions: makeQuestions(b.category_name),
      });
      continue;
    }

    // Priority 4: Rapid spending burn rate (velocity)
    // Only evaluate for current month if at least 5 days elapsed and at least 2 transactions recorded
    if (period.type === "current_month" && currentDay >= 5 && count >= 2 && spent > 0) {
      const dailyRate = spent / currentDay;
      const projected = dailyRate * daysInMonth;
      if (projected > limit * 1.15) {
        const projectedOverrun = Math.round(projected - limit);
        alerts.push({
          id: `budget_rapid_spending_${b.id}_${period.year}_${period.month}`,
          type: "budget_rapid_spending",
          severity: ALERT_SEVERITY.WARNING,
          category: b.category_name,
          categoryId: b.category_id,
          title: `Rapid Spending Pace in ${b.category_name}`,
          explanation: `At your current pace of ₹${Math.round(dailyRate).toLocaleString("en-IN")}/day over ${currentDay} days, ${b.category_name} is projected to reach ₹${Math.round(projected).toLocaleString("en-IN")}, exceeding your ₹${limit.toLocaleString("en-IN")} budget by ₹${projectedOverrun.toLocaleString("en-IN")}.`,
          calculatedValues: {
            spent,
            budgetLimit: limit,
            dailyRate: Math.round(dailyRate),
            projectedSpending: Math.round(projected),
            projectedOverrun,
            daysElapsed: currentDay,
            totalDays: daysInMonth,
            transactionCount: count,
          },
          period: {
            startDate: period.startDate,
            endDate: period.endDate,
            label: period.label,
          },
          provenance: {
            source: "transactions table daily velocity run rate",
            formula: "projected = (spent / daysElapsed) * totalDays",
            sampleCount: count,
            evaluatedAt: now.toISOString(),
            privacyGuarantee: PRIVACY_NOTICE,
          },
          suggestedQuestions: makeQuestions(b.category_name),
        });
      }
    }
  }

  return alerts;
};

/**
 * 2. Evaluate Unusual Spending Alerts (Feature 5C.1.B)
 * - Category spending surge
 * - Individual large purchases
 * Sample guardrails: Requires sufficient historical transactions before asserting anomalies.
 */
export const evaluateUnusualSpendingAlerts = async (userId, period, now = new Date()) => {
  // Historical sample guardrail
  const [historyRows] = await analyticsDb.execute(
    `SELECT COUNT(id) AS total_count,
            COALESCE(SUM(amount), 0) AS total_spent
       FROM transactions
      WHERE user_id = ?
        AND type = 'expense'
        AND DATE(transaction_date) <= ?`,
    [userId, period.endDate]
  );

  const totalCount = Number(historyRows[0]?.total_count || 0);
  const totalSpent = Number(historyRows[0]?.total_spent || 0);

  // If user has insufficient transaction history, avoid misleading anomaly alerts
  if (totalCount < 3) {
    return [];
  }

  const alerts = [];

  // A. Category Surge Check (compared to previous comparable period)
  const [curCategoryRows] = await analyticsDb.execute(
    `SELECT c.id, c.name,
            COALESCE(SUM(t.amount), 0) AS total,
            COUNT(t.id) AS count
       FROM transactions t
       JOIN categories c ON c.id = t.category_id
      WHERE t.user_id = ?
        AND t.type = 'expense'
        AND DATE(t.transaction_date) >= ?
        AND DATE(t.transaction_date) <= ?
      GROUP BY c.id, c.name`,
    [userId, period.startDate, period.endDate]
  );

  const [prevCategoryRows] = await analyticsDb.execute(
    `SELECT c.id, c.name,
            COALESCE(SUM(t.amount), 0) AS total,
            COUNT(t.id) AS count
       FROM transactions t
       JOIN categories c ON c.id = t.category_id
      WHERE t.user_id = ?
        AND t.type = 'expense'
        AND DATE(t.transaction_date) >= ?
        AND DATE(t.transaction_date) <= ?
      GROUP BY c.id, c.name`,
    [userId, period.previousPeriod.startDate, period.previousPeriod.endDate]
  );

  const prevMap = new Map();
  for (const r of prevCategoryRows) {
    prevMap.set(r.id, {
      total: Number(r.total),
      count: Number(r.count),
      name: r.name,
    });
  }

  for (const cur of curCategoryRows) {
    const curTotal = Number(cur.total);
    const curCount = Number(cur.count);
    const prev = prevMap.get(cur.id);

    // Require sufficient previous baseline: at least 2 previous transactions and >= ₹500
    if (prev && prev.count >= 2 && prev.total >= 500) {
      const diff = curTotal - prev.total;
      const surgeRatio = diff / prev.total;

      // Rule: increased by >= 50% AND absolute delta >= ₹1,000
      if (diff >= 1000 && surgeRatio >= 0.5) {
        const percentStr = (surgeRatio * 100).toFixed(1);
        alerts.push({
          id: `unusual_spike_${cur.id}_${period.year}_${period.month}`,
          type: "unusual_category_spike",
          severity: ALERT_SEVERITY.WARNING,
          category: cur.name,
          categoryId: cur.id,
          title: `Unusual Spending Surge in ${cur.name}`,
          explanation: `${cur.name} spending increased by ${percentStr}% (+₹${diff.toLocaleString("en-IN")}) this period (₹${curTotal.toLocaleString("en-IN")} vs ₹${prev.total.toLocaleString("en-IN")} in ${period.previousPeriod.label}).`,
          calculatedValues: {
            currentTotal: curTotal,
            previousTotal: prev.total,
            difference: diff,
            percentChange: percentStr,
            currentCount: curCount,
            previousCount: prev.count,
          },
          period: {
            startDate: period.startDate,
            endDate: period.endDate,
            label: period.label,
          },
          provenance: {
            source: "transactions table category group comparison",
            formula: "surge = (current - previous) / previous >= 50.0% and diff >= 1000",
            sampleCount: curCount + prev.count,
            evaluatedAt: now.toISOString(),
            privacyGuarantee: PRIVACY_NOTICE,
          },
          suggestedQuestions: [
            {
              question: `Explain this spending increase in ${cur.name}`,
              label: "Explain Increase",
              intent: "category_comparison",
            },
            {
              question: "How was this calculated?",
              label: "How Calculated",
              intent: "category_comparison",
            },
            {
              question: "What can I do to improve?",
              label: "Savings Opportunities",
              intent: "savings_opportunities",
            },
          ],
        });
      }
    }
  }

  // B. Large Transaction Anomaly Check (requires >= 5 historical transactions)
  if (totalCount >= 5 && totalSpent > 0) {
    const avgTx = totalSpent / totalCount;

    const [largeTxRows] = await analyticsDb.execute(
      `SELECT t.id, t.title, t.amount, t.transaction_date, c.name AS category_name, c.id AS category_id
         FROM transactions t
         JOIN categories c ON c.id = t.category_id
        WHERE t.user_id = ?
          AND t.type = 'expense'
          AND DATE(t.transaction_date) >= ?
          AND DATE(t.transaction_date) <= ?
          AND t.amount >= ?
          AND t.amount >= 1000
        ORDER BY t.amount DESC
        LIMIT 2`,
      [userId, period.startDate, period.endDate, avgTx * 2.5]
    );

    for (const tx of largeTxRows) {
      const amt = Number(tx.amount);
      const ratio = (amt / avgTx).toFixed(1);
      alerts.push({
        id: `unusual_tx_${tx.id}`,
        type: "unusual_large_transaction",
        severity: ALERT_SEVERITY.WARNING,
        category: tx.category_name,
        categoryId: tx.category_id,
        title: `Large Expense: ${tx.title}`,
        explanation: `Single transaction of ₹${amt.toLocaleString("en-IN")} on ${tx.transaction_date} in ${tx.category_name} is ${ratio}x higher than your historical average expense of ₹${Math.round(avgTx).toLocaleString("en-IN")}.`,
        calculatedValues: {
          transactionId: tx.id,
          amount: amt,
          averageTransaction: Math.round(avgTx),
          multiplier: ratio,
        },
        period: {
          startDate: period.startDate,
          endDate: period.endDate,
          label: period.label,
        },
        provenance: {
          source: "transactions table outlier threshold analysis",
          formula: "amount >= 2.5 * avgTx and amount >= 1000",
          sampleCount: totalCount,
          evaluatedAt: now.toISOString(),
          privacyGuarantee: PRIVACY_NOTICE,
        },
        suggestedQuestions: [
          {
            question: "What were my largest expenses this month?",
            label: "Largest Expenses",
            intent: "largest_expenses",
          },
          {
            question: "How was this calculated?",
            label: "How Calculated",
            intent: "unusual_spending",
          },
        ],
      });
    }
  }

  return alerts;
};

/**
 * 3. Evaluate Spending Trends (Feature 5C.1.C)
 * Incomplete-Month Safety: Compares normalized like-for-like periods.
 */
export const evaluateSpendingTrends = async (userId, period, now = new Date()) => {
  let curStart = period.startDate;
  let curEnd = period.endDate;
  let prevStart = period.previousPeriod.startDate;
  let prevEnd = period.previousPeriod.endDate;
  let isProrated = false;

  // If analyzing current month, compare normalized like-for-like elapsed days (e.g. Day 1 to Day 13)
  if (period.type === "current_month") {
    const daysInCur = getDaysInMonth(period.year, period.month);
    const curDay = Math.min(now.getUTCDate(), daysInCur);

    // If we are at the very start of the month (first 2 days), trend is not yet statistically meaningful
    if (curDay < 3) {
      return [];
    }

    const prevYear = period.previousPeriod.startDate.slice(0, 4);
    const prevMonth = period.previousPeriod.startDate.slice(5, 7);
    const daysInPrev = getDaysInMonth(Number(prevYear), Number(prevMonth));
    const comparablePrevDay = Math.min(curDay, daysInPrev);

    curEnd = `${period.year}-${String(period.month).padStart(2, "0")}-${String(curDay).padStart(2, "0")}`;
    prevEnd = `${prevYear}-${prevMonth}-${String(comparablePrevDay).padStart(2, "0")}`;
    isProrated = true;
  }

  const [curRows] = await analyticsDb.execute(
    `SELECT COALESCE(SUM(amount), 0) AS total,
            COUNT(id) AS count
       FROM transactions
      WHERE user_id = ?
        AND type = 'expense'
        AND DATE(transaction_date) >= ?
        AND DATE(transaction_date) <= ?`,
    [userId, curStart, curEnd]
  );

  const [prevRows] = await analyticsDb.execute(
    `SELECT COALESCE(SUM(amount), 0) AS total,
            COUNT(id) AS count
       FROM transactions
      WHERE user_id = ?
        AND type = 'expense'
        AND DATE(transaction_date) >= ?
        AND DATE(transaction_date) <= ?`,
    [userId, prevStart, prevEnd]
  );

  const curTotal = Number(curRows[0]?.total || 0);
  const curCount = Number(curRows[0]?.count || 0);
  const prevTotal = Number(prevRows[0]?.total || 0);
  const prevCount = Number(prevRows[0]?.count || 0);

  // Guard: require minimum baseline of at least 3 transactions in both windows
  if (curCount < 2 || prevCount < 2 || prevTotal <= 0) {
    return [];
  }

  const diff = curTotal - prevTotal;
  const changeRatio = diff / prevTotal;
  const percentChange = (changeRatio * 100).toFixed(1);
  const alerts = [];

  const periodContextLabel = isProrated
    ? `the same period (Days 1–${now.getUTCDate()}) last month`
    : period.previousPeriod.label;

  // Significant increase (>= 20% and >= ₹2,000)
  if (diff >= 2000 && changeRatio >= 0.2) {
    alerts.push({
      id: `trend_increase_${period.year}_${period.month}`,
      type: "spending_trend_increase",
      severity: ALERT_SEVERITY.NOTICE,
      title: "Noticeable Spending Increase",
      explanation: `Your spending is ${percentChange}% higher (+₹${diff.toLocaleString("en-IN")}) compared to ${periodContextLabel} (₹${curTotal.toLocaleString("en-IN")} vs ₹${prevTotal.toLocaleString("en-IN")}).`,
      calculatedValues: {
        currentSpending: curTotal,
        previousComparableSpending: prevTotal,
        difference: diff,
        percentChange,
        isProrated,
      },
      period: {
        startDate: period.startDate,
        endDate: period.endDate,
        label: period.label,
      },
      provenance: {
        source: "transactions table normalized time-window comparison",
        formula: isProrated
          ? "Like-for-like elapsed month days comparison (Days 1 to current day)"
          : "Full period spending delta",
        sampleCount: curCount + prevCount,
        evaluatedAt: now.toISOString(),
        privacyGuarantee: PRIVACY_NOTICE,
      },
      suggestedQuestions: [
        {
          question: "Which category increased the most?",
          label: "Category Comparison",
          intent: "category_comparison",
        },
        {
          question: "Compare this with last month",
          label: "Trend Breakdown",
          intent: "spending_trend",
        },
        {
          question: "Where can I save money?",
          label: "Savings Opportunities",
          intent: "savings_opportunities",
        },
      ],
    });
  } else if (diff <= -2000 && changeRatio <= -0.15) {
    // Favorable decrease (>= 15% reduction and at least ₹2,000 saved)
    alerts.push({
      id: `trend_decrease_${period.year}_${period.month}`,
      type: "spending_trend_decrease",
      severity: ALERT_SEVERITY.INFO,
      title: "Reduced Spending Trend",
      explanation: `Positive trend: Your spending is ${Math.abs(Number(percentChange))}% lower (-₹${Math.abs(diff).toLocaleString("en-IN")}) compared to ${periodContextLabel} (₹${curTotal.toLocaleString("en-IN")} vs ₹${prevTotal.toLocaleString("en-IN")}).`,
      calculatedValues: {
        currentSpending: curTotal,
        previousComparableSpending: prevTotal,
        difference: diff,
        percentChange,
        isProrated,
      },
      period: {
        startDate: period.startDate,
        endDate: period.endDate,
        label: period.label,
      },
      provenance: {
        source: "transactions table normalized time-window comparison",
        formula: "Like-for-like period reduction comparison",
        sampleCount: curCount + prevCount,
        evaluatedAt: now.toISOString(),
        privacyGuarantee: PRIVACY_NOTICE,
      },
      suggestedQuestions: [
        {
          question: "Show my spending breakdown by category",
          label: "Category Breakdown",
          intent: "spending_by_category",
        },
        {
          question: "What is my income vs expenses summary?",
          label: "Income vs Expenses",
          intent: "income_vs_expense",
        },
      ],
    });
  }

  return alerts;
};

/**
 * 4. Evaluate Savings Opportunities (Feature 5C.1.D)
 * - Over-budget category alignment
 * - Discretionary category trimming
 * Sourced purely from calculated evidence; never invents figures.
 */
export const evaluateSavingsOpportunities = async (userId, period, now = new Date()) => {
  const alerts = [];

  // A. Over-budget category savings
  const [budgetRows] = await analyticsDb.execute(
    `SELECT b.id, b.category_id, b.amount AS budget_limit, c.name AS category_name
       FROM budgets b
       JOIN categories c ON c.id = b.category_id
      WHERE b.user_id = ?
        AND b.month = ?
        AND b.year = ?`,
    [userId, period.month, period.year]
  );

  for (const b of budgetRows) {
    const limit = Number(b.budget_limit || 0);
    if (limit <= 0) continue;

    const [spentRows] = await analyticsDb.execute(
      `SELECT COALESCE(SUM(amount), 0) AS spent, COUNT(id) AS count
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

    if (spent > limit) {
      const overrun = spent - limit;
      alerts.push({
        id: `savings_budget_${b.id}_${period.year}_${period.month}`,
        type: "savings_budget_alignment",
        severity: ALERT_SEVERITY.TIP,
        category: b.category_name,
        categoryId: b.category_id,
        title: `Savings Opportunity: ${b.category_name}`,
        explanation: `Aligning ${b.category_name} spending back to your designated ₹${limit.toLocaleString("en-IN")} budget would save ₹${overrun.toLocaleString("en-IN")}.`,
        calculatedValues: {
          category: b.category_name,
          budgetLimit: limit,
          spent,
          potentialSavings: overrun,
          transactionCount: count,
        },
        period: {
          startDate: period.startDate,
          endDate: period.endDate,
          label: period.label,
        },
        provenance: {
          source: "budgets and transactions tables",
          formula: "potentialSavings = spent - budget_limit",
          sampleCount: count,
          evaluatedAt: now.toISOString(),
          privacyGuarantee: PRIVACY_NOTICE,
        },
        suggestedQuestions: [
          {
            question: `How much can I still spend in ${b.category_name}?`,
            label: "Remaining Allowance",
            intent: "remaining_allowance",
          },
          {
            question: "What can I do to improve?",
            label: "Actionable Tips",
            intent: "savings_opportunities",
          },
        ],
      });
    }
  }

  // B. Discretionary Surge Trimming (only if categorization supports that interpretation)
  const [curCats] = await analyticsDb.execute(
    `SELECT c.id, c.name, COALESCE(SUM(t.amount), 0) AS total, COUNT(t.id) AS count
       FROM transactions t
       JOIN categories c ON c.id = t.category_id
      WHERE t.user_id = ?
        AND t.type = 'expense'
        AND DATE(t.transaction_date) >= ?
        AND DATE(t.transaction_date) <= ?
      GROUP BY c.id, c.name`,
    [userId, period.startDate, period.endDate]
  );

  const [prevCats] = await analyticsDb.execute(
    `SELECT c.id, c.name, COALESCE(SUM(t.amount), 0) AS total
       FROM transactions t
       JOIN categories c ON c.id = t.category_id
      WHERE t.user_id = ?
        AND t.type = 'expense'
        AND DATE(t.transaction_date) >= ?
        AND DATE(t.transaction_date) <= ?
      GROUP BY c.id, c.name`,
    [userId, period.previousPeriod.startDate, period.previousPeriod.endDate]
  );

  const prevCatMap = new Map();
  for (const r of prevCats) {
    prevCatMap.set(r.id, Number(r.total));
  }

  for (const c of curCats) {
    const curTot = Number(c.total);
    const count = Number(c.count);
    const prevTot = prevCatMap.get(c.id) || 0;
    const diff = curTot - prevTot;

    // Check discretionary keyword, minimum growth >= 1000, and at least 3 transactions
    if (isDiscretionaryCategory(c.name) && diff >= 1000 && count >= 3 && prevTot > 0) {
      // Trimming half the increase provides an actionable, conservative target
      const trimSavings = Math.round(diff * 0.5);
      alerts.push({
        id: `savings_disc_${c.id}_${period.year}_${period.month}`,
        type: "savings_discretionary_trim",
        severity: ALERT_SEVERITY.TIP,
        category: c.name,
        categoryId: c.id,
        title: `Discretionary Savings: ${c.name}`,
        explanation: `${c.name} expenses grew by ₹${diff.toLocaleString("en-IN")} this period. Trimming half of this growth could recover ₹${trimSavings.toLocaleString("en-IN")} in savings.`,
        calculatedValues: {
          category: c.name,
          currentTotal: curTot,
          previousTotal: prevTot,
          difference: diff,
          potentialSavings: trimSavings,
          transactionCount: count,
        },
        period: {
          startDate: period.startDate,
          endDate: period.endDate,
          label: period.label,
        },
        provenance: {
          source: "categories and transactions tables discretionary filtering",
          formula: "potentialSavings = Math.round((current - previous) * 0.5)",
          sampleCount: count,
          evaluatedAt: now.toISOString(),
          privacyGuarantee: PRIVACY_NOTICE,
        },
        suggestedQuestions: [
          {
            question: "Where can I save money?",
            label: "Savings Opportunities",
            intent: "savings_opportunities",
          },
          {
            question: "Show my spending breakdown by category",
            label: "Category Breakdown",
            intent: "spending_by_category",
          },
        ],
      });
    }
  }

  return alerts;
};

/**
 * 5. Informational Summaries
 * When finances are stable and healthy, provide a positive summary alert.
 */
export const evaluateInformationalSummary = async (userId, period, otherAlertsCount, now = new Date()) => {
  // If user already has critical or warning alerts, summary alert is not needed
  if (otherAlertsCount > 2) {
    return [];
  }

  const [incExpRows] = await analyticsDb.execute(
    `SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS total_income,
            COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS total_expense,
            COUNT(id) AS count
       FROM transactions
      WHERE user_id = ?
        AND DATE(transaction_date) >= ?
        AND DATE(transaction_date) <= ?`,
    [userId, period.startDate, period.endDate]
  );

  const inc = Number(incExpRows[0]?.total_income || 0);
  const exp = Number(incExpRows[0]?.total_expense || 0);
  const count = Number(incExpRows[0]?.count || 0);

  if (count > 0 && inc > 0 && inc >= exp) {
    const netSavings = inc - exp;
    const rate = ((netSavings / inc) * 100).toFixed(1);

    return [
      {
        id: `summary_stability_${period.year}_${period.month}`,
        type: "informational_summary",
        severity: ALERT_SEVERITY.INFO,
        title: "Financial Stability Summary",
        explanation: `Healthy financial pacing: You have saved ₹${netSavings.toLocaleString("en-IN")} (${rate}% savings rate) out of ₹${inc.toLocaleString("en-IN")} income in ${period.label}.`,
        calculatedValues: {
          totalIncome: inc,
          totalExpense: exp,
          netSavings,
          savingsRate: rate,
          transactionCount: count,
        },
        period: {
          startDate: period.startDate,
          endDate: period.endDate,
          label: period.label,
        },
        provenance: {
          source: "transactions table income vs expense aggregation",
          formula: "netSavings = income - expense, savingsRate = (netSavings / income) * 100",
          sampleCount: count,
          evaluatedAt: now.toISOString(),
          privacyGuarantee: PRIVACY_NOTICE,
        },
        suggestedQuestions: [
          {
            question: "What is my income vs expenses summary?",
            label: "Income vs Expenses",
            intent: "income_vs_expense",
          },
          {
            question: "Give me financial insights for this month",
            label: "Monthly Insights",
            intent: "overview_insights",
          },
        ],
      },
    ];
  }

  return [];
};

/**
 * Main Proactive Alerts Dispatcher
 * Evaluates all deterministic rules, respects user preferences, deduplicates,
 * and sorts alerts by priority.
 */
export const generateProactiveAlerts = async (userId, options = {}, userPreferences = {}) => {
  const preferences = {
    ...DEFAULT_ALERT_PREFERENCES,
    ...userPreferences,
  };

  // If user disabled proactive insights entirely, return empty alerts
  if (!preferences.enableProactiveInsights) {
    return {
      alerts: [],
      alertCount: 0,
      preferences,
    };
  }

  const period = resolveAnalyticsPeriod(options);
  const now = new Date();
  const rawAlerts = [];

  // 1. Budget Alerts
  if (preferences.enableBudgetAlerts) {
    const budgetAlerts = await evaluateBudgetAlerts(
      userId,
      period,
      preferences.budgetWarningThreshold,
      now
    );
    rawAlerts.push(...budgetAlerts);
  }

  // 2. Unusual Spending Alerts
  if (preferences.enableUnusualAlerts) {
    const unusualAlerts = await evaluateUnusualSpendingAlerts(userId, period, now);
    rawAlerts.push(...unusualAlerts);
  }

  // 3. Spending Trends
  if (preferences.enableSpendingTrends) {
    const trendAlerts = await evaluateSpendingTrends(userId, period, now);
    rawAlerts.push(...trendAlerts);
  }

  // 4. Savings Opportunities
  if (preferences.enableSavingsAlerts) {
    const savingsAlerts = await evaluateSavingsOpportunities(userId, period, now);
    rawAlerts.push(...savingsAlerts);
  }

  // 5. Informational Summaries
  const summaries = await evaluateInformationalSummary(userId, period, rawAlerts.length, now);
  rawAlerts.push(...summaries);

  // Stable Deduplication: Ensure unique alert IDs
  const deduplicatedMap = new Map();
  for (const alert of rawAlerts) {
    if (!deduplicatedMap.has(alert.id)) {
      deduplicatedMap.set(alert.id, alert);
    }
  }

  const uniqueAlerts = Array.from(deduplicatedMap.values());

  // Deterministic Priority Sorting:
  // 1. Critical (budget overspent)
  // 2. Warning (unusual surge / large tx)
  // 3. Warning (budget approaching / rapid)
  // 4. Notice (spending trends)
  // 5. Tip (savings opportunities)
  // 6. Info (summaries)
  // Secondary sort: Monetary impact descending
  uniqueAlerts.sort((a, b) => {
    const rankA = SEVERITY_RANK[a.severity] || 99;
    const rankB = SEVERITY_RANK[b.severity] || 99;
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    const valA = Number(a.calculatedValues?.difference || a.calculatedValues?.amount || a.calculatedValues?.potentialSavings || 0);
    const valB = Number(b.calculatedValues?.difference || b.calculatedValues?.amount || b.calculatedValues?.potentialSavings || 0);
    if (valB !== valA) {
      return valB - valA;
    }
    return a.id.localeCompare(b.id);
  });

  return {
    period: {
      startDate: period.startDate,
      endDate: period.endDate,
      label: period.label,
    },
    alerts: uniqueAlerts,
    alertCount: uniqueAlerts.length,
    preferences,
  };
};
