import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useGetConversation, useCreateConversation, getListConversationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Send, Sparkles, Zap, ChevronDown, Copy, Check,
  Paperclip, X, Download,
} from "lucide-react";
import { useAppContext, type Model } from "@/contexts/AppContext";
import PremiumModal from "@/components/PremiumModal";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

function getUserPrompt(): string {
  try { return localStorage.getItem("userSystemPrompt") || ""; }
  catch { return ""; }
}

const QWEN_MODEL: Model = "qwen/qwen2.5-vl-72b-instruct";

interface StreamMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  error?: boolean;
  imageUrl?: string;
  attachedImageUrl?: string;
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
  "qwen/qwen2.5-vl-72b-instruct": "Qwen 2.5 VL",
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

function compressImage(dataUrl: string, maxSizePx = 1024, quality = 0.82): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxSizePx || height > maxSizePx) {
        if (width > height) {
          height = Math.round(height * maxSizePx / width);
          width = maxSizePx;
        } else {
          width = Math.round(width * maxSizePx / height);
          height = maxSizePx;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div className="relative my-3 rounded-xl overflow-hidden text-sm"
      style={{ background: "hsl(230 20% 5%)", border: "1px solid hsl(230 14% 18%)" }}>
      <div className="flex items-center justify-between px-4 py-2"
        style={{ background: "hsl(230 18% 8%)", borderBottom: "1px solid hsl(230 14% 15%)" }}>
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "hsl(220 10% 45%)" }}>
          {lang || "code"}
        </span>
        <button onClick={handleCopy}
          className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium transition-all active:scale-90"
          style={{
            background: copied ? "hsl(142 62% 52% / 0.15)" : "hsl(230 14% 14%)",
            border: `1px solid ${copied ? "hsl(142 62% 52% / 0.3)" : "hsl(230 14% 20%)"}`,
            color: copied ? "hsl(142 62% 50%)" : "hsl(220 10% 55%)",
          }}>
          {copied ? <Check size={11} strokeWidth={2.5} /> : <Copy size={11} />}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3 text-[13px] leading-relaxed"
        style={{ margin: 0, color: "hsl(220 18% 82%)", fontFamily: "var(--app-font-mono)" }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

function buildMarkdownComponents(textColor: string): Components {
  return {
    code({ className, children, ...props }) {
      const isInline = !className;
      const lang = (className || "").replace("language-", "");
      const code = String(children).replace(/\n$/, "");
      if (!isInline) return <CodeBlock lang={lang} code={code} />;
      return (
        <code style={{
          background: "hsl(230 18% 13%)", color: "hsl(198 80% 70%)",
          padding: "1px 5px", borderRadius: "4px",
          fontFamily: "var(--app-font-mono)", fontSize: "0.85em",
          border: "1px solid hsl(230 14% 20%)",
        }} {...props}>{children}</code>
      );
    },
    h1({ children }) { return <h1 style={{ color: textColor, fontSize: "1.2em", fontWeight: 700, margin: "1em 0 0.4em", borderBottom: "1px solid hsl(var(--border))", paddingBottom: "0.3em" }}>{children}</h1>; },
    h2({ children }) { return <h2 style={{ color: textColor, fontSize: "1.1em", fontWeight: 600, margin: "0.9em 0 0.35em" }}>{children}</h2>; },
    h3({ children }) { return <h3 style={{ color: textColor, fontSize: "1em", fontWeight: 600, margin: "0.8em 0 0.3em" }}>{children}</h3>; },
    p({ children }) { return <p style={{ margin: "0.5em 0", lineHeight: 1.7, color: textColor }}>{children}</p>; },
    ul({ children }) { return <ul style={{ margin: "0.5em 0", paddingLeft: "1.4em", color: textColor, display: "flex", flexDirection: "column", gap: "0.2em" }}>{children}</ul>; },
    ol({ children }) { return <ol style={{ margin: "0.5em 0", paddingLeft: "1.4em", color: textColor, display: "flex", flexDirection: "column", gap: "0.2em" }}>{children}</ol>; },
    li({ children }) { return <li style={{ color: textColor, lineHeight: 1.65 }}>{children}</li>; },
    strong({ children }) { return <strong style={{ color: textColor, fontWeight: 700 }}>{children}</strong>; },
    em({ children }) { return <em style={{ color: textColor, fontStyle: "italic" }}>{children}</em>; },
    blockquote({ children }) {
      return <blockquote style={{ margin: "0.6em 0", paddingLeft: "0.9em", borderLeft: "3px solid hsl(252 82% 68% / 0.5)", color: "hsl(var(--muted-foreground))", fontStyle: "italic" }}>{children}</blockquote>;
    },
    hr() { return <hr style={{ border: "none", borderTop: "1px solid hsl(var(--border))", margin: "0.8em 0" }} />; },
    table({ children }) {
      return <div style={{ overflowX: "auto", margin: "0.6em 0" }}><table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.88em" }}>{children}</table></div>;
    },
    thead({ children }) { return <thead style={{ background: "hsl(var(--muted))" }}>{children}</thead>; },
    th({ children }) { return <th style={{ padding: "6px 10px", textAlign: "left", fontWeight: 600, color: textColor, border: "1px solid hsl(var(--border))", fontSize: "0.85em", whiteSpace: "nowrap" }}>{children}</th>; },
    td({ children }) { return <td style={{ padding: "5px 10px", color: textColor, border: "1px solid hsl(var(--border))", verticalAlign: "top" }}>{children}</td>; },
    tr({ children }) { return <tr>{children}</tr>; },
    a({ href, children }) { return <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "hsl(var(--primary))", textDecoration: "underline", textUnderlineOffset: "2px" }}>{children}</a>; },
  };
}

