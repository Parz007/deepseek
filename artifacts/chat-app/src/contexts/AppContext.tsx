import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export type Theme = "dark" | "light";
export type Model =
  | "deepseek/deepseek-chat"
  | "deepseek/deepseek-r1"
  | "black-forest-labs/flux-1-schnell";

interface AppContextType {
  theme: Theme;
  toggleTheme: () => void;
  model: Model;
  setModel: (m: Model) => void;
}

const AppContext = createContext<AppContextType | null>(null);

const VALID_MODELS: Model[] = [
  "deepseek/deepseek-chat",
  "deepseek/deepseek-r1",
  "black-forest-labs/flux-1-schnell",
];

export function AppProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem("theme") as Theme) || "dark";
  });

  const [model, setModelState] = useState<Model>(() => {
    const saved = localStorage.getItem("model") as Model;
    return VALID_MODELS.includes(saved) ? saved : "deepseek/deepseek-chat";
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

  const toggleTheme = () => setTheme(t => t === "dark" ? "light" : "dark");

  const setModel = (m: Model) => {
    setModelState(m);
    localStorage.setItem("model", m);
  };

  return (
    <AppContext.Provider value={{ theme, toggleTheme, model, setModel }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used within AppProvider");
  return ctx;
}
