/**
 * FinTrack 2.0 - Phase 5E FIN Personality & Natural Dialogue Engine
 *
 * Invariant: FIN is a warm, intelligent, emotionally expressive financial companion.
 * Deterministic facts are separated from personality wording.
 * Never claims human consciousness or real-person status.
 * Never fabricates financial calculations or promises guaranteed outcomes.
 * Strictly domain-restricted to FinTrack capabilities and personal financial guidance.
 */

import {
  getCapabilityById,
  validateActionParameters,
} from "./capabilityRegistry.js";

export const FIN_CHARACTER_STATES = Object.freeze({
  IDLE: "idle",
  GREETING: "greeting",
  LISTENING: "listening",
  THINKING: "thinking",
  EXPLAINING: "explaining",
  HAPPY: "happy",
  CELEBRATING: "celebrating",
  CONCERNED: "concerned",
  CONFUSED: "confused",
  ERROR: "error",
});

/**
 * Deterministically select a response variant based on turnCount or seed
 */
const pickVariant = (variants, turnCount = 0) => {
  if (!variants || variants.length === 0) return "";
  const index = Math.abs(Number(turnCount) || 0) % variants.length;
  return variants[index];
};

/**
 * Formats user's name greeting if enabled.
 */
const formatNamePrefix = (preferences) => {
  if (
    preferences?.enablePersonalizedGreetings &&
    preferences?.preferredName &&
    preferences.preferredName.trim().length > 0
  ) {
    return `, ${preferences.preferredName.trim()}`;
  }
  return "";
};

/**
 * Handles greetings with variations and personalized name.
 */
export const composeGreetingResponse = ({ preferences, turnCount = 0 }) => {
  const name = formatNamePrefix(preferences);
  const style = preferences?.responseStyle || "friendly";

  if (style === "concise") {
    return {
      characterState: FIN_CHARACTER_STATES.GREETING,
      answer: `Hey${name}! Ready to help. What financial numbers or goals are we checking?`,
      suggestions: [
        { intent: "total_spending", question: "How much did I spend this month?", label: "Total Spending" },
        { intent: "budget_status", question: "How are my budgets doing?", label: "Budget Status" },
        { intent: "goal_status_summary", question: "Which goal is closest to completion?", label: "Savings Goals" },
      ],
    };
  }

  const variants = [
    `Hey there${name}! Good to see you. Want to check how your money's doing, or is there something specific on your mind?`,
    `Hi${name}! Always great to catch up with you. Let me know what you'd like to look into today — budgets, spending, or savings goals?`,
    `Hello${name}! Ready when you are. We can check this month's spending or dive into your financial plans. What shall we look at?`,
  ];

  return {
    characterState: FIN_CHARACTER_STATES.GREETING,
    answer: pickVariant(variants, turnCount),
    suggestions: [
      { intent: "total_spending", question: "How much did I spend this month?", label: "Total Spending" },
      { intent: "budget_status", question: "How are my budgets doing?", label: "Budget Status" },
      { intent: "savings_opportunities", question: "Where can I save money?", label: "Savings Opportunities" },
      { intent: "goal_status_summary", question: "Which goal is closest to completion?", label: "Goals Overview" },
    ],
  };
};

/**
 * Handles friendly smalltalk ("How are you?", "Who are you?", etc.).
 */
