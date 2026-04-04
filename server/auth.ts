import { Router, type Request, type Response } from "express";
import https from "https";
import { findUserByOAuth, createUser, touchUserLastSeen, claimGuestGameRows } from "./storage";

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

    const oauthId  = userJson.sub;
    const username = (userJson.name || userJson.email || "Player").slice(0, 20);

    // Find or create user in DB
    let user = await findUserByOAuth("google", oauthId);
    if (!user) {
      user = await createUser({ oauthProvider: "google", oauthId, username, avatarId: "ghost" });
      console.log(`[auth] New user created: ${username} (${oauthId.slice(0, 8)}...)`);
    } else {
      await touchUserLastSeen(user.id);
      console.log(`[auth] Existing user logged in: ${user.username}`);
    }

    // Retroactively claim any guest game rows for this username
    await claimGuestGameRows(username, user.id);

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