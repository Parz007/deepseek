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
        modalities: ["image"],
        messages: [
          { role: "user", content: prompt.trim() },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[image] OpenRouter request failed", response.status, errText);
      res.status(502).json({ error: `Image generation failed: HTTP ${response.status}` });
      return;
    }

    let data: any;
    try {
      data = await response.json();
    } catch (parseErr) {
      console.error("[image] Failed to parse OpenRouter response as JSON", parseErr);
      res.status(502).json({ error: "Invalid response from generation API" });
      return;
    }

    console.log("[image] OpenRouter raw response:", JSON.stringify(data, null, 2));

    const choice = data?.choices?.[0];
    const message = choice?.message;
    const images: Array<{ type: string; image_url?: { url: string }; url?: string }> | undefined = message?.images;
    const imageUrl: string = images?.[0]?.image_url?.url ?? images?.[0]?.url ?? "";

    if (!imageUrl) {
      console.error("[image] No image URL found. Diagnostics:", JSON.stringify({
        finishReason: choice?.finish_reason,
        messageKeys: message ? Object.keys(message) : null,
        imagesValue: images,
        content: message?.content,
      }, null, 2));
      res.status(502).json({ error: "No image returned from generation API" });
      return;
    }

    res.json({ imageUrl });
  } catch (err: any) {
    console.error("[image] Image generation error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
