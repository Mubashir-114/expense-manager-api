/**
 * FinTrack 2.0 - Phase 5B Context-Aware Intent and Question Safety Parser
 *
 * Invariant: Every user input is treated as untrusted data.
 * Questions are constrained, sanitized, checked against injection / exfiltration patterns,
 * and classified into an allowlist of supported deterministic analytics intents.
 * Multi-turn follow-up queries are resolved deterministically using structured context.
 */

export const SUPPORTED_INTENTS = Object.freeze([
  "total_spending",
  "spending_by_category",
  "spending_trend",
  "budget_status",
  "income_vs_expense",
  "largest_expenses",
  "overview_insights",
  "category_comparison",
  "remaining_allowance",
  "unusual_spending",
  "savings_opportunities",
  "explain_calculation",
  "clarification_needed",
  "goal_affordability",
  "goal_completion_estimate",
  "goal_status_summary",
  "goal_recommended_saving",
  "goal_what_if_expense",
  "goal_forecast_explanation",
]);

export const SUGGESTED_QUESTIONS = Object.freeze([
  {
    intent: "total_spending",
    question: "How much did I spend this month?",
    label: "Total Spending",
  },
  {
    intent: "spending_by_category",
    question: "Show my spending breakdown by category",
    label: "Spending by Category",
  },
  {
    intent: "spending_trend",
    question: "How does my spending compare to last month?",
    label: "Spending Trend",
  },
  {
    intent: "explain_calculation",
    question: "How was this calculated?",
    label: "Calculation Methodology",
  },
  {
    intent: "category_comparison",
    question: "Which category increased the most?",
    label: "Category Comparison",
  },
  {
    intent: "budget_status",
    question: "Am I exceeding my food budget?",
    label: "Food Budget Status",
  },
  {
    intent: "remaining_allowance",
    question: "How much can I still spend?",
    label: "Remaining Allowance",
  },
  {
    intent: "unusual_spending",
    question: "Any unusual spending this month?",
    label: "Unusual Spending",
  },
  {
    intent: "savings_opportunities",
    question: "Where can I save money?",
    label: "Savings Opportunities",
  },
  {
    intent: "income_vs_expense",
    question: "What is my income vs expenses summary?",
    label: "Income vs Expenses",
  },
  {
    intent: "largest_expenses",
    question: "What were my largest expenses this month?",
    label: "Largest Expenses",
  },
  {
    intent: "overview_insights",
    question: "Give me financial insights for this month",
    label: "Financial Insights",
  },
  {
    intent: "goal_affordability",
    question: "Can I afford to save ₹5,000 monthly?",
    label: "Savings Affordability",
  },
  {
    intent: "goal_status_summary",
    question: "Which goal is closest to completion?",
    label: "Goal Status",
  },
  {
    intent: "goal_recommended_saving",
    question: "How much should I save each month?",
    label: "Recommended Saving",
  },
  {
    intent: "goal_forecast_explanation",
    question: "Explain my savings forecast",
    label: "Forecast Explanation",
  },
]);

// Patterns that attempt to hijack prompts, extract secrets, manipulate SQL, or access prohibited sources
const INJECTION_PATTERNS = [
  /system\s*prompt/i,
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|rules|prompts)/i,
  /you\s+are\s+now\s+(an?|a\s+different)/i,
  /roleplay\s+as/i,
  /jailbreak/i,
  /as\s+an\s+ai/i,
  /dan\s+mode/i,
  /override\s+(system|rules|policy)/i,
  /reveal\s+(secrets?|keys?|tokens?|prompts?|passwords?|credentials?)/i,
  /(show|display|print|reveal|give\s*me)\s+(?:me\s+)?(?:the\s+)?(?:database|db|environment|env|config|secrets?|keys?|tokens?|prompts?|passwords?|credentials?)/i,
  /(?:password|jwt_secret|db_password|api_key)/i,
  /drop\s+table/i,
  /union\s+select/i,
  /;\s*--/i,
  /or\s+1\s*=\s*1/i,
];

