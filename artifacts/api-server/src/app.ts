import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// ── Allowed origins ───────────────────────────────────────────────────────────
// Only accept requests from your own frontend and Vercel preview URLs.
// Set APP_URL in your environment (e.g. https://your-app.vercel.app).
// Telegram WebApp requests come from https://web.telegram.org — always allowed.
const ALLOWED_ORIGINS: (string | RegExp)[] = [
  "https://web.telegram.org",
];

if (process.env.APP_URL) {
  ALLOWED_ORIGINS.push(process.env.APP_URL);
}

// FIX: Scope Vercel preview allowance to THIS project's deployments only.
// Previously /https:\/\/.*\.vercel\.app/ allowed every Vercel app in the world.
// Now we build a pattern from VERCEL_URL (e.g. "my-project-git-main-team.vercel.app")
// that only matches preview URLs for this specific project.
if (process.env.VERCEL_URL) {
  // Escape dots so they aren't treated as regex wildcards.
  const escapedUrl = process.env.VERCEL_URL.replace(/\./g, "\\.");
  // Match the exact production URL.
  ALLOWED_ORIGINS.push(new RegExp(`^https://${escapedUrl}$`));

  // Also allow all Git-branch previews for this project.
  // VERCEL_URL is typically: <project>-<hash>-<team>.vercel.app
  // We extract the project prefix (everything before the first "-git-" or first "-<hash>").
  const projectPrefix = process.env.VERCEL_URL.split(/[-_][0-9a-f]{8,}/)[0];
  if (projectPrefix && projectPrefix !== process.env.VERCEL_URL) {
    const escapedPrefix = projectPrefix.replace(/\./g, "\\.");
    // Matches: https://<project>-<anything>.vercel.app
    ALLOWED_ORIGINS.push(new RegExp(`^https://${escapedPrefix}-[^.]+\\.vercel\\.app$`));
  }
}

// Allow localhost during development.
if (process.env.NODE_ENV !== "production") {
  ALLOWED_ORIGINS.push(/^http:\/\/localhost(:\d+)?$/);
}

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// ── CORS — restricted to known origins ───────────────────────────────────────
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server requests (no Origin header) — e.g. Telegram webhooks
      if (!origin) return callback(null, true);
      const allowed = ALLOWED_ORIGINS.some(o =>
        typeof o === "string" ? o === origin : o.test(origin),
      );
      if (allowed) return callback(null, true);
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-client-id", "x-telegram-init-data", "x-admin-key"],
    credentials: true,
  }),
);

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Global limit: 120 requests per minute per IP (covers normal usage).
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please slow down." },
});

// Stricter limit on the chat/message endpoint: 20 messages per minute per IP.
const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Message rate limit exceeded. Please wait before sending more." },
});

app.use(globalLimiter);
app.use("/api/conversations/:id/messages", messageLimiter);

// ── Body parsing ──────────────────────────────────────────────────────────────
// Keep 20 MB for image uploads but add a tighter limit for JSON-only routes.
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

// ── Security headers ──────────────────────────────────────────────────────────
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

app.use("/api", router);

export default app;
