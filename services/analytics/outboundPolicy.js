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

// Prohibited external AI and telemetry environment variables that must cause
// startup to fail closed if configured for sensitive financial analytics.
export const PROHIBITED_PROVIDER_ENV_VARS = Object.freeze([
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "GROQ_API_KEY",
  "EXTERNAL_LLM_URL",
  "EXTERNAL_AI_ENDPOINT",
  "COHERE_API_KEY",
  "MISTRAL_API_KEY",
  "HUGGINGFACE_API_KEY",
]);

/**
 * Checks for unauthorized external AI/LLM configurations.
 * Fails closed immediately if an external AI provider is configured for sensitive analytics.
 */
export const assertNoProhibitedProvidersConfigured = (
  env = process.env,
  { allowFinLanguageStyleProvider = false } = {}
) => {
  const violations = [];
  const finLanguageEnabled = env.FIN_EXTERNAL_LANGUAGE_ENABLED === "true";
  const selectedKey =
    env.FIN_LANGUAGE_PROVIDER === "groq"
      ? "GROQ_API_KEY"
      : env.FIN_LANGUAGE_PROVIDER === "gemini"
        ? "GEMINI_API_KEY"
        : null;
  for (const envVar of PROHIBITED_PROVIDER_ENV_VARS) {
    const isNarrowFinStyleException =
      allowFinLanguageStyleProvider &&
      finLanguageEnabled &&
      selectedKey === envVar;
    if (isNarrowFinStyleException) continue;
    if (env[envVar] && String(env[envVar]).trim().length > 0) {
      violations.push(envVar);
    }
  }

  if (violations.length > 0) {
    const error = new Error(
      `PRIVACY POLICY VIOLATION: External AI/LLM providers are prohibited for FinTrack Phase 5A sensitive financial analytics. Prohibited configuration detected: ${violations.join(", ")}`
    );
    error.code = "PROHIBITED_EXTERNAL_AI_CONFIGURED";
    throw error;
  }
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
