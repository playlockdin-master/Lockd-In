import { Router, type Request, type Response } from "express";
import https from "https";
import { findUserByOAuth, createUser, touchUserLastSeen, claimGuestGameRows } from "./storage";

const BASE_URL           = process.env.BASE_URL || "http://localhost:5000";
const GOOGLE_CLIENT_ID   = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const GOOGLE_REDIRECT    = `${BASE_URL}/auth/google/callback`;

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

// ── Helpers ───────────────────────────────────────────────────────────────────
function generateState(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

function httpsPost(url: string, body: string, headers: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const urlObj  = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path:     urlObj.pathname,
      method:   "POST",
      headers:  { "Content-Length": Buffer.byteLength(body), ...headers },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
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
  res.json({ user: { id: req.session.userId, username: req.session.username, avatarId: req.session.avatarId } });
});

// POST /auth/logout
authRouter.post("/logout", (req: Request, res: Response) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// GET /auth/google  — redirect to Google consent
authRouter.get("/google", (req: Request, res: Response) => {
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
  });
  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  req.session.save((err) => {
    if (err) { res.status(500).json({ message: "Session error" }); return; }
    res.redirect(url);
  });
});

// GET /auth/google/callback
authRouter.get("/google/callback", async (req: Request, res: Response) => {
  const { code, state } = req.query as { code?: string; state?: string };

  if (!code || !state || state !== req.session.state) {
    res.status(400).json({ message: "Invalid OAuth state" });
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

    const tokenRaw  = await httpsPost(
      "https://oauth2.googleapis.com/token",
      tokenBody,
      { "Content-Type": "application/x-www-form-urlencoded" },
    );
    const tokenJson = JSON.parse(tokenRaw);

    // Fetch user info
    const userRaw  = await httpsGet(
      `https://www.googleapis.com/oauth2/v3/userinfo?access_token=${tokenJson.access_token}`
    );
    const userJson = JSON.parse(userRaw) as { sub: string; name?: string; email?: string };

    const oauthId  = userJson.sub;
    const username = userJson.name || userJson.email || "Player";

    // Find or create user
    let user = await findUserByOAuth("google", oauthId);
    if (!user) {
      user = await createUser({ oauthProvider: "google", oauthId, username, avatarId: "ghost" });
    } else {
      await touchUserLastSeen(user.id);
    }

    // Claim any guest rows
    await claimGuestGameRows(username, user.id);

    // Set session
    req.session.userId   = user.id;
    req.session.username = user.username;
    req.session.avatarId = user.avatarId;
    delete req.session.state;

    const returnTo = req.session.returnTo || "/";
    delete req.session.returnTo;
    res.redirect(returnTo);

  } catch (e: any) {
    console.error("[auth] Google callback error:", e?.message);
    res.redirect("/?auth_error=google");
  }
});