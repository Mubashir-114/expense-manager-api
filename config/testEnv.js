import { randomBytes } from "node:crypto";

process.env.NODE_ENV = "test";

if (!process.env.FINTRACK_TEST_RUN_ID) {
  process.env.FINTRACK_TEST_RUN_ID = randomBytes(6).toString("hex");
}

const runId = process.env.FINTRACK_TEST_RUN_ID;
process.env.DB_HOST ??= "127.0.0.1";
process.env.DB_PORT ??= "13307";
process.env.DB_NAME = `fintrack_test_${runId}`;
process.env.DB_USER = `fintrack_test_${runId}`;
process.env.DB_PASSWORD = `fintrack-test-${randomBytes(24).toString("hex")}`;
process.env.JWT_SECRET = `fintrack-test-${randomBytes(32).toString("hex")}`;
process.env.PORT ??= "0";