export const composeSmalltalkResponse = ({ subType = "how_are_you", preferences, turnCount = 0 }) => {
  const name = formatNamePrefix(preferences);
  const style = preferences?.responseStyle || "friendly";

  if (subType === "who_are_you") {
    return {
      characterState: FIN_CHARACTER_STATES.HAPPY,
      answer:
        style === "concise"
          ? "I'm FIN, your FinTrack financial companion. I help you track spending, monitor budgets, and plan savings goals deterministically."
          : `I'm FIN, your personal FinTrack financial companion! I'm here to help you understand your spending, keep your budgets on track, explore savings goals, and explain your financial reports. All your data stays private and strictly on your device and account.`,
      suggestions: [
        { intent: "total_spending", question: "How much did I spend this month?", label: "Check Spending" },
        { intent: "budget_status", question: "How are my budgets doing?", label: "Check Budgets" },
        { intent: "goal_recommended_saving", question: "How much should I save each month?", label: "Savings Advice" },
      ],
    };
  }

  if (subType === "thank_you") {
    const variants = [
      `You're very welcome${name}! Happy to help keep your finances clear. Anything else you'd like to inspect?`,
      `Anytime${name}! That's what I'm here for. Let me know if you need any other breakdowns.`,
      `Glad I could help${name}! Keep up the great financial momentum.`,
    ];
    return {
      characterState: FIN_CHARACTER_STATES.HAPPY,
      answer: pickVariant(variants, turnCount),
      suggestions: [
        { intent: "budget_status", question: "How are my budgets doing?", label: "Budgets" },
        { intent: "goal_status_summary", question: "Which goal is closest to completion?", label: "Goals" },
      ],
    };
  }

  if (subType === "goodbye") {
    return {
      characterState: FIN_CHARACTER_STATES.GREETING,
      answer: `Take care${name}! I'll be right here whenever you want to check in on your money. Have a great day!`,
      suggestions: [],
    };
  }

  // Default "how are you"
  const variants = [
    "Ready to help! I've got your budgets, goals and reports covered. What shall we look at?",
    "Doing great and keeping an eye on your finances! How are you feeling about your money today?",
    "Energized and ready to crunch the numbers! What would you like to review first?",
  ];

  return {
    characterState: FIN_CHARACTER_STATES.HAPPY,
    answer: pickVariant(variants, turnCount),
    suggestions: [
      { intent: "total_spending", question: "How much did I spend this month?", label: "Spending Review" },
      { intent: "budget_status", question: "How are my budgets doing?", label: "Budgets" },
      { intent: "savings_opportunities", question: "Where can I save money?", label: "Find Savings" },
    ],
  };
};

/**
 * Handles supportive responses to user financial concerns.
 */
export const composeEmotionalConcernResponse = ({ concernType = "spending", preferences, turnCount = 0 }) => {
  const name = formatNamePrefix(preferences);
  const style = preferences?.responseStyle || "friendly";

  if (concernType === "spending") {
    if (style === "concise") {
      return {
        characterState: FIN_CHARACTER_STATES.CONCERNED,
        answer: "We can see exactly what changed. Let's compare recent spending with last month and identify your biggest expense categories.",
        suggestions: [
          { intent: "spending_trend", question: "How does my spending compare to last month?", label: "Compare to Last Month" },
          { intent: "category_comparison", question: "Which category increased the most?", label: "Biggest Category Spike" },
          { intent: "largest_expenses", question: "What were my largest expenses this month?", label: "Top Expenses" },
        ],
      };
    }

    const variants = [
      `We can figure out what's changed${name}. Want me to compare your recent spending with the previous month to see where the shift happened?`,
      `It's completely normal to feel that way sometimes${name}. Let's look at the verified numbers together — we can check your category trends and find any unexpected spikes.`,
      `Don't worry, we can get full clarity${name}. I'll help you look at which categories grew the most so you can make confident adjustments.`,
    ];

    return {
      characterState: FIN_CHARACTER_STATES.CONCERNED,
      answer: pickVariant(variants, turnCount),
      suggestions: [
        { intent: "spending_trend", question: "How does my spending compare to last month?", label: "Compare Trend" },
        { intent: "category_comparison", question: "Which category increased the most?", label: "Largest Increase" },
        { intent: "savings_opportunities", question: "Where can I save money?", label: "Savings Opportunities" },
      ],
    };
  }

  // Concern about savings
  if (style === "concise") {
    return {
      characterState: FIN_CHARACTER_STATES.CONCERNED,
      answer: "We can analyze your savings capacity together. Let's review your goals and cash-flow forecast to set an achievable monthly target.",
      suggestions: [
        { intent: "goal_affordability", question: "Can I afford to save ₹5,000 monthly?", label: "Test ₹5,000 Target" },
        { intent: "goal_status_summary", question: "Which goal is closest to completion?", label: "Inspect Goals" },
        { intent: "goal_forecast_explanation", question: "Explain my savings forecast", label: "Cash-Flow Forecast" },
      ],
    };
  }

  const variants = [
    `We can work through the numbers together${name}. I'll check your saved goals and spending history, then we can look at a plan that feels manageable.`,
    `Building savings takes steady steps${name}. Let's review what you're currently saving and see where small trims can free up more for your goals.`,
    `You're not alone in that${name}. We can simulate realistic monthly savings targets based on your actual income and expenses so you know where you stand.`,
  ];

  return {
    characterState: FIN_CHARACTER_STATES.CONCERNED,
    answer: pickVariant(variants, turnCount),
    suggestions: [
      { intent: "goal_recommended_saving", question: "How much should I save each month?", label: "Recommended Saving" },
      { intent: "goal_status_summary", question: "Which goal is closest to completion?", label: "Goals Progress" },
      { intent: "savings_opportunities", question: "Where can I save money?", label: "Savings Opportunities" },
    ],
  };
};

