import {
  Globe,
  Monitor,
  Moon,
  Settings as SettingsIcon,
  Smartphone,
  Sun,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useIsMobile } from "@/hooks/useMobile";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenMobileQr?: () => void;
}

export function SettingsModal({ isOpen, onClose, onOpenMobileQr }: SettingsModalProps) {
  const { t, language, setLanguage } = useLanguage();
  const { theme, setTheme } = useTheme();
  const isMobile = useIsMobile();
  const closeLabel = language === "ja" ? "設定を閉じる" : "Close settings";

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(event) => event.stopPropagation()}
            className="relative flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden border-2 border-foreground bg-card shadow-none"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b-2 border-foreground bg-card px-6 py-4">
              <h2 className="flex items-center gap-2 text-xl font-black uppercase tracking-tighter">
                <span className="bg-foreground px-2 py-1 text-background">
                  <SettingsIcon className="h-4 w-4" />
                </span>
                {t("settings")}
              </h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                aria-label={closeLabel}
                title={closeLabel}
                className="rounded-none transition-colors hover:bg-destructive hover:text-destructive-foreground"
              >
                <X className="h-6 w-6" />
              </Button>
            </div>

            <div className="modal-scroll flex-1 space-y-8 overflow-y-auto p-6">
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-muted-foreground">
                  <Globe className="h-3 w-3" />
                  {t("language")}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setLanguage("ja")}
                    className={`border-2 p-3 text-sm font-bold transition-all ${
                      language === "ja"
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-muted-foreground/20 bg-transparent hover:border-foreground"
                    }`}
                  >
                    {t("languageJa")}
                  </button>
                  <button
                    onClick={() => setLanguage("en")}
                    className={`border-2 p-3 text-sm font-bold transition-all ${
                      language === "en"
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-muted-foreground/20 bg-transparent hover:border-foreground"
                    }`}
                  >
                    {t("languageEn")}
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <label className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-muted-foreground">
                  <Moon className="h-3 w-3" />
                  {t("theme")}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setTheme("light")}
                    className={`flex flex-col items-center gap-2 border-2 p-3 transition-all ${
                      theme === "light"
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-muted-foreground/20 bg-transparent hover:border-foreground"
                    }`}
                  >
                    <Sun className="h-5 w-5" />
                    <span className="text-xs font-bold">{t("light")}</span>
                  </button>
                  <button
                    onClick={() => setTheme("dark")}
                    className={`flex flex-col items-center gap-2 border-2 p-3 transition-all ${
                      theme === "dark"
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-muted-foreground/20 bg-transparent hover:border-foreground"
                    }`}
                  >
                    <Moon className="h-5 w-5" />
                    <span className="text-xs font-bold">{t("dark")}</span>
                  </button>
                  <button
                    onClick={() => setTheme("system")}
                    className={`flex flex-col items-center gap-2 border-2 p-3 transition-all ${
                      theme === "system"
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-muted-foreground/20 bg-transparent hover:border-foreground"
                    }`}
                  >
                    <Monitor className="h-5 w-5" />
                    <span className="text-xs font-bold">{t("system")}</span>
                  </button>
                </div>
              </div>

              {!isMobile && onOpenMobileQr && (
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-muted-foreground">
                    <Smartphone className="h-3 w-3" />
                    {t("mobileQr")}
                  </label>
                  <Button
                    variant="outline"
                    onClick={onOpenMobileQr}
                    className="w-full rounded-none border-2 border-foreground font-bold hover:bg-accent"
                  >
                    {t("mobileQrButton")}
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
