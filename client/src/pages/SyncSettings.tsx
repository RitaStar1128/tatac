import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowLeft,
  Cable,
  ChevronDown,
  ChevronUp,
  MonitorUp,
  QrCode,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

import { SyncPairingQrModal } from "@/components/SyncPairingQrModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getPersistedSyncSecret, savePersistedSyncSecret } from "@/domains/sync/persistedSyncSecretStore";
import { setSyncSessionSecret } from "@/domains/sync/sessionSecretStore";
import { checkSyncNodeHealth, syncWithNode, type SyncRunResult } from "@/domains/sync/syncEngine";
import {
  createPairingSessionForMobile,
  enableSyncOnThisDevice,
  getDefaultBootstrapUrl,
} from "@/domains/sync/syncPairing";
import { getOrCreateSyncConfig, saveSyncSettingsDraft } from "@/domains/sync/syncSettingsStore";
import { useLanguage } from "@/contexts/LanguageContext";

interface AdvancedFormState {
  userId: string;
  deviceName: string;
  syncNodeUrl: string;
  salt: string;
  passphrase: string;
}

interface SyncPageState {
  deviceId: string;
  deviceName: string;
  userId: string;
  syncNodeUrl: string;
  salt: string;
  nodeId?: string;
  lastSuccessfulSyncAt?: string | null;
  hasPersistedSecret: boolean;
}

interface StatusMessage {
  tone: "success" | "warning";
  text: string;
}

function toastClassName(kind: "default" | "error" = "default"): string {
  return kind === "error"
    ? "font-bold uppercase tracking-widest border-2 border-destructive bg-background text-destructive rounded-none shadow-none"
    : "font-bold uppercase tracking-widest border-2 border-foreground bg-background text-foreground rounded-none shadow-none";
}

function normalizeValue(value: string): string {
  return value.trim();
}

function getFriendlySyncError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Sync failed.";
  if (message.includes("Failed to fetch")) {
    return "同期ノードに接続できません。同じWi-Fiか、URLを確認してください。";
  }
  return message;
}

