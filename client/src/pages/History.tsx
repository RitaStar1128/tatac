import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  AnimatePresence,
  motion,
  type PanInfo,
  useMotionValue,
  useTransform,
} from "framer-motion";
import {
  ArrowLeft,
  Copy,
  Download,
  Edit2,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/contexts/LanguageContext";
import type { StoredNoteRecord } from "@/db/tatacDb";
import { deleteNote, listActiveNotes, subscribeToNotesChanged } from "@/domains/notes/noteRepository";
import { deriveNoteExcerpt } from "@/domains/notes/noteText";

const ExportModal = lazy(() =>
  import("@/components/ExportModal").then((module) => ({ default: module.ExportModal })),
);

function HistoryItem({
  record,
  index,
  onDelete,
  onEdit,
  onCopy,
  formatDate,
  copyLabel,
  editLabel,
  deleteLabel,
}: {
  record: StoredNoteRecord;
  index: number;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
  onCopy: (text: string) => void;
  formatDate: (date: string) => string;
  copyLabel: string;
  editLabel: string;
  deleteLabel: string;
}) {
  const x = useMotionValue(0);
  const deleteThreshold = -100;
  const bgOpacity = useTransform(x, [0, -50, -100], [0, 0.5, 1]);
  const iconScale = useTransform(x, [-50, -100, -150], [0.8, 1.2, 1.5]);
  const [crossedThreshold, setCrossedThreshold] = useState(false);
  const [suppressClick, setSuppressClick] = useState(false);

  useEffect(() => {
    const unsubscribe = x.on("change", (latest) => {
      if (latest < deleteThreshold && !crossedThreshold) {
        setCrossedThreshold(true);
        navigator.vibrate?.(15);
      } else if (latest >= deleteThreshold && crossedThreshold) {
        setCrossedThreshold(false);
      }
    });

    return () => unsubscribe();
  }, [crossedThreshold, x]);

  const handleDrag = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (Math.abs(info.offset.x) > 5) {
      setSuppressClick(true);
    }
  };

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const didDrag = Math.abs(info.offset.x) > 5;
    if (info.offset.x < deleteThreshold || info.velocity.x < -500) {
      onDelete(record.id);
    }

    if (didDrag) {
      window.setTimeout(() => setSuppressClick(false), 0);
    } else {
      setSuppressClick(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{
        opacity: 0,
        height: 0,
        marginBottom: 0,
        x: -300,
        transition: {
          opacity: { duration: 0.2 },
          x: { duration: 0.2 },
          height: { duration: 0.3, delay: 0.1 },
          marginBottom: { duration: 0.3, delay: 0.1 },
        },
      }}
      transition={{ delay: index * 0.04 }}
      className="relative mb-3"
    >
      <motion.div
        style={{ opacity: bgOpacity }}
        className="absolute inset-0 bg-destructive flex items-center justify-end px-6 rounded-none"
      >
        <motion.div style={{ scale: iconScale }}>
          <Trash2 className="w-6 h-6 text-destructive-foreground" strokeWidth={2.5} />
        </motion.div>
      </motion.div>

      <motion.div
        data-testid={`history-note-${record.id}`}
        data-note-title={record.title}
        style={{ x }}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.5, right: 0.05 }}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        whileDrag={{ scale: 1.02, cursor: "grabbing" }}
        whileTap={{ scale: 0.98 }}
        onClick={() => {
          if (!suppressClick) {
            onEdit(record.id);
          }
        }}
        className="relative border-2 border-border bg-card p-4 flex flex-col gap-3 touch-pan-y cursor-pointer select-none"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              {formatDate(record.updatedAt)}
            </div>
            <h2 className="mt-1 truncate text-base font-black uppercase tracking-tight">
              {record.title}
            </h2>
          </div>

          <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onCopy(record.body)}
              aria-label={copyLabel}
              title={copyLabel}
              className="h-8 w-8 rounded-full hover:bg-muted transition-colors"
            >
              <Copy className="w-4 h-4 text-muted-foreground" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onEdit(record.id)}
              aria-label={editLabel}
              title={editLabel}
              className="h-8 w-8 rounded-full hover:bg-muted transition-colors"
            >
              <Edit2 className="w-4 h-4 text-muted-foreground" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDelete(record.id)}
              aria-label={deleteLabel}
              title={deleteLabel}
              className="h-8 w-8 rounded-full hover:bg-destructive/10 hover:text-destructive transition-colors"
            >
              <Trash2 className="w-4 h-4 text-muted-foreground" />
            </Button>
          </div>
        </div>

        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words text-muted-foreground">
          {deriveNoteExcerpt(record.body)}
        </p>
      </motion.div>
    </motion.div>
  );
}

