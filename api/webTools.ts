 // ============================================================

  const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const FETCH_TIMEOUT_MS = 12000;

function stripHtml(html: string): string {
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<[^>]+>/g, " ");
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
  return text.replace(/\s+/g, " ").trim();
}

async function tavilySearch(query: string, apiKey: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "basic",
        include_answer: true,
        include_raw_content: false,
        max_results: 6,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
    const data: any = await res.json();
    const parts: string[] = [];
    if (data.answer) {
      parts.push(`**Direct answer:** ${data.answer}`);
    }
    if (Array.isArray(data.results) && data.results.length > 0) {
      const snippets = (data.results as any[])
        .slice(0, 6)
        .map((r: any) => {
          const lines = [`**${r.title || "Result"}**`];
          if (r.url) lines.push(r.url);
          if (r.content) lines.push(r.content.slice(0, 400).trim());
          return lines.join("\n");
        })
        .filter(Boolean);
      if (snippets.length) {
        parts.push(`**Web results for "${query}":**\n\n${snippets.join("\n\n")}`);
      }
    }
    if (parts.length) return parts.join("\n\n");
    return `No results found for "${query}".`;
  } catch (err: any) {
    clearTimeout(timeout);
    throw err;
  }
}

async function ddgSearch(query: string): Promise<string> {
  try {
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1&t=deepseek-chat`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(ddgUrl, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.ok) {
      const data: any = await res.json();
      const parts: string[] = [];
      if (data.Answer) parts.push(`Direct Answer: ${data.Answer}`);
      if (data.AbstractText) parts.push(`Summary: ${data.AbstractText}`);
      if (data.AbstractURL) parts.push(`Source: ${data.AbstractURL}`);
      if (data.RelatedTopics?.length) {
        const topics = (data.RelatedTopics as any[])
          .filter((t) => t.Text)
          .slice(0, 6)
          .map((t) => `- ${t.Text}${t.FirstURL ? ` (${t.FirstURL})` : ""}`);
        if (topics.length) parts.push(`Related Results:\n${topics.join("\n")}`);
      }
      if (parts.length) return parts.join("\n\n");
    }
  } catch {
    /* fall through */
  }

  try {
    const htmlUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(htmlUrl, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.ok) {
      const html = await res.text();
      const titlePattern = /class="result__a"[^>]*>([\s\S]*?)<\/a>/g;
      const snippetPattern = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
      const urlPattern = /class="result__url"[^>]*>([\s\S]*?)<\/a>/g;
      const titles: string[] = [];
      const snippets: string[] = [];
      const urls: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = titlePattern.exec(html)) !== null && titles.length < 6)
        titles.push(stripHtml(m[1]).trim());
      while ((m = urlPattern.exec(html)) !== null && urls.length < 6)
        urls.push(stripHtml(m[1]).trim());
      while ((m = snippetPattern.exec(html)) !== null && snippets.length < 6)
        snippets.push(stripHtml(m[1]).trim());
      const results = titles
        .map((title, i) => {
          const parts = [`**${title}**`];
          if (urls[i]) parts.push(urls[i]);
          if (snippets[i]) parts.push(snippets[i]);
          return parts.join("\n");
        })
        .filter(Boolean);
      if (results.length)
        return `Search results for "${query}":\n\n${results.join("\n\n")}`;
    }
  } catch {
    /* fall through */
  }

  return `No results found for "${query}". Try rephrasing your search.`;
}

export async function webSearch(query: string): Promise<string> {
  const tavilyKey = process.env.TAVILY_API_KEY;
  if (tavilyKey) {
    try {
      return await tavilySearch(query, tavilyKey);
    } catch (err: any) {
      console.warn("[webSearch] Tavily failed, falling back to DDG:", err?.message);
    }
  }
  return ddgSearch(query);
}

export async function fetchUrl(url: string): Promise<string> {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol))
      return "Error: Only HTTP and HTTPS URLs are supported.";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (!res.ok) return `Error: HTTP ${res.status} ${res.statusText}`;
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const json = await res.json();
      return JSON.stringify(json, null, 2).slice(0, 8000);
    }
    const text = await res.text();
    const cleaned = contentType.includes("text/html") ? stripHtml(text) : text;
    return cleaned.slice(0, 8000);
  } catch (err: any) {
    if (err?.name === "AbortError")
      return "Error: Request timed out after 12 seconds.";
    return `Error fetching URL: ${err?.message || String(err)}`;
  }
}

export async function getWeather(location: string): Promise<string> {
  try {
    const encoded = encodeURIComponent(location);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(`https://wttr.in/${encoded}?format=j1`, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok)
      return `Could not fetch weather for "${location}": HTTP ${res.status}`;
    const data: any = await res.json();
    const current = data?.current_condition?.[0];
    const area = data?.nearest_area?.[0];
    if (!current) return `No weather data available for "${location}"`;
    const areaName = area?.areaName?.[0]?.value || location;
    const country = area?.country?.[0]?.value || "";
    const tempC = current.temp_C;
    const tempF = current.temp_F;
    const feelsC = current.FeelsLikeC;
    const feelsF = current.FeelsLikeF;
    const desc = current.weatherDesc?.[0]?.value || "";
    const humidity = current.humidity;
    const windKmph = current.windspeedKmph;
    const windDir = current.winddir16Point;
    const visibility = current.visibility;
    const uvIndex = current.uvIndex;
    const forecast = ((data?.weather || []) as any[])
      .slice(0, 3)
      .map((day) => {
        const date = day.date;
        const maxC = day.maxtempC;
        const minC = day.mintempC;
        const maxF = day.maxtempF;
        const minF = day.mintempF;
        const hourly: any[] = day.hourly || [];
        const dayDesc = hourly[4]?.weatherDesc?.[0]?.value || "";
        return `  ${date}: ${dayDesc}, High ${maxC}°C/${maxF}°F, Low ${minC}°C/${minF}°F`;
      })
      .join("\n");
    return [
      `Weather for ${areaName}${country ? `, ${country}` : ""}:`,
      `Condition: ${desc}`,
      `Temperature: ${tempC}°C / ${tempF}°F  (Feels like: ${feelsC}°C / ${feelsF}°F)`,
      `Humidity: ${humidity}%  |  Wind: ${windKmph} km/h ${windDir}  |  Visibility: ${visibility} km  |  UV Index: ${uvIndex}`,
      forecast ? `\n3-Day Forecast:\n${forecast}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  } catch (err: any) {
    return `Weather fetch failed: ${err?.message || String(err)}`;
  }
}

export async function getStockPrice(symbol: string): Promise<string> {
  try {
    const upper = symbol.toUpperCase().trim();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(upper)}?interval=1d&range=1d`,
      {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);
    if (!res.ok)
      return `Could not fetch data for "${upper}": HTTP ${res.status}`;
    const data: any = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result)
      return `No data found for symbol "${upper}". Verify the ticker is correct.`;
    const meta = result.meta;
    const price = meta.regularMarketPrice;
    const prevClose = meta.previousClose || meta.chartPreviousClose;
    const open = meta.regularMarketOpen;
    const dayHigh = meta.regularMarketDayHigh;
    const dayLow = meta.regularMarketDayLow;
    const volume = meta.regularMarketVolume;
    const currency = meta.currency;
    const exchange = meta.exchangeName;
    const fullName = meta.longName || meta.shortName || upper;
    const change = price - prevClose;
    const changePct = ((change / prevClose) * 100).toFixed(2);
    const changeStr = `${change >= 0 ? "+" : ""}${change.toFixed(2)} (${change >= 0 ? "+" : ""}${changePct}%)`;
    return [
      `${fullName} (${upper}) — ${exchange}`,
      `Price: ${price} ${currency}`,
      `Change: ${changeStr}`,
      `Open: ${open}  |  Day High: ${dayHigh}  |  Day Low: ${dayLow}`,
      `Volume: ${(volume as number)?.toLocaleString?.() ?? volume}`,
      `As of: ${new Date(meta.regularMarketTime * 1000).toUTCString()}`,
    ].join("\n");
  } catch (err: any) {
    return `Stock price fetch failed: ${err?.message || String(err)}`;
  }
}

export function getCurrentDatetime(): string {
  const now = new Date();
  const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const dayName = days[now.getUTCDay()];
  const monthName = months[now.getUTCMonth()];
  const date = now.getUTCDate();
  const year = now.getUTCFullYear();
  const hours = String(now.getUTCHours()).padStart(2, "0");
  const minutes = String(now.getUTCMinutes()).padStart(2, "0");
  return `Current date and time (UTC): ${dayName}, ${monthName} ${date}, ${year} at ${hours}:${minutes} UTC`;
}
