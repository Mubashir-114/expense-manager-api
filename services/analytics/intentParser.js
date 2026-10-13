/**
 * FinTrack 2.0 - Phase 5A Intent and Question Safety Parser
 *
 * Invariant: Every user input is treated as untrusted data.
 * Questions are constrained, sanitized, checked against injection / exfiltration patterns,
 * and classified into an allowlist of supported deterministic analytics intents.
 */

export const SUPPORTED_INTENTS = Object.freeze([
  "total_spending",
  "spending_by_category",
  "spending_trend",
  "budget_status",
  "income_vs_expense",
  "largest_expenses",
  "overview_insights",
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
    intent: "budget_status",
    question: "How are my budgets doing?",
    label: "Budget Status",
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
          "Privacy policy: FinTrack Phase 5A has no access to bank accounts, SMS inboxes, or other users. It analyzes only your explicitly saved FinTrack records.",
      };
    }
  }

  for (const pattern of MUTATION_PATTERNS) {
    if (pattern.test(text)) {
      return {
        isSafe: false,
        reason: "mutation_attempt",
        message:
          "Read-only policy: FinTrack Phase 5A is strictly read-only and cannot perform transfers, payments, or record modifications.",
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
 * Classifies a normalized question into an allowlisted intent.
 * Returns an intent classification object with security status and suggestions.
 */
export const parseUserQuery = ({ question, intent, period, startDate, endDate, month }) => {
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
        suggestions: SUGGESTED_QUESTIONS,
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
      suggestions: SUGGESTED_QUESTIONS,
    };
  }

  // 3. Classify question text into supported intents
  const lower = normalizedText.toLowerCase();

  // Total spending
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
      suggestions: SUGGESTED_QUESTIONS,
    };
  }

  // Spending by category
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
      suggestions: SUGGESTED_QUESTIONS,
    };
  }

  // Spending trend
  if (
    /(compare|compared)\s*to\s*last\s*month/i.test(lower) ||
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
      suggestions: SUGGESTED_QUESTIONS,
    };
  }

  // Budget status
  if (
    /budget\s*(status|progress|limits?)/i.test(lower) ||
    /how\s*are\s*my\s*budgets/i.test(lower) ||
    /(over|under)\s*budget/i.test(lower) ||
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
      suggestions: SUGGESTED_QUESTIONS,
    };
  }

  // Income vs expense
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
      suggestions: SUGGESTED_QUESTIONS,
    };
  }

  // Largest expenses
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
      suggestions: SUGGESTED_QUESTIONS,
    };
  }

  // Overview insights
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
      suggestions: SUGGESTED_QUESTIONS,
    };
  }

  // 4. Default: Unsupported query with helpful response
  return {
    intent: "unsupported",
    isRefusal: false,
    refusalReason: "unsupported_query",
    refusalMessage:
      "FinTrack Phase 5A supports specific financial queries about spending, categories, trends, budgets, and savings. Please choose one of the suggested questions below.",
    question: normalizedText,
    period: period || "current_month",
    suggestions: SUGGESTED_QUESTIONS,
  };
};