export default function HistoryPage() {
  const { t, formatDate, language } = useLanguage();
  const [records, setRecords] = useState<StoredNoteRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [, setLocation] = useLocation();
  const copy =
    language === "ja"
      ? {
          helper: "タップで編集。削除ボタンか左スワイプで削除できます。",
          emptyTitle: "まだメモがありません",
          emptyBody: "思いついたことを1つだけ書き残すところから始めてください。",
          emptyCta: "メモを書く",
          backAria: "ホームに戻る",
          exportAria: "書き出しを開く",
          copyAria: "本文をコピー",
          editAria: "このメモを編集",
          deleteAria: "このメモを削除",
          searchAria: "メモを検索",
          deleted: "メモを削除しました",
        }
      : {
          helper: "Tap a note to edit it. Use the delete button or swipe left to remove it.",
          emptyTitle: "No notes yet",
          emptyBody: "Start with one quick thought. You can organize it later.",
          emptyCta: "Write a note",
          backAria: "Back to home",
          exportAria: "Open export",
          copyAria: "Copy note body",
          editAria: "Edit this note",
          deleteAria: "Delete this note",
          searchAria: "Search memos",
          deleted: "Note deleted",
        };

  const loadRecords = async () => {
    const activeRecords = await listActiveNotes();
    setRecords(activeRecords);
  };

  useEffect(() => {
    void loadRecords();
    return subscribeToNotesChanged(() => {
      void loadRecords();
    });
  }, []);

  const filteredRecords = useMemo(() => {
    if (!searchQuery.trim()) return records;
    const query = searchQuery.toLowerCase();
    return records.filter(
      (record) =>
        record.title.toLowerCase().includes(query) || record.body.toLowerCase().includes(query),
    );
  }, [records, searchQuery]);

  const handleDelete = async (id: string) => {
    try {
      await deleteNote(id);
      await loadRecords();
      toast.success(copy.deleted, {
        className:
          "font-bold uppercase tracking-widest border-2 border-foreground bg-background text-foreground rounded-none shadow-none",
      });
      navigator.vibrate?.([50, 30, 50]);
    } catch {
      toast.error(t("errorUnexpected"), {
        className:
          "font-bold uppercase tracking-widest border-2 border-destructive bg-background text-destructive rounded-none shadow-none",
      });
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("copied"), {
        duration: 1500,
        className:
          "font-bold uppercase tracking-widest border-2 border-foreground bg-background text-foreground rounded-none shadow-none",
      });
      navigator.vibrate?.(50);
    } catch {
      toast.error(t("copyFailed"), {
        className:
          "font-bold uppercase tracking-widest border-2 border-destructive bg-background text-destructive rounded-none shadow-none",
      });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="min-h-screen flex flex-col bg-background text-foreground font-sans"
    >
      <header className="sticky top-0 z-20 border-b-2 border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/")}
              aria-label={copy.backAria}
              title={copy.backAria}
              className="mr-2 h-10 w-10 rounded-full hover:bg-accent hover:text-accent-foreground"
            >
              <ArrowLeft className="h-6 w-6" strokeWidth={2.5} />
            </Button>
            <h1 className="text-lg font-black uppercase tracking-tighter">{t("history")}</h1>
          </div>

          <div className="flex items-center gap-1">
            {records.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsExportOpen(true)}
                aria-label={copy.exportAria}
                title={copy.exportAria}
                className="rounded-none hover:bg-muted"
              >
                <Download className="h-5 w-5" />
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="border-b border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
        <div className="mx-auto max-w-md">{copy.helper}</div>
      </div>

      <div className="sticky top-[57px] z-10 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t("searchPlaceholder")}
              aria-label={copy.searchAria}
              className="h-10 rounded-none border-border bg-muted/30 pl-9 pr-9 focus-visible:ring-1 focus-visible:ring-foreground"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSearchQuery("")}
                aria-label={language === "ja" ? "検索をクリア" : "Clear search"}
                title={language === "ja" ? "検索をクリア" : "Clear search"}
                className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:bg-transparent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      <main className="flex-1 max-w-md mx-auto w-full p-4 overflow-x-hidden relative">
        <AnimatePresence mode="popLayout">
          {filteredRecords.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-64 text-center text-muted-foreground"
            >
              <Search className="w-12 h-12 mb-4 opacity-20" />
              <p className="font-black text-foreground">{searchQuery ? t("noMatchingMemos") : copy.emptyTitle}</p>
              {!searchQuery && (
                <>
                  <p className="mt-2 text-sm">{copy.emptyBody}</p>
                  <Button
                    onClick={() => setLocation("/")}
                    className="mt-5 rounded-none border-2 border-foreground bg-foreground font-black uppercase tracking-[0.2em] text-background hover:bg-foreground/90"
                  >
                    {copy.emptyCta}
                  </Button>
                </>
              )}
            </motion.div>
          ) : (
            filteredRecords.map((record, index) => (
              <HistoryItem
                key={record.id}
                record={record}
                index={index}
                onDelete={(noteId) => {
                  void handleDelete(noteId);
                }}
                onEdit={(noteId) => setLocation(`/edit/${noteId}`)}
                onCopy={(value) => {
                  void handleCopy(value);
                }}
                formatDate={formatDate}
                copyLabel={copy.copyAria}
                editLabel={copy.editAria}
                deleteLabel={copy.deleteAria}
              />
            ))
          )}
        </AnimatePresence>
      </main>

      <Suspense fallback={null}>
        <ExportModal isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} records={records} />
      </Suspense>
    </motion.div>
  );
}
