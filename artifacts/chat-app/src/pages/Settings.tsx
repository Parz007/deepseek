import { useLocation } from "wouter";
import { ArrowLeft, Lock, ShieldCheck, Zap, Server } from "lucide-react";

export function getSystemPrompt(): string {
  return "";
}

export default function Settings() {
  const [, navigate] = useLocation();

  return (
    <div className="flex flex-col h-dvh" style={{ background: "hsl(var(--background))" }}>
      {/* Header */}
      <header
        className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
        style={{ background: "hsl(var(--sidebar))", borderBottom: "1px solid hsl(var(--border))" }}
      >
        <button
          onClick={() => navigate("/")}
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all active:scale-90"
          style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}
        >
          <ArrowLeft size={17} />
        </button>
        <div>
          <p className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>Configuration</p>
          <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>AI system settings</p>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-4">

        {/* Locked system prompt card */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{ border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
        >
          <div
            className="px-4 py-3 flex items-center justify-between"
            style={{ borderBottom: "1px solid hsl(var(--border))", background: "hsl(var(--muted) / 0.5)" }}
          >
            <div className="flex items-center gap-2">
              <Lock size={13} style={{ color: "hsl(var(--primary))" }} />
              <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: "hsl(var(--muted-foreground))" }}>
                System Prompt
              </span>
            </div>
            <span
              className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
              style={{
                background: "hsl(var(--primary) / 0.15)",
                color: "hsl(var(--primary))",
                border: "1px solid hsl(var(--primary) / 0.25)",
              }}
            >
              Server-side
            </span>
          </div>

          <div className="px-4 py-6 flex flex-col items-center gap-3 text-center">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, hsl(252 82% 68% / 0.15), hsl(198 80% 56% / 0.08))",
                border: "1px solid hsl(252 82% 68% / 0.25)",
              }}
            >
              <ShieldCheck size={24} style={{ color: "hsl(var(--primary))" }} />
            </div>
            <div>
              <p className="font-semibold text-sm mb-1" style={{ color: "hsl(var(--foreground))" }}>
                Prompt is locked
              </p>
              <p className="text-xs leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
                The system configuration is managed server-side and cannot be viewed or modified here.
              </p>
            </div>
          </div>
        </div>

        {/* Status cards */}
        <div className="grid grid-cols-2 gap-2.5">
          {[
            { icon: Server, label: "Mode", value: "Sandbox", color: "252 82% 68%" },
            { icon: Zap, label: "Model", value: "V4 Flash", color: "198 80% 56%" },
            { icon: ShieldCheck, label: "Prompt", value: "Locked", color: "142 62% 52%" },
            { icon: Lock, label: "Access", value: "Private", color: "38 92% 60%" },
          ].map(({ icon: Icon, label, value, color }) => (
            <div
              key={label}
              className="rounded-xl px-4 py-3.5 flex flex-col gap-1.5"
              style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--card-border))" }}
            >
              <div className="flex items-center gap-1.5">
                <Icon size={12} style={{ color: `hsl(${color})` }} />
                <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: "hsl(var(--muted-foreground))" }}>
                  {label}
                </span>
              </div>
              <p className="text-sm font-bold" style={{ color: "hsl(var(--foreground))" }}>{value}</p>
            </div>
          ))}
        </div>

      </main>
    </div>
  );
}
