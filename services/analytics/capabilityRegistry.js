/**
 * FinTrack 2.0 - Phase 5E Allowlisted FinTrack Capability Registry
 *
 * Invariant: FIN understands what FinTrack can actually do.
 * Maps natural intents and features to authorized capabilities.
 * Distinguishes read-only analytics from user-authorized write actions.
 * Zero dynamic SQL, zero external LLMs, zero unauthorized mutations.
 */

export const CAPABILITY_TYPES = Object.freeze({
  READ_ONLY: "read_only",
  USER_AUTHORIZED_ACTION: "user_authorized_action",
  NAVIGATION: "navigation",
});

export const FINTRACK_CAPABILITIES = Object.freeze([
  // ── Read-Only Financial Capabilities ───────────────────────────────────────
  {
    id: "get_total_spending",
    name: "Total Spending Summary",
    type: CAPABILITY_TYPES.READ_ONLY,
    domain: "analytics",
    description: "Calculates total expenditure over a requested or current financial period.",
    requiredParams: [],
    optionalParams: ["period", "month", "startDate", "endDate"],
    requiresConfirmation: false,
    route: "/analytics",
  },
  {
    id: "get_spending_by_category",
    name: "Category Spending Breakdown",
    type: CAPABILITY_TYPES.READ_ONLY,
    domain: "analytics",
    description: "Breaks down verified spending across distinct categories with totals and percentages.",
    requiredParams: [],
    optionalParams: ["period", "month"],
    requiresConfirmation: false,
    route: "/analytics",
  },
  {
    id: "get_spending_trend",
    name: "Period Spending Trend",
    type: CAPABILITY_TYPES.READ_ONLY,
    domain: "analytics",
    description: "Compares spending between current and prior periods to compute deltas and percentage changes.",
    requiredParams: [],
    optionalParams: ["period"],
    requiresConfirmation: false,
    route: "/analytics",
  },
  {
    id: "get_budget_status",
    name: "Budget Evaluation",
    type: CAPABILITY_TYPES.READ_ONLY,
    domain: "budgets",
    description: "Inspects active category budgets to evaluate on-track, approaching-limit, or exceeded status.",
    requiredParams: [],
    optionalParams: ["category", "month"],
    requiresConfirmation: false,
    route: "/budgets",
  },
  {
    id: "get_remaining_allowance",
    name: "Remaining Spendable Allowance",
    type: CAPABILITY_TYPES.READ_ONLY,
    domain: "budgets",
    description: "Computes residual unspent budget amounts and daily safe spend burn rates.",
    requiredParams: [],
    optionalParams: ["category"],
    requiresConfirmation: false,
    route: "/budgets",
  },
  {
    id: "get_unusual_spending",
    name: "Unusual Spending Anomaly Inspection",
    type: CAPABILITY_TYPES.READ_ONLY,
    domain: "analytics",
    description: "Identifies category spending spikes and large transactions relative to historical baseline.",
    requiredParams: [],
    optionalParams: ["period"],
    requiresConfirmation: false,
    route: "/analytics",
  },
  {
    id: "get_savings_opportunities",
    name: "Savings Opportunities Identification",
    type: CAPABILITY_TYPES.READ_ONLY,
    domain: "planning",
    description: "Calculates discretionary expense trimming and over-budget recoveries to optimize savings.",
    requiredParams: [],
    optionalParams: ["period"],
    requiresConfirmation: false,
    route: "/analytics",
  },
  {
    id: "get_income_vs_expense",
    name: "Cash Flow & Net Savings",
    type: CAPABILITY_TYPES.READ_ONLY,
    domain: "analytics",
    description: "Evaluates total verified income vs total verified expenses and net savings rate.",
    requiredParams: [],
    optionalParams: ["period"],
    requiresConfirmation: false,
    route: "/reports",
  },
  {
    id: "get_largest_expenses",
    name: "Top Expenses Breakdown",
    type: CAPABILITY_TYPES.READ_ONLY,
    domain: "analytics",
    description: "Retrieves the highest-value individual transaction records in the active period.",
    requiredParams: [],
    optionalParams: ["period"],
    requiresConfirmation: false,
    route: "/transactions",
  },
  {
    id: "get_proactive_alerts",
    name: "Smart Alerts Feed",
    type: CAPABILITY_TYPES.READ_ONLY,
    domain: "alerts",
    description: "Provides prioritized deterministic notifications on budgets, spikes, and savings opportunities.",
    requiredParams: [],
    optionalParams: ["budgetThreshold"],
    requiresConfirmation: false,
    route: "/analytics",
  },
  {
    id: "get_goal_status",
    name: "Savings Goals Progress & Status",
    type: CAPABILITY_TYPES.READ_ONLY,
    domain: "planning",
    description: "Evaluates goal completion percentages, deadlines, and urgency rankings.",
    requiredParams: [],
    optionalParams: ["goalId"],
    requiresConfirmation: false,
    route: "/planning",
  },
  {
    id: "get_cash_flow_forecast",
    name: "Cash-Flow Run-Rate Forecast",
    type: CAPABILITY_TYPES.READ_ONLY,
    domain: "planning",
    description: "Projects end-of-month cash surplus or deficit based on normalized daily spend velocity.",
    requiredParams: [],
    optionalParams: ["month"],
    requiresConfirmation: false,
    route: "/planning",
  },
  {
    id: "run_what_if_simulation",
    name: "What-If Scenario Simulation",
    type: CAPABILITY_TYPES.READ_ONLY,
    domain: "planning",
    description: "Simulates hypothetical expense cuts or income changes without modifying persisted database records.",
    requiredParams: ["scenarioType"],
    optionalParams: ["reductionPercentage", "savingsIncreaseAmount"],
    requiresConfirmation: false,
    route: "/planning",
  },
  {
    id: "explain_calculation",
    name: "Calculation Transparency & Methodology",
    type: CAPABILITY_TYPES.READ_ONLY,
    domain: "analytics",
    description: "Explains mathematical formulas, sample sizes, and provenance behind FinTrack numbers.",
    requiredParams: [],
    optionalParams: ["targetCalculation"],
    requiresConfirmation: false,
    route: "/analytics",
  },
  {
    id: "get_financial_report",
    name: "Financial Reports & Periods",
    type: CAPABILITY_TYPES.READ_ONLY,
    domain: "reports",
    description: "Retrieves structured monthly summaries, category breakdowns, and export previews.",
    requiredParams: [],
    optionalParams: ["month", "period"],
    requiresConfirmation: false,
    route: "/reports",
  },

  // ── Navigation Capabilities ────────────────────────────────────────────────
  {
    id: "navigate_feature",
    name: "Application Feature Navigation",
    type: CAPABILITY_TYPES.NAVIGATION,
    domain: "navigation",
    description: "Guides user directly to specific FinTrack feature views (Dashboard, Budgets, Reports, Goals).",
    requiredParams: ["targetRoute"],
    optionalParams: ["queryParams"],
    requiresConfirmation: false,
    supportedRoutes: ["/dashboard", "/transactions", "/budgets", "/reports", "/planning", "/profile", "/analytics"],
  },

  // ── User-Authorized Actions (Requiring Preview & Explicit Confirmation) ────
  {
    id: "create_savings_goal",
    name: "Create Savings Goal",
    type: CAPABILITY_TYPES.USER_AUTHORIZED_ACTION,
    domain: "planning",
    description: "Creates a new verified FinTrack savings goal with name, target amount, and deadline.",
    requiredParams: ["name", "targetAmount"],
    optionalParams: ["description", "targetDate", "startingAmount"],
    requiresConfirmation: true,
    impactDescription: "This will add a new goal to your FinTrack savings planner. It will not move or deduct any bank or wallet funds.",
    writeServiceEndpoint: "/api/goals",
  },
  {
    id: "add_goal_contribution",
    name: "Record Goal Contribution",
    type: CAPABILITY_TYPES.USER_AUTHORIZED_ACTION,
    domain: "planning",
    description: "Allocates tracked savings towards an existing goal without executing financial bank transfers.",
    requiredParams: ["goalId", "amount"],
    optionalParams: ["contributionDate", "note"],
    requiresConfirmation: true,
    impactDescription: "This records savings progress in your FinTrack goal tracker. No real-world bank transfers or account debits are performed.",
    writeServiceEndpoint: "/api/goals/:id/contribute",
  },
  {
    id: "update_companion_preferences",
    name: "Update FIN Preferences",
    type: CAPABILITY_TYPES.USER_AUTHORIZED_ACTION,
    domain: "companion",
    description: "Updates conversational relationship settings like preferred name, response style, and animations.",
    requiredParams: [],
    optionalParams: ["preferredName", "responseStyle", "enablePersonalizedGreetings", "enableCharacterAnimations"],
    requiresConfirmation: false,
    impactDescription: "Updates how FIN interacts with you. Can be edited or reset at any time.",
    writeServiceEndpoint: "/api/analytics/companion/preferences",
  },
]);

