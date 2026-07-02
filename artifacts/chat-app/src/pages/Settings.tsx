import { useLocation } from "wouter";
import { ArrowLeft, Sun, Moon, Cpu, Star, Shield, MessageSquare, Trash2 } from "lucide-react";
import { useAppContext } from "@/contexts/AppContext";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import PremiumModal from "@/components/PremiumModal";

const MODEL_OPTIONS = [
  {
    value: "deepseek" as const,
    label: "DeepSeek",
    desc: "Fast, unrestricted responses for everyday tasks",
    badge: "Paid",
  },
  {
    value: "claude" as const,
    label: "Claude Opus 4",
    desc: "Anthropic's most capable model — best for complex tasks",
    badge: "Premium",
  },
];

export default function Settings() {
  const [, navigate] = useLocation();
  const { theme, toggleTheme, model, setModel, clientId } = useAppContext();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [premiumOpen, setPremiumOpen] = useState(false);

  const clearHistory = () => {
    if (confirm("Clear all chat history? This cannot be undone.")) {
      qc.clear();
      toast({ title: "Chat history cleared" });
    }
  };

  return (
    <div className="flex flex-col h-dvh" style={{ background: "hsl(var(--background))" }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-3 py-3 border-b"
        style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--sidebar))" }}
      >
        <button
          onClick={() => navigate("/")}
          className="p-2 rounded-xl"
          style={{ color: "hsl(var(--muted-foreground))" }}
        >
          <ArrowLeft size={18} />
        </button>
        <img
          src="https://i.8upload.com/image/8f4c7cf580d96c9b/3039-removebg-preview.png"
          alt="DeepSeek"
          className="w-6 h-6 object-contain"
        />
        <p className="font-semibold text-base" style={{ color: "hsl(var(--foreground))" }}>
          Settings
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6">
        {/* Appearance */}
        <Section title="Appearance" icon={<Sun size={16} />}>
          <SettingRow label="Theme" desc={theme === "dark" ? "Dark mode" : "Light mode"}>
            <button
              onClick={toggleTheme}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium"
              style={{ background: "hsl(var(--secondary))", color: "hsl(var(--secondary-foreground))" }}
            >
              {theme === "dark" ? <Moon size={14} /> : <Sun size={14} />}
              {theme === "dark" ? "Dark" : "Light"}
            </button>
          </SettingRow>
        </Section>

        {/* Model */}
        <Section title="AI Model" icon={<Cpu size={16} />}>
          <div className="space-y-2">
            {MODEL_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setModel(opt.value)}
                className="w-full flex items-start gap-3 px-3 py-3 rounded-xl text-left transition-colors"
                style={{
                  background: model === opt.value ? "hsl(var(--accent))" : "hsl(var(--secondary))",
                  border: model === opt.value
                    ? "1px solid hsl(var(--primary) / 0.5)"
                    : "1px solid hsl(var(--border))",
                }}
              >
                <div
                  className="mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                  style={{
                    borderColor: model === opt.value ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
                    background: model === opt.value ? "hsl(var(--primary))" : "transparent",
                  }}
                >
                  {model === opt.value && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                      {opt.label}
                    </p>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{
                        background: opt.badge === "Free"
                          ? "hsl(var(--muted))"
                          : "hsl(var(--accent))",
                        color: opt.badge === "Free"
                          ? "hsl(var(--muted-foreground))"
                          : "hsl(var(--accent-foreground))",
                      }}
                    >
                      {opt.badge}
                    </span>
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
                    {opt.desc}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </Section>

        {/* Subscription */}
        <Section title="Subscription" icon={<Star size={16} />}>
          <button
            onClick={() => setPremiumOpen(true)}
            className="w-full flex items-center justify-between px-3 py-3 rounded-xl"
            style={{
              background: "hsl(var(--accent))",
              border: "1px solid hsl(var(--primary) / 0.3)",
            }}
          >
            <div>
              <p className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                Upgrade to Premium
              </p>
              <p className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
                Monthly $29 or Lifetime $199
              </p>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: "hsl(var(--primary))", color: "white" }}>
              <Star size={11} />
              View Plans
            </div>
          </button>
        </Section>

        {/* Data */}
        <Section title="Data" icon={<Shield size={16} />}>
          <SettingRow label="Clear chat history" desc="Remove all local conversations">
            <button
              onClick={clearHistory}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium"
              style={{ background: "hsl(var(--destructive) / 0.12)", color: "hsl(var(--destructive))" }}
            >
              <Trash2 size={14} />
              Clear
            </button>
          </SettingRow>
        </Section>

        {/* About */}
        <Section title="About" icon={<MessageSquare size={16} />}>
          <div className="px-3 py-2 space-y-1">
            <InfoRow label="Version" value="1.0.0" />
            <InfoRow label="Model provider" value="Google Gemini" />
            <InfoRow label="API" value="deepseek-uncensored-api-server.vercel.app" />
          </div>
        </Section>


        {/* Memory */}
        <Section title="Memory" icon={<MessageSquare size={16} />}>
          <SettingRow label="Persistent Memory" desc="Alex remembers facts about you across conversations">
            <button
              onClick={async () => {
                if (!confirm("Clear Alex\'s memory about you? This cannot be undone.")) return;
                try {
                  const apiBase = import.meta.env.VITE_API_URL || "";
                  await fetch(`${apiBase}/api/memory`, {
                    method: "DELETE",
                    headers: { "x-client-id": clientId ?? "" },
                  });
                  toast({ title: "Memory cleared", description: "Alex will start fresh next conversation." });
                } catch {
                  toast({ title: "Failed to clear memory", variant: "destructive" });
                }
              }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium transition-all active:scale-95"
              style={{ background: "hsl(var(--destructive) / 0.1)", color: "hsl(var(--destructive))", border: "1px solid hsl(var(--destructive) / 0.2)" }}
            >
              <Trash2 size={13} />
              Clear
            </button>
          </SettingRow>
        </Section>
      </div>

      {premiumOpen && clientId && (
        <PremiumModal
          clientId={clientId}
          onClose={() => setPremiumOpen(false)}
          onClaimSubmitted={() => setPremiumOpen(false)}
        />
      )}
    </div>
  );
}

function Section({ title, icon, children }: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span style={{ color: "hsl(var(--primary))" }}>{icon}</span>
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "hsl(var(--muted-foreground))" }}>
          {title}
        </p>
      </div>
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
      >
        {children}
      </div>
    </div>
  );
}

function SettingRow({ label, desc, children }: {
  label: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-3">
      <div>
        <p className="text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>{label}</p>
        {desc && <p className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>{desc}</p>}
      </div>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>{label}</p>
      <p className="text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>{value}</p>
    </div>
  );
}
