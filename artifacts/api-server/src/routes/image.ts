import { Router } from "express";
import { FREE_LIMIT, getMessageCount, getOrCreateSubscription } from "./subscriptions";

const router = Router();

router.post("/generate-image", async (req, res) => {
  const { prompt } = req.body;
  const clientId = req.headers["x-client-id"] as string | undefined;

  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    res.status(400).json({ error: "prompt required" });
    return;
  }

  try {
    // Subscription / limit check (same as chat messages)
    if (clientId) {
      const sub = await getOrCreateSubscription(clientId);
      const isActive =
        sub.status === "active" &&
        (sub.plan === "lifetime" || !sub.expiresAt || new Date(sub.expiresAt) > new Date());
      if (!isActive) {
        const msgCount = await getMessageCount(clientId);
        if (msgCount >= FREE_LIMIT) {
          res.status(402).json({ error: "free_limit_reached", messageCount: msgCount, limit: FREE_LIMIT });
          return;
        }
      }
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "OPENROUTER_API_KEY not configured" });
      return;
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": process.env.APP_URL || "https://deepseek-uncensored-api-server.vercel.app",
        "X-Title": "DeepSeek Chat",
      },
      body: JSON.stringify({
        model: "black-forest-labs/flux.2-klein-4b",
        messages: [{ role: "user", content: prompt.trim() }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      req.log.error({ status: response.status, errText }, "OpenRouter image generation failed");
      res.status(502).json({ error: `Image generation failed: HTTP ${response.status}` });
      return;
    }

    const data = await response.json() as any;

    // OpenRouter image models return image URL or base64 in content
    const rawContent = data.choices?.[0]?.message?.content;
    let imageUrl = "";

    if (typeof rawContent === "string") {
      imageUrl = rawContent.trim();
    } else if (Array.isArray(rawContent)) {
      const imgPart = rawContent.find((p: any) => p.type === "image_url");
      imageUrl = imgPart?.image_url?.url ?? "";
      if (!imageUrl) {
        const textPart = rawContent.find((p: any) => p.type === "text");
        imageUrl = textPart?.text?.trim() ?? "";
      }
    }

    if (!imageUrl) {
      req.log.error({ data }, "No image URL in OpenRouter response");
      res.status(502).json({ error: "No image returned from generation API" });
      return;
    }

    res.json({ imageUrl });
  } catch (err: any) {
    req.log.error({ err }, "Image generation error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
