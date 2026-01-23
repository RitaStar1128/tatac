import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";

// UX_RATIONALE:
// - progressive_disclosure: 必要な情報のみを提示し、詳細なチュートリアルは排除。
// - modal_design: アプリ全体のデザイン言語（Zen Monolith）と統一されたモーダルデザイン。

interface DescriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DescriptionModal({ isOpen, onClose }: DescriptionModalProps) {
  const { t } = useLanguage();

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
                <span className="bg-foreground text-background px-2 py-1">?</span>
                {t("about")}
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

            <div className="space-y-6">
              <div>
                <h3 className="font-bold text-lg mb-2 border-b-2 border-foreground inline-block">PHILOSOPHY</h3>
                <p className="text-muted-foreground font-medium leading-relaxed">
                  {t("aboutDesc")}
                </p>
              </div>

              <div className="bg-muted p-4 border border-border">
                <ul className="space-y-2 text-sm font-bold">
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-accent rounded-full" />
                    Input immediately upon opening
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-accent rounded-full" />
                    Auto-save on Enter or Close
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-accent rounded-full" />
                    Pure text, no distractions
                  </li>
                </ul>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