/**
 * Finds capability definition by ID.
 */
export const getCapabilityById = (id) => {
  return FINTRACK_CAPABILITIES.find((cap) => cap.id === id) || null;
};

/**
 * Validates parameters for an action preview.
 */
export const validateActionParameters = (capabilityId, params = {}) => {
  const capability = getCapabilityById(capabilityId);
  if (!capability) {
    return { isValid: false, message: `Unknown capability: ${capabilityId}` };
  }

  for (const required of capability.requiredParams) {
    if (params[required] === undefined || params[required] === null || params[required] === "") {
      return {
        isValid: false,
        message: `Missing required parameter '${required}' for capability '${capability.name}'`,
      };
    }
  }

  if (capabilityId === "create_savings_goal") {
    const num = Number(params.targetAmount);
    if (isNaN(num) || num <= 0) {
      return { isValid: false, message: "Target amount must be a positive number." };
    }
    if (typeof params.name !== "string" || params.name.trim().length === 0) {
      return { isValid: false, message: "Goal name is required." };
    }
  }

  if (capabilityId === "add_goal_contribution") {
    const num = Number(params.amount);
    if (isNaN(num) || num <= 0) {
      return { isValid: false, message: "Contribution amount must be a positive number." };
    }
    const goalId = Number(params.goalId);
    if (isNaN(goalId) || goalId <= 0) {
      return { isValid: false, message: "A valid goalId is required." };
    }
  }

  return { isValid: true };
};
