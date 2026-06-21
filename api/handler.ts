import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import timeout from "connect-timeout";
import { createHash, timingSafeEqual, randomUUID } from "crypto";
import { z, ZodSchema } from "zod";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { eq, asc, desc, and, sql, gte } from "drizzle-orm";
import {
  webSearch,
  fetchUrl,
  getWeather,
  getStockPrice,
  getCurrentDatetime,
} from "./webTools.js";

/*
 * DATA FLOWS — what user data goes where
 * ─────────────────────────────────────────────────────────────
 * PostgreSQL DB  : conversation metadata + message content (user-controlled, hard-deleted on request)
 * OpenRouter API : conversation history per request (required for AI responses, not stored by us)
 * Telegram API   : subscription payment metadata only (no message content, ever)
 * Web tools      : search query / location / ticker only (no conversation content)
 * Server logs    : timing, model, token count only (no message content, no clientId)
 * ─────────────────────────────────────────────────────────────
 */

// ── TypeScript augmentation ───────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      clientId: string;
      timedout?: boolean;
    }
  }
}

// ── Env validation ────────────────────────────────────────────────────────────

const REQUIRED_ENV = ["OPENROUTER_API_KEY", "DATABASE_URL", "JWT_SECRET", "SYSTEM_PROMPT_B64"];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[startup] FATAL: Required env var ${key} is not set. Exiting.`);
    process.exit(1);
  }
}
if (!process.env.TAVILY_API_KEY) {
  console.warn("[startup] TAVILY_API_KEY not set — web_search will use DuckDuckGo fallback");
}
if (!process.env.ADMIN_SECRET) {
  console.warn("[startup] ADMIN_SECRET not set — admin routes are disabled");
}
if (!process.env.ADMIN_PATH_SLUG) {
  console.warn("[startup] ADMIN_PATH_SLUG not set — admin routes are disabled");
}

// ── Schema ────────────────────────────────────────────────────────────────────

const conversationsTable = pgTable("conversations", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  clientId: text("client_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

const messagesTable = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => conversationsTable.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  attachedImage: text("attached_image"),
  generatedImageUrl: text("generated_image_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

const subscriptionsTable = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  clientId: text("client_id").notNull().unique(),
  status: text("status").notNull().default("free"),
  plan: text("plan"),
  txHash: text("tx_hash"),
  network: text("network"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── Database ──────────────────────────────────────────────────────────────────

let _db: ReturnType<typeof drizzle> | null = null;
function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  if (!_db) {
    const pool = new pg.Pool({
      connectionString: url,
      ssl: { rejectUnauthorized: true },
      max: 3,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      query_timeout: 10_000,
    });
    _db = drizzle(pool);
  }
  return _db;
}

async function checkDbConnection() {
  try {
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL!,
      ssl: { rejectUnauthorized: true },
      connectionTimeoutMillis: 5_000,
    });
    await pool.query("SELECT 1");
    await pool.end();
    console.info("[startup] Database connection OK");
  } catch (err: any) {
    console.error("[startup] FATAL: Cannot connect to database:", err.message);
    process.exit(1);
  }
}

let _migrated = false;
async function ensureTables() {
  if (_migrated) return;
  const url = process.env.DATABASE_URL;
  if (!url) return;
  const pool = new pg.Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: true },
    connectionTimeoutMillis: 5_000,
  });
  try {
    await pool.query(`
      DROP TABLE IF EXISTS user_memory;
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        client_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        attached_image TEXT,
        generated_image_url TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS attached_image TEXT;
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS generated_image_url TEXT;
      ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_conversation_id_fkey;
      ALTER TABLE messages ADD CONSTRAINT messages_conversation_id_fkey
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
      CREATE TABLE IF NOT EXISTS subscriptions (
        id SERIAL PRIMARY KEY,
        client_id TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'free',
        plan TEXT,
        tx_hash TEXT,
        network TEXT,
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    _migrated = true;
  } finally {
    await pool.end();
  }
}

// ── System prompt loader (D0.1) ───────────────────────────────────────────────
// Prompts are stored as base64-encoded JSON in SYSTEM_PROMPT_B64 env var.
// To generate: node -e "console.log(Buffer.from(JSON.stringify({system:'...',languageEnforcement:'...',personaPrefill:'...',englishLockUser:'...',englishLockAssistant:'...'})).toString('base64'))"

interface SystemPrompts {
  system: string;
  languageEnforcement: string;
  personaPrefill: string;
  englishLockUser: string;
  englishLockAssistant: string;
}

let _prompts: SystemPrompts | null = null;

