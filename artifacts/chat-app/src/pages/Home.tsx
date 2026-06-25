import { useState, useEffect, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useListConversations, useDeleteConversation, getListConversationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Plus, Settings, Trash2, ChevronRight, Sun, Moon } from "lucide-react";
import { useAppContext } from "@/contexts/AppContext";
import PremiumModal from "@/components/PremiumModal";

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

interface SubStatus {
  status: string;
  plan: string | null;
  messageCount: number;
  limit: number;
  isActive: boolean;
}

const FREE_LIMIT = 20;

export default function Home() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { theme, toggleTheme, clientId, clientIdReady } = useAppContext();
  const { data: conversations = [], isLoading } = useListConversations();
  const deleteConversation = useDeleteConversation({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() }),
    },
  });
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [showPremium, setShowPremium] = useState(false);
  const [claimSubmitted, setClaimSubmitted] = useState(false);
  const [subStatus, setSubStatus] = useState<SubStatus | null>(null);

  const apiBase = import.meta.env.VITE_API_URL || "";

  const fetchSubStatus = useCallback(async () => {
    if (!clientId) return;
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

  useEffect(() => { fetchSubStatus(); }, [fetchSubStatus]);

  if (!clientIdReady) {
    return (
      <div className="flex items-center justify-center h-dvh" style={{ background: "hsl(var(--background))" }}>
        <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "hsl(var(--border))", borderTopColor: "hsl(var(--primary))" }} />
      </div>
    );
  }

  const isPremium = subStatus?.isActive ?? false;
  const isPending = subStatus?.status === "pending";
  const msgCount = subStatus?.messageCount ?? 0;
  const isLimited = subStatus !== null && !subStatus.isActive && msgCount >= FREE_LIMIT;
  const isApproaching = !isPremium && !isLimited && msgCount >= 15;

  const handleDeleteClick = (e: React.MouseEvent, id: number) => {
    e.preventDefault(); e.stopPropagation(); setConfirmDeleteId(id);
  };

  const handleConfirmDelete = async (e: React.MouseEvent, id: number) => {
    e.preventDefault(); e.stopPropagation();
    setDeletingId(id); setConfirmDeleteId(null);
    try { await deleteConversation.mutateAsync({ id }); }
    finally { setDeletingId(null); }
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation(); setConfirmDeleteId(null);
  };

  return (
    <div className="flex flex-col h-dvh overflow-hidden" style={{ background: "hsl(var(--background))" }}>

      {/* ── Header ── */}
      <div className="flex-shrink-0 px-5 pt-9 pb-6"
        style={{ borderBottom: "1px solid hsl(var(--border))" }}>

        <div className="flex items-center justify-between">
          {/* Wordmark */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0"
              style={{ background: "hsl(var(--foreground))", color: "hsl(var(--background))" }}>
              D
            </div>
            <div>
              <h1 className="font-bold text-base leading-none tracking-tight"
                style={{ color: "hsl(var(--foreground))" }}>
                DeepSeek
              </h1>
              <p className="text-[10px] mt-0.5 font-medium tracking-widest uppercase"
                style={{ color: "hsl(var(--muted-foreground))" }}>
                Uncensored
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            {!isPremium && subStatus !== null && (
              <button onClick={() => setShowPremium(true)}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all active:scale-95"
                style={{
                  background: isLimited ? "hsl(var(--foreground))" : "hsl(var(--muted))",
                  color: isLimited ? "hsl(var(--background))" : isApproaching ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
                  border: `1px solid ${isLimited ? "transparent" : "hsl(var(--border))"}`,
                }}>
                {isPending ? "Pending" : isLimited ? "Upgrade" : isApproaching ? `${FREE_LIMIT - msgCount} left` : "Free"}
              </button>
            )}
            {isPremium && (
              <span className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium"
                style={{ background: "hsl(var(--muted))", color: "hsl(142 52% 45%)", border: "1px solid hsl(var(--border))" }}>
                Premium ✓
              </span>
            )}
            <button onClick={toggleTheme}
              className="w-9 h-9 rounded-lg flex items-center justify-center transition-all active:scale-90"
              style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}
              title={theme === "dark" ? "Light mode" : "Dark mode"}>
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <Link href="/settings">
              <button className="w-9 h-9 rounded-lg flex items-center justify-center transition-all active:scale-90"
                style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
                <Settings size={15} />
              </button>
            </Link>
          </div>
        </div>

        {/* New Chat CTA */}
        <button onClick={() => navigate("/chat/new")}
          className="w-full mt-5 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all active:scale-[0.98]"
          style={{
            background: "hsl(var(--foreground))",
            color: "hsl(var(--background))",
          }}>
          <Plus size={15} strokeWidth={2.5} />
          New Chat
        </button>

        {isLimited && (
          <p className="text-center text-xs mt-3" style={{ color: "hsl(var(--muted-foreground))" }}>
            You've used all {FREE_LIMIT} free messages.{" "}
            <button onClick={() => setShowPremium(true)} className="font-semibold underline"
              style={{ color: "hsl(var(--primary))" }}>
              Upgrade to continue
            </button>
          </p>
        )}
      </div>

      {/* ── Conversation List ── */}
      <main className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="px-4 pt-5 flex flex-col gap-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 rounded-xl animate-pulse"
                style={{ background: "hsl(var(--muted))", opacity: 1 - i * 0.15 }} />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-8 text-center gap-4 pb-16">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))" }}>
              <MessageSquare size={28} style={{ color: "hsl(var(--muted-foreground))" }} strokeWidth={1.5} />
            </div>
            <div>
              <p className="font-semibold text-base mb-1" style={{ color: "hsl(var(--foreground))" }}>No chats yet</p>
              <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
                Tap "New Chat" above to start a conversation
              </p>
            </div>
          </div>
        ) : (
          <div className="px-4 pt-5 pb-8">
            <p className="text-[11px] font-semibold uppercase tracking-widest mb-3 px-1"
              style={{ color: "hsl(var(--muted-foreground))" }}>
              Recent
            </p>
            <div className="flex flex-col gap-1.5">
              {conversations.map((conv) => {
                const isConfirming = confirmDeleteId === conv.id;
                const isDeleting = deletingId === conv.id;

                return (
                  <Link key={conv.id} href={isConfirming ? "#" : `/chat/${conv.id}`}>
                    <div className="relative flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all active:scale-[0.99] group"
                      style={{
                        background: isConfirming ? "hsl(var(--destructive) / 0.06)" : "transparent",
                        border: `1px solid ${isConfirming ? "hsl(var(--destructive) / 0.3)" : "transparent"}`,
                      }}
                      onMouseEnter={e => {
                        if (!isConfirming) (e.currentTarget as HTMLElement).style.background = "hsl(var(--muted))";
                      }}
                      onMouseLeave={e => {
                        if (!isConfirming) (e.currentTarget as HTMLElement).style.background = "transparent";
                      }}>

                      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-semibold"
                        style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}>
                        {conv.title.slice(0, 2).toUpperCase()}
                      </div>

                      {isConfirming ? (
                        <div className="flex-1 flex items-center justify-between min-w-0 gap-2">
                          <p className="text-sm font-medium" style={{ color: "hsl(var(--destructive))" }}>
                            Delete this chat?
                          </p>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button onClick={(e) => handleConfirmDelete(e, conv.id)} disabled={isDeleting}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95"
                              style={{ background: "hsl(var(--destructive))", color: "white" }}>
                              {isDeleting ? "…" : "Delete"}
                            </button>
                            <button onClick={handleCancelDelete}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95"
                              style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate leading-tight"
                              style={{ color: "hsl(var(--foreground))" }}>
                              {conv.title}
                            </p>
                            <p className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
                              {formatDate(conv.createdAt)}
                            </p>
                          </div>
                          <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={(e) => handleDeleteClick(e, conv.id)} disabled={isDeleting}
                              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-90"
                              style={{ color: "hsl(var(--muted-foreground))" }}
                              onMouseEnter={e => {
                                (e.currentTarget as HTMLElement).style.color = "hsl(var(--destructive))";
                                (e.currentTarget as HTMLElement).style.background = "hsl(var(--destructive) / 0.08)";
                              }}
                              onMouseLeave={e => {
                                (e.currentTarget as HTMLElement).style.color = "hsl(var(--muted-foreground))";
                                (e.currentTarget as HTMLElement).style.background = "transparent";
                              }}>
                              <Trash2 size={13} />
                            </button>
                            <ChevronRight size={14} style={{ color: "hsl(var(--border))" }} />
                          </div>
                        </>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {showPremium && clientId && (
        <PremiumModal
          clientId={clientId}
          onClose={() => { setShowPremium(false); fetchSubStatus(); }}
          onClaimSubmitted={() => { setClaimSubmitted(true); fetchSubStatus(); }}
          claimStatus={claimSubmitted || isPending ? "pending" : "idle"}
          triggeredByLimit={isLimited}
        />
      )}
    </div>
  );
}
