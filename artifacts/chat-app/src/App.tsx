import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { useEffect, useState, useCallback, Component, type ReactNode, type ErrorInfo } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProvider } from "@/contexts/AppContext";
import Home from "@/pages/Home";
import Chat from "@/pages/Chat";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/not-found";
import SplashScreen from "@/components/SplashScreen";

const queryClient = new QueryClient();

// ── Error Boundary ────────────────────────────────────────────────────────────

interface EBState { error: Error | null }

class ErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  state: EBState = { error: null };

  static getDerivedStateFromError(error: Error): EBState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info);
  }

  handleRetry = () => {
    this.setState({ error: null });
    window.location.href = "/";
  };

  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", height: "100dvh", padding: "24px",
          background: "hsl(230 18% 6%)", color: "hsl(220 18% 93%)",
          fontFamily: "Inter, system-ui, sans-serif", textAlign: "center", gap: "16px",
        }}>
          <p style={{ fontSize: "32px" }}>⚠️</p>
          <p style={{ fontSize: "16px", fontWeight: 600 }}>Something went wrong</p>
          <p style={{ fontSize: "12px", color: "hsl(220 10% 48%)", maxWidth: "260px", lineHeight: 1.6 }}>
            {this.state.error.message}
          </p>
          <button
            onClick={this.handleRetry}
            style={{
              marginTop: "8px", padding: "10px 24px", borderRadius: "12px",
              background: "hsl(252 82% 68%)", color: "white",
              border: "none", fontSize: "13px", fontWeight: 600, cursor: "pointer",
            }}
          >
            Go Home
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Router ────────────────────────────────────────────────────────────────────

function StartRedirect() {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate("/chat/new", { replace: true });
  }, [navigate]);
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/start" component={StartRedirect} />
      <Route path="/chat/new" component={Chat} />
      <Route path="/chat/:id" component={Chat} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

function App() {
  const [showSplash, setShowSplash] = useState(true);
  const handleSplashDone = useCallback(() => setShowSplash(false), []);

  return (
    <ErrorBoundary>
      <AppProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <ErrorBoundary>
                <Router />
              </ErrorBoundary>
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </QueryClientProvider>
        {showSplash && <SplashScreen onDone={handleSplashDone} />}
      </AppProvider>
    </ErrorBoundary>
  );
}

export default App;
