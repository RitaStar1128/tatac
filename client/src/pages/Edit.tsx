import { useEffect, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, Save } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/contexts/LanguageContext";
import { useIsMobile } from "@/hooks/useMobile";
import { getNoteById, updateNote } from "@/domains/notes/noteRepository";
import type { StoredNoteRecord } from "@/db/tatacDb";

export default function Edit() {
  const [, params] = useRoute("/edit/:id");
  const [, setLocation] = useLocation();
  const { t, language } = useLanguage();
  const isMobile = useIsMobile();
  const [text, setText] = useState("");
  const [originalRecord, setOriginalRecord] = useState<StoredNoteRecord | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingEnterRef = useRef(false);
  const mobileSaveButtonClearance = "calc(10rem + env(safe-area-inset-bottom))";
  const normalizedText = text.trim();
  const normalizedOriginalText = originalRecord?.body.trim() ?? "";
  const canSave =
    !!originalRecord &&
    normalizedText.length > 0 &&
    normalizedText !== normalizedOriginalText &&
    !isSaving;
  const copy =
    language === "ja"
      ? {
          backAria: "履歴に戻る",
          saveAria: "編集内容を保存する",
        }
      : {
          backAria: "Back to history",
          saveAria: "Save edited note",
        };

  useEffect(() => {
    let cancelled = false;

    if (params?.id) {
      void getNoteById(params.id).then((record) => {
        if (cancelled) return;
        if (record && record.deletedAt === null) {
          setOriginalRecord(record);
          setText(record.body);
        } else {
          setLocation("/history");
        }
      });
    }

    return () => {
      cancelled = true;
    };
  }, [params?.id, setLocation]);

  useEffect(() => {
    if (!originalRecord) return;
    const timer = window.setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(textareaRef.current.value.length, textareaRef.current.value.length);
    }, 100);

    return () => window.clearTimeout(timer);
  }, [originalRecord]);

  const saveEdit = async ({
    silent = false,
    navigate = true,
  }: {
    silent?: boolean;
    navigate?: boolean;
  } = {}) => {
    if (!canSave || !originalRecord) return false;

    setIsSaving(true);
    try {
      const updated = await updateNote(originalRecord.id, normalizedText);
      setOriginalRecord(updated);

      if (!silent) {
        toast.success(t("saved"), {
          duration: 1500,
          className:
            "font-bold uppercase tracking-widest border-2 border-foreground bg-background text-foreground rounded-none shadow-none",
        });
        navigator.vibrate?.(50);
      }

      if (navigate) {
        setLocation("/history");
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
      setIsSaving(false);
    }
  };

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        void saveEdit({ silent: true, navigate: false });
      }
    };

    const handleBeforeUnload = () => {
      void saveEdit({ silent: true, navigate: false });
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [canSave, normalizedText, originalRecord]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isMobile) return;

    const isModifierPressed = e.ctrlKey || e.metaKey;
    const isSaveShortcut =
      (e.key === "Enter" && isModifierPressed) ||
      (e.key.toLowerCase() === "s" && isModifierPressed);

    if (isSaveShortcut) {
      e.preventDefault();
      if (pendingEnterRef.current) return;

      pendingEnterRef.current = true;
      void saveEdit();
      setTimeout(() => {
        pendingEnterRef.current = false;
      }, 500);
    }
  };

  return (
    <div className="h-[100dvh] flex flex-col bg-background text-foreground overflow-hidden">
      <header className="flex shrink-0 items-center justify-between border-b-2 border-foreground bg-foreground px-4 py-3 text-background">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={async () => {
              if (canSave) {
                const saved = await saveEdit();
                if (!saved) return;
                return;
              }
              setLocation("/history");
            }}
            aria-label={copy.backAria}
            title={copy.backAria}
            className="h-10 w-10 rounded-full text-background hover:bg-background/20 hover:text-background"
          >
            <ArrowLeft className="h-6 w-6" strokeWidth={2.5} />
          </Button>
          <div>
            <h1 className="text-lg font-black uppercase tracking-tight">{t("editMode")}</h1>
            {originalRecord && (
              <p className="text-xs uppercase tracking-[0.25em] text-background/70">{originalRecord.title}</p>
            )}
          </div>
        </div>

        {!isMobile && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              void saveEdit();
            }}
            disabled={!canSave}
            aria-label={copy.saveAria}
            title={copy.saveAria}
            className="h-10 w-10 rounded-full text-background hover:bg-background/20 hover:text-background disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Save className="h-5 w-5" />
          </Button>
        )}
      </header>

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

        {isMobile && canSave && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-50"
          >
            <Button
              onClick={() => {
                void saveEdit();
              }}
              size="lg"
              aria-label={copy.saveAria}
              title={copy.saveAria}
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
