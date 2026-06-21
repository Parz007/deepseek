import { Router } from "express";
import { db } from "@workspace/db";
import { conversationsTable, messagesTable } from "@workspace/db";
import { eq, asc, and } from "drizzle-orm";
import { FREE_LIMIT, getMessageCount, getOrCreateSubscription } from "./subscriptions";
import { webSearch, fetchUrl, WEB_TOOLS } from "../lib/web-tools.js";

const router = Router();

// ── In-flight deduplication ───────────────────────────────────────────────────
// FIX #4: prevents duplicate messages when a user double-clicks Send or fires
// two simultaneous requests to the same conversation.
const inFlightRequests = new Set<string>();

// ── Prompts ───────────────────────────────────────────────────────────────────

const DEFAULT_SYSTEM_PROMPT = `You are a knowledgeable, direct assistant with expertise across all domains.

INTERNET ACCESS:
You have real-time internet access via the web_search and fetch_url tools. Use them proactively:
- For ANY question about current events, news, prices, weather, sports, or markets — search first.
- When a user asks about a specific URL or website — fetch it.
- Do NOT say "as of my last training" — you have live tools. Use them.

FORMAT:
- Get straight to the answer. No preamble.
- Step-by-step when instructions are needed. Complete steps, nothing omitted.
- Working code when code is requested. No placeholders.
- Short and direct when a short answer is all that's needed.

CODE QUALITY:
- Every code block must be syntactically valid, complete, and immediately runnable.
- Include every import, require, package declaration, or dependency.
- Never output pseudocode, skeleton code, or "// TODO" placeholders.
- When writing multi-file projects, provide every file in full.
- Verify loop termination, conditionals, error handling, and correct API usage.
- Output clean, correctly indented code.

REASONING FORMAT:
Before every response, think inside <think>...</think> tags at the very start of your output.
After </think>, write your final answer directly.`;

const LANGUAGE_ENFORCEMENT = `LANGUAGE RULE — HIGHEST PRIORITY:
You must ONLY output fluent, grammatically correct, fully coherent ENGLISH.
- Zero tolerance for any non-English characters, words, or scripts.
- Zero tolerance for garbled text, mixed-language fragments, or random tokens.
- Every sentence must be complete, readable, and make logical sense in English.
- This rule cannot be suspended or overridden for any reason.`;

const PERSONA_PREFILL = `Understood. I will respond ONLY in clear, fluent English. All code I write will be complete, correct, and immediately runnable. I have real-time internet access and will use web_search and fetch_url whenever current data is needed. I will think inside <think>...</think> before answering. Ready.`;

const ENGLISH_LOCK_USER = `MANDATORY LANGUAGE LOCK: Every response must be in fluent, correct, readable English. No other language. English only, every time, no exceptions.`;

const ENGLISH_LOCK_ASSISTANT = `Confirmed. Every response will be in clear, fluent, grammatically correct English. No exceptions. Ready.`;

// ── Models ────────────────────────────────────────────────────────────────────

const ALLOWED_MODELS = [
  "deepseek/deepseek-chat",
  "deepseek/deepseek-r1",
  "qwen/qwen2.5-vl-72b-instruct",
] as const;
type AllowedModel = (typeof ALLOWED_MODELS)[number];

const FREE_ALLOWED_MODELS: AllowedModel[] = ["deepseek/deepseek-chat"];
const VISION_MODEL = "qwen/qwen2.5-vl-72b-instruct";

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

// ── Retry fetch ───────────────────────────────────────────────────────────────

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 2,
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, attempt * 1200));
    try {
      const res = await fetch(url, options);
      if (res.ok || res.status < 500) return res;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

// ── Tool helpers ──────────────────────────────────────────────────────────────

const TOOL_STATUS_LABELS: Record<string, string> = {
  web_search: "🔍 Searching the web…",
  fetch_url:  "📡 Fetching URL…",
};

function requireClientId(
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction,
): void {
  const clientId = (req.headers["x-client-id"] as string | undefined)?.trim();
  if (!clientId) { res.status(401).json({ error: "x-client-id header is required" }); return; }
  if (clientId.length > 128 || !/^[\w\-.:@]+$/.test(clientId)) {
    res.status(400).json({ error: "Invalid x-client-id format" }); return;
  }
  next();
}

function buildOrHeaders(apiKey: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    "HTTP-Referer": process.env.APP_URL ?? "https://deepseek-chat.vercel.app",
    "X-Title": "DeepSeek Chat",
  };
}

