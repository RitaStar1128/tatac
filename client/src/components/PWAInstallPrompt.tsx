import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { QRCodeSVG } from "qrcode.react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Smartphone, Share, PlusSquare, MoreVertical, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";

// UX_RATIONALE:
// - progressive_disclosure: ユーザーの環境（PC/スマホブラウザ/PWA）に応じて必要な情報のみを表示。
// - social_proof: 「ホーム画面に追加」の手順を具体的に示すことで、ユーザーの行動を促す。
// - fitts_law: モバイルでのバナーは画面下部に配置し、親指でタップしやすい位置に。

export interface PWAInstallPromptHandle {
  open: () => void;
}

export const PWAInstallPrompt = forwardRef<PWAInstallPromptHandle>((_, ref) => {
  const { t, language } = useLanguage();
  const [isPWA, setIsPWA] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [currentUrl, setCurrentUrl] = useState("");
  const [forcePC, setForcePC] = useState(false);
  const [showPcQr, setShowPcQr] = useState(false);
  const [activePlatform, setActivePlatform] = useState<"ios" | "android">("ios");

  useImperativeHandle(ref, () => ({
    open: () => {
      if (!isMobile) {
        setShowPcQr(true);
        return;
      }
      setShowModal(true);
    },
  }), [isMobile]);

  useEffect(() => {
    // Check if user has chosen to use PC version
    const storedForcePC = localStorage.getItem("tatac_force_pc");
    if (storedForcePC === "true") {
      setForcePC(true);
    }

    // Check if running as PWA
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                         (window.navigator as any).standalone || 
                         document.referrer.includes('android-app://');
    setIsPWA(isStandalone);

    // Check if mobile device
    const mobileCheck = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    setIsMobile(mobileCheck);
    if (mobileCheck) {
      const isAndroid = /Android/i.test(navigator.userAgent);
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isAndroid) {
        setActivePlatform("android");
      } else if (isIOS) {
        setActivePlatform("ios");
      }
    }

    // Set current URL for QR code
    setCurrentUrl(window.location.href);

    // Show banner if mobile and not PWA, and NOT already dismissed
    if (mobileCheck && !isStandalone) {
      const hasDismissed = localStorage.getItem("tatac_pwa_banner_dismissed");
      if (!hasDismissed) {
        setShowBanner(true);
      }
    }
  }, []);

  const handleDismissBanner = () => {
    setShowBanner(false);
    localStorage.setItem("tatac_pwa_banner_dismissed", "true");
  };

  if (isPWA) return null;

  // PC View: Show QR Code Overlay
  if (!isMobile && (!forcePC || showPcQr)) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm p-4">
        <div className="bg-card border-2 border-foreground p-8 max-w-md w-full text-center relative">
          <Smartphone className="w-12 h-12 mx-auto mb-4 text-foreground" strokeWidth={2} />
          <h2 className="text-2xl font-black uppercase tracking-tighter mb-2">
            {language === 'ja' ? 'スマホでの利用を推奨' : 'Mobile Recommended'}
          </h2>
          <p className="text-sm font-bold text-muted-foreground mb-6">
            {language === 'ja' 
              ? 'このアプリはスマートフォンでの利用に最適化されています。以下のQRコードを読み取ってアクセスしてください。' 
              : 'This app is optimized for mobile use. Scan the QR code below to access on your phone.'}
          </p>
          
          <div className="bg-white p-4 border-2 border-black inline-block mb-4">
            <QRCodeSVG value={currentUrl} size={180} />
          </div>
          
          <p className="text-xs font-mono text-muted-foreground break-all mb-6">
            {currentUrl}
          </p>

          <Button 
            variant="outline" 
            onClick={() => {
              if (!forcePC) {
                setForcePC(true);
                localStorage.setItem("tatac_force_pc", "true");
              }
              setShowPcQr(false);
            }}
            className="w-full border-2 border-foreground hover:bg-accent font-bold rounded-none"
          >
            {forcePC ? t("close") : (language === 'ja' ? 'PC版を利用する' : 'Continue on PC')}
          </Button>
        </div>
      </div>
    );
  }

  // Mobile View: Banner & Modal
  return (
    <>
      {/* Bottom Banner */}
      <AnimatePresence>
        {showBanner && (
          <motion.div
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            className="fixed bottom-0 left-0 right-0 z-40 bg-foreground text-background border-t-2 border-background p-4 pb-safe"
          >
            <div className="flex items-center justify-between max-w-md mx-auto gap-4">
              <div className="flex-1">
                <p className="font-black text-sm uppercase tracking-wide mb-1">
                  {language === 'ja' ? 'アプリとして使う' : 'Install App'}
                </p>
                <p className="text-xs font-bold opacity-90 leading-tight">
                  {language === 'ja' 
                    ? 'ホーム画面に追加して、より快適に記録しましょう。' 
                    : 'Add to home screen for the best experience.'}
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

      {/* Instructions Modal */}
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
              className="w-full max-w-md bg-card border-2 border-foreground p-6 shadow-none relative max-h-[80vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-6">
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

              <div className="space-y-6">
                <div className="flex gap-2">
                  <button
                    onClick={() => setActivePlatform("ios")}
                    className={`px-3 py-1.5 text-xs font-black uppercase border-2 transition-colors ${
                      activePlatform === "ios"
                        ? "bg-foreground text-background border-foreground"
                        : "border-border text-foreground/70 hover:border-foreground"
                    }`}
                  >
                    iOS
                  </button>
                  <button
                    onClick={() => setActivePlatform("android")}
                    className={`px-3 py-1.5 text-xs font-black uppercase border-2 transition-colors ${
                      activePlatform === "android"
                        ? "bg-foreground text-background border-foreground"
                        : "border-border text-foreground/70 hover:border-foreground"
                    }`}
                  >
                    Android
                  </button>
                </div>

                {activePlatform === "ios" ? (
                  <div className="space-y-4">
                    <h3 className="font-black text-sm uppercase border-b-2 border-foreground pb-1 inline-block">iPhone (iOS)</h3>
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
                  <div className="space-y-4">
                    <h3 className="font-black text-sm uppercase border-b-2 border-foreground pb-1 inline-block">Android</h3>
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
