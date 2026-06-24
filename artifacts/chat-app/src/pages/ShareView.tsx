import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { MessageSquare, Copy, Check, ExternalLink, ArrowLeft } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SharedMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  attachedImage?: string | null;
  generatedImageUrl?: string | null;
  createdAt: string;
}

interface SharedConversation {
  id: number;
  title: string;
  createdAt: string;
  messages: SharedMessage[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric", month: "long", day: "numeric",
  });
}

// ── Simple markdown render ────────────────────────────────────────────────────

function MdText({ content }: { content: string }) {
  return (
    <div className="prose prose-sm max-w-none" style={{ fontSize: "0.875rem", lineHeight: 1.7 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children }) {
            const isBlock = !!className;
            const code = String(children).replace(/\n$/, "");
            if (isBlock) {
              return (
                <pre className="overflow-x-auto rounded-xl p-4 text-[13px]"
                  style={{
                    background: "hsl(230 20% 5%)",
                    border: "1px solid hsl(230 14% 18%)",
                    color: "hsl(220 18% 82%)",
                    fontFamily: "JetBrains Mono, Fira Code, Menlo, monospace",
                    margin: "0.75rem 0",
                  }}>
                  <code>{code}</code>
                </pre>
              );
            }
            return (
              <code style={{
                background: "hsl(230 18% 13%)", color: "hsl(198 80% 70%)",
                padding: "1px 5px", borderRadius: "4px", fontSize: "0.85em",
                fontFamily: "JetBrains Mono, Fira Code, Menlo, monospace",
                border: "1px solid hsl(230 14% 20%)",
              }}>{code}</code>
            );
          },
          p({ children }) { return <p style={{ margin: "0.5em 0", color: "hsl(var(--foreground))" }}>{children}</p>; },
          ul({ children }) { return <ul style={{ margin: "0.5em 0", paddingLeft: "1.4em" }}>{children}</ul>; },
          ol({ children }) { return <ol style={{ margin: "0.5em 0", paddingLeft: "1.4em" }}>{children}</ol>; },
          li({ children }) { return <li style={{ color: "hsl(var(--foreground))", lineHeight: 1.65 }}>{children}</li>; },
          strong({ children }) { return <strong style={{ color: "hsl(var(--foreground))", fontWeight: 700 }}>{children}</strong>; },
          blockquote({ children }) {
            return <blockquote style={{ margin: "0.6em 0", paddingLeft: "0.9em", borderLeft: "3px solid hsl(var(--primary) / 0.5)", color: "hsl(var(--muted-foreground))", fontStyle: "italic" }}>{children}</blockquote>;
          },
          a({ href, children }) { return <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "hsl(var(--primary))", textDecoration: "underline" }}>{children}</a>; },
          h1({ children }) { return <h1 style={{ color: "hsl(var(--foreground))", fontSize: "1.2em", fontWeight: 700, margin: "1em 0 0.4em" }}>{children}</h1>; },
          h2({ children }) { return <h2 style={{ color: "hsl(var(--foreground))", fontSize: "1.1em", fontWeight: 600, margin: "0.9em 0 0.35em" }}>{children}</h2>; },
          h3({ children }) { return <h3 style={{ color: "hsl(var(--foreground))", fontSize: "1em", fontWeight: 600, margin: "0.8em 0 0.3em" }}>{children}</h3>; },
          table({ children }) { return <div style={{ overflowX: "auto", margin: "0.6em 0" }}><table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.88em" }}>{children}</table></div>; },
          thead({ children }) { return <thead style={{ background: "hsl(var(--muted))" }}>{children}</thead>; },
          th({ children }) { return <th style={{ padding: "6px 10px", textAlign: "left", fontWeight: 600, color: "hsl(var(--foreground))", border: "1px solid hsl(var(--border))" }}>{children}</th>; },
          td({ children }) { return <td style={{ padding: "5px 10px", color: "hsl(var(--foreground))", border: "1px solid hsl(var(--border))" }}>{children}</td>; },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

// ── CopyLink button ───────────────────────────────────────────────────────────

function CopyLink() {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };
  return (
    <button onClick={handleCopy}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all active:scale-95"
      style={{
        background: copied ? "hsl(142 52% 48% / 0.1)" : "hsl(var(--muted))",
        border: `1px solid ${copied ? "hsl(142 52% 48% / 0.3)" : "hsl(var(--border))"}`,
        color: copied ? "hsl(142 52% 45%)" : "hsl(var(--muted-foreground))",
      }}>
      {copied ? <Check size={12} strokeWidth={2.5} /> : <Copy size={12} />}
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}

// ── Message row ───────────────────────────────────────────────────────────────

function MessageRow({ msg }: { msg: SharedMessage }) {
  if (msg.role === "user") {
    return (
      <div className="flex flex-col items-end gap-1">
        {msg.attachedImage && (
          <img src={msg.attachedImage} alt="Attached"
            className="max-w-[200px] rounded-xl object-cover"
            style={{ border: "1px solid hsl(var(--border))" }} />
        )}
        {msg.content && (
          <div className="max-w-[78%] px-4 py-2.5 rounded-2xl rounded-br-sm text-sm leading-relaxed"
            style={{
              background: "hsl(var(--muted))",
              color: "hsl(var(--foreground))",
              border: "1px solid hsl(var(--border))",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}>
            {msg.content}
          </div>
        )}
      </div>
    );
  }

  if (msg.generatedImageUrl) {
    return (
      <div className="flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold"
          style={{ background: "hsl(var(--muted))", color: "hsl(var(--foreground))", border: "1px solid hsl(var(--border))" }}>
          D
        </div>
        <div className="flex flex-col gap-2 min-w-0" style={{ maxWidth: "460px" }}>
          <div className="rounded-2xl overflow-hidden"
            style={{ border: "1px solid hsl(var(--border))" }}>
            <img src={msg.generatedImageUrl} alt="Generated" className="w-full block" style={{ maxWidth: "400px" }} />
          </div>
          {msg.content && (
            <p className="text-[11px] px-1 leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
              {msg.content}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5">
      <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold"
        style={{ background: "hsl(var(--muted))", color: "hsl(var(--foreground))", border: "1px solid hsl(var(--border))" }}>
        D
      </div>
      <div className="flex-1 min-w-0" style={{ maxWidth: "680px" }}>
        <MdText content={msg.content} />
      </div>
    </div>
  );
}

// ── ShareView ─────────────────────────────────────────────────────────────────

export default function ShareView() {
  const params = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const [conv, setConv] = useState<SharedConversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apiBase = import.meta.env.VITE_API_URL || "";

  useEffect(() => {
    if (!params.token) return;
    setLoading(true);
    fetch(`${apiBase}/api/share/${params.token}`)
      .then(res => {
        if (!res.ok) throw new Error(res.status === 404 ? "This shared conversation doesn't exist or has been removed." : "Failed to load conversation.");
        return res.json();
      })
      .then((data: SharedConversation) => setConv(data))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [params.token, apiBase]);

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex items-center justify-center h-dvh" style={{ background: "hsl(var(--background))" }}>
        <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "hsl(var(--border))", borderTopColor: "hsl(var(--primary))" }} />
      </div>
    );
  }

  // ── Error ──
  if (error || !conv) {
    return (
      <div className="flex flex-col items-center justify-center h-dvh gap-5 px-8 text-center"
        style={{ background: "hsl(var(--background))" }}>
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))" }}>
          <MessageSquare size={24} style={{ color: "hsl(var(--muted-foreground))" }} strokeWidth={1.5} />
        </div>
        <div>
          <p className="font-semibold text-base mb-2" style={{ color: "hsl(var(--foreground))" }}>
            Conversation not found
          </p>
          <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
            {error || "This link may have expired or been removed."}
          </p>
        </div>
        <button onClick={() => navigate("/")}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all active:scale-95"
          style={{ background: "hsl(var(--foreground))", color: "hsl(var(--background))" }}>
          <ArrowLeft size={14} />
          Go home
        </button>
      </div>
    );
  }

  // ── Conversation ──
  return (
    <div className="flex flex-col min-h-dvh" style={{ background: "hsl(var(--background))" }}>

      {/* Sticky top bar */}
      <header className="sticky top-0 z-10 flex-shrink-0 px-4 py-3 flex items-center gap-3"
        style={{ background: "hsl(var(--sidebar))", borderBottom: "1px solid hsl(var(--border))", backdropFilter: "blur(8px)" }}>

        {/* Logo / home link */}
        <button onClick={() => navigate("/")}
          className="flex items-center gap-2 flex-shrink-0"
          style={{ color: "hsl(var(--foreground))" }}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
            style={{ background: "hsl(var(--foreground))", color: "hsl(var(--background))" }}>
            D
          </div>
          <span className="font-semibold text-sm hidden sm:block">DeepSeek</span>
        </button>

        <div className="w-px h-5 mx-0.5 hidden sm:block" style={{ background: "hsl(var(--border))" }} />

        {/* Title */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: "hsl(var(--foreground))" }}>
            {conv.title}
          </p>
          <p className="text-[10px]" style={{ color: "hsl(var(--muted-foreground))" }}>
            Shared · {formatDate(conv.createdAt)}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <CopyLink />
          <button onClick={() => navigate("/chat/new")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95"
            style={{ background: "hsl(var(--foreground))", color: "hsl(var(--background))" }}>
            <ExternalLink size={11} />
            Start your own
          </button>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6">

        {/* Thread header */}
        <div className="text-center pb-4" style={{ borderBottom: "1px solid hsl(var(--border))" }}>
          <p className="text-[11px] font-semibold uppercase tracking-widest mb-1"
            style={{ color: "hsl(var(--muted-foreground))" }}>
            Shared conversation
          </p>
          <h1 className="text-xl font-bold tracking-tight" style={{ color: "hsl(var(--foreground))" }}>
            {conv.title}
          </h1>
          <p className="text-xs mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>
            {conv.messages.length} message{conv.messages.length !== 1 ? "s" : ""} · {formatDate(conv.createdAt)}
          </p>
        </div>

        {conv.messages.map(msg => (
          <MessageRow key={msg.id} msg={msg} />
        ))}

        {conv.messages.length === 0 && (
          <p className="text-center text-sm py-12" style={{ color: "hsl(var(--muted-foreground))" }}>
            This conversation has no messages.
          </p>
        )}
      </main>

      {/* Bottom CTA */}
      <footer className="flex-shrink-0 py-8 px-4 text-center"
        style={{ borderTop: "1px solid hsl(var(--border))" }}>
        <p className="text-sm mb-4" style={{ color: "hsl(var(--muted-foreground))" }}>
          Want to have your own conversation?
        </p>
        <button onClick={() => navigate("/chat/new")}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95"
          style={{ background: "hsl(var(--foreground))", color: "hsl(var(--background))" }}>
          Start a New Chat
        </button>
      </footer>

    </div>
  );
}