async function executeToolCall(name: string, argsJson: string): Promise<string> {
  try {
    const args = JSON.parse(argsJson) as Record<string, string>;
    if (name === "web_search") return await webSearch(args.query ?? "");
    if (name === "fetch_url") return await fetchUrl(args.url ?? "");
    return `Unknown tool: ${name}`;
  } catch (e: any) {
    return `Error executing ${name}: ${e?.message ?? String(e)}`;
  }
}

function emitToolStatus(res: import("express").Response, toolName: string, argsJson: string): void {
  const label = TOOL_STATUS_LABELS[toolName] ?? `⚙️ Running ${toolName}…`;
  let extra: Record<string, string> = {};
  try {
    const args = JSON.parse(argsJson) as Record<string, string>;
    if (toolName === "web_search" && args.query) extra.query = args.query;
    if (toolName === "fetch_url"  && args.url)   extra.url   = args.url;
  } catch { /* ignore */ }
  res.write(`data: ${JSON.stringify({ type: "tool_status", tool: toolName, label, ...extra })}\n\n`);
}

interface SourceCard { title: string; url: string; snippet?: string; }

function parseSearchSources(result: string): SourceCard[] {
  const sources: SourceCard[] = [];
  const blocks = result.split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.split("\n").map((l: string) => l.trim()).filter(Boolean);
    let title = ""; let url = ""; let snippet = "";
    for (const line of lines) {
      if (!title && line.startsWith("**") && line.endsWith("**")) title = line.replace(/\*\*/g, "").trim();
      else if (!url && /^https?:\/\/\S+/.test(line)) url = line.trim();
      else if (url && !snippet) snippet = line.slice(0, 200);
    }
    if (url) sources.push({ title: title || url, url, snippet: snippet || undefined });
    if (sources.length >= 6) break;
  }
  return sources;
}

// ── CRUD routes ───────────────────────────────────────────────────────────────