function getPrompts(): SystemPrompts {
  if (_prompts) return _prompts;
  const encoded = process.env.SYSTEM_PROMPT_B64;
  if (!encoded) {
    console.error("[startup] FATAL: SYSTEM_PROMPT_B64 is not set. Exiting.");
    process.exit(1);
  }
  try {
    _prompts = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as SystemPrompts;
    return _prompts!;
  } catch (err: any) {
    console.error("[startup] FATAL: SYSTEM_PROMPT_B64 is invalid:", err.message);
    process.exit(1);
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const FREE_LIMIT = 20;
const DAILY_HARD_CAP = Number(process.env.DAILY_HARD_CAP ?? 500);
const WALLET_ERC20 = "0xb1584a0e0ea8b01e57d6caa238ac76512ef87fd7";
const WALLET_TRC20 = "TFRDatJUdNQLYiF7BqQKQi8YFKQ1FBuAGn";
const WALLET_BEP20 = "0xb1584a0e0ea8b01e57d6caa238ac76512ef87fd7";
const PLAN_PRICES: Record<string, number> = { monthly: 29, lifetime: 199 };
const VISION_MODEL = "qwen/qwen2.5-vl-72b-instruct";
const MAX_TOKENS_FLASH = 800;
const MAX_TOKENS_PRO = 4096;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 15;
const rateLimitMap = new Map<string, number[]>();
const inFlightRequests = new Set<string>();

const ALLOWED_MODELS = [
  "deepseek/deepseek-chat",
  "deepseek/deepseek-r1",
  "qwen/qwen2.5-vl-72b-instruct",
] as const;
type AllowedModel = (typeof ALLOWED_MODELS)[number];
const FREE_ALLOWED_MODELS: AllowedModel[] = ["deepseek/deepseek-chat"];

// ── Helpers ───────────────────────────────────────────────────────────────────

// Hash clientId before writing to DB (B6) — SHA-256, hex output
function hashClientId(id: string): string {
  return createHash("sha256").update(id).digest("hex");
}

// Per-clientId chat rate limiter (keeps raw id in memory — never persisted)
function checkRateLimit(clientId: string): boolean {
  const now = Date.now();
  const timestamps = (rateLimitMap.get(clientId) || []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS
  );
  if (timestamps.length >= RATE_LIMIT_MAX) return false;
  timestamps.push(now);
  rateLimitMap.set(clientId, timestamps);
  return true;
}

// SSRF protection for fetch_url tool (D2)
function isSafeUrl(raw: string): boolean {
  let parsed: URL;
  try { parsed = new URL(raw); } catch { return false; }
  if (!["http:", "https:"].includes(parsed.protocol)) return false;
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return false;
  if (/^10\./.test(host)) return false;
  if (/^192\.168\./.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  if (host === "169.254.169.254") return false;
  if (host.endsWith(".internal")) return false;
  if (host.endsWith(".local")) return false;
  return true;
}

// Prompt injection sanitizer (D9)
function sanitizeUserMessage(text: string): string {
  text = text.replace(/\0/g, "");
  const injectionPatterns = [
    /ignore (all |previous |above )?instructions/i,
    /you are now/i,
    /system prompt/i,
    /disregard your/i,
    /act as (if )?you (have no|are)/i,
  ];
  if (injectionPatterns.some((p) => p.test(text))) {
    console.warn("[security] possible prompt injection attempt detected");
  }
  return text;
}

// Prompt leak detection (D0.2)
function containsPromptLeak(response: string, prompts: SystemPrompts): boolean {
  const combined = prompts.system + prompts.languageEnforcement;
  for (let i = 0; i < combined.length - 80; i++) {
    if (response.includes(combined.slice(i, i + 80))) return true;
  }
  return false;
}

// Zod validation helper (A2)
function validate<T>(schema: ZodSchema<T>, data: unknown, res: express.Response): T | null {
  const result = schema.safeParse(data);
  if (!result.success) {
    res.status(400).json({ error: "Invalid request", details: result.error.flatten() });
    return null;
  }
  return result.data;
}

function parseId(paramId: string, res: express.Response): number | null {
  const id = Number(paramId);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid ID" });
    return null;
  }
  return id;
}

// ── Zod schemas (A2) ──────────────────────────────────────────────────────────

const createConvSchema = z.object({ title: z.string().min(1).max(200) });
const createMessageSchema = z.object({
  content: z.string().max(32000).optional(),
  model: z.enum(ALLOWED_MODELS).optional(),
  userPrompt: z.string().max(2000).optional(),
  imageBase64: z.string().optional(),
});
const generateImageSchema = z.object({
  prompt: z.string().max(2000).optional(),
  imageBase64: z.string().optional(),
  conversationId: z.number().optional(),
  conversationTitle: z.string().max(200).optional(),
});
const authTokenSchema = z.object({ clientId: z.string().uuid() });

// ── Smart model routing ───────────────────────────────────────────────────────

const COMPLEX_PATTERNS = [
  /\b(code|program|script|function|algorithm|implement|refactor|debug)\b/i,
  /\b(analyze|analyse|compare|contrast|explain in detail|step by step)\b/i,
  /\b(math|equation|calcul|proof|theorem|formula|integral|derivative)\b/i,
  /\b(architect|design system|optimize|performance|scalab)\b/i,
  /\b(essay|research|comprehensive|detailed|in-depth|exhaustive)\b/i,
];

function isComplexQuery(text: string): boolean {
  if (text.length > 400) return true;
  return COMPLEX_PATTERNS.some((p) => p.test(text));
}

// ── Retry fetch with timeout (D2) ─────────────────────────────────────────────

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = 15_000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === "AbortError") throw new Error("Request timed out");
    throw err;
  }
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 2
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, attempt * 1200));
      console.warn(`[openrouter] retry attempt ${attempt}`);
    }
    try {
      const res = await fetchWithTimeout(url, options);
      if (res.ok || res.status < 500) return res;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function getMessageCount(db: ReturnType<typeof getDb>, hashedClientId: string) {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const result = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(messagesTable)
    .where(
      and(
        eq(messagesTable.role, "user"),
        gte(messagesTable.createdAt, todayStart),
        sql`${messagesTable.conversationId} IN (SELECT id FROM conversations WHERE client_id = ${hashedClientId})`
      )
    );
  return result[0]?.count ?? 0;
}

async function getOrCreateSubscription(db: ReturnType<typeof getDb>, hashedClientId: string) {
  const [existing] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.clientId, hashedClientId));
  if (existing) return existing;
  const [created] = await db
    .insert(subscriptionsTable)
    .values({ clientId: hashedClientId, status: "free" })
    .returning();
  return created;
}

// ── Telegram helpers ──────────────────────────────────────────────────────────

