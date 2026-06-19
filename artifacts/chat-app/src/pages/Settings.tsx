import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Lock, ShieldCheck, Zap, Server, Check, UserCog } from "lucide-react";

const STORAGE_KEY = "userSystemPrompt";
const MAX_CHARS = 600;

export function getUserPrompt(): string {
  try { return localStorage.getItem(STORAGE_KEY) || ""; }
  catch { return ""; }
}

export default function Settings() {
  const [, navigate] = useLocation();
  const [prompt, setPrompt] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setPrompt(getUserPrompt());
  }, []);

  const handleSave = () => {
    try {
      localStorage.setItem(STORAGE_KEY, prompt.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* ignore */ }
  };

  const handleClear = () => {
    setPrompt("");
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  };

  const remaining = MAX_CHARS - prompt.length;
  const isOverLimit = remaining < 0;

  return (
    <div className="flex flex-col h-dvh" style={{ background: "hsl(var(--background))" }}>
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

      <main className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-4">

        <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}>
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid hsl(var(--border))", background: "hsl(var(--muted) / 0.5)" }}>
            <div className="flex items-center gap-2">
              <Lock size={13} style={{ color: "hsl(var(--primary))" }} />
              <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: "hsl(var(--muted-foreground))" }}>System Prompt</span>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: "hsl(var(--primary) / 0.15)", color: "hsl(var(--primary))", border: "1px solid hsl(var(--primary) / 0.25)" }}>
              Server-side
            </span>
          </div>
          <div className="px-4 py-6 flex flex-col items-center gap-3 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, hsl(252 82% 68% / 0.15), hsl(198 80% 56% / 0.08))", border: "1px solid hsl(252 82% 68% / 0.25)" }}>
              <ShieldCheck size={24} style={{ color: "hsl(var(--primary))" }} />
            </div>
            <div>
              <p className="font-semibold text-sm mb-1" style={{ color: "hsl(var(--foreground))" }}>Prompt is locked</p>
              <p className="text-xs leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
                The system configuration is managed server-side and cannot be viewed or modified here.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}>
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid hsl(var(--border))", background: "hsl(var(--muted) / 0.5)" }}>
            <div className="flex items-center gap-2">
              <UserCog size={13} style={{ color: "hsl(var(--primary))" }} />
              <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: "hsl(var(--muted-foreground))" }}>Your Instructions</span>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: "hsl(142 62% 52% / 0.12)", color: "hsl(142 62% 42%)", border: "1px solid hsl(142 62% 52% / 0.25)" }}>
              Editable
            </span>
          </div>
          <div className="px-4 pt-4 pb-3 flex flex-col gap-3">
            <p className="text-xs leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
              Add your own instructions that apply to every conversation. These are appended after the system prompt — you can set a persona, preferred format, or topic focus.
            </p>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value.slice(0, MAX_CHARS + 20))}
              placeholder={`e.g. "Always respond in bullet points." or "You are a Python tutor. Keep examples short."`}
              rows={5}
              className="w-full resize-none rounded-xl px-3.5 py-3 text-sm leading-relaxed outline-none transition-all"
              style={{ background: "hsl(var(--background))", border: `1px solid ${isOverLimit ? "hsl(var(--destructive) / 0.5)" : "hsl(var(--border))"}`, color: "hsl(var(--foreground))", fontFamily: "var(--app-font-sans)" }}
              onFocus={e => { if (!isOverLimit) e.currentTarget.style.borderColor = "hsl(252 82% 68% / 0.5)"; }}
              onBlur={e => { e.currentTarget.style.borderColor = isOverLimit ? "hsl(var(--destructive) / 0.5)" : "hsl(var(--border))"; }}
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px]" style={{ color: isOverLimit ? "hsl(var(--destructive))" : "hsl(var(--muted-foreground))" }}>
                {isOverLimit ? `${Math.abs(remaining)} chars over limit` : `${remaining} characters remaining`}
              </span>
              <div className="flex items-center gap-2">
                {prompt.length > 0 && (
                  <button onClick={handleClear} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95" style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}>
                    Clear
                  </button>
                )}
                <button
                  onClick={handleSave}
                  disabled={isOverLimit}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95"
                  style={{ background: saved ? "hsl(142 62% 52% / 0.15)" : isOverLimit ? "hsl(var(--muted))" : "linear-gradient(135deg, hsl(252 82% 68%), hsl(252 75% 60%))", color: saved ? "hsl(142 62% 42%)" : isOverLimit ? "hsl(var(--muted-foreground))" : "white", boxShadow: (!saved && !isOverLimit) ? "0 3px 10px hsl(252 82% 68% / 0.3)" : "none" }}
                >
                  {saved ? <><Check size={11} strokeWidth={2.5} /> Saved</> : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {[
            { icon: Server, label: "Mode", value: "Sandbox", color: "252 82% 68%" },
            { icon: Zap, label: "Model", value: "V4 Flash", color: "198 80% 56%" },
            { icon: ShieldCheck, label: "Prompt", value: "Locked", color: "142 62% 52%" },
            { icon: Lock, label: "Access", value: "Private", color: "38 92% 60%" },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="rounded-xl px-4 py-3.5 flex flex-col gap-1.5" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--card-border))" }}>
              <div className="flex items-center gap-1.5">
                <Icon size={12} style={{ color: `hsl(${color})` }} />
                <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: "hsl(var(--muted-foreground))" }}>{label}</span>
              </div>
              <p className="text-sm font-bold" style={{ color: "hsl(var(--foreground))" }}>{value}</p>
            </div>
          ))}
        </div>

      </main>
    </div>
  );
}
