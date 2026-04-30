import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileUp,
  FolderArchive,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { getPersistedSyncSecret } from "@/domains/sync/persistedSyncSecretStore";
import { Input } from "@/components/ui/input";
import { clearSyncSessionSecret, getSyncSessionSecret, setSyncSessionSecret } from "@/domains/sync/sessionSecretStore";
import { exportTatacSyncFile, importTatacSyncFile, type ManualImportResult } from "@/domains/sync/syncEngine";
import { getOrCreateSyncConfig } from "@/domains/sync/syncSettingsStore";
import { useLanguage } from "@/contexts/LanguageContext";
import { tatacSyncFileSchema, type TatacSyncFile } from "@shared/contracts";

interface ImportPreview {
  fileName: string;
  payload: TatacSyncFile;
}

interface ManualSyncStatusMessage {
  tone: "neutral" | "success" | "warning";
  text: string;
}

function toastClassName(kind: "default" | "error" = "default"): string {
  return kind === "error"
    ? "font-bold uppercase tracking-widest border-2 border-destructive bg-background text-destructive rounded-none shadow-none"
    : "font-bold uppercase tracking-widest border-2 border-foreground bg-background text-foreground rounded-none shadow-none";
}

function useLabels(language: "ja" | "en") {
  return useMemo(
    () =>
      language === "ja"
        ? {
            title: "手動同期",
            subtitle: "sync-node が使えない時は、暗号化された .tatacsync ファイルで差分を運びます。",
            back: "同期設定に戻る",
            howItWorks: "手順",
            stepOne: "1. 送信元端末で export",
            stepTwo: "2. ファイルを移す",
            stepThree: "3. 受信先端末で import",
            stepOneBody: "送信したい差分を含む端末で .tatacsync を書き出します。",
            stepTwoBody: "AirDrop、USB、共有ドライブなどでファイルを移します。",
            stepThreeBody: "受信先の端末で同じ userId と passphrase を用意して取り込みます。",
            passphraseTitle: "Passphrase",
            passphraseBody: "この passphrase で暗号化と復号を行います。sessionStorage のみに保持します。",
            passphraseHint: "8文字以上の passphrase を入れると、この session で export / import が有効になります。",
            passphraseReady: "この session で利用可能",
            passphraseMissing: "まだ入力されていません",
            exportTitle: "この端末から書き出す",
            exportBody: "現在の oplog を AES-GCM で暗号化して .tatacsync を作ります。送信元端末で使います。",
            exportAction: ".tatacsync を書き出す",
            exportDone: "暗号化同期ファイルを出力しました。",
            importTitle: "この端末に取り込む",
            importBody: "受け取った .tatacsync を検証して復号し、この端末のローカル DB に適用します。",
            importAction: "ファイルを選んで取り込む",
            importLoaded: "ファイルを読み込みました。復号して適用します。",
            importCompleted: "手動同期ファイルを適用しました。",
            invalidFile: "このファイルは .tatacsync 形式ではありません。",
            importFailed: "手動同期ファイルの適用に失敗しました。",
            currentState: "この端末の状態",
            activeUser: "User ID",
            device: "Device ID",
            salt: "Group Salt",
            rulesTitle: "一致条件",
            rulesBody: "同じ userId、同じ passphrase、同じ salt を使う端末同士だけが同じ同期グループになります。",
            previewTitle: "読み込んだファイル",
            resultTitle: "取込結果",
            imported: "読み込んだ件数",
            applied: "反映した件数",
            duplicates: "重複スキップ",
            adoptedSalt: "salt 更新",
            yes: "あり",
            no: "なし",
            needPassphrase: "8文字以上の passphrase を入力してください。",
            groupMismatch: "別の同期グループのファイルです。同じ userId と salt の端末だけで使ってください。",
            decryptMismatch: "復号できませんでした。同じ passphrase を入力しているか確認してください。",
            importPreviewUser: "User",
            importPreviewDevice: "From Device",
            importPreviewItems: "Items",
            importPreviewExported: "Exported",
          }
        : {
            title: "MANUAL SYNC",
            subtitle: "When the sync node is unavailable, move encrypted deltas with a .tatacsync file.",
            back: "Back to sync settings",
            howItWorks: "HOW IT WORKS",
            stepOne: "1. Export on the source device",
            stepTwo: "2. Move the file",
            stepThree: "3. Import on the destination device",
            stepOneBody: "Create the .tatacsync file on the device that has the changes you want to send.",
            stepTwoBody: "Transfer the file with AirDrop, USB, shared storage, or any other offline path.",
            stepThreeBody: "On the receiving device, use the same userId and passphrase before importing.",
            passphraseTitle: "PASSPHRASE",
            passphraseBody: "This passphrase encrypts and decrypts the payload. It stays in sessionStorage only.",
            passphraseHint: "Enter at least 8 characters to enable export and import in this session.",
            passphraseReady: "Ready in this session",
            passphraseMissing: "Not entered yet",
            exportTitle: "EXPORT FROM THIS DEVICE",
            exportBody: "Encrypt the current oplog as a .tatacsync file. Use this on the sending device.",
            exportAction: "EXPORT `.tatacsync`",
            exportDone: "Encrypted sync file exported.",
            importTitle: "IMPORT INTO THIS DEVICE",
            importBody: "Validate, decrypt, and apply the received .tatacsync file to this local database.",
            importAction: "SELECT FILE TO IMPORT",
            importLoaded: "File loaded. Decrypting and applying.",
            importCompleted: "Manual sync file applied.",
            invalidFile: "This file does not match the .tatacsync format.",
            importFailed: "Failed to apply the manual sync file.",
            currentState: "CURRENT DEVICE STATE",
            activeUser: "User ID",
            device: "Device ID",
            salt: "Group Salt",
            rulesTitle: "MATCHING RULES",
            rulesBody: "Only devices using the same userId, passphrase, and salt belong to the same sync group.",
            previewTitle: "LOADED FILE",
            resultTitle: "IMPORT RESULT",
            imported: "Imported",
            applied: "Applied",
            duplicates: "Duplicates",
            adoptedSalt: "Salt Updated",
            yes: "Yes",
            no: "No",
            needPassphrase: "Enter a passphrase with at least 8 characters.",
            groupMismatch: "This file belongs to a different sync group. Use matching userId and salt.",
            decryptMismatch: "Unable to decrypt this file. Check that the same passphrase is entered here.",
            importPreviewUser: "User",
            importPreviewDevice: "From Device",
            importPreviewItems: "Items",
            importPreviewExported: "Exported",
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

function getFriendlyManualSyncError(error: unknown, labels: ReturnType<typeof useLabels>): string {
  const message = error instanceof Error ? error.message : labels.importFailed;

  if (
    message.includes("different sync group") ||
    message.includes("recipient does not match")
  ) {
    return labels.groupMismatch;
  }

  if (
    message.includes("Unable to decrypt the sync payload") ||
    message.includes("passphrase is required") ||
    message.includes("sync secret is required")
  ) {
    return labels.decryptMismatch;
  }

  return message;
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
  const [statusMessage, setStatusMessage] = useState<ManualSyncStatusMessage | null>(null);
  const [currentIdentity, setCurrentIdentity] = useState({
    userId: "",
    deviceId: "",
    salt: "",
    passphrase: "",
  });

  const passphraseReady = currentIdentity.passphrase.trim().length >= 8;

  const loadIdentity = async () => {
    const [config, persistedSecret] = await Promise.all([getOrCreateSyncConfig(), getPersistedSyncSecret()]);
    const resolvedPassphrase = getSyncSessionSecret()?.passphrase ?? persistedSecret?.groupSecret ?? "";
    if (resolvedPassphrase) {
      setSyncSessionSecret({ passphrase: resolvedPassphrase });
    }
    setCurrentIdentity({
      userId: config.userId,
      deviceId: config.deviceId,
      salt: config.salt,
      passphrase: resolvedPassphrase,
    });
  };

  useEffect(() => {
    void loadIdentity();
  }, []);

  const handlePassphraseChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const passphrase = event.target.value;
    setCurrentIdentity((current) => ({ ...current, passphrase }));
    if (passphrase.trim().length >= 8) {
      setSyncSessionSecret({ passphrase });
    } else {
      clearSyncSessionSecret();
    }
    setStatusMessage({
      tone: passphrase.trim().length >= 8 ? "success" : "warning",
      text: passphrase.trim().length >= 8 ? labels.passphraseReady : labels.needPassphrase,
    });
  };

  const handleExport = async () => {
    if (!passphraseReady) {
      setStatusMessage({
        tone: "warning",
        text: labels.needPassphrase,
      });
      toast.error(labels.needPassphrase, { className: toastClassName("error") });
      return;
    }

    setIsExporting(true);
    try {
      const file = await exportTatacSyncFile();
      downloadJson(`tatac-${new Date().toISOString().slice(0, 10)}.tatacsync`, file);
      setStatusMessage({
        tone: "success",
        text: labels.exportDone,
      });
      toast.success(labels.exportDone, { className: toastClassName() });
    } catch (error) {
      const message = getFriendlyManualSyncError(error, labels);
      setStatusMessage({
        tone: "warning",
        text: message,
      });
      toast.error(message, { className: toastClassName("error") });
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

    if (!passphraseReady) {
      setStatusMessage({
        tone: "warning",
        text: labels.needPassphrase,
      });
      toast.error(labels.needPassphrase, { className: toastClassName("error") });
      event.target.value = "";
      return;
    }

    setIsImporting(true);

    try {
      const text = await file.text();
      const parsedJson = JSON.parse(text);
      const parsed = tatacSyncFileSchema.safeParse(parsedJson);

      if (!parsed.success) {
        setImportPreview(null);
        setImportResult(null);
        setStatusMessage({
          tone: "warning",
          text: labels.invalidFile,
        });
        toast.error(labels.invalidFile, { className: toastClassName("error") });
        return;
      }

      setImportPreview({
        fileName: file.name,
        payload: parsed.data,
      });
      setStatusMessage({
        tone: "neutral",
        text: labels.importLoaded,
      });

      const result = await importTatacSyncFile(parsed.data);
      setImportResult(result);
      await loadIdentity();
      setStatusMessage({
        tone: "success",
        text: labels.importCompleted,
      });
      toast.success(labels.importCompleted, { className: toastClassName() });
    } catch (error) {
      const message = getFriendlyManualSyncError(error, labels);
      setImportResult(null);
      setStatusMessage({
        tone: "warning",
        text: message,
      });
      toast.error(message, { className: toastClassName("error") });
    } finally {
      event.target.value = "";
      setIsImporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b-2 border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/sync-settings")}
            aria-label={labels.back}
            title={labels.back}
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

      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="space-y-6">
          <div className="border-2 border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <FolderArchive className="h-4 w-4" />
              <h2 className="font-black uppercase tracking-widest">{labels.howItWorks}</h2>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="border border-border bg-muted/20 p-4">
                <div className="text-sm font-black uppercase tracking-[0.18em]">{labels.stepOne}</div>
                <p className="mt-2 text-sm text-muted-foreground">{labels.stepOneBody}</p>
              </div>
              <div className="border border-border bg-muted/20 p-4">
                <div className="text-sm font-black uppercase tracking-[0.18em]">{labels.stepTwo}</div>
                <p className="mt-2 text-sm text-muted-foreground">{labels.stepTwoBody}</p>
              </div>
              <div className="border border-border bg-muted/20 p-4">
                <div className="text-sm font-black uppercase tracking-[0.18em]">{labels.stepThree}</div>
                <p className="mt-2 text-sm text-muted-foreground">{labels.stepThreeBody}</p>
              </div>
            </div>
          </div>

          <div className="border-2 border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center border-2 border-foreground bg-foreground text-background">
                <ShieldAlert className="h-4 w-4" />
              </span>
              <div>
                <h2 className="font-black uppercase tracking-widest">{labels.passphraseTitle}</h2>
                <p className="text-sm text-muted-foreground">{labels.passphraseBody}</p>
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

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">{labels.passphraseHint}</span>
              <span
                className={`border px-2 py-1 font-black uppercase tracking-[0.18em] ${
                  passphraseReady
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground"
                }`}
              >
                {passphraseReady ? labels.passphraseReady : labels.passphraseMissing}
              </span>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
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
                disabled={isExporting || !passphraseReady}
                className="h-12 w-full rounded-none border-2 border-foreground bg-foreground font-black uppercase tracking-[0.2em] text-background hover:bg-foreground/90"
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
                disabled={isImporting || !passphraseReady}
                variant="outline"
                className="h-12 w-full rounded-none border-2 border-foreground font-black uppercase tracking-[0.2em]"
              >
                <FileUp className="mr-2 h-4 w-4" />
                {labels.importAction}
              </Button>
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="border-2 border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" />
              <h2 className="font-black uppercase tracking-widest">{labels.currentState}</h2>
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
                <div className="mt-1 break-all font-mono">{currentIdentity.salt || "..."}</div>
              </div>
            </div>
          </div>

          <div className="border-2 border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <TriangleAlert className="h-4 w-4" />
              <h2 className="font-black uppercase tracking-widest">{labels.rulesTitle}</h2>
            </div>
            <p className="text-sm text-muted-foreground">{labels.rulesBody}</p>
          </div>

          {statusMessage && (
            <div
              className={`border-2 p-5 ${
                statusMessage.tone === "success"
                  ? "border-border bg-card"
                  : statusMessage.tone === "warning"
                    ? "border-destructive/40 bg-destructive/5"
                    : "border-border bg-card"
              }`}
            >
              <div className="flex items-start gap-3">
                {statusMessage.tone === "success" ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4" />
                ) : statusMessage.tone === "warning" ? (
                  <TriangleAlert className="mt-0.5 h-4 w-4 text-destructive" />
                ) : (
                  <ShieldAlert className="mt-0.5 h-4 w-4" />
                )}
                <p className="text-sm">{statusMessage.text}</p>
              </div>
            </div>
          )}

          {importPreview && (
            <div className="border-2 border-border bg-card p-5">
              <h2 className="mb-4 font-black uppercase tracking-widest">{labels.previewTitle}</h2>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{labels.importPreviewUser}</span>
                  <span className="font-mono">{importPreview.payload.userId}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{labels.importPreviewDevice}</span>
                  <span className="font-mono">{importPreview.payload.fromDeviceId}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{labels.importPreviewItems}</span>
                  <span className="font-mono">{importPreview.payload.items.length}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{labels.importPreviewExported}</span>
                  <span>{formatDate(importPreview.payload.exportedAt)}</span>
                </div>
                <div className="border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
                  {importPreview.fileName}
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