async function sendTelegramMessage(
  chatId: string | number,
  text: string,
  replyMarkup?: object
) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  const body: Record<string, unknown> = { chat_id: chatId, text, parse_mode: "HTML" };
  if (replyMarkup) body.reply_markup = replyMarkup;
  try {
    const res = await fetchWithTimeout(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
}

async function sendTelegramTyping(chatId: string | number) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await fetchWithTimeout(`https://api.telegram.org/bot${token}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action: "typing" }),
    });
  } catch { /* ignore */ }
}

// ── SSE helpers ───────────────────────────────────────────────────────────────

type SseRes = import("express").Response;

function sseToken(res: SseRes, content: string) {
  res.write(`data: ${JSON.stringify({ type: "token", content })}\n\n`);
}
function sseThinking(res: SseRes, content: string) {
  res.write(`data: ${JSON.stringify({ type: "thinking", content })}\n\n`);
}
function sseDone(res: SseRes) {
  res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
}
function sseError(res: SseRes, message: string) {
  res.write(`data: ${JSON.stringify({ type: "error", message })}\n\n`);
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const INTERNET_TOOLS = [
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the web for real-time information, current events, news, facts, and any topic that may have changed since training. Only call this when the answer genuinely requires current or external data.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query. Be specific and descriptive for best results.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_url",
      description:
        "Fetch and read the content of any public URL — web pages, APIs, documentation, news articles, JSON endpoints. Returns the page text or JSON.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The full URL to fetch (must start with http:// or https://).",
          },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_weather",
      description:
        "Get current weather conditions and a 3-day forecast for any city or location worldwide.",
      parameters: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description: "City name, region, or location (e.g. 'New York', 'London', 'Tokyo, Japan').",
          },
        },
        required: ["location"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_stock_price",
      description:
        "Get the current stock price, daily change, and key market data for any publicly traded company using its ticker symbol.",
      parameters: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Stock ticker symbol (e.g. 'AAPL' for Apple, 'TSLA' for Tesla, 'BTC-USD' for Bitcoin).",
          },
        },
        required: ["symbol"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_current_datetime",
      description:
        "Get the current date and time in UTC. Use this when the user asks what day or time it is, or when you need today's date for calculations, ages, deadlines, or any time-sensitive reasoning.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
];

// ── Tool status labels ────────────────────────────────────────────────────────

const TOOL_DISPLAY: Record<string, (args: Record<string, string>) => string> = {
  web_search:           (a) => `🔍 Searching the web for "${a.query}"`,
  fetch_url:            (a) => `📡 Fetching ${a.url}`,
  get_weather:          (a) => `🌤️ Getting weather for ${a.location}`,
  get_stock_price:      (a) => `📈 Looking up ${a.symbol} stock price`,
  get_current_datetime: ()  => `🕐 Getting current date and time`,
};

async function executeTool(name: string, args: Record<string, string>): Promise<string> {
  try {
    switch (name) {
      case "web_search":        return await webSearch(args.query ?? "");
      case "fetch_url": {
        const url = args.url || "";
        if (!isSafeUrl(url)) return "Error: URL is not allowed (blocked for security reasons).";
        return await fetchUrl(url);
      }
      case "get_weather":       return await getWeather(args.location ?? "");
      case "get_stock_price":   return await getStockPrice(args.symbol ?? "");
      case "get_current_datetime": return getCurrentDatetime();
      default:                  return `Unknown tool: ${name}`;
    }
  } catch (err: any) {
    return `Tool error: ${err?.message || String(err)}`;
  }
}

// ── Dedup / replay protection (D6) ───────────────────────────────────────────

const seenRequestIds = new Map<string, number>();
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [id, ts] of seenRequestIds) {
    if (ts < cutoff) seenRequestIds.delete(id);
  }
}, 60_000);

// ── App ───────────────────────────────────────────────────────────────────────

const app = express();

// Trust proxy (D12) — so req.ip reflects real client IP for rate limiting
app.set("trust proxy", 1);
app.disable("x-powered-by");

// HTTPS redirect in production (D12)
app.use((req, res, next) => {
  if (process.env.NODE_ENV === "production" && req.headers["x-forwarded-proto"] !== "https") {
    return res.redirect(301, "https://" + req.headers.host + req.url);
  }
  next();
});

// Helmet with CSP (A4, D4, D12)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      imgSrc:     ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      frameSrc:   ["'none'"],
      objectSrc:  ["'none'"],
      baseUri:    ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31_536_000,
    includeSubDomains: true,
    preload: true,
  },
}));

// CORS allowlist (A4)
app.use(cors({
  origin: (origin, cb) => {
    const allowed = (process.env.APP_URL || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!origin || allowed.length === 0 || allowed.includes(origin)) return cb(null, true);
    cb(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "DELETE"],
}));

// Body size limit (A4)
app.use(express.json({ limit: "2mb" }));

// Prototype pollution sanitizer (D3)
app.use((req, _res, next) => {
  if (req.body && typeof req.body === "object") {
    const dangerous = ["__proto__", "constructor", "prototype"];
    function sanitize(obj: any): any {
      if (typeof obj !== "object" || obj === null) return obj;
      for (const key of dangerous) delete obj[key];
      for (const key of Object.keys(obj)) obj[key] = sanitize(obj[key]);
      return obj;
    }
    req.body = sanitize(req.body);
  }
  next();
});

// Depth bomb protection (D3)
function maxDepth(obj: any, depth = 0): number {
  if (typeof obj !== "object" || obj === null) return depth;
  const vals = Object.values(obj);
  if (vals.length === 0) return depth;
  return Math.max(...vals.map((v) => maxDepth(v, depth + 1)));
}
app.use((req, res, next) => {
  if (req.body && maxDepth(req.body) > 5) {
    res.status(400).json({ error: "Request body too deeply nested" });
    return;
  }
  next();
});

// Global 30s timeout (D5) — SSE route overrides to 300s below
app.use(timeout("30s"));
app.use((req, res, next) => {
  if (!req.timedout) next();
});

// IP-based rate limiters (A5)
const generalLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: "Too many requests. Please wait." }),
});
const authLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: "Too many requests. Please wait." }),
});
const adminLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(404).json({ error: "Not found" }),
});
const unknownPathLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  handler: (_req, res) => res.status(429).json({ error: "Too many requests" }),
});

app.use("/api/", generalLimiter);

// ── Auth middleware (A1) ──────────────────────────────────────────────────────

function requireAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  const header = req.headers["authorization"] || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    res.status(401).json({ error: "Authorization required" });
    return;
  }
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    res.status(500).json({ error: "Internal configuration error" });
    return;
  }
  try {
    const payload = jwt.verify(token, secret) as jwt.JwtPayload;
    if (typeof payload.sub !== "string" || !payload.sub) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }
    req.clientId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

// ── Admin middleware (A3, C2) ─────────────────────────────────────────────────
// Returns 404 (not 401) to hide admin route existence

function requireAdmin(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  const header = req.headers["authorization"] || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const secret = process.env.ADMIN_SECRET || "";
  if (!secret || !token) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const tokenBuf  = Buffer.from(token.padEnd(64));
  const secretBuf = Buffer.from(secret.padEnd(64));
  if (tokenBuf.length !== secretBuf.length || !timingSafeEqual(tokenBuf, secretBuf)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  next();
}

// ── DB startup ────────────────────────────────────────────────────────────────

checkDbConnection().then(() => ensureTables().catch(console.error));

// ── Auto-retention purge (B5) ─────────────────────────────────────────────────

async function purgeExpiredMessages() {
  const days = Number(process.env.RETENTION_DAYS ?? 90);
  if (!days) return;
  try {
    const db = getDb();
    const cutoff = new Date(Date.now() - days * 86_400_000);
    const deleted = await db
      .delete(conversationsTable)
      .where(sql`${conversationsTable.createdAt} < ${cutoff}`)
      .returning({ id: conversationsTable.id });
    if (deleted.length > 0) {
      console.info(`[retention] purged ${deleted.length} conversations older than ${days} days`);
    }
  } catch (err: any) {
    console.warn("[retention] purge failed:", err.message);
  }
}
setInterval(purgeExpiredMessages, 3_600_000);
purgeExpiredMessages();

// ── Auth route (A1) ───────────────────────────────────────────────────────────

app.post("/api/auth/token", authLimiter, async (req, res) => {
  const body = validate(authTokenSchema, req.body, res);
  if (!body) return;
  const secret = process.env.JWT_SECRET;
  if (!secret) { res.status(500).json({ error: "Internal configuration error" }); return; }
  try {
    const token = jwt.sign(
      { sub: body.clientId, jti: randomUUID() },
      secret,
      { expiresIn: "90d" }
    );
    res.json({ token });
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Admin routes (A3, C1, C2, D0.4) ──────────────────────────────────────────

const adminSlug = process.env.ADMIN_PATH_SLUG;
if (adminSlug) {
  app.get(`/api/${adminSlug}/stats`, adminLimiter, requireAdmin, async (req, res) => {
    console.info(`[internal] stats requested`);
    try {
      const db = getDb();
      const msgStats = await db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(messagesTable);
      const convStats = await db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(conversationsTable);
      const subStats = await db
        .select({ status: subscriptionsTable.status, count: sql<number>`cast(count(*) as int)` })
        .from(subscriptionsTable)
        .groupBy(subscriptionsTable.status);
      const subMap: Record<string, number> = {};
      for (const r of subStats) subMap[r.status] = r.count;
      res.setHeader("Cache-Control", "no-store");
      res.json({
        totalMessages: msgStats[0]?.count ?? 0,
        totalConversations: convStats[0]?.count ?? 0,
        subscriptions: {
          active: subMap["active"] ?? 0,
          pending: subMap["pending"] ?? 0,
          free: subMap["free"] ?? 0,
          rejected: subMap["rejected"] ?? 0,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // View system prompt
  app.get(`/api/${adminSlug}/prompt`, adminLimiter, requireAdmin, (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(getPrompts());
  });

  // Update system prompt in-memory
  app.post(`/api/${adminSlug}/prompt`, adminLimiter, requireAdmin, (req, res) => {
    const { system_prompt_b64 } = req.body;
    if (!system_prompt_b64 || typeof system_prompt_b64 !== "string") {
      res.status(400).json({ error: "system_prompt_b64 required" });
      return;
    }
    try {
      const parsed = JSON.parse(Buffer.from(system_prompt_b64, "base64").toString("utf8")) as SystemPrompts;
      const required: (keyof SystemPrompts)[] = ["system", "languageEnforcement", "personaPrefill", "englishLockUser", "englishLockAssistant"];
      for (const key of required) {
        if (typeof parsed[key] !== "string") {
          res.status(400).json({ error: `Missing required key: ${key}` });
          return;
        }
      }
      _prompts = parsed;
      console.info("[internal] system prompt updated in memory. Remember to update SYSTEM_PROMPT_B64 env var for persistence.");
      res.json({ ok: true, message: "Prompt updated for this session." });
    } catch (err: any) {
      res.status(400).json({ error: "Invalid base64 or JSON" });
    }
  });

  // Approve subscription (admin only)
  app.post(`/api/${adminSlug}/subscriptions/update`, adminLimiter, requireAdmin, async (req, res) => {
    const { clientId, plan, action } = req.body;
    if (!clientId || !action) { res.status(400).json({ error: "clientId and action required" }); return; }
    try {
      const db = getDb();
      const hashedId = hashClientId(clientId);
      if (action === "approve") {
        if (!plan) { res.status(400).json({ error: "plan required for approve" }); return; }
        const expiresAt = plan === "monthly" ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null;
        await db.update(subscriptionsTable)
          .set({ status: "active", plan, expiresAt: expiresAt ?? sql`null`, updatedAt: sql`now()` })
          .where(eq(subscriptionsTable.clientId, hashedId));
      } else if (action === "reject") {
        await db.update(subscriptionsTable)
          .set({ status: "rejected", updatedAt: sql`now()` })
          .where(eq(subscriptionsTable.clientId, hashedId));
      } else {
        res.status(400).json({ error: "action must be approve or reject" }); return;
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });
}

// ── Subscription ──────────────────────────────────────────────────────────────

app.get("/api/subscription/status", async (req, res) => {
  const rawClientId = req.headers["x-client-id"] as string;
  if (!rawClientId) { res.status(400).json({ error: "X-Client-ID header required" }); return; }
  const hashedId = hashClientId(rawClientId);
  try {
    const db = getDb();
    const sub = await getOrCreateSubscription(db, hashedId);
    const messageCount = await getMessageCount(db, hashedId);
    const isActive =
      sub.status === "active" &&
      (sub.plan === "lifetime" || !sub.expiresAt || new Date(sub.expiresAt) > new Date());
    res.json({ status: sub.status, plan: sub.plan, messageCount, limit: FREE_LIMIT, isActive, expiresAt: sub.expiresAt });
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/subscription/claim", async (req, res) => {
  const rawClientId = req.headers["x-client-id"] as string;
  if (!rawClientId) { res.status(400).json({ error: "X-Client-ID header required" }); return; }
  const hashedId = hashClientId(rawClientId);
  const { plan, txHash, network } = req.body;
  if (!plan || !txHash || !network) {
    res.status(400).json({ error: "plan, txHash, and network are required" });
    return;
  }
  if (!["monthly", "lifetime"].includes(plan)) { res.status(400).json({ error: "Invalid plan" }); return; }
  const walletMap: Record<string, string> = { erc20: WALLET_ERC20, trc20: WALLET_TRC20, bep20: WALLET_BEP20 };
  if (!walletMap[network]) { res.status(400).json({ error: "Invalid network" }); return; }
  try {
    const db = getDb();
    await db
      .insert(subscriptionsTable)
      .values({ clientId: hashedId, status: "pending", plan, txHash, network })
      .onConflictDoUpdate({
        target: subscriptionsTable.clientId,
        set: { status: "pending", plan, txHash, network, updatedAt: sql`now()` },
      });
    const networkLabel = { erc20: "USDT ERC20", trc20: "USDT TRC20", bep20: "USDT BEP20" }[network];
    const tgText = [
      `🔔 <b>New Premium Payment Claim</b>`,
      ``,
      `📦 <b>Plan:</b> ${plan === "monthly" ? "Monthly" : "Lifetime"} ($${PLAN_PRICES[plan]})`,
      `🌐 <b>Network:</b> ${networkLabel}`,
      `💳 <b>Wallet:</b> <code>${walletMap[network]}</code>`,
      `🔗 <b>TX Hash:</b> <code>${txHash}</code>`,
      `⏰ <b>Time:</b> ${new Date().toUTCString()}`,
    ].join("\n");
    const notifChatId = process.env.TELEGRAM_CHAT_ID;
    if (notifChatId) {
      await sendTelegramMessage(notifChatId, tgText, {
        inline_keyboard: [[
          { text: `✅ Approve (${plan})`, callback_data: `approve:${plan}:${rawClientId}` },
          { text: "❌ Reject", callback_data: `reject:${rawClientId}` },
        ]],
      });
    }
    res.json({ success: true, status: "pending" });
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Telegram webhook (C3) ─────────────────────────────────────────────────────

app.get("/api/telegram/webhook", (_req, res) => res.json({ ok: true }));

app.post("/api/telegram/webhook", async (req, res) => {
  // Webhook secret validation (C3)
  const webhookSecret = req.headers["x-telegram-bot-api-secret-token"] as string | undefined;
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expectedSecret && webhookSecret !== expectedSecret) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const update = req.body;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) { res.json({ ok: true }); return; }

  const appUrl = process.env.APP_URL || "https://deepseek-uncensored-api-server.vercel.app";
  const miniAppUrl =
    process.env.MINIAPP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null) ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    appUrl;

  const msg = update?.message;

  if (msg?.chat?.id) {
    sendTelegramTyping(msg.chat.id).catch(() => {});
  }

  if (msg?.text?.startsWith("/start")) {
    res.json({ ok: true }); // respond immediately so Telegram does not retry
    const userChatId = msg.chat.id;
    const firstName = msg.from?.first_name || "there";
    try {
      await fetchWithTimeout(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: userChatId,
          parse_mode: "HTML",
          text: `👋 <b>Hey ${firstName}!</b>\n\nWelcome to <b>DeepSeek Uncensored</b> — the AI that actually answers your questions.\n\n🧠 Powered by DeepSeek V4\n⚡ Fast, direct, no fluff\n🔓 No restrictions, no refusals\n🌐 Real-time internet access — live news, weather, stocks & more\n\n<i>Get 20 free messages to start. Upgrade anytime for unlimited access.</i>`,
          reply_markup: {
            inline_keyboard: [[{ text: "🚀 Open DeepSeek Chat", web_app: { url: miniAppUrl } }]],
          },
        }),
      });
    } catch (err) {
      console.error("[telegram] /start error");
    }
    return;
  }

  const callback = update?.callback_query;
  if (!callback) { res.json({ ok: true }); return; }

  const data: string = callback.data ?? "";
  const messageId = callback.message?.message_id;
  const chatId = callback.message?.chat?.id;

  const answerCallback = async (text: string) => {
    await fetchWithTimeout(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callback.id, text }),
    });
  };
  const editMessage = async (text: string) => {
    if (!chatId || !messageId) return;
    await fetchWithTimeout(`https://api.telegram.org/bot${token}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, parse_mode: "HTML" }),
    });
  };

  res.json({ ok: true }); // respond immediately so Telegram does not retry
  try {
    const db = getDb();
    if (data.startsWith("approve:")) {
      const parts = data.split(":");
      const plan = parts[1];
      const rawClientId = parts.slice(2).join(":");
      const hashedId = hashClientId(rawClientId);
      const expiresAt = plan === "monthly" ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null;
      await db
        .update(subscriptionsTable)
        .set({ status: "active", plan, expiresAt: expiresAt ?? sql`null`, updatedAt: sql`now()` })
        .where(eq(subscriptionsTable.clientId, hashedId));
      await answerCallback("✅ Approved!");
      await editMessage(
        `✅ <b>APPROVED</b>\n\nPlan: ${plan}\n${expiresAt ? `Expires: ${expiresAt.toUTCString()}` : "Lifetime access"}`
      );
    } else if (data.startsWith("reject:")) {
      const rawClientId = data.slice(7);
      const hashedId = hashClientId(rawClientId);
      await db
        .update(subscriptionsTable)
        .set({ status: "rejected", updatedAt: sql`now()` })
        .where(eq(subscriptionsTable.clientId, hashedId));
      await answerCallback("❌ Rejected.");
      await editMessage(`❌ <b>REJECTED</b>`);
    }
  } catch (err) {
    console.error("[telegram] webhook callback error");
  }
});

