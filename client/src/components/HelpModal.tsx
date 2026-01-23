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
  const { t, language } = useLanguage();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={modalContentClass}>
        <DialogHeader className={modalHeaderClass}>
          <div className="flex items-center gap-3">
            <div className={modalIconBoxClass}>
              <HelpCircle className="w-6 h-6 text-primary-foreground" strokeWidth={3} />
            </div>
            <DialogTitle className={modalTitleClass}>
              {language === 'ja' ? 'サクキロについて' : 'ABOUT SAKUKIRO'}
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
                {language === 'ja' ? 'アプリの思想' : 'PHILOSOPHY'}
              </h3>
            </div>
            
            <p className="text-base font-bold leading-relaxed text-foreground/90">
              {language === 'ja' 
                ? '「サクキロ」は、その名の通り「サクッと支出記録」することを極限まで追求したアプリです。' 
                : '"SAKUKIRO" is designed for one purpose: to track expenses with lightning speed.'}
            </p>
            <p className="text-sm font-medium leading-relaxed text-muted-foreground">
              {language === 'ja'
                ? 'アプリを開いた瞬間に記録が完了する体験を提供することで、「記録忘れ」という最大の課題を解決します。複雑な分析機能よりも、日々の入力の速さと心地よさを最優先に設計されています。'
                : 'By enabling instant recording the moment you open the app, we solve the biggest problem: forgetting to track. We prioritize speed and comfort over complex analytics.'}
            </p>
          </section>

          {/* How to Use Section */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-6 h-6 text-primary" strokeWidth={3} />
              <h3 className="text-lg font-black uppercase tracking-wide border-b-4 border-primary inline-block leading-none pb-1">
                {language === 'ja' ? '使い方' : 'HOW TO USE'}
              </h3>
            </div>

            <ul className="space-y-4">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-black dark:bg-white text-white dark:text-black font-bold flex items-center justify-center text-xs border-2 border-black dark:border-white">1</span>
                <div>
                  <p className="font-bold text-sm">{language === 'ja' ? '金額を入力' : 'Enter Amount'}</p>
                  <p className="text-xs text-muted-foreground">{language === 'ja' ? 'アプリを開いたらすぐにテンキーで金額を入力します。' : 'Type the amount immediately using the keypad.'}</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-black dark:bg-white text-white dark:text-black font-bold flex items-center justify-center text-xs border-2 border-black dark:border-white">2</span>
                <div>
                  <p className="font-bold text-sm">{language === 'ja' ? 'カテゴリを選択（任意）' : 'Select Category (Optional)'}</p>
                  <p className="text-xs text-muted-foreground">{language === 'ja' ? '必要であればカテゴリを選びます。デフォルトのままでもOK。' : 'Choose a category if needed. Default is fine too.'}</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-black dark:bg-white text-white dark:text-black font-bold flex items-center justify-center text-xs border-2 border-black dark:border-white">3</span>
                <div>
                  <p className="font-bold text-sm">{language === 'ja' ? '確定ボタンをタップ' : 'Tap Confirm'}</p>
                  <p className="text-xs text-muted-foreground">{language === 'ja' ? 'これだけで記録完了。すぐに次の入力ができます。' : 'Done. You are ready for the next entry instantly.'}</p>
                </div>
              </li>
            </ul>
          </section>

          {/* Privacy Note */}
          <section className="bg-muted p-4 border-2 border-black/10 dark:border-white/10 rounded-sm">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4 text-muted-foreground" />
              <h4 className="text-sm font-bold uppercase text-muted-foreground">
                {language === 'ja' ? 'データについて' : 'DATA PRIVACY'}
              </h4>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {language === 'ja'
                ? '入力されたデータは、お使いのブラウザ内にのみ保存されます。外部サーバーに送信されることはありません。'
                : 'Your data is stored only within your browser. It is never sent to external servers.'}
            </p>
          </section>

        </div>
      </DialogContent>
    </Dialog>
  );
}
