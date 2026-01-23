import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useLocation, useRoute } from "wouter";
import { History, Settings, Smartphone, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";
import { PWAInstallPrompt, PWAInstallPromptHandle } from "@/components/PWAInstallPrompt";
import { DescriptionModal } from "@/components/DescriptionModal";
import { SettingsModal } from "@/components/SettingsModal";
import { useIsMobile } from "@/hooks/useMobile";

// UX_RATIONALE:
// - cognitive_load: 画面上の要素を極限まで減らし、テキスト入力のみに集中させることで認知負荷を最小化。
// - fitts_law: 入力エリアを画面全体に広げ、どこをタップしても入力開始できるようにする。
// - zeigarnik_effect: 入力完了（保存）時のフィードバックを明確にし、タスク完了の心理的区切りを提供する。
// - haptic_feedback: 保存時に振動フィードバックを与え、視覚だけでなく触覚でも完了を伝える。

export default function Home() {
  const { t } = useLanguage();
  const [text, setText] = useState("");
  const [_, setLocation] = useLocation();
  const [match, params] = useRoute("/edit/:id");
  const isEditMode = match && !!params?.id;
  const [originalDate, setOriginalDate] = useState<string | null>(null);
  
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const pwaPromptRef = useRef<PWAInstallPromptHandle>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isPWA, setIsPWA] = useState(false);
  const isMobile = useIsMobile();
  const pendingEnterRef = useRef(false);

  // PWA判定
  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                         (window.navigator as any).standalone || 
                         document.referrer.includes('android-app://');
    setIsPWA(isStandalone);
  }, []);

  // 初回訪問判定
  useEffect(() => {
    const hasVisited = localStorage.getItem("has_visited_tatac");
    if (!hasVisited) {
      setIsDescriptionOpen(true);
      localStorage.setItem("has_visited_tatac", "true");
    }
  }, []);

  // タイトル設定
  useEffect(() => {
    document.title = "TATAC";
  }, []);

  // 自動フォーカス
  useEffect(() => {
    if (textareaRef.current && !isDescriptionOpen && !isSettingsOpen) {
      // 少し遅延させてフォーカスを当てる（モバイルキーボード対応）
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  }, [isDescriptionOpen, isSettingsOpen]);

  // 編集モード時のデータ読み込み
  useEffect(() => {
    if (isEditMode && params?.id) {
      const storedData = localStorage.getItem("tatac_records");
      if (storedData) {
        const records = JSON.parse(storedData);
        const record = records.find((r: any) => r.id === params.id);
        if (record) {
          setText(record.text);
          setOriginalDate(record.date);
        } else {
          toast.error(t("noRecords"));
          setLocation("/history");
        }
      }
    }
  }, [isEditMode, params?.id, setLocation, t]);

  const handleSave = () => {
    if (!text.trim()) return;

    pendingEnterRef.current = false;
    const storedData = localStorage.getItem("tatac_records");
    let records = storedData ? JSON.parse(storedData) : [];

    if (isEditMode && params?.id) {
      // 更新処理
      records = records.map((r: any) => {
        if (r.id === params.id) {
          return {
            ...r,
            text: text,
            date: originalDate || r.date, // 日付は維持
            updatedAt: new Date().toISOString()
          };
        }
        return r;
      });
      
      localStorage.setItem("tatac_records", JSON.stringify(records));
      setLocation("/history");
    } else {
      // 新規作成処理
      const newRecord = {
        id: crypto.randomUUID(),
        text: text,
        date: new Date().toISOString(),
      };
      
      localStorage.setItem("tatac_records", JSON.stringify([newRecord, ...records]));

      // 保存フィードバック
      if (navigator.vibrate) navigator.vibrate(50);
      setText("");
    }
  };

  // キーボードイベントハンドラ
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isMobile) return;
    if (e.key !== "Enter") {
      pendingEnterRef.current = false;
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      pendingEnterRef.current = false;
      return;
    }
    e.preventDefault();
    if (pendingEnterRef.current) {
      pendingEnterRef.current = false;
      handleSave();
      return;
    }
    pendingEnterRef.current = true;
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-[100dvh] flex flex-col bg-background text-foreground font-sans overflow-hidden"
    >
      <PWAInstallPrompt ref={pwaPromptRef} />
      <DescriptionModal isOpen={isDescriptionOpen} onClose={() => setIsDescriptionOpen(false)} />
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onOpenMobileQr={() => pwaPromptRef.current?.open()}
      />
      
      {/* Header - Minimal */}
      <header className="flex justify-between items-center px-4 py-3 shrink-0 z-20 bg-background/80 backdrop-blur-sm absolute top-0 left-0 right-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-black tracking-tighter text-xl">TATAC</span>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setIsDescriptionOpen(true)}
              className="w-8 h-8 rounded-full hover:bg-accent hover:text-accent-foreground opacity-50 hover:opacity-100 transition-opacity"
            >
              <HelpCircle className="w-5 h-5" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {!isPWA && (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => pwaPromptRef.current?.open()}
              className="w-10 h-10 rounded-full hover:bg-accent hover:text-accent-foreground hidden md:flex"
              title={t("pwaInstall")}
            >
              <Smartphone className="w-5 h-5" />
            </Button>
          )}
          
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setIsSettingsOpen(true)}
            className="w-10 h-10 rounded-full hover:bg-accent hover:text-accent-foreground"
          >
            <Settings className="w-5 h-5" />
          </Button>

          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setLocation("/history")}
            className="w-10 h-10 rounded-full hover:bg-accent hover:text-accent-foreground"
          >
            <History className="w-5 h-5" />
          </Button>
        </div>
      </header>

      {/* Main Input Area */}
      <main className="flex-1 flex flex-col relative pt-16 pb-4 px-4">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 w-full bg-transparent border-none outline-none resize-none text-lg md:text-xl leading-relaxed placeholder:text-muted-foreground/30 font-medium"
          placeholder=""
          spellCheck={false}
        />
        {isMobile && (
          <div className="pt-4">
            <Button
              onClick={handleSave}
              className="w-full h-12 text-base font-black rounded-none"
              disabled={!text.trim()}
            >
              {t("save")}
            </Button>
          </div>
        )}
      </main>
    </motion.div>
  );
}
