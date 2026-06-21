import { Router, type Request, type Response, type NextFunction } from "express";
import { FREE_LIMIT, getMessageCount, getOrCreateSubscription } from "./subscriptions";

const router = Router();

// ── requireClientId middleware ────────────────────────────────────────────────
// Rejects requests with no x-client-id header so anonymous callers cannot
// hit the image generation endpoint (which costs money per call).
function requireClientId(req: Request, res: Response, next: NextFunction): void {
  const clientId = req.headers["x-client-id"];
  if (!clientId || typeof clientId !== "string" || !clientId.trim()) {
    res.status(401).json({ error: "x-client-id header required" });
    return;
  }
  next();
}

router.post("/generate-image", requireClientId, async (req, res) => {
  const { prompt } = req.body;
  // clientId is guaranteed to be a non-empty string by requireClientId middleware
  const clientId = req.headers["x-client-id"] as string;

  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    res.status(400).json({ error: "prompt required" });
    return;
  }

  try {
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
        model: "black-forest-labs/flux-1-schnell",
        modalities: ["image"],
        messages: [
          { role: "user", content: prompt.trim() },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      req.log.error({ status: response.status, body: errText }, "[image] OpenRouter request failed");
      res.status(502).json({ error: `Image generation failed: HTTP ${response.status}` });
      return;
    }

    let data: any;
    try {
      data = await response.json();
    } catch (parseErr) {
      req.log.error({ err: parseErr }, "[image] Failed to parse OpenRouter response as JSON");
      res.status(502).json({ error: "Invalid response from generation API" });
      return;
    }

    req.log.debug({ data }, "[image] OpenRouter raw response");

    const choice = data?.choices?.[0];
    const message = choice?.message;
    const images: Array<{ type: string; image_url?: { url: string }; url?: string }> | undefined = message?.images;
    const imageUrl: string = images?.[0]?.image_url?.url ?? images?.[0]?.url ?? "";

    if (!imageUrl) {
      req.log.error({
        finishReason: choice?.finish_reason,
        messageKeys: message ? Object.keys(message) : null,
        imagesValue: images,
        content: message?.content,
      }, "[image] No image URL found in response");
      res.status(502).json({ error: "No image returned from generation API" });
      return;
    }

    res.json({ imageUrl });
  } catch (err: any) {
    req.log.error({ err }, "[image] Image generation error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
