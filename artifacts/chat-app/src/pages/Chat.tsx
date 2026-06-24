import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetConversation, useListConversations, useDeleteConversation,
  getGetConversationQueryKey, getListConversationsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
 import {
    ArrowLeft, Send, ChevronDown, ChevronRight, Copy, Check,
    Paperclip, X, Download, Lock, Crown, Loader2, Square,
    Mic, MicOff, RotateCcw, Plus, Settings, Trash2, MessageSquare,
    ChevronUp, Sun, Moon, Share2,
  } from "lucide-react";
import { useAppContext, type Model } from "@/contexts/AppContext";
import PremiumModal from "@/components/PremiumModal";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SseEvent {
  type: "token" | "thinking" | "status" | "tool_status" | "done" | "error";
  content?: string;
  text?: string;
  label?: string;
  tool?: string;
  query?: string;
  url?: string;
  done?: boolean;
  message?: string;
}

interface StatusStep {
  text: string;
  done: boolean;
}

interface StreamMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
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

// ── Constants ─────────────────────────────────────────────────────────────────

const FREE_LIMIT = 20;
const MAX_IMAGES = 1;
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

const MODEL_LABELS: Record<Model, string> = {
  "deepseek/deepseek-v4-flash": "V4 Flash",
  "deepseek/deepseek-v4-pro": "V4 Pro",
};

// Public-folder whale video (same path used in SplashScreen)
const WHALE_SRC = "/A_sleek_blue_and_white_3D_whale_smoothly_swings_and_sways_with_graceful.webm";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getUserPrompt(): string {
  try { return localStorage.getItem("userSystemPrompt") || ""; }
  catch { return ""; }
}

function compressImage(dataUrl: string, maxSizePx = 1024, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxSizePx || height > maxSizePx) {
        if (width > height) { height = Math.round(height * maxSizePx / width); width = maxSizePx; }
        else { width = Math.round(width * maxSizePx / height); height = maxSizePx; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(dataUrl); return; }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = dataUrl;
  });
}

// ── useStickToBottom ──────────────────────────────────────────────────────────
// Pins scroll to the bottom while the user hasn't scrolled up.
// Only auto-scrolls when isPinnedRef.current === true.

function useStickToBottom(containerRef: React.RefObject<HTMLDivElement | null>) {
  const isPinnedRef = useRef(true);
  const [showJump, setShowJump] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      isPinnedRef.current = atBottom;
      setShowJump(!atBottom);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [containerRef]);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "instant" });
    isPinnedRef.current = true;
    setShowJump(false);
  }, [containerRef]);

  return { isPinnedRef, showJump, scrollToBottom };
}

// ── useSpeechRecognition ──────────────────────────────────────────────────────

function useSpeechRecognition(onResult: (text: string) => void) {
  const [isRecording, setIsRecording] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  const isSupported = typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const startRecording = useCallback(() => {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (e: any) => {
      const text = Array.from(e.results as SpeechRecognitionResultList)
        .map((r: SpeechRecognitionResult) => r[0].transcript).join("");
      onResult(text);
    };
    rec.onerror = (e: any) => {
      setMicError(e.error === "not-allowed" ? "Microphone access denied" : "Voice input error");
      setIsRecording(false);
    };
    rec.onend = () => setIsRecording(false);
    rec.start();
    recognitionRef.current = rec;
    setIsRecording(true);
    setMicError(null);
  }, [onResult]);

  const stopRecording = useCallback(() => {
    recognitionRef.current?.stop();
    setIsRecording(false);
  }, []);

  useEffect(() => () => recognitionRef.current?.abort(), []);

  return { isSupported, isRecording, micError, startRecording, stopRecording };
}

// ── Code block ────────────────────────────────────────────────────────────────

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
        <span className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: "hsl(220 10% 45%)" }}>
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

// ── Markdown renderer ─────────────────────────────────────────────────────────

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
      return <blockquote style={{ margin: "0.6em 0", paddingLeft: "0.9em", borderLeft: "3px solid hsl(var(--primary) / 0.5)", color: "hsl(var(--muted-foreground))", fontStyle: "italic" }}>{children}</blockquote>;
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
      {streaming && <span className="inline-block w-0.5 h-3.5 ml-0.5 align-middle rounded-full animate-pulse"
        style={{ background: "hsl(var(--primary))" }} />}
    </div>
  );
}

// ── Thinking block ────────────────────────────────────────────────────────────
// Auto-collapses when streaming ends; shows elapsed seconds in label.

function ThinkingBlock({ content, streaming }: { content: string; streaming?: boolean }) {
  const [open, setOpen] = useState(true);
  const startRef = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // Record start time on first thinking chunk
  useEffect(() => {
    if (streaming && content && !startRef.current) {
      startRef.current = Date.now();
    }
  }, [streaming, content]);

  // When streaming ends: record elapsed, collapse
  useEffect(() => {
    if (!streaming && startRef.current) {
      setElapsed(Math.round((Date.now() - startRef.current) / 1000));
      setOpen(false);
    }
  }, [streaming]);

  if (!content && !streaming) return null;

  const isOpen = streaming ? true : open;
  const label = streaming ? "Thinking…" : `Thought for ${elapsed}s`;

  return (
    <div className="mb-3" style={{ borderLeft: "2px solid hsl(var(--border))", paddingLeft: "0.75rem" }}>
      <button onClick={() => !streaming && setOpen(v => !v)}
        className="flex items-center gap-1.5 mb-1 w-full text-left"
        style={{ cursor: streaming ? "default" : "pointer" }}>
        {streaming
          ? <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 thinking-pulse"
              style={{ background: "hsl(var(--primary))" }} />
          : <ChevronRight size={11} style={{
              color: "hsl(var(--muted-foreground))",
              transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 0.15s",
              flexShrink: 0,
            }} />}
        <span className="text-[11px] font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>
          {label}
        </span>
      </button>
      <div style={{
        overflow: "hidden",
        maxHeight: isOpen ? "600px" : "0",
        transition: "max-height 0.25s ease",
        opacity: isOpen ? 1 : 0,
      }}>
        <div className="text-[12px] leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
          <MarkdownContent content={content} streaming={streaming} />
        </div>
      </div>
    </div>
  );
}

