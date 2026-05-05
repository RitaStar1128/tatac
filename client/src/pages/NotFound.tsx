import { Button } from "@/components/ui/button";
import { Home, TriangleAlert } from "lucide-react";
import { useLocation } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";

export default function NotFound() {
  const [, setLocation] = useLocation();
  const { t } = useLanguage();

  const handleGoHome = () => {
    setLocation("/");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="w-full max-w-md border-2 border-foreground bg-card p-8 text-center">
        <div className="mb-6 flex justify-center">
          <span className="flex h-14 w-14 items-center justify-center border-2 border-foreground bg-foreground text-background">
            <TriangleAlert className="h-7 w-7" />
          </span>
        </div>

        <h1 className="text-5xl font-black tracking-tight">404</h1>

        <h2 className="mt-2 text-lg font-black uppercase tracking-tight">
          {t("notFoundTitle")}
        </h2>

        <p className="mt-4 text-sm text-muted-foreground">
          {t("notFoundMessage1")}
          <br />
          {t("notFoundMessage2")}
        </p>

        <div className="mt-8 flex justify-center">
          <Button
            onClick={handleGoHome}
            className="h-12 rounded-none border-2 border-foreground bg-foreground font-black uppercase tracking-[0.2em] text-background hover:bg-foreground/90"
          >
            <Home className="mr-2 h-4 w-4" />
            {t("goHome")}
          </Button>
        </div>
      </div>
    </div>
  );
}
