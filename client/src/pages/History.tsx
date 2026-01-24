import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { ArrowLeft, Trash2, Edit2, ShoppingBag, Download, Copy, Search, X } from "lucide-react";
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo, useSpring } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";
import { ExportModal } from "@/components/ExportModal";
import { toast } from "sonner";

// UX_RATIONALE:
// - readability: メモの内容を省略せずに全て表示することで、詳細を確認するためにタップする手間を省く。
// - efficiency: コピーボタンを各項目に配置し、ワンタップでクリップボードにコピーできるようにする。
// - spring_physics: スワイプ操作にバネのような物理挙動を導入し、指への追従性と心地よい反発感を実現。
// - dynamic_feedback: スワイプ量に応じてゴミ箱アイコンのスケールや色を変化させ、削除の閾値を直感的に伝える。
// - search_accessibility: 履歴が増えた際の検索性を高めるため、ヘッダー直下に検索バーを配置。
// - instant_feedback: 入力と同時にフィルタリングを行い、即座に結果を表示する。

interface Record {
  id: string;
  text: string;
  date: string;
  updatedAt?: string;
}

// Swipeable Item Component with Advanced Physics
function HistoryItem({ 
  record, 
  index, 
  onDelete, 
  onEdit,
  onCopy,
  formatDate 
}: { 
  record: Record; 
  index: number; 
  onDelete: (id: string) => void; 
  onEdit: (id: string) => void;
  onCopy: (text: string) => void;
  formatDate: (date: string) => string;
}) {
  // Motion values for swipe gesture
  const x = useMotionValue(0);
  const dragX = useSpring(x, { stiffness: 500, damping: 30 }); // Add spring physics to drag
  
  // Dynamic transformations based on swipe distance
  const deleteThreshold = -100;
  const bgOpacity = useTransform(x, [0, -50, -100], [0, 0.5, 1]);
  const iconScale = useTransform(x, [-50, -100, -150], [0.8, 1.2, 1.5]);
  const iconColor = useTransform(x, [-80, -100], ["#ffffff", "#ff0000"]); // White to Red
  
  // Track if threshold was crossed to trigger haptic once
  const [crossedThreshold, setCrossedThreshold] = useState(false);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    const unsubscribe = x.on("change", (latest) => {
      if (latest < deleteThreshold && !crossedThreshold) {
        setCrossedThreshold(true);
        if (navigator.vibrate) navigator.vibrate(15); // Light tick
      } else if (latest >= deleteThreshold && crossedThreshold) {
        setCrossedThreshold(false);
      }
    });
    return () => unsubscribe();
  }, [x, crossedThreshold]);

  const handleDrag = (_: any, info: PanInfo) => {
    if (Math.abs(info.offset.x) > 5) {
      suppressClickRef.current = true;
    }
  };

  const handleDragEnd = (_: any, info: PanInfo) => {
    const didDrag = Math.abs(info.offset.x) > 5;
    if (info.offset.x < deleteThreshold || info.velocity.x < -500) {
      // Trigger delete with velocity or distance
      onDelete(record.id);
    } else {
      // Reset is handled by dragConstraints
    }
    if (didDrag) {
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    } else {
      suppressClickRef.current = false;
    }
  };

  return (
    <motion.div
      layout // Enable layout animation for smooth list reordering
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
          marginBottom: { duration: 0.3, delay: 0.1 }
        } 
      }}
      transition={{ delay: index * 0.05 }}
      className="relative mb-3"
    >
      {/* Background Layer (Delete Action) */}
      <motion.div 
        style={{ opacity: bgOpacity }}
        className="absolute inset-0 bg-destructive flex items-center justify-end px-6 rounded-none"
      >
        <motion.div style={{ scale: iconScale, color: iconColor }}>
          <Trash2 className="w-6 h-6 text-destructive-foreground" strokeWidth={2.5} />
        </motion.div>
      </motion.div>

      {/* Foreground Layer (Content) */}
      <motion.div
        style={{ x }}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.5, right: 0.05 }} // Stiffer right resistance
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        whileDrag={{ scale: 1.02, cursor: "grabbing" }}
        whileTap={{ scale: 0.98 }}
        onClick={() => {
          if (suppressClickRef.current) return;
          onEdit(record.id);
        }}
        className="relative border-2 border-border bg-card p-4 flex flex-col gap-3 touch-pan-y cursor-pointer select-none"
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            {formatDate(record.date)}
            {record.updatedAt && (
              <span className="ml-2 opacity-70">
                (edited)
              </span>
            )}
          </span>
          
          {/* Action Buttons */}
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onCopy(record.text)}
              className="h-8 w-8 rounded-full hover:bg-muted transition-colors"
            >
              <Copy className="w-4 h-4 text-muted-foreground" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onEdit(record.id)}
              className="h-8 w-8 rounded-full hover:bg-muted transition-colors"
            >
              <Edit2 className="w-4 h-4 text-muted-foreground" />
            </Button>
          </div>
        </div>

        <div className="flex flex-col">
          <span className="text-base font-medium leading-relaxed whitespace-pre-wrap break-words">
            {record.text}
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function HistoryPage() {
  const { t, formatDate } = useLanguage();
  const [records, setRecords] = useState<Record[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<Record[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showTutorial, setShowTutorial] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [_, setLocation] = useLocation();

  useEffect(() => {
    const storedData = localStorage.getItem("tatac_records");
    if (storedData) {
      // Sort by date desc
      const parsed = JSON.parse(storedData).sort((a: Record, b: Record) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      setRecords(parsed);
      setFilteredRecords(parsed);
    }

    // Check tutorial status
    const hasSeenTutorial = localStorage.getItem("tatac_swipe_tutorial_seen");
    if (!hasSeenTutorial && storedData && JSON.parse(storedData).length > 0) {
      setShowTutorial(true);
      // Auto dismiss after 3 seconds
      setTimeout(() => {
        setShowTutorial(false);
        localStorage.setItem("tatac_swipe_tutorial_seen", "true");
      }, 3000);
    }
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredRecords(records);
      return;
    }
    
    const query = searchQuery.toLowerCase();
    const filtered = records.filter(record => 
      record.text.toLowerCase().includes(query)
    );
    setFilteredRecords(filtered);
  }, [searchQuery, records]);

  const handleDelete = (id: string) => {
    const newRecords = records.filter((r) => r.id !== id);
    setRecords(newRecords);
    localStorage.setItem("tatac_records", JSON.stringify(newRecords));
    // Stronger haptic feedback on delete
    if (navigator.vibrate) {
      navigator.vibrate([50, 30, 50]);
    }
  };

  const handleEdit = (id: string) => {
    setLocation(`/edit/${id}`);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success(t("copied"), {
        duration: 1500,
        className: "font-bold uppercase tracking-widest border-2 border-foreground bg-background text-foreground rounded-none shadow-none",
      });
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    }).catch(() => {
      toast.error("Failed to copy", {
        className: "font-bold uppercase tracking-widest border-2 border-destructive bg-background text-destructive rounded-none shadow-none",
      });
    });
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="min-h-screen flex flex-col bg-background text-foreground font-sans"
    >
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b-2 border-border bg-background sticky top-0 z-10">
        <div className="flex items-center">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setLocation("/")}
            className="mr-2 w-10 h-10 rounded-full hover:bg-accent hover:text-accent-foreground transition-all active:translate-x-[-2px]"
          >
            <ArrowLeft className="w-6 h-6" strokeWidth={2.5} />
          </Button>
          <h1 className="text-lg font-black tracking-tighter uppercase">{t("history")}</h1>
        </div>
        
        {records.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsExportOpen(true)}
            className="rounded-none hover:bg-muted transition-colors"
          >
            <Download className="w-5 h-5" />
          </Button>
        )}
      </header>

      {/* Search Bar */}
      <div className="px-4 py-3 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-[60px] z-10">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("searchPlaceholder") || "Search memos..."}
            className="pl-9 pr-9 h-10 rounded-none border-border focus-visible:ring-1 focus-visible:ring-foreground bg-muted/30"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSearchQuery("")}
              className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 hover:bg-transparent text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      <main className="flex-1 max-w-md mx-auto w-full p-4 overflow-x-hidden relative">
        {/* Tutorial Overlay */}
        <AnimatePresence>
          {showTutorial && records.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-20 pointer-events-none flex items-start justify-center pt-12"
            >
              <div className="bg-foreground/90 text-background px-4 py-2 rounded-full font-bold text-sm flex items-center gap-2 shadow-lg">
                <motion.div
                  animate={{ x: [-5, 5, -5] }}
                  transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                >
                  ←
                </motion.div>
                {t("swipeToDelete")}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="popLayout">
          {filteredRecords.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-64 text-muted-foreground"
            >
              <ShoppingBag className="w-12 h-12 mb-4 opacity-20" />
              <p className="font-bold">
                {searchQuery ? "No matching memos found" : t("noRecords")}
              </p>
            </motion.div>
          ) : (
            filteredRecords.map((record, index) => (
              <HistoryItem 
                key={record.id} 
                record={record} 
                index={index} 
                onDelete={handleDelete}
                onEdit={handleEdit}
                onCopy={handleCopy}
                formatDate={formatDate}
              />
            ))
          )}
        </AnimatePresence>
      </main>

      <ExportModal 
        isOpen={isExportOpen} 
        onClose={() => setIsExportOpen(false)} 
        records={records} 
      />
    </motion.div>
  );
}
