import { Router } from "express";
import { db } from "@workspace/db";
import { subscriptionsTable, conversationsTable, messagesTable } from "@workspace/db";
import { eq, and, count, sql } from "drizzle-orm";

const router = Router();

const FREE_LIMIT = 20;

const WALLET_ERC20 = "0xb1584a0e0ea8b01e57d6caa238ac76512ef87fd7";
const WALLET_TRC20 = "TFRDatJUdNQLYiF7BqQKQi8YFKQ1FBuAGn";
const WALLET_BEP20 = "0xb1584a0e0ea8b01e57d6caa238ac76512ef87fd7";

const PLAN_PRICES: Record<string, number> = { monthly: 29, lifetime: 199 };

async function getMessageCount(clientId: string): Promise<number> {
  const result = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(messagesTable)
    .innerJoin(conversationsTable, eq(messagesTable.conversationId, conversationsTable.id))
    .where(and(eq(conversationsTable.clientId, clientId), eq(messagesTable.role, "user")));
  return result[0]?.count ?? 0;
}

async function getOrCreateSubscription(clientId: string) {
  const [existing] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.clientId, clientId));
  if (existing) return existing;
  const [created] = await db.insert(subscriptionsTable).values({ clientId, status: "free" }).returning();
  return created;
}

async function sendTelegramMessage(text: string, replyMarkup?: object) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return null;

  const body: Record<string, unknown> = { chat_id: chatId, text, parse_mode: "HTML" };
  if (replyMarkup) body.reply_markup = replyMarkup;

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.ok ? res.json() : null;
}

// GET /api/subscription/status  (requires X-Client-ID header)
router.get("/subscription/status", async (req, res) => {
  const clientId = req.headers["x-client-id"] as string;
  if (!clientId) { res.status(400).json({ error: "X-Client-ID header required" }); return; }

  try {
    const sub = await getOrCreateSubscription(clientId);
    const messageCount = await getMessageCount(clientId);

    const isActive = sub.status === "active" && (
      sub.plan === "lifetime" || !sub.expiresAt || new Date(sub.expiresAt) > new Date()
    );

    res.json({
      status: sub.status,
      plan: sub.plan,
      messageCount,
      limit: FREE_LIMIT,
      isActive,
      expiresAt: sub.expiresAt,
    });
  } catch (err: any) {
    req.log.error({ err }, "Failed to get subscription status");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/subscription/claim  — submit payment claim
router.post("/subscription/claim", async (req, res) => {
  const clientId = req.headers["x-client-id"] as string;
  if (!clientId) { res.status(400).json({ error: "X-Client-ID header required" }); return; }

  const { plan, txHash, network } = req.body;
  if (!plan || !txHash || !network) {
    res.status(400).json({ error: "plan, txHash, and network are required" });
    return;
  }
  if (!["monthly", "lifetime"].includes(plan)) {
    res.status(400).json({ error: "plan must be monthly or lifetime" });
    return;
  }

  const walletMap: Record<string, string> = {
    erc20: WALLET_ERC20,
    trc20: WALLET_TRC20,
    bep20: WALLET_BEP20,
  };
  if (!walletMap[network]) { res.status(400).json({ error: "Invalid network" }); return; }

  try {
    const [sub] = await db
      .insert(subscriptionsTable)
      .values({ clientId, status: "pending", plan, txHash, network })
      .onConflictDoUpdate({
        target: subscriptionsTable.clientId,
        set: { status: "pending", plan, txHash, network, updatedAt: sql`now()` },
      })
      .returning();

    const price = PLAN_PRICES[plan];
    const networkLabel = { erc20: "USDT ERC20", trc20: "USDT TRC20", bep20: "USDT BEP20" }[network];
    const wallet = walletMap[network];

    const tgText = [
      `🔔 <b>New Premium Payment Claim</b>`,
      ``,
      `👤 <b>Client ID:</b> <code>${clientId.slice(0, 12)}…</code>`,
      `📦 <b>Plan:</b> ${plan === "monthly" ? "Monthly" : "Lifetime"} ($${price})`,
      `🌐 <b>Network:</b> ${networkLabel}`,
      `💳 <b>Wallet:</b> <code>${wallet}</code>`,
      `🔗 <b>TX Hash:</b> <code>${txHash}</code>`,
      `⏰ <b>Time:</b> ${new Date().toUTCString()}`,
    ].join("\n");

    const keyboard = {
      inline_keyboard: [[
        { text: `✅ Approve (${plan})`, callback_data: `approve:${plan}:${clientId}` },
        { text: "❌ Reject", callback_data: `reject:${clientId}` },
      ]],
    };

    await sendTelegramMessage(tgText, keyboard);

    res.json({ success: true, status: "pending" });
  } catch (err: any) {
    req.log.error({ err }, "Failed to submit claim");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/telegram/webhook  — Telegram bot callback handler
router.post("/telegram/webhook", async (req, res) => {
  res.json({ ok: true });

  const update = req.body;
  const callback = update?.callback_query;
  if (!callback) return;

  const data: string = callback.data ?? "";
  const messageId = callback.message?.message_id;
  const chatId = callback.message?.chat?.id;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  const answerCallback = async (text: string) => {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callback.id, text }),
    });
  };

  const editMessage = async (text: string) => {
    if (!chatId || !messageId) return;
    await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, parse_mode: "HTML" }),
    });
  };

  try {
    if (data.startsWith("approve:")) {
      const parts = data.split(":");
      const plan = parts[1];
      const clientId = parts.slice(2).join(":");

      const expiresAt = plan === "monthly"
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        : null;

      await db.update(subscriptionsTable)
        .set({ status: "active", plan, expiresAt: expiresAt ? expiresAt : sql`null`, updatedAt: sql`now()` })
        .where(eq(subscriptionsTable.clientId, clientId));

      await answerCallback("✅ Approved!");
      await editMessage(`✅ <b>APPROVED</b>\n\nClient: <code>${clientId.slice(0, 12)}…</code>\nPlan: ${plan}\n${expiresAt ? `Expires: ${expiresAt.toUTCString()}` : "Lifetime access"}`);
    } else if (data.startsWith("reject:")) {
      const clientId = data.slice(7);

      await db.update(subscriptionsTable)
        .set({ status: "rejected", updatedAt: sql`now()` })
        .where(eq(subscriptionsTable.clientId, clientId));

      await answerCallback("❌ Rejected.");
      await editMessage(`❌ <b>REJECTED</b>\n\nClient: <code>${clientId.slice(0, 12)}…</code>`);
    }
  } catch (err) {
    console.error("Telegram webhook error:", err);
  }
});

// GET /api/telegram/setup  — register webhook (call once after deploy)
router.get("/telegram/setup", async (req, res) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const appUrl = process.env.APP_URL;
  if (!token || !appUrl) {
    res.status(400).json({ error: "TELEGRAM_BOT_TOKEN and APP_URL must be set" });
    return;
  }

  const webhookUrl = `${appUrl}/api/telegram/webhook`;
  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: webhookUrl }),
  });
  const data = await response.json() as { ok: boolean; description?: string };
  res.json(data.ok
    ? { success: true, webhook: webhookUrl }
    : { success: false, error: data.description });
});

export { FREE_LIMIT, getMessageCount, getOrCreateSubscription };
export default router;