function useLabels(language: "ja" | "en") {
  return useMemo(
    () =>
      language === "ja"
        ? {
            title: "同期",
            subtitle: "このPCで有効化して、スマホはQRで追加します。",
            back: "ホームへ戻る",
            manual: "手動ファイル同期",
            enableTitle: "まずはこのPCで同期を有効化",
            enableBody: "PC側で一度だけ設定すると、スマホはQRを読むだけで同期に参加できます。",
            enableAction: "このPCで同期を有効化",
            enableRetry: "このURLで有効化",
            enableHint: "通常はそのままで大丈夫です。PCで sync-node が動いていれば自動で見つけます。",
            customUrlLabel: "カスタム URL",
            customUrlHint: "自動で見つからない時だけ入力してください。",
            customUrlPlaceholder: "例: http://192.168.0.10:4010",
            enabledTitle: "このPCは同期準備済みです",
            enabledBody: "次はスマホを追加するだけです。",
            addPhone: "スマホを追加",
            checkConnection: "接続確認",
            syncNow: "今すぐ同期",
            advanced: "詳細設定",
            hideAdvanced: "詳細設定を閉じる",
            advancedBody: "通常は不要です。既存の同期グループへ手動参加したい時だけ使います。",
            syncNodeUrl: "同期ノード URL",
            syncUserId: "同期グループ ID",
            syncPassphrase: "合言葉",
            deviceName: "端末名",
            groupSalt: "グループ Salt",
            passphraseHint: "8文字以上。既存グループに合わせる時だけ入力します。",
            saveAdvanced: "詳細設定を保存",
            enableFailed: "PC上の既定URLで sync-node に接続できませんでした。必要なら URL を入力してください。",
            enableSuccess: "このPCで同期を有効化しました。",
            pairingSuccess: "スマホ追加用のQRを作成しました。",
            healthSuccess: "同期ノードに接続できました。",
            syncSuccess: "同期が完了しました。",
            saveSuccess: "詳細設定を保存しました。",
            needPassphrase: "合言葉を8文字以上で入力してください。",
            needNodeUrl: "同期ノード URL を入力してください。",
            latestRun: "最新の同期結果",
            pushed: "送信",
            pulled: "受信",
            applied: "反映",
            lastSync: "最終同期",
            notYet: "まだありません",
            pairedState: "この端末に同期秘密を保存済み",
            manualState: "この端末で再入力が必要です",
          }
        : {
            title: "SYNC",
            subtitle: "Enable on this PC, then add the phone with one QR scan.",
            back: "Back to home",
            manual: "Manual file sync",
            enableTitle: "Start on this PC",
            enableBody: "Set up sync here once. Phones can join by scanning one QR code.",
            enableAction: "ENABLE SYNC ON THIS PC",
            enableRetry: "ENABLE WITH THIS URL",
            enableHint: "You usually do not need to type anything. TATAC tries the local sync-node first.",
            customUrlLabel: "Custom URL",
            customUrlHint: "Only use this if automatic bootstrap does not work.",
            customUrlPlaceholder: "Example: http://192.168.0.10:4010",
            enabledTitle: "This PC is ready to sync",
            enabledBody: "The next step is adding the phone.",
            addPhone: "ADD PHONE",
            checkConnection: "CHECK CONNECTION",
            syncNow: "SYNC NOW",
            advanced: "ADVANCED",
            hideAdvanced: "HIDE ADVANCED",
            advancedBody: "Usually unnecessary. Use this only when manually joining an existing sync group.",
            syncNodeUrl: "Sync Node URL",
            syncUserId: "Sync Group ID",
            syncPassphrase: "Passphrase",
            deviceName: "Device Name",
            groupSalt: "Group Salt",
            passphraseHint: "At least 8 characters. Only needed for manual group setup.",
            saveAdvanced: "SAVE ADVANCED SETTINGS",
            enableFailed: "Could not reach sync-node at the default PC URL. Enter a URL if needed.",
            enableSuccess: "Sync is enabled on this PC.",
            pairingSuccess: "QR code ready for the phone.",
            healthSuccess: "Sync node is reachable.",
            syncSuccess: "Sync completed.",
            saveSuccess: "Advanced sync settings saved.",
            needPassphrase: "Enter a passphrase with at least 8 characters.",
            needNodeUrl: "Enter a sync node URL.",
            latestRun: "LATEST RUN",
            pushed: "Sent",
            pulled: "Received",
            applied: "Applied",
            lastSync: "Last Sync",
            notYet: "Not yet",
            pairedState: "Sync secret is stored on this device",
            manualState: "This device still needs a secret",
          },
    [language],
  );
}

