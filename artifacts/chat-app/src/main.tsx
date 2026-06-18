import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Telegram Mini App initialization
if (window.Telegram?.WebApp) {
  window.Telegram.WebApp.ready();
  window.Telegram.WebApp.expand();
}

createRoot(document.getElementById("root")!).render(<App />);
