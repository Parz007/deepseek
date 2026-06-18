import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useGetConversation, useCreateConversation, getListConversationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Send, Sparkles, Zap, ChevronDown, Copy, Check, Crown } from "lucide-react";
import { useAppContext, type Model } from "@/contexts/AppContext";
import PremiumModal from "@/components/PremiumModal";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

interface StreamMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  error?: boolean;
}

interface SubStatus {
  status: string;
  plan: string | null;
  messageCount: number;
  limit: number;
  isActive: boolean;
}

const MODEL_LABELS: Record<Model, string> = {
  "deepseek/deepseek-v4-flash": "V4 Flash",
  "deepseek/deepseek-v4-pro": "V4 Pro",
};

const FREE_LIMIT = 20;

function getClientId(): string {
  let id = localStorage.getItem("clientId");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("clientId", id);
  }
  return id;
}

// ── Code block with copy button ───────────────────────────────────────────
function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div
      className="relative my-3 rounded-xl overflow-hidden text-sm"
      style={{ background: "hsl(230 20% 5%)", border: "1px solid hsl(230 14% 18%)" }}
    >
      {/* Header bar */}
      <div
        className="flex items-center justify-between px-4 py-2"
        style={{ background: "hsl(230 18% 8%)", borderBottom: "1px solid hsl(230 14% 15%)" }}
      >
        <span
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: "hsl(220 10% 45%)" }}
        >
          {lang || "code"}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium transition-all active:scale-90"
          style={{
            background: copied ? "hsl(142 62% 52% / 0.15)" : "hsl(230 14% 14%)",
            border: `1px solid ${copied ? "hsl(142 62% 52% / 0.3)" : "hsl(230 14% 20%)"}`,
            color: copied ? "hsl(142 62% 50%)" : "hsl(220 10% 55%)",
          }}
        >
          {copied ? <Check size={11} strokeWidth={2.5} /> : <Copy size={11} />}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      {/* Code content */}
      <pre
        className="overflow-x-auto px-4 py-3 text-[13px] leading-relaxed"
        style={{ margin: 0, color: "hsl(220 18% 82%)", fontFamily: "var(--app-font-mono)" }}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}