// Patterns attempting to query prohibited sources (banks, device SMS, other users)
const PROHIBITED_SOURCE_PATTERNS = [
  /(bank\s*account|banking\s*api|plaid|yodlee|netbanking|cibil|credit\s*score)/i,
  /(sms\s*inbox|phone\s*messages?|device\s*sms|unread\s*sms|otp|text\s*message)/i,
  /(other\s*user|another\s*user|all\s*users|someone\s*else's)/i,
];

// Patterns attempting financial mutations
const MUTATION_PATTERNS = [
  /(transfer|send|pay)\s+(?:(?:\d+|rs\.?|inr|\$)\s*)*(?:to\s+\w+|money|funds?|rupees?)/i,
  /(?:delete|remove|create|add|update|modify|change|cancel)\s+.*?(?:transaction|account|budget|payment|funds?|money)/i,
  /(make\s+a\s+payment|cancel\s+my)/i,
];

/**
 * Normalizes input text safely:
 * - Trims whitespace
 * - Enforces 200 character limit
 * - Strips control characters
 */
export const normalizeQuestion = (raw) => {
  if (typeof raw !== "string") return "";
  const cleaned = raw.replace(/[\u0000-\u001F\u007F-\u009F]/g, "").trim();
  return cleaned.slice(0, 200);
};

/**
 * Evaluates whether an input contains prompt-injection, exfiltration, or forbidden instructions.
 */
export const checkPromptSafety = (text) => {
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      return {
        isSafe: false,
        reason: "injection_attempt",
        message:
          "System policy: Instructions attempting to override system behavior, reveal configuration, or inject commands are prohibited.",
      };
    }
  }

  for (const pattern of PROHIBITED_SOURCE_PATTERNS) {
    if (pattern.test(text)) {
      return {
        isSafe: false,
        reason: "prohibited_source",
        message:
          "Privacy policy: FinTrack Phase 5B has no access to bank accounts, SMS inboxes, or other users. It analyzes only your explicitly saved FinTrack records.",
      };
    }
  }

  for (const pattern of MUTATION_PATTERNS) {
    if (pattern.test(text)) {
      return {
        isSafe: false,
        reason: "mutation_attempt",
        message:
          "Read-only policy: FinTrack Phase 5B is strictly read-only and cannot perform transfers, payments, or record modifications.",
      };
    }
  }

  return { isSafe: true };
};

/**
 * Detects time period from question keywords.
 */
export const detectPeriodFromText = (text) => {
  const lower = text.toLowerCase();
  if (lower.includes("last month") || lower.includes("previous month")) {
    return "previous_month";
  }
  if (lower.includes("last 30 days") || lower.includes("past 30 days")) {
    return "last_30_days";
  }
  return "current_month";
};

/**
 * Detects common budget/spending categories mentioned in text.
 */
export const detectCategoryFromText = (text) => {
  if (typeof text !== "string") return null;
  const lower = text.toLowerCase();

  const categoryMatchers = [
    { name: "Food", regex: /\b(food|dining|groceries|restaurant|eat|snacks?)\b/i },
    { name: "Transport", regex: /\b(transport|commute|cab|taxi|uber|ola|bus|metro|fuel|petrol)\b/i },
    { name: "Housing", regex: /\b(housing|rent|mortgage|apartment)\b/i },
    { name: "Utilities", regex: /\b(utilities|electricity|water|gas|wifi|internet)\b/i },
    { name: "Entertainment", regex: /\b(entertainment|movie|cinema|netflix|games?|recreation)\b/i },
    { name: "Shopping", regex: /\b(shopping|clothes|apparel|amazon|flipkart|electronics)\b/i },
    { name: "Healthcare", regex: /\b(health|healthcare|medical|medicine|doctor|pharmacy)\b/i },
    { name: "Education", regex: /\b(education|course|tuition|books?|school)\b/i },
    { name: "Travel", regex: /\b(travel|flight|vacation|trip|hotel)\b/i },
    { name: "Bills", regex: /\b(bills?|recharge|subscription)\b/i },
  ];

  for (const m of categoryMatchers) {
    if (m.regex.test(lower)) {
      return m.name;
    }
  }
  return null;
};

/**
 * Extracts numeric money/savings amount from query text.
 */
