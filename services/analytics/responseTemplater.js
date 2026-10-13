/**
 * FinTrack 2.0 - Phase 5A Safe Controlled Response Templater
 *
 * Invariant: Private financial data is converted into natural language
 * strictly via controlled deterministic templates. No external LLMs, no generative
 * hallucinations, and no inclusion of private SMS text or unauthorized fields.
 */

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

export const formatTemplateResponse = ({
  intent,
  period,
  metrics,
  question,
  isRefusal,
  refusalReason,
  refusalMessage,
  suggestions = [],
}) => {
  if (isRefusal || intent === "unsupported") {
    return {
      intent: intent || "unsupported",
      isRefusal: Boolean(isRefusal),
      refusalReason: refusalReason || "unsupported_query",
      period: period ? { startDate: period.startDate, endDate: period.endDate, label: period.label } : null,
      metrics: null,
      answer:
        refusalMessage ||
        "This query is not supported by FinTrack Phase 5A analytics. Please select from one of the supported financial analytics questions.",
      provenance: null,
      privacyNotice: PRIVACY_NOTICE,
      suggestions,
    };
  }

  const provenance = buildProvenance({
    recordCount: metrics.transactionCount || metrics.totalTransactions || 0,
    startDate: period.startDate,
    endDate: period.endDate,
  });

  let answer = "";

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

    case "budget_status": {
      const count = metrics.totalBudgets || 0;
      if (count === 0) {
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

    default:
      answer = `Analysis completed for ${period.label}.`;
  }

  return {
    intent,
    period: {
      startDate: period.startDate,
      endDate: period.endDate,
      label: period.label,
    },
    metrics,
    answer,
    provenance,
    privacyNotice: PRIVACY_NOTICE,
    suggestions,
  };
};