/**
 * Handles application navigation guidance.
 */
export const composeNavigationResponse = ({ targetRoute, featureName, preferences }) => {
  const name = formatNamePrefix(preferences);

  return {
    characterState: FIN_CHARACTER_STATES.EXPLAINING,
    answer: `Taking you to ${featureName || targetRoute}${name}. You can also explore reports, budgets, or planning shortcuts below.`,
    navigationAction: {
      route: targetRoute,
    },
    suggestions: [
      { intent: "total_spending", question: "How much did I spend this month?", label: "Spending" },
      { intent: "budget_status", question: "How are my budgets doing?", label: "Budgets" },
    ],
  };
};

/**
 * Handles financial report requests (e.g., "Show me last month's expense report").
 */
export const composeReportRequestResponse = ({ periodLabel = "last month", preferences }) => {
  const name = formatNamePrefix(preferences);

  return {
    characterState: FIN_CHARACTER_STATES.EXPLAINING,
    answer: `Here's your expense and financial report overview for ${periodLabel}${name}. You can review category breakdowns and monthly net savings below, or open the detailed Reports screen.`,
    navigationAction: {
      route: "/reports",
    },
    suggestions: [
      { intent: "spending_by_category", question: "Show my spending breakdown by category", label: "Category Breakdown" },
      { intent: "income_vs_expense", question: "What is my income vs expenses summary?", label: "Cash Flow" },
      { intent: "largest_expenses", question: "What were my largest expenses this month?", label: "Top Expenses" },
    ],
  };
};

/**
 * Handles goal planning requests (e.g., "FIN, help me save ₹50,000 for a laptop").
 */
export const composeGoalPlanningResponse = ({
  goalName = "Goal",
  targetAmount = 50000,
  months = null,
  preferences,
}) => {
  const name = formatNamePrefix(preferences);
  const formattedAmount = `₹${Number(targetAmount).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  const targetMonths = months || 6;
  const monthlyNeed = Math.round(targetAmount / targetMonths);
  const formattedMonthly = `₹${monthlyNeed.toLocaleString("en-IN")}`;

  const actionPreview = {
    capability: "create_savings_goal",
    title: `Create Goal: ${goalName}`,
    description: `Create a new savings goal '${goalName}' targeting ${formattedAmount}`,
    parameters: {
      name: goalName,
      targetAmount: Number(targetAmount),
      targetDate: new Date(Date.now() + targetMonths * 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10),
      startingAmount: 0,
      description: `Targeting ${formattedAmount} over approximately ${targetMonths} months (~${formattedMonthly}/month)`,
    },
    impact:
      "This records a goal in your FinTrack savings planner. It will not transfer, debit, or hold any real bank funds.",
    requiresConfirmation: true,
  };

  return {
    characterState: FIN_CHARACTER_STATES.EXPLAINING,
    answer: `Saving ${formattedAmount} for "${goalName}" is a great target${name}! Over ${targetMonths} months, you would aim to save approximately ${formattedMonthly} per month. I have prepared this goal plan below. Review the preview and confirm when you're ready to save it.`,
    actionPreview,
    suggestions: [
      { intent: "goal_affordability", question: `Can I afford to save ${formattedMonthly} monthly?`, label: "Check Affordability" },
      { intent: "savings_opportunities", question: "Where can I save money?", label: "Trim Expenses" },
      { intent: "goal_status_summary", question: "Which goal is closest to completion?", label: "Current Goals" },
    ],
  };
};

