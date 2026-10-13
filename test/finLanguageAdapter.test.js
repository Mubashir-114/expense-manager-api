import assert from "node:assert/strict";
import test from "node:test";

import {
  assertFinLanguageConfiguration,
  assertStyleOnlyPayload,
  styleGenericMessage,
} from "../services/analytics/finLanguageAdapter.js";
import { assertNoProhibitedProvidersConfigured } from "../services/analytics/outboundPolicy.js";

test("external language styling is off by default and performs no outbound call", async () => {
  let called = false;
  const result = await styleGenericMessage(
    { messageId: "ready", tone: "calm" },
    {
      env: { FIN_EXTERNAL_LANGUAGE_ENABLED: "false" },
      fetchImpl: async () => {
        called = true;
      },
    }
  );

  assert.equal(called, false);
  assert.deepEqual(result, {
    text: "Whenever you are ready, we can begin.",
    provider: "local",
    external: false,
  });
});

test("privacy guard defaults to deny for altered text and sensitive fields", () => {
  assert.throws(
    () =>
      assertStyleOnlyPayload({
        messageId: "ready",
        sourceText: "My balance is 5000",
        tone: "calm",
      }),
    (error) => error.code === "FIN_LANGUAGE_PRIVACY_DENIED"
  );
  assert.throws(
    () =>
      assertStyleOnlyPayload({
        messageId: "ready",
        sourceText: "Whenever you are ready, we can begin.",
        tone: "calm",
        userQuestion: "private input",
      }),
    (error) => error.code === "FIN_LANGUAGE_PRIVACY_DENIED"
  );
});

test("only the selected style provider receives the fixed generic phrase", async () => {
  let outboundBody;
  const env = {
    FIN_EXTERNAL_LANGUAGE_ENABLED: "true",
    FIN_LANGUAGE_PROVIDER: "groq",
    GROQ_API_KEY: "test-only-placeholder",
  };
  const result = await styleGenericMessage(
    { messageId: "complete", tone: "concise" },
    {
      env,
      fetchImpl: async (_url, options) => {
        outboundBody = options.body;
        return {
          ok: true,
          json: async () => ({ choices: [{ message: { content: "Done." } }] }),
        };
      },
    }
  );

  assert.equal(result.text, "Done.");
  assert.equal(result.provider, "groq");
  assert.match(outboundBody, /All set\. Here is what I found\./);
  assert.doesNotMatch(
    outboundBody,
    /transaction|balance|account information|budget|saving goal|financial amount|sms|bank data/i
  );
});

test("startup exception is narrow, explicit, and fails closed", () => {
  const validStyleEnv = {
    FIN_EXTERNAL_LANGUAGE_ENABLED: "true",
    FIN_LANGUAGE_PROVIDER: "gemini",
    GEMINI_API_KEY: "test-only-placeholder",
  };
  assert.equal(assertFinLanguageConfiguration(validStyleEnv), true);
  assert.doesNotThrow(() =>
    assertNoProhibitedProvidersConfigured(validStyleEnv, {
      allowFinLanguageStyleProvider: true,
    })
  );
  assert.throws(
    () => assertNoProhibitedProvidersConfigured(validStyleEnv),
    (error) => error.code === "PROHIBITED_EXTERNAL_AI_CONFIGURED"
  );
  assert.throws(
    () =>
      assertNoProhibitedProvidersConfigured(
        { ...validStyleEnv, GROQ_API_KEY: "also-configured" },
        { allowFinLanguageStyleProvider: true }
      ),
    (error) => error.code === "PROHIBITED_EXTERNAL_AI_CONFIGURED"
  );
});
