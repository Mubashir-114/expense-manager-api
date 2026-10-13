/**
 * FinTrack 2.0 - Phase 5B Safe Controlled Response Templater
 *
 * Invariant: Private financial data is converted into natural language
 * strictly via controlled deterministic templates. No external LLMs, no generative
 * hallucinations, and no inclusion of private SMS text or unauthorized fields.
 * Clear distinction between verified calculated facts and deterministic recommendations.
 */

import { inferCharacterStateForResult, FIN_CHARACTER_STATES } from "./companionEngine.js";

const escapeText = (str) => {
  if (typeof str !== "string") return "";
  return str.replace(/[<>&"']/g, (char) => {
    switch (char) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return char;
    }
  });
};

const formatCurrency = (amount) => {
  const num = Number(amount) || 0;
  return `₹${num.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

export const PRIVACY_NOTICE =
  "Phase 5A analytics analyzed only saved FinTrack records owned by you. No bank accounts, SMS inboxes, or external AI services were accessed.";

export const buildProvenance = ({ recordCount = 0, startDate, endDate }) => ({
  recordCount: Number(recordCount),
  startDate,
  endDate,
  disclaimer: `Calculated from ${recordCount} saved FinTrack transaction${recordCount === 1 ? "" : "s"} between ${startDate} and ${endDate}.`,
  privacyNotice: PRIVACY_NOTICE,
});

/**
 * Builds dynamic contextual follow-up suggestions based on intent and metrics.
 */
export const buildFollowUpSuggestions = (intent, metrics = {}, activeCategory = null) => {
  switch (intent) {
    case "total_spending":
      return [
        { intent: "total_spending", question: "What about last month?", label: "Last Month" },
        { intent: "spending_by_category", question: "Show my spending breakdown by category", label: "By Category" },
        { intent: "category_comparison", question: "Which category increased the most?", label: "Compare Categories" },
      ];

    case "category_comparison":
      return [
        { intent: "budget_status", question: "Am I exceeding my food budget?", label: "Food Budget" },
        { intent: "remaining_allowance", question: "How much can I still spend?", label: "Remaining Allowance" },
        { intent: "spending_by_category", question: "Show my spending breakdown by category", label: "By Category" },
      ];

    case "budget_status":
      return [
        { intent: "remaining_allowance", question: "How much can I still spend?", label: "Remaining Allowance" },
        { intent: "savings_opportunities", question: "Where can I save money?", label: "Savings Opportunities" },
        { intent: "unusual_spending", question: "Any unusual spending this month?", label: "Unusual Spending" },
      ];

    case "remaining_allowance":
      return [
        { intent: "category_comparison", question: "Which category increased the most?", label: "Biggest Increase" },
        { intent: "savings_opportunities", question: "Where can I save money?", label: "Savings Opportunities" },
        { intent: "budget_status", question: "How are my budgets doing?", label: "All Budgets" },
      ];

    case "unusual_spending":
      return [
        { intent: "savings_opportunities", question: "Where can I save money?", label: "Savings Opportunities" },
        { intent: "largest_expenses", question: "What were my largest expenses this month?", label: "Largest Expenses" },
        { intent: "remaining_allowance", question: "How much can I still spend?", label: "Remaining Allowance" },
      ];

    case "savings_opportunities":
      return [
        { intent: "remaining_allowance", question: "How much can I still spend?", label: "Remaining Allowance" },
        { intent: "budget_status", question: "How are my budgets doing?", label: "Budget Status" },
        { intent: "category_comparison", question: "Which category increased the most?", label: "Category Comparison" },
      ];

    case "spending_by_category":
      return [
        { intent: "category_comparison", question: "Which category increased the most?", label: "Biggest Increase" },
        { intent: "budget_status", question: "How are my budgets doing?", label: "Budgets" },
        { intent: "total_spending", question: "How much did I spend this month?", label: "Total Spending" },
      ];

    case "spending_trend":
      return [
        { intent: "category_comparison", question: "Which category increased the most?", label: "Biggest Increase" },
        { intent: "unusual_spending", question: "Any unusual spending this month?", label: "Unusual Spending" },
        { intent: "budget_status", question: "How are my budgets doing?", label: "Budgets" },
      ];

    case "explain_calculation":
      return [
        { intent: "budget_status", question: "How are my budgets doing?", label: "Budgets" },
        { intent: "category_comparison", question: "Which category increased the most?", label: "Biggest Increase" },
        { intent: "savings_opportunities", question: "Where can I save money?", label: "Savings Opportunities" },
      ];

    case "goal_affordability":
      return [
        { intent: "goal_status_summary", question: "Which goal is closest to completion?", label: "Goal Status" },
        { intent: "goal_forecast_explanation", question: "Explain my savings forecast", label: "Forecast Explanation" },
        { intent: "savings_opportunities", question: "Where can I save money?", label: "Savings Opportunities" },
      ];

    case "goal_completion_estimate":
      return [
        { intent: "goal_affordability", question: "Can I afford to save ₹5,000 monthly?", label: "Affordability" },
        { intent: "goal_status_summary", question: "Which goal is closest to completion?", label: "Other Goals" },
        { intent: "goal_what_if_expense", question: "What if I reduce my shopping expenses?", label: "What-If" },
      ];

    case "goal_status_summary":
      return [
        { intent: "goal_recommended_saving", question: "How much should I save each month?", label: "Recommended Saving" },
        { intent: "goal_affordability", question: "Can I afford to save ₹5,000 monthly?", label: "Savings Affordability" },
        { intent: "goal_forecast_explanation", question: "Explain my savings forecast", label: "Forecast" },
      ];

    case "goal_recommended_saving":
      return [
        { intent: "goal_status_summary", question: "Which goal is closest to completion?", label: "Goal Status" },
        { intent: "goal_what_if_expense", question: "What if I reduce my shopping expenses?", label: "Reduce Expenses" },
        { intent: "goal_forecast_explanation", question: "Explain my savings forecast", label: "Forecast Explanation" },
      ];

    case "goal_what_if_expense":
      return [
        { intent: "goal_affordability", question: "Can I afford to save ₹5,000 monthly?", label: "Affordability" },
        { intent: "goal_status_summary", question: "Which goal is closest to completion?", label: "Goal Status" },
        { intent: "goal_forecast_explanation", question: "Explain my savings forecast", label: "Forecast" },
      ];

    case "goal_forecast_explanation":
      return [
        { intent: "goal_affordability", question: "Can I afford to save ₹5,000 monthly?", label: "Affordability" },
        { intent: "goal_recommended_saving", question: "How much should I save each month?", label: "Recommended Saving" },
        { intent: "goal_status_summary", question: "Which goal is closest to completion?", label: "Goal Status" },
      ];

    default:
      return [
        { intent: "total_spending", question: "How much did I spend this month?", label: "Total Spending" },
        { intent: "budget_status", question: "How are my budgets doing?", label: "Budgets" },
        { intent: "remaining_allowance", question: "How much can I still spend?", label: "Remaining Allowance" },
      ];
  }
};

export const formatTemplateResponse = ({
  intent,
  period,
  metrics,
  question,
  isRefusal,
  refusalReason,
  refusalMessage,
  confidence = "high",
  category,
  comparisonType,
  clarificationOptions,
  conversationContext,
  suggestions = [],
  characterState: explicitCharacterState,
  actionPreview,
  navigationAction,
  preferences,
  answer: explicitAnswer,
}) => {
  const isConcise = preferences?.responseStyle === "concise";

  if (isRefusal || intent === "unsupported") {
    const charState = explicitCharacterState || FIN_CHARACTER_STATES.CONFUSED;
    return {
      intent: intent || "unsupported",
      isRefusal: Boolean(isRefusal),
      confidence: confidence || "none",
      refusalReason: refusalReason || "unsupported_query",
      period: period ? { startDate: period.startDate, endDate: period.endDate, label: period.label } : null,
      metrics: null,
      characterState: charState,
      actionPreview: actionPreview || null,
      navigationAction: navigationAction || null,
      responseStyle: preferences?.responseStyle || "friendly",
      answer:
        refusalMessage ||
        explicitAnswer ||
        "This query is not supported by FinTrack Phase 5B assistant. Please select from one of the supported financial analytics questions.",
      provenance: null,
      privacyNotice: PRIVACY_NOTICE,
      suggestions,
      followUpSuggestions: suggestions,
      conversationContext: conversationContext || null,
    };
  }

  // Safe clarification needed
  if (intent === "clarification_needed") {
    return {
      intent: "clarification_needed",
      isRefusal: false,
      confidence: "low",
      period: null,
      metrics: null,
      characterState: explicitCharacterState || FIN_CHARACTER_STATES.CONFUSED,
      actionPreview: actionPreview || null,
      navigationAction: navigationAction || null,
      responseStyle: preferences?.responseStyle || "friendly",
      answer: `I noticed your query regarding "${category || question}" could mean a few things. Please choose which financial view you'd like to inspect:`,
      clarificationOptions: clarificationOptions || [],
      provenance: null,
      privacyNotice: PRIVACY_NOTICE,
      suggestions: (clarificationOptions || []).map((o) => ({
        intent: "classified",
        question: o.question,
        label: o.label,
      })),
      followUpSuggestions: (clarificationOptions || []).map((o) => ({
        intent: "classified",
        question: o.question,
        label: o.label,
      })),
      conversationContext: {
        previousIntent: "clarification_needed",
        activePeriod: conversationContext?.activePeriod || "current_month",
        activeCategory: category || null,
        activeMonth: conversationContext?.activeMonth || null,
        turnCount: (conversationContext?.turnCount || 0) + 1,
      },
    };
  }

  const recordCount =
    metrics?.transactionCount ||
    metrics?.totalTransactions ||
    (metrics?.largestExpenses ? metrics.largestExpenses.length : 0) ||
    0;

  const provenance = period
    ? buildProvenance({
        recordCount,
        startDate: period.startDate,
        endDate: period.endDate,
      })
    : null;

  let answer = explicitAnswer || "";
  let resolvedCategory = category;

  if (!explicitAnswer) {
    switch (intent) {
    case "total_spending": {
      const formattedTotal = formatCurrency(metrics.totalSpending);
      const count = metrics.transactionCount;
      if (count === 0) {
        answer = `You have no recorded expenses for ${period.label}.`;
      } else {
        answer = `Your total spending for ${period.label} was ${formattedTotal} across ${count} saved transaction${count === 1 ? "" : "s"}.`;
      }
      break;
    }

    case "spending_by_category": {
      const total = formatCurrency(metrics.totalSpending);
      const categories = metrics.categories || [];
      if (categories.length === 0) {
        answer = `No category spending recorded for ${period.label}.`;
      } else {
        const top = categories[0];
        resolvedCategory = top.name;
        answer = `For ${period.label}, total spending was ${total} across ${categories.length} categories. Your highest spending was in ${escapeText(top.name)} at ${formatCurrency(top.total)} (${top.percentage}% of expenses).`;
      }
      break;
    }

    case "spending_trend": {
      const current = formatCurrency(metrics.currentSpending);
      const previous = formatCurrency(metrics.previousSpending);
      const dir = metrics.direction; // 'increased', 'decreased', 'unchanged'
      const pct = metrics.percentChange;
      if (dir === "unchanged") {
        answer = `Your spending in ${period.label} (${current}) was unchanged compared to the previous period (${previous}).`;
      } else {
        answer = `Your spending in ${period.label} (${current}) ${dir} by ${pct}% compared to the previous period (${previous}).`;
      }
      break;
    }

    case "category_comparison": {
      const largestInc = metrics.largestIncrease;
      const largestDec = metrics.largestDecrease;
      const targetCat = metrics.targetCategoryComparison;

      if (targetCat) {
        resolvedCategory = targetCat.name;
        const cur = formatCurrency(targetCat.currentTotal);
        const prev = formatCurrency(targetCat.previousTotal);
        const diff = formatCurrency(Math.abs(targetCat.difference));
        const dir = targetCat.difference >= 0 ? "increased" : "decreased";
        answer = `Calculated Fact: ${escapeText(targetCat.name)} spending in ${period.label} was ${cur} vs ${prev} in ${metrics.previousPeriodLabel} (${dir} by ${diff}, ${targetCat.percentChange}%).`;
      } else if (comparisonType === "largest_decrease" && largestDec && largestDec.difference < 0) {
        resolvedCategory = largestDec.name;
        const decAmt = formatCurrency(Math.abs(largestDec.difference));
        answer = `Calculated Fact: ${escapeText(largestDec.name)} had the largest spending decrease in ${period.label}, dropping by ${decAmt} (${largestDec.percentChange}%) compared to ${metrics.previousPeriodLabel}.`;
      } else if (largestInc && largestInc.difference > 0) {
        resolvedCategory = largestInc.name;
        const incAmt = formatCurrency(largestInc.difference);
        answer = `Calculated Fact: ${escapeText(largestInc.name)} had the largest spending increase in ${period.label}, rising by ${incAmt} (+${largestInc.percentChange}%) compared to ${metrics.previousPeriodLabel} (${formatCurrency(largestInc.previousTotal)} to ${formatCurrency(largestInc.currentTotal)}).`;
      } else {
        answer = `Calculated Fact: Category spending was steady between ${period.label} and ${metrics.previousPeriodLabel}. No category had an increase in expenses.`;
      }
      break;
    }

    case "budget_status": {
      const categoryBudget = metrics.categoryBudget;
      const count = metrics.totalBudgets || 0;

      if (categoryBudget) {
        resolvedCategory = categoryBudget.categoryName;
        const spent = formatCurrency(categoryBudget.spent);
        const limit = formatCurrency(categoryBudget.budgetLimit);
        const rem = formatCurrency(categoryBudget.remaining);
        const pct = categoryBudget.percentage;

        if (categoryBudget.status === "exceeded") {
          const over = formatCurrency(categoryBudget.spent - categoryBudget.budgetLimit);
          answer = `Calculated Fact: Yes, you are exceeding your ${escapeText(categoryBudget.categoryName)} budget for ${period.label}. You have spent ${spent} against a limit of ${limit} (${pct}% utilized, over by ${over}).`;
        } else if (categoryBudget.status === "approaching_limit") {
          answer = `Calculated Fact: Your ${escapeText(categoryBudget.categoryName)} budget is approaching its limit for ${period.label}. You have spent ${spent} of ${limit} (${pct}% utilized), with ${rem} remaining.`;
        } else {
          answer = `Calculated Fact: No, you are on track with your ${escapeText(categoryBudget.categoryName)} budget for ${period.label}. You have spent ${spent} of ${limit} (${pct}% utilized), leaving ${rem} still available.`;
        }
      } else if (metrics.requestedCategory && !categoryBudget) {
        answer = `You do not have a dedicated budget configured for "${escapeText(metrics.requestedCategory)}" in ${period.label}. You have ${count} other active budget${count === 1 ? "" : "s"} configured.`;
      } else if (count === 0) {
        answer = `You do not have any active budgets configured for ${period.label}.`;
      } else {
        const spent = formatCurrency(metrics.totalSpent);
        const limit = formatCurrency(metrics.totalBudget);
        const pct = metrics.overallPercentage;
        const exceeded = metrics.exceededCount || 0;
        const warning = metrics.warningCount || 0;
        let alertSummary = "All budgets are on track.";
        if (exceeded > 0) {
          alertSummary = `${exceeded} budget${exceeded === 1 ? " is" : "s are"} currently exceeded.`;
        } else if (warning > 0) {
          alertSummary = `${warning} budget${warning === 1 ? " is" : "s are"} approaching limit (above 80%).`;
        }
        answer = `For ${period.label}, you have spent ${spent} of your ${limit} total budget (${pct}%). ${alertSummary}`;
      }
      break;
    }

    case "remaining_allowance": {
      const categoryBudget = metrics.categoryBudget;
      if (categoryBudget) {
        resolvedCategory = categoryBudget.categoryName;
        const rem = formatCurrency(categoryBudget.remaining);
        const limit = formatCurrency(categoryBudget.budgetLimit);
        const spent = formatCurrency(categoryBudget.spent);
        if (categoryBudget.status === "exceeded") {
          const over = formatCurrency(categoryBudget.spent - categoryBudget.budgetLimit);
          answer = `Calculated Fact: You have ₹0.00 remaining in your ${escapeText(categoryBudget.categoryName)} budget for ${period.label}. You have exceeded your ${limit} budget by ${over} (spent ${spent}).`;
        } else {
          answer = `Calculated Fact: You can still spend ${rem} in your ${escapeText(categoryBudget.categoryName)} budget for ${period.label} (spent ${spent} of ${limit}).`;
        }
      } else if (metrics.totalBudgets > 0) {
        const remBudget = formatCurrency(metrics.remainingBudgetAllowance);
        const spent = formatCurrency(metrics.totalSpent);
        const total = formatCurrency(metrics.totalBudget);
        answer = `Calculated Fact: Across all budgets for ${period.label}, you have ${remBudget} remaining allowance (spent ${spent} of ${total} total budget).`;
      } else {
        const cashFlow = formatCurrency(metrics.discretionaryCashFlow);
        answer = `Calculated Fact: No category budgets are set. Based on recorded cash flow for ${period.label}, your remaining surplus is ${cashFlow} (Income: ${formatCurrency(metrics.totalIncome)}, Expenses: ${formatCurrency(metrics.totalExpense)}).`;
      }
      break;
    }

    case "unusual_spending": {
      const indicators = metrics.indicators || [];
      if (indicators.length === 0) {
        answer = `Calculated Fact: No unusual spending anomalies or spikes detected for ${period.label}. Your spending velocity and transaction sizes are consistent with normal patterns.`;
      } else {
        const details = indicators
          .slice(0, 3)
          .map((ind, idx) => `(${idx + 1}) ${ind.description}`)
          .join("; ");
        answer = `Calculated Fact: Detected ${indicators.length} unusual spending indicator${indicators.length === 1 ? "" : "s"} for ${period.label}: ${details}.`;
      }
      break;
    }

    case "savings_opportunities": {
      const opportunities = metrics.opportunities || [];
      if (opportunities.length === 0) {
        answer = `Calculated Fact: You are within all budgets for ${period.label} and no major discretionary spending surges were detected. Keep up your balanced spending!`;
      } else {
        const totalPotential = formatCurrency(metrics.totalPotentialSavings);
        const details = opportunities
          .slice(0, 3)
          .map((opp, idx) => `(${idx + 1}) ${opp.reason}`)
          .join("; ");
        answer = `Deterministic Recommendation: Identified ${opportunities.length} explainable savings opportunities totaling up to ${totalPotential} for ${period.label}: ${details}. (Note: Suggestions are deterministic rules based on over-budget items and discretionary surges).`;
      }
      break;
    }

    case "income_vs_expense": {
      const inc = formatCurrency(metrics.totalIncome);
      const exp = formatCurrency(metrics.totalExpense);
      const net = formatCurrency(metrics.netSavings);
      const rate = metrics.savingsRate;
      if (metrics.totalIncome === 0 && metrics.totalExpense === 0) {
        answer = `No income or expenses recorded for ${period.label}.`;
      } else if (metrics.totalIncome === 0) {
        answer = `In ${period.label}, you spent ${exp} with no income recorded.`;
      } else {
        answer = `In ${period.label}, you earned ${inc} and spent ${exp}, resulting in net savings of ${net} (savings rate of ${rate}%).`;
      }
      break;
    }

    case "largest_expenses": {
      const items = metrics.largestExpenses || [];
      if (items.length === 0) {
        answer = `No expense transactions found for ${period.label}.`;
      } else {
        const top = items[0];
        answer = `Your largest single expense in ${period.label} was ${formatCurrency(top.amount)} for "${escapeText(top.title)}" (${escapeText(top.category)}). Your top ${items.length} expenses totaled ${formatCurrency(metrics.topExpensesTotal)}.`;
      }
      break;
    }

    case "overview_insights": {
      const exp = formatCurrency(metrics.totalExpense);
      const inc = formatCurrency(metrics.totalIncome);
      const insightsCount = (metrics.insights || []).length;
      answer = `Financial Overview for ${period.label}: Total income of ${inc} and expenses of ${exp}. Generated ${insightsCount} deterministic observations based on your saved records.`;
      break;
    }

    case "explain_calculation": {
      const type = metrics.type || "general";
      const cat = resolvedCategory || metrics.category;
      if (type === "budget_status" && cat) {
        answer = `Calculation Methodology for ${escapeText(cat)} Budget: Spending is computed as the exact sum of verified expense transactions in ${escapeText(cat)} for ${period.label}. The budget limit is retrieved from your saved monthly budgets. Overrun is calculated as (spent - budget_limit). Sourced strictly from your saved database records.`;
      } else if (type === "category_comparison") {
        answer = `Calculation Methodology for Category Comparison: Sourced from transactions grouped by category for ${period.label} compared against ${period.previousPeriod.label}. Percentage change is calculated as ((current_spending - previous_spending) / previous_spending) * 100.`;
      } else if (type === "unusual_spending") {
        answer = `Calculation Methodology for Unusual Spending: Compares category spending delta against previous period (threshold: >= 50% increase and >= ₹1,000) and detects individual purchases exceeding 2.5x your historical average transaction amount with sufficient sample size.`;
      } else if (type === "savings_opportunities") {
        answer = `Calculation Methodology for Savings Opportunities: Sourced by evaluating over-budget categories (recovering exact overrun) and discretionary category surges (targeting 50% trimming of recorded increases). All amounts are strictly evidence-based facts.`;
      } else {
        answer = `Calculation Methodology: All metrics are computed deterministically from your authenticated FinTrack transaction and budget records using exact decimal arithmetic. Zero external AI models, third-party trackers, or bank APIs are used.`;
      }
      break;
    }

    case "goal_affordability": {
      const requested = formatCurrency(metrics.requestedMonthlySaving);
      const capacity = formatCurrency(metrics.potentialSavingsCapacity);
      const net = formatCurrency(metrics.netMonthlyCashFlow);
      if (metrics.isAffordable) {
        answer = `Calculated Fact: Yes, you can afford to save ${requested} monthly. Based on your historical records, your average net monthly cash flow is ${net}, giving you a savings capacity of ${capacity}/month.`;
      } else if (metrics.potentialSavingsCapacity > 0) {
        const gap = formatCurrency(metrics.gap);
        answer = `Calculated Fact: Your current monthly savings capacity is ${capacity} (net cash flow ${net}). To reach ${requested}/month, you have a gap of ${gap}/month, which could be covered by reducing discretionary expenses.`;
      } else {
        answer = `Calculated Fact: Based on your recorded history, your average monthly expenses match or exceed your income (net cash flow ${net}). Saving ${requested} monthly will require adjusting baseline spending or adding new income records.`;
      }
      break;
    }

    case "goal_completion_estimate": {
      const g = metrics.goal;
      if (!g) {
        answer = `You do not have any active savings goals matching "${escapeText(metrics.targetGoalName || "")}". Create a goal in Financial Planning to track deterministic completion estimates.`;
      } else if (g.isAchieved) {
        answer = `Calculated Fact: "${escapeText(g.name)}" has already reached its target! You have saved ${formatCurrency(g.savedAmount)} of ${formatCurrency(g.targetAmount)} (${g.progressPercentage}%).`;
      } else {
        const rem = formatCurrency(g.remainingAmount);
        const est = g.estimatedCompletion;
        let timelineText = "";
        if (est && est.date) {
          timelineText = `Estimated completion date is approximately ${est.date} (${est.reason}).`;
        } else if (g.requiredMonthlySaving) {
          timelineText = `To finish by your target date (${g.targetDate}), you need to save ${formatCurrency(g.requiredMonthlySaving)} monthly.`;
        } else {
          timelineText = est?.reason || "Add more contribution records to project an exact timeline.";
        }
        answer = `Goal Status for "${escapeText(g.name)}": ${formatCurrency(g.savedAmount)} saved of ${formatCurrency(g.targetAmount)} (${g.progressPercentage}%). Remaining: ${rem}. ${timelineText}`;
      }
      break;
    }

    case "goal_status_summary": {
      if (metrics.totalGoalsCount === 0) {
        answer = "You do not have any savings goals created yet. Visit Financial Planning to set up goals and track progress.";
      } else if (metrics.subType === "needs_attention" && metrics.attentionGoal) {
        const g = metrics.attentionGoal;
        const rem = formatCurrency(g.remainingAmount);
        answer = `Goal Needing Attention: "${escapeText(g.name)}" has saved ${formatCurrency(g.savedAmount)} of ${formatCurrency(g.targetAmount)} (${g.progressPercentage}%). Status: ${g.intelligenceStatus === "behind_schedule" || g.isOverdue ? "Behind schedule" : "In progress"} with ${rem} remaining.`;
      } else if (metrics.closestGoal) {
        const g = metrics.closestGoal;
        const rem = formatCurrency(g.remainingAmount);
        answer = `Calculated Fact: "${escapeText(g.name)}" is closest to completion at ${g.progressPercentage}% (${formatCurrency(g.savedAmount)} of ${formatCurrency(g.targetAmount)} saved, ${rem} remaining across ${metrics.activeGoalsCount} active goal${metrics.activeGoalsCount === 1 ? "" : "s"}).`;
      } else {
        answer = `You have ${metrics.totalGoalsCount} savings goal${metrics.totalGoalsCount === 1 ? "" : "s"} tracked in FinTrack.`;
      }
      break;
    }

    case "goal_recommended_saving": {
      const rec = formatCurrency(metrics.recommended20Percent);
      const cap = formatCurrency(metrics.savingsCapacity);
      const req = formatCurrency(metrics.totalRequiredAcrossGoals);
      const count = metrics.activeGoalsCount;
      answer = `Savings Recommendation: Following the standard 20% guideline based on your average monthly income of ${formatCurrency(metrics.avgMonthlyIncome)}, a healthy savings rate is ${rec}/month. Your actual current net capacity is ${cap}/month. You have ${count} active goal${count === 1 ? "" : "s"} requiring ${req}/month total to meet planned deadlines.`;
      break;
    }

    case "goal_what_if_expense": {
      const red = formatCurrency(metrics.reductionAmount);
      const sim = metrics.simulation;
      if (sim) {
        answer = `What-If Simulation: Trimming ${red} monthly would lower expenses to ${formatCurrency(sim.simulated.monthlyExpense)} and raise your potential savings capacity to ${formatCurrency(sim.simulated.savingsCapacity)}/month (+${formatCurrency(sim.monthlyDifference)}/month). Note: Simulation is hypothetical and does not alter real records.`;
      } else {
        answer = `Trimming ${red} in monthly expenses increases your available savings capacity by ${red} each month.`;
      }
      break;
    }

    case "goal_forecast_explanation": {
      const f = metrics.forecast;
      if (f) {
        const inc = formatCurrency(f.historicalAvgMonthlyIncome);
        const exp = formatCurrency(f.historicalAvgMonthlyExpense);
        const net = formatCurrency(f.netMonthlyCashFlow);
        const cap = formatCurrency(f.potentialMonthlySavingsCapacity);
        const projCap = formatCurrency(f.projectedSavingsCapacity);
        answer = `Savings Forecast Explanation: Based on ${f.historicalMonthsSampled} historical month${f.historicalMonthsSampled === 1 ? "" : "s"}, your average monthly income is ${inc} and expenses are ${exp}, producing net monthly cash flow of ${net} (savings capacity of ${cap}/month). Over the next ${f.horizonMonths} months, your projected savings capacity is ${projCap}. Sourced strictly from verified records; estimates are conservative scenarios, not guarantees.`;
      } else {
        answer = "Cash-flow forecast computes your projected net cash flow using historical income and expenses from saved records.";
      }
      break;
    }

    default:
      answer = `Analysis completed for ${period.label}.`;
    }
  }

  const updatedConversationContext = {
    previousIntent: intent,
    activePeriod: period?.type || conversationContext?.activePeriod || "current_month",
    activeCategory: resolvedCategory || conversationContext?.activeCategory || null,
    activeMonth: period?.month ? `${period.year}-${String(period.month).padStart(2, "0")}` : null,
    turnCount: (conversationContext?.turnCount || 0) + 1,
  };

  const followUpSuggestions = buildFollowUpSuggestions(intent, metrics, resolvedCategory);

  const finalCharacterState =
    explicitCharacterState || inferCharacterStateForResult(intent, metrics, isRefusal);

  return {
    intent,
    period: period
      ? {
          startDate: period.startDate,
          endDate: period.endDate,
          label: period.label,
        }
      : null,
    metrics,
    characterState: finalCharacterState,
    actionPreview: actionPreview || null,
    navigationAction: navigationAction || null,
    responseStyle: preferences?.responseStyle || "friendly",
    answer,
    confidence: confidence || "high",
    provenance,
    privacyNotice: PRIVACY_NOTICE,
    suggestions: suggestions.length > 0 ? suggestions : followUpSuggestions,
    followUpSuggestions,
    conversationContext: updatedConversationContext,
  };
};
