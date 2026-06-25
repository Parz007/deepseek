import { createContext, useContext, useEffect, useState } from "react";
  import type { ReactNode } from "react";
  import { setClientIdGetter } from "@workspace/api-client-react";

  export type Theme = "dark" | "light";
  export type Model =
    | "gemini-2.5-flash-lite"
    | "gemini-2.5-flash";

  interface AppContextType {
    theme: Theme;
    toggleTheme: () => void;
    model: Model;
    setModel: (m: Model) => void;
    clientId: string | null;
    clientIdReady: boolean;
  }

  const AppContext = createContext<AppContextType | null>(null);

  const VALID_MODELS: Model[] = [
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
  ];

  // ── Telegram initData auth ────────────────────────────────────────────────────

  async function resolveClientId(): Promise<string> {
    const stored = localStorage.getItem("clientId");

    const tg = (window as any).Telegram?.WebApp;
    const initData: string | undefined = tg?.initData;

    if (initData) {
      if (stored && stored.startsWith("tg_")) {
        return stored;
      }

      try {
        const apiBase = import.meta.env.BASE_URL
          ? `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}`
          : window.location.origin;

        const res = await fetch(`${apiBase}/api/telegram/auth`, {
          method: "POST",
          headers: { "x-telegram-init-data": initData },
        });

        if (res.ok) {
          const data = (await res.json()) as { clientId: string };
          localStorage.setItem("clientId", data.clientId);
          return data.clientId;
        }
        console.warn("[TgAuth] Server rejected initData:", res.status);
      } catch (err) {
        console.warn("[TgAuth] Auth request failed:", err);
      }
    }

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
      return VALID_MODELS.includes(saved) ? saved : "gemini-2.5-flash-lite";
    });

    const [clientId, setClientId] = useState<string | null>(() => {
      try {
        return localStorage.getItem("clientId") || null;
      } catch {
        return null;
      }
    });

    const [clientIdReady, setClientIdReady] = useState<boolean>(() => {
      try {
        return !!localStorage.getItem("clientId");
      } catch {
        return false;
      }
    });

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

    useEffect(() => {
      resolveClientId().then(id => {
        setClientIdGetter(() => id);
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
  
