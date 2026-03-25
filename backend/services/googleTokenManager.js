import { google } from "googleapis";
import GoogleToken from "../models/googleToken.model.js";

function buildOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    process.env.GOOGLE_OAUTH_REDIRECT_URI
  );
}

const CAL_SCOPE = ["https://www.googleapis.com/auth/calendar"];
let refreshPromise = null;
/**
 * Returns OAuth2 client configured with client_id and client_secret.
 * No tokens attached yet — used to generate auth URL and exchange code.
 */
const getOAuth2Client = () => {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return null;
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
};
export async function hasStoredRefreshToken() {
  const doc = await GoogleToken.findOne({ provider: "google_calendar" });
  return !!doc?.refreshToken;
}

/**
 * Loads refresh_token from DB, sets it on OAuth2 client.
 * OAuth2Client auto-refreshes access_token when expired; no manual refresh needed for each call.
 */
export async function getAuthenticatedCalendarClient() {
  const tokenDoc = await GoogleToken.findOne({ provider: "google_calendar" });

  if (!tokenDoc?.refreshToken) {
    throw new Error("No refresh token stored");
  }

  const oauth2Client = buildOAuthClient();

  // ONLY SET REFRESH TOKEN
  oauth2Client.setCredentials({
    refresh_token: tokenDoc.refreshToken,
  });

  // Google will auto refresh internally when API called
  return google.calendar({ version: "v3", auth: oauth2Client });
}

async function createCalendarClientFromDB() {
  const tokenDoc = await GoogleToken.findOne({ provider: "google_calendar" });

  if (!tokenDoc?.accessToken) {
    throw new Error("OAuth token missing or invalid");
  }

  const oauth2Client = buildOAuthClient();

  oauth2Client.setCredentials({
    access_token: tokenDoc.accessToken,
    refresh_token: tokenDoc.refreshToken,
    expiry_date: tokenDoc.expiry_date,
  });

  return google.calendar({ version: "v3", auth: oauth2Client });
}

/**
 * Updates stored token doc when new credentials received (e.g. after refresh).
 */


/**
 * Stores tokens after OAuth callback. MUST capture refresh_token for offline access.
 */
export const storeTokens = async (tokens, email = "primary") => {
  if (!tokens.refresh_token) {
    throw new Error("refresh_token missing — consent not forced");
  }

  await GoogleToken.updateOne(
    { provider: "google_calendar" },
    {
      $set: {
        provider: "google_calendar",
        email,
        refreshToken: tokens.refresh_token,
        scope: tokens.scope,
      },
    },
    { upsert: true }
  );

  console.log("[GoogleAuth] Refresh token stored");
};

export { getOAuth2Client };
