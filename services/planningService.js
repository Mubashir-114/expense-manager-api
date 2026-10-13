import analyticsDb from "../config/analyticsDb.js";
import AppError from "../utils/AppError.js";
import { getGoalById, getGoals } from "../models/goalModel.js";

const DAYS_IN_MONTH_AVG = 30.4375;

/**
 * Enriches a goal with deterministic progress intelligence (Feature 5D.2).
 */
export const enrichGoalProgress = (goal, contributions = []) => {
  if (!goal) return null;

  const targetAmount = Number(goal.targetAmount);
  const savedAmount = Number(goal.savedAmount);
  const remainingAmount = Math.max(0, Number((targetAmount - savedAmount).toFixed(2)));
  const progressPercentage = targetAmount > 0
    ? Number(Math.min(100, Math.max(0, (savedAmount / targetAmount) * 100)).toFixed(2))
    : 0;

  // Days and months remaining
  let daysRemaining = null;
  let monthsRemaining = null;
  let isOverdue = false;

  if (goal.targetDate) {
    const today = new Date();
    const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const [tYear, tMonth, tDay] = goal.targetDate.split("-").map(Number);
    const targetUtc = Date.UTC(tYear, tMonth - 1, tDay);

    daysRemaining = Math.round((targetUtc - todayUtc) / (24 * 60 * 60 * 1000));
    if (daysRemaining < 0) {
      isOverdue = true;
      monthsRemaining = 0;
    } else {
      monthsRemaining = Number((daysRemaining / DAYS_IN_MONTH_AVG).toFixed(2));
    }
  }

  // Required monthly contribution
  let requiredMonthlySaving = null;
  if (remainingAmount <= 0) {
    requiredMonthlySaving = 0;
  } else if (goal.targetDate) {
    if (isOverdue || monthsRemaining <= 0) {
      requiredMonthlySaving = remainingAmount; // Deadline passed or due now
    } else {
      requiredMonthlySaving = Number((remainingAmount / Math.max(1, monthsRemaining)).toFixed(2));
    }
  }

  // Estimated completion date based on contribution velocity
  let estimatedCompletionDate = null;
  let estimationReason = null;
  let isEstimated = false;

  if (remainingAmount <= 0) {
    estimationReason = "Goal already achieved!";
  } else if (contributions && contributions.length >= 2) {
    const sorted = [...contributions].sort(
      (a, b) => new Date(a.contributionDate).getTime() - new Date(b.contributionDate).getTime()
    );
    const firstDate = new Date(sorted[0].contributionDate);
    const lastDate = new Date(sorted[sorted.length - 1].contributionDate);
    const spanDays = Math.max(1, Math.round((lastDate - firstDate) / (24 * 60 * 60 * 1000)));

    if (spanDays >= 14) {
      const totalContributed = sorted.reduce((sum, c) => sum + Number(c.amount), 0);
      const dailyVelocity = totalContributed / spanDays;

      if (dailyVelocity > 0) {
        const daysNeeded = Math.ceil(remainingAmount / dailyVelocity);
        const estDate = new Date(Date.now() + daysNeeded * 24 * 60 * 60 * 1000);
        estimatedCompletionDate = estDate.toISOString().slice(0, 10);
        isEstimated = true;
        const monthlyRate = Number((dailyVelocity * DAYS_IN_MONTH_AVG).toFixed(2));
        estimationReason = `Estimated based on historical saving pace of ₹${monthlyRate}/month across ${spanDays} days.`;
      } else {
        estimationReason = "Zero contribution velocity detected in historical contributions.";
      }
    } else {
      estimationReason = "Insufficient contribution history span (at least 14 days between contributions required for reliable projection).";
    }
  } else {
    estimationReason = "Insufficient contribution history (at least 2 contributions required for reliable projection).";
  }

  // Determine intelligence status: on_track | behind_schedule | completed | in_progress | archived
  let intelligenceStatus = "in_progress";
  if (savedAmount >= targetAmount) {
    intelligenceStatus = "completed";
  } else if (goal.status === "archived") {
    intelligenceStatus = "archived";
  } else if (!goal.targetDate) {
    intelligenceStatus = "in_progress";
  } else if (isOverdue) {
    intelligenceStatus = "behind_schedule";
  } else {
    // If target date is set, check if pace is on track
    const today = new Date();
    const created = new Date(goal.createdAt || today);
    const target = new Date(goal.targetDate);
    const totalDuration = Math.max(1, target.getTime() - created.getTime());
    const elapsedDuration = Math.max(0, today.getTime() - created.getTime());
    const expectedRatio = Math.min(1, elapsedDuration / totalDuration);
    const expectedSaved = targetAmount * expectedRatio;

    // Tolerance of 10%
    if (savedAmount >= expectedSaved * 0.9) {
      intelligenceStatus = "on_track";
    } else {
      intelligenceStatus = "behind_schedule";
    }
  }

  return {
    ...goal,
    savedAmount,
    remainingAmount,
    progressPercentage,
    daysRemaining,
    monthsRemaining,
    isOverdue,
    requiredMonthlySaving,
    estimatedCompletion: {
      date: estimatedCompletionDate,
      isEstimated,
      reason: estimationReason,
    },
    intelligenceStatus,
    isAchieved: savedAmount >= targetAmount,
  };
};

