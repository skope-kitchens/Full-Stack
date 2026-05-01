import express from "express";
import { getOAuth2Client, storeTokens } from "../services/googleTokenManager.js";
import { getGoogleDebug } from "../controllers/googleDebug.controller.js";

const CAL_SCOPE = ["https://www.googleapis.com/auth/calendar"];

const router = express.Router();

/**
 * GET /api/google/auth
 * Returns consent URL for OAuth2. User must visit this URL to authorize.
 * access_type=offline + prompt=consent to ensure refresh_token is returned.
 */
router.get("/auth", (req, res) => {
  const oauth2 = getOAuth2Client();
  if (!oauth2) {
    return res.status(500).json({
      error: "OAuth not configured",
      hint: "Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URI",
    });
  }

  const url = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: CAL_SCOPE,
  });

  res.json({ authUrl: url });
});

/**
 * GET /api/google/callback?code=...
 * Exchanges authorization code for tokens and stores refresh_token in DB.
 */
router.get("/callback", async (req, res) => {
  const { code } = req.query;
  const oauth2 = getOAuth2Client();

  if (!oauth2) {
    return res.status(500).send("OAuth not configured");
  }
  if (!code) {
    return res.status(400).send("Missing code parameter");
  }

  try {
    const { tokens } = await oauth2.getToken(code);
    await storeTokens(tokens);

    res.send(
      "<h2>Google Calendar connected successfully</h2><p>You can close this window. The server will use this authorization for calendar operations.</p>"
    );
  } catch (err) {
    console.error("[GoogleError]", err?.message || err);
    res.status(500).send(`Authorization failed: ${err.message}`);
  }
});

router.get("/debug", getGoogleDebug);

export default router;