// ── Status steps ──────────────────────────────────────────────────────────────

function StatusSteps({ steps }: { steps: StatusStep[] }) {
  return (
    <div className="flex flex-col gap-1 py-0.5">
      {steps.map((step, i) => (
        <div key={i} className="flex items-center gap-2">
          {step.done
            ? <Check size={11} style={{ color: "hsl(142 52% 48%)", flexShrink: 0 }} strokeWidth={2.5} />
            : <Loader2 size={11} className="animate-spin flex-shrink-0" style={{ color: "hsl(var(--muted-foreground))" }} />}
          <span className="text-[11px]" style={{ color: step.done ? "hsl(var(--muted-foreground))" : "hsl(var(--foreground))" }}>
            {step.text}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Download button ───────────────────────────────────────────────────────────

function DownloadButton({ imageUrl, prompt }: { imageUrl: string; prompt: string }) {
  const [downloading, setDownloading] = useState(false);
  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch(imageUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${prompt.slice(0, 40).replace(/[^a-z0-9]/gi, "_")}.png`;
      a.click(); URL.revokeObjectURL(url);
    } catch { /* ignore */ }
    finally { setDownloading(false); }
  };
  return (
    <button onClick={handleDownload} disabled={downloading}
      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-all active:scale-90"
      style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
      {downloading ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
      {downloading ? "Saving…" : "Download"}
    </button>
  );
}

// ── Usage bar ─────────────────────────────────────────────────────────────────

function UsageBar({ used, limit, onUpgrade }: { used: number; limit: number; onUpgrade: () => void }) {
  const pct = Math.min((used / limit) * 100, 100);
  const isHigh = pct >= 80;
  return (
    <div className="mb-2 px-1">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>
          {used} / {limit} free messages
        </span>
        <button onClick={onUpgrade}
          className="text-[10px] font-semibold underline transition-colors"
          style={{ color: "hsl(var(--primary))" }}>
          Upgrade
        </button>
      </div>
      <div className="h-0.5 rounded-full overflow-hidden" style={{ background: "hsl(var(--border))" }}>
        <div className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            background: isHigh ? "hsl(var(--destructive))" : "hsl(var(--primary))",
          }} />
      </div>
    </div>
  );
}

// ── Limit reached banner ──────────────────────────────────────────────────────

function LimitReachedBanner({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <div className="mb-3 px-4 py-3 rounded-xl"
      style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))" }}>
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: "hsl(var(--border))" }}>
          <Lock size={13} style={{ color: "hsl(var(--muted-foreground))" }} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight" style={{ color: "hsl(var(--foreground))" }}>
            You've used all {FREE_LIMIT} free messages today
          </p>
          <p className="text-[11px] mt-0.5 leading-snug" style={{ color: "hsl(var(--muted-foreground))" }}>
            Resets at midnight UTC · Upgrade for unlimited access
          </p>
        </div>
      </div>
      <button onClick={onUpgrade}
        className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-[0.98]"
        style={{ background: "hsl(var(--foreground))", color: "hsl(var(--background))" }}>
        <span className="flex items-center justify-center gap-1.5">
          <Crown size={13} />
          Get Unlimited — from $29/mo
        </span>
      </button>
    </div>
  );
}

// ── AI avatar ─────────────────────────────────────────────────────────────────
// Shows an animated whale video while streaming; a flat monochrome "D" at rest.

function AIAvatar({ isStreaming }: { isStreaming?: boolean }) {
  if (isStreaming) {
    return (
      <div className="w-8 h-8 rounded-xl overflow-hidden flex-shrink-0"
        style={{ border: "1px solid hsl(var(--border))" }}>
        <video autoPlay loop muted playsInline className="w-full h-full object-cover">
          <source src={WHALE_SRC} type="video/webm" />
        </video>
      </div>
    );
  }
  return (
    <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold select-none"
      style={{ background: "hsl(var(--muted))", color: "hsl(var(--foreground))", border: "1px solid hsl(var(--border))" }}>
      D
    </div>
  );
}

// ── Copy button ───────────────────────────────────────────────────────────────

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
        background: "transparent",
        border: `1px solid ${copied ? "hsl(142 62% 52% / 0.4)" : "transparent"}`,
        color: copied ? "hsl(142 62% 45%)" : "hsl(var(--muted-foreground))",
      }}
      onMouseEnter={e => {
        if (!copied) {
          (e.currentTarget as HTMLElement).style.borderColor = "hsl(var(--border))";
          (e.currentTarget as HTMLElement).style.background = "hsl(var(--muted))";
        }
      }}
      onMouseLeave={e => {
        if (!copied) {
          (e.currentTarget as HTMLElement).style.borderColor = "transparent";
          (e.currentTarget as HTMLElement).style.background = "transparent";
        }
      }}>
      {copied ? <Check size={11} strokeWidth={2.5} /> : <Copy size={11} strokeWidth={2} />}
      <span className="text-[10px] font-medium leading-none">{copied ? "Copied!" : "Copy"}</span>
    </button>
  );
}

// ── Retry button ──────────────────────────────────────────────────────────────

function RetryButton({ onRetry }: { onRetry: () => void }) {
  return (
    <button onClick={onRetry}
      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium mt-1.5 transition-all active:scale-90"
      style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
      <RotateCcw size={10} strokeWidth={2.5} />
      Retry
    </button>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({
  role, content, streaming, error, imageUrl, attachedImageUrl, thinking, statusSteps, onRetry,
}: {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  error?: boolean;
  imageUrl?: string;
  attachedImageUrl?: string;
  thinking?: string;
  statusSteps?: StatusStep[];
  onRetry?: () => void;
}) {
  // ── User ──
  if (role === "user") {
    return (
      <div className="flex flex-col items-end gap-1">
        {attachedImageUrl && (
          <img src={attachedImageUrl} alt="Attached" className="max-w-[200px] rounded-xl object-cover mb-1"
            style={{ border: "1px solid hsl(var(--border))" }} />
        )}
        {content && (
          <div className="max-w-[78%] px-4 py-2.5 rounded-2xl rounded-br-sm text-sm leading-relaxed"
            style={{
              background: "hsl(var(--muted))",
              color: "hsl(var(--foreground))",
              border: "1px solid hsl(var(--border))",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}>
            {content}
          </div>
        )}
        <div className="pr-1"><CopyButton text={content} /></div>
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div className="flex items-start gap-2.5">
        <AIAvatar />
        <div className="flex flex-col gap-0.5 min-w-0" style={{ maxWidth: "680px" }}>
          <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--destructive))", whiteSpace: "pre-wrap" }}>
            {content}
          </p>
          {onRetry && <RetryButton onRetry={onRetry} />}
        </div>
      </div>
    );
  }

  // ── Image response ──
  if (imageUrl) {
    return (
      <div className="flex items-start gap-2.5">
        <AIAvatar />
        <div className="flex flex-col gap-2 min-w-0" style={{ maxWidth: "460px" }}>
          <div className="rounded-2xl overflow-hidden"
            style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
            <img src={imageUrl} alt={content} className="w-full block" style={{ maxWidth: "400px" }} />
          </div>
          {content && <p className="text-[11px] px-1 leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>{content}</p>}
          <div className="pl-1"><DownloadButton imageUrl={imageUrl} prompt={content} /></div>
        </div>
      </div>
    );
  }

  // ── Assistant text — no card bubble, text directly on background ──
  return (
    <div className="flex items-start gap-2.5">
      <AIAvatar isStreaming={streaming} />
      <div className="flex flex-col gap-1.5 min-w-0 flex-1" style={{ maxWidth: "680px" }}>
        {statusSteps && statusSteps.length > 0 && (
          <div className="mb-1">
            <StatusSteps steps={statusSteps} />
          </div>
        )}
        {thinking && (
          <ThinkingBlock content={thinking} streaming={streaming && !content} />
        )}
        <MarkdownContent content={content} streaming={streaming} />
        {!streaming && content && <div><CopyButton text={content} /></div>}
      </div>
    </div>
  );
}

// ── Sidebar (desktop, md+) ────────────────────────────────────────────────────

function Sidebar({
  currentConvId,
  onNewChat,
  onSelectConv,
}: {
  currentConvId: number | null;
  onNewChat: () => void;
  onSelectConv: (id: number) => void;
}) {
  const queryClient = useQueryClient();
  const { theme, toggleTheme, clientId } = useAppContext();
  const { data: conversations = [] } = useListConversations();
  const deleteConversation = useDeleteConversation({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() }) },
  });
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [, navigate] = useLocation();

  return (
    <aside className="hidden md:flex flex-col w-60 flex-shrink-0 h-dvh overflow-hidden"
      style={{ borderRight: "1px solid hsl(var(--border))", background: "hsl(var(--sidebar))" }}>

      {/* Logo */}
      <div className="flex items-center justify-between px-4 pt-5 pb-4"
        style={{ borderBottom: "1px solid hsl(var(--border))" }}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
            style={{ background: "hsl(var(--foreground))", color: "hsl(var(--background))" }}>
            D
          </div>
          <span className="font-semibold text-sm" style={{ color: "hsl(var(--foreground))" }}>DeepSeek</span>
        </div>
        <button onClick={toggleTheme}
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-90"
          style={{ color: "hsl(var(--muted-foreground))" }}>
          {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
        </button>
      </div>

      {/* New chat */}
      <div className="px-3 py-3">
        <button onClick={onNewChat}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all active:scale-[0.98]"
          style={{ background: "hsl(var(--muted))", color: "hsl(var(--foreground))", border: "1px solid hsl(var(--border))" }}>
          <Plus size={14} strokeWidth={2.5} />
          New chat
        </button>
      </div>

      {/* Conversations */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {conversations.length > 0 && (
          <p className="text-[10px] font-semibold uppercase tracking-widest px-2 pb-1.5 pt-1"
            style={{ color: "hsl(var(--muted-foreground))" }}>Recent</p>
        )}
        {conversations.map(conv => {
          const isActive = conv.id === currentConvId;
          const isConfirming = confirmDeleteId === conv.id;
          return (
            <div key={conv.id}
              onClick={() => !isConfirming && onSelectConv(conv.id)}
              className="group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-all mb-0.5"
              style={{
                background: isActive ? "hsl(var(--muted))" : "transparent",
                border: `1px solid ${isActive ? "hsl(var(--border))" : "transparent"}`,
              }}
              onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "hsl(var(--muted) / 0.6)"; }}
              onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>

              {isConfirming ? (
                <div className="flex-1 flex items-center justify-between">
                  <span className="text-xs" style={{ color: "hsl(var(--destructive))" }}>Delete?</span>
                  <div className="flex gap-1">
                    <button onClick={async e => {
                      e.stopPropagation();
                      await deleteConversation.mutateAsync({ id: conv.id });
                      setConfirmDeleteId(null);
                      if (isActive) navigate("/");
                    }}
                      className="px-2 py-0.5 rounded text-[10px] font-semibold"
                      style={{ background: "hsl(var(--destructive))", color: "white" }}>
                      Yes
                    </button>
                    <button onClick={e => { e.stopPropagation(); setConfirmDeleteId(null); }}
                      className="px-2 py-0.5 rounded text-[10px]"
                      style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}>
                      No
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <MessageSquare size={13} style={{ color: "hsl(var(--muted-foreground))", flexShrink: 0 }} />
                  <span className="flex-1 truncate text-xs" style={{ color: "hsl(var(--foreground))" }}>
                    {conv.title}
                  </span>
                  <button onClick={e => { e.stopPropagation(); setConfirmDeleteId(conv.id); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 rounded flex items-center justify-center"
                    style={{ color: "hsl(var(--muted-foreground))" }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "hsl(var(--destructive))"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "hsl(var(--muted-foreground))"}>
                    <Trash2 size={11} />
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer links */}
      <div className="px-3 py-3" style={{ borderTop: "1px solid hsl(var(--border))" }}>
        <button onClick={() => navigate("/settings")}
          className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs transition-all"
          style={{ color: "hsl(var(--muted-foreground))" }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "hsl(var(--muted))"}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
          <Settings size={13} />
          Settings
        </button>
      </div>
    </aside>
  );
}

// ── Main Chat component ───────────────────────────────────────────────────────

export default function Chat() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { model, setModel, clientId: rawClientId, clientIdReady } = useAppContext();
  const clientId = rawClientId ?? "";
  const isNew = !params.id || params.id === "new";
  const convId = isNew ? null : parseInt(params.id, 10);

  const { data: conv } = useGetConversation(convId!, {
    query: { enabled: !!convId && clientIdReady, queryKey: getGetConversationQueryKey(convId!) },
  });

  const mainRef = useRef<HTMLDivElement>(null);
  const { isPinnedRef, showJump, scrollToBottom } = useStickToBottom(mainRef);

  if (!clientIdReady) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100dvh", background: "hsl(var(--background))", color: "hsl(var(--muted-foreground))",
        fontSize: "13px",
      }}>
        Authenticating…
      </div>
    );
  }

  const [messages, setMessages] = useState<StreamMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingToken, setStreamingToken] = useState("");
  const [streamingThinking, setStreamingThinking] = useState("");
  const [streamingSteps, setStreamingSteps] = useState<StatusStep[]>([]);
  const [optimisticUser, setOptimisticUser] = useState("");
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showPremium, setShowPremium] = useState(false);
  const [premiumTriggeredByLimit, setPremiumTriggeredByLimit] = useState(false);
  const [subStatus, setSubStatus] = useState<SubStatus | null>(null);
  const [claimSubmitted, setClaimSubmitted] = useState(false);
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [imageLoadingCount, setImageLoadingCount] = useState(0);
  const [imageError, setImageError] = useState<string | null>(null);
  const [optimisticImages, setOptimisticImages] = useState<string[]>([]);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  const pendingImageOps = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const apiBase = import.meta.env.VITE_API_URL || "";

  // ── Subscription status ───────────────────────────────────────────────────

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
    if (urlParams.get("premium") === "1") { setShowPremium(true); setPremiumTriggeredByLimit(false); }
    fetchSubStatus();
  }, [fetchSubStatus]);

  // ── Load conversation ─────────────────────────────────────────────────────

  useEffect(() => {
    if (conv?.messages) {
      setMessages(conv.messages.map(m => ({
        id: String(m.id),
        role: m.role as "user" | "assistant",
        content: m.content,
        // BUG FIX: backend stores as "attachedImage", not "attachedImageUrl"
        attachedImageUrl: (m as any).attachedImage ?? (m as any).attachedImageUrl ?? undefined,
        imageUrl: (m as any).generatedImageUrl ?? undefined,
      })));
    }
  }, [conv]);

  // ── Auto-scroll (only when pinned to bottom) ───────────────────────────────

  useEffect(() => {
    if (isPinnedRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "instant" });
    }
  }, [messages, streamingToken, optimisticUser, isPinnedRef]);

  // ── Textarea auto-resize ──────────────────────────────────────────────────

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, [input]);

  // ── Model menu close on outside click ────────────────────────────────────

  useEffect(() => {
    if (!showModelMenu) return;
    const handler = () => setShowModelMenu(false);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [showModelMenu]);

  // ── Free plan enforcement ─────────────────────────────────────────────────

  const msgCount = subStatus?.messageCount ?? 0;
  const isPremium = subStatus?.isActive ?? false;
  const isPending = subStatus?.status === "pending";
  const isLimited = subStatus !== null && !isPremium && msgCount >= FREE_LIMIT;

  const openPremium = (byLimit = false) => { setPremiumTriggeredByLimit(byLimit); setShowPremium(true); };

  useEffect(() => {
    if (!isPremium && model !== "deepseek/deepseek-v4-flash") {
      setModel("deepseek/deepseek-v4-flash");
    }
  }, [isPremium, model, setModel]);

  // ── Image attachment ──────────────────────────────────────────────────────

  const decrementImageLoading = useCallback(() => {
    pendingImageOps.current = Math.max(0, pendingImageOps.current - 1);
    setImageLoadingCount(Math.max(0, pendingImageOps.current));
  }, []);

  const handleImageAttach = () => { setImageError(null); fileInputRef.current?.click(); };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    setImageError(null);
    const remaining = MAX_IMAGES - attachedImages.length;
    if (remaining <= 0) { setImageError(`Max ${MAX_IMAGES} images per message`); return; }
    const toProcess = files.slice(0, remaining);
    if (files.length > remaining) setImageError(`Only ${remaining} more image${remaining === 1 ? "" : "s"} allowed (max ${MAX_IMAGES})`);

    for (const file of toProcess) {
      if (!file.type.startsWith("image/")) { setImageError("Only image files are supported"); continue; }
      if (file.size > MAX_IMAGE_SIZE_BYTES) { setImageError(`Image too large (max 5 MB): ${file.name}`); continue; }
      pendingImageOps.current += 1;
      setImageLoadingCount(pendingImageOps.current);
      const reader = new FileReader();
      const safetyTimer = setTimeout(() => { decrementImageLoading(); setImageError(`Timed out: ${file.name}`); }, 15000);
      reader.onload = async (ev) => {
        clearTimeout(safetyTimer);
        const raw = ev.target?.result as string;
        try {
          const compressed = await compressImage(raw);
          setAttachedImages(prev => { if (prev.length >= MAX_IMAGES) return prev; return [...prev, compressed]; });
        } catch { setImageError(`Failed to process image: ${file.name}`); }
        finally { decrementImageLoading(); }
      };
      reader.onerror = () => { clearTimeout(safetyTimer); setImageError(`Failed to read image: ${file.name}`); decrementImageLoading(); };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = (index: number) => { setAttachedImages(prev => prev.filter((_, i) => i !== index)); setImageError(null); };

  // ── Voice input ───────────────────────────────────────────────────────────

  const speechRecognition = useSpeechRecognition(useCallback((text: string) => {
    setInput(text);
  }, []));

  // ── Send ──────────────────────────────────────────────────────────────────
  // Accepts an optional overrideMessage for retry flows.

  const handleSend = useCallback(async (overrideMessage?: string) => {
    const trimmed = overrideMessage !== undefined ? overrideMessage.trim() : input.trim();
    if ((!trimmed && attachedImages.length === 0) || isStreaming) return;
    if (isLimited) { openPremium(true); return; }
    if (imageLoadingCount > 0) return;

    const userMessage = trimmed;
    const capturedImages = [...attachedImages];
    const primaryImage = capturedImages[0] || null;

    if (overrideMessage === undefined) setInput("");
    setAttachedImages([]);
    setImageError(null);
    setOptimisticImages(capturedImages);
    setIsStreaming(true);
    setStreamingToken("");
    setStreamingThinking("");
    setStreamingSteps([]);
    setOptimisticUser(userMessage);
    scrollToBottom(false);

    let targetId = convId;
    try {
      if (isNew) {
        const t = (userMessage.slice(0, 45) || "📷 Image") + (userMessage.length > 45 ? "…" : "");
        const convRes = await fetch(`${apiBase}/api/conversations`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Client-ID": clientId },
          body: JSON.stringify({ title: t }),
        });
        const result = await convRes.json();
        targetId = result.id;
        queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
      }

      abortRef.current = new AbortController();
      const res = await fetch(`${apiBase}/api/conversations/${targetId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Client-ID": clientId },
        body: JSON.stringify({
          content: userMessage,
          model,
          userPrompt: getUserPrompt(),
          imageBase64: primaryImage || undefined,
        }),
        signal: abortRef.current.signal,
      });

      if (res.status === 402) {
        await fetchSubStatus(); openPremium(true);
        setMessages(prev => [...prev, { id: Date.now().toString(), role: "user", content: userMessage, attachedImageUrl: primaryImage || undefined }]);
        return;
      }
      if (res.status === 429) {
        setMessages(prev => [...prev,
          { id: Date.now().toString(), role: "user", content: userMessage, attachedImageUrl: primaryImage || undefined },
          { id: (Date.now() + 1).toString(), role: "assistant", content: "Too many requests — please wait a moment and try again.", error: true },
        ]); return;
      }
      if (res.status === 409) {
        setMessages(prev => [...prev,
          { id: Date.now().toString(), role: "user", content: userMessage, attachedImageUrl: primaryImage || undefined },
          { id: (Date.now() + 1).toString(), role: "assistant", content: "A response is already in progress. Please wait for it to finish.", error: true },
        ]); return;
      }
      if (!res.ok) {
        const errText = await res.text().catch(() => "Server error");
        setMessages(prev => [...prev,
          { id: Date.now().toString(), role: "user", content: userMessage, attachedImageUrl: primaryImage || undefined },
          { id: (Date.now() + 1).toString(), role: "assistant", content: errText || "Server error. Please try again.", error: true },
        ]); return;
      }

      // ── Consume SSE stream ─────────────────────────────────────────────
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";
      let fullToken = "";
      let fullThinking = "";
      const liveSteps: StatusStep[] = [];
      let streamError: string | null = null;

      try {
        outer: while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          sseBuffer += decoder.decode(value, { stream: true });
          const lines = sseBuffer.split("\n");
          sseBuffer = lines.pop()!;

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const evt = JSON.parse(line.slice(6)) as SseEvent;

              if (evt.type === "token" && evt.content) {
                fullToken += evt.content;
                setStreamingToken(fullToken);
              }
              if (evt.type === "thinking" && evt.content) {
                fullThinking += evt.content;
                setStreamingThinking(fullThinking);
              }
              if (evt.type === "status" && evt.text) {
                if (!evt.done) {
                  liveSteps.push({ text: evt.text, done: false });
                } else {
                  const idx = [...liveSteps].reverse().findIndex(s => s.text === evt.text && !s.done);
                  if (idx !== -1) liveSteps[liveSteps.length - 1 - idx].done = true;
                }
                setStreamingSteps([...liveSteps]);
              }
              if (evt.type === "tool_status") {
                const stepText = evt.label ?? `Running ${evt.tool ?? "tool"}…`;
                const alreadyDone = liveSteps.some(s => s.text === stepText && s.done);
                const alreadyPending = liveSteps.some(s => s.text === stepText && !s.done);
                if (!alreadyPending && !alreadyDone) {
                  liveSteps.push({ text: stepText, done: false });
                } else if (alreadyPending) {
                  const idx = [...liveSteps].reverse().findIndex(s => s.text === stepText && !s.done);
                  if (idx !== -1) liveSteps[liveSteps.length - 1 - idx].done = true;
                }
                setStreamingSteps([...liveSteps]);
              }
              if (evt.type === "error") { streamError = evt.message || "Something went wrong. Please try again."; break outer; }
              if (evt.type === "done") break outer;
            } catch { /* skip malformed */ }
          }
        }
      } catch (readErr: any) {
        if (readErr.name !== "AbortError" && fullToken) {
          fullToken += "\n\n*(Response was cut off due to a connection issue)*";
        } else if (readErr.name !== "AbortError") {
          streamError = "Connection lost. Please try again.";
        }
      }

      if (streamError) {
        setMessages(prev => [...prev,
          { id: Date.now().toString(), role: "user", content: userMessage, attachedImageUrl: primaryImage || undefined },
          { id: (Date.now() + 1).toString(), role: "assistant", content: streamError!, error: true },
        ]); return;
      }

      // BUG FIX: treat empty fullToken as an error instead of "(no response)"
      const finalContent = fullToken.trim();
      if (!finalContent) {
        setMessages(prev => [...prev,
          { id: Date.now().toString(), role: "user", content: userMessage, attachedImageUrl: primaryImage || undefined },
          { id: (Date.now() + 1).toString(), role: "assistant", content: "No response received. Please try again.", error: true },
        ]); return;
      }

      setOptimisticUser("");
      setOptimisticImages([]);
      setMessages(prev => [...prev,
        { id: Date.now().toString(), role: "user", content: userMessage, attachedImageUrl: primaryImage || undefined },
        { id: (Date.now() + 1).toString(), role: "assistant", content: finalContent, thinking: fullThinking || undefined },
      ]);
      fetchSubStatus();
      if (isNew && targetId) navigate(`/chat/${targetId}`, { replace: true });
    } catch (e: any) {
      if (e.name !== "AbortError") {
        setMessages(prev => [...prev,
          { id: Date.now().toString(), role: "user", content: userMessage, attachedImageUrl: primaryImage || undefined },
          { id: (Date.now() + 1).toString(), role: "assistant", content: "Connection error. Please try again.", error: true },
        ]);
      }
    } finally {
      setIsStreaming(false);
      setStreamingToken("");
      setStreamingThinking("");
      setStreamingSteps([]);
      setOptimisticUser("");
      setOptimisticImages([]);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [
    input, attachedImages, imageLoadingCount, isStreaming, isLimited,
    convId, isNew, queryClient, navigate, model, clientId, apiBase,
    fetchSubStatus, setModel, scrollToBottom,
  ]);

  // ── Retry handler ─────────────────────────────────────────────────────────

  const handleRetry = useCallback((userMessage: string) => {
    setInput(userMessage);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, []);

  const imagesLoading = imageLoadingCount > 0;
  const canSend = (input.trim().length > 0 || attachedImages.length > 0) && !isStreaming && !isLimited && !imagesLoading;
  const showMicButton = speechRecognition.isSupported && !isStreaming && !canSend && !isLimited;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-dvh" style={{ background: "hsl(var(--background))" }}>

      {/* Desktop sidebar */}
      <Sidebar
        currentConvId={convId}
        onNewChat={() => navigate("/chat/new")}
        onSelectConv={(id) => navigate(`/chat/${id}`)}
      />

      {/* Main column */}
      <div className="flex flex-col flex-1 min-w-0 h-dvh">

        {/* ── Header ── */}
        <header className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
          style={{ background: "hsl(var(--sidebar))", borderBottom: "1px solid hsl(var(--border))" }}>

          {/* Back/menu button — mobile shows back, desktop hidden (sidebar is there) */}
          <button onClick={() => navigate("/")}
            className="md:hidden w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all active:scale-90"
            style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
            <ArrowLeft size={17} />
          </button>

          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate leading-tight" style={{ color: "hsl(var(--foreground))" }}>
                {isNew ? "New Chat" : conv?.title || "Chat"}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                  {MODEL_LABELS[model]}
                </span>
                {isStreaming && (
                  <span className="flex gap-0.5 ml-0.5">
                    {[0, 0.15, 0.3].map((delay, i) => (
                      <span key={i} className="typing-dot inline-block w-1 h-1 rounded-full"
                        style={{ background: "hsl(var(--muted-foreground))", animationDelay: `${delay}s` }} />
                    ))}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Model selector */}
          <div className="relative flex-shrink-0">
            {isPremium ? (
              <>
                <button onClick={e => { e.stopPropagation(); setShowModelMenu(v => !v); }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all active:scale-95"
                  style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))" }}>
                  {MODEL_LABELS[model]}
                  <ChevronDown size={12} style={{ color: "hsl(var(--muted-foreground))" }} />
                </button>
                {showModelMenu && (
                  <div className="absolute right-0 top-full mt-1.5 z-50 min-w-[185px] rounded-xl overflow-hidden"
                    style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", boxShadow: "0 8px 24px rgba(0,0,0,0.18)" }}
                    onClick={e => e.stopPropagation()}>
                    {(["deepseek/deepseek-v4-flash", "deepseek/deepseek-v4-pro"] satisfies Model[]).map(m => (
                      <button key={m} onClick={() => { setModel(m); setShowModelMenu(false); }}
                        className="w-full text-left px-3.5 py-2.5 text-xs font-medium transition-colors flex items-center justify-between gap-3"
                        style={{
                          color: model === m ? "hsl(var(--primary))" : "hsl(var(--foreground))",
                          background: model === m ? "hsl(var(--muted))" : "transparent",
                        }}
                        onMouseEnter={e => { if (model !== m) (e.currentTarget as HTMLElement).style.background = "hsl(var(--muted))"; }}
                        onMouseLeave={e => { if (model !== m) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                        <span>{MODEL_LABELS[m]}</span>
                        {m === "deepseek/deepseek-v4-flash" && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                            style={{ background: "hsl(142 62% 52% / 0.15)", color: "hsl(142 62% 45%)" }}>Fast</span>
                        )}
                        {m === "deepseek/deepseek-v4-pro" && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                            style={{ background: "hsl(var(--muted))", color: "hsl(var(--primary))" }}>Smart</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <button onClick={() => openPremium(false)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all active:scale-95"
                style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}
                title="Upgrade to access more models">
                V4 Flash
                <Lock size={10} />
              </button>
            )}
          </div>
        </header>

        {/* ── Messages ── */}
        <main ref={mainRef} className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-5 relative"
          style={{ scrollBehavior: "auto" }}>

          {!isNew && messages.length === 0 && !optimisticUser && (
            <div className="flex items-center justify-center h-full">
              <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Loading…</p>
            </div>
          )}

          {isNew && !optimisticUser && (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-4 pb-8">
              <div className="w-14 h-14 rounded-2xl overflow-hidden"
                style={{ border: "1px solid hsl(var(--border))" }}>
                <video autoPlay loop muted playsInline className="w-full h-full object-cover">
                  <source src={WHALE_SRC} type="video/webm" />
                </video>
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

          {messages.map((msg, idx) => {
            let retryHandler: (() => void) | undefined;
            if (msg.role === "assistant" && msg.error) {
              const prevMsg = messages[idx - 1];
              if (prevMsg?.role === "user") {
                retryHandler = () => handleRetry(prevMsg.content);
              }
            }
            return (
              <MessageBubble
                key={msg.id}
                role={msg.role}
                content={msg.content}
                error={msg.error}
                imageUrl={msg.imageUrl}
                attachedImageUrl={msg.attachedImageUrl}
                thinking={msg.thinking}
                onRetry={retryHandler}
              />
            );
          })}

          {(optimisticUser || optimisticImages.length > 0) && (
            <MessageBubble
              role="user"
              content={optimisticUser}
              attachedImageUrl={optimisticImages[0] || undefined}
            />
          )}

          {/* Streaming assistant bubble */}
          {isStreaming && (
            <div className="flex items-start gap-2.5">
              <AIAvatar isStreaming />
              <div className="flex flex-col gap-1.5 min-w-0 flex-1" style={{ maxWidth: "680px" }}>
                {streamingSteps.length > 0 && (
                  <div className="mb-1">
                    <StatusSteps steps={streamingSteps} />
                  </div>
                )}
                {streamingThinking && (
                  <ThinkingBlock content={streamingThinking} streaming={!streamingToken} />
                )}
                {streamingToken
                  ? <MarkdownContent content={streamingToken} streaming />
                  : (
                    <div className="flex items-center gap-1.5">
                      {[0, 0.15, 0.3].map((delay, i) => (
                        <span key={i} className="typing-dot inline-block w-1.5 h-1.5 rounded-full"
                          style={{ background: "hsl(var(--muted-foreground))", animationDelay: `${delay}s` }} />
                      ))}
                      <span className="text-xs ml-1" style={{ color: "hsl(var(--muted-foreground))" }}>
                        {optimisticImages.length > 0 && !streamingSteps.length ? "Analyzing image…" : "Thinking…"}
                      </span>
                    </div>
                  )
                }
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </main>

        {/* Jump to latest button */}
        {showJump && (
          <div className="absolute bottom-[90px] left-1/2 -translate-x-1/2 z-20 pointer-events-none"
            style={{ position: "sticky", bottom: "90px", display: "flex", justifyContent: "center" }}>
            <button onClick={() => scrollToBottom(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium shadow-lg transition-all active:scale-95 pointer-events-auto"
              style={{
                background: "hsl(var(--foreground))",
                color: "hsl(var(--background))",
              }}>
              <ChevronDown size={13} />
              Jump to latest
            </button>
          </div>
        )}

        {/* ── Footer ── */}
        <footer className="flex-shrink-0 px-4 pb-4 pt-2">

          {isPending && !isPremium && (
            <div className="mb-3 px-3 py-2 rounded-xl flex items-center justify-center"
              style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))" }}>
              <span className="text-[11px] font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>
                Payment pending — unlimited access activates once confirmed
              </span>
            </div>
          )}

          {!isPremium && !isPending && subStatus !== null && (
            <UsageBar used={msgCount} limit={FREE_LIMIT} onUpgrade={() => openPremium(false)} />
          )}

          {isLimited ? (
            <LimitReachedBanner onUpgrade={() => openPremium(true)} />
          ) : (
            <div className="rounded-2xl overflow-hidden transition-all"
              style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
              onFocusCapture={e => { e.currentTarget.style.borderColor = "hsl(var(--foreground) / 0.2)"; }}
              onBlurCapture={e => { e.currentTarget.style.borderColor = "hsl(var(--border))"; }}>

              {/* Image previews */}
              {(attachedImages.length > 0 || imagesLoading) && (
                <div className="px-3 pt-3 flex items-start gap-2 flex-wrap">
                  {attachedImages.map((img, i) => (
                    <div key={i} className="relative">
                      <img src={img} alt={`Attached ${i + 1}`}
                        className="w-16 h-16 rounded-lg object-cover"
                        style={{ border: "1px solid hsl(var(--border))" }} />
                      <button onClick={() => removeImage(i)}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center"
                        style={{ background: "hsl(var(--foreground))", color: "hsl(var(--background))" }}>
                        <X size={9} strokeWidth={3} />
                      </button>
                    </div>
                  ))}
                  {imagesLoading && (
                    <div className="w-16 h-16 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ border: "1px dashed hsl(var(--border))", background: "hsl(var(--muted))" }}>
                      <Loader2 size={18} className="animate-spin" style={{ color: "hsl(var(--muted-foreground))" }} />
                    </div>
                  )}
                </div>
              )}

              {/* Image error */}
              {imageError && (
                <div className="px-3 pt-2">
                  <p className="text-[11px]" style={{ color: "hsl(var(--destructive))" }}>{imageError}</p>
                </div>
              )}

              {/* Mic error */}
              {speechRecognition.micError && (
                <div className="px-3 pt-2">
                  <p className="text-[11px]" style={{ color: "hsl(var(--destructive))" }}>{speechRecognition.micError}</p>
                </div>
              )}

              <div className="flex items-end gap-2 px-4 py-3">
                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />

                {/* Image attach button */}
                <button onClick={handleImageAttach}
                  disabled={isStreaming || imagesLoading || attachedImages.length >= MAX_IMAGES}
                  title={attachedImages.length >= MAX_IMAGES ? `Max ${MAX_IMAGES} images` : imagesLoading ? "Processing image…" : "Attach image"}
                  className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-all active:scale-90"
                  style={{
                    background: attachedImages.length > 0 ? "hsl(var(--muted))" : "transparent",
                    border: `1px solid ${attachedImages.length > 0 ? "hsl(var(--border))" : "transparent"}`,
                    color: attachedImages.length >= MAX_IMAGES
                      ? "hsl(var(--muted-foreground) / 0.3)"
                      : "hsl(var(--muted-foreground))",
                    cursor: (attachedImages.length >= MAX_IMAGES || imagesLoading) ? "not-allowed" : "pointer",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "hsl(var(--foreground))"; }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.color = attachedImages.length >= MAX_IMAGES
                      ? "hsl(var(--muted-foreground) / 0.3)" : "hsl(var(--muted-foreground))";
                  }}>
                  {imagesLoading ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
                </button>

                {/* Textarea */}
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  disabled={isStreaming}
                  placeholder="Message DeepSeek…"
                  rows={1}
                  className="flex-1 resize-none bg-transparent outline-none text-sm leading-relaxed py-0.5"
                  style={{
                    color: "hsl(var(--foreground))",
                    maxHeight: "160px",
                    overflowY: "auto",
                    fontFamily: "var(--app-font-sans)",
                  }}
                />

                {/* Right-side action button: stop / send / mic */}
                {isStreaming ? (
                  <button onClick={() => abortRef.current?.abort()}
                    title="Stop generating"
                    className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all active:scale-90"
                    style={{
                      background: "hsl(var(--muted))",
                      border: "1px solid hsl(var(--border))",
                      color: "hsl(var(--destructive))",
                    }}>
                    <Square size={12} strokeWidth={0} style={{ fill: "currentColor" }} />
                  </button>
                ) : showMicButton ? (
                  <button
                    onClick={speechRecognition.isRecording ? speechRecognition.stopRecording : speechRecognition.startRecording}
                    title={speechRecognition.isRecording ? "Stop recording" : "Voice input"}
                    className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all active:scale-90"
                    style={{
                      background: speechRecognition.isRecording ? "hsl(var(--primary) / 0.12)" : "hsl(var(--muted))",
                      border: `1px solid ${speechRecognition.isRecording ? "hsl(var(--primary) / 0.3)" : "hsl(var(--border))"}`,
                      color: speechRecognition.isRecording ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
                    }}>
                    {speechRecognition.isRecording ? <MicOff size={14} /> : <Mic size={14} />}
                  </button>
                ) : (
                  <button onClick={() => handleSend()} disabled={!canSend}
                    title={imagesLoading ? "Waiting for image to process…" : undefined}
                    className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all active:scale-90"
                    style={{
                      background: canSend ? "hsl(var(--foreground))" : "hsl(var(--muted))",
                      color: canSend ? "hsl(var(--background))" : "hsl(var(--muted-foreground))",
                      border: "1px solid transparent",
                    }}>
                    {imagesLoading
                      ? <Loader2 size={15} className="animate-spin" />
                      : <Send size={15} strokeWidth={2} />}
                  </button>
                )}
              </div>
            </div>
          )}

          <p className="text-center text-[10px] mt-2" style={{ color: "hsl(var(--muted-foreground) / 0.5)" }}>
            {isLimited
              ? "Resets daily at midnight UTC"
              : isStreaming
                ? "Generating… click ■ to stop"
                : speechRecognition.isRecording
                  ? "Listening… speak now"
                  : attachedImages.length > 0
                    ? "Image attached · Enter to send"
                    : "Enter to send · Shift+Enter for new line"}
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
    </div>
  );
}
