import assert from "node:assert/strict";
import test from "node:test";

import {
  assertNoProhibitedProvidersConfigured,
  assertOutboundPolicy,
  isOutboundAllowed,
  DATA_CLASSIFICATIONS,
  classifyOutboundData,
  hasSensitiveFinancialContent,
} from "../services/analytics/outboundPolicy.js";
import {
  analyticsKeyGenerator,
  analyticsRateLimiter,
} from "../routes/analyticsRoutes.js";
import { styleGenericMessage } from "../services/analytics/finLanguageAdapter.js";

// ── TASK 3 REGRESSION TESTS ──────────────────────────────────────────────────

test("1. Backend can start when GEMINI_API_KEY exists", () => {
  const env = { GEMINI_API_KEY: "dummy-gemini-test-key" };
  let result;
  assert.doesNotThrow(() => {
    result = assertNoProhibitedProvidersConfigured(env);
  });
  assert.equal(result.externalConfigured, true);
  assert.equal(result.hasGemini, true);
  assert.equal(result.hasGroq, false);
});

test("2. Backend can start when GROQ_API_KEY exists", () => {
  const env = { GROQ_API_KEY: "dummy-groq-test-key" };
  let result;
  assert.doesNotThrow(() => {
    result = assertNoProhibitedProvidersConfigured(env);
  });
  assert.equal(result.externalConfigured, true);
  assert.equal(result.hasGemini, false);
  assert.equal(result.hasGroq, true);
});

test("3. Backend can start when both exist", () => {
  const env = {
    GEMINI_API_KEY: "dummy-gemini-test-key",
    GROQ_API_KEY: "dummy-groq-test-key",
  };
  let result;
  assert.doesNotThrow(() => {
    result = assertNoProhibitedProvidersConfigured(env);
  });
  assert.equal(result.externalConfigured, true);
  assert.equal(result.hasGemini, true);
  assert.equal(result.hasGroq, true);
});

test("4. Mere presence of external keys does not enable financial-data outbound access", () => {
  const env = {
    FIN_EXTERNAL_LANGUAGE_ENABLED: "true",
    FIN_LANGUAGE_PROVIDER: "groq",
    GEMINI_API_KEY: "dummy-gemini-test-key",
    GROQ_API_KEY: "dummy-groq-test-key",
  };

  // Financial payload must still be rejected even though both keys exist
  assert.throws(
    () =>
      assertOutboundPolicy({
        classification: DATA_CLASSIFICATIONS.PRIVATE_FINANCIAL_ANALYTICS,
        payload: { totalSpent: 50000, category: "Groceries" },
        provider: "groq",
        env,
      }),
    (err) => err.code === "PRIVATE_ANALYTICS_EXTERNAL_BLOCKED"
  );

  assert.equal(
    isOutboundAllowed({
      classification: DATA_CLASSIFICATIONS.PRIVATE_FINANCIAL_ANALYTICS,
      payload: { totalSpent: 50000 },
      provider: "groq",
      env,
    }),
    false
  );
});

test("5. Transaction data is rejected by outbound policy", () => {
  const transactionPayloads = [
    { transactions: [{ id: 1, amount: 1500, title: "Supermarket" }] },
    { type: "expense", amount: 200, category: "Food" },
    { tx: { merchant: "Swiggy", amountMinor: 45000n } },
  ];

  for (const payload of transactionPayloads) {
    assert.equal(hasSensitiveFinancialContent(payload), true);
    assert.throws(
      () =>
        assertOutboundPolicy({
          classification: DATA_CLASSIFICATIONS.FINTRACK_REGISTERED_DATA,
          payload,
          provider: "gemini",
        }),
      (err) =>
        err.code === "RAW_FINANCIAL_DATA_EXTERNAL_BLOCKED" ||
        err.code === "SENSITIVE_FINANCIAL_DATA_BLOCKED"
    );

    // Also fails if falsely tagged as non-sensitive conversation
    assert.throws(
      () =>
        assertOutboundPolicy({
          classification: DATA_CLASSIFICATIONS.NON_SENSITIVE_CONVERSATION,
          payload,
          provider: "gemini",
          env: { FIN_EXTERNAL_LANGUAGE_ENABLED: "true" },
        }),
      (err) => err.code === "SENSITIVE_FINANCIAL_DATA_BLOCKED"
    );
  }
});

test("6. Account/balance data is rejected", () => {
  const accountPayloads = [
    { accountId: 10, balance: 50000, bankName: "SBI" },
    { balanceMinor: 5000000n, accountType: "savings" },
    { accounts: [{ name: "HDFC Salary", balance: 125000 }] },
  ];

  for (const payload of accountPayloads) {
    assert.equal(hasSensitiveFinancialContent(payload), true);
    assert.throws(
      () =>
        assertOutboundPolicy({
          classification: DATA_CLASSIFICATIONS.FINTRACK_REGISTERED_DATA,
          payload,
          provider: "groq",
        }),
      (err) =>
        err.code === "RAW_FINANCIAL_DATA_EXTERNAL_BLOCKED" ||
        err.code === "SENSITIVE_FINANCIAL_DATA_BLOCKED"
    );
    assert.equal(
      isOutboundAllowed({
        classification: DATA_CLASSIFICATIONS.FINTRACK_REGISTERED_DATA,
        payload,
        provider: "groq",
      }),
      false
    );
  }
});