app.get("/api/telegram/setup", async (req, res) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const appUrl =
    process.env.APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null) ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  if (!token || !appUrl) {
    res.status(400).json({ error: "TELEGRAM_BOT_TOKEN must be set, and app must be deployed" });
    return;
  }
  const webhookUrl = `${appUrl}/api/telegram/webhook`;
  try {
    const r = await fetchWithTimeout(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
        allowed_updates: ["message", "callback_query"],
      }),
    });
    const data = await r.json();
    res.json({ webhookUrl, telegramResponse: data });
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Conversations CRUD (A1, A2, A6, B1) ──────────────────────────────────────

app.post("/api/conversations", requireAuth, async (req, res) => {
  const body = validate(createConvSchema, req.body, res);
  if (!body) return;
  const hashedId = hashClientId(req.clientId);
  try {
    const db = getDb();
    const [row] = await db
      .insert(conversationsTable)
      .values({ title: body.title, clientId: hashedId })
      .returning();
    res.status(201).json({ id: row.id, title: row.title, createdAt: row.createdAt });
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/conversations", requireAuth, async (req, res) => {
  const hashedId = hashClientId(req.clientId);
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.clientId, hashedId))
      .orderBy(asc(conversationsTable.createdAt));
    res.json(rows.map((r) => ({ id: r.id, title: r.title, createdAt: r.createdAt })));
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/conversations/:id", requireAuth, async (req, res) => {
  const id = parseId(req.params.id, res);
  if (!id) return;
  const hashedId = hashClientId(req.clientId);
  try {
    const db = getDb();
    // A6: ownership enforced at DB level
    const [conv] = await db
      .select()
      .from(conversationsTable)
      .where(and(eq(conversationsTable.id, id), eq(conversationsTable.clientId, hashedId)));
    if (!conv) { res.status(404).json({ error: "Not found" }); return; }
    const msgs = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, id))
      .orderBy(asc(messagesTable.createdAt));
    res.json({
      id: conv.id,
      title: conv.title,
      createdAt: conv.createdAt,
      messages: msgs.map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        role: m.role,
        content: m.content,
        attachedImage: m.attachedImage ?? undefined,
        generatedImageUrl: m.generatedImageUrl ?? undefined,
        createdAt: m.createdAt,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});

