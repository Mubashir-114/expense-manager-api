import { styleWithGemini } from "./providers/geminiProvider.js";
import { styleWithGroq } from "./providers/groqProvider.js";
import { assertOutboundPolicy, DATA_CLASSIFICATIONS } from "./outboundPolicy.js";

const GENERIC_MESSAGES = Object.freeze({
  welcome: "Hello. I am here and ready to help.",
  ready: "Whenever you are ready, we can begin.",
  processing: "I am working on that now.",
  complete: "All set. Here is what I found.",
  retry: "I could not complete that step. Please try again.",
});

const ALLOWED_TONES = new Set(["warm", "concise", "calm"]);
const ALLOWED_PAYLOAD_KEYS = new Set(["messageId", "sourceText", "tone"]);
const FORBIDDEN_KEY_PATTERN =
  /(transaction|balance|account|budget|saving|goal|amount|category|report|question|conversation|name|personality|sms|bank|user|history)/i;
const FINANCIAL_OR_PERSONAL_TEXT_PATTERN =
  /(?:[$€£₹¥]|\b\d+(?:[.,]\d+)?\b|transaction|balance|account|budget|saving|goal|spend|income|expense|bank|sms|my\s|i\s+(?:spent|earn|owe|have)|@)/i;

export const isExternalLanguageEnabled = (env = process.env) =>
  env.FIN_EXTERNAL_LANGUAGE_ENABLED === "true";

export const assertFinLanguageConfiguration = (env = process.env) => {
  if (!isExternalLanguageEnabled(env)) return false;

  if (!new Set(["groq", "gemini"]).has(env.FIN_LANGUAGE_PROVIDER)) {
    const error = new Error(
      "FIN_LANGUAGE_PROVIDER must be either groq or gemini when external language styling is enabled."
    );
    error.code = "INVALID_FIN_LANGUAGE_PROVIDER";
    throw error;
  }

  const keyName = env.FIN_LANGUAGE_PROVIDER === "groq" ? "GROQ_API_KEY" : "GEMINI_API_KEY";
  if (!env[keyName] || !String(env[keyName]).trim()) {
    const error = new Error(`${keyName} is required when FIN external language styling is enabled.`);
    error.code = "MISSING_FIN_LANGUAGE_API_KEY";
    throw error;
  }
  return true;
};

/**
 * Default-deny guard for the complete payload crossing the adapter boundary.
 * Only catalog-owned, context-free phrases can pass. Arbitrary caller text is
 * never accepted, even when it happens to look harmless.
 */
export const assertStyleOnlyPayload = (payload) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw privacyError("Style payload must be an object.");
  }

  const keys = Object.keys(payload);
  if (keys.some((key) => !ALLOWED_PAYLOAD_KEYS.has(key) || FORBIDDEN_KEY_PATTERN.test(key))) {
    throw privacyError("Style payload contains a non-allowlisted field.");
  }
  if (keys.length !== 3 || !keys.every((key) => ALLOWED_PAYLOAD_KEYS.has(key))) {
    throw privacyError("Style payload is incomplete.");
  }
  if (!Object.hasOwn(GENERIC_MESSAGES, payload.messageId)) {
    throw privacyError("Style message is not in the context-free catalog.");
  }
  if (payload.sourceText !== GENERIC_MESSAGES[payload.messageId]) {
    throw privacyError("Style text must exactly match its catalog entry.");
  }
  if (!ALLOWED_TONES.has(payload.tone)) {
    throw privacyError("Style tone is not allowlisted.");
  }
  if (FINANCIAL_OR_PERSONAL_TEXT_PATTERN.test(payload.sourceText)) {
    throw privacyError("Style text contains financial or personal context.");
  }
  return true;
};

export const styleGenericMessage = async (
  { messageId, tone = "warm" },
  { env = process.env, fetchImpl = globalThis.fetch } = {}
) => {
  if (!Object.hasOwn(GENERIC_MESSAGES, messageId)) {
    throw privacyError("Unknown context-free message id.");
  }

  const payload = { messageId, sourceText: GENERIC_MESSAGES[messageId], tone };
  assertStyleOnlyPayload(payload);

  if (!isExternalLanguageEnabled(env)) {
    return { text: payload.sourceText, provider: "local", external: false };
  }

  assertFinLanguageConfiguration(env);
  assertOutboundPolicy({
    classification: DATA_CLASSIFICATIONS.NON_SENSITIVE_CONVERSATION,
    payload,
    provider: env.FIN_LANGUAGE_PROVIDER,
    env,
  });
  try {
    const text = env.FIN_LANGUAGE_PROVIDER === "groq"
      ? await styleWithGroq(payload, { apiKey: env.GROQ_API_KEY, fetchImpl, env })
      : await styleWithGemini(payload, { apiKey: env.GEMINI_API_KEY, fetchImpl, env });
    return { text, provider: env.FIN_LANGUAGE_PROVIDER, external: true };
  } catch {
    // Styling is optional. FIN's trusted deterministic response remains usable.
    return { text: payload.sourceText, provider: "local", external: false };
  }
};

const privacyError = (message) => {
  const error = new Error(`FIN language privacy guard denied payload: ${message}`);
  error.code = "FIN_LANGUAGE_PRIVACY_DENIED";
  return error;
};
