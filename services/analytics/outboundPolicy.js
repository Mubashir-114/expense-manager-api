/**
 * FinTrack 2.0 - Phase 5A Outbound Privacy Policy & Egress Firewall
 *
 * Invariant: Phase 5A operates under a strict DEFAULT-DENY outbound network policy.
 * The analytics module has no general-purpose HTTP client, prohibits external
 * LLM/AI services (OpenAI, Anthropic, Gemini, external endpoints), and blocks
 * user-supplied URLs, localhost bypasses, private-network pivots, and DNS tricks.
 */

// Explicit empty allowlist for Phase 5A analytics module.
// By default, NO external or remote destinations are permitted.
export const ALLOWED_EGRESS_DESTINATIONS = Object.freeze([]);

// Prohibited external AI and telemetry environment variables that have no approved
// role in FinTrack and must cause startup to fail closed.
export const PROHIBITED_PROVIDER_ENV_VARS = Object.freeze([
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "EXTERNAL_LLM_URL",
  "EXTERNAL_AI_ENDPOINT",
  "COHERE_API_KEY",
  "MISTRAL_API_KEY",
  "HUGGINGFACE_API_KEY",
]);

// Approved external conversational AI providers and keys for non-sensitive operations
export const APPROVED_EXTERNAL_CONVERSATIONAL_PROVIDERS = Object.freeze([
  "gemini",
  "groq",
]);

export const APPROVED_CONVERSATIONAL_PROVIDER_KEYS = Object.freeze([
  "GEMINI_API_KEY",
  "GROQ_API_KEY",
]);

// FinTrack Data Classification Hierarchy
export const DATA_CLASSIFICATIONS = Object.freeze({
  PRIVATE_FINANCIAL_ANALYTICS: "PRIVATE_FINANCIAL_ANALYTICS",
  FINTRACK_REGISTERED_DATA: "FINTRACK_REGISTERED_DATA",
  SMS_OR_BANK_SOURCE_DATA: "SMS_OR_BANK_SOURCE_DATA",
  NON_SENSITIVE_CONVERSATION: "NON_SENSITIVE_CONVERSATION",
  PROFILE_SAFE_CONTEXT: "PROFILE_SAFE_CONTEXT",
  UNKNOWN: "UNKNOWN",
});

const SENSITIVE_KEY_PATTERN =
  /(transaction|transactions|balance|balances|account|accounts|budget|budgets|saving|savings|goal|goals|amount|category|report|forecast|allowance|overrun|sms|bank|merchant|salary|income|expense|spend|card|detected_transaction)/i;

const SENSITIVE_TEXT_PATTERN =
  /(?:[$€£₹¥]|\b\d+(?:[.,]\d+)?\b|transaction|balance|account|budget|saving|goal|spend|income|expense|bank|sms|my\s|i\s+(?:spent|earn|owe|have)|credit\s+card|debit\s+card|upi|neft|wallet|salary)/i;

/**
 * Recursively inspects a payload for any sensitive financial, account, budget,
 * goal, transaction, or SMS content.
 */
export const hasSensitiveFinancialContent = (val, visited = new Set()) => {
  if (val === null || val === undefined) return false;
  if (typeof val === "number" || typeof val === "bigint") return true;
  if (typeof val === "string") {
    return SENSITIVE_TEXT_PATTERN.test(val);
  }
  if (typeof val !== "object") return false;

  if (visited.has(val)) return false;
  visited.add(val);

  if (Array.isArray(val)) {
    return val.some((item) => hasSensitiveFinancialContent(item, visited));
  }

  for (const [key, propVal] of Object.entries(val)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      return true;
    }
    if (hasSensitiveFinancialContent(propVal, visited)) {
      return true;
    }
  }

  return false;
};

/**
 * Classifies an outbound payload based on its content and structure.
 */
