import { Router } from "express";
import { db } from "@workspace/db";
import { subscriptionsTable, conversationsTable, messagesTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

const router = Router();

export const FREE_LIMIT = 20;

const WALLET_ERC20 = "0xb1584a0e0ea8b01e57d6caa238ac76512ef87fd7";
const WALLET_TRC20 = "TFRDatJUdNQLYiF7BqQKQi8YFKQ1FBuAGn";
const WALLET_BEP20 = "0xb1584a0e0ea8b01e57d6caa238ac76512ef87fd7";

const PLAN_PRICES: Record<string, number> = { monthly: 29, lifetime: 199 };

export async function getMessageCount(clientId: string): Promise<number> {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const result = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(messagesTable)
    .where(
      and(
        eq(messagesTable.role, "user"),
        sql`${messagesTable.createdAt} >= ${todayStart}`,
        sql`${messagesTable.conversationId} IN (SELECT id FROM conversations WHERE client_id = ${clientId})`,
      ),
    );
  return result[0]?.count ?? 0;
}

export async function getOrCreateSubscription(clientId: string) {
  const [existing] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.clientId, clientId));
  if (existing) return existing;
  const [created] = await db.insert(subscriptionsTable).values({ clientId, status: "free" }).returning();
  return created;
}

export async function sendTelegramNotification(text: string, replyMarkup?: object) {
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

// GET /api/subscription/status
router.get("/subscription/status", async (req, res) => {
  const clientId = req.headers["x-client-id"] as string;
  if (!clientId) { res.status(400).json({ error: "X-Client-ID header required" }); return; }
  try {
    const sub = await getOrCreateSubscription(clientId);
    const messageCount = await getMessageCount(clientId);
    const isActive =
      sub.status === "active" &&
      (sub.plan === "lifetime" || !sub.expiresAt || new Date(sub.expiresAt) > new Date());
    res.json({ status: sub.status, plan: sub.plan, messageCount, limit: FREE_LIMIT, isActive, expiresAt: sub.expiresAt });
  } catch (err: any) {
    req.log.error({ err }, "Failed to get subscription status");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/subscription/claim
router.post("/subscription/claim", async (req, res) => {
  const clientId = req.headers["x-client-id"] as string;
  if (!clientId) { res.status(400).json({ error: "X-Client-ID header required" }); return; }

  const { plan, txHash, network } = req.body as { plan: string; txHash: string; network: string };
  if (!plan || !txHash || !network) {
    res.status(400).json({ error: "plan, txHash, and network are required" });
    return;
  }
  if (!["monthly", "lifetime"].includes(plan)) {
    res.status(400).json({ error: "plan must be monthly or lifetime" });
    return;
  }
  const walletMap: Record<string, string> = { erc20: WALLET_ERC20, trc20: WALLET_TRC20, bep20: WALLET_BEP20 };
  if (!walletMap[network]) { res.status(400).json({ error: "Invalid network" }); return; }

  try {
    await db
      .insert(subscriptionsTable)
      .values({ clientId, status: "pending", plan, txHash, network })
      .onConflictDoUpdate({
        target: subscriptionsTable.clientId,
        set: { status: "pending", plan, txHash, network, updatedAt: sql`now()` },
      });

    const networkLabel = ({ erc20: "USDT ERC20", trc20: "USDT TRC20", bep20: "USDT BEP20" } as Record<string, string>)[network];
    const tgText = [
      `🔔 <b>New Premium Payment Claim</b>`,
      ``,
      `👤 <b>Client ID:</b> <code>${clientId.slice(0, 12)}…</code>`,
      `📦 <b>Plan:</b> ${plan === "monthly" ? "Monthly" : "Lifetime"} ($${PLAN_PRICES[plan]})`,
      `🌐 <b>Network:</b> ${networkLabel}`,
      `💳 <b>Wallet:</b> <code>${walletMap[network]}</code>`,
      `🔗 <b>TX Hash:</b> <code>${txHash}</code>`,
      `⏰ <b>Time:</b> ${new Date().toUTCString()}`,
    ].join("\n");

    await sendTelegramNotification(tgText, {
      inline_keyboard: [[
        { text: `✅ Approve (${plan})`, callback_data: `approve:${plan}:${clientId}` },
        { text: "❌ Reject", callback_data: `reject:${clientId}` },
      ]],
    });

    res.json({ success: true, status: "pending" });
  } catch (err: any) {
    req.log.error({ err }, "Failed to submit claim");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
