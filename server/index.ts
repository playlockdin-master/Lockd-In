import express, { type Request, Response, NextFunction } from "express";
import path from "path";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { authRouter } from "./auth";
import { pool } from "./db";

const app = express();
const httpServer = createServer(app);

// Must be first — tells Express to trust Railway's reverse proxy
// so req.secure is true and cookies work correctly over HTTPS
app.set("trust proxy", 1);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ── Static content routes (blog, sitemap, ads.txt) ────────────────────────────
// These are served BEFORE the React catch-all so Google can crawl them as plain HTML.
// In production the server runs from dist/index.cjs, so blog files live at dist/blog/
// In dev they live at server/blog/ relative to cwd.
const __blogDir = process.env.NODE_ENV === "production"
  ? path.resolve(process.cwd(), "dist", "blog")
  : path.resolve(process.cwd(), "server", "blog");

// Guarantee ads.txt is always served at the correct path
app.get("/ads.txt", (_req, res) => {
  res.type("text/plain");
  res.send("google.com, pub-4551070722550073, DIRECT, f08c47fec0942fa0");
});

// Sitemap
app.get("/sitemap.xml", (_req, res) => {
  res.type("application/xml");
  res.sendFile(path.join(__blogDir, "sitemap.xml"));
});

// Blog index
app.get("/blog", (_req, res) => {
  res.sendFile(path.join(__blogDir, "index.html"));
});

// Blog articles
app.get("/blog/how-to-host-a-trivia-night", (_req, res) => {
  res.sendFile(path.join(__blogDir, "how-to-host-a-trivia-night.html"));
});
app.get("/blog/best-trivia-topics", (_req, res) => {
  res.sendFile(path.join(__blogDir, "best-trivia-topics.html"));
});
app.get("/blog/how-ai-generates-quiz-questions", (_req, res) => {
  res.sendFile(path.join(__blogDir, "how-ai-generates-quiz-questions.html"));
});

// ── Session store ─────────────────────────────────────────────────────────────
const PgSession = connectPgSimple(session);
const IS_PROD   = process.env.NODE_ENV === "production";

let sessionStore: session.Store | undefined;
if (pool) {
  // Create the session table manually — avoids connect-pg-simple
  // looking for table.sql which doesn't exist after production bundling
  pool.query(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      sid    VARCHAR     NOT NULL COLLATE "default",
      sess   JSON        NOT NULL,
      expire TIMESTAMP(6) NOT NULL,
      CONSTRAINT session_pkey PRIMARY KEY (sid)
    )
  `)
    .then(() => console.log("[session] user_sessions table ready"))
    .catch((e: any) => console.warn("[session] Table create warning:", e?.message));

  sessionStore = new PgSession({ pool, tableName: "user_sessions" });
  console.log("[session] Using Postgres session store");
} else {
  console.warn("[session] No DB pool — using in-memory session store (sessions lost on restart)");
}

app.use(session({
  store:             sessionStore,
  secret:            process.env.SESSION_SECRET || "dev-secret-change-in-prod",
  resave:            false,
  saveUninitialized: false,
  name:              "qotion.sid",
  cookie: {
    httpOnly: true,
    secure:   IS_PROD,       // true in prod (HTTPS), false in dev
    sameSite: IS_PROD ? "none" : "lax", // "none" required for cross-site cookie on Railway
    maxAge:   30 * 24 * 60 * 60 * 1000, // 30 days
  },
}));

// ── Auth routes ───────────────────────────────────────────────────────────────
app.use("/auth", authRouter);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path  = req.path;
  let capturedJsonResponse: Record<string, any> | undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      log(logLine);
    }
  });
  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status  = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error("Internal Server Error:", err);
    if (res.headersSent) return next(err);
    return res.status(status).json({ message });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen({ port, host: "0.0.0.0", reusePort: true }, () => {
    log(`serving on port ${port}`);
  });
})();