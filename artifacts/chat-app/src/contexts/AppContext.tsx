import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export type Theme = "dark" | "light";
export type Model =
  | "deepseek/deepseek-v4-flash"
  | "deepseek/deepseek-v4-pro"
  | "black-forest-labs/flux-1-schnell";

interface AppContextType {
  theme: Theme;
  toggleTheme: () => void;
  model: Model;
  setModel: (m: Model) => void;
  // Verified clientId — null while Telegram auth is in progress
  clientId: string | null;
  clientIdReady: boolean;
}

const AppContext = createContext<AppContextType | null>(null);

const VALID_MODELS: Model[] = [
  "deepseek/deepseek-v4-flash",
  "deepseek/deepseek-v4-pro",
  "black-forest-labs/flux-1-schnell",
];

// ── Telegram initData auth ────────────────────────────────────────────────────
// Returns a verified clientId from the server when running inside a Telegram
// Mini App, or generates/reuses a random UUID as a fallback for plain browsers.

async function resolveClientId(): Promise<string> {
  // Check if we already have a stored clientId
  const stored = localStorage.getItem("clientId");

  // Detect Telegram Mini App context
  const tg = (window as any).Telegram?.WebApp;
  const initData: string | undefined = tg?.initData;

  if (initData) {
    // We're inside a Telegram Mini App — validate initData with the server.
    // The server returns a cryptographically verified clientId (e.g. "tg_123456789").
    // Skip the round-trip if we already have a verified tg_ id stored.
    if (stored && stored.startsWith("tg_")) {
      return stored;
    }

    try {
      const apiBase = import.meta.env.BASE_URL
        ? `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}`
        : window.location.origin;

      const res = await fetch(`${apiBase}/api/telegram/auth`, {
        method: "POST",
        headers: {
          "x-telegram-init-data": initData,
        },
      });

      if (res.ok) {
        const data = (await res.json()) as { clientId: string };
        localStorage.setItem("clientId", data.clientId);
        return data.clientId;
      }
      // Auth failed (invalid initData / expired) — fall through to UUID fallback
      console.warn("[TgAuth] Server rejected initData:", res.status);
    } catch (err) {
      console.warn("[TgAuth] Auth request failed:", err);
    }
  }

  // Fallback: plain browser or Telegram auth failed — use/generate a random UUID.
  // This keeps the app functional outside Telegram.
  if (stored) return stored;
  const id = crypto.randomUUID();
  localStorage.setItem("clientId", id);
  return id;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem("theme") as Theme) || "dark";
  });

  const [model, setModelState] = useState<Model>(() => {
    const saved = localStorage.getItem("model") as Model;
    return VALID_MODELS.includes(saved) ? saved : "deepseek/deepseek-v4-flash";
  });

  // clientId starts null (loading) until resolveClientId() completes
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientIdReady, setClientIdReady] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light") {
      root.classList.add("light");
      root.classList.remove("dark");
    } else {
      root.classList.add("dark");
      root.classList.remove("light");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Resolve the clientId once on mount (async — handles Telegram auth)
  useEffect(() => {
    resolveClientId().then(id => {
      setClientId(id);
      setClientIdReady(true);
    });
  }, []);

  const toggleTheme = () => setTheme(t => t === "dark" ? "light" : "dark");

  const setModel = (m: Model) => {
    setModelState(m);
    localStorage.setItem("model", m);
  };

  return (
    <AppContext.Provider value={{ theme, toggleTheme, model, setModel, clientId, clientIdReady }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used within AppProvider");
  return ctx;
}