function MarkdownContent({ content, streaming }: { content: string; streaming?: boolean }) {
  const textColor = "hsl(var(--foreground))";
  const components = buildMarkdownComponents(textColor);
  return (
    <div style={{ fontSize: "0.875rem", lineHeight: 1.65 }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{content}</ReactMarkdown>
      {streaming && <span className="inline-block w-0.5 h-3.5 ml-0.5 align-middle rounded-full animate-pulse" style={{ background: "hsl(var(--primary))" }} />}
    </div>
  );
}

function DownloadButton({ imageUrl, prompt }: { imageUrl: string; prompt?: string }) {
  const [downloading, setDownloading] = useState(false);
  const handleDownload = async () => {
    setDownloading(true);
    try {
      const filename = `flux-${Date.now()}.png`;
      if (imageUrl.startsWith("data:")) {
        const a = document.createElement("a"); a.href = imageUrl; a.download = filename; a.click();
      } else {
        const res = await fetch(imageUrl);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
      }
    } catch { /* ignore */ } finally { setDownloading(false); }
  };
  return (
    <button onClick={handleDownload} disabled={downloading}
      title={prompt ? `Download: ${prompt}` : "Download image"}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all active:scale-90"
      style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))" }}>
      <Download size={12} />
      {downloading ? "Saving…" : "Download"}
    </button>
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
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [optimisticImage, setOptimisticImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const apiBase = import.meta.env.VITE_API_URL || "";

  const fetchSubStatus = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/subscription/status`, { headers: { "X-Client-ID": clientId } });
      if (res.ok) {
        const data = await res.json() as SubStatus;
        setSubStatus(data);
        if (data.status === "pending") setClaimSubmitted(true);
      }
    } catch { /* ignore */ }
  }, [clientId, apiBase]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("premium") === "1") { setShowPremium(true); setPremiumTriggeredByLimit(false); }
    fetchSubStatus();
  }, [fetchSubStatus]);

  useEffect(() => {
    if (conv?.messages) {
      setMessages(conv.messages.map(m => ({ id: String(m.id), role: m.role as "user" | "assistant", content: m.content, attachedImageUrl: (m as any).attachedImage ?? undefined, imageUrl: (m as any).generatedImageUrl ?? undefined })));
    }
  }, [conv]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, streamingText, optimisticUser]);

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
  const openPremium = (byLimit = false) => { setPremiumTriggeredByLimit(byLimit); setShowPremium(true); };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const raw = ev.target?.result as string;
      const compressed = await compressImage(raw);
      setAttachedImage(compressed);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const removeAttachedImage = () => setAttachedImage(null);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if ((!trimmed && !attachedImage) || isStreaming) return;
    if (isLimited) { openPremium(true); return; }

    const userMessage = trimmed;
    const capturedImage = attachedImage;
    setInput(""); setAttachedImage(null); setOptimisticImage(capturedImage); setIsStreaming(true); setStreamingText("");

    setOptimisticUser(userMessage);
    let targetId = convId;
    try {
      if (isNew) {
        const t = (userMessage.slice(0, 45) || "📷 Image") + (userMessage.length > 45 ? "…" : "");
        const result = await createConversation.mutateAsync({ data: { title: t }, headers: { "X-Client-ID": clientId } } as any);
        targetId = result.id;
        queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
      }
      abortRef.current = new AbortController();
      const res = await fetch(`${apiBase}/api/conversations/${targetId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Client-ID": clientId },
        body: JSON.stringify({ content: userMessage, model, userPrompt: getUserPrompt(), imageBase64: capturedImage || undefined }),
        signal: abortRef.current.signal,
      });
      if (res.status === 402) {
        await fetchSubStatus(); openPremium(true);
        setMessages(prev => [...prev, { id: Date.now().toString(), role: "user", content: userMessage, attachedImageUrl: capturedImage || undefined }]);
        return;
      }
      if (!res.ok) {
        const errText = await res.text().catch(() => "Server error");
        setMessages(prev => [...prev,
          { id: Date.now().toString(), role: "user", content: userMessage, attachedImageUrl: capturedImage || undefined },
          { id: (Date.now() + 1).toString(), role: "assistant", content: errText || "Server error. Please try again.", error: true },
        ]);
        return;
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "", full = "";
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
                setMessages(prev => [...prev, { id: Date.now().toString(), role: "user", content: userMessage, attachedImageUrl: capturedImage || undefined }, { id: (Date.now() + 1).toString(), role: "assistant", content: json.error, error: true }]);
                return;
              }
            } catch { /* ignore */ }
          }
        }
      }
      setMessages(prev => [...prev, { id: Date.now().toString(), role: "user", content: userMessage, attachedImageUrl: capturedImage || undefined }, { id: (Date.now() + 1).toString(), role: "assistant", content: full }]);
      fetchSubStatus();
      if (isNew && targetId) navigate(`/chat/${targetId}`, { replace: true });
    } catch (e: any) {
      if (e.name !== "AbortError") {
        setMessages(prev => [...prev, { id: Date.now().toString(), role: "user", content: userMessage, attachedImageUrl: capturedImage || undefined }, { id: (Date.now() + 1).toString(), role: "assistant", content: "Connection error. Please try again.", error: true }]);
      }
    } finally { setIsStreaming(false); setStreamingText(""); setOptimisticUser(""); setOptimisticImage(null); }
  }, [input, attachedImage, isStreaming, isLimited, convId, isNew, createConversation, queryClient, navigate, model, clientId, apiBase, fetchSubStatus]);

  const canSend = (input.trim().length > 0 || !!attachedImage) && !isStreaming;
  const msgCount = subStatus?.messageCount ?? 0;
  const isPremium = subStatus?.isActive ?? false;
  const isPending = subStatus?.status === "pending";
  return (
    <div className="flex flex-col h-dvh" style={{ background: "hsl(var(--background))" }}>

      <header className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
        style={{ background: "hsl(var(--sidebar))", borderBottom: "1px solid hsl(var(--border))" }}>
        <button onClick={() => navigate("/")}
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all active:scale-90"
          style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
          <ArrowLeft size={17} />
        </button>

        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: "linear-gradient(135deg, hsl(252 82% 68%), hsl(198 80% 56%))",
              boxShadow: "0 3px 12px hsl(252 82% 68% / 0.35)",
            }}>
            <Sparkles size={15} className="text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate leading-tight" style={{ color: "hsl(var(--foreground))" }}>
              {isNew ? "New Chat" : conv?.title || "Chat"}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Zap size={10} style={{ color: "hsl(var(--primary))" }} />
              <span className="text-[11px] font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>
                {MODEL_LABELS[model]}
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

        <div className="relative flex-shrink-0">
          <button onClick={e => { e.stopPropagation(); setShowModelMenu(v => !v); }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all active:scale-95"
            style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))" }}>
            {MODEL_LABELS[model]}
            <ChevronDown size={12} style={{ color: "hsl(var(--muted-foreground))" }} />
          </button>
          {showModelMenu && (
            <div className="absolute right-0 top-full mt-1.5 z-50 min-w-[170px] rounded-xl overflow-hidden"
              style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", boxShadow: "0 8px 24px rgba(0,0,0,0.25)" }}
              onClick={e => e.stopPropagation()}>
              {(["deepseek/deepseek-v4-flash", "deepseek/deepseek-v4-pro", QWEN_MODEL] as Model[]).map(m => {
                const isProLocked = (m === "deepseek/deepseek-v4-pro" || m === QWEN_MODEL) && !isPremium && !isPending;
                return (
                  <button key={m} onClick={() => {
                    if (isProLocked) { setShowModelMenu(false); openPremium(false); return; }
                    setModel(m); setShowModelMenu(false);
                  }}
                    className="w-full text-left px-3.5 py-2.5 text-xs font-medium transition-colors flex items-center justify-between gap-3"
                    style={{
                      color: model === m ? "hsl(var(--primary))" : isProLocked ? "hsl(var(--muted-foreground))" : "hsl(var(--foreground))",
                      background: model === m ? "hsl(var(--primary) / 0.08)" : "transparent",
                    }}
                    onMouseEnter={e => { if (model !== m) (e.currentTarget as HTMLElement).style.background = "hsl(var(--muted))"; }}
                    onMouseLeave={e => { if (model !== m) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                    <span>{MODEL_LABELS[m]}</span>
                    {m === "deepseek/deepseek-v4-flash" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: "hsl(142 62% 52% / 0.15)", color: "hsl(142 62% 45%)" }}>Free</span>
                    )}
                    {m === "deepseek/deepseek-v4-pro" && !isProLocked && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: "hsl(252 82% 68% / 0.15)", color: "hsl(var(--primary))" }}>Smart</span>
                    )}
                    {m === "deepseek/deepseek-v4-pro" && isProLocked && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: "hsl(45 90% 50% / 0.15)", color: "hsl(45 90% 40%)" }}>👑 Premium</span>
                    )}
                    {m === QWEN_MODEL && !isProLocked && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: "hsl(198 80% 56% / 0.15)", color: "hsl(198 80% 45%)" }}>Vision</span>
                    )}
                    {m === QWEN_MODEL && isProLocked && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: "hsl(45 90% 50% / 0.15)", color: "hsl(45 90% 40%)" }}>👑 Premium</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {!isNew && messages.length === 0 && !optimisticUser && (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Loading…</p>
          </div>
        )}

        {isNew && !optimisticUser && (
          <div className="flex flex-col items-center justify-center h-full gap-5 text-center px-4 pb-8">
            <div className="relative w-16 h-16 rounded-3xl flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, hsl(252 82% 68% / 0.15), hsl(198 80% 56% / 0.08))",
                border: "1px solid hsl(252 82% 68% / 0.25)",
              }}>
              <Sparkles size={26} style={{ color: "hsl(var(--primary))" }} />
            </div>
            <div>
              <p className="font-bold text-xl mb-2 tracking-tight" style={{ color: "hsl(var(--foreground))" }}>
                What's on your mind?
              </p>
              <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
                {MODEL_LABELS[model]} · Powered by OpenRouter
              </p>
            </div>
          </div>
        )}

        {messages.map(msg => (
          <MessageBubble key={msg.id} role={msg.role} content={msg.content} error={msg.error} imageUrl={msg.imageUrl} attachedImageUrl={msg.attachedImageUrl} />
        ))}
        {optimisticUser && <MessageBubble role="user" content={optimisticUser} attachedImageUrl={optimisticImage || undefined} />}

        {isStreaming && !streamingText && optimisticUser && (
          <div className="flex items-start gap-2.5">
            <AIAvatar />
            <div className="px-4 py-3 rounded-2xl rounded-bl-md flex items-center gap-2"
              style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--card-border, var(--border)))" }}>
              {[0, 0.15, 0.3].map((delay, i) => (
                <span key={i} className="typing-dot inline-block w-1.5 h-1.5 rounded-full"
                  style={{ background: "hsl(var(--muted-foreground))", animationDelay: `${delay}s` }} />
              ))}
              {optimisticImage && (
                <span className="text-xs ml-1" style={{ color: "hsl(var(--muted-foreground))" }}>
                  Analyzing image…
                </span>
              )}
            </div>
          </div>
        )}

        {isStreaming && streamingText && (
          <MessageBubble role="assistant" content={streamingText} streaming />
        )}

        <div ref={bottomRef} />
      </main>

      <footer className="flex-shrink-0 px-4 pb-4 pt-2">
        {!isPremium && !isPending && subStatus !== null && (
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
              {FREE_LIMIT - msgCount} / {FREE_LIMIT} messages today
            </span>
            <button onClick={() => openPremium(false)} className="text-[11px] font-semibold" style={{ color: "hsl(var(--primary))" }}>Upgrade →</button>
          </div>
        )}

        {isPending && (
          <div className="mb-3 px-3 py-2 rounded-xl flex items-center justify-center"
            style={{ background: "hsl(252 82% 68% / 0.06)", border: "1px solid hsl(252 82% 68% / 0.15)" }}>
            <span className="text-[11px] font-medium" style={{ color: "hsl(252 82% 60%)" }}>
              Payment pending — unlimited access activates once confirmed
            </span>
          </div>
        )}

        {isLimited ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3"
            style={{ background: "hsl(var(--muted) / 0.4)", border: "1px solid hsl(var(--border))" }}>
            <span className="text-sm flex-1" style={{ color: "hsl(var(--muted-foreground))" }}>Upgrade to send more messages</span>
            <button onClick={() => openPremium(true)}
              className="flex-shrink-0 px-4 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95"
              style={{ background: "linear-gradient(135deg, hsl(252 82% 68%), hsl(252 75% 60%))", color: "white", boxShadow: "0 3px 10px hsl(252 82% 68% / 0.35)" }}>
              Upgrade
            </button>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden transition-all"
            style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--card-border))" }}
            onFocusCapture={e => { e.currentTarget.style.borderColor = "hsl(252 82% 68% / 0.4)"; }}
            onBlurCapture={e => { e.currentTarget.style.borderColor = "hsl(var(--card-border))"; }}>

            {attachedImage && (
              <div className="px-3 pt-3 flex items-start gap-2">
                <div className="relative">
                  <img src={attachedImage} alt="Attached" className="w-16 h-16 rounded-lg object-cover"
                    style={{ border: "1px solid hsl(var(--border))" }} />
                  <button onClick={removeAttachedImage}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center"
                    style={{ background: "hsl(var(--foreground))", color: "hsl(var(--background))" }}>
                    <X size={9} strokeWidth={3} />
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-end gap-2 px-4 py-3">
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />

              <button onClick={() => fileInputRef.current?.click()} disabled={isStreaming} title="Attach image"
                className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-all active:scale-90"
                style={{
                  background: attachedImage ? "hsl(var(--primary) / 0.12)" : "hsl(var(--muted))",
                  border: `1px solid ${attachedImage ? "hsl(var(--primary) / 0.3)" : "hsl(var(--border))"}`,
                  color: attachedImage ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
                }}>
                <Paperclip size={14} />
              </button>

              <textarea ref={textareaRef} value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                disabled={isStreaming}
                placeholder="Message AI…"
                rows={1}
                className="flex-1 resize-none bg-transparent outline-none text-sm leading-relaxed py-0.5"
                style={{ color: "hsl(var(--foreground))", maxHeight: "160px", overflowY: "auto", fontFamily: "var(--app-font-sans)" }}
              />

              <button onClick={handleSend} disabled={!canSend}
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all active:scale-90"
                style={{
                  background: canSend ? "linear-gradient(135deg, hsl(252 82% 68%), hsl(252 75% 60%))" : "hsl(var(--muted))",
                  color: canSend ? "white" : "hsl(var(--muted-foreground))",
                  boxShadow: canSend ? "0 3px 12px hsl(252 82% 68% / 0.45)" : "none",
                }}>
                <Send size={15} strokeWidth={2} />
              </button>
            </div>
          </div>
        )}

        <p className="text-center text-[11px] mt-2" style={{ color: "hsl(var(--muted-foreground) / 0.5)" }}>
          {isLimited ? "Unlimited access from $29/mo" : "Enter to send · Shift+Enter for new line"}
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
      style={{
        background: "linear-gradient(135deg, hsl(252 82% 68% / 0.2), hsl(198 80% 56% / 0.1))",
        border: "1px solid hsl(252 82% 68% / 0.2)",
      }}>
      <Sparkles size={13} style={{ color: "hsl(var(--primary))" }} />
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { /* ignore */ }
  };
  return (
    <button onClick={handleCopy} title="Copy message"
      className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg transition-all active:scale-90 select-none"
      style={{
        background: copied ? "hsl(142 62% 52% / 0.12)" : "hsl(var(--muted))",
        border: `1px solid ${copied ? "hsl(142 62% 52% / 0.3)" : "hsl(var(--border))"}`,
        color: copied ? "hsl(142 62% 45%)" : "hsl(var(--muted-foreground))",
      }}>
      {copied ? <Check size={11} strokeWidth={2.5} /> : <Copy size={11} strokeWidth={2} />}
      <span className="text-[10px] font-medium leading-none">{copied ? "Copied!" : "Copy"}</span>
    </button>
  );
}

