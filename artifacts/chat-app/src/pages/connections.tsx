import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, Check, X, Loader2, Link2, Trash2, ExternalLink,
  Key, Globe, Send, AlertTriangle, ChevronRight, Zap, Sparkles,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ServiceInfo {
  id: string;
  name: string;
  authType: "oauth2" | "api_key";
  configured?: boolean;
  description?: string;
}

interface ServicesData {
  oauth: ServiceInfo[];
  apiKey: ServiceInfo[];
}

interface ConnectionStatus {
  service: string;
  authType: string;
  connected: boolean;
  lastUsedAt: string | null;
  createdAt: string | null;
}

interface AgentSseEvent {
  type: "token" | "done" | "error" | "tool_start" | "tool_done" | "confirm_required" | "paused";
  content?: string;
  message?: string;
  toolName?: string;
  toolInput?: Record<string, any>;
  result?: string;
  toolCallId?: string;
}

interface AgentStep {
  type: "text" | "tool_start" | "tool_done" | "confirm" | "error";
  toolName?: string;
  toolInput?: Record<string, any>;
  result?: string;
  text?: string;
  toolCallId?: string;
}

interface ActionLog {
  id: number;
  service: string;
  action: string;
  success: boolean;
  error_message: string | null;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getClientId(): string {
  let id = localStorage.getItem("clientId");
  if (!id) { id = crypto.randomUUID(); localStorage.setItem("clientId", id); }
  return id;
}

function formatTime(iso: string | null): string {
  if (!iso) return "never";
  try {
    const d = new Date(iso);
    const now = Date.now();
    const diff = now - d.getTime();
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
  } catch { return "–"; }
}

const SERVICE_ICONS: Record<string, string> = {
  google: "🌐",
  github: "🐙",
  notion: "📝",
  openai: "🤖",
  telegram_bot: "✈️",
  custom: "🔑",
};

const SERVICE_COLORS: Record<string, string> = {
  google: "hsl(215 70% 55%)",
  github: "hsl(0 0% 60%)",
  notion: "hsl(252 82% 68%)",
  openai: "hsl(142 62% 45%)",
  telegram_bot: "hsl(198 80% 50%)",
  custom: "hsl(38 92% 50%)",
};

// ── Service card ──────────────────────────────────────────────────────────────

function ServiceCard({
  service,
  status,
  onConnect,
  onDisconnect,
  onApiKeySubmit,
  loading,
}: {
  service: ServiceInfo;
  status: ConnectionStatus | undefined;
  onConnect?: () => void;
  onDisconnect: () => void;
  onApiKeySubmit?: (key: string) => void;
  loading: boolean;
}) {
  const [showKeyForm, setShowKeyForm] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isConnected = !!status;
  const color = SERVICE_COLORS[service.id] || "hsl(252 82% 68%)";
  const icon = SERVICE_ICONS[service.id] || "🔗";

  const handleKeySubmit = async () => {
    if (!keyInput.trim()) return;
    setSubmitting(true);
    try {
      await onApiKeySubmit?.(keyInput.trim());
      setKeyInput("");
      setShowKeyForm(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
      <div className="px-4 py-3.5 flex items-center gap-3">
        {/* Icon */}
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-xl"
          style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
          {icon}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
              {service.name}
            </p>
            {isConnected && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                style={{ background: "hsl(142 62% 52% / 0.12)", color: "hsl(142 62% 45%)", border: "1px solid hsl(142 62% 52% / 0.2)" }}>
                <Check size={9} strokeWidth={2.5} />
                Connected
              </span>
            )}
          </div>
          <p className="text-[11px] mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
            {isConnected
              ? `Last used ${formatTime(status.lastUsedAt)}`
              : service.description || (service.authType === "oauth2" ? "Connect via OAuth" : "Paste your API key")}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {loading ? (
            <Loader2 size={16} className="animate-spin" style={{ color: "hsl(var(--muted-foreground))" }} />
          ) : isConnected ? (
            <button onClick={onDisconnect}
              title="Disconnect"
              className="w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-90"
              style={{ background: "hsl(var(--destructive) / 0.08)", border: "1px solid hsl(var(--destructive) / 0.2)", color: "hsl(var(--destructive))" }}>
              <Trash2 size={13} />
            </button>
          ) : (
            service.authType === "oauth2" ? (
              <button onClick={onConnect}
                disabled={!service.configured}
                title={!service.configured ? "OAuth credentials not configured in server env" : `Connect ${service.name}`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95"
                style={{
                  background: service.configured ? `${color}18` : "hsl(var(--muted))",
                  border: `1px solid ${service.configured ? `${color}30` : "hsl(var(--border))"}`,
                  color: service.configured ? color : "hsl(var(--muted-foreground))",
                  cursor: !service.configured ? "not-allowed" : "pointer",
                  opacity: !service.configured ? 0.6 : 1,
                }}>
                <ExternalLink size={11} />
                Connect
              </button>
            ) : (
              <button onClick={() => setShowKeyForm(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95"
                style={{
                  background: showKeyForm ? `${color}18` : "hsl(var(--muted))",
                  border: `1px solid ${showKeyForm ? `${color}30` : "hsl(var(--border))"}`,
                  color: showKeyForm ? color : "hsl(var(--muted-foreground))",
                }}>
                <Key size={11} />
                Add key
              </button>
            )
          )}
        </div>
      </div>

      {/* API key form */}
      {showKeyForm && !isConnected && (
        <div className="px-4 pb-4 flex flex-col gap-2"
          style={{ borderTop: "1px solid hsl(var(--border))" }}>
          <p className="text-[11px] pt-3" style={{ color: "hsl(var(--muted-foreground))" }}>
            Your key is encrypted at rest and never sent to the frontend.
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              value={keyInput}
              onChange={e => setKeyInput(e.target.value)}
              placeholder={`${service.name} API key…`}
              onKeyDown={e => { if (e.key === "Enter") handleKeySubmit(); }}
              className="flex-1 px-3 py-2 rounded-xl text-xs outline-none"
              style={{
                background: "hsl(var(--background))",
                border: "1px solid hsl(var(--border))",
                color: "hsl(var(--foreground))",
                fontFamily: "var(--app-font-mono)",
              }}
            />
            <button onClick={handleKeySubmit} disabled={submitting || !keyInput.trim()}
              className="px-3 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95"
              style={{
                background: keyInput.trim() ? "linear-gradient(135deg, hsl(252 82% 68%), hsl(252 75% 60%))" : "hsl(var(--muted))",
                color: keyInput.trim() ? "white" : "hsl(var(--muted-foreground))",
              }}>
              {submitting ? <Loader2 size={13} className="animate-spin" /> : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Confirm modal ─────────────────────────────────────────────────────────────

function ConfirmModal({
  toolName,
  toolInput,
  onConfirm,
  onCancel,
}: {
  toolName: string;
  toolInput: Record<string, any>;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)" }}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden"
        style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "hsl(38 92% 50% / 0.12)", border: "1px solid hsl(38 92% 50% / 0.25)" }}>
              <AlertTriangle size={18} style={{ color: "hsl(38 92% 50%)" }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                Confirm action
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
                This action is irreversible or sends data externally.
              </p>
            </div>
          </div>
          <div className="rounded-xl p-3 mb-4"
            style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))" }}>
            <p className="text-[11px] font-semibold mb-1" style={{ color: "hsl(var(--foreground))" }}>
              {toolName.replace(/_/g, " ")}
            </p>
            <pre className="text-[10px] whitespace-pre-wrap break-all"
              style={{ color: "hsl(var(--muted-foreground))", fontFamily: "var(--app-font-mono)", margin: 0 }}>
              {JSON.stringify(toolInput, null, 2)}
            </pre>
          </div>
          <div className="flex gap-2">
            <button onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95"
              style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))" }}>
              Cancel
            </button>
            <button onClick={onConfirm}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95"
              style={{ background: "hsl(0 72% 51%)", color: "white" }}>
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Agent step renderer ───────────────────────────────────────────────────────

function AgentStepItem({ step }: { step: AgentStep }) {
  if (step.type === "text") {
    return (
      <div className="text-sm leading-relaxed" style={{ color: "hsl(var(--foreground))", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
        {step.text}
      </div>
    );
  }

  if (step.type === "tool_start") {
    return (
      <div className="flex items-center gap-2 text-[12px]"
        style={{ color: "hsl(var(--muted-foreground))" }}>
        <Loader2 size={12} className="animate-spin flex-shrink-0" />
        <span>Running <strong>{step.toolName?.replace(/_/g, " ")}</strong>…</span>
      </div>
    );
  }

  if (step.type === "tool_done") {
    return (
      <div className="rounded-xl overflow-hidden"
        style={{ border: "1px solid hsl(var(--border))", background: "hsl(var(--muted) / 0.4)" }}>
        <div className="px-3 py-2 flex items-center gap-2"
          style={{ borderBottom: "1px solid hsl(var(--border))" }}>
          <Check size={12} strokeWidth={2.5} style={{ color: "hsl(142 62% 45%)" }} />
          <span className="text-[11px] font-semibold" style={{ color: "hsl(142 62% 45%)" }}>
            {step.toolName?.replace(/_/g, " ")}
          </span>
        </div>
        <pre className="px-3 py-2 text-[11px] whitespace-pre-wrap break-all leading-relaxed"
          style={{ color: "hsl(var(--muted-foreground))", fontFamily: "var(--app-font-mono)", margin: 0 }}>
          {step.result}
        </pre>
      </div>
    );
  }

  if (step.type === "error") {
    return (
      <div className="px-3 py-2 rounded-xl text-[12px]"
        style={{ background: "hsl(var(--destructive) / 0.08)", border: "1px solid hsl(var(--destructive) / 0.2)", color: "hsl(var(--destructive))" }}>
        {step.text}
      </div>
    );
  }

  return null;
}

// ── Connections page ──────────────────────────────────────────────────────────

export default function Connections() {
  const [, navigate] = useLocation();
  const clientId = getClientId();
  const apiBase = (typeof import.meta !== "undefined" ? (import.meta as any).env?.VITE_API_URL : "") || "";

  const [services, setServices] = useState<ServicesData | null>(null);
  const [statuses, setStatuses] = useState<ConnectionStatus[]>([]);
  const [loadingServices, setLoadingServices] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<"connections" | "agent" | "logs">("connections");
  const [pageLoading, setPageLoading] = useState(true);

  // Agent state
  const [agentInput, setAgentInput] = useState("");
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([]);
  const [agentStreamText, setAgentStreamText] = useState("");
  const [pendingConfirm, setPendingConfirm] = useState<{ toolName: string; toolInput: Record<string, any>; toolCallId: string } | null>(null);
  const [confirmedActions, setConfirmedActions] = useState<string[]>([]);
  const agentBottomRef = useRef<HTMLDivElement>(null);

  // Action logs
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // URL params handling
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const error = params.get("error");
    if (connected) {
      window.history.replaceState({}, "", window.location.pathname);
      fetchAll();
    }
    if (error) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setPageLoading(true);
    try {
      const [svcRes, statusRes] = await Promise.all([
        fetch(`${apiBase}/api/connect/services`),
        fetch(`${apiBase}/api/connect/status`),
      ]);
      if (svcRes.ok) setServices(await svcRes.json());
      if (statusRes.ok) {
        const data = await statusRes.json();
        setStatuses(data.connections || []);
      }
    } catch { /* ignore */ } finally { setPageLoading(false); }
  }, [apiBase]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    agentBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [agentSteps, agentStreamText]);

  const fetchLogs = async () => {
    setLogsLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/agent/logs`);
      if (res.ok) { const data = await res.json(); setLogs(data.logs || []); }
    } catch { /* ignore */ } finally { setLogsLoading(false); }
  };

  useEffect(() => {
    if (activeTab === "logs") fetchLogs();
  }, [activeTab]);

  const getStatus = (serviceId: string) => statuses.find(s => s.service === serviceId);
  const setServiceLoading = (id: string, v: boolean) => setLoadingServices(prev => { const s = new Set(prev); v ? s.add(id) : s.delete(id); return s; });

  const handleOAuthConnect = (serviceId: string) => {
    window.location.href = `${apiBase}/api/connect/${serviceId}/start`;
  };

  const handleApiKeySubmit = async (serviceId: string, key: string) => {
    setServiceLoading(serviceId, true);
    try {
      const res = await fetch(`${apiBase}/api/connect/api-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Client-ID": clientId },
        body: JSON.stringify({ service: serviceId, apiKey: key }),
      });
      if (res.ok) await fetchAll();
    } finally { setServiceLoading(serviceId, false); }
  };

  const handleDisconnect = async (serviceId: string) => {
    setServiceLoading(serviceId, true);
    try {
      await fetch(`${apiBase}/api/connect/${serviceId}`, {
        method: "DELETE",
        headers: { "X-Client-ID": clientId },
      });
      await fetchAll();
    } finally { setServiceLoading(serviceId, false); }
  };

  // ── Agent run ────────────────────────────────────────────────────────────

  const runAgent = useCallback(async (instruction: string, confirmed: string[] = []) => {
    if (!instruction.trim() || agentRunning) return;
    setAgentRunning(true);
    setAgentStreamText("");
    if (confirmed.length === 0) {
      setAgentSteps([]);
      setConfirmedActions([]);
    }

    try {
      const res = await fetch(`${apiBase}/api/agent/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Client-ID": clientId },
        body: JSON.stringify({ instruction, confirmedActions: confirmed }),
      });

      if (!res.ok || !res.body) {
        setAgentSteps(prev => [...prev, { type: "error", text: `Agent error (${res.status})` }]);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";
      let accumText = "";

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop()!;

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6)) as AgentSseEvent;

            if (evt.type === "token" && evt.content) {
              accumText += evt.content;
              setAgentStreamText(accumText);
            }

            if (evt.type === "tool_start") {
              if (accumText) {
                setAgentSteps(prev => [...prev, { type: "text", text: accumText }]);
                accumText = "";
                setAgentStreamText("");
              }
              setAgentSteps(prev => [...prev, { type: "tool_start", toolName: evt.toolName }]);
            }

            if (evt.type === "tool_done") {
              setAgentSteps(prev => {
                const last = prev[prev.length - 1];
                if (last?.type === "tool_start" && last.toolName === evt.toolName) {
                  return [...prev.slice(0, -1), { type: "tool_done", toolName: evt.toolName, result: evt.result }];
                }
                return [...prev, { type: "tool_done", toolName: evt.toolName, result: evt.result }];
              });
            }

            if (evt.type === "confirm_required" && evt.toolName && evt.toolInput && evt.toolCallId) {
              setPendingConfirm({ toolName: evt.toolName, toolInput: evt.toolInput, toolCallId: evt.toolCallId });
            }

            if (evt.type === "error") {
              setAgentSteps(prev => [...prev, { type: "error", text: evt.message || "Agent error" }]);
              break outer;
            }

            if (evt.type === "done") {
              if (accumText) {
                setAgentSteps(prev => [...prev, { type: "text", text: accumText }]);
                setAgentStreamText("");
              }
              break outer;
            }
          } catch { /* skip */ }
        }
      }
    } catch (err: any) {
      setAgentSteps(prev => [...prev, { type: "error", text: err.message || "Connection error" }]);
    } finally {
      setAgentRunning(false);
    }
  }, [agentRunning, apiBase, clientId]);

  const handleConfirm = () => {
    if (!pendingConfirm) return;
    const newConfirmed = [...confirmedActions, pendingConfirm.toolName];
    setConfirmedActions(newConfirmed);
    setPendingConfirm(null);
    runAgent(agentInput, newConfirmed);
  };

  const handleCancelConfirm = () => {
    setPendingConfirm(null);
    setAgentSteps(prev => [...prev, { type: "error", text: `Cancelled: ${pendingConfirm?.toolName?.replace(/_/g, " ")}` }]);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-dvh" style={{ background: "hsl(var(--background))" }}>

      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
        style={{ background: "hsl(var(--sidebar))", borderBottom: "1px solid hsl(var(--border))" }}>
        <button onClick={() => navigate("/")}
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all active:scale-90"
          style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
          <ArrowLeft size={17} />
        </button>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: "linear-gradient(135deg, hsl(252 82% 68%), hsl(198 80% 56%))", boxShadow: "0 3px 12px hsl(252 82% 68% / 0.35)" }}>
          <Link2 size={15} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>Connections</p>
          <p className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
            {statuses.length > 0 ? `${statuses.length} service${statuses.length === 1 ? "" : "s"} connected` : "Connect external services"}
          </p>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex px-4 pt-3 gap-1 flex-shrink-0">
        {(["connections", "agent", "logs"] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className="flex-1 py-2 rounded-xl text-xs font-semibold capitalize transition-all"
            style={{
              background: activeTab === tab ? "hsl(var(--primary) / 0.1)" : "hsl(var(--card))",
              border: `1px solid ${activeTab === tab ? "hsl(var(--primary) / 0.3)" : "hsl(var(--border))"}`,
              color: activeTab === tab ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
            }}>
            {tab === "connections" ? "🔗 Connect" : tab === "agent" ? "⚡ Agent" : "📋 Logs"}
          </button>
        ))}
      </div>

      {/* ── Connections tab ── */}
      {activeTab === "connections" && (
        <main className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
          {pageLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 size={20} className="animate-spin" style={{ color: "hsl(var(--muted-foreground))" }} />
            </div>
          ) : (
            <>
              {/* Info */}
              <div className="px-4 py-3 rounded-2xl flex items-start gap-3"
                style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: "hsl(252 82% 68% / 0.12)", border: "1px solid hsl(252 82% 68% / 0.2)" }}>
                  <Sparkles size={14} style={{ color: "hsl(var(--primary))" }} />
                </div>
                <div>
                  <p className="text-[12px] font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                    Credentials are encrypted at rest
                  </p>
                  <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
                    OAuth tokens and API keys are stored AES-256-GCM encrypted. They are never sent to the frontend and only decrypted in memory on the server.
                  </p>
                </div>
              </div>

              {/* OAuth services */}
              {services?.oauth && services.oauth.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider px-1"
                    style={{ color: "hsl(var(--muted-foreground))" }}>
                    OAuth Services
                  </p>
                  {services.oauth.map(svc => (
                    <ServiceCard
                      key={svc.id}
                      service={svc}
                      status={getStatus(svc.id)}
                      onConnect={() => handleOAuthConnect(svc.id)}
                      onDisconnect={() => handleDisconnect(svc.id)}
                      loading={loadingServices.has(svc.id)}
                    />
                  ))}
                </div>
              )}

              {/* API key services */}
              {services?.apiKey && services.apiKey.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider px-1"
                    style={{ color: "hsl(var(--muted-foreground))" }}>
                    API Key Services
                  </p>
                  {services.apiKey.map(svc => (
                    <ServiceCard
                      key={svc.id}
                      service={svc}
                      status={getStatus(svc.id)}
                      onDisconnect={() => handleDisconnect(svc.id)}
                      onApiKeySubmit={(key) => handleApiKeySubmit(svc.id, key)}
                      loading={loadingServices.has(svc.id)}
                    />
                  ))}
                </div>
              )}

              {!services && !pageLoading && (
                <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                  <Globe size={28} style={{ color: "hsl(var(--muted-foreground) / 0.4)" }} />
                  <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>Could not load services</p>
                  <button onClick={fetchAll} className="text-xs" style={{ color: "hsl(var(--primary))" }}>Retry</button>
                </div>
              )}
            </>
          )}
        </main>
      )}

      {/* ── Agent tab ── */}
      {activeTab === "agent" && (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Steps */}
          <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
            {agentSteps.length === 0 && !agentStreamText && !agentRunning && (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-center pb-8">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{ background: "hsl(252 82% 68% / 0.1)", border: "1px solid hsl(252 82% 68% / 0.2)" }}>
                  <Zap size={22} style={{ color: "hsl(var(--primary))" }} />
                </div>
                <div>
                  <p className="font-bold text-base" style={{ color: "hsl(var(--foreground))" }}>AI Agent</p>
                  <p className="text-[12px] mt-1 leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
                    Tell the agent what to do.<br />It uses your connected services to take real actions.
                  </p>
                </div>
                <div className="flex flex-col gap-1.5 w-full max-w-xs">
                  {[
                    "List my GitHub repos",
                    "Search Notion for my meeting notes",
                    "What's in my unread emails?",
                  ].map((example) => (
                    <button key={example} onClick={() => setAgentInput(example)}
                      className="w-full px-3 py-2 rounded-xl text-left text-[12px] transition-all active:scale-95"
                      style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
                      <span className="flex items-center gap-2">
                        <ChevronRight size={11} />
                        {example}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {agentSteps.map((step, i) => (
              <AgentStepItem key={i} step={step} />
            ))}

            {agentStreamText && (
              <div className="text-sm leading-relaxed" style={{ color: "hsl(var(--foreground))", whiteSpace: "pre-wrap" }}>
                {agentStreamText}
                <span className="inline-block w-0.5 h-3.5 ml-0.5 align-middle rounded-full animate-pulse" style={{ background: "hsl(var(--primary))" }} />
              </div>
            )}

            {agentRunning && !agentStreamText && agentSteps.length === 0 && (
              <div className="flex items-center gap-2 text-[12px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                <Loader2 size={12} className="animate-spin" />
                <span>Agent working…</span>
              </div>
            )}

            <div ref={agentBottomRef} />
          </div>

          {/* Agent input */}
          <div className="px-4 pb-4 pt-2 flex-shrink-0">
            <div className="flex items-end gap-2 px-4 py-3 rounded-2xl"
              style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--card-border))" }}>
              <textarea
                value={agentInput}
                onChange={e => setAgentInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); runAgent(agentInput); } }}
                disabled={agentRunning}
                placeholder="Tell the agent what to do…"
                rows={1}
                className="flex-1 resize-none bg-transparent outline-none text-sm leading-relaxed py-0.5"
                style={{ color: "hsl(var(--foreground))", maxHeight: "120px", overflowY: "auto" }}
              />
              <button
                onClick={() => runAgent(agentInput)}
                disabled={!agentInput.trim() || agentRunning}
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all active:scale-90"
                style={{
                  background: agentInput.trim() && !agentRunning ? "linear-gradient(135deg, hsl(252 82% 68%), hsl(252 75% 60%))" : "hsl(var(--muted))",
                  color: agentInput.trim() && !agentRunning ? "white" : "hsl(var(--muted-foreground))",
                }}>
                {agentRunning ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} strokeWidth={2} />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Logs tab ── */}
      {activeTab === "logs" && (
        <main className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-2">
          {logsLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 size={20} className="animate-spin" style={{ color: "hsl(var(--muted-foreground))" }} />
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-center py-12">
              <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>No agent actions yet</p>
              <p className="text-[11px]" style={{ color: "hsl(var(--muted-foreground) / 0.6)" }}>
                Actions taken by the agent will appear here
              </p>
            </div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="px-4 py-3 rounded-xl"
                style={{
                  background: "hsl(var(--card))",
                  border: `1px solid ${log.success ? "hsl(var(--border))" : "hsl(var(--destructive) / 0.2)"}`,
                }}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    {log.success
                      ? <Check size={12} strokeWidth={2.5} style={{ color: "hsl(142 62% 45%)" }} />
                      : <X size={12} strokeWidth={2.5} style={{ color: "hsl(var(--destructive))" }} />}
                    <span className="text-[12px] font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                      {log.action.replace(/_/g, " ")}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                      style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}>
                      {log.service}
                    </span>
                  </div>
                  <span className="text-[10px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                    {formatTime(log.created_at)}
                  </span>
                </div>
                {log.error_message && (
                  <p className="text-[11px] mt-1" style={{ color: "hsl(var(--destructive))" }}>
                    {log.error_message}
                  </p>
                )}
              </div>
            ))
          )}
        </main>
      )}

      {/* Confirmation modal */}
      {pendingConfirm && (
        <ConfirmModal
          toolName={pendingConfirm.toolName}
          toolInput={pendingConfirm.toolInput}
          onConfirm={handleConfirm}
          onCancel={handleCancelConfirm}
        />
      )}
    </div>
  );
}
