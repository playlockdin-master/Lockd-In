import { Router, type Request, type Response } from "express";
import { Google } from "arctic";
import { findUserByOAuth, createUser, touchUserLastSeen, claimGuestGameRows } from "./storage";

// ── OAuth client setup ────────────────────────────────────────────────────────
const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

export const google = new Google(
  process.env.GOOGLE_CLIENT_ID!,
  process.env.GOOGLE_CLIENT_SECRET!,
  `${BASE_URL}/auth/google/callback`,
);

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

// ── Helper ────────────────────────────────────────────────────────────────────
function generateState(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

// ── Router ────────────────────────────────────────────────────────────────────
export const authRouter = Router();

// ── GET /auth/me ──────────────────────────────────────────────────────────────
authRouter.get("/me", (req: Request, res: Response) => {
  if (!req.session.userId) {
    res.json({ user: null });
    return;
  }
  res.json({
    user: {
      id:       req.session.userId,
      username: req.session.username,
      avatarId: req.session.avatarId,
    },
  });
});

// ── POST /auth/logout ─────────────────────────────────────────────────────────
authRouter.post("/logout", (req: Request, res: Response) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

// ── Google OAuth ──────────────────────────────────────────────────────────────
authRouter.get("/google", (req: Request, res: Response) => {
  const state        = generateState();
  req.session.state  = state;
  req.session.returnTo = (req.query.returnTo as string) || "/";

  const scopes = ["openid", "email", "profile"];
  const url    = google.createAuthorizationURL(state, null, scopes);
  res.redirect(url.toString());
});

authRouter.get("/google/callback", async (req: Request, res: Response) => {
  const { code, state } = req.query as { code?: string; state?: string };

  if (!code || !state || state !== req.session.state) {
    res.status(400).json({ message: "Invalid OAuth state" });
    return;
  }

  try {
    const tokens  = await google.validateAuthorizationCode(code, null);
    const idToken = tokens.idToken();

    // Decode JWT id_token to get user info
    const payload  = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString());
    const oauthId  = payload.sub as string;
    const username = (payload.name || payload.email || "Player") as string;

    // Find or create user
    let user = await findUserByOAuth("google", oauthId);
    if (!user) {
      user = await createUser({ oauthProvider: "google", oauthId, username, avatarId: "ghost" });
    } else {
      await touchUserLastSeen(user.id);
    }

    // Retroactively claim guest game rows
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