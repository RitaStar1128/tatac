import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/useMobile";

// UX_RATIONALE:
// - progressive_disclosure: 必要な情報のみを提示し、詳細なチュートリアルは排除。
// - modal_design: アプリ全体のデザイン言語（Zen Monolith）と統一されたモーダルデザイン。

interface DescriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DescriptionModal({ isOpen, onClose }: DescriptionModalProps) {
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const usageKeys = isMobile
    ? ["aboutMobileBullet1", "aboutMobileBullet2", "aboutMobileBullet3", "aboutMobileBullet4"]
    : ["aboutPcBullet1", "aboutPcBullet2", "aboutPcBullet3", "aboutPcBullet4"];

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
            className="w-full max-w-md bg-card border-2 border-foreground shadow-none relative max-h-[80vh] flex flex-col overflow-hidden"
          >
            <div className="flex justify-between items-center border-b-2 border-foreground bg-card px-6 py-4 sticky top-0 z-10">
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

            <div className="space-y-6 p-6 overflow-y-auto flex-1 modal-scroll">
              <div className="space-y-3">
                <h3 className="font-bold text-lg mb-2 border-b-2 border-foreground inline-block">
                  {t("aboutPhilosophyTitle")}
                </h3>
                <p className="text-muted-foreground font-medium leading-relaxed">
                  {t("aboutDesc")}
                </p>
                <p className="text-muted-foreground font-medium leading-relaxed">
                  {t("aboutDescDetail")}
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="font-bold text-lg border-b-2 border-foreground inline-block">
                  {t("aboutUsageTitle")}
                </h3>
                <div className="bg-muted p-4 border border-border">
                  <ul className="space-y-2 text-sm font-bold">
                    {usageKeys.map((key) => (
                      <li key={key} className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-accent rounded-full" />
                        {t(key)}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