export const classifyOutboundData = (payload) => {
  if (!payload || typeof payload !== "object") {
    if (typeof payload === "string" && SENSITIVE_TEXT_PATTERN.test(payload)) {
      return DATA_CLASSIFICATIONS.PRIVATE_FINANCIAL_ANALYTICS;
    }
    return DATA_CLASSIFICATIONS.UNKNOWN;
  }

  const keys = Object.keys(payload);
  const isSmsOrBank = keys.some((k) => /(sms|sms_hash|sender|detected_transactions?)/i.test(k));
  if (isSmsOrBank) return DATA_CLASSIFICATIONS.SMS_OR_BANK_SOURCE_DATA;

  const isRegisteredData = keys.some((k) => /(transactions?|accounts?|budgets?|goals?)/i.test(k));
  if (isRegisteredData) return DATA_CLASSIFICATIONS.FINTRACK_REGISTERED_DATA;

  const isAnalytics = keys.some((k) => /(insights|metrics|allowance|overrun|forecast|spending_trend)/i.test(k));
  if (isAnalytics) return DATA_CLASSIFICATIONS.PRIVATE_FINANCIAL_ANALYTICS;

  if (payload.messageId && payload.sourceText && payload.tone) {
    if (!hasSensitiveFinancialContent(payload)) {
      return DATA_CLASSIFICATIONS.NON_SENSITIVE_CONVERSATION;
    }
  }

  if (keys.length > 0 && keys.every((k) => /^(tone|assistantTone|theme)$/i.test(k))) {
    if (!hasSensitiveFinancialContent(payload)) {
      return DATA_CLASSIFICATIONS.PROFILE_SAFE_CONTEXT;
    }
  }

  if (hasSensitiveFinancialContent(payload)) {
    return DATA_CLASSIFICATIONS.PRIVATE_FINANCIAL_ANALYTICS;
  }

  return DATA_CLASSIFICATIONS.UNKNOWN;
};

export const createOutboundPrivacyError = (message, code = "OUTBOUND_PRIVACY_BLOCKED") => {
  const error = new Error(`PRIVACY POLICY VIOLATION: ${message}`);
  error.code = code;
  return error;
};

/**
 * Enforces runtime outbound privacy boundary before network transmission.
 *
 * Rules:
 * - PRIVATE_FINANCIAL_ANALYTICS: external provider NEVER allowed
 * - FINTRACK_REGISTERED_DATA: trusted local/backend analysis allowed; external provider NEVER receives raw data
 * - SMS_OR_BANK_SOURCE_DATA: external provider NEVER allowed; FIN has no direct acquisition access
 * - NON_SENSITIVE_CONVERSATION: external provider allowed ONLY if explicitly enabled
 * - PROFILE_SAFE_CONTEXT: allowed only according to existing approved Phase 5 policy
 * - Unknown/unclassified data: DENY by default (fail closed)
 * - Sensitive financial content in payload: REJECT immediately before network execution
 */
export const assertOutboundPolicy = ({
  classification,
  payload,
  provider,
  destination,
  env = process.env,
} = {}) => {
  const effectiveClassification =
    classification || (payload ? classifyOutboundData(payload) : DATA_CLASSIFICATIONS.UNKNOWN);

  if (
    !effectiveClassification ||
    !Object.values(DATA_CLASSIFICATIONS).includes(effectiveClassification) ||
    effectiveClassification === DATA_CLASSIFICATIONS.UNKNOWN
  ) {
    throw createOutboundPrivacyError(
      "Outbound payload is unknown or unclassified. Denied by default fail-closed policy.",
      "UNKNOWN_OUTBOUND_CLASSIFICATION"
    );
  }

  if (effectiveClassification === DATA_CLASSIFICATIONS.PRIVATE_FINANCIAL_ANALYTICS) {
    throw createOutboundPrivacyError(
      "PRIVATE_FINANCIAL_ANALYTICS must never be sent to any external AI provider or destination.",
      "PRIVATE_ANALYTICS_EXTERNAL_BLOCKED"
    );
  }

  if (effectiveClassification === DATA_CLASSIFICATIONS.FINTRACK_REGISTERED_DATA) {
    throw createOutboundPrivacyError(
      "FINTRACK_REGISTERED_DATA is restricted to trusted local/backend analysis. Raw financial data must never be transmitted externally.",
      "RAW_FINANCIAL_DATA_EXTERNAL_BLOCKED"
    );
  }

  if (effectiveClassification === DATA_CLASSIFICATIONS.SMS_OR_BANK_SOURCE_DATA) {
    throw createOutboundPrivacyError(
      "SMS_OR_BANK_SOURCE_DATA is strictly prohibited from external egress. FIN has no direct acquisition access.",
      "SMS_BANK_DATA_EXTERNAL_BLOCKED"
    );
  }

  if (hasSensitiveFinancialContent(payload)) {
    throw createOutboundPrivacyError(
      "Payload contains sensitive financial, account, budget, goal, transaction, or SMS data. External transmission is blocked.",
      "SENSITIVE_FINANCIAL_DATA_BLOCKED"
    );
  }

  if (
    effectiveClassification === DATA_CLASSIFICATIONS.NON_SENSITIVE_CONVERSATION ||
    effectiveClassification === DATA_CLASSIFICATIONS.PROFILE_SAFE_CONTEXT
  ) {
    const isEnabled = env.FIN_EXTERNAL_LANGUAGE_ENABLED === "true";
    if (!isEnabled) {
      throw createOutboundPrivacyError(
        "External conversational AI is disabled by configuration. External egress is prohibited; local fallback must be used.",
        "EXTERNAL_AI_DISABLED"
      );
    }

    const selectedProvider = provider || env.FIN_LANGUAGE_PROVIDER;
    if (!APPROVED_EXTERNAL_CONVERSATIONAL_PROVIDERS.includes(selectedProvider)) {
      throw createOutboundPrivacyError(
        `Provider "${selectedProvider}" is not an approved conversational AI provider.`,
        "UNAPPROVED_CONVERSATIONAL_PROVIDER"
      );
    }

    return true;
  }

  throw createOutboundPrivacyError(
    "Denied by default outbound privacy policy.",
    "OUTBOUND_POLICY_BLOCKED"
  );
};

