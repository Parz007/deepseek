import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, conversations, messages } from "@workspace/db";
import {
  CreateOpenrouterConversationBody,
  GetOpenrouterConversationParams,
  DeleteOpenrouterConversationParams,
  ListOpenrouterMessagesParams,
  SendOpenrouterMessageParams,
  SendOpenrouterMessageBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

// ── Model constants ───────────────────────────────────────────────────────────
export const FREE_MODEL = "deepseek/deepseek-v4-flash";
export const PREMIUM_MODEL = "qwen/qwen-2.5-7b-instruct";
export const VISION_MODEL = "x-ai/grok-4.20"; // reads uploaded images
const ALLOWED_MODELS = [FREE_MODEL, PREMIUM_MODEL];

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

/** Resolve API key at call time so hot-reloads and secret rotation work */
function getApiKey(): string {
  const key =
    process.env.OPENAI_API_KEY ??
    process.env.OPENROUTER_API_KEY ??
    process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY;
  if (!key) throw new Error("No API key found. Set OPENROUTER_API_KEY or OPENAI_API_KEY.");
  return key;
}

type ChatRole = "system" | "user" | "assistant";
type TextContent = { type: "text"; text: string };
type ImageContent = { type: "image_url"; image_url: { url: string } };
type ChatMessage = {
  role: ChatRole;
  content: string | (TextContent | ImageContent)[];
};

/** Non-streaming OpenRouter call (for vision pass) */
async function callOpenRouter(
  model: string,
  msgs: ChatMessage[],
): Promise<string> {
  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://replit.com",
      "X-Title": "AI Chat",
    },
    body: JSON.stringify({ model, max_tokens: 8192, messages: msgs }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${err}`);
  }
  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  return data.choices[0]?.message?.content ?? "";
}

/** Streaming OpenRouter call — yields raw SSE lines */
async function* streamOpenRouter(
  model: string,
  msgs: ChatMessage[],
): AsyncGenerator<string> {
  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://replit.com",
      "X-Title": "AI Chat",
    },
    body: JSON.stringify({ model, max_tokens: 8192, messages: msgs, stream: true }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${err}`);
  }
  if (!res.body) throw new Error("No response body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("data: ")) yield line.slice(6).trim();
    }
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.get("/openrouter/conversations", async (_req, res): Promise<void> => {
  const convs = await db
    .select()
    .from(conversations)
    .orderBy(conversations.createdAt);
  res.json(convs);
});

router.post("/openrouter/conversations", async (req, res): Promise<void> => {
  const parsed = CreateOpenrouterConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const model = ALLOWED_MODELS.includes(parsed.data.model ?? "")
    ? (parsed.data.model ?? FREE_MODEL)
    : FREE_MODEL;
  const [conv] = await db
    .insert(conversations)
    .values({ title: parsed.data.title, model })
    .returning();
  res.status(201).json(conv);
});

router.get("/openrouter/conversations/:id", async (req, res): Promise<void> => {
  const params = GetOpenrouterConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, params.data.id));
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conv.id))
    .orderBy(messages.createdAt);
  res.json({ ...conv, messages: msgs });
});

router.delete(
  "/openrouter/conversations/:id",
  async (req, res): Promise<void> => {
    const params = DeleteOpenrouterConversationParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [deleted] = await db
      .delete(conversations)
      .where(eq(conversations.id, params.data.id))
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    res.sendStatus(204);
  },
);

router.get(
  "/openrouter/conversations/:id/messages",
  async (req, res): Promise<void> => {
    const params = ListOpenrouterMessagesParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, params.data.id));
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    const msgs = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conv.id))
      .orderBy(messages.createdAt);
    res.json(msgs);
  },
);

// POST /openrouter/conversations/:id/messages  — SSE stream
//
// Image pipeline (cost-optimised):
//   1. x-ai/grok-4.20 reads the image → text description (non-streaming)
//   2. deepseek/deepseek-v4-flash reads description + user text → streamed reply
//
// Text-only pipeline:
//   Uses the conversation's model (deepseek = free, qwen = premium)
router.post(
  "/openrouter/conversations/:id/messages",
  async (req, res): Promise<void> => {
    const params = SendOpenrouterMessageParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = SendOpenrouterMessageBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, params.data.id));
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    const { content, imageData, imageMimeType } = body.data;

    // Persist user message
    await db.insert(messages).values({
      conversationId: conv.id,
      role: "user",
      content,
      imageData: imageData ?? null,
      imageMimeType: imageMimeType ?? null,
    });

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let fullResponse = "";
    let visionDescription: string | null = null;
    const textModel = imageData ? FREE_MODEL : (conv.model || FREE_MODEL);

    try {
      // ── Step 1: vision pass (only when image present) ────────────────
      if (imageData) {
        req.log.info({ model: VISION_MODEL }, "Running vision pass");
        visionDescription = await callOpenRouter(VISION_MODEL, [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: imageData } },
              {
                type: "text",
                text: "Describe this image thoroughly: visual elements, any text, colours, layout, and notable context.",
              },
            ],
          },
        ]);
        req.log.info("Vision pass complete");
      }

      // ── Step 2: build chat history for text model ────────────────────
      const history = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conv.id))
        .orderBy(messages.createdAt);

      const chatMessages: ChatMessage[] = [];

      for (const msg of history.slice(0, -1)) {
        if (msg.role !== "user" && msg.role !== "assistant") continue;
        chatMessages.push({
          role: msg.role as "user" | "assistant",
          content: msg.visionDescription
            ? `[Image context: ${msg.visionDescription}]\n\n${msg.content}`
            : msg.content,
        });
      }

      chatMessages.push({
        role: "user",
        content: visionDescription
          ? `[Image uploaded. Vision analysis: ${visionDescription}]\n\nUser question: ${content}`
          : content,
      });

      // ── Step 3: stream text response ─────────────────────────────────
      req.log.info({ model: textModel }, "Streaming text response");

      for await (const line of streamOpenRouter(textModel, chatMessages)) {
        if (line === "[DONE]") break;
        if (!line || line === "") continue;
        try {
          const chunk = JSON.parse(line) as {
            choices?: { delta?: { content?: string } }[];
          };
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) {
            fullResponse += delta;
            res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
          }
        } catch {
          // skip malformed SSE lines
        }
      }

      // ── Persist assistant message ────────────────────────────────────
      await db.insert(messages).values({
        conversationId: conv.id,
        role: "assistant",
        content: fullResponse,
        visionDescription,
        model: textModel,
      });

      // Back-fill vision description on the user message
      if (visionDescription) {
        const userMsg = history[history.length - 1];
        if (userMsg) {
          await db
            .update(messages)
            .set({ visionDescription })
            .where(eq(messages.id, userMsg.id));
        }
      }

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (err) {
      req.log.error({ err }, "OpenRouter call failed");
      if (!res.headersSent) {
        res.status(500).json({ error: "AI request failed" });
      } else {
        res.write(`data: ${JSON.stringify({ error: "AI request failed" })}\n\n`);
        res.end();
      }
    }
  },
);

export default router;
