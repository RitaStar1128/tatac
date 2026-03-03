import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { History, Settings, Smartphone, HelpCircle, Save } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SettingsModal } from "@/components/SettingsModal";
import { DescriptionModal } from "@/components/DescriptionModal";
import { PWAInstallPrompt, PWAInstallPromptHandle } from "@/components/PWAInstallPrompt";
import { useLanguage } from "@/contexts/LanguageContext";
import { useIsMobile } from "@/hooks/useMobile";
import { toast } from "sonner";

// UX_RATIONALE:
// - distraction_free_mode: 入力時はヘッダー以外の要素を極力排除し、書くことに集中させる。
// - auto_save: ユーザーが保存操作を意識せずとも、思考を途切れさせないように自動保存（Enter/閉じる）を行う。
// - haptic_feedback: 保存完了時に微細な振動を与えることで、完了した感覚を身体的にフィードバックする（モバイル）。
// - mobile_optimization: モバイル版では保存ボタンを固定配置（fixed）にし、interactive-widget=resizes-contentによりキーボードの上に自然に配置させる。

export default function Home() {
  const [text, setText] = useState("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(false);
  const [, setLocation] = useLocation();
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pwaPromptRef = useRef<PWAInstallPromptHandle>(null);
  const pendingEnterRef = useRef(false);
  const [isPWA, setIsPWA] = useState(false);
  const showMobileSaveButton = isMobile && text.trim().length > 0;
  const mobileSaveButtonClearance = "calc(10rem + env(safe-area-inset-bottom))";
  
  useEffect(() => {
    // Check if running as PWA
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                         (window.navigator as any).standalone || 
                         document.referrer.includes('android-app://');
    setIsPWA(isStandalone);

    // Auto-focus on mount
    if (textareaRef.current) {
      textareaRef.current.focus();
    }

    // Show description on first visit
    const hasVisited = localStorage.getItem("tatac_visited");
    if (!hasVisited) {
      setIsDescriptionOpen(true);
      localStorage.setItem("tatac_visited", "true");
    }
  }, []);

  const saveMemo = () => {
    if (!text.trim()) return;

    const newRecord = {
      id: crypto.randomUUID(),
      text: text.trim(),
      date: new Date().toISOString(),
    };

    const existingRecords = JSON.parse(localStorage.getItem("tatac_records") || "[]");
    localStorage.setItem("tatac_records", JSON.stringify([newRecord, ...existingRecords]));

    setText("");
    toast.success(t("saved"), {
      duration: 1500,
      position: "bottom-center",
      className: "font-bold uppercase tracking-widest border-2 border-foreground bg-background text-foreground rounded-none shadow-none",
    });
    
    // Haptic feedback if available
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isMobile) {
      // Mobile: Enter for new line (default behavior)
      return;
    }

    // PC: Shift+Enter to save, Enter for new line
    if (e.key === "Enter") {
      if (e.shiftKey) {
        // Shift+Enter: Save
        e.preventDefault();
        
        // Prevent accidental double saves or rapid firing
        if (pendingEnterRef.current) return;
        
        if (text.trim()) {
          pendingEnterRef.current = true;
          saveMemo();
          // Reset pending flag after a short delay
          setTimeout(() => {
            pendingEnterRef.current = false;
          }, 500);
        }
      }
      // Enter only: New line (default behavior)
    }
  };

  // Mobile save button handler
  const handleMobileSave = () => {
    if (text.trim()) {
      saveMemo();
      // Keep focus for continuous writing
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }
  };

  return (
    <div className="h-[100dvh] flex flex-col bg-background text-foreground overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b-2 border-foreground shrink-0 z-10 bg-background">
        <div className="flex items-center gap-3">
          {/* H1 for SEO, styled as logo */}
          <h1 className="flex items-center gap-2 font-black text-lg tracking-tight uppercase select-none cursor-default">
            <img
              src="/images/icon-tatac-generated.png"
              alt="TATAC app icon"
              className="w-8 h-8 rounded-none"
            />
            <span>TATAC</span>
          </h1>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsDescriptionOpen(true)}
            className="rounded-full w-8 h-8 hover:bg-muted transition-colors"
          >
            <HelpCircle className="w-5 h-5" />
          </Button>
        </div>
        
        <div className="flex items-center gap-1">
          {/* PWA Install Button - Only show on mobile browser (not PWA, not PC) */}
          {isMobile && !isPWA && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => pwaPromptRef.current?.open()}
              className="rounded-none hover:bg-muted transition-colors"
            >
              <Smartphone className="w-5 h-5" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsSettingsOpen(true)}
            className="rounded-none hover:bg-muted transition-colors"
          >
            <Settings className="w-5 h-5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/history")}
            className="rounded-none hover:bg-muted transition-colors"
          >
            <History className="w-5 h-5" />
          </Button>
          
        </div>
      </header>

      {/* Main Input Area */}
      <main className="flex-1 relative flex flex-col">
        {/* Hidden H2 for SEO structure */}
        <h2 className="sr-only">New Memo Input</h2>
        
        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("newMemoPlaceholder")}
          className="flex-1 w-full h-full resize-none border-none focus-visible:ring-0 p-6 text-lg md:text-xl leading-relaxed bg-transparent placeholder:text-muted-foreground/30"
          style={
            showMobileSaveButton
              ? {
                  paddingBottom: mobileSaveButtonClearance,
                  scrollPaddingBottom: mobileSaveButtonClearance,
                }
              : undefined
          }
          spellCheck={false}
        />
        
        {/* Mobile Save Button (Fixed Position relying on interactive-widget=resizes-content) */}
        {showMobileSaveButton && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-50"
          >
            <Button
              onClick={handleMobileSave}
              size="lg"
              className="rounded-full w-14 h-14 shadow-xl border-2 border-foreground bg-foreground text-background hover:bg-foreground/90 font-bold flex items-center justify-center"
            >
              <Save className="w-6 h-6" />
            </Button>
          </motion.div>
        )}
      </main>

      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)}
        onOpenMobileQr={() => {
          setIsSettingsOpen(false);
          // Small delay to allow modal to close first
          setTimeout(() => pwaPromptRef.current?.open(), 100);
        }}
      />
      
      <DescriptionModal 
        isOpen={isDescriptionOpen} 
        onClose={() => setIsDescriptionOpen(false)} 
      />
      
      <PWAInstallPrompt ref={pwaPromptRef} />
    </div>
  );
}