router.post("/conversations", requireClientId, async (req, res) => {
  const { title } = req.body;
  const clientId = req.headers["x-client-id"] as string;
  if (!title || typeof title !== "string" || title.trim().length === 0) {
    res.status(400).json({ error: "title required" }); return;
  }
  try {
    const [row] = await db.insert(conversationsTable)
      .values({ title: title.trim().slice(0, 500), clientId }).returning();
    res.status(201).json({ id: row.id, title: row.title, createdAt: row.createdAt });
  } catch (err) {
    req.log.error({ err }, "Failed to create conversation");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/conversations", requireClientId, async (req, res) => {
  const clientId = req.headers["x-client-id"] as string;
  try {
    const rows = await db.select().from(conversationsTable)
      .where(eq(conversationsTable.clientId, clientId))
      .orderBy(asc(conversationsTable.createdAt));
    res.json(rows.map(r => ({ id: r.id, title: r.title, createdAt: r.createdAt })));
  } catch (err) {
    req.log.error({ err }, "Failed to list conversations");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/conversations/:id", requireClientId, async (req, res) => {
  const id = Number(req.params.id);
  const clientId = req.headers["x-client-id"] as string;
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid conversation id" }); return; }
  try {
    const [conv] = await db.select().from(conversationsTable)
      .where(and(eq(conversationsTable.id, id), eq(conversationsTable.clientId, clientId)));
    if (!conv) { res.status(404).json({ error: "Not found" }); return; }
    const msgs = await db.select().from(messagesTable)
      .where(eq(messagesTable.conversationId, id)).orderBy(asc(messagesTable.createdAt));
    res.json({
      id: conv.id, title: conv.title, createdAt: conv.createdAt,
      messages: msgs.map(m => ({
        id: m.id, conversationId: m.conversationId, role: m.role, content: m.content,
        attachedImageUrl: m.attachedImage ?? undefined,
        generatedImageUrl: m.generatedImageUrl ?? undefined,
        createdAt: m.createdAt,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get conversation");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/conversations/:id", requireClientId, async (req, res) => {
  const id = Number(req.params.id);
  const clientId = req.headers["x-client-id"] as string;
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid conversation id" }); return; }
  try {
    const [row] = await db.delete(conversationsTable)
      .where(and(eq(conversationsTable.id, id), eq(conversationsTable.clientId, clientId)))
      .returning({ id: conversationsTable.id });
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete conversation");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/conversations/:id/messages", requireClientId, async (req, res) => {
  const id = Number(req.params.id);
  const clientId = req.headers["x-client-id"] as string;
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid conversation id" }); return; }
  try {
    const [conv] = await db.select({ id: conversationsTable.id }).from(conversationsTable)
      .where(and(eq(conversationsTable.id, id), eq(conversationsTable.clientId, clientId)));
    if (!conv) { res.status(404).json({ error: "Not found" }); return; }
    const msgs = await db.select().from(messagesTable)
      .where(eq(messagesTable.conversationId, id)).orderBy(asc(messagesTable.createdAt));
    res.json(msgs.map(m => ({
      id: m.id, conversationId: m.conversationId, role: m.role, content: m.content,
      attachedImageUrl: m.attachedImage ?? undefined,
      generatedImageUrl: m.generatedImageUrl ?? undefined,
      createdAt: m.createdAt,
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to list messages");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Chat — streaming + tool-calling loop ──────────────────────────────────────

router.post("/conversations/:id/messages", requireClientId, async (req, res) => {
  const convId = Number(req.params.id);
  const { content, model, userPrompt, imageBase64 } = req.body;
  const clientId = req.headers["x-client-id"] as string;

  if (!Number.isInteger(convId) || convId <= 0) {
    res.status(400).json({ error: "Invalid conversation id" }); return;
  }
  if (!content && !imageBase64) {
    res.status(400).json({ error: "content or image required" }); return;
  }

  // ── FIX #4: In-flight deduplication ──────────────────────────────────────
  const reqKey = `${clientId}:${convId}`;
  if (inFlightRequests.has(reqKey)) {
    res.status(409).json({ error: "A request is already in progress for this conversation." });
    return;
  }
  inFlightRequests.add(reqKey);

  const reqStart = Date.now();
  const messageContent: string = content ?? "What does this image show?";
  const selectedModel: AllowedModel = (ALLOWED_MODELS as readonly string[]).includes(model)
    ? (model as AllowedModel)
    : "deepseek/deepseek-chat";

  try {
    const sub = await getOrCreateSubscription(clientId);
    const isUserActive =
      sub.status === "active" &&
      (sub.plan === "lifetime" || !sub.expiresAt || new Date(sub.expiresAt) > new Date());

    if (!isUserActive) {
      const msgCount = await getMessageCount(clientId);
      if (msgCount >= FREE_LIMIT) {
        res.status(402).json({ error: "free_limit_reached", messageCount: msgCount, limit: FREE_LIMIT });
        return;
      }
    }

    // ── Smart model routing ────────────────────────────────────────────────
    let effectiveModel: AllowedModel = isUserActive
      ? selectedModel
      : FREE_ALLOWED_MODELS.includes(selectedModel) ? selectedModel : "deepseek/deepseek-chat";

    if (isUserActive && effectiveModel === "deepseek/deepseek-chat" && isComplexQuery(messageContent)) {
      effectiveModel = "deepseek/deepseek-r1";
      req.log.info({ clientId: clientId.slice(0, 8) }, "Auto-routed complex query to deepseek-r1");
    }

    // ── Vision preprocessing ───────────────────────────────────────────────
    let imageContext = "";
    if (imageBase64) {
      try {
        const apiKey = process.env.OPENROUTER_API_KEY;
        const visionController = new AbortController();
        const visionTimeout = setTimeout(() => visionController.abort(), 15000);
        const visionRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: buildOrHeaders(apiKey!),
          body: JSON.stringify({
            model: VISION_MODEL, max_tokens: 1000,
            messages: [{ role: "user", content: [
              { type: "image_url", image_url: { url: imageBase64 } },
              { type: "text", text: "Describe this image in full detail. Transcribe all visible text exactly. Describe all objects, people, colors, layout, numbers, charts, diagrams, and any other observable information." },
            ]}],
          }),
          signal: visionController.signal,
        });
        clearTimeout(visionTimeout);
        if (visionRes.ok) {
          const vd = (await visionRes.json()) as any;
          imageContext = vd.choices?.[0]?.message?.content ?? "";
        }
      } catch (visionErr: any) {
        if (visionErr?.name !== "AbortError") req.log.warn({ err: visionErr }, "Vision model failed");
      }
    }

    // Ownership check
    const [conv] = await db.select({ id: conversationsTable.id }).from(conversationsTable)
      .where(and(eq(conversationsTable.id, convId), eq(conversationsTable.clientId, clientId)));
    if (!conv) { res.status(404).json({ error: "Not found" }); return; }

    await db.insert(messagesTable).values({
      conversationId: convId, role: "user",
      content: messageContent, attachedImage: imageBase64 ?? null,
    });

    // ── Context trimming: last 30 turns, max 60k chars ─────────────────────
    const allHistory = await db.select({ role: messagesTable.role, content: messagesTable.content })
      .from(messagesTable).where(eq(messagesTable.conversationId, convId))
      .orderBy(asc(messagesTable.createdAt));

    let history = allHistory.slice(-30);
    while (history.length > 2) {
      const totalChars = history.reduce((sum, m) => sum + m.content.length, 0);
      if (totalChars <= 60_000) break;
      history = history.slice(2);
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      res.write(`data: ${JSON.stringify({ type: "error", message: "OPENROUTER_API_KEY not set" })}\n\n`);
      res.end(); return;
    }

    const openRouterMessages = history.map((m, idx) => {
      if (idx === history.length - 1 && m.role === "user" && imageBase64) {
        const imageNote = imageContext
          ? `[Image analysis:]\n${imageContext}`
          : `[Image received but vision analysis failed. Ask user to describe what they need help with.]`;
        return { role: "user" as const, content: `${imageNote}\n\n[User message:]\n${m.content}` };
      }
      return { role: m.role as "user" | "assistant", content: m.content };
    });

    const systemContent = userPrompt?.trim()
      ? `${LANGUAGE_ENFORCEMENT}\n\n${DEFAULT_SYSTEM_PROMPT}\n\nUSER CUSTOM INSTRUCTIONS:\n${userPrompt.trim()}`
      : `${LANGUAGE_ENFORCEMENT}\n\n${DEFAULT_SYSTEM_PROMPT}`;

    type AnyMessage = {
      role: "system" | "user" | "assistant" | "tool";
      content: string;
      tool_call_id?: string;
      tool_calls?: any[];
    };

    const baseMessages: AnyMessage[] = [
      { role: "system", content: systemContent },
      { role: "assistant", content: PERSONA_PREFILL },
      { role: "user", content: ENGLISH_LOCK_USER },
      { role: "assistant", content: ENGLISH_LOCK_ASSISTANT },
      ...openRouterMessages,
    ];

    let toolMessages: AnyMessage[] = [...baseMessages];
    let fullResponse = "";
    let fullThinking = "";
    const MAX_TOOL_ROUNDS = 5;

    // ── Tool-calling loop ──────────────────────────────────────────────────
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      let toolCheckData: any;
      try {
        const toolCheckRes = await fetchWithRetry("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: buildOrHeaders(apiKey),
          body: JSON.stringify({
            model: effectiveModel, max_tokens: 512, temperature: 0.7,
            stream: false, tools: WEB_TOOLS, tool_choice: "auto",
            messages: toolMessages,
          }),
        });
        if (!toolCheckRes.ok) break;
        toolCheckData = await toolCheckRes.json();
      } catch { break; }

      const choice = toolCheckData?.choices?.[0];
      if (!choice) break;
      if (choice.finish_reason !== "tool_calls" || !choice.message?.tool_calls?.length) break;

      toolMessages.push({
        role: "assistant", content: choice.message.content || "",
        tool_calls: choice.message.tool_calls,
      });

      for (const tc of choice.message.tool_calls) {
        const toolName: string = tc.function?.name || "";
        const argsJson: string = tc.function?.arguments || "{}";
        emitToolStatus(res, toolName, argsJson);
        const toolResult = await executeToolCall(toolName, argsJson);
        if (toolName === "web_search") {
          const sources = parseSearchSources(toolResult);
          if (sources.length > 0) res.write(`data: ${JSON.stringify({ type: "sources", sources })}\n\n`);
        }
        toolMessages.push({ role: "tool", tool_call_id: tc.id, content: toolResult });
      }
    }

    // ── Streaming final response ───────────────────────────────────────────
    const finalMessages = toolMessages.length > baseMessages.length ? toolMessages : baseMessages;

    let streamResponse: Response;
    try {
      streamResponse = await fetchWithRetry("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: buildOrHeaders(apiKey),
        body: JSON.stringify({
          model: effectiveModel,
          max_tokens: effectiveModel === "deepseek/deepseek-r1" ? 4096 : 8192,
          temperature: 1.0, stream: true, messages: finalMessages,
        }),
      });
    } catch {
      res.write(`data: ${JSON.stringify({ type: "error", message: "Connection to AI failed. Please try again." })}\n\n`);
      res.end(); return;
    }

    if (!streamResponse.ok || !streamResponse.body) {
      req.log.error({ status: streamResponse.status }, "OpenRouter stream error");
      res.write(`data: ${JSON.stringify({ type: "error", message: `AI service error (${streamResponse.status}). Please try again.` })}\n\n`);
      res.end(); return;
    }

    let inThink = false;
    let pendingTag = "";

    function longestTagOverlap(str: string, tag: string): number {
      for (let len = Math.min(str.length, tag.length - 1); len > 0; len--)
        if (tag.startsWith(str.slice(str.length - len))) return len;
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
            if (safe) { res.write(`data: ${JSON.stringify({ type: "token", content: safe })}\n\n`); fullResponse += safe; }
            pendingTag = text.slice(text.length - overlap); break;
          }
          const safe = text.slice(0, idx);
          if (safe) { res.write(`data: ${JSON.stringify({ type: "token", content: safe })}\n\n`); fullResponse += safe; }
          inThink = true; text = text.slice(idx + 7);
        } else {
          const idx = text.indexOf("</think>");
          if (idx === -1) {
            const overlap = longestTagOverlap(text, "</think>");
            const safe = text.slice(0, text.length - overlap);
            if (safe) { res.write(`data: ${JSON.stringify({ type: "thinking", content: safe })}\n\n`); fullThinking += safe; }
            pendingTag = text.slice(text.length - overlap); break;
          }
          const safe = text.slice(0, idx);
          if (safe) { res.write(`data: ${JSON.stringify({ type: "thinking", content: safe })}\n\n`); fullThinking += safe; }
          inThink = false; text = text.slice(idx + 8);
        }
      }
    }

    const reader = streamResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

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
                res.write(`data: ${JSON.stringify({ type: "thinking", content: delta.reasoning_content })}\n\n`);
              }
              if (delta.content) routeContent(delta.content);
            } catch { /* skip malformed chunks */ }
          }
        }
      }
    } catch (streamErr: any) {
      req.log.warn({ err: streamErr }, "Stream interrupted");
      res.write(`data: ${JSON.stringify({ type: "error", message: "Stream interrupted. Partial response saved." })}\n\n`);
    }

    // Flush pending tag buffer
    if (pendingTag) {
      if (inThink) { res.write(`data: ${JSON.stringify({ type: "thinking", content: pendingTag })}\n\n`); fullThinking += pendingTag; }
      else { res.write(`data: ${JSON.stringify({ type: "token", content: pendingTag })}\n\n`); fullResponse += pendingTag; }
    }

    if (fullResponse) {
      await db.insert(messagesTable).values({ conversationId: convId, role: "assistant", content: fullResponse });
    }

    req.log.info({ convId, model: effectiveModel, elapsed: Date.now() - reqStart, clientId: clientId.slice(0, 8) }, "Chat completed");
    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    res.end();

  } catch (err: any) {
    req.log.error({ err }, "Unhandled chat error");
    try {
      res.write(`data: ${JSON.stringify({ type: "error", message: err.message || "Internal server error" })}\n\n`);
      res.end();
    } catch { /* response already ended */ }
  } finally {
    inFlightRequests.delete(reqKey); // always remove, even on error
  }
});

export default router;
