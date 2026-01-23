import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { QRCodeSVG } from "qrcode.react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Smartphone, Share, PlusSquare, MoreVertical, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { useIsMobile } from "@/hooks/useMobile";

// UX_RATIONALE:
// - progressive_disclosure: ユーザーの環境（PC/スマホブラウザ/PWA）に応じて必要な情報のみを表示。
// - social_proof: 「ホーム画面に追加」の手順を具体的に示すことで、ユーザーの行動を促す。
// - fitts_law: モバイルでのバナーは画面下部に配置し、親指でタップしやすい位置に。

export interface PWAInstallPromptHandle {
  open: () => void;
}

export const PWAInstallPrompt = forwardRef<PWAInstallPromptHandle>((_, ref) => {
  const { t, language } = useLanguage();
  const isMobile = useIsMobile();
  const [isPWA, setIsPWA] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showPcQr, setShowPcQr] = useState(false);
  const [currentUrl, setCurrentUrl] = useState("");
  const [activePlatform, setActivePlatform] = useState<"ios" | "android">("ios");

  useImperativeHandle(ref, () => ({
    open: () => {
      if (!isMobile) {
        setShowPcQr(true);
        return;
      }
      setShowModal(true);
    }
  }));

  useEffect(() => {
    // Check if running as PWA
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                         (window.navigator as any).standalone || 
                         document.referrer.includes('android-app://');
    setIsPWA(isStandalone);

    // Set current URL for QR code
    setCurrentUrl(window.location.href);

    // Show banner if mobile and not PWA, and NOT already dismissed
    if (isMobile && !isStandalone) {
      const hasDismissed = localStorage.getItem("tatac_pwa_banner_dismissed");
      if (!hasDismissed) {
        setShowBanner(true);
      }
    }
  }, [isMobile]);

  const handleDismissBanner = () => {
    setShowBanner(false);
    localStorage.setItem("tatac_pwa_banner_dismissed", "true");
  };

  if (isPWA) return null;

  return (
    <>
      {/* PC QR Code Modal */}
      <AnimatePresence>
        {showPcQr && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
            onClick={() => setShowPcQr(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-card border-2 border-foreground text-center relative shadow-none max-h-[80vh] flex flex-col overflow-hidden"
            >
              <div className="border-b-2 border-foreground bg-card px-6 py-4 sticky top-0 z-10 relative">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowPcQr(false)}
                  className="absolute right-2 top-2 rounded-none hover:bg-destructive hover:text-destructive-foreground transition-colors"
                >
                  <X className="w-6 h-6" />
                </Button>
                <div className="flex flex-col items-center gap-2">
                  <Smartphone className="w-12 h-12 text-foreground" strokeWidth={2} />
                  <h2 className="text-2xl font-black uppercase tracking-tighter">
                    {language === 'ja' ? 'スマホでの利用を推奨' : 'Mobile Recommended'}
                  </h2>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-6 modal-scroll">
                <p className="text-sm font-bold text-muted-foreground">
                  {language === 'ja' 
                    ? 'このアプリはスマートフォンでの利用に最適化されています。以下のQRコードを読み取ってアクセスしてください。' 
                    : 'This app is optimized for mobile use. Scan the QR code below to access on your phone.'}
                </p>
                
                <div className="bg-white p-4 border-2 border-black inline-block">
                  <QRCodeSVG value={currentUrl} size={180} />
                </div>
                
                <p className="text-xs font-mono text-muted-foreground break-all">
                  {currentUrl}
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Bottom Banner */}
      <AnimatePresence>
        {showBanner && isMobile && (
          <motion.div
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            className="fixed bottom-0 left-0 right-0 z-40 bg-foreground text-background border-t-2 border-background p-4 pb-safe"
          >
            <div className="flex items-center justify-between max-w-md mx-auto gap-4">
              <div className="flex-1">
                <p className="font-black text-sm uppercase tracking-wide mb-1">
                  {t("pwaInstall")}
                </p>
                <p className="text-xs font-bold opacity-90 leading-tight">
                  {t("pwaDesc")}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button 
                  size="sm" 
                  onClick={() => {
                    setShowModal(true);
                    handleDismissBanner();
                  }}
                  className="bg-background text-foreground border-2 border-background hover:bg-accent hover:text-accent-foreground font-bold rounded-none"
                >
                  {language === 'ja' ? '追加方法' : 'How to'}
                </Button>
                <button 
                  onClick={handleDismissBanner}
                  className="p-2 hover:bg-background/20 rounded-sm transition-colors"
                >
                  <X className="w-5 h-5" strokeWidth={3} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Instructions Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
            onClick={() => setShowModal(false)}
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
                  <span className="bg-foreground text-background px-2 py-1">
                    <Smartphone className="w-4 h-4" />
                  </span>
                  {language === 'ja' ? 'ホーム画面への追加' : 'Add to Home'}
                </h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowModal(false)}
                  className="rounded-none hover:bg-destructive hover:text-destructive-foreground transition-colors"
                >
                  <X className="w-6 h-6" />
                </Button>
              </div>

              <div className="p-6 overflow-y-auto flex-1 space-y-6 modal-scroll">
                {/* Platform Tabs */}
                <div className="flex border-b-2 border-foreground">
                  <button
                    onClick={() => setActivePlatform("ios")}
                    className={`flex-1 py-2 font-bold text-sm uppercase transition-colors ${
                      activePlatform === "ios" 
                        ? "bg-foreground text-background" 
                        : "bg-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    iPhone (iOS)
                  </button>
                  <button
                    onClick={() => setActivePlatform("android")}
                    className={`flex-1 py-2 font-bold text-sm uppercase transition-colors ${
                      activePlatform === "android" 
                        ? "bg-foreground text-background" 
                        : "bg-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Android
                  </button>
                </div>

                <div className="space-y-8">
                  {activePlatform === "ios" ? (
                    /* iOS Section */
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <div className="space-y-4 pl-2">
                        <Step 
                          number={1} 
                          text={language === 'ja' ? 'Safariでこのページを開きます。' : 'Open this page in Safari.'} 
                          icon={<Monitor className="w-5 h-5" />}
                        />
                        <Step 
                          number={2} 
                          text={language === 'ja' ? '画面下部の「共有」ボタンをタップします。' : 'Tap the "Share" button at the bottom.'} 
                          icon={<Share className="w-5 h-5" />}
                        />
                        <Step 
                          number={3} 
                          text={language === 'ja' ? 'メニューをスクロールして「ホーム画面に追加」を選択します。' : 'Scroll down and select "Add to Home Screen".'} 
                          icon={<PlusSquare className="w-5 h-5" />}
                        />
                        <Step 
                          number={4} 
                          text={language === 'ja' ? '右上の「追加」をタップして完了です。' : 'Tap "Add" in the top right corner.'} 
                          isLast
                        />
                      </div>
                    </div>
                  ) : (
                    /* Android Section */
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <div className="space-y-4 pl-2">
                        <Step 
                          number={1} 
                          text={language === 'ja' ? 'Chromeでこのページを開きます。' : 'Open this page in Chrome.'} 
                          icon={<Monitor className="w-5 h-5" />}
                        />
                        <Step 
                          number={2} 
                          text={language === 'ja' ? '右上のメニューアイコン（︙）をタップします。' : 'Tap the menu icon (︙) in the top right.'} 
                          icon={<MoreVertical className="w-5 h-5" />}
                        />
                        <Step 
                          number={3} 
                          text={language === 'ja' ? '「ホーム画面に追加」または「アプリをインストール」を選択します。' : 'Select "Add to Home screen" or "Install app".'} 
                          icon={<Smartphone className="w-5 h-5" />}
                        />
                        <Step 
                          number={4} 
                          text={language === 'ja' ? '確認画面で「追加」をタップして完了です。' : 'Tap "Add" to confirm.'} 
                          isLast
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
});

function Step({ number, text, icon, isLast = false }: { number: number, text: string, icon?: React.ReactNode, isLast?: boolean }) {
  return (
    <div className="flex gap-4 relative">
      {!isLast && (
        <div className="absolute left-[15px] top-10 bottom-[-24px] w-0.5 bg-muted-foreground/30" />
      )}
      <div className="shrink-0 w-8 h-8 rounded-full bg-foreground text-background font-black flex items-center justify-center z-10 border-2 border-foreground">
        {number}
      </div>
      <div className="flex-1 pt-1">
        <p className="font-bold text-sm leading-relaxed">{text}</p>
        {icon && (
          <div className="mt-2 inline-flex items-center justify-center w-10 h-10 bg-muted rounded-sm border border-border">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