test("7. Budget/goal financial data is rejected", () => {
  const budgetGoalPayloads = [
    { budgetLimit: 20000, spent: 18000, overrun: 0 },
    { goalId: 4, targetAmount: 100000, savedAmount: 45000 },
    { budget: { categoryId: 3, limitMinor: 1500000n } },
  ];

  for (const payload of budgetGoalPayloads) {
    assert.equal(hasSensitiveFinancialContent(payload), true);
    assert.throws(
      () =>
        assertOutboundPolicy({
          classification: DATA_CLASSIFICATIONS.PRIVATE_FINANCIAL_ANALYTICS,
          payload,
          provider: "gemini",
        }),
      (err) =>
        err.code === "PRIVATE_ANALYTICS_EXTERNAL_BLOCKED" ||
        err.code === "SENSITIVE_FINANCIAL_DATA_BLOCKED"
    );
    assert.equal(isOutboundAllowed({ payload, provider: "gemini" }), false);
  }
});

test("8. SMS content/candidates are rejected", () => {
  const smsPayloads = [
    { smsText: "INR 1,200.00 debited from a/c **4321 via UPI", sender: "AXISBK" },
    { detectedTransactions: [{ id: 9, status: "suggested", rawSms: "debited 500" }] },
    { sms_hash: "abcd1234efgh5678", amount: 350 },
  ];

  for (const payload of smsPayloads) {
    assert.equal(hasSensitiveFinancialContent(payload), true);
    assert.throws(
      () =>
        assertOutboundPolicy({
          classification: DATA_CLASSIFICATIONS.SMS_OR_BANK_SOURCE_DATA,
          payload,
          provider: "groq",
        }),
      (err) =>
        err.code === "SMS_BANK_DATA_EXTERNAL_BLOCKED" ||
        err.code === "SENSITIVE_FINANCIAL_DATA_BLOCKED"
    );
    assert.equal(
      isOutboundAllowed({
        classification: DATA_CLASSIFICATIONS.SMS_OR_BANK_SOURCE_DATA,
        payload,
        provider: "groq",
      }),
      false
    );
  }
});

test("9. Sensitive financial prompts are rejected", () => {
  const sensitivePrompts = [
    "What is my bank account balance?",
    "How much did I spend on food this month?",
    "Can I afford a ₹25,000 laptop right now?",
    "Show me my transactions for October",
    "How much money do I have left in my salary?",
  ];

  for (const prompt of sensitivePrompts) {
    assert.equal(hasSensitiveFinancialContent(prompt), true);
    assert.throws(
      () =>
        assertOutboundPolicy({
          classification: DATA_CLASSIFICATIONS.PRIVATE_FINANCIAL_ANALYTICS,
          payload: { prompt },
          provider: "gemini",
        }),
      (err) =>
        err.code === "PRIVATE_ANALYTICS_EXTERNAL_BLOCKED" ||
        err.code === "SENSITIVE_FINANCIAL_DATA_BLOCKED"
    );
    assert.throws(
      () =>
        assertOutboundPolicy({
          payload: prompt,
          provider: "gemini",
        }),
      (err) =>
        err.code === "PRIVATE_ANALYTICS_EXTERNAL_BLOCKED" ||
        err.code === "SENSITIVE_FINANCIAL_DATA_BLOCKED" ||
        err.code === "UNKNOWN_OUTBOUND_CLASSIFICATION"
    );
  }
});

test("10. Unknown/unclassified payloads fail closed", () => {
  const unknownPayloads = [
    { randomProperty: "value" },
    { foo: "bar", nested: { test: true } },
  ];

  for (const payload of unknownPayloads) {
    assert.equal(classifyOutboundData(payload), DATA_CLASSIFICATIONS.UNKNOWN);
    assert.throws(
      () =>
        assertOutboundPolicy({
          classification: DATA_CLASSIFICATIONS.UNKNOWN,
          payload,
        }),
      (err) => err.code === "UNKNOWN_OUTBOUND_CLASSIFICATION"
    );
    assert.throws(
      () =>
        assertOutboundPolicy({
          classification: "NON_EXISTENT_CLASSIFICATION",
          payload,
        }),
      (err) => err.code === "UNKNOWN_OUTBOUND_CLASSIFICATION"
    );
    assert.throws(
      () =>
        assertOutboundPolicy({
          payload,
        }),
      (err) => err.code === "UNKNOWN_OUTBOUND_CLASSIFICATION"
    );
    assert.equal(isOutboundAllowed({ payload }), false);
  }
});

