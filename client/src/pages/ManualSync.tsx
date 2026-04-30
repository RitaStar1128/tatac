import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, FileUp, FolderArchive, ShieldAlert } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSyncSessionSecret, setSyncSessionSecret } from "@/domains/sync/sessionSecretStore";
import { exportTatacSyncFile, importTatacSyncFile, type ManualImportResult } from "@/domains/sync/syncEngine";
import { getOrCreateSyncConfig } from "@/domains/sync/syncSettingsStore";
import { useLanguage } from "@/contexts/LanguageContext";
import { tatacSyncFileSchema, type TatacSyncFile } from "@shared/contracts";

interface ImportPreview {
  fileName: string;
  payload: TatacSyncFile;
}

function useLabels(language: "ja" | "en") {
  return useMemo(
    () =>
      language === "ja"
        ? {
            title: "手動同期",
            subtitle: "sync-node が使えないときのフォールバックとして、暗号化された `.tatacsync` を搬送します。",
            exportTitle: "暗号 export",
            exportBody: "現在の oplog を AES-GCM で暗号化して `.tatacsync` ファイルに保存します。",
            exportAction: "`.tatacsync` を保存",
            importTitle: "暗号 import",
            importBody: "`.tatacsync` を検証し、復号して local DB に適用します。",
            importAction: "ファイルを選択",
            importValidated: "ファイルを読み込みました。復号と適用を実行します。",
            importInvalid: "このファイルは `.tatacsync` 仕様に一致しません。",
            importCompleted: "手動同期ファイルを適用しました。",
            importFailed: "手動同期ファイルの適用に失敗しました。",
            statusTitle: "現状態",
            activeUser: "現在の User ID",
            device: "現在の Device ID",
            salt: "現在の Group Salt",
            passphrase: "パスフレーズ",
            passphraseHint: "ここで入力したパスフレーズは sessionStorage にだけ保持されます。",
            resultTitle: "Import 結果",
            imported: "読み込み",
            applied: "適用",
            duplicates: "重複",
            adoptedSalt: "Salt 更新",
            yes: "あり",
            no: "なし",
          }
        : {
            title: "MANUAL SYNC",
            subtitle: "Use encrypted `.tatacsync` files as the fallback when the sync node is unavailable.",
            exportTitle: "ENCRYPTED EXPORT",
            exportBody: "Encrypt the current oplog with AES-GCM and save it as a `.tatacsync` file.",
            exportAction: "DOWNLOAD `.tatacsync`",
            importTitle: "ENCRYPTED IMPORT",
            importBody: "Validate a `.tatacsync` file, decrypt it, and apply its operations to the local database.",
            importAction: "SELECT FILE",
            importValidated: "File loaded. Running decrypt-and-apply.",
            importInvalid: "This file does not match the `.tatacsync` contract.",
            importCompleted: "Manual sync file applied.",
            importFailed: "Failed to apply the manual sync file.",
            statusTitle: "CURRENT STATE",
            activeUser: "Active User ID",
            device: "Current Device ID",
            salt: "Current Group Salt",
            passphrase: "Passphrase",
            passphraseHint: "The passphrase entered here is kept in sessionStorage only.",
            resultTitle: "IMPORT RESULT",
            imported: "Imported",
            applied: "Applied",
            duplicates: "Duplicates",
            adoptedSalt: "Salt Updated",
            yes: "Yes",
            no: "No",
          },
    [language],
  );
}

