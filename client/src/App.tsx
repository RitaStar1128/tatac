import { Toaster } from "@/components/ui/sonner";
import { ReloadPrompt } from "@/components/ReloadPrompt";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import Home from "./pages/Home";
import History from "./pages/History";
import Edit from "./pages/Edit";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/history" component={History} />
      <Route path="/edit/:id" component={Edit} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
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
            <ReloadPrompt />
            <Router />
          </TooltipProvider>
        </LanguageProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
