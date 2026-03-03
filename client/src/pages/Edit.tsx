import { useState, useEffect, useRef } from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/contexts/LanguageContext";
import { useIsMobile } from "@/hooks/useMobile";
import { getStoredRecords, setStoredRecords, type MemoRecord } from "@/lib/recordsStorage";
import { toast } from "sonner";
import { motion } from "framer-motion";

// UX_RATIONALE:
// - mode_awareness: ヘッダーの色を反転（黒背景）させることで、編集モードであることを明確に伝える。
// - consistency: メイン画面と同様の入力体験を提供しつつ、保存アクションを明確にする。
// - feedback: 保存完了時にトーストと振動でフィードバックを行い、操作の完了を伝える。
// - mobile_optimization: モバイル版では保存ボタンを固定配置（fixed）にし、interactive-widget=resizes-contentによりキーボードの上に自然に配置させる。

export default function Edit() {
  const [, params] = useRoute("/edit/:id");
  const [, setLocation] = useLocation();
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const [text, setText] = useState("");
  const [originalRecord, setOriginalRecord] = useState<MemoRecord | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingEnterRef = useRef(false);
  const mobileSaveButtonClearance = "calc(10rem + env(safe-area-inset-bottom))";
  const normalizedText = text.trim();
  const normalizedOriginalText = originalRecord?.text.trim() ?? "";
  const canSave =
    !!originalRecord &&
    normalizedText.length > 0 &&
    normalizedText !== normalizedOriginalText;

  useEffect(() => {
    if (params?.id) {
      const storedRecords = getStoredRecords();
      const record = storedRecords.find((r) => r.id === params.id);
      if (record) {
        setOriginalRecord(record);
        setText(record.text);
      } else {
        setLocation("/history");
      }
    }
  }, [params?.id, setLocation]);

  // Auto-focus on mount
  useEffect(() => {
    if (textareaRef.current) {
      // Small delay to ensure render
      setTimeout(() => {
        textareaRef.current?.focus();
        // Move cursor to end
        textareaRef.current?.setSelectionRange(
          textareaRef.current.value.length,
          textareaRef.current.value.length
        );
      }, 100);
    }
  }, [originalRecord]);

  const handleSave = () => {
    if (!canSave || !originalRecord) return;

    const storedRecords = getStoredRecords();
    const updatedRecords = storedRecords.map((r) => {
      if (r.id === originalRecord.id) {
        return {
          ...r,
          text: normalizedText,
          updatedAt: new Date().toISOString()
        };
      }
      return r;
    });

    const saved = setStoredRecords(updatedRecords);
    if (!saved) {
      toast.error(t("errorUnexpected"), {
        className: "font-bold uppercase tracking-widest border-2 border-destructive bg-background text-destructive rounded-none shadow-none",
      });
      return;
    }
    
    toast.success(t("saved"), {
      duration: 1500,
      className: "font-bold uppercase tracking-widest border-2 border-foreground bg-background text-foreground rounded-none shadow-none",
    });

    if (navigator.vibrate) {
      navigator.vibrate(50);
    }

    setLocation("/history");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isMobile) return;

    // PC: Ctrl+Enter to save, Enter for new line
    if (e.key === "Enter") {
      if (e.ctrlKey) {
        e.preventDefault();
        if (pendingEnterRef.current) return;
        
        pendingEnterRef.current = true;
        handleSave();
        setTimeout(() => {
          pendingEnterRef.current = false;
        }, 500);
      }
      // Default Enter behavior is new line
    }
  };

  return (
    <div className="h-[100dvh] flex flex-col bg-background text-foreground overflow-hidden">
      {/* Header - Inverted colors for Edit Mode */}
      <header className="flex items-center justify-between px-4 py-3 border-b-2 border-foreground shrink-0 z-10 bg-foreground text-background transition-colors duration-300">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/history")}
            className="rounded-none hover:bg-background/20 text-background hover:text-background transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="font-black text-lg tracking-tight uppercase">
            {t("editMode")}
          </h1>
        </div>
        
        {!isMobile && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSave}
            disabled={!canSave}
            className="rounded-none hover:bg-background/20 text-background hover:text-background transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Save className="w-5 h-5" />
          </Button>
        )}
      </header>

      {/* Main Input Area */}
      <main className="flex-1 relative flex flex-col">
        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 w-full h-full resize-none border-none focus-visible:ring-0 p-6 text-lg md:text-xl leading-relaxed bg-transparent placeholder:text-muted-foreground/30"
          style={
            isMobile && canSave
              ? {
                  paddingBottom: mobileSaveButtonClearance,
                  scrollPaddingBottom: mobileSaveButtonClearance,
                }
              : undefined
          }
          spellCheck={false}
        />
        
        {/* Mobile Save Button (Fixed Position relying on interactive-widget=resizes-content) */}
        {isMobile && canSave && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-50"
          >
            <Button
              onClick={handleSave}
              size="lg"
              className="rounded-full w-14 h-14 shadow-xl border-2 border-foreground bg-foreground text-background hover:bg-foreground/90 font-bold flex items-center justify-center"
            >
              <Save className="w-6 h-6" />
            </Button>
          </motion.div>
        )}
      </main>
    </div>
  );
}
