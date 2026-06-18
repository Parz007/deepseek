import { useLocation } from "wouter";
import { Home } from "lucide-react";

export default function NotFound() {
  const [, navigate] = useLocation();
  return (
    <div className="flex flex-col items-center justify-center h-dvh gap-4" style={{ background: "hsl(var(--background))", color: "hsl(var(--foreground))" }}>
      <p className="text-4xl font-bold" style={{ color: "hsl(var(--primary))" }}>404</p>
      <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>Page not found</p>
      <button
        onClick={() => navigate("/")}
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium mt-2"
        style={{ background: "hsl(var(--primary))", color: "white" }}
      >
        <Home size={14} /> Go Home
      </button>
    </div>
  );
}