/**
 * Deterministic Cash-Flow Forecasting Engine (Feature 5D.3)
 * Uses dedicated read-only analytics pool to query stored transactions.
 */
export const generateCashFlowForecast = async (userId, horizon = "next_3_months") => {
  const HORIZON_MONTHS = {
    next_30_days: 1,
    next_3_months: 3,
    next_6_months: 6,
    next_12_months: 12,
  };

  const monthsAhead = HORIZON_MONTHS[horizon] || 3;
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;

  // Look back up to 6 months to compute historical baseline
  const lookbackStart = new Date(Date.UTC(currentYear, currentMonth - 7, 1)).toISOString().slice(0, 10);
  const lookbackEnd = new Date(Date.UTC(currentYear, currentMonth, 0)).toISOString().slice(0, 10);

  // Query confirmed transactions grouped by month from read-only analytics DB
  const [historyRows] = await analyticsDb.execute(
    `SELECT DATE_FORMAT(transaction_date, '%Y-%m') AS period_month,
            COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS month_income,
            COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS month_expense,
            COUNT(*) AS tx_count
       FROM transactions
      WHERE user_id = ?
        AND DATE(transaction_date) >= ?
        AND DATE(transaction_date) <= ?
      GROUP BY DATE_FORMAT(transaction_date, '%Y-%m')
      ORDER BY period_month ASC`,
    [userId, lookbackStart, lookbackEnd]
  );

  const monthsSampled = historyRows.length;
  let totalIncome = 0;
  let totalExpense = 0;
  let totalTransactions = 0;

  for (const row of historyRows) {
    totalIncome += Number(row.month_income || 0);
    totalExpense += Number(row.month_expense || 0);
    totalTransactions += Number(row.tx_count || 0);
  }

  // Avoid divide-by-zero
  const divisor = Math.max(1, monthsSampled);
  const avgMonthlyIncome = Number((totalIncome / divisor).toFixed(2));
  const avgMonthlyExpense = Number((totalExpense / divisor).toFixed(2));
  const netMonthlyCashFlow = Number((avgMonthlyIncome - avgMonthlyExpense).toFixed(2));
  const potentialMonthlySavingsCapacity = Math.max(0, netMonthlyCashFlow);

  // Projected totals for the selected horizon
  const projectedIncome = Number((avgMonthlyIncome * monthsAhead).toFixed(2));
  const projectedExpenses = Number((avgMonthlyExpense * monthsAhead).toFixed(2));
  const projectedNetCashFlow = Number((netMonthlyCashFlow * monthsAhead).toFixed(2));
  const projectedSavingsCapacity = Number((potentialMonthlySavingsCapacity * monthsAhead).toFixed(2));

  // Data sufficiency check
  const isSufficient = monthsSampled >= 1 && totalIncome > 0 && totalTransactions >= 3;
  const warnings = [];

  if (totalTransactions === 0) {
    warnings.push("No confirmed financial transactions found. Projections default to zero.");
  } else {
    if (totalIncome === 0) {
      warnings.push("No income transactions recorded. Savings capacity is projected assuming zero income.");
    }
    if (monthsSampled < 2) {
      warnings.push("Limited historical records (less than 2 full months). Add more records for higher forecast reliability.");
    }
  }

  const assumptions = [
    "Forecast is a scenario estimate based on past records, never a guarantee of future account balances.",
    "Assumes historical monthly income and expense averages continue throughout the projection horizon.",
    "Internal transfers and savings goal contributions are excluded to prevent double-counting.",
    "Unforeseen one-off expenses and variable windfalls are not included in baseline projections.",
  ];

  return {
    horizon,
    horizonMonths: monthsAhead,
    historicalMonthsSampled: monthsSampled,
    historicalAvgMonthlyIncome: avgMonthlyIncome,
    historicalAvgMonthlyExpense: avgMonthlyExpense,
    netMonthlyCashFlow,
    potentialMonthlySavingsCapacity,
    projectedIncome,
    projectedExpenses,
    projectedNetCashFlow,
    projectedSavingsCapacity,
    dataSufficiency: {
      isSufficient,
      warnings,
      recordCount: totalTransactions,
      samplePeriod: `${lookbackStart} to ${lookbackEnd}`,
    },
    assumptions,
  };
};