export default function SyncSettingsPage() {
  const [, setLocation] = useLocation();
  const { language, formatDate } = useLanguage();
  const labels = useLabels(language);
  const [isBusy, setIsBusy] = useState<"enable" | "pair" | "health" | "sync" | "save" | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showCustomUrl, setShowCustomUrl] = useState(false);
  const [customUrl, setCustomUrl] = useState(getDefaultBootstrapUrl());
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [pageState, setPageState] = useState<SyncPageState | null>(null);
  const [form, setForm] = useState<AdvancedFormState>({
    userId: "",
    deviceName: "",
    syncNodeUrl: "",
    salt: "",
    passphrase: "",
  });
  const [healthSummary, setHealthSummary] = useState<{ nodeId: string; serverTime: string } | null>(null);
  const [syncSummary, setSyncSummary] = useState<SyncRunResult | null>(null);
  const [pairingModal, setPairingModal] = useState<{ open: boolean; url: string; expiresAt: string }>({
    open: false,
    url: "",
    expiresAt: "",
  });

  const syncEnabled = Boolean(pageState?.syncNodeUrl && pageState?.hasPersistedSecret);

  const loadState = async () => {
    const [config, persistedSecret] = await Promise.all([getOrCreateSyncConfig(), getPersistedSyncSecret()]);
    setPageState({
      deviceId: config.deviceId,
      deviceName: config.deviceName,
      userId: config.userId,
      syncNodeUrl: config.syncNodeUrl ?? "",
      salt: config.salt,
      nodeId: config.nodeId,
      lastSuccessfulSyncAt: config.lastSuccessfulSyncAt ?? null,
      hasPersistedSecret: Boolean(persistedSecret?.groupSecret),
    });
    setForm({
      userId: config.userId,
      deviceName: config.deviceName,
      syncNodeUrl: config.syncNodeUrl ?? "",
      salt: config.salt,
      passphrase: persistedSecret?.groupSecret ?? "",
    });
    if (config.syncNodeUrl) {
      setCustomUrl(config.syncNodeUrl);
    }
  };

  useEffect(() => {
    void loadState();
  }, []);

  const handleEnable = async () => {
    setIsBusy("enable");
    setHealthSummary(null);
    setSyncSummary(null);
    try {
      await enableSyncOnThisDevice({
        preferredBootstrapUrl: showCustomUrl ? customUrl : undefined,
      });
      await loadState();
      setShowCustomUrl(false);
      setStatus({ tone: "success", text: labels.enableSuccess });
      toast.success(labels.enableSuccess, { className: toastClassName() });
    } catch (error) {
      const message = getFriendlySyncError(error);
      setShowCustomUrl(true);
      setStatus({
        tone: "warning",
        text: showCustomUrl ? message : labels.enableFailed,
      });
      toast.error(showCustomUrl ? message : labels.enableFailed, { className: toastClassName("error") });
    } finally {
      setIsBusy(null);
    }
  };

  const handleCreatePairing = async () => {
    setIsBusy("pair");
    try {
      const result = await createPairingSessionForMobile();
      setPairingModal({
        open: true,
        url: result.pairingUrl,
        expiresAt: result.expiresAt,
      });
      setStatus({ tone: "success", text: labels.pairingSuccess });
      toast.success(labels.pairingSuccess, { className: toastClassName() });
    } catch (error) {
      const message = getFriendlySyncError(error);
      setStatus({ tone: "warning", text: message });
      toast.error(message, { className: toastClassName("error") });
    } finally {
      setIsBusy(null);
    }
  };

  const handleHealth = async () => {
    const targetUrl = normalizeValue(form.syncNodeUrl || pageState?.syncNodeUrl || "");
    if (!targetUrl) {
      setStatus({ tone: "warning", text: labels.needNodeUrl });
      toast.error(labels.needNodeUrl, { className: toastClassName("error") });
      return;
    }

    setIsBusy("health");
    try {
      const summary = await checkSyncNodeHealth(targetUrl);
      setHealthSummary(summary);
      setStatus({ tone: "success", text: labels.healthSuccess });
      toast.success(labels.healthSuccess, { className: toastClassName() });
    } catch (error) {
      const message = getFriendlySyncError(error);
      setHealthSummary(null);
      setStatus({ tone: "warning", text: message });
      toast.error(message, { className: toastClassName("error") });
    } finally {
      setIsBusy(null);
    }
  };

  const handleSync = async () => {
    setIsBusy("sync");
    try {
      const result = await syncWithNode();
      setSyncSummary(result);
      await loadState();
      setStatus({ tone: "success", text: labels.syncSuccess });
      toast.success(labels.syncSuccess, { className: toastClassName() });
    } catch (error) {
      const message = getFriendlySyncError(error);
      setStatus({ tone: "warning", text: message });
      toast.error(message, { className: toastClassName("error") });
    } finally {
      setIsBusy(null);
    }
  };

  const handleSaveAdvanced = async () => {
    const normalizedPassphrase = normalizeValue(form.passphrase);
    const normalizedSyncNodeUrl = normalizeValue(form.syncNodeUrl);
    const normalizedUserId = normalizeValue(form.userId || pageState?.userId || "");
    const normalizedDeviceName = normalizeValue(form.deviceName || pageState?.deviceName || "");
    const normalizedSalt = normalizeValue(form.salt || pageState?.salt || "");

    if (!normalizedSyncNodeUrl) {
      setStatus({ tone: "warning", text: labels.needNodeUrl });
      toast.error(labels.needNodeUrl, { className: toastClassName("error") });
      return;
    }

    if (normalizedPassphrase.length < 8) {
      setStatus({ tone: "warning", text: labels.needPassphrase });
      toast.error(labels.needPassphrase, { className: toastClassName("error") });
      return;
    }

    setIsBusy("save");
    try {
      await saveSyncSettingsDraft({
        userId: normalizedUserId,
        deviceName: normalizedDeviceName,
        syncNodeUrl: normalizedSyncNodeUrl,
        salt: normalizedSalt,
      });
      await savePersistedSyncSecret({
        groupSecret: normalizedPassphrase,
        origin: "manual",
      });
      setSyncSessionSecret({ passphrase: normalizedPassphrase });
      await loadState();
      setStatus({ tone: "success", text: labels.saveSuccess });
      toast.success(labels.saveSuccess, { className: toastClassName() });
    } catch (error) {
      const message = getFriendlySyncError(error);
      setStatus({ tone: "warning", text: message });
      toast.error(message, { className: toastClassName("error") });
    } finally {
      setIsBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b-2 border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/")}
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

          <Button
            type="button"
            variant="outline"
            onClick={() => setLocation("/manual-sync")}
            className="rounded-none border-2 border-foreground font-bold"
          >
            {labels.manual}
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-4 px-4 py-6">
        <section className="border-2 border-border bg-card p-5">
          {!syncEnabled ? (
            <div className="space-y-5">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 items-center justify-center border-2 border-foreground bg-foreground text-background">
                  <MonitorUp className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-black uppercase tracking-widest">{labels.enableTitle}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{labels.enableBody}</p>
                </div>
              </div>

              <div className="border border-border bg-muted/20 px-4 py-4 text-sm text-muted-foreground">
                {labels.enableHint}
              </div>

              {showCustomUrl && (
                <label className="block space-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    {labels.customUrlLabel}
                  </span>
                  <Input
                    aria-label="sync-node-url"
                    value={customUrl}
                    onChange={(event) => setCustomUrl(event.target.value)}
                    placeholder={labels.customUrlPlaceholder}
                    className="rounded-none border-2"
                  />
                  <p className="text-xs text-muted-foreground">{labels.customUrlHint}</p>
                </label>
              )}

              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  onClick={handleEnable}
                  disabled={isBusy === "enable"}
                  className="h-12 rounded-none border-2 border-foreground bg-foreground font-black uppercase tracking-[0.2em] text-background hover:bg-foreground/90"
                >
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  {showCustomUrl ? labels.enableRetry : labels.enableAction}
                </Button>

                {!showCustomUrl && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowCustomUrl(true)}
                    className="h-12 rounded-none border-2 border-foreground font-bold uppercase tracking-[0.18em]"
                  >
                    {labels.customUrlLabel}
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 items-center justify-center border-2 border-foreground bg-foreground text-background">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-black uppercase tracking-widest">{labels.enabledTitle}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{labels.enabledBody}</p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="border border-border px-3 py-3">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Node URL</div>
                  <div className="mt-2 break-all font-mono text-xs">{pageState?.syncNodeUrl}</div>
                </div>
                <div className="border border-border px-3 py-3">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Device</div>
                  <div className="mt-2 text-sm">{pageState?.deviceName}</div>
                </div>
                <div className="border border-border px-3 py-3">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{labels.lastSync}</div>
                  <div className="mt-2 text-sm">
                    {pageState?.lastSuccessfulSyncAt
                      ? formatDate(pageState.lastSuccessfulSyncAt)
                      : labels.notYet}
                  </div>
                </div>
              </div>

              <div className="border border-border bg-muted/20 px-4 py-3 text-sm">
                {pageState?.hasPersistedSecret ? labels.pairedState : labels.manualState}
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <Button
                  type="button"
                  onClick={handleCreatePairing}
                  disabled={isBusy === "pair"}
                  className="h-12 rounded-none border-2 border-foreground bg-foreground font-black uppercase tracking-[0.2em] text-background hover:bg-foreground/90"
                >
                  <QrCode className="mr-2 h-4 w-4" />
                  {labels.addPhone}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleHealth}
                  disabled={isBusy === "health"}
                  className="h-12 rounded-none border-2 border-foreground font-black uppercase tracking-[0.2em]"
                >
                  <Cable className="mr-2 h-4 w-4" />
                  {labels.checkConnection}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSync}
                  disabled={isBusy === "sync"}
                  className="h-12 rounded-none border-2 border-foreground font-black uppercase tracking-[0.2em]"
                >
                  <Activity className="mr-2 h-4 w-4" />
                  {labels.syncNow}
                </Button>
              </div>
            </div>
          )}
        </section>

        <section className="border-2 border-border bg-card p-5">
          <button
            type="button"
            onClick={() => setShowAdvanced((current) => !current)}
            className="flex w-full items-center justify-between gap-3 text-left"
          >
            <div>
              <h2 className="font-black uppercase tracking-widest">
                {showAdvanced ? labels.hideAdvanced : labels.advanced}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{labels.advancedBody}</p>
            </div>
            {showAdvanced ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </button>

          {showAdvanced && (
            <div className="mt-5 space-y-4 border-t border-border pt-5">
              <label className="block space-y-2">
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  {labels.syncNodeUrl}
                </span>
                <Input
                  aria-label="sync-node-url"
                  value={form.syncNodeUrl}
                  onChange={(event) => setForm((current) => ({ ...current, syncNodeUrl: event.target.value }))}
                  placeholder={labels.customUrlPlaceholder}
                  className="rounded-none border-2"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block space-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    {labels.syncUserId}
                  </span>
                  <Input
                    aria-label="sync-user-id"
                    value={form.userId}
                    onChange={(event) => setForm((current) => ({ ...current, userId: event.target.value }))}
                    className="rounded-none border-2"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    {labels.syncPassphrase}
                  </span>
                  <Input
                    aria-label="sync-passphrase"
                    type="password"
                    value={form.passphrase}
                    onChange={(event) => setForm((current) => ({ ...current, passphrase: event.target.value }))}
                    placeholder="********"
                    className="rounded-none border-2"
                  />
                  <p className="text-xs text-muted-foreground">{labels.passphraseHint}</p>
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block space-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    {labels.deviceName}
                  </span>
                  <Input
                    aria-label="sync-device-name"
                    value={form.deviceName}
                    onChange={(event) => setForm((current) => ({ ...current, deviceName: event.target.value }))}
                    className="rounded-none border-2"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    {labels.groupSalt}
                  </span>
                  <Input
                    aria-label="sync-salt"
                    value={form.salt}
                    onChange={(event) => setForm((current) => ({ ...current, salt: event.target.value }))}
                    className="rounded-none border-2 font-mono text-xs"
                  />
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <div className="border border-border px-3 py-3">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Device ID</div>
                  <div className="mt-2 font-mono text-sm">{pageState?.deviceId ?? "..."}</div>
                </div>
                <Button
                  type="button"
                  onClick={handleSaveAdvanced}
                  disabled={isBusy === "save"}
                  variant="outline"
                  className="h-12 self-end rounded-none border-2 border-foreground font-black uppercase tracking-[0.2em]"
                >
                  {labels.saveAdvanced}
                </Button>
              </div>
            </div>
          )}
        </section>

        {(status || healthSummary || syncSummary) && (
          <section className="space-y-4">
            {status && (
              <div
                className={`border-2 px-4 py-4 ${
                  status.tone === "success"
                    ? "border-border bg-card"
                    : "border-destructive/40 bg-destructive/5"
                }`}
              >
                <div className="flex items-start gap-3">
                  {status.tone === "success" ? (
                    <ShieldCheck className="mt-0.5 h-4 w-4" />
                  ) : (
                    <TriangleAlert className="mt-0.5 h-4 w-4 text-destructive" />
                  )}
                  <p className="text-sm">{status.text}</p>
                </div>
              </div>
            )}

            {healthSummary && (
              <div className="border-2 border-border bg-card px-4 py-4 text-sm">
                <div className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Health</div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="font-mono">{healthSummary.nodeId}</span>
                  <span>{formatDate(healthSummary.serverTime)}</span>
                </div>
              </div>
            )}

            {syncSummary && (
              <div className="border-2 border-border bg-card p-5">
                <div className="mb-3 font-black uppercase tracking-widest">{labels.latestRun}</div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="border border-border px-3 py-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{labels.pushed}</div>
                    <div className="mt-2 font-mono text-lg font-black">{syncSummary.pushed}</div>
                  </div>
                  <div className="border border-border px-3 py-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{labels.pulled}</div>
                    <div className="mt-2 font-mono text-lg font-black">{syncSummary.pulled}</div>
                  </div>
                  <div className="border border-border px-3 py-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{labels.applied}</div>
                    <div className="mt-2 font-mono text-lg font-black">{syncSummary.applied}</div>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      <SyncPairingQrModal
        open={pairingModal.open}
        onOpenChange={(open) => setPairingModal((current) => ({ ...current, open }))}
        pairingUrl={pairingModal.url}
        expiresAt={pairingModal.expiresAt}
      />
    </div>
  );
}
