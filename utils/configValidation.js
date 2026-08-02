const requiredEnvVars = [
  "PORT",
  "DB_HOST",
  "DB_USER",
  "DB_PASSWORD",
  "DB_NAME",
  "JWT_SECRET",
];

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
};
