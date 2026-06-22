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
// Allow only this specific Vercel deployment URL (not all *.vercel.app apps).
if (process.env.VERCEL_URL) {
  // Scope to this specific deployment only — do NOT allow all *.vercel.app apps.
  ALLOWED_ORIGINS.push(new RegExp(`^https://${process.env.VERCEL_URL.replace(/\./g, "\\.")}$`));
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
    allowedHeaders: ["Content-Type", "Authorization", "x-client-id", "x-telegram-init-data"],
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