function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export default function ManualSyncPage() {
  const [, setLocation] = useLocation();
  const { language, formatDate } = useLanguage();
  const labels = useLabels(language);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importResult, setImportResult] = useState<ManualImportResult | null>(null);
  const [currentIdentity, setCurrentIdentity] = useState({
    userId: "",
    deviceId: "",
    salt: "",
    passphrase: "",
  });

  const loadIdentity = async () => {
    const config = await getOrCreateSyncConfig();
    setCurrentIdentity({
      userId: config.userId,
      deviceId: config.deviceId,
      salt: config.salt,
      passphrase: getSyncSessionSecret()?.passphrase ?? "",
    });
  };

  useEffect(() => {
    void loadIdentity();
  }, []);

  const handlePassphraseChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const passphrase = event.target.value;
    setCurrentIdentity((current) => ({ ...current, passphrase }));
    setSyncSessionSecret({ passphrase });
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const file = await exportTatacSyncFile();
      downloadJson(`tatac-${new Date().toISOString().slice(0, 10)}.tatacsync`, file);
      toast.success(labels.exportAction, {
        className:
          "font-bold uppercase tracking-widest border-2 border-foreground bg-background text-foreground rounded-none shadow-none",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : labels.importFailed, {
        className:
          "font-bold uppercase tracking-widest border-2 border-destructive bg-background text-destructive rounded-none shadow-none",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handlePickFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);

    try {
      const text = await file.text();
      const parsedJson = JSON.parse(text);
      const parsed = tatacSyncFileSchema.safeParse(parsedJson);

      if (!parsed.success) {
        toast.error(labels.importInvalid, {
          className:
            "font-bold uppercase tracking-widest border-2 border-destructive bg-background text-destructive rounded-none shadow-none",
        });
        setImportPreview(null);
        setImportResult(null);
        return;
      }

      setImportPreview({
        fileName: file.name,
        payload: parsed.data,
      });

      const result = await importTatacSyncFile(parsed.data);
      setImportResult(result);
      await loadIdentity();
      toast.success(labels.importCompleted, {
        className:
          "font-bold uppercase tracking-widest border-2 border-foreground bg-background text-foreground rounded-none shadow-none",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : labels.importFailed, {
        className:
          "font-bold uppercase tracking-widest border-2 border-destructive bg-background text-destructive rounded-none shadow-none",
      });
      setImportResult(null);
    } finally {
      event.target.value = "";
      setIsImporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b-2 border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/sync-settings")}
            className="rounded-full border border-border hover:bg-muted"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg font-black uppercase tracking-tight">{labels.title}</h1>
            <p className="text-xs text-muted-foreground">{labels.subtitle}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-4xl gap-6 px-4 py-6 md:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-6">
          <div className="border-2 border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center border-2 border-foreground bg-foreground text-background">
                <ShieldAlert className="h-4 w-4" />
              </span>
              <div>
                <h2 className="font-black uppercase tracking-widest">{labels.passphrase}</h2>
                <p className="text-sm text-muted-foreground">{labels.passphraseHint}</p>
              </div>
            </div>

            <Input
              aria-label="manual-sync-passphrase"
              type="password"
              value={currentIdentity.passphrase}
              onChange={handlePassphraseChange}
              placeholder="session-only"
              className="rounded-none border-2"
            />
          </div>

          <div className="border-2 border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center border-2 border-foreground bg-foreground text-background">
                <Download className="h-4 w-4" />
              </span>
              <div>
                <h2 className="font-black uppercase tracking-widest">{labels.exportTitle}</h2>
                <p className="text-sm text-muted-foreground">{labels.exportBody}</p>
              </div>
            </div>

            <Button
              onClick={handleExport}
              disabled={isExporting || currentIdentity.passphrase.trim().length < 8}
              className="h-12 rounded-none border-2 border-foreground bg-foreground font-black uppercase tracking-[0.2em] text-background hover:bg-foreground/90"
            >
              <FolderArchive className="mr-2 h-4 w-4" />
              {labels.exportAction}
            </Button>
          </div>

          <div className="border-2 border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center border-2 border-foreground bg-background">
                <FileUp className="h-4 w-4" />
              </span>
              <div>
                <h2 className="font-black uppercase tracking-widest">{labels.importTitle}</h2>
                <p className="text-sm text-muted-foreground">{labels.importBody}</p>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.tatacsync"
              className="hidden"
              onChange={handleFileChange}
            />

            <Button
              onClick={handlePickFile}
              disabled={isImporting || currentIdentity.passphrase.trim().length < 8}
              variant="outline"
              className="h-12 rounded-none border-2 border-foreground font-black uppercase tracking-[0.2em]"
            >
              <FileUp className="mr-2 h-4 w-4" />
              {labels.importAction}
            </Button>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="border-2 border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" />
              <h2 className="font-black uppercase tracking-widest">{labels.statusTitle}</h2>
            </div>

            <div className="space-y-3 text-sm">
              <div className="border border-border px-3 py-3">
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{labels.activeUser}</div>
                <div className="mt-1 font-mono">{currentIdentity.userId || "..."}</div>
              </div>
              <div className="border border-border px-3 py-3">
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{labels.device}</div>
                <div className="mt-1 font-mono">{currentIdentity.deviceId || "..."}</div>
              </div>
              <div className="border border-border px-3 py-3">
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{labels.salt}</div>
                <div className="mt-1 font-mono break-all">{currentIdentity.salt || "..."}</div>
              </div>
            </div>
          </div>

          {importPreview && (
            <div className="border-2 border-border bg-card p-5">
              <h2 className="mb-4 font-black uppercase tracking-widest">{importPreview.fileName}</h2>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">User</span>
                  <span className="font-mono">{importPreview.payload.userId}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Device</span>
                  <span className="font-mono">{importPreview.payload.fromDeviceId}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Items</span>
                  <span className="font-mono">{importPreview.payload.items.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Exported</span>
                  <span>{formatDate(importPreview.payload.exportedAt)}</span>
                </div>
              </div>
            </div>
          )}

          {importResult && (
            <div className="border-2 border-border bg-card p-5">
              <h2 className="mb-4 font-black uppercase tracking-widest">{labels.resultTitle}</h2>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{labels.imported}</span>
                  <span className="font-mono">{importResult.importedItems}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{labels.applied}</span>
                  <span className="font-mono">{importResult.applied}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{labels.duplicates}</span>
                  <span className="font-mono">{importResult.duplicates}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{labels.adoptedSalt}</span>
                  <span className="font-mono">{importResult.adoptedSalt ? labels.yes : labels.no}</span>
                </div>
              </div>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