/**
 * Interactive What-If Financial Scenario Simulator (Feature 5D.4)
 * Deterministic scenario calculation isolated from persisted records.
 */
export const runWhatIfSimulation = async (userId, scenario) => {
  const {
    scenarioType, // 'savings_adjustment' | 'expense_reduction' | 'goal_timeline' | 'income_change'
    monthlySavingsAdjustment = 0,
    expenseReductionPercentage = 0,
    expenseReductionAmount = 0,
    goalId = null,
    targetMonths = null,
    incomeChangeAmount = 0,
  } = scenario;

  // Fetch baseline cash-flow metrics
  const forecast = await generateCashFlowForecast(userId, "next_3_months");
  const baselineIncome = forecast.historicalAvgMonthlyIncome;
  const baselineExpense = forecast.historicalAvgMonthlyExpense;
  const baselineNetCashFlow = forecast.netMonthlyCashFlow;
  const baselineSavingsCapacity = forecast.potentialMonthlySavingsCapacity;

  // If a goal is selected, load and calculate its baseline
  let targetGoal = null;
  if (goalId) {
    const rawGoal = await getGoalById(goalId, userId);
    if (rawGoal) {
      targetGoal = enrichGoalProgress(rawGoal);
    }
  }

  let modifiedIncome = baselineIncome;
  let modifiedExpense = baselineExpense;
  let modifiedSavingsRate = baselineSavingsCapacity;
  let explanation = "";
  let timelineImpact = null;
  let originalMonths = null;
  let simulatedMonths = null;

  if (targetGoal) {
    originalMonths = targetGoal.monthsRemaining || (
      baselineSavingsCapacity > 0
        ? Number((targetGoal.remainingAmount / baselineSavingsCapacity).toFixed(1))
        : null
    );
  }

  switch (scenarioType) {
    case "savings_adjustment": {
      const adjustment = Number(monthlySavingsAdjustment || 0);
      modifiedSavingsRate = Math.max(0, Number((baselineSavingsCapacity + adjustment).toFixed(2)));

      if (targetGoal && targetGoal.remainingAmount > 0) {
        if (modifiedSavingsRate > 0) {
          simulatedMonths = Number((targetGoal.remainingAmount / modifiedSavingsRate).toFixed(1));
          const diffMonths = originalMonths !== null ? Number((originalMonths - simulatedMonths).toFixed(1)) : null;
          timelineImpact = {
            originalMonths,
            simulatedMonths,
            monthsSaved: diffMonths !== null ? Math.max(0, diffMonths) : null,
          };
          explanation = adjustment >= 0
            ? `Increasing your monthly savings by ₹${adjustment.toLocaleString()} brings monthly savings to ₹${modifiedSavingsRate.toLocaleString()}. At this pace, you could reach "${targetGoal.name}" in approximately ${simulatedMonths} months${diffMonths && diffMonths > 0 ? ` (${diffMonths} months faster)` : ""}.`
            : `Reducing your monthly savings by ₹${Math.abs(adjustment).toLocaleString()} lowers monthly savings to ₹${modifiedSavingsRate.toLocaleString()}, extending the timeline to approximately ${simulatedMonths} months.`;
        } else {
          explanation = "With ₹0 monthly savings, completion of the goal cannot be projected.";
        }
      } else {
        explanation = adjustment >= 0
          ? `Increasing your monthly savings by ₹${adjustment.toLocaleString()} brings your total savings capacity to ₹${modifiedSavingsRate.toLocaleString()}/month.`
          : `Decreasing your monthly savings by ₹${Math.abs(adjustment).toLocaleString()} leaves your total savings capacity at ₹${modifiedSavingsRate.toLocaleString()}/month.`;
      }
      break;
    }

    case "expense_reduction": {
      let reduction = 0;
      if (expenseReductionPercentage > 0) {
        reduction = Number(((baselineExpense * expenseReductionPercentage) / 100).toFixed(2));
      } else if (expenseReductionAmount > 0) {
        reduction = Number(expenseReductionAmount);
      }
      modifiedExpense = Math.max(0, Number((baselineExpense - reduction).toFixed(2)));
      modifiedSavingsRate = Math.max(0, Number((baselineIncome - modifiedExpense).toFixed(2)));

      if (targetGoal && targetGoal.remainingAmount > 0) {
        if (modifiedSavingsRate > 0) {
          simulatedMonths = Number((targetGoal.remainingAmount / modifiedSavingsRate).toFixed(1));
          const diffMonths = originalMonths !== null ? Number((originalMonths - simulatedMonths).toFixed(1)) : null;
          timelineImpact = {
            originalMonths,
            simulatedMonths,
            monthsSaved: diffMonths !== null ? Math.max(0, diffMonths) : null,
          };
          explanation = `Trimming ₹${reduction.toLocaleString()} from monthly expenses boosts savings capacity from ₹${baselineSavingsCapacity.toLocaleString()} to ₹${modifiedSavingsRate.toLocaleString()}/month. You could reach "${targetGoal.name}" in ${simulatedMonths} months${diffMonths && diffMonths > 0 ? ` (${diffMonths} months earlier)` : ""}.`;
        } else {
          explanation = `Trimming ₹${reduction.toLocaleString()} reduces expenses to ₹${modifiedExpense.toLocaleString()}, but overall net cash flow remains non-positive.`;
        }
      } else {
        explanation = `Cutting expenses by ₹${reduction.toLocaleString()} lowers monthly spending to ₹${modifiedExpense.toLocaleString()} and increases potential monthly savings to ₹${modifiedSavingsRate.toLocaleString()}.`;
      }
      break;
    }

    case "goal_timeline": {
      const months = Math.max(1, Number(targetMonths || 6));
      if (!targetGoal) {
        throw new AppError("A savings goal must be selected to calculate deadline changes", 400);
      }
      const requiredSaving = Number((targetGoal.remainingAmount / months).toFixed(2));
      const monthlyDelta = Number((requiredSaving - baselineSavingsCapacity).toFixed(2));
      simulatedMonths = months;
      timelineImpact = {
        originalMonths,
        simulatedMonths: months,
        requiredMonthlySaving: requiredSaving,
        monthlyDelta,
      };

      explanation = `To complete "${targetGoal.name}" (remaining ₹${targetGoal.remainingAmount.toLocaleString()}) in ${months} months, you need to save ₹${requiredSaving.toLocaleString()} monthly.${
        monthlyDelta > 0
          ? ` That is ₹${monthlyDelta.toLocaleString()} more than your current monthly capacity of ₹${baselineSavingsCapacity.toLocaleString()}.`
          : ` This is well within your current monthly capacity of ₹${baselineSavingsCapacity.toLocaleString()}.`
      }`;
      break;
    }

    case "income_change": {
      const change = Number(incomeChangeAmount || 0);
      modifiedIncome = Math.max(0, Number((baselineIncome + change).toFixed(2)));
      const newNet = Number((modifiedIncome - baselineExpense).toFixed(2));
      modifiedSavingsRate = Math.max(0, newNet);

      if (targetGoal && targetGoal.remainingAmount > 0) {
        if (modifiedSavingsRate > 0) {
          simulatedMonths = Number((targetGoal.remainingAmount / modifiedSavingsRate).toFixed(1));
          const diffMonths = originalMonths !== null ? Number((originalMonths - simulatedMonths).toFixed(1)) : null;
          timelineImpact = {
            originalMonths,
            simulatedMonths,
            monthsSaved: diffMonths !== null ? Math.max(0, diffMonths) : null,
          };
          explanation = change >= 0
            ? `An income increase of ₹${change.toLocaleString()} brings monthly income to ₹${modifiedIncome.toLocaleString()} and savings capacity to ₹${modifiedSavingsRate.toLocaleString()}. You could achieve "${targetGoal.name}" in ${simulatedMonths} months.`
            : `A temporary income drop of ₹${Math.abs(change).toLocaleString()} reduces monthly income to ₹${modifiedIncome.toLocaleString()} and savings capacity to ₹${modifiedSavingsRate.toLocaleString()}, extending timeline to ${simulatedMonths} months.`;
        } else {
          explanation = `With reduced income of ₹${modifiedIncome.toLocaleString()} and expenses of ₹${baselineExpense.toLocaleString()}, net cash flow becomes ₹${newNet.toLocaleString()}.`;
        }
      } else {
        explanation = change >= 0
          ? `An income increase of ₹${change.toLocaleString()} raises potential savings capacity to ₹${modifiedSavingsRate.toLocaleString()}/month.`
          : `An income decrease of ₹${Math.abs(change).toLocaleString()} adjusts potential savings capacity to ₹${modifiedSavingsRate.toLocaleString()}/month.`;
      }
      break;
    }

    default:
      throw new AppError(`Unsupported scenario type: ${scenarioType}`, 400);
  }

  return {
    scenarioType,
    baseline: {
      monthlyIncome: baselineIncome,
      monthlyExpense: baselineExpense,
      netMonthlyCashFlow: baselineNetCashFlow,
      savingsCapacity: baselineSavingsCapacity,
      goal: targetGoal ? {
        id: targetGoal.id,
        name: targetGoal.name,
        targetAmount: targetGoal.targetAmount,
        savedAmount: targetGoal.savedAmount,
        remainingAmount: targetGoal.remainingAmount,
        originalMonthsRemaining: originalMonths,
      } : null,
    },
    simulated: {
      monthlyIncome: modifiedIncome,
      monthlyExpense: modifiedExpense,
      netMonthlyCashFlow: Number((modifiedIncome - modifiedExpense).toFixed(2)),
      savingsCapacity: modifiedSavingsRate,
      timelineImpact,
    },
    monthlyDifference: Number((modifiedSavingsRate - baselineSavingsCapacity).toFixed(2)),
    explanation,
    assumptions: [
      "Hypothetical simulation strictly for planning. Does not alter real bank balances or ledger transactions.",
      "Assumes all other recurring financial patterns remain identical to historical averages.",
      "Projections are mathematical models based on specified parameters, not guaranteed outcomes.",
    ],
  };
};