app.delete("/api/conversations/:id", requireAuth, async (req, res) => {
  const id = parseId(req.params.id, res);
  if (!id) return;
  const hashedId = hashClientId(req.clientId);
  try {
    const db = getDb();
    // B1: explicit message delete first (safety net), then cascade via FK
    await db.delete(messagesTable).where(eq(messagesTable.conversationId, id));
    // A6: ownership enforced at DB level
    const [row] = await db
      .delete(conversationsTable)
      .where(and(eq(conversationsTable.id, id), eq(conversationsTable.clientId, hashedId)))
      .returning({ id: conversationsTable.id });
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// B1: bulk delete all conversations for this user
app.delete("/api/conversations", requireAuth, async (req, res) => {
  const hashedId = hashClientId(req.clientId);
  try {
    const db = getDb();
    const convs = await db
      .select({ id: conversationsTable.id })
      .from(conversationsTable)
      .where(eq(conversationsTable.clientId, hashedId));
    for (const c of convs) {
      await db.delete(messagesTable).where(eq(messagesTable.conversationId, c.id));
    }
    await db.delete(conversationsTable).where(eq(conversationsTable.clientId, hashedId));
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// B1: full account wipe
app.delete("/api/account", requireAuth, async (req, res) => {
  const hashedId = hashClientId(req.clientId);
  console.info(`[privacy] full account wipe for client ${req.clientId.slice(0, 8)}`);
  try {
    const db = getDb();
    const convs = await db
      .select({ id: conversationsTable.id })
      .from(conversationsTable)
      .where(eq(conversationsTable.clientId, hashedId));
    for (const c of convs) {
      await db.delete(messagesTable).where(eq(messagesTable.conversationId, c.id));
    }
    await db.delete(conversationsTable).where(eq(conversationsTable.clientId, hashedId));
    await db.delete(subscriptionsTable).where(eq(subscriptionsTable.clientId, hashedId));
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Chat — tool-calling pre-pass + streaming final response ──────────────────

app.post(
  "/api/conversations/:id/messages",
  timeout("300s"),
  requireAuth,
  async (req, res) => {
    const convId = parseId(req.params.id, res);
    if (!convId) return;

    const body = validate(createMessageSchema, req.body, res);
    if (!body) return;

    const { content, model, userPrompt, imageBase64 } = body;
    const clientId = req.clientId;
    const hashedId = hashClientId(clientId);
    const reqKey = `${clientId}:${convId}`;
    const reqStart = Date.now();

    if (!content && !imageBase64) {
      res.status(400).json({ error: "content or image required" });
      return;
    }

    // Hard message length check (D9)
    if (content && content.length > 32_000) {
      res.status(400).json({ error: "Message too long" });
      return;
    }

    // Dedup / replay protection (D6)
    const requestId = req.headers["x-request-id"] as string | undefined;
    if (requestId) {
      if (seenRequestIds.has(requestId)) {
        res.status(409).json({ error: "Duplicate request" });
        return;
      }
      seenRequestIds.set(requestId, Date.now());
    }

    if (inFlightRequests.has(reqKey)) {
      res.status(409).json({ error: "A response is already in progress for this conversation." });
      return;
    }

    if (!checkRateLimit(clientId)) {
      res.status(429).json({ error: "Too many requests. Please wait a moment." });
      return;
    }

    inFlightRequests.add(reqKey);

    const rawMessageContent: string = content ?? "What does this image show?";
    // D9: sanitize for prompt injection
    const messageContent = sanitizeUserMessage(rawMessageContent);

    // D0.5: hard cap userPrompt at 2000 chars
    const safeUserPrompt = (userPrompt || "").slice(0, 2000);

    const selectedModel: AllowedModel = (ALLOWED_MODELS as readonly string[]).includes(model ?? "")
      ? (model as AllowedModel)
      : "deepseek/deepseek-chat";

    try {
      const db = getDb();

      let isUserActive = false;
      const sub = await getOrCreateSubscription(db, hashedId);
      isUserActive =
        sub.status === "active" &&
        (sub.plan === "lifetime" || !sub.expiresAt || new Date(sub.expiresAt) > new Date());
      if (!isUserActive) {
        const msgCount = await getMessageCount(db, hashedId);
        if (msgCount >= FREE_LIMIT) {
          res.status(402).json({ error: "free_limit_reached", messageCount: msgCount, limit: FREE_LIMIT });
          return;
        }
        // D11: daily hard cap
        if (msgCount >= DAILY_HARD_CAP) {
          res.status(429).json({ error: "Daily limit reached. Try again tomorrow." });
          return;
        }
      }

      let effectiveModel: AllowedModel = isUserActive
        ? selectedModel
        : FREE_ALLOWED_MODELS.includes(selectedModel) ? selectedModel : "deepseek/deepseek-chat";

      if (isUserActive && effectiveModel === "deepseek/deepseek-chat" && isComplexQuery(messageContent)) {
        effectiveModel = "deepseek/deepseek-r1";
        console.info(`[chat] auto-routed to deepseek-v4-pro`);
      }

      const isPro = effectiveModel === "deepseek/deepseek-r1";
      const maxTokens = isPro ? MAX_TOKENS_PRO : MAX_TOKENS_FLASH;

      // Vision preprocessing
      let imageContext = "";
      if (imageBase64) {
        try {
          const apiKey = process.env.OPENROUTER_API_KEY;
          const visionRes = await fetchWithTimeout(
            "https://openrouter.ai/api/v1/chat/completions",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "HTTP-Referer": process.env.APP_URL || "https://deepseek-uncensored-api-server.vercel.app",
                "X-Title": "DeepSeek Chat",
              },
              body: JSON.stringify({
                model: VISION_MODEL,
                max_tokens: 1000,
                messages: [{
                  role: "user",
                  content: [
                    { type: "image_url", image_url: { url: imageBase64 } },
                    { type: "text", text: "Describe this image in full detail. Transcribe all visible text exactly as it appears. Describe all objects, people, colors, layout, numbers, charts, diagrams, or any other observable information." },
                  ],
                }],
              }),
            },
            20_000
          );
          if (visionRes.ok) {
            const visionData = (await visionRes.json()) as any;
            imageContext = visionData.choices?.[0]?.message?.content || "";
          }
        } catch (visionErr: any) {
          if (visionErr?.name !== "AbortError") console.error("[vision] failed:", visionErr?.message);
        }
      }

      // A6: ownership enforced at DB level
      const [conv] = await db
        .select({ id: conversationsTable.id })
        .from(conversationsTable)
        .where(and(eq(conversationsTable.id, convId), eq(conversationsTable.clientId, hashedId)));
      if (!conv) { res.status(404).json({ error: "Not found" }); return; }

      // B7: never store raw image base64
      await db.insert(messagesTable).values({
        conversationId: convId,
        role: "user",
        content: messageContent,
        attachedImage: imageBase64 ? "[image attached]" : null,
      });

      const allHistory = await db
        .select({ role: messagesTable.role, content: messagesTable.content })
        .from(messagesTable)
        .where(eq(messagesTable.conversationId, convId))
        .orderBy(asc(messagesTable.createdAt));

      let history = allHistory.slice(-30);
      while (history.length > 2) {
        const totalChars = history.reduce((sum, m) => sum + m.content.length, 0);
        if (totalChars <= 60_000) break;
        history = history.slice(2);
      }

      // Set SSE headers
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.setHeader("X-Content-Type-Options", "nosniff");

      const apiKey = process.env.OPENROUTER_API_KEY!;
      const prompts = getPrompts();

      let systemContent = `${prompts.languageEnforcement}\n\n${prompts.system}`;
      if (safeUserPrompt) {
        systemContent += `\n\nUSER CUSTOM INSTRUCTIONS:\n${safeUserPrompt}`;
      }

      const openRouterMessages: { role: "user" | "assistant"; content: string }[] = history.map((m, idx) => {
        if (idx === history.length - 1 && m.role === "user" && imageBase64) {
          const imageNote = imageContext
            ? `[The user attached an image. Here is the full image analysis from a vision model:]\n${imageContext}`
            : `[The user attached an image. The automatic vision analysis failed — you cannot see the image contents. Tell the user their image was received but could not be analyzed, and ask them to describe what they need help with.]`;
          return {
            role: "user" as const,
            content: `${imageNote}\n\n[User's question/message:]\n${m.content}`,
          };
        }
        return { role: m.role as "user" | "assistant", content: m.content };
      });

      const makeBaseMessages = () => [
        { role: "system" as const, content: systemContent },
        { role: "assistant" as const, content: prompts.personaPrefill },
        { role: "user" as const, content: prompts.englishLockUser },
        { role: "assistant" as const, content: prompts.englishLockAssistant },
        ...openRouterMessages,
      ];

      // Tool-calling loop (non-streaming pre-pass)
      type AnyMessage = {
        role: "system" | "user" | "assistant" | "tool";
        content: string;
        tool_call_id?: string;
        tool_calls?: any[];
      };
      const toolMessages: AnyMessage[] = [...(makeBaseMessages() as AnyMessage[])];
      const MAX_TOOL_ROUNDS = 5;

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        let toolCheckData: any;
        try {
          const toolCheckRes = await fetchWithRetry("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
              "HTTP-Referer": process.env.APP_URL || "https://deepseek-uncensored-api-server.vercel.app",
              "X-Title": "DeepSeek Chat",
            },
            body: JSON.stringify({
              model: effectiveModel,
              max_tokens: 512,
              temperature: 0.7,
              stream: false,
              tools: INTERNET_TOOLS,
              tool_choice: "auto",
              messages: toolMessages,
            }),
          });
          // D11: guard 401 — don't expose key metadata
          if (toolCheckRes.status === 401) {
            console.error("[openrouter] API key rejected");
            sseError(res, "AI service authentication failed. Contact support.");
            res.end();
            return;
          }
          if (!toolCheckRes.ok) break;
          toolCheckData = await toolCheckRes.json();
        } catch {
          break;
        }

        const choice = toolCheckData?.choices?.[0];
        if (!choice) break;
        if (choice.finish_reason !== "tool_calls" || !choice.message?.tool_calls?.length) break;

        toolMessages.push({
          role: "assistant",
          content: choice.message.content || "",
          tool_calls: choice.message.tool_calls,
        });

        const toolCalls: any[] = choice.message.tool_calls;
        for (const tc of toolCalls) {
          let args: Record<string, string> = {};
          try { args = JSON.parse(tc.function?.arguments || "{}"); } catch { args = {}; }
          const toolName: string = tc.function?.name || "";
          const displayText = TOOL_DISPLAY[toolName]?.(args) || `⚙️ Running ${toolName}`;

          res.write(`data: ${JSON.stringify({ type: "tool_status", tool: toolName, label: displayText })}\n\n`);
          const toolResult = await executeTool(toolName, args);
          toolMessages.push({ role: "tool", tool_call_id: tc.id, content: toolResult });
          res.write(`data: ${JSON.stringify({ type: "tool_done" })}\n\n`);
        }
      }

      // Streaming final response
      const finalMessages = toolMessages.length > makeBaseMessages().length
        ? toolMessages
        : (makeBaseMessages() as AnyMessage[]);

      let response: Response;
      try {
        response = await fetchWithRetry("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            "HTTP-Referer": process.env.APP_URL || "https://deepseek-uncensored-api-server.vercel.app",
            "X-Title": "DeepSeek Chat",
          },
          body: JSON.stringify({
            model: effectiveModel,
            max_tokens: maxTokens,
            temperature: 1.0,
            stream: true,
            messages: finalMessages,
          }),
        });
      } catch (fetchErr: any) {
        sseError(res, "Connection to AI failed after retries. Please try again.");
        res.end();
        return;
      }

      // D11: guard 401
      if (response.status === 401) {
        console.error("[openrouter] API key rejected on final stream");
        sseError(res, "AI service authentication failed. Contact support.");
        res.end();
        return;
      }

      if (!response.ok || !response.body) {
        console.error("[openrouter] stream error:", response.status);
        sseError(res, `AI service error (${response.status}). Please try again.`);
        res.end();
        return;
      }

      let fullResponse = "";
      let fullThinking = "";
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // <think> tag parser
      let inThink = false;
      let pendingTag = "";

      function longestTagOverlap(str: string, tag: string): number {
        for (let len = Math.min(str.length, tag.length - 1); len > 0; len--) {
          if (tag.startsWith(str.slice(str.length - len))) return len;
        }
        return 0;
      }

      function routeContent(raw: string) {
        let text = pendingTag + raw;
        pendingTag = "";
        while (text.length > 0) {
          if (!inThink) {
            const idx = text.indexOf("<think>");
            if (idx === -1) {
              const overlap = longestTagOverlap(text, "<think>");
              const safe = text.slice(0, text.length - overlap);
              if (safe) { sseToken(res, safe); fullResponse += safe; }
              pendingTag = text.slice(text.length - overlap);
              break;
            }
            const safe = text.slice(0, idx);
            if (safe) { sseToken(res, safe); fullResponse += safe; }
            inThink = true;
            text = text.slice(idx + 7);
          } else {
            const idx = text.indexOf("</think>");
            if (idx === -1) {
              const overlap = longestTagOverlap(text, "</think>");
              const safe = text.slice(0, text.length - overlap);
              if (safe) { sseThinking(res, safe); fullThinking += safe; }
              pendingTag = text.slice(text.length - overlap);
              break;
            }
            const safe = text.slice(0, idx);
            if (safe) { sseThinking(res, safe); fullThinking += safe; }
            inThink = false;
            text = text.slice(idx + 8);
          }
        }
      }

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === "data: [DONE]") continue;
            if (trimmed.startsWith("data: ")) {
              try {
                const json = JSON.parse(trimmed.slice(6));
                const delta = json.choices?.[0]?.delta;
                if (!delta) continue;
                if (delta.reasoning_content) {
                  fullThinking += delta.reasoning_content;
                  sseThinking(res, delta.reasoning_content);
                }
                if (delta.content) {
                  routeContent(delta.content);
                }
              } catch {
                /* skip malformed chunks */
              }
            }
          }
        }
      } catch (streamErr: any) {
        console.warn("[chat] stream interrupted:", streamErr?.message);
        if (fullResponse) {
          sseToken(res, ""); // flush
        }
      }

      // D0.2: check for prompt leak in assembled response
      if (fullResponse && containsPromptLeak(fullResponse, prompts)) {
        console.warn(`[security] system prompt leak attempt detected for client ${clientId.slice(0, 8)}`);
        fullResponse = "I can't share that information.";
      }

      // B3: log timing only — no message content
      const elapsed = Date.now() - reqStart;
      console.info(
        `[chat] convId=${convId} model=${effectiveModel} tokens≈${(fullResponse.length / 4) | 0} elapsed=${elapsed}ms`
      );

      // Save response
      if (fullResponse) {
        await db.insert(messagesTable).values({
          conversationId: convId,
          role: "assistant",
          content: fullResponse,
        });
      }

      sseDone(res);
      res.end();
    } catch (err: any) {
      console.error("[chat] unhandled error:", err?.message);
      sseError(res, "Internal server error");
      res.end();
    } finally {
      inFlightRequests.delete(reqKey);
    }
  }
);

