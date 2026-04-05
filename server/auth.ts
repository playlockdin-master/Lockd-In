import { Router, type Request, type Response } from "express";
import https from "https";
import { findUserByOAuth, createUser, touchUserLastSeen, claimGuestGameRows, isUsernameTaken } from "./storage";

const BASE_URL             = process.env.BASE_URL || "http://localhost:5000";
const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT      = `${BASE_URL}/auth/google/callback`;

// ── Extend express-session types ──────────────────────────────────────────────
declare module "express-session" {
  interface SessionData {
    userId:    string;
    username:  string;
    avatarId:  string;
    state?:    string;
    returnTo?: string;
    pendingOAuthId?: string;
    pendingOAuthProvider?: string;
  }
}

// ── Cryptographically stronger state ─────────────────────────────────────────
import { randomBytes } from "crypto";
function generateState(): string {
  return randomBytes(24).toString("hex");
}

// ── HTTPS helpers ─────────────────────────────────────────────────────────────
function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = "";
      res.on("data", (c) => data += c);
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

function httpsPost(urlStr: string, body: string, headers: Record<string, string | number>): Promise<string> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = https.request({
      hostname: u.hostname,
      path:     u.pathname + u.search,
      method:   "POST",
      headers:  { "Content-Length": Buffer.byteLength(body), ...headers },
    }, (res) => {
      let data = "";
      res.on("data", (c) => data += c);
      res.on("end", () => resolve(data));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ── Router ────────────────────────────────────────────────────────────────────
export const authRouter = Router();

// GET /auth/me
authRouter.get("/me", (req: Request, res: Response) => {
  if (!req.session.userId) { res.json({ user: null }); return; }
  res.json({
    user: {
      id:       req.session.userId,
      username: req.session.username,
      avatarId: req.session.avatarId,
    },
  });
});

// POST /auth/logout
authRouter.post("/logout", (req: Request, res: Response) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// GET /auth/google
authRouter.get("/google", (req: Request, res: Response) => {
  if (!GOOGLE_CLIENT_ID) {
    res.status(500).json({ message: "Google OAuth not configured" });
    return;
  }

  const state          = generateState();
  req.session.state    = state;
  req.session.returnTo = (req.query.returnTo as string) || "/";

  const params = new URLSearchParams({
    client_id:     GOOGLE_CLIENT_ID,
    redirect_uri:  GOOGLE_REDIRECT,
    response_type: "code",
    scope:         "openid email profile",
    state,
    access_type:   "online",
    prompt:        "select_account",
  });

  const googleUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;

  // Save session to DB BEFORE redirecting — state must be persisted
  // before Google calls our callback
  req.session.save((err) => {
    if (err) {
      console.error("[auth] Session save failed:", err);
      res.status(500).json({ message: "Session save failed", detail: String(err) });
      return;
    }
    console.log(`[auth] State saved: ${state.slice(0, 8)}... redirecting to Google`);
    res.redirect(googleUrl);
  });
});

// GET /auth/google/callback
authRouter.get("/google/callback", async (req: Request, res: Response) => {
  const { code, state, error } = req.query as { code?: string; state?: string; error?: string };

  // Google returned an error (e.g. user denied)
  if (error) {
    console.warn("[auth] Google returned error:", error);
    res.redirect("/?auth_error=google");
    return;
  }

  const sessionState = req.session.state;
  console.log(`[auth] Callback — received state: ${state?.slice(0, 8)}... session state: ${sessionState?.slice(0, 8)}...`);

  if (!code || !state || !sessionState || state !== sessionState) {
    console.warn("[auth] State mismatch — possible CSRF or session loss");
    res.status(400).json({
      message: "Invalid OAuth state",
      hint:    !sessionState ? "Session was lost — try again" : "State mismatch",
    });
    return;
  }

  try {
    // Exchange code for tokens
    const tokenBody = new URLSearchParams({
      code,
      client_id:     GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri:  GOOGLE_REDIRECT,
      grant_type:    "authorization_code",
    }).toString();

    const tokenRaw = await httpsPost(
      "https://oauth2.googleapis.com/token",
      tokenBody,
      { "Content-Type": "application/x-www-form-urlencoded" },
    );
    const tokenJson = JSON.parse(tokenRaw);

    if (tokenJson.error) {
      throw new Error(`Token exchange failed: ${tokenJson.error} — ${tokenJson.error_description}`);
    }

    // Fetch user info from Google
    const userRaw  = await httpsGet(
      `https://www.googleapis.com/oauth2/v3/userinfo?access_token=${tokenJson.access_token}`
    );
    const userJson = JSON.parse(userRaw) as { sub: string; name?: string; email?: string };

    if (!userJson.sub) throw new Error("No user sub in Google response");

    const oauthId = userJson.sub;

    // Find existing user in DB
    let user = await findUserByOAuth("google", oauthId);
    if (!user) {
      // New user — store pending OAuth in session and redirect to username setup
      req.session.pendingOAuthId       = oauthId;
      req.session.pendingOAuthProvider = "google";
      delete req.session.state;
      req.session.save((err) => {
        if (err) console.warn("[auth] Session save warning:", err);
        res.redirect("/setup-username");
      });
      return;
    }

    // Existing user — log in normally
    await touchUserLastSeen(user.id);
    console.log(`[auth] Existing user logged in: ${user.username}`);

    // Set session
    req.session.userId   = user.id;
    req.session.username = user.username;
    req.session.avatarId = user.avatarId;
    delete req.session.state;

    const returnTo = req.session.returnTo || "/";
    delete req.session.returnTo;

    // Save session then redirect
    req.session.save((err) => {
      if (err) console.warn("[auth] Post-login session save warning:", err);
      res.redirect(returnTo);
    });

  } catch (e: any) {
    console.error("[auth] Google callback error:", e?.message);
    res.redirect("/?auth_error=google");
  }
});
// POST /auth/complete-signup — finalize new user creation with chosen username
authRouter.post("/complete-signup", async (req: Request, res: Response) => {
  const { username, avatarId } = req.body as { username?: string; avatarId?: string };
  const oauthId       = req.session.pendingOAuthId;
  const oauthProvider = req.session.pendingOAuthProvider;

  if (!oauthId || !oauthProvider) {
    res.status(400).json({ error: "No pending signup session" });
    return;
  }

  if (!username || typeof username !== "string") {
    res.status(400).json({ error: "Username is required" });
    return;
  }

  const trimmed = username.trim();
  if (trimmed.length < 2 || trimmed.length > 20) {
    res.status(400).json({ error: "Username must be 2–20 characters" });
    return;
  }
  if (!/[a-zA-Z]/.test(trimmed)) {
    res.status(400).json({ error: "Username must contain at least one letter" });
    return;
  }

  try {
    const taken = await isUsernameTaken(trimmed);
    if (taken) {
      res.status(409).json({ error: "That username is already taken. Please choose another." });
      return;
    }

    const safeAvatarId = (typeof avatarId === "string" && avatarId.length > 0) ? avatarId : "ghost";
    const user = await createUser({ oauthProvider, oauthId, username: trimmed, avatarId: safeAvatarId });
    console.log(`[auth] New user created via setup: ${trimmed} (${oauthId.slice(0, 8)}...)`);

    // Claim any guest games played before signing up
    await claimGuestGameRows(trimmed, user.id);

    // Clear pending, set real session
    delete req.session.pendingOAuthId;
    delete req.session.pendingOAuthProvider;
    req.session.userId   = user.id;
    req.session.username = user.username;
    req.session.avatarId = user.avatarId;

    req.session.save((err) => {
      if (err) console.warn("[auth] Post-signup session save warning:", err);
      res.json({ ok: true });
    });
  } catch (e: any) {
    console.error("[auth] complete-signup error:", e?.message);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// GET /auth/check-username — check availability
authRouter.get("/check-username", async (req: Request, res: Response) => {
  const { username } = req.query as { username?: string };
  if (!username) { res.json({ available: false }); return; }
  const taken = await isUsernameTaken(username.trim());
  res.json({ available: !taken });
});