test("11. Approved non-sensitive conversational payloads behave according to configuration", async () => {
  const approvedPayload = {
    messageId: "ready",
    sourceText: "Whenever you are ready, we can begin.",
    tone: "calm",
  };

  // A. When external conversational AI is disabled (default):
  const disabledEnv = { FIN_EXTERNAL_LANGUAGE_ENABLED: "false" };
  assert.throws(
    () =>
      assertOutboundPolicy({
        classification: DATA_CLASSIFICATIONS.NON_SENSITIVE_CONVERSATION,
        payload: approvedPayload,
        provider: "gemini",
        env: disabledEnv,
      }),
    (err) => err.code === "EXTERNAL_AI_DISABLED"
  );

  // styleGenericMessage falls back to local deterministic string without throwing
  const localResult = await styleGenericMessage(
    { messageId: "ready", tone: "calm" },
    { env: disabledEnv }
  );
  assert.deepEqual(localResult, {
    text: "Whenever you are ready, we can begin.",
    provider: "local",
    external: false,
  });

  // B. When external conversational AI is enabled:
  const enabledGeminiEnv = {
    FIN_EXTERNAL_LANGUAGE_ENABLED: "true",
    FIN_LANGUAGE_PROVIDER: "gemini",
    GEMINI_API_KEY: "dummy-key",
  };
  assert.equal(
    assertOutboundPolicy({
      classification: DATA_CLASSIFICATIONS.NON_SENSITIVE_CONVERSATION,
      payload: approvedPayload,
      provider: "gemini",
      env: enabledGeminiEnv,
    }),
    true
  );

  const enabledGroqEnv = {
    FIN_EXTERNAL_LANGUAGE_ENABLED: "true",
    FIN_LANGUAGE_PROVIDER: "groq",
    GROQ_API_KEY: "dummy-key",
  };
  assert.equal(
    assertOutboundPolicy({
      classification: DATA_CLASSIFICATIONS.NON_SENSITIVE_CONVERSATION,
      payload: approvedPayload,
      provider: "groq",
      env: enabledGroqEnv,
    }),
    true
  );

  // C. Unapproved provider is blocked even when external language is enabled:
  assert.throws(
    () =>
      assertOutboundPolicy({
        classification: DATA_CLASSIFICATIONS.NON_SENSITIVE_CONVERSATION,
        payload: approvedPayload,
        provider: "openai",
        env: { FIN_EXTERNAL_LANGUAGE_ENABLED: "true" },
      }),
    (err) => err.code === "UNAPPROVED_CONVERSATIONAL_PROVIDER"
  );
});

test("12. Rate limiter works for IPv4", () => {
  const key1 = analyticsKeyGenerator({ ip: "127.0.0.1" });
  assert.equal(key1, "ip:127.0.0.1");

  const key2 = analyticsKeyGenerator({ ip: "192.168.1.100" });
  assert.equal(key2, "ip:192.168.1.100");

  assert.equal(typeof analyticsRateLimiter, "function");
});

test("13. Rate limiter safely normalizes IPv6", () => {
  // Standard IPv6 addresses are normalized to /56 subnet
  const key1 = analyticsKeyGenerator({
    ip: "2001:0db8:85a3:0000:0000:8a2e:0370:7334",
  });
  assert.equal(key1, "ip:2001:db8:85a3::/56");

  // IPv6 localhost is normalized to ::/56
  const key2 = analyticsKeyGenerator({ ip: "::1" });
  assert.equal(key2, "ip:::/56");

  // IPv4-mapped IPv6 is converted to IPv4
  const key3 = analyticsKeyGenerator({ ip: "::ffff:192.0.2.128" });
  assert.equal(key3, "ip:192.0.2.128");

  // Two addresses in the same /56 subnet share the same key to prevent limit bypasses
  const subnetA = analyticsKeyGenerator({ ip: "2001:0db8:1234:5600::1" });
  const subnetB = analyticsKeyGenerator({ ip: "2001:0db8:1234:56ff:ffff:ffff:ffff:ffff" });
  assert.equal(subnetA, subnetB);
});

test("14. Existing authenticated-user rate limiting still works", () => {
  // Authenticated user key is stable and unaffected by client IP (IPv4 or IPv6)
  const user1 = analyticsKeyGenerator({
    user: { id: 101 },
    ip: "192.168.1.1",
  });
  assert.equal(user1, "user:101");

  const user2 = analyticsKeyGenerator({
    user: { id: 202 },
    ip: "2001:0db8:85a3::1",
  });
  assert.equal(user2, "user:202");

  // Unauthenticated fallback uses normalized IP key
  const unauthUser = analyticsKeyGenerator({
    user: null,
    ip: "10.0.0.1",
  });
  assert.equal(unauthUser, "ip:10.0.0.1");
});
