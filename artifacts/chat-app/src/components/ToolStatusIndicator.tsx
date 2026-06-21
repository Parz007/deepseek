/**
 * ToolStatusIndicator
 *
 * Displays an animated pill for each active tool call while the AI is gathering
 * live data. Rendered above the streaming reply bubble in Chat.tsx.
 *
 * PLACEMENT — inside your assistant message bubble, above the markdown content:
 *
 *   {activeToolStatuses.length > 0 && (
 *     <ToolStatusIndicator statuses={activeToolStatuses} />
 *   )}
 *   <MarkdownContent>{streamingContent}</MarkdownContent>
 *
 * See Chat_patch.txt for the full SSE event-handler integration.
 */

import { useEffect, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ToolStatus {
  /** Internal tool name, e.g. "web_search" or "fetch_url" */
  tool: string;
  /** Human-readable animated label, e.g. "🔍 Searching the web…" */
  label: string;
  /** Optional: the search query or URL being fetched */
  detail?: string;
}

interface Props {
  statuses: ToolStatus[];
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ToolStatusIndicator({ statuses }: Props) {
  const [dots, setDots] = useState(".");

  // Animate the trailing dots so the label feels alive
  useEffect(() => {
    const id = setInterval(() => {
      setDots(d => (d.length >= 3 ? "." : d + "."));
    }, 420);
    return () => clearInterval(id);
  }, []);

  if (statuses.length === 0) return null;

  return (
    <div style={wrapStyle}>
      {statuses.map((s, i) => (
        <div key={`${s.tool}-${i}`} style={pillStyle}>
          {/* Pulsing dot */}
          <span style={dotStyle} />

          {/* Label — strip the static ellipsis from the server label and
              replace with our animated dots so they stay in sync */}
          <span style={labelStyle}>
            {s.label.replace(/…$/, "")}
            <span style={dotsStyle}>{dots}</span>
          </span>

          {/* Detail — truncated query / URL shown in muted text */}
          {s.detail && (
            <span style={detailStyle} title={s.detail}>
              {truncate(s.detail, 48)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function truncate(str: string, max: number): string {
  return str.length <= max ? str : str.slice(0, max) + "…";
}

// ── Inline styles ─────────────────────────────────────────────────────────────
// Inline styles keep this component fully self-contained and portable.
// Feel free to convert to Tailwind classes or CSS modules in your project.

const wrapStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  marginBottom: "10px",
};

const pillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  padding: "5px 12px",
  borderRadius: "999px",
  background: "rgba(99, 102, 241, 0.12)",
  border: "1px solid rgba(99, 102, 241, 0.25)",
  fontSize: "12px",
  lineHeight: 1,
  width: "fit-content",
  maxWidth: "100%",
  overflow: "hidden",
};

const dotStyle: React.CSSProperties = {
  width: "7px",
  height: "7px",
  borderRadius: "50%",
  background: "hsl(252 82% 68%)",
  flexShrink: 0,
  animation: "toolPulse 1.2s ease-in-out infinite",
};

const labelStyle: React.CSSProperties = {
  color: "hsl(252 70% 75%)",
  fontWeight: 500,
  whiteSpace: "nowrap",
  letterSpacing: "0.01em",
};

const dotsStyle: React.CSSProperties = {
  display: "inline-block",
  width: "18px", // fixed width so label doesn't shift
  textAlign: "left",
};

const detailStyle: React.CSSProperties = {
  color: "hsl(220 10% 55%)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: "11px",
};

// ── Keyframe injection ────────────────────────────────────────────────────────
// Injects the pulse animation once if not already present.

if (typeof document !== "undefined") {
  const STYLE_ID = "__tool-status-pulse";
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      @keyframes toolPulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50%       { opacity: 0.35; transform: scale(0.7); }
      }
    `;
    document.head.appendChild(style);
  }
}
