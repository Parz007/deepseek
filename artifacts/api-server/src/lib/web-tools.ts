const FETCH_TIMEOUT_MS = 10_000;
const SEARCH_TIMEOUT_MS = 8_000;
const MAX_CONTENT_CHARS = 8_000;

export async function webSearch(query: string): Promise<string> {
  const braveKey = process.env.BRAVE_SEARCH_API_KEY;

  if (braveKey) {
    try {
      const res = await fetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=6&text_decorations=false&result_filter=web`,
        {
          headers: {
            Accept: "application/json",
            "Accept-Encoding": "gzip",
            "X-Subscription-Token": braveKey,
          },
          signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
        },
      );
      if (res.ok) {
        const data = (await res.json()) as any;
        const results: any[] = data.web?.results ?? [];
        if (results.length > 0) {
          return results
            .slice(0, 6)
            .map(
              (r: any, i: number) =>
                `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.description ?? ""}`,
            )
            .join("\n\n");
        }
      }
    } catch {
    }
  }

  try {
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(ddgUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; research-agent/1.0)" },
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
    if (res.ok) {
      const data = (await res.json()) as any;
      const parts: string[] = [];
      if (data.Answer) parts.push(`Direct answer: ${data.Answer}`);
      if (data.AbstractText) parts.push(`Summary: ${data.AbstractText}\nSource: ${data.AbstractURL ?? ""}`);
      const topics: string[] = (data.RelatedTopics ?? [])
        .filter((t: any) => t.Text)
        .slice(0, 6)
        .map((t: any) => `• ${t.Text}${t.FirstURL ? `\n  ${t.FirstURL}` : ""}`);
      if (topics.length) parts.push(`Related:\n${topics.join("\n")}`);
      if (parts.length) return parts.join("\n\n");
    }
  } catch {
  }

  return `No results found for query: "${query}". The search services may be temporarily unavailable.`;
}

export async function fetchUrl(url: string): Promise<string> {
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return `Error: URL must start with http:// or https://`;
  }
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/json,text/plain",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!res.ok) return `HTTP ${res.status} ${res.statusText}: Failed to fetch ${url}`;

    const contentType = res.headers.get("content-type") ?? "";
    const raw = await res.text();

    if (contentType.includes("application/json")) {
      return raw.slice(0, MAX_CONTENT_CHARS);
    }

    if (contentType.includes("html")) {
      const text = raw
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
        .replace(/<svg[\s\S]*?<\/svg>/gi, "")
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'")
        .replace(/\s{3,}/g, "\n\n")
        .trim();
      return text.slice(0, MAX_CONTENT_CHARS);
    }

    return raw.slice(0, MAX_CONTENT_CHARS);
  } catch (e: any) {
    if (e?.name === "TimeoutError") return `Timeout: ${url} did not respond within ${FETCH_TIMEOUT_MS / 1000}s`;
    return `Error fetching ${url}: ${e?.message ?? String(e)}`;
  }
}

export const WEB_TOOLS = [
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the web for current, real-time information. Use this for news, current events, stock prices, weather, sports scores, recently released products, or anything that may have changed recently. Always use this when the user asks about something that could be time-sensitive.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "The search query. Be specific and include relevant keywords. For current info, add the year or 'today' if helpful.",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_url",
      description:
        "Fetch and read the full text content of any URL. Use this to read articles, news pages, documentation, Wikipedia pages, APIs returning JSON, or any other online resource. Returns cleaned text content.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The full URL to fetch. Must start with http:// or https://",
          },
        },
        required: ["url"],
        additionalProperties: false,
      },
    },
  },
] as const;
