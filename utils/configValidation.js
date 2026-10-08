const requiredEnvVars = [
  "PORT",
  "DB_HOST",
  "DB_PORT",
  "DB_USER",
  "DB_PASSWORD",
  "DB_NAME",
  "JWT_SECRET",
];

export const validateTestDatabaseConfig = (config = process.env) => {
  const runId = config.FINTRACK_TEST_RUN_ID;
  const runIdPattern = /^[a-f0-9]{12}$/;

  if (!runIdPattern.test(runId || "")) {
    throw new Error("Test database configuration requires a generated test run ID.");
  }
  if (config.DB_HOST !== "127.0.0.1") {
    throw new Error("Test database host must be 127.0.0.1.");
  }
  if (
    config.DB_NAME !== `fintrack_test_${runId}` ||
    config.DB_USER !== `fintrack_test_${runId}`
  ) {
    throw new Error("Test database name and user must match the generated test run ID.");
  }
  if (!/^\d+$/.test(config.DB_PORT || "") || Number(config.DB_PORT) < 1 || Number(config.DB_PORT) > 65535) {
    throw new Error("Test database port must be an explicit valid TCP port.");
  }
  if (!config.DB_PASSWORD?.startsWith("fintrack-test-")) {
    throw new Error("Test database credentials must use the synthetic test-only password prefix.");
  }
};

export const validateConfig = () => {
  const missing = [];

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }

  if (missing.length > 0) {
    console.error("FATAL CONFIGURATION ERROR: Missing required environment variables:");
    for (const m of missing) {
      console.error(`  - ${m}`);
    }
    process.exit(1);
  }

  if (process.env.NODE_ENV === "test") {
    validateTestDatabaseConfig();
  }
};
