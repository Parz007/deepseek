import { Router } from "express";
import { db } from "@workspace/db";
import { subscriptionsTable, conversationsTable, messagesTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";

const router = Router();

// FIX: Read admin secret from X-Admin-Key header, NOT ?key= URL query param.
// Usage: add header  X-Admin-Key: <your ADMIN_SECRET value>
function checkAdminAuth(req: import("express").Request): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;
  return req.headers["x-admin-key"] === secret;
}

// GET /api/admin  — dashboard overview
router.get("/admin", async (req, res) => {
  if (!checkAdminAuth(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const subs = await db.select().from(subscriptionsTable).orderBy(desc(subscriptionsTable.createdAt));
    const [msgStats] = await db.select({ count: sql<number>`cast(count(*) as int)` }).from(messagesTable);
    const [convStats] = await db.select({ count: sql<number>`cast(count(*) as int)` }).from(conversationsTable);

    res.json({
      summary: {
        totalSubscriptions: subs.length,
        active: subs.filter(s => s.status === "active").length,
        pending: subs.filter(s => s.status === "pending").length,
        free: subs.filter(s => s.status === "free").length,
        rejected: subs.filter(s => s.status === "rejected").length,
        totalMessages: msgStats?.count ?? 0,
        totalConversations: convStats?.count ?? 0,
      },
      subscriptions: subs.map(s => ({
        clientId: s.clientId.slice(0, 8) + "…",
        status: s.status,
        plan: s.plan,
        network: s.network,
        txHash: s.txHash ? s.txHash.slice(0, 16) + "…" : null,
        expiresAt: s.expiresAt,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
    });
  } catch (err: any) {
    req.log.error({ err }, "Admin dashboard error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/approve  — manually approve a subscription
router.post("/admin/approve", async (req, res) => {
  if (!checkAdminAuth(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { clientId, plan } = req.body as { clientId: string; plan: string };
  if (!clientId || !plan) {
    res.status(400).json({ error: "clientId and plan required" });
    return;
  }
  try {
    const expiresAt = plan === "monthly" ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null;
    await db
      .update(subscriptionsTable)
      .set({ status: "active", plan, expiresAt: expiresAt ?? sql`null`, updatedAt: sql`now()` })
      .where(eq(subscriptionsTable.clientId, clientId));
    res.json({ success: true });
  } catch (err: any) {
    req.log.error({ err }, "Admin approve error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/reject  — manually reject a subscription
router.post("/admin/reject", async (req, res) => {
  if (!checkAdminAuth(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { clientId } = req.body as { clientId: string };
  if (!clientId) {
    res.status(400).json({ error: "clientId required" });
    return;
  }
  try {
    await db
      .update(subscriptionsTable)
      .set({ status: "rejected", updatedAt: sql`now()` })
      .where(eq(subscriptionsTable.clientId, clientId));
    res.json({ success: true });
  } catch (err: any) {
    req.log.error({ err }, "Admin reject error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
