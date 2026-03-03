import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, ReactNode } from "react";

const isDev = import.meta.env.DEV;

const errorMessages = {
  ja: {
    unexpected: "予期しないエラーが発生しました。",
    reload: "ページを再読み込み",
  },
  en: {
    unexpected: "An unexpected error occurred.",
    reload: "Reload Page",
  },
};

const getPreferredLanguage = () => {
  try {
    const stored = localStorage.getItem("tatac_language");
    if (stored === "ja" || stored === "en") return stored;
  } catch {
    // Ignore storage access errors.
  }
  if (typeof navigator !== "undefined") {
    const lang = navigator.language.toLowerCase();
    return lang.startsWith("ja") ? "ja" : "en";
  }
  return "en";
};

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      const lang = getPreferredLanguage();
      const copy = errorMessages[lang] ?? errorMessages.en;

      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-2xl p-8">
            <AlertTriangle
              size={48}
              className="text-destructive mb-6 flex-shrink-0"
            />

            <h2 className="text-xl mb-4">{copy.unexpected}</h2>
            {isDev && this.state.error?.stack && (
              <div className="p-4 w-full rounded bg-muted overflow-auto mb-6">
                <pre className="text-sm text-muted-foreground whitespace-break-spaces">
                  {this.state.error.stack}
                </pre>
              </div>
            )}

            <button
              onClick={() => window.location.reload()}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg",
                "bg-primary text-primary-foreground",
                "hover:opacity-90 cursor-pointer"
              )}
            >
              <RotateCcw size={16} />
              {copy.reload}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
