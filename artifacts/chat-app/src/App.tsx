import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { useEffect, useState, useCallback } from "react";
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

function App() {
  const [showSplash, setShowSplash] = useState(true);
  const handleSplashDone = useCallback(() => setShowSplash(false), []);

  return (
    <AppProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
      {showSplash && <SplashScreen onDone={handleSplashDone} />}
    </AppProvider>
  );
}

export default App;
