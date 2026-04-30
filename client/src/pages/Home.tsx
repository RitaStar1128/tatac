import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { History, Settings, Smartphone, HelpCircle, Save, DatabaseZap } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SettingsModal } from "@/components/SettingsModal";
import { DescriptionModal } from "@/components/DescriptionModal";
import { PWAInstallPrompt, PWAInstallPromptHandle } from "@/components/PWAInstallPrompt";
import { useLanguage } from "@/contexts/LanguageContext";
import { useIsMobile } from "@/hooks/useMobile";
import { createNote, getNotesSnapshot } from "@/domains/notes/noteRepository";

export default function Home() {
  const [text, setText] = useState("");
  const [noteCount, setNoteCount] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(false);
  const [, setLocation] = useLocation();
  const { t, language } = useLanguage();
  const isMobile = useIsMobile();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pwaPromptRef = useRef<PWAInstallPromptHandle>(null);
  const pendingEnterRef = useRef(false);
  const textRef = useRef(text);
  const savingRef = useRef(false);
  const [isPWA, setIsPWA] = useState(false);
  const showMobileSaveButton = isMobile && text.trim().length > 0;
  const mobileSaveButtonClearance = "calc(10rem + env(safe-area-inset-bottom))";

  const refreshCounts = async () => {
    const snapshot = await getNotesSnapshot();
    setNoteCount(snapshot.activeNotes.length);
  };

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone ||
      document.referrer.includes("android-app://");
    setIsPWA(Boolean(isStandalone));

    void refreshCounts();

    if (textareaRef.current) {
      textareaRef.current.focus();
    }

    const hasVisited = localStorage.getItem("tatac_visited");
    if (!hasVisited) {
      setIsDescriptionOpen(true);
      localStorage.setItem("tatac_visited", "true");
    }
  }, []);

  useEffect(() => {
    textRef.current = text;
  }, [text]);

  const saveMemo = async ({ silent = false }: { silent?: boolean } = {}) => {
    const trimmedText = textRef.current.trim();
    if (!trimmedText || savingRef.current) return false;

    savingRef.current = true;
    setIsSaving(true);

    try {
      await createNote(trimmedText);
      textRef.current = "";
      setText("");
      await refreshCounts();

      if (!silent) {
        toast.success(t("saved"), {
          duration: 1500,
          position: "bottom-center",
          className:
            "font-bold uppercase tracking-widest border-2 border-foreground bg-background text-foreground rounded-none shadow-none",
        });
      }

      if (!silent && navigator.vibrate) {
        navigator.vibrate(50);
      }

      return true;
    } catch {
      if (!silent) {
        toast.error(t("errorUnexpected"), {
          className:
            "font-bold uppercase tracking-widest border-2 border-destructive bg-background text-destructive rounded-none shadow-none",
        });
      }
      return false;
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  useEffect(() => {
    const flushMemoSilently = () => {
      void saveMemo({ silent: true });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushMemoSilently();
      }
    };

    const handleBeforeUnload = () => {
      flushMemoSilently();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isMobile) return;

    const isModifierPressed = e.ctrlKey || e.metaKey;
    const isSaveShortcut =
      (e.key === "Enter" && isModifierPressed) ||
      (e.key.toLowerCase() === "s" && isModifierPressed);

    if (isSaveShortcut) {
      e.preventDefault();
      if (pendingEnterRef.current) return;

      if (text.trim()) {
        pendingEnterRef.current = true;
        void saveMemo();
        setTimeout(() => {
          pendingEnterRef.current = false;
        }, 500);
      }
    }
  };

  const handleMobileSave = () => {
    if (text.trim()) {
      void saveMemo();
      textareaRef.current?.focus();
    }
  };

  const localFirstHint =
    language === "ja"
      ? "先頭行がタイトルになり、本文全体は IndexedDB と oplog に保存されます。"
      : "The first line becomes the title. The full note is persisted to IndexedDB and the local oplog.";

  return (
    <div className="h-[100dvh] flex flex-col bg-background text-foreground overflow-hidden">
      <header className="flex items-center justify-between px-4 py-3 border-b-2 border-foreground shrink-0 z-10 bg-background">
        <div className="flex items-center gap-3">
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

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-2 border border-border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.25em]">
            <DatabaseZap className="h-3.5 w-3.5" />
            {noteCount}
          </div>

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
            onClick={async () => {
              if (text.trim()) {
                const saved = await saveMemo();
                if (!saved) return;
              }
              setLocation("/history");
            }}
            className="rounded-none hover:bg-muted transition-colors"
          >
            <History className="w-5 h-5" />
          </Button>
        </div>
      </header>

      <main className="flex-1 relative flex flex-col">
        <div className="border-b border-border bg-muted/20 px-6 py-3 text-xs text-muted-foreground">
          {localFirstHint}
        </div>

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
              disabled={isSaving}
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
          setTimeout(() => pwaPromptRef.current?.open(), 100);
        }}
      />

      <DescriptionModal isOpen={isDescriptionOpen} onClose={() => setIsDescriptionOpen(false)} />

      <PWAInstallPrompt ref={pwaPromptRef} />
    </div>
  );
}