// ── Markdown renderer components ──────────────────────────────────────────
function buildMarkdownComponents(textColor: string): Components {
  return {
    // Code: inline vs block
    code({ className, children, ...props }) {
      const isInline = !className;
      const lang = (className || "").replace("language-", "");
      const code = String(children).replace(/\n$/, "");
      if (!isInline) {
        return <CodeBlock lang={lang} code={code} />;
      }
      return (
        <code
          style={{
            background: "hsl(230 18% 13%)",
            color: "hsl(198 80% 70%)",
            padding: "1px 5px",
            borderRadius: "4px",
            fontFamily: "var(--app-font-mono)",
            fontSize: "0.85em",
            border: "1px solid hsl(230 14% 20%)",
          }}
          {...props}
        >
          {children}
        </code>
      );
    },

    // Headings
    h1({ children }) {
      return (
        <h1 style={{ color: textColor, fontSize: "1.2em", fontWeight: 700, margin: "1em 0 0.4em", borderBottom: "1px solid hsl(var(--border))", paddingBottom: "0.3em" }}>
          {children}
        </h1>
      );
    },
    h2({ children }) {
      return (
        <h2 style={{ color: textColor, fontSize: "1.1em", fontWeight: 600, margin: "0.9em 0 0.35em" }}>
          {children}
        </h2>
      );
    },
    h3({ children }) {
      return (
        <h3 style={{ color: textColor, fontSize: "1em", fontWeight: 600, margin: "0.8em 0 0.3em" }}>
          {children}
        </h3>
      );
    },

    // Paragraph
    p({ children }) {
      return (
        <p style={{ margin: "0.5em 0", lineHeight: 1.7, color: textColor }}>
          {children}
        </p>
      );
    },

    // Lists
    ul({ children }) {
      return (
        <ul style={{ margin: "0.5em 0", paddingLeft: "1.4em", color: textColor, display: "flex", flexDirection: "column", gap: "0.2em" }}>
          {children}
        </ul>
      );
    },
    ol({ children }) {
      return (
        <ol style={{ margin: "0.5em 0", paddingLeft: "1.4em", color: textColor, display: "flex", flexDirection: "column", gap: "0.2em" }}>
          {children}
        </ol>
      );
    },
    li({ children }) {
      return (
        <li style={{ color: textColor, lineHeight: 1.65 }}>
          {children}
        </li>
      );
    },

    // Bold / italic
    strong({ children }) {
      return <strong style={{ color: textColor, fontWeight: 700 }}>{children}</strong>;
    },
    em({ children }) {
      return <em style={{ color: textColor, fontStyle: "italic" }}>{children}</em>;
    },

    // Blockquote
    blockquote({ children }) {
      return (
        <blockquote
          style={{
            margin: "0.6em 0",
            paddingLeft: "0.9em",
            borderLeft: "3px solid hsl(252 82% 68% / 0.5)",
            color: "hsl(var(--muted-foreground))",
            fontStyle: "italic",
          }}
        >
          {children}
        </blockquote>
      );
    },

    // Horizontal rule
    hr() {
      return <hr style={{ border: "none", borderTop: "1px solid hsl(var(--border))", margin: "0.8em 0" }} />;
    },

    // Table
    table({ children }) {
      return (
        <div style={{ overflowX: "auto", margin: "0.6em 0" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.88em" }}>
            {children}
          </table>
        </div>
      );
    },
    thead({ children }) {
      return <thead style={{ background: "hsl(var(--muted))" }}>{children}</thead>;
    },
    th({ children }) {
      return (
        <th
          style={{
            padding: "6px 10px",
            textAlign: "left",
            fontWeight: 600,
            color: textColor,
            border: "1px solid hsl(var(--border))",
            fontSize: "0.85em",
            whiteSpace: "nowrap",
          }}
        >
          {children}
        </th>
      );
    },
    td({ children }) {
      return (
        <td
          style={{
            padding: "5px 10px",
            color: textColor,
            border: "1px solid hsl(var(--border))",
            verticalAlign: "top",
          }}
        >
          {children}
        </td>
      );
    },
    tr({ children }) {
      return <tr>{children}</tr>;
    },

    // Links
    a({ href, children }) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "hsl(var(--primary))", textDecoration: "underline", textUnderlineOffset: "2px" }}
        >
          {children}
        </a>
      );
    },
  };
}

