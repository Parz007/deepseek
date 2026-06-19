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

    const apiKey = process.env.TOGETHER_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "TOGETHER_API_KEY not configured" });
      return;
    }

    const response = await fetch("https://api.together.xyz/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "black-forest-labs/FLUX.1-schnell-Free",
        prompt: prompt.trim(),
        n: 1,
        width: 1024,
        height: 1024,
        steps: 4,
        response_format: "url",
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Together AI image generation failed", response.status, errText);
      res.status(502).json({ error: `Image generation failed: HTTP ${response.status}` });
      return;
    }

    const data = await response.json() as any;

    const item = data?.data?.[0];
    const imageUrl: string = item?.url ?? (item?.b64_json ? `data:image/png;base64,${item.b64_json}` : "");

    if (!imageUrl) {
      console.error("No image URL in Together AI response", data);
      res.status(502).json({ error: "No image returned from generation API" });
      return;
    }

    res.json({ imageUrl });
  } catch (err: any) {
    console.error("Image generation error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
