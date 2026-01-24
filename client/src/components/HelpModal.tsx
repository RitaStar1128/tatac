import { HelpCircle, Zap, CheckCircle, Shield } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { X } from "lucide-react";
import { modalBodyClass, modalCloseButtonClass, modalContentClass, modalHeaderClass, modalIconBoxClass, modalTitleClass } from "@/components/modalStyles";

// UX_RATIONALE:
// - consistency: 他のモーダル（Settings, Export, PWA）と構造・デザインを統一し、学習コストを下げる。
// - visual_hierarchy: アイコンと太字を使って、重要なポイントを視覚的に強調する。

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HelpModal({ isOpen, onClose }: HelpModalProps) {
  const { t } = useLanguage();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={modalContentClass}>
        <DialogHeader className={modalHeaderClass}>
          <div className="flex items-center gap-3">
            <div className={modalIconBoxClass}>
              <HelpCircle className="w-6 h-6 text-primary-foreground" strokeWidth={3} />
            </div>
            <DialogTitle className={modalTitleClass}>
              {t("helpTitle")}
            </DialogTitle>
          </div>
          <DialogClose asChild>
            <button className={modalCloseButtonClass}>
              <X className="w-6 h-6" strokeWidth={4} />
            </button>
          </DialogClose>
        </DialogHeader>

        <div className={`${modalBodyClass} p-6 space-y-8`}>
          
          {/* Philosophy Section */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-6 h-6 text-primary" strokeWidth={3} />
              <h3 className="text-lg font-black uppercase tracking-wide border-b-4 border-primary inline-block leading-none pb-1">
                {t("helpPhilosophyTitle")}
              </h3>
            </div>
            
            <p className="text-base font-bold leading-relaxed text-foreground/90">
              {t("helpPhilosophyLead")}
            </p>
            <p className="text-sm font-medium leading-relaxed text-muted-foreground">
              {t("helpPhilosophyBody")}
            </p>
          </section>

          {/* How to Use Section */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-6 h-6 text-primary" strokeWidth={3} />
              <h3 className="text-lg font-black uppercase tracking-wide border-b-4 border-primary inline-block leading-none pb-1">
                {t("helpHowToTitle")}
              </h3>
            </div>

            <ul className="space-y-4">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-black dark:bg-white text-white dark:text-black font-bold flex items-center justify-center text-xs border-2 border-black dark:border-white">1</span>
                <div>
                  <p className="font-bold text-sm">{t("helpStep1Title")}</p>
                  <p className="text-xs text-muted-foreground">{t("helpStep1Desc")}</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-black dark:bg-white text-white dark:text-black font-bold flex items-center justify-center text-xs border-2 border-black dark:border-white">2</span>
                <div>
                  <p className="font-bold text-sm">{t("helpStep2Title")}</p>
                  <p className="text-xs text-muted-foreground">{t("helpStep2Desc")}</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-black dark:bg-white text-white dark:text-black font-bold flex items-center justify-center text-xs border-2 border-black dark:border-white">3</span>
                <div>
                  <p className="font-bold text-sm">{t("helpStep3Title")}</p>
                  <p className="text-xs text-muted-foreground">{t("helpStep3Desc")}</p>
                </div>
              </li>
            </ul>
          </section>

          {/* Privacy Note */}
          <section className="bg-muted p-4 border-2 border-black/10 dark:border-white/10 rounded-sm">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4 text-muted-foreground" />
              <h4 className="text-sm font-bold uppercase text-muted-foreground">
                {t("helpPrivacyTitle")}
              </h4>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t("helpPrivacyBody")}
            </p>
          </section>

        </div>
      </DialogContent>
    </Dialog>
  );
}
