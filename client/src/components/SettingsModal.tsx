import { X, Monitor, Moon, Sun, Globe, Settings as SettingsIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";

// UX_RATIONALE:
// - modal_design: DescriptionModalと統一されたデザイン。
// - direct_manipulation: 設定変更が即座に反映されるUI。

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { t, language, setLanguage } = useLanguage();
  const { theme, setTheme } = useTheme();

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-card border-2 border-foreground p-6 shadow-none relative"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black tracking-tighter uppercase flex items-center gap-2">
                <span className="bg-foreground text-background px-2 py-1">
                  <SettingsIcon className="w-4 h-4" />
                </span>
                {t("settings")}
              </h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="rounded-none hover:bg-destructive hover:text-destructive-foreground transition-colors"
              >
                <X className="w-6 h-6" />
              </Button>
            </div>

            <div className="space-y-8">
              {/* Language Section */}
              <div className="space-y-3">
                <label className="text-xs font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                  <Globe className="w-3 h-3" />
                  {t("language")}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setLanguage("ja")}
                    className={`p-3 text-sm font-bold border-2 transition-all ${
                      language === "ja"
                        ? "bg-accent text-accent-foreground border-accent"
                        : "bg-transparent border-muted-foreground/20 hover:border-foreground"
                    }`}
                  >
                    日本語
                  </button>
                  <button
                    onClick={() => setLanguage("en")}
                    className={`p-3 text-sm font-bold border-2 transition-all ${
                      language === "en"
                        ? "bg-accent text-accent-foreground border-accent"
                        : "bg-transparent border-muted-foreground/20 hover:border-foreground"
                    }`}
                  >
                    English
                  </button>
                </div>
              </div>

              {/* Theme Section */}
              <div className="space-y-3">
                <label className="text-xs font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                  <Moon className="w-3 h-3" />
                  {t("theme")}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setTheme("light")}
                    className={`p-3 flex flex-col items-center gap-2 border-2 transition-all ${
                      theme === "light"
                        ? "bg-accent text-accent-foreground border-accent"
                        : "bg-transparent border-muted-foreground/20 hover:border-foreground"
                    }`}
                  >
                    <Sun className="w-5 h-5" />
                    <span className="text-xs font-bold">{t("light")}</span>
                  </button>
                  <button
                    onClick={() => setTheme("dark")}
                    className={`p-3 flex flex-col items-center gap-2 border-2 transition-all ${
                      theme === "dark"
                        ? "bg-accent text-accent-foreground border-accent"
                        : "bg-transparent border-muted-foreground/20 hover:border-foreground"
                    }`}
                  >
                    <Moon className="w-5 h-5" />
                    <span className="text-xs font-bold">{t("dark")}</span>
                  </button>
                  <button
                    onClick={() => setTheme("system")}
                    className={`p-3 flex flex-col items-center gap-2 border-2 transition-all ${
                      theme === "system"
                        ? "bg-accent text-accent-foreground border-accent"
                        : "bg-transparent border-muted-foreground/20 hover:border-foreground"
                    }`}
                  >
                    <Monitor className="w-5 h-5" />
                    <span className="text-xs font-bold">{t("system")}</span>
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