function MessageBubble({ role, content, streaming, error, imageUrl, attachedImageUrl }: {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  error?: boolean;
  imageUrl?: string;
  attachedImageUrl?: string;
}) {
  if (role === "user") {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="pr-1"><CopyButton text={content} /></div>
        {attachedImageUrl && (
          <img src={attachedImageUrl} alt="Attached" className="max-w-[200px] rounded-xl object-cover mb-1"
            style={{ border: "1px solid hsl(var(--border))" }} />
        )}
        {content && (
          <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-br-md text-sm leading-relaxed"
            style={{ background: "linear-gradient(135deg, hsl(252 82% 68%), hsl(252 75% 60%))", color: "white", boxShadow: "0 3px 14px hsl(252 82% 68% / 0.35)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {content}
          </div>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-end gap-2.5">
        <AIAvatar />
        <div className="flex flex-col gap-1 max-w-[85%]">
          <div className="px-4 py-3 rounded-2xl rounded-bl-md text-sm leading-relaxed"
            style={{ background: "hsl(var(--destructive) / 0.08)", border: "1px solid hsl(var(--destructive) / 0.25)", color: "hsl(var(--destructive))", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {content}
          </div>
        </div>
      </div>
    );
  }

  if (imageUrl) {
    return (
      <div className="flex items-start gap-2.5">
        <AIAvatar flux />
        <div className="flex flex-col gap-2 min-w-0 max-w-[85%]">
          <div className="rounded-2xl rounded-bl-md overflow-hidden"
            style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--card-border, var(--border)))" }}>
            <img src={imageUrl} alt={content} className="w-full block" style={{ maxWidth: "400px", display: "block" }} />
          </div>
          {content && <p className="text-[11px] px-1 leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>{content}</p>}
          <div className="pl-1"><DownloadButton imageUrl={imageUrl} prompt={content} /></div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5">
      <AIAvatar />
      <div className="flex flex-col gap-1 min-w-0 flex-1 max-w-[85%]">
        <div className="px-4 py-3 rounded-2xl rounded-bl-md"
          style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--card-border, var(--border)))" }}>
          <MarkdownContent content={content} streaming={streaming} />
        </div>
        {!streaming && <div className="pl-1"><CopyButton text={content} /></div>}
      </div>
    </div>
  );
}