export const isOutboundAllowed = (options) => {
  try {
    return assertOutboundPolicy(options);
  } catch {
    return false;
  }
};

/**
 * Checks for unauthorized external AI/LLM configurations.
 * Fails closed immediately if an unauthorized provider is configured (e.g. OpenAI, Anthropic, external URL endpoints).
 *
 * Presence of approved external conversational AI keys (GEMINI_API_KEY, GROQ_API_KEY)
 * does NOT cause startup to fail, but runtime outbound access remains blocked for sensitive data.
 */
export const assertNoProhibitedProvidersConfigured = (
  env = process.env,
  { allowFinLanguageStyleProvider = true } = {}
) => {
  const violations = [];
  for (const envVar of PROHIBITED_PROVIDER_ENV_VARS) {
    if (env[envVar] && String(env[envVar]).trim().length > 0) {
      violations.push(envVar);
    }
  }

  if (violations.length > 0) {
    const error = new Error(
      `PRIVACY POLICY VIOLATION: External AI/LLM providers are prohibited for FinTrack sensitive financial analytics. Prohibited configuration detected: ${violations.join(", ")}`
    );
    error.code = "PROHIBITED_EXTERNAL_AI_CONFIGURED";
    throw error;
  }

  const hasGemini = Boolean(env.GEMINI_API_KEY && String(env.GEMINI_API_KEY).trim().length > 0);
  const hasGroq = Boolean(env.GROQ_API_KEY && String(env.GROQ_API_KEY).trim().length > 0);
  const externalConfigured = hasGemini || hasGroq;

  return {
    externalConfigured,
    hasGemini,
    hasGroq,
    externalLanguageEnabled: env.FIN_EXTERNAL_LANGUAGE_ENABLED === "true",
  };
};

/**
 * Validates that an outbound destination is explicitly permitted.
 * Blocks:
 * - Unknown protocols (ftp, file, gopher, etc.)
 * - Localhost and loopback bypasses (127.0.0.1, localhost, 0.0.0.0, [::1], hex/octal/decimal IPs)
 * - Private RFC 1918 / link-local networks (10.x, 172.16-31.x, 192.168.x, 169.254.x)
 * - Any host not in the explicit allowlist (default empty)
 */
export const verifyOutboundDestination = (destinationUrl) => {
  if (!destinationUrl || typeof destinationUrl !== "string") {
    const error = new Error("Invalid destination URL");
    error.code = "INVALID_DESTINATION";
    throw error;
  }

  let parsed;
  try {
    parsed = new URL(destinationUrl);
  } catch {
    const error = new Error("Malformed destination URL");
    error.code = "MALFORMED_DESTINATION";
    throw error;
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== "https:" && protocol !== "http:") {
    const error = new Error(`Prohibited protocol: ${protocol}`);
    error.code = "PROHIBITED_PROTOCOL";
    throw error;
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block localhost, loopbacks, and link-local addresses
  const isLoopbackOrLocal =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^0x[0-9a-f]+$/i.test(hostname) ||
    /^0[0-7]+$/.test(hostname) ||
    /^\d+$/.test(hostname); // alternate integer IP representations

  if (isLoopbackOrLocal) {
    const error = new Error("Prohibited local or loopback destination");
    error.code = "BLOCKED_LOOPBACK_DESTINATION";
    throw error;
  }

  // Block RFC 1918 and link-local private ranges
  const isPrivateIp =
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^169\.254\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname);

  if (isPrivateIp) {
    const error = new Error("Prohibited private-network destination");
    error.code = "BLOCKED_PRIVATE_IP";
    throw error;
  }

  // Check against the explicit allowlist
  const isAllowlisted = ALLOWED_EGRESS_DESTINATIONS.some((allowed) => {
    return hostname === allowed || hostname.endsWith(`.${allowed}`);
  });

  if (!isAllowlisted) {
    const error = new Error(
      "Outbound network transmission is strictly denied by Phase 5A default-deny privacy policy."
    );
    error.code = "OUTBOUND_EGRESS_DENIED";
    throw error;
  }

  return true;
};
