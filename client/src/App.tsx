import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { ReloadPrompt } from "@/components/ReloadPrompt";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAppBootstrap } from "@/app/useAppBootstrap";
import { useAutoSync } from "@/app/useAutoSync";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";

const Home = lazy(() => import("./pages/Home"));
const History = lazy(() => import("./pages/History"));
const Edit = lazy(() => import("./pages/Edit"));
const SyncSettingsPage = lazy(() => import("./pages/SyncSettings"));
const ManualSyncPage = lazy(() => import("./pages/ManualSync"));
const SyncPairPage = lazy(() => import("./pages/SyncPair"));

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/history" component={History} />
      <Route path="/edit/:id" component={Edit} />
      <Route path="/sync-settings" component={SyncSettingsPage} />
      <Route path="/sync-pair" component={SyncPairPage} />
      <Route path="/manual-sync" component={ManualSyncPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function BootScreen({ error }: { error: Error | null }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="w-full max-w-md border-2 border-foreground bg-card p-8 text-center">
        <div className="mb-3 text-xs font-black uppercase tracking-[0.4em] text-muted-foreground">
          TATAC
        </div>
        <h1 className="text-2xl font-black uppercase tracking-tight">
          {error ? "Offline Store Error" : "Preparing Local Vault"}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {error
            ? error.message
            : "Bootstrapping IndexedDB, oplog storage, and legacy migration before the app opens."}
        </p>
      </div>
    </div>
  );
}

function App() {
  const bootstrap = useAppBootstrap();
  useAutoSync(bootstrap.ready);
  // Set document title for SEO (30-60 characters)
  if (typeof document !== 'undefined') {
    document.title = "TATAC - Reflex Input Memo App for Instant Thought Capture";
  }

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <LanguageProvider>
          <TooltipProvider>
            <Toaster />
            {bootstrap.ready ? (
              <>
                <ReloadPrompt />
                <Suspense fallback={<BootScreen error={null} />}>
                  <Router />
                </Suspense>
              </>
            ) : (
              <BootScreen error={bootstrap.error} />
            )}
          </TooltipProvider>
        </LanguageProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
