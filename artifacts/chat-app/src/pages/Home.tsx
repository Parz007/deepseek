import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useListConversations, useDeleteConversation, getListConversationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Plus, Settings, Trash2, Sparkles, ChevronRight, Sun, Moon } from "lucide-react";
import { useAppContext } from "@/contexts/AppContext";

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const AVATAR_COLORS = [
  ["252 82% 68%", "198 80% 56%"],
  ["198 80% 56%", "142 62% 52%"],
  ["142 62% 52%", "252 82% 68%"],
  ["38 92% 60%", "252 82% 68%"],
  ["0 68% 62%", "252 82% 68%"],
];

export default function Home() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { theme, toggleTheme } = useAppContext();
  const { data: conversations = [], isLoading } = useListConversations();
  const deleteConversation = useDeleteConversation({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() }),
    },
  });
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const handleDeleteClick = (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmDeleteId(id);
  };

  const handleConfirmDelete = async (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDeletingId(id);
    setConfirmDeleteId(null);
    try { await deleteConversation.mutateAsync({ id }); }
    finally { setDeletingId(null); }
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmDeleteId(null);
  };

  return (
    <div className="flex flex-col h-dvh overflow-hidden" style={{ background: "hsl(var(--background))" }}>

      {/* ── Hero Header ── */}
      <div
        className="relative flex-shrink-0 px-5 pt-10 pb-7"
        style={{
          background: "linear-gradient(180deg, hsl(252 82% 68% / 0.1) 0%, transparent 100%)",
          borderBottom: "1px solid hsl(var(--border))",
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2"
          style={{
            width: 280,
            height: 120,
            background: "radial-gradient(ellipse at center, hsl(252 82% 68% / 0.15) 0%, transparent 70%)",
            filter: "blur(32px)",
          }}
        />

        <div className="relative flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{
                background: "linear-gradient(135deg, hsl(252 82% 68%), hsl(198 80% 56%))",
                boxShadow: "0 4px 16px hsl(252 82% 68% / 0.4)",
              }}
            >
              <Sparkles size={16} className="text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-none tracking-tight" style={{ color: "hsl(var(--foreground))" }}>
                DeepSeek
              </h1>
              <p className="text-[11px] mt-0.5 font-semibold tracking-widest uppercase" style={{ color: "hsl(var(--primary))" }}>
                Research Sandbox
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-90"
              style={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                color: "hsl(var(--muted-foreground))",
              }}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <Link href="/settings">
              <button
                className="w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-90"
                style={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  color: "hsl(var(--muted-foreground))",
                }}
              >
                <Settings size={16} />
              </button>
            </Link>
          </div>
        </div>

        {/* New Chat CTA */}
        <button
          onClick={() => navigate("/chat/new")}
          className="relative w-full mt-5 flex items-center justify-center gap-2.5 py-3.5 rounded-2xl font-semibold text-sm transition-all active:scale-[0.98]"
          style={{
            background: "linear-gradient(135deg, hsl(252 82% 68%), hsl(252 75% 60%))",
            color: "white",
            boxShadow: "0 4px 20px hsl(252 82% 68% / 0.45), inset 0 1px 0 rgba(255,255,255,0.15)",
          }}
        >
          <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
            <Plus size={13} strokeWidth={2.5} />
          </div>
          Start New Chat
        </button>
      </div>

      {/* ── List ── */}
      <main className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="px-4 pt-5 flex flex-col gap-3">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="h-[72px] rounded-2xl animate-pulse"
                style={{ background: "hsl(var(--card))", opacity: 1 - i * 0.15 }}
              />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-8 text-center gap-5 pb-12">
            <div
              className="w-20 h-20 rounded-3xl flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, hsl(252 82% 68% / 0.12), hsl(198 80% 56% / 0.06))",
                border: "1px solid hsl(252 82% 68% / 0.18)",
                boxShadow: "0 8px 32px hsl(252 82% 68% / 0.1)",
              }}
            >
              <MessageSquare size={32} style={{ color: "hsl(var(--primary))" }} strokeWidth={1.5} />
            </div>
            <div>
              <p className="font-bold text-lg mb-1.5" style={{ color: "hsl(var(--foreground))" }}>No chats yet</p>
              <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
                Tap "Start New Chat" above to begin a conversation
              </p>
            </div>
          </div>
        ) : (
          <div className="px-4 pt-5 pb-8">
            <p className="text-xs font-semibold uppercase tracking-widest mb-3 px-1" style={{ color: "hsl(var(--muted-foreground))" }}>
              Recent
            </p>
            <div className="flex flex-col gap-2.5">
              {conversations.map((conv, i) => {
                const colors = AVATAR_COLORS[i % AVATAR_COLORS.length];
                const initials = conv.title.slice(0, 2).toUpperCase();
                const isConfirming = confirmDeleteId === conv.id;
                const isDeleting = deletingId === conv.id;

                return (
                  <Link key={conv.id} href={isConfirming ? "#" : `/chat/${conv.id}`}>
                    <div
                      className="relative flex items-center gap-3.5 px-4 py-3.5 rounded-2xl transition-all active:scale-[0.98]"
                      style={{
                        background: "hsl(var(--card))",
                        border: `1px solid ${isConfirming ? "hsl(var(--destructive) / 0.4)" : "hsl(var(--card-border))"}`,
                        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                      }}
                    >
                      <div
                        className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-bold text-white"
                        style={{
                          background: `linear-gradient(135deg, hsl(${colors[0]}), hsl(${colors[1]}))`,
                          boxShadow: `0 3px 10px hsl(${colors[0]} / 0.4)`,
                          letterSpacing: "0.05em",
                        }}
                      >
                        {initials}
                      </div>

                      {isConfirming ? (
                        /* ── Confirm delete state ── */
                        <div className="flex-1 flex items-center justify-between min-w-0 gap-2">
                          <p className="text-sm font-medium" style={{ color: "hsl(var(--destructive))" }}>
                            Delete this chat?
                          </p>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button
                              onClick={(e) => handleConfirmDelete(e, conv.id)}
                              disabled={isDeleting}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95"
                              style={{ background: "hsl(var(--destructive))", color: "white" }}
                            >
                              {isDeleting ? "…" : "Delete"}
                            </button>
                            <button
                              onClick={handleCancelDelete}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95"
                              style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* ── Normal state ── */
                        <>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate leading-tight" style={{ color: "hsl(var(--foreground))" }}>
                              {conv.title}
                            </p>
                            <p className="text-xs mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>
                              {formatDate(conv.createdAt)}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {/* Delete button — always visible on mobile */}
                            <button
                              onClick={(e) => handleDeleteClick(e, conv.id)}
                              disabled={isDeleting}
                              className="w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-90"
                              style={{
                                color: "hsl(var(--muted-foreground))",
                                background: "transparent",
                              }}
                              onMouseEnter={e => {
                                (e.currentTarget as HTMLElement).style.color = "hsl(var(--destructive))";
                                (e.currentTarget as HTMLElement).style.background = "hsl(var(--destructive) / 0.1)";
                              }}
                              onMouseLeave={e => {
                                (e.currentTarget as HTMLElement).style.color = "hsl(var(--muted-foreground))";
                                (e.currentTarget as HTMLElement).style.background = "transparent";
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                            <ChevronRight size={15} style={{ color: "hsl(var(--muted-foreground))" }} />
                          </div>
                        </>
                      )}

                      <div
                        className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full"
                        style={{ background: `linear-gradient(to bottom, hsl(${colors[0]}), hsl(${colors[1]}))` }}
                      />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </main>

    </div>
  );
}
