import { Router } from "express";
import { db } from "@workspace/db";
import { conversationsTable, messagesTable } from "@workspace/db";
import { eq, asc, and } from "drizzle-orm";

const router = Router();

// ── POST /api/conversations/:id/share ────────────────────────────────────────
// Creates (or returns existing) share token for a conversation the caller owns.
// Returns { token, shareUrl } where shareUrl is the full public link.

router.post("/api/conversations/:id/share", async (req, res) => {
  const clientId = (req.headers["x-client-id"] as string | undefined)?.trim();
  if (!clientId) {
    res.status(401).json({ error: "X-Client-ID header required" });
    return;
  }

  const convId = parseInt(req.params.id, 10);
  if (Number.isNaN(convId)) {
    res.status(400).json({ error: "Invalid conversation id" });
    return;
  }

  // Verify ownership
  const [conv] = await db
    .select()
    .from(conversationsTable)
    .where(and(eq(conversationsTable.id, convId), eq(conversationsTable.clientId, clientId)))
    .limit(1);

  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  // Reuse existing token or generate a new one
  const token = conv.shareToken ?? crypto.randomUUID();

  if (!conv.shareToken) {
    await db
      .update(conversationsTable)
      .set({ shareToken: token })
      .where(eq(conversationsTable.id, convId));
  }

  // Build the public URL from the request origin or APP_URL env
  const origin = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
  const shareUrl = `${origin}/share/${token}`;

  res.json({ token, shareUrl });
});

// ── GET /api/share/:token ─────────────────────────────────────────────────────
// Public read-only endpoint — no authentication required.
// Returns the conversation title + all messages.

router.get("/api/share/:token", async (req, res) => {
  const { token } = req.params;
  if (!token || token.length < 8) {
    res.status(400).json({ error: "Invalid token" });
    return;
  }

  const [conv] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.shareToken, token))
    .limit(1);

  if (!conv) {
    res.status(404).json({ error: "Shared conversation not found" });
    return;
  }

  const messages = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, conv.id))
    .orderBy(asc(messagesTable.createdAt));

  res.json({
    id: conv.id,
    title: conv.title,
    createdAt: conv.createdAt,
    messages: messages.map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      attachedImage: m.attachedImage,
      generatedImageUrl: m.generatedImageUrl,
      createdAt: m.createdAt,
    })),
  });
});

export default router;