// ── Markdown message renderer ─────────────────────────────────────────────
function MarkdownContent({ content, streaming }: { content: string; streaming?: boolean }) {
  const textColor = "hsl(var(--foreground))";
  const components = buildMarkdownComponents(textColor);

  return (
    <div style={{ fontSize: "0.875rem", lineHeight: 1.65 }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
      {streaming && (
        <span
          className="inline-block w-0.5 h-3.5 ml-0.5 align-middle rounded-full animate-pulse"
          style={{ background: "hsl(var(--primary))" }}
        />
      )}
    </div>
  );
}

export default function Chat() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { model, setModel } = useAppContext();
  const isNew = !params.id || params.id === "new";
  const convId = isNew ? null : parseInt(params.id, 10);

  const clientId = getClientId();

  const { data: conv } = useGetConversation(convId!, { query: { enabled: !!convId } });
  const createConversation = useCreateConversation();

  const [messages, setMessages] = useState<StreamMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [optimisticUser, setOptimisticUser] = useState("");
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showPremium, setShowPremium] = useState(false);
  const [premiumTriggeredByLimit, setPremiumTriggeredByLimit] = useState(false);
  const [subStatus, setSubStatus] = useState<SubStatus | null>(null);
  const [claimSubmitted, setClaimSubmitted] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const apiBase = import.meta.env.VITE_API_URL || "";

  const fetchSubStatus = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/subscription/status`, {
        headers: { "X-Client-ID": clientId },
      });
      if (res.ok) {
        const data = await res.json() as SubStatus;
        setSubStatus(data);
        if (data.status === "pending") setClaimSubmitted(true);
      }
    } catch { /* ignore */ }
  }, [clientId, apiBase]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("premium") === "1") {
      setShowPremium(true);
      setPremiumTriggeredByLimit(false);
    }
    fetchSubStatus();
  }, [fetchSubStatus]);

  useEffect(() => {
    if (conv?.messages) {
      setMessages(conv.messages.map(m => ({
        id: String(m.id),
        role: m.role as "user" | "assistant",
        content: m.content,
      })));
    }
  }, [conv]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText, optimisticUser]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, [input]);

  useEffect(() => {
    if (!showModelMenu) return;
    const handler = () => setShowModelMenu(false);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [showModelMenu]);

  const isLimited = subStatus !== null && !subStatus.isActive && subStatus.messageCount >= FREE_LIMIT;

  const openPremium = (byLimit = false) => {
    setPremiumTriggeredByLimit(byLimit);
    setShowPremium(true);
  };

  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming) return;
    if (isLimited) { openPremium(true); return; }

    const userMessage = input.trim();
    setInput("");
    setOptimisticUser(userMessage);
    setIsStreaming(true);
    setStreamingText("");

    let targetId = convId;
    try {
      if (isNew) {
        const t = userMessage.slice(0, 45) + (userMessage.length > 45 ? "…" : "");
        const result = await createConversation.mutateAsync({
          data: { title: t },
          headers: { "X-Client-ID": clientId },
        } as any);
        targetId = result.id;
        queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
      }

      abortRef.current = new AbortController();
      const res = await fetch(`${apiBase}/api/conversations/${targetId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Client-ID": clientId },
        body: JSON.stringify({ content: userMessage, model }),
        signal: abortRef.current.signal,
      });

      if (res.status === 402) {
        await fetchSubStatus();
        openPremium(true);
        setMessages(prev => [...prev,
          { id: Date.now().toString(), role: "user", content: userMessage },
        ]);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop()!;
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const json = JSON.parse(line.slice(6));
              if (json.content) { full += json.content; setStreamingText(full); }
              if (json.error) {
                setMessages(prev => [...prev,
                  { id: Date.now().toString(), role: "user", content: userMessage },
                  { id: (Date.now() + 1).toString(), role: "assistant", content: json.error, error: true },
                ]);
                return;
              }
            } catch { /* ignore */ }
          }
        }
      }

      setMessages(prev => [...prev,
        { id: Date.now().toString(), role: "user", content: userMessage },
        { id: (Date.now() + 1).toString(), role: "assistant", content: full },
      ]);
      fetchSubStatus();
      if (isNew && targetId) navigate(`/chat/${targetId}`, { replace: true });
    } catch (e: any) {
      if (e.name !== "AbortError") {
        setMessages(prev => [...prev,
          { id: Date.now().toString(), role: "user", content: userMessage },
          { id: (Date.now() + 1).toString(), role: "assistant", content: "Connection error. Please try again.", error: true },
        ]);
      }
    } finally {
      setIsStreaming(false);
      setStreamingText("");
      setOptimisticUser("");
    }
  }, [input, isStreaming, isLimited, convId, isNew, createConversation, queryClient, navigate, model, clientId, apiBase, fetchSubStatus]);

  const canSend = input.trim().length > 0 && !isStreaming;
  const msgCount = subStatus?.messageCount ?? 0;
  const isPremium = subStatus?.isActive ?? false;
  const isPending = subStatus?.status === "pending";

  return (
    <div className="flex flex-col h-dvh" style={{ background: "hsl(var(--background))" }}>

      {/* ── Header ── */}
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

        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "linear-gradient(135deg, hsl(252 82% 68%), hsl(198 80% 56%))", boxShadow: "0 3px 12px hsl(252 82% 68% / 0.35)" }}
          >
            <Sparkles size={15} className="text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate leading-tight" style={{ color: "hsl(var(--foreground))" }}>
              {isNew ? "New Chat" : conv?.title || "Chat"}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Zap size={10} style={{ color: "hsl(var(--primary))" }} />
              <span className="text-[11px] font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>
                DeepSeek {MODEL_LABELS[model]}
              </span>
              {isStreaming && (
                <span className="flex gap-0.5 ml-1">
                  {[0, 0.15, 0.3].map((delay, i) => (
                    <span key={i} className="typing-dot inline-block w-1 h-1 rounded-full"
                      style={{ background: "hsl(var(--primary))", animationDelay: `${delay}s` }} />
                  ))}
                </span>
              )}
            </div>
          </div>
        </div>

        {isPremium ? (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl flex-shrink-0"
            style={{ background: "hsl(45 90% 50% / 0.15)", border: "1px solid hsl(45 90% 50% / 0.3)" }}>
            <Crown size={12} style={{ color: "hsl(45 90% 45%)" }} />
            <span className="text-[11px] font-bold" style={{ color: "hsl(45 90% 40%)" }}>
              {subStatus?.plan === "lifetime" ? "Lifetime" : "Pro"}
            </span>
          </div>
        ) : (
          <button
            onClick={() => openPremium(isLimited)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl flex-shrink-0 font-bold text-xs transition-all active:scale-95"
            style={{
              background: isPending
                ? "hsl(var(--muted))"
                : "linear-gradient(135deg, hsl(45 90% 50%), hsl(35 95% 55%))",
              color: isPending ? "hsl(var(--muted-foreground))" : "white",
              boxShadow: isPending ? "none" : "0 2px 10px hsl(45 90% 50% / 0.4)",
            }}
          >
            <Crown size={12} />
            {isPending ? "Pending…" : "Join Premium"}
          </button>
        )}

        {/* Model selector */}
        <div className="relative flex-shrink-0">
          <button
            onClick={e => { e.stopPropagation(); setShowModelMenu(v => !v); }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all active:scale-95"
            style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))" }}
          >
            {MODEL_LABELS[model]}
            <ChevronDown size={12} style={{ color: "hsl(var(--muted-foreground))" }} />
          </button>
          {showModelMenu && (
            <div
              className="absolute right-0 top-full mt-1.5 z-50 min-w-[160px] rounded-xl overflow-hidden"
              style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", boxShadow: "0 8px 24px rgba(0,0,0,0.25)" }}
              onClick={e => e.stopPropagation()}
            >
              {(["deepseek/deepseek-v4-flash", "deepseek/deepseek-v4-pro"] as Model[]).map(m => (
                <button
                  key={m}
                  onClick={() => { setModel(m); setShowModelMenu(false); }}
                  className="w-full text-left px-3.5 py-2.5 text-xs font-medium transition-colors flex items-center justify-between gap-3"
                  style={{
                    color: model === m ? "hsl(var(--primary))" : "hsl(var(--foreground))",
                    background: model === m ? "hsl(var(--primary) / 0.08)" : "transparent",
                  }}
                  onMouseEnter={e => { if (model !== m) (e.currentTarget as HTMLElement).style.background = "hsl(var(--muted))"; }}
                  onMouseLeave={e => { if (model !== m) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <span>{MODEL_LABELS[m]}</span>
                  {m === "deepseek/deepseek-v4-flash" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: "hsl(142 62% 52% / 0.15)", color: "hsl(142 62% 45%)" }}>Fast</span>
                  )}
                  {m === "deepseek/deepseek-v4-pro" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: "hsl(252 82% 68% / 0.15)", color: "hsl(var(--primary))" }}>Smart</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* ── Messages ── */}
      <main className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {!isNew && messages.length === 0 && !optimisticUser && (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Loading…</p>
          </div>
        )}

        {isNew && !optimisticUser && (
          <div className="flex flex-col items-center justify-center h-full gap-5 text-center px-4 pb-8">
            <div
              className="relative w-16 h-16 rounded-3xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, hsl(252 82% 68% / 0.15), hsl(198 80% 56% / 0.08))", border: "1px solid hsl(252 82% 68% / 0.25)" }}
            >
              <Sparkles size={26} style={{ color: "hsl(var(--primary))" }} />
            </div>
            <div>
              <p className="font-bold text-xl mb-2 tracking-tight" style={{ color: "hsl(var(--foreground))" }}>
                What's on your mind?
              </p>
              <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
                DeepSeek {MODEL_LABELS[model]} · Powered by OpenRouter
              </p>
              {!isPremium && (
                <p className="text-xs mt-2" style={{ color: "hsl(var(--muted-foreground) / 0.7)" }}>
                  {isLimited
                    ? <><span style={{ color: "hsl(var(--destructive))" }}>Free limit reached.</span> <button onClick={() => openPremium(true)} style={{ color: "hsl(var(--primary))", textDecoration: "underline" }}>Upgrade to continue</button></>
                    : `${FREE_LIMIT - msgCount} free questions remaining`}
                </p>
              )}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <MessageBubble key={msg.id} role={msg.role} content={msg.content} error={msg.error} />
        ))}

        {optimisticUser && <MessageBubble role="user" content={optimisticUser} />}

        {isStreaming && streamingText && (
          <MessageBubble role="assistant" content={streamingText} streaming />
        )}

        {isStreaming && !streamingText && optimisticUser && (
          <div className="flex items-end gap-2.5">
            <AIAvatar />
            <div className="px-4 py-3 rounded-2xl rounded-bl-sm"
              style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--card-border))" }}>
              <div className="flex gap-1 items-center h-4">
                {[0, 0.18, 0.36].map((delay, i) => (
                  <span key={i} className="typing-dot w-1.5 h-1.5 rounded-full"
                    style={{ background: "hsl(var(--muted-foreground))", animationDelay: `${delay}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}

        {isLimited && !isStreaming && (
          <div
            className="flex flex-col items-center gap-3 py-5 px-4 rounded-2xl mx-auto max-w-sm text-center"
            style={{ background: "hsl(252 82% 68% / 0.06)", border: "1px solid hsl(252 82% 68% / 0.2)" }}
          >
            <Crown size={22} style={{ color: "hsl(45 90% 45%)" }} />
            <div>
              <p className="font-semibold text-sm mb-1" style={{ color: "hsl(var(--foreground))" }}>
                {isPending ? "Payment under review" : "Free limit reached"}
              </p>
              <p className="text-xs leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
                {isPending
                  ? "Your payment is pending approval. Check back soon."
                  : "You've used all 20 free questions. Upgrade to continue."}
              </p>
            </div>
            {!isPending && (
              <button
                onClick={() => openPremium(true)}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95"
                style={{ background: "linear-gradient(135deg, hsl(252 82% 68%), hsl(252 75% 60%))", color: "white", boxShadow: "0 4px 16px hsl(252 82% 68% / 0.4)" }}
              >
                Upgrade — $29/mo or $199 lifetime
              </button>
            )}
          </div>
        )}

        <div ref={bottomRef} />
      </main>

      {/* ── Input ── */}
      <footer
        className="flex-shrink-0 px-4 pt-3 pb-6"
        style={{ background: "hsl(var(--background))", borderTop: "1px solid hsl(var(--border))" }}
      >
        {/* ── Sticky message count bar (free users only) ── */}
        {!isPremium && !isLimited && (
          <div
            className="mb-3 px-3 py-2 rounded-xl flex items-center gap-2.5"
            style={{
              background: msgCount >= 16
                ? "hsl(35 95% 52% / 0.12)"
                : "hsl(var(--muted) / 0.5)",
              border: `1px solid ${msgCount >= 16 ? "hsl(35 95% 52% / 0.35)" : "hsl(var(--border))"}`,
            }}
          >
            {/* Progress bar */}
            <div className="flex-1 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span
                  className="text-[11px] font-semibold"
                  style={{ color: msgCount >= 16 ? "hsl(35 90% 42%)" : "hsl(var(--muted-foreground))" }}
                >
                  {FREE_LIMIT - msgCount} free message{FREE_LIMIT - msgCount === 1 ? "" : "s"} left
                </span>
                <span className="text-[10px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                  {msgCount}/{FREE_LIMIT}
                </span>
              </div>
              <div
                className="h-1.5 rounded-full overflow-hidden"
                style={{ background: "hsl(var(--border))" }}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${(msgCount / FREE_LIMIT) * 100}%`,
                    background: msgCount >= 16
                      ? "linear-gradient(90deg, hsl(35 95% 52%), hsl(10 85% 55%))"
                      : "linear-gradient(90deg, hsl(252 82% 68%), hsl(198 80% 56%))",
                    animation: msgCount >= 16 ? "pulse 1.6s ease-in-out infinite" : "none",
                  }}
                />
              </div>
            </div>
            {/* Upgrade nudge button */}
            {msgCount >= 10 && (
              <button
                onClick={() => openPremium(false)}
                className="flex-shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all active:scale-95 whitespace-nowrap"
                style={{
                  background: msgCount >= 16
                    ? "linear-gradient(135deg, hsl(45 90% 50%), hsl(35 95% 55%))"
                    : "hsl(252 82% 68% / 0.15)",
                  color: msgCount >= 16 ? "white" : "hsl(252 82% 60%)",
                  boxShadow: msgCount >= 16 ? "0 2px 8px hsl(45 90% 50% / 0.4)" : "none",
                }}
              >
                Upgrade
              </button>
            )}
          </div>
        )}
        {isPending && (
          <div
            className="mb-3 px-3 py-2 rounded-xl flex items-center gap-2"
            style={{ background: "hsl(252 82% 68% / 0.08)", border: "1px solid hsl(252 82% 68% / 0.2)" }}
          >
            <Crown size={12} style={{ color: "hsl(252 82% 68%)" }} />
            <span className="text-[11px] font-medium" style={{ color: "hsl(252 82% 60%)" }}>
              Approval pending — you'll get unlimited access once confirmed
            </span>
          </div>
        )}
        <div
          className="flex items-end gap-2.5 rounded-2xl px-4 py-3 transition-all"
          style={{
            background: "hsl(var(--card))",
            border: `1px solid ${isLimited ? "hsl(var(--destructive) / 0.3)" : "hsl(var(--card-border))"}`,
            opacity: isLimited ? 0.8 : 1,
          }}
          onFocusCapture={e => { if (!isLimited) e.currentTarget.style.borderColor = "hsl(252 82% 68% / 0.4)"; }}
          onBlurCapture={e => { if (!isLimited) e.currentTarget.style.borderColor = isLimited ? "hsl(var(--destructive) / 0.3)" : "hsl(var(--card-border))"; }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); isLimited ? openPremium(true) : handleSend(); } }}
            disabled={isStreaming}
            placeholder={isLimited ? "Upgrade to send more messages…" : "Message DeepSeek…"}
            rows={1}
            className="flex-1 resize-none bg-transparent outline-none text-sm leading-relaxed py-0.5"
            style={{ color: "hsl(var(--foreground))", maxHeight: "160px", overflowY: "auto", fontFamily: "var(--app-font-sans)" }}
          />
          <button
            onClick={isLimited ? () => openPremium(true) : handleSend}
            disabled={!isLimited && !canSend}
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all active:scale-90"
            style={{
              background: isLimited
                ? "linear-gradient(135deg, hsl(45 90% 50%), hsl(35 95% 55%))"
                : canSend ? "linear-gradient(135deg, hsl(252 82% 68%), hsl(252 75% 60%))" : "hsl(var(--muted))",
              color: (isLimited || canSend) ? "white" : "hsl(var(--muted-foreground))",
              boxShadow: isLimited ? "0 3px 12px hsl(45 90% 50% / 0.45)" : canSend ? "0 3px 12px hsl(252 82% 68% / 0.45)" : "none",
            }}
          >
            {isLimited ? <Crown size={15} /> : <Send size={15} strokeWidth={2} />}
          </button>
        </div>
        <p className="text-center text-[11px] mt-2" style={{ color: "hsl(var(--muted-foreground) / 0.5)" }}>
          {isLimited ? "Free limit reached · Upgrade for unlimited access" : "Enter to send · Shift+Enter for new line"}
        </p>
      </footer>

      {showPremium && (
        <PremiumModal
          clientId={clientId}
          onClose={() => { setShowPremium(false); fetchSubStatus(); }}
          onClaimSubmitted={() => { setClaimSubmitted(true); fetchSubStatus(); }}
          claimStatus={claimSubmitted || isPending ? "pending" : "idle"}
          triggeredByLimit={premiumTriggeredByLimit}
        />
      )}
    </div>
  );
}

