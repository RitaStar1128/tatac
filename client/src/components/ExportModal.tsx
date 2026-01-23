import { useState } from "react";
import { Download, Copy, Check, FileJson, FileText, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "sonner";

// UX_RATIONALE:
// - feedback_loop: コピー完了時にアイコンを変化させ、成功を視覚的にフィードバック。
// - mental_model: 一般的なファイル形式（JSON/Markdown）のアイコンを使用し、内容を予測しやすくする。
// - confirmation_dialog: エクスポート前に形式を選択させることで、意図しない形式での出力を防ぐ。

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  records: any[];
}

export function ExportModal({ isOpen, onClose, records }: ExportModalProps) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);

  const handleCopy = (format: 'json' | 'markdown') => {
    let content = '';
    
    if (format === 'json') {
      content = JSON.stringify(records, null, 2);
    } else {
      content = records.map(r => {
        const date = new Date(r.date).toLocaleString();
        return `## ${date}\n${r.text}\n`;
      }).join('\n---\n\n');
    }

    navigator.clipboard.writeText(content);
    setCopied(true);
    toast.success(t("copied"));
    
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = (format: 'json' | 'markdown') => {
    let content = '';
    let mimeType = '';
    let extension = '';

    if (format === 'json') {
      content = JSON.stringify(records, null, 2);
      mimeType = 'application/json';
      extension = 'json';
    } else {
      content = records.map(r => {
        const date = new Date(r.date).toLocaleString();
        return `## ${date}\n${r.text}\n`;
      }).join('\n---\n\n');
      mimeType = 'text/markdown';
      extension = 'md';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tatac_export_${new Date().toISOString().slice(0, 10)}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success(t("downloaded"));
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-card border-2 border-foreground p-6 shadow-none relative"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black tracking-tighter uppercase flex items-center gap-2">
                <span className="bg-foreground text-background px-2 py-1">
                  <Download className="w-4 h-4" />
                </span>
                {t("exportData")}
              </h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="rounded-none hover:bg-destructive hover:text-destructive-foreground transition-colors"
              >
                <X className="w-6 h-6" />
              </Button>
            </div>

            <div className="space-y-6">
              {/* JSON Export */}
              <div className="space-y-2">
                <h3 className="font-bold text-sm uppercase flex items-center gap-2">
                  <FileJson className="w-4 h-4" /> JSON
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    onClick={() => handleCopy('json')}
                    variant="outline"
                    className="border-2 border-foreground rounded-none font-bold hover:bg-accent"
                  >
                    {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                    {t("copy")}
                  </Button>
                  <Button 
                    onClick={() => handleDownload('json')}
                    className="bg-foreground text-background border-2 border-foreground rounded-none font-bold hover:bg-foreground/90"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    {t("download")}
                  </Button>
                </div>
              </div>

              {/* Markdown Export */}
              <div className="space-y-2">
                <h3 className="font-bold text-sm uppercase flex items-center gap-2">
                  <FileText className="w-4 h-4" /> Markdown
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    onClick={() => handleCopy('markdown')}
                    variant="outline"
                    className="border-2 border-foreground rounded-none font-bold hover:bg-accent"
                  >
                    {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                    {t("copy")}
                  </Button>
                  <Button 
                    onClick={() => handleDownload('markdown')}
                    className="bg-foreground text-background border-2 border-foreground rounded-none font-bold hover:bg-foreground/90"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    {t("download")}
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
