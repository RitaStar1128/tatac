import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { History, RadioTower, Save, Settings, Smartphone } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { PWAInstallPromptHandle } from "@/components/PWAInstallPrompt";
import { useLanguage } from "@/contexts/LanguageContext";
import { createNote, getNotesSnapshot } from "@/domains/notes/noteRepository";

const DescriptionModal = lazy(() =>
  import("@/components/DescriptionModal").then((module) => ({ default: module.DescriptionModal })),
);
const PWAInstallPrompt = lazy(() =>
  import("@/components/PWAInstallPrompt").then((module) => ({ default: module.PWAInstallPrompt })),
);
const SettingsModal = lazy(() =>
  import("@/components/SettingsModal").then((module) => ({ default: module.SettingsModal })),
);

export default function Home() {
  const [text, setText] = useState("");
  const [savedNoteCount, setSavedNoteCount] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(false);
  const [isFirstVisit, setIsFirstVisit] = useState(false);
  const [isPWA, setIsPWA] = useState(false);
  const [, setLocation] = useLocation();
  const { t, language } = useLanguage();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pwaPromptRef = useRef<PWAInstallPromptHandle>(null);
  const pendingEnterRef = useRef(false);
  const textRef = useRef(text);
  const savingRef = useRef(false);
  const hasDraft = text.trim().length > 0;
  const floatingSaveClearance = "calc(7rem + env(safe-area-inset-bottom))";
  const copy =
    language === "ja"
      ? {
          openHistory: "履歴",
          openSync: "同期",
          openSettings: "設定",
          openInstall: "アプリ化",
          save: "保存",
          historyAria: "履歴を開く",
          syncAria: "同期設定を開く",
          settingsAria: "設定を開く",
          installAria: "アプリ化手順を開く",
          saveAria: "メモを保存する",
        }
      : {
          openHistory: "History",
          openSync: "Sync",
          openSettings: "Settings",
          openInstall: "Install",
          save: "Save",
          historyAria: "Open history",
          syncAria: "Open sync settings",
          settingsAria: "Open settings",
          installAria: "Open install instructions",
          saveAria: "Save note",
        };

  const refreshSavedCount = async () => {
    const snapshot = await getNotesSnapshot();
    setSavedNoteCount(snapshot.activeNotes.length);
  };

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone ||
      document.referrer.includes("android-app://");

    setIsPWA(Boolean(isStandalone));
    void refreshSavedCount();
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
      await refreshSavedCount();

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

  const closeDescription = () => {
    setIsDescriptionOpen(false);
    if (isFirstVisit) {
      localStorage.setItem("tatac_visited", "true");
      setIsFirstVisit(false);
    }
  };

  const navigateWithDraft = async (target: string) => {
    if (text.trim()) {
      const saved = await saveMemo();
      if (!saved) return;
    }

    setLocation(target);
  };

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background text-foreground">
      <header className="shrink-0 border-b-2 border-foreground bg-background">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <h1 className="flex cursor-default select-none items-center gap-2 text-lg font-black uppercase tracking-tight">
              <img
                src="/images/icon-tatac-generated.png"
                alt="TATAC app icon"
                className="h-8 w-8 rounded-none"
              />
              <span>TATAC</span>
            </h1>

            {!isPWA && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => pwaPromptRef.current?.open()}
                aria-label={copy.installAria}
                title={copy.installAria}
                className="rounded-none border-2 border-foreground font-bold"
              >
                <Smartphone className="h-4 w-4" />
                <span className="hidden sm:inline">{copy.openInstall}</span>
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void navigateWithDraft("/history");
              }}
              aria-label={copy.historyAria}
              title={copy.historyAria}
              className="shrink-0 rounded-none border-2 border-foreground font-bold"
            >
              <History className="h-4 w-4" />
              {copy.openHistory}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void navigateWithDraft("/sync-settings");
              }}
              aria-label={copy.syncAria}
              title={copy.syncAria}
              className="shrink-0 rounded-none border-2 border-foreground font-bold"
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
              className="shrink-0 rounded-none border-2 border-foreground font-bold"
            >
              <Settings className="h-4 w-4" />
              {copy.openSettings}
            </Button>
          </div>
        </div>
      </header>

      <main className="relative flex flex-1 flex-col">
        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("newMemoPlaceholder")}
          className="h-full w-full flex-1 resize-none border-none bg-transparent p-6 text-lg leading-relaxed placeholder:text-muted-foreground/30 focus-visible:ring-0 md:text-xl"
          style={
            hasDraft
              ? {
                  paddingBottom: floatingSaveClearance,
                  scrollPaddingBottom: floatingSaveClearance,
                }
              : undefined
          }
          spellCheck={false}
        />

        {hasDraft && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-50"
          >
            <Button
              onClick={() => {
                void saveMemo();
                textareaRef.current?.focus();
              }}
              size="lg"
              disabled={isSaving}
              aria-label={copy.saveAria}
              title={copy.saveAria}
              className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-foreground bg-foreground text-background shadow-xl hover:bg-foreground/90"
            >
              <Save className="h-6 w-6" />
            </Button>
          </motion.div>
        )}
      </main>

      <Suspense fallback={null}>
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
          allowAutoPrompt={!isDescriptionOpen && !isFirstVisit && savedNoteCount > 0}
        />
      </Suspense>
    </div>
  );
}