/**
 * Out-of-domain refusal with polite, brief redirection.
 */
export const composeOutOfDomainResponse = ({ topic = "unrelated topics", preferences }) => {
  const name = formatNamePrefix(preferences);

  return {
    characterState: FIN_CHARACTER_STATES.CONFUSED,
    answer: `I'm FIN, your FinTrack financial companion${name}! I don't know much about ${topic} — my specialty is keeping your money, budgets, savings goals, and financial reports in great shape. What financial topic shall we check?`,
    suggestions: [
      { intent: "total_spending", question: "How much did I spend this month?", label: "Total Spending" },
      { intent: "budget_status", question: "How are my budgets doing?", label: "Budget Status" },
      { intent: "goal_status_summary", question: "Which goal is closest to completion?", label: "Savings Goals" },
      { intent: "savings_opportunities", question: "Where can I save money?", label: "Savings Ideas" },
    ],
  };
};

/**
 * Explains calculation methodology deterministically.
 */
export const composeCalculationExplanation = ({ target = "general", preferences }) => {
  const name = formatNamePrefix(preferences);

  return {
    characterState: FIN_CHARACTER_STATES.EXPLAINING,
    answer: `Here is exactly how FinTrack computes your numbers${name}:\n• Verified records: We only sum confirmed transactions owned by your account.\n• Minor-unit precision: Calculations preserve exact two-decimal precision.\n• Budget comparisons: Spend percentage is (Category Spending ÷ Active Budget Limit) × 100%.\n• No estimation: Projections and what-if scenarios are always explicitly labeled and never mixed with saved records.`,
    suggestions: [
      { intent: "budget_status", question: "How are my budgets doing?", label: "Inspect Budgets" },
      { intent: "spending_trend", question: "How does my spending compare to last month?", label: "Spending Trend" },
    ],
  };
};

/**
 * Maps analytics query outcome to a character state.
 */
export const inferCharacterStateForResult = (intent, metrics, isRefusal = false) => {
  if (isRefusal) {
    return FIN_CHARACTER_STATES.CONFUSED;
  }

  switch (intent) {
    case "budget_status": {
      if (metrics?.exceededCount > 0 || metrics?.isExceeded) {
        return FIN_CHARACTER_STATES.CONCERNED;
      }
      if (metrics?.onTrackCount > 0) {
        return FIN_CHARACTER_STATES.HAPPY;
      }
      return FIN_CHARACTER_STATES.EXPLAINING;
    }

    case "income_vs_expense": {
      if (metrics?.netSavings > 0) {
        return FIN_CHARACTER_STATES.CELEBRATING;
      }
      if (metrics?.netSavings < 0) {
        return FIN_CHARACTER_STATES.CONCERNED;
      }
      return FIN_CHARACTER_STATES.EXPLAINING;
    }

    case "goal_status_summary":
    case "goal_completion_estimate": {
      if (metrics?.completedCount > 0 || (metrics?.progressPercentage && metrics.progressPercentage >= 100)) {
        return FIN_CHARACTER_STATES.CELEBRATING;
      }
      return FIN_CHARACTER_STATES.HAPPY;
    }

    case "goal_affordability": {
      if (metrics?.isAffordable) {
        return FIN_CHARACTER_STATES.HAPPY;
      }
      return FIN_CHARACTER_STATES.CONCERNED;
    }

    case "unusual_spending": {
      if (metrics?.anomalyCount > 0) {
        return FIN_CHARACTER_STATES.CONCERNED;
      }
      return FIN_CHARACTER_STATES.HAPPY;
    }

    case "clarification_needed":
      return FIN_CHARACTER_STATES.CONFUSED;

    case "explain_calculation":
      return FIN_CHARACTER_STATES.EXPLAINING;

    default:
      return FIN_CHARACTER_STATES.EXPLAINING;
  }
};