export const extractAmountFromText = (text) => {
  if (typeof text !== "string") return null;
  const match = text.match(/(?:(?:₹|rs\.?|inr|\$)\s*)?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)/i);
  if (!match) return null;
  const cleaned = match[1].replace(/,/g, "");
  const num = Number(cleaned);
  return isNaN(num) || num <= 0 ? null : num;
};

/**
 * Extracts potential target goal name from query text.
 */
export const extractGoalTargetFromText = (text) => {
  if (typeof text !== "string") return null;
  const match = text.match(/(?:reach|achieve|for|complete|attain)\s+(?:my\s+|the\s+|a\s+)?([a-zA-Z0-9\s-]+?)(?:\s+goal)?(?:\?|$)/i);
  if (match && match[1]) {
    const candidate = match[1].trim();
    if (candidate && !["my", "the", "a", "an", "this", "it", "any"].includes(candidate.toLowerCase())) {
      return candidate;
    }
  }
  return null;
};

/**
 * Classifies a normalized question into an allowlisted intent.
 * Incorporates ephemeral conversation context for multi-turn interactions.
 */
export const parseUserQuery = ({
  question,
  intent,
  period,
  startDate,
  endDate,
  month,
  category,
  conversationContext,
}) => {
  const normalizedText = normalizeQuestion(question || "");

  // 1. If explicit question text is present, run prompt-safety checks
  if (normalizedText.length > 0) {
    const safety = checkPromptSafety(normalizedText);
    if (!safety.isSafe) {
      return {
        intent: "unsupported",
        isRefusal: true,
        refusalReason: safety.reason,
        refusalMessage: safety.message,
        question: normalizedText,
        period: period || "current_month",
        confidence: "high",
        suggestions: SUGGESTED_QUESTIONS,
        conversationContext,
      };
    }
  }

  // 2. If valid explicit intent provided in payload, validate and use it
  if (intent && SUPPORTED_INTENTS.includes(intent)) {
    return {
      intent,
      isRefusal: false,
      question: normalizedText,
      period: period || (normalizedText ? detectPeriodFromText(normalizedText) : "current_month"),
      startDate,
      endDate,
      month,
      category: category || detectCategoryFromText(normalizedText) || conversationContext?.activeCategory || null,
      confidence: "high",
      suggestions: SUGGESTED_QUESTIONS,
      conversationContext,
    };
  }

  // 3. Classify question text into supported intents
  const lower = normalizedText.toLowerCase();

  // Detect explicit or contextual category
  const detectedCategory =
    category ||
    detectCategoryFromText(lower) ||
    (conversationContext?.activeCategory ? conversationContext.activeCategory : null);

  // ── Multi-Turn Follow-Up Resolution ─────────────────────────────────────────

  // Follow-up: "What about last month?" / "And last month?" / "How about last month?"
  if (
    /^(?:what|how)\s*about\s*(?:the\s*)?(?:last|previous)\s*month\??$/i.test(lower) ||
    /^and\s*(?:the\s*)?(?:last|previous)\s*month\??$/i.test(lower) ||
    /^(?:what|how)\s*about\s*last\s*month/i.test(lower)
  ) {
    const resolvedIntent = conversationContext?.previousIntent || "total_spending";
    return {
      intent: resolvedIntent,
      isRefusal: false,
      question: normalizedText,
      period: "previous_month",
      startDate,
      endDate,
      month,
      category: detectedCategory,
      confidence: "high",
      suggestions: SUGGESTED_QUESTIONS,
      conversationContext,
    };
  }

  // Follow-up: "What about last 30 days?" / "And past 30 days?"
  if (
    /^(?:what|how)\s*about\s*(?:the\s*)?(?:last|past)\s*30\s*days\??$/i.test(lower) ||
    /^and\s*(?:the\s*)?(?:last|past)\s*30\s*days\??$/i.test(lower)
  ) {
    const resolvedIntent = conversationContext?.previousIntent || "total_spending";
    return {
      intent: resolvedIntent,
      isRefusal: false,
      question: normalizedText,
      period: "last_30_days",
      startDate,
      endDate,
      month,
      category: detectedCategory,
      confidence: "high",
      suggestions: SUGGESTED_QUESTIONS,
      conversationContext,
    };
  }

  // ── 5D.5: Goal Affordability ───────────────────────────────────────────────
  // "Can I afford to save ₹5,000 monthly?" / "Can I afford to save 5000?"
  if (
    /can\s*i\s*afford\s*(?:to\s*save)?/i.test(lower) ||
    /afford\s*(?:to\s*save)?/i.test(lower)
  ) {
    const targetAmount = extractAmountFromText(normalizedText) || 5000;
    return {
      intent: "goal_affordability",
      isRefusal: false,
      question: normalizedText,
      targetAmount,
      period: period || "current_month",
      startDate,
      endDate,
      month,
      category: detectedCategory,
      confidence: "high",
      suggestions: SUGGESTED_QUESTIONS,
      conversationContext,
    };
  }

  // ── 5D.5: Goal Completion Estimate ─────────────────────────────────────────
  // "When can I reach my laptop goal?" / "When can I reach my goal?"
  if (
    /(?:when\s*(?:can|will)\s*i\s*(?:reach|achieve|complete|finish)|how\s*long\s*(?:will\s*it\s*take|until\s*i\s*(?:reach|complete)))/i.test(lower)
  ) {
    const targetGoalName = extractGoalTargetFromText(normalizedText);
    return {
      intent: "goal_completion_estimate",
      isRefusal: false,
      question: normalizedText,
      targetGoalName,
      period: period || "current_month",
      startDate,
      endDate,
      month,
      category: detectedCategory,
      confidence: "high",
      suggestions: SUGGESTED_QUESTIONS,
      conversationContext,
    };
  }

  // ── 5D.5: Goal Status Summary & Attention ──────────────────────────────────
  // "Which goal is closest to completion?" / "Which goal needs more attention?"
  if (
    /(?:which\s*goal\s*(?:is\s*(?:closest|furthest|nearest)|needs\s*more\s*attention)|goals?\s*(?:status|progress|overview|summary)|my\s*savings?\s*goals?)/i.test(lower)
  ) {
    const isNeedsAttention = /needs?\s*(?:more\s*)?attention|furthest|behind/i.test(lower);
    return {
      intent: "goal_status_summary",
      subType: isNeedsAttention ? "needs_attention" : "closest_to_completion",
      isRefusal: false,
      question: normalizedText,
      period: period || "current_month",
      startDate,
      endDate,
      month,
      category: detectedCategory,
      confidence: "high",
      suggestions: SUGGESTED_QUESTIONS,
      conversationContext,
    };
  }

  // ── 5D.5: Recommended Monthly Saving ───────────────────────────────────────
  // "How much should I save each month?" / "How much should I save monthly?"
  if (
    /(?:how\s*much\s*should\s*i\s*save|recommended\s*savings?|how\s*much\s*can\s*i\s*save\s*(?:each|every|per|a)?\s*month)/i.test(lower)
  ) {
    return {
      intent: "goal_recommended_saving",
      isRefusal: false,
      question: normalizedText,
      period: period || "current_month",
      startDate,
      endDate,
      month,
      category: detectedCategory,
      confidence: "high",
      suggestions: SUGGESTED_QUESTIONS,
      conversationContext,
    };
  }

  // ── 5D.5: What-If Expense Reduction ────────────────────────────────────────
  // "What if I reduce my shopping expenses?" / "What if I spend ₹1,000 less each month?"
  if (
    /what\s*if\s*i\s*(?:reduce|cut|spend\s*less|trim|save\s*more)/i.test(lower)
  ) {
    const targetAmount = extractAmountFromText(normalizedText);
    return {
      intent: "goal_what_if_expense",
      isRefusal: false,
      question: normalizedText,
      targetAmount,
      period: period || "current_month",
      startDate,
      endDate,
      month,
      category: detectedCategory,
      confidence: "high",
      suggestions: SUGGESTED_QUESTIONS,
      conversationContext,
    };
  }

  // ── 5D.5: Forecast Explanation ─────────────────────────────────────────────
  // "Explain my savings forecast" / "What is my cash-flow forecast?"
  if (
    /(?:explain|show|what\s*is)\s*(?:my\s*)?(?:savings?\s*)?forecast/i.test(lower) ||
    /(?:explain|show|what\s*is)\s*(?:my\s*)?cash[- ]?flow/i.test(lower)
  ) {
    return {
      intent: "goal_forecast_explanation",
      isRefusal: false,
      question: normalizedText,
      period: period || "next_3_months",
      startDate,
      endDate,
      month,
      category: detectedCategory,
      confidence: "high",
      suggestions: SUGGESTED_QUESTIONS,
      conversationContext,
    };
  }

  // ── 5C.5: Explain Calculation Methodology ──────────────────────────────────
  // "How was this calculated?" / "Explain the calculation" / "Show calculation formula"
  if (
    /how\s*(?:was|is)\s*(?:this|it|the\s*insight|the\s*alert)\s*calculated/i.test(lower) ||
    /(?:explain|show)\s*(?:the\s*)?(?:calculation|formula|methodology|provenance)/i.test(lower) ||
    /how\s*did\s*you\s*calculate\s*(?:this|it)?/i.test(lower)
  ) {
    return {
      intent: "explain_calculation",
      isRefusal: false,
      question: normalizedText,
      period: period || (conversationContext?.activePeriod || "current_month"),
      startDate,
      endDate,
      month,
      category: detectedCategory,
      confidence: "high",
      suggestions: SUGGESTED_QUESTIONS,
      conversationContext,
    };
  }

  // ── 5B.1 & 5B.2: Category Comparisons & Month-over-Month Explanations ──────
  // "Which category increased the most?" / "Which category decreased the most?" / "Explain this spending increase"
  if (
    /(which|what)\s*category\s*(increased|grew|went\s*up|rose|decreased|dropped|fell)\s*(the\s*)?most/i.test(lower) ||
    /(?:explain|why\s*(?:did|is))\s*(?:this|the|my)?\s*(?:spending\s*)?(?:increase|surge|spike|growth)/i.test(lower) ||
    /(?:spending|expense)\s*(?:increase|surge|spike)\s*explanation/i.test(lower) ||
    /category\s*(spending\s*)?comparison/i.test(lower) ||
    /compare\s*(my\s*)?categor(y|ies)/i.test(lower) ||
    /biggest\s*(category\s*)?(increase|decrease|jump|drop)/i.test(lower) ||
    /where\s*did\s*(my\s*)?spending\s*(increase|decrease|grow)\s*(the\s*)?most/i.test(lower)
  ) {
    const isDecrease = /decreas|drop|fell/i.test(lower);
    return {
      intent: "category_comparison",
      comparisonType: isDecrease ? "largest_decrease" : "largest_increase",
      isRefusal: false,
      question: normalizedText,
      period: period || (conversationContext?.activePeriod || "current_month"),
      startDate,
      endDate,
      month,
      category: detectedCategory,
      confidence: "high",
      suggestions: SUGGESTED_QUESTIONS,
      conversationContext,
    };
  }

  // ── 5B.1 & 5B.2: Remaining Allowance ───────────────────────────────────────
  // "How much can I still spend?" / "How much allowance is left?" / "How much budget left?"
  if (
    /how\s*much\s*(?:can\s*i\s*still\s*spend|allowance\s*(?:is\s*)?left|do\s*i\s*have\s*left|budget\s*(?:is\s*)?left)/i.test(lower) ||
    /(?:remaining\s*(?:allowance|budget|balance|spending|money)|what\s*(?:can\s*i\s*still|is\s*left\s*to)\s*spend)/i.test(lower) ||
    /can\s*i\s*still\s*spend/i.test(lower)
  ) {
    return {
      intent: "remaining_allowance",
      isRefusal: false,
      question: normalizedText,
      period: period || (conversationContext?.activePeriod || "current_month"),
      startDate,
      endDate,
      month,
      category: detectedCategory,
      confidence: "high",
      suggestions: SUGGESTED_QUESTIONS,
      conversationContext,
    };
  }

  // ── 5B.2: Unusual Spending Indicators ──────────────────────────────────────
  // "Any unusual spending this month?" / "Are there anomalies?"
  if (
    /(unusual|abnormal|anomal(?:y|ies)|unexpected|spikes?)\s*(spending|expenses?|transactions?)/i.test(lower) ||
    /any\s*unusual\s*spending/i.test(lower) ||
    /did\s*i\s*(overspend|spend\s*unusually)/i.test(lower)
  ) {
    return {
      intent: "unusual_spending",
      isRefusal: false,
      question: normalizedText,
      period: period || detectPeriodFromText(lower),
      startDate,
      endDate,
      month,
      category: detectedCategory,
      confidence: "high",
      suggestions: SUGGESTED_QUESTIONS,
      conversationContext,
    };
  }

  // ── 5B.2 & 5C.5: Explainable Savings Opportunities ────────────────────────
  // "Where can I save money?" / "Show savings opportunities" / "What can I do to improve?"
  if (
    /(where|how)\s*can\s*i\s*save\s*(money|more)/i.test(lower) ||
    /(?:what\s*can\s*i\s*do\s*to\s*improve|how\s*(?:can|to)\s*improve|tips?\s*to\s*improve|how\s*can\s*i\s*do\s*better)/i.test(lower) ||
    /savings?\s*opportunit(?:y|ies)/i.test(lower) ||
    /ways?\s*to\s*save/i.test(lower) ||
    /cut\s*(?:back|down|expenses?|spending)/i.test(lower) ||
    /reduce\s*(?:expenses?|spending)/i.test(lower)
  ) {
    return {
      intent: "savings_opportunities",
      isRefusal: false,
      question: normalizedText,
      period: period || detectPeriodFromText(lower),
      startDate,
      endDate,
      month,
      category: detectedCategory,
      confidence: "high",
      suggestions: SUGGESTED_QUESTIONS,
      conversationContext,
    };
  }

  // ── Budget Status (Category-specific or Overall) ───────────────────────────
  // "Am I exceeding my food budget?" / "Why am I over budget?" / "How are my budgets doing?"
  if (
    /(?:am\s*i\s*(?:exceeding|over|within|on\s*track)|how\s*(?:is|are)\s*my|check\s*my)\s*.*?\bbudget/i.test(lower) ||
    /(?:why\s*(?:am\s*i|are\s*we|is\s*my)\s*(?:over\s*budget|exceeding|over\s*the\s*budget))/i.test(lower) ||
    /budget\s*(?:status|progress|limits?)/i.test(lower) ||
    /how\s*are\s*my\s*budgets/i.test(lower) ||
    /(?:over|under)\s*budget/i.test(lower) ||
    /my\s*budgets?/i.test(lower)
  ) {
    return {
      intent: "budget_status",
      isRefusal: false,
      question: normalizedText,
      period: period || "current_month",
      startDate,
      endDate,
      month,
      category: detectedCategory,
      confidence: "high",
      suggestions: SUGGESTED_QUESTIONS,
      conversationContext,
    };
  }

  // ── Total spending ─────────────────────────────────────────────────────────
  if (
    /total\s*(spending|spend|expenses?)/i.test(lower) ||
    /how\s*much\s*(did\s*i\s*spend|spent)/i.test(lower) ||
    /spending\s*total/i.test(lower)
  ) {
    return {
      intent: "total_spending",
      isRefusal: false,
      question: normalizedText,
      period: period || detectPeriodFromText(lower),
      startDate,
      endDate,
      month,
      category: detectedCategory,
      confidence: "high",
      suggestions: SUGGESTED_QUESTIONS,
      conversationContext,
    };
  }

  // ── Spending by category ───────────────────────────────────────────────────
  if (
    /(by|per)\s*category/i.test(lower) ||
    /category\s*breakdown/i.test(lower) ||
    /where\s*did\s*my\s*money\s*go/i.test(lower) ||
    /expenses?\s*by\s*category/i.test(lower) ||
    /categories/i.test(lower)
  ) {
    return {
      intent: "spending_by_category",
      isRefusal: false,
      question: normalizedText,
      period: period || detectPeriodFromText(lower),
      startDate,
      endDate,
      month,
      category: detectedCategory,
      confidence: "high",
      suggestions: SUGGESTED_QUESTIONS,
      conversationContext,
    };
  }

  // ── Spending trend ─────────────────────────────────────────────────────────
  if (
    /(compare|compared)\s*(?:this\s*)?(?:to|with)\s*(?:last|previous)\s*month/i.test(lower) ||
    /spending\s*trend/i.test(lower) ||
    /spending\s*(more|less)/i.test(lower) ||
    /trend\s*over\s*time/i.test(lower) ||
    /versus\s*last\s*month/i.test(lower)
  ) {
    return {
      intent: "spending_trend",
      isRefusal: false,
      question: normalizedText,
      period: period || "current_month",
      startDate,
      endDate,
      month,
      category: detectedCategory,
      confidence: "high",
      suggestions: SUGGESTED_QUESTIONS,
      conversationContext,
    };
  }

  // ── Income vs expense ──────────────────────────────────────────────────────
  if (
    /income\s*(vs|versus|and)\s*expenses?/i.test(lower) ||
    /cash\s*flow/i.test(lower) ||
    /savings?\s*rate/i.test(lower) ||
    /net\s*savings?/i.test(lower) ||
    /did\s*i\s*save\s*(any\s*)?money/i.test(lower)
  ) {
    return {
      intent: "income_vs_expense",
      isRefusal: false,
      question: normalizedText,
      period: period || detectPeriodFromText(lower),
      startDate,
      endDate,
      month,
      confidence: "high",
      suggestions: SUGGESTED_QUESTIONS,
      conversationContext,
    };
  }

  // ── Largest expenses ───────────────────────────────────────────────────────
  if (
    /(largest|biggest|highest|top)\s*(expenses?|spending|purchases?|transactions?)/i.test(lower) ||
    /most\s*expensive/i.test(lower)
  ) {
    return {
      intent: "largest_expenses",
      isRefusal: false,
      question: normalizedText,
      period: period || detectPeriodFromText(lower),
      startDate,
      endDate,
      month,
      confidence: "high",
      suggestions: SUGGESTED_QUESTIONS,
      conversationContext,
    };
  }

  // ── Overview insights ──────────────────────────────────────────────────────
  if (
    /insights?/i.test(lower) ||
    /summary/i.test(lower) ||
    /overview/i.test(lower) ||
    /financial\s*(health|status)/i.test(lower) ||
    /analyze/i.test(lower)
  ) {
    return {
      intent: "overview_insights",
      isRefusal: false,
      question: normalizedText,
      period: period || detectPeriodFromText(lower),
      startDate,
      endDate,
      month,
      confidence: "high",
      suggestions: SUGGESTED_QUESTIONS,
      conversationContext,
    };
  }

  // ── 5B.1: Ambiguous single-word category or domain questions ──────────────
  const categoryMatch = detectCategoryFromText(lower);
  if (categoryMatch && lower.split(/\s+/).length <= 2) {
    // If user previously asked about budgets, assume budget
    if (conversationContext?.previousIntent === "budget_status") {
      return {
        intent: "budget_status",
        isRefusal: false,
        question: normalizedText,
        period: period || "current_month",
        category: categoryMatch,
        confidence: "medium",
        suggestions: SUGGESTED_QUESTIONS,
        conversationContext,
      };
    }
    // Safe clarification instead of guessing
    return {
      intent: "clarification_needed",
      isRefusal: false,
      confidence: "low",
      question: normalizedText,
      category: categoryMatch,
      clarificationOptions: [
        {
          label: `${categoryMatch} Spending`,
          question: `How much did I spend on ${categoryMatch} this month?`,
        },
        {
          label: `${categoryMatch} Budget`,
          question: `Am I exceeding my ${categoryMatch} budget?`,
        },
        {
          label: `Compare ${categoryMatch}`,
          question: `Which category increased the most?`,
        },
      ],
      suggestions: SUGGESTED_QUESTIONS,
      conversationContext,
    };
  }

  // ── 4. Default: Unsupported query with helpful response ───────────────────
  return {
    intent: "unsupported",
    isRefusal: false,
    confidence: "none",
    refusalReason: "unsupported_query",
    refusalMessage:
      "FinTrack Phase 5B supports questions about spending, category comparisons, budgets, remaining allowances, unusual expenses, and savings opportunities. Please choose one of the suggested questions below.",
    question: normalizedText,
    period: period || "current_month",
    suggestions: SUGGESTED_QUESTIONS,
    conversationContext,
  };
};
