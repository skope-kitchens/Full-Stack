export function validateEnv() {
  const required = [
    "MONGO_URI",
    "JWT_SECRET",
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error("❌ Missing required environment variables:\n");
    for (const key of missing) {
      console.error(` - ${key}`);
    }
    throw new Error("Missing required environment variables");
  }

  const optionalWarnings = [
    "GOOGLE_OAUTH_CLIENT_ID",
    "GOOGLE_OAUTH_CLIENT_SECRET",
    "GOOGLE_OAUTH_REDIRECT_URI",
    "GOOGLE_CALENDAR_ID",
    "APP_BASE_URL",
  ];

  for (const key of optionalWarnings) {
    if (!process.env[key]) {
      console.warn(`⚠ Optional env var not set: ${key}`);
    }
  }
}
