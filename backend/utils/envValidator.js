export function validateEnv() {
  const required = [
    "GOOGLE_OAUTH_CLIENT_ID",
    "GOOGLE_OAUTH_CLIENT_SECRET",
    "GOOGLE_OAUTH_REDIRECT_URI",
    "GOOGLE_CALENDAR_ID",
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error("❌ Missing environment variables:\n");
    for (const key of missing) {
      console.error(key);
    }
    throw new Error("Missing required environment variables");
  }

  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (calendarId === "primary") {
    console.warn(
      '⚠ GOOGLE_CALENDAR_ID is "primary". Organizer will NOT receive email invites.'
    );
  } else if (!calendarId.includes("@")) {
    throw new Error(
      "GOOGLE_CALENDAR_ID must be a real email address (e.g. mycalendar@domain.com)"
    );
  }

  if (!process.env.APP_BASE_URL) {
    console.warn("⚠ APP_BASE_URL is not set. Some links may be incorrect.");
  }
}

