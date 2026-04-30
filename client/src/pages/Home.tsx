import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  DatabaseZap,
  HelpCircle,
  History,
  RadioTower,
  Save,
  Settings,
  Smartphone,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DescriptionModal } from "@/components/DescriptionModal";
import { PWAInstallPrompt, type PWAInstallPromptHandle } from "@/components/PWAInstallPrompt";
import { SettingsModal } from "@/components/SettingsModal";
import { useLanguage } from "@/contexts/LanguageContext";
import { createNote, getNotesSnapshot } from "@/domains/notes/noteRepository";
import { useIsMobile } from "@/hooks/useMobile";

export default function Home() {
  const [text, setText] = useState("");
  const [noteCount, setNoteCount] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(false);
  const [isFirstVisit, setIsFirstVisit] = useState(false);
  const [isPWA, setIsPWA] = useState(false);
  const [, setLocation] = useLocation();
  const { t, language } = useLanguage();
  const isMobile = useIsMobile();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pwaPromptRef = useRef<PWAInstallPromptHandle>(null);
  const pendingEnterRef = useRef(false);
  const textRef = useRef(text);
  const savingRef = useRef(false);
  const hasDraft = text.trim().length > 0;
  const showMobileSaveButton = isMobile && hasDraft;
  const showInlineSaveBar = hasDraft && !showMobileSaveButton;
  const mobileSaveButtonClearance = "calc(10rem + env(safe-area-inset-bottom))";
  const copy =
    language === "ja"
      ? {
          utilityTitle: "クイック操作",
          deviceNotes: "この端末のメモ",
          openHistory: "履歴",
          openSync: "同期",
          openSettings: "設定",
          openInstall: "アプリ化",
          saveNow: "今すぐ保存",
          saveLabel: "保存",
          draftReady: "下書きがあります",
          helperTitle: "1行目がタイトルになります。",
          helperSave: isMobile ? "Enterで改行 / 保存ボタンで保存" : "Enterで改行 / Ctrl・Cmd+Enterで保存",
          helperStorage: "内容はまずこの端末に保存されます。必要なときだけ同期できます。",
          historyAria: "履歴を開く",
          syncAria: "同期設定を開く",
          settingsAria: "設定を開く",
          installAria: "インストール案内を開く",
          helpAria: "TATACの説明を開く",
        }
      : {
          utilityTitle: "QUICK ACTIONS",
          deviceNotes: "Notes on this device",
          openHistory: "History",
          openSync: "Sync",
          openSettings: "Settings",
          openInstall: "Install",
          saveNow: "Save now",
          saveLabel: "Save",
          draftReady: "Draft ready",
          helperTitle: "The first line becomes the title.",
          helperSave: isMobile
            ? "Press Enter for a new line. Use the save button to store the note."
            : "Press Enter for a new line. Press Ctrl/Cmd+Enter to save.",
          helperStorage: "Everything stays on this device first. Sync is optional.",
          historyAria: "Open history",
          syncAria: "Open sync settings",
          settingsAria: "Open settings",
          installAria: "Open install instructions",
          helpAria: "Open about TATAC",
        };

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
    textareaRef.current?.focus();

    const hasVisited = localStorage.getItem("tatac_visited");
    if (!hasVisited) {
      setIsFirstVisit(true);
      setIsDescriptionOpen(true);
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
        navigator.vibrate?.(50);
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

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (isMobile) return;

    const isModifierPressed = event.ctrlKey || event.metaKey;
    const isSaveShortcut =
      (event.key === "Enter" && isModifierPressed) ||
      (event.key.toLowerCase() === "s" && isModifierPressed);

    if (!isSaveShortcut) return;

    event.preventDefault();
    if (pendingEnterRef.current || !text.trim()) return;

    pendingEnterRef.current = true;
    void saveMemo();
    window.setTimeout(() => {
      pendingEnterRef.current = false;
    }, 500);
  };

  const handleMobileSave = () => {
    if (!text.trim()) return;
    void saveMemo();
    textareaRef.current?.focus();
  };

  const closeDescription = () => {
    setIsDescriptionOpen(false);
    if (isFirstVisit) {
      localStorage.setItem("tatac_visited", "true");
      setIsFirstVisit(false);
    }
  };

  const openHistory = async () => {
    if (text.trim()) {
      const saved = await saveMemo();
      if (!saved) return;
    }

    setLocation("/history");
  };

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
            aria-label={copy.helpAria}
            title={copy.helpAria}
            className="rounded-full w-8 h-8 hover:bg-muted transition-colors"
          >
            <HelpCircle className="w-5 h-5" />
          </Button>
        </div>

        {isMobile && !isPWA && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => pwaPromptRef.current?.open()}
            aria-label={copy.installAria}
            title={copy.installAria}
            className="rounded-none hover:bg-muted transition-colors"
          >
            <Smartphone className="w-5 h-5" />
          </Button>
        )}
      </header>

      <div className="border-b border-border bg-muted/15 px-4 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.22em] text-muted-foreground">
              <DatabaseZap className="h-3.5 w-3.5" />
              <span>{copy.deviceNotes}</span>
            </div>
            <div className="text-lg font-black">{noteCount}</div>
          </div>

          <div className="min-w-0 flex-1 lg:max-w-3xl">
            <div className="text-[11px] font-black uppercase tracking-[0.22em] text-muted-foreground">
              {copy.utilityTitle}
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void openHistory();
                }}
                aria-label={copy.historyAria}
                title={copy.historyAria}
                className="rounded-none border-2 border-foreground font-bold"
              >
                <History className="h-4 w-4" />
                {copy.openHistory}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setLocation("/sync-settings")}
                aria-label={copy.syncAria}
                title={copy.syncAria}
                className="rounded-none border-2 border-foreground font-bold"
              >
                <RadioTower className="h-4 w-4" />
                {copy.openSync}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsSettingsOpen(true)}
                aria-label={copy.settingsAria}
                title={copy.settingsAria}
                className="rounded-none border-2 border-foreground font-bold"
              >
                <Settings className="h-4 w-4" />
                {copy.openSettings}
              </Button>

              {!isMobile && !isPWA && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => pwaPromptRef.current?.open()}
                  aria-label={copy.installAria}
                  title={copy.installAria}
                  className="rounded-none border-2 border-foreground font-bold"
                >
                  <Smartphone className="h-4 w-4" />
                  {copy.openInstall}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <main className="flex-1 relative flex flex-col">
        <div className="border-b border-border bg-muted/20 px-6 py-3 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">{copy.helperTitle}</p>
          <p className="mt-1">{copy.helperSave}</p>
          <p className="mt-1">{copy.helperStorage}</p>
        </div>

        {showInlineSaveBar && (
          <div className="border-b border-border bg-background px-6 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-muted-foreground">
                  {copy.draftReady}
                </p>
                <p className="text-sm text-muted-foreground">{copy.helperSave}</p>
              </div>

              <Button
                onClick={() => {
                  void saveMemo();
                }}
                disabled={isSaving}
                className="rounded-none border-2 border-foreground bg-foreground font-black uppercase tracking-[0.2em] text-background hover:bg-foreground/90"
              >
                <Save className="h-4 w-4" />
                {copy.saveNow}
              </Button>
            </div>
          </div>
        )}

        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
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
              aria-label={copy.saveLabel}
              title={copy.saveLabel}
              className="h-14 rounded-full shadow-xl border-2 border-foreground bg-foreground px-5 text-background hover:bg-foreground/90 font-bold flex items-center justify-center gap-2"
            >
              <Save className="w-5 h-5" />
              <span className="text-sm font-black uppercase tracking-[0.2em]">{copy.saveLabel}</span>
            </Button>
          </motion.div>
        )}
      </main>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onOpenMobileQr={() => {
          setIsSettingsOpen(false);
          window.setTimeout(() => pwaPromptRef.current?.open(), 100);
        }}
      />

      <DescriptionModal isOpen={isDescriptionOpen} onClose={closeDescription} />

      <PWAInstallPrompt
        ref={pwaPromptRef}
        allowAutoPrompt={!isDescriptionOpen && !isFirstVisit && noteCount > 0}
      />
    </div>
  );
}