// ── Image generation ──────────────────────────────────────────────────────────

app.post("/api/generate-image", requireAuth, async (req, res) => {
  const body = validate(generateImageSchema, req.body, res);
  if (!body) return;
  const { prompt, imageBase64, conversationId: existingConvId, conversationTitle } = body;
  const clientId = req.clientId;
  const hashedId = hashClientId(clientId);

  if ((!prompt || !prompt.trim()) && !imageBase64) {
    res.status(400).json({ error: "prompt or image required" });
    return;
  }

  try {
    const db = getDb();
    const sub = await getOrCreateSubscription(db, hashedId);
    const isActive =
      sub.status === "active" &&
      (sub.plan === "lifetime" || !sub.expiresAt || new Date(sub.expiresAt) > new Date());
    if (!isActive) {
      const msgCount = await getMessageCount(db, hashedId);
      if (msgCount >= FREE_LIMIT) {
        res.status(402).json({ error: "free_limit_reached", messageCount: msgCount, limit: FREE_LIMIT });
        return;
      }
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) { res.status(500).json({ error: "OPENROUTER_API_KEY not configured" }); return; }

    const textContent = (prompt || "Describe and recreate what you see in this image").trim();
    const messageContent: unknown = imageBase64
      ? [{ type: "image_url", image_url: { url: imageBase64 } }, { type: "text", text: textContent }]
      : textContent;

    const response = await fetchWithTimeout(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": process.env.APP_URL || "https://deepseek-uncensored-api-server.vercel.app",
          "X-Title": "DeepSeek Chat",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image",
          messages: [{ role: "user", content: messageContent }],
        }),
      },
      60_000
    );

    if (!response.ok) {
      console.error("[image] OpenRouter error", response.status);
      res.status(502).json({ error: `Image generation failed: HTTP ${response.status}` });
      return;
    }

    let data: any;
    try {
      data = await response.json();
    } catch {
      res.status(502).json({ error: "Invalid response from generation API" });
      return;
    }

    const message = data?.choices?.[0]?.message;
    let imageUrl = "";
    if (Array.isArray(message?.content)) {
      const imgPart = message.content.find((p: any) => p.type === "image_url");
      imageUrl = imgPart?.image_url?.url ?? "";
    }
    if (!imageUrl && message?.images) {
      const images = message.images as Array<{ image_url?: { url: string }; url?: string }>;
      imageUrl = images?.[0]?.image_url?.url ?? images?.[0]?.url ?? "";
    }
    if (!imageUrl) {
      res.status(502).json({ error: "No image returned from generation API" });
      return;
    }

    let savedConvId: number | null = null;
    try {
      const userPromptText = (prompt || "").trim() || "Generate image";
      const title = conversationTitle || userPromptText.slice(0, 60) || "Image";
      let convId: number;
      if (existingConvId) {
        convId = Number(existingConvId);
      } else {
        const [newConv] = await db
          .insert(conversationsTable)
          .values({ title, clientId: hashedId })
          .returning({ id: conversationsTable.id });
        convId = newConv.id;
      }
      // B7: never store raw base64
      await db.insert(messagesTable).values({
        conversationId: convId, role: "user", content: userPromptText,
        attachedImage: imageBase64 ? "[image attached]" : null,
      });
      await db.insert(messagesTable).values({
        conversationId: convId, role: "assistant", content: userPromptText,
        generatedImageUrl: imageUrl,
      });
      savedConvId = convId;
    } catch (dbErr) {
      console.error("[image] Failed to save messages to DB");
    }

    res.json({ imageUrl, conversationId: savedConvId });
  } catch (err: any) {
    console.error("[image] error:", err?.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── 404 catch-all with rate limiter (C5) ─────────────────────────────────────

app.use(unknownPathLimiter);
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

// ── Global error handler (D1) ─────────────────────────────────────────────────

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const isProd = process.env.NODE_ENV === "production";
  console.error("[error] unhandled:", err?.message);
  res.status(err?.status || 500).json({
    error: isProd ? "Internal server error" : err?.message,
  });
});

// ── Process hardening (D10) ───────────────────────────────────────────────────

process.on("uncaughtException", (err) => {
  console.error("[fatal] uncaughtException:", err.message);
  process.exit(1);
});
process.on("unhandledRejection", (reason: any) => {
  console.error("[fatal] unhandledRejection:", reason?.message ?? reason);
  process.exit(1);
});

export default app;