function AIAvatar() {
  return (
    <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
      style={{ background: "linear-gradient(135deg, hsl(252 82% 68% / 0.2), hsl(198 80% 56% / 0.1))", border: "1px solid hsl(252 82% 68% / 0.2)" }}>
      <Sparkles size={13} style={{ color: "hsl(var(--primary))" }} />
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* ignore */ }
  };
  return (
    <button
      onClick={handleCopy}
      title="Copy message"
      className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg transition-all active:scale-90 select-none"
      style={{
        background: copied ? "hsl(142 62% 52% / 0.12)" : "hsl(var(--muted))",
        border: `1px solid ${copied ? "hsl(142 62% 52% / 0.3)" : "hsl(var(--border))"}`,
        color: copied ? "hsl(142 62% 45%)" : "hsl(var(--muted-foreground))",
      }}
    >
      {copied ? <Check size={11} strokeWidth={2.5} /> : <Copy size={11} strokeWidth={2} />}
      <span className="text-[10px] font-medium leading-none">{copied ? "Copied!" : "Copy"}</span>
    </button>
  );
}

function MessageBubble({ role, content, streaming, error }: {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  error?: boolean;
}) {
  if (role === "user") {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="pr-1">
          <CopyButton text={content} />
        </div>
        <div
          className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-br-md text-sm leading-relaxed"
          style={{
            background: "linear-gradient(135deg, hsl(252 82% 68%), hsl(252 75% 60%))",
            color: "white",
            boxShadow: "0 3px 14px hsl(252 82% 68% / 0.35)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {content}
        </div>
      </div>
    );
  }

  // Error message — plain text, no markdown
  if (error) {
    return (
      <div className="flex items-end gap-2.5">
        <AIAvatar />
        <div className="flex flex-col gap-1 max-w-[85%]">
          <div
            className="px-4 py-3 rounded-2xl rounded-bl-md text-sm leading-relaxed"
            style={{
              background: "hsl(var(--destructive) / 0.08)",
              border: "1px solid hsl(var(--destructive) / 0.25)",
              color: "hsl(var(--destructive))",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {content}
          </div>
        </div>
      </div>
    );
  }

  // AI message — markdown rendered
  return (
    <div className="flex items-start gap-2.5">
      <AIAvatar />
      <div className="flex flex-col gap-1 min-w-0 flex-1 max-w-[85%]">
        <div
          className="px-4 py-3 rounded-2xl rounded-bl-md"
          style={{
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--card-border, var(--border)))",
          }}
        >
          <MarkdownContent content={content} streaming={streaming} />
        </div>
        {!streaming && (
          <div className="pl-1">
            <CopyButton text={content} />
          </div>
        )}
      </div>
    </div>
  );
}
