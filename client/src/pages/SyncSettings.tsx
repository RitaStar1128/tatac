import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowLeft,
  Cable,
  ChevronDown,
  ChevronUp,
  CircleCheckBig,
  RadioTower,
  RefreshCw,
  Save,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSyncSessionSecret, setSyncSessionSecret } from "@/domains/sync/sessionSecretStore";
import { checkSyncNodeHealth, syncWithNode, type SyncRunResult } from "@/domains/sync/syncEngine";
import { getOrCreateSyncConfig, saveSyncSettingsDraft } from "@/domains/sync/syncSettingsStore";
import { useLanguage } from "@/contexts/LanguageContext";

interface SyncSettingsFormState {
  userId: string;
  deviceName: string;
  syncNodeUrl: string;
  salt: string;
  passphrase: string;
}

interface SavedSettingsSnapshot {
  userId: string;
  deviceName: string;
  syncNodeUrl: string;
  salt: string;
}

interface SyncConfigMetaState {
  deviceId: string;
  nodeId?: string;
  registeredAt?: string;
  lastSuccessfulSyncAt?: string | null;
}

interface SyncStatusMessage {
  tone: "success" | "warning";
  text: string;
}

function normalizeValue(value: string): string {
  return value.trim();
}

function areSettingsEqual(left: SavedSettingsSnapshot, right: SavedSettingsSnapshot): boolean {
  return (
    left.userId === right.userId &&
    left.deviceName === right.deviceName &&
    left.syncNodeUrl === right.syncNodeUrl &&
    left.salt === right.salt
  );
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
            title: "同期",
            subtitle: "下の3つを埋めれば同期できます。",
            back: "ホームに戻る",
            manual: "ファイル同期",
            setupTitle: "まず入れるもの",
            setupBody: "他の端末でも同じ user ID と passphrase を使ってください。",
            nodeUrl: "同期先 URL",
            nodeUrlHint: "家のPCやNASで動かしている sync-node の URL です。",
            nodeUrlExample: "例: http://192.168.0.10:4010",
            userId: "同期名",
            userIdSub: "User ID",
            userIdHint: "同じメモを共有したい端末どうしで同じ名前を使います。",
            userIdExample: "例: rita-home",
            passphrase: "合言葉",
            passphraseSub: "Passphrase",
            passphraseHint: "8文字以上。同じ端末どうしで同じ合言葉を使います。",
            passphraseExample: "例: blue-cat-2026",
            passphraseStorage: "この browser session にだけ保持されます。",
            passphraseReady: "session に保持中",
            passphraseMissing: "未入力",
            save: "設定を保存",
            health: "接続確認",
            syncNow: "今すぐ同期",
            needUserId: "同期名を入力してください。",
            needNodeUrl: "同期先 URL を入力してください。",
            needPassphrase: "8文字以上の合言葉を入力してください。",
            saveSuccess: "同期設定を保存しました。",
            saveFailed: "同期設定の保存に失敗しました。",
            healthOk: "同期先に接続できました。",
            healthFailed: "同期先に接続できませんでした。",
            syncOk: "同期が完了しました。",
            syncFailed: "同期に失敗しました。",
            advanced: "詳細設定",
            hideAdvanced: "詳細を閉じる",
            advancedHint: "通常は変更不要です。新しい同期グループを作る時だけ触ってください。",
            deviceName: "端末名",
            deviceNameHint: "他の端末と区別するための名前です。",
            salt: "Group Salt",
            saltHint: "違う同期グループを新しく作る時だけ変更します。",
            deviceId: "Device ID",
            nodeId: "Node ID",
            lastSync: "最終同期",
            never: "未実行",
            runSummary: "直近の同期結果",
            sent: "送信",
            received: "受信",
            applied: "反映",
            duplicates: "重複スキップ",
            cursor: "Cursor",
            healthSummary: "接続先",
          }
        : {
            title: "SYNC",
            subtitle: "Fill these three fields to start syncing.",
            back: "Back to home",
            manual: "File sync",
            setupTitle: "WHAT TO ENTER FIRST",
            setupBody: "Use the same user ID and passphrase on the other device.",
            nodeUrl: "Sync Node URL",
            nodeUrlHint: "The URL where your home sync-node is running.",
            nodeUrlExample: "Example: http://192.168.0.10:4010",
            userId: "Sync Name",
            userIdSub: "User ID",
            userIdHint: "Use the same value on every device that should share notes.",
            userIdExample: "Example: rita-home",
            passphrase: "Shared Secret",
            passphraseSub: "Passphrase",
            passphraseHint: "At least 8 characters. Use the same one on every synced device.",
            passphraseExample: "Example: blue-cat-2026",
            passphraseStorage: "Stored in this browser session only.",
            passphraseReady: "Stored in this session",
            passphraseMissing: "Not entered",
            save: "SAVE SETTINGS",
            health: "CHECK CONNECTION",
            syncNow: "SYNC NOW",
            needUserId: "Enter a sync name.",
            needNodeUrl: "Enter a sync node URL.",
            needPassphrase: "Enter a shared secret with at least 8 characters.",
            saveSuccess: "Sync settings saved.",
            saveFailed: "Failed to save sync settings.",
            healthOk: "Sync destination reachable.",
            healthFailed: "Failed to reach the sync destination.",
            syncOk: "Sync completed.",
            syncFailed: "Sync failed.",
            advanced: "ADVANCED",
            hideAdvanced: "HIDE ADVANCED",
            advancedHint: "You usually do not need these. Change them only when creating a different sync group.",
            deviceName: "Device Name",
            deviceNameHint: "Used only to identify this device.",
            salt: "Group Salt",
            saltHint: "Change this only if you want to start a completely different sync group.",
            deviceId: "Device ID",
            nodeId: "Node ID",
            lastSync: "Last Sync",
            never: "Never",
            runSummary: "LATEST RUN",
            sent: "Sent",
            received: "Received",
            applied: "Applied",
            duplicates: "Duplicates",
            cursor: "Cursor",
            healthSummary: "Connected to",
          },
    [language],
  );
}

export default function SyncSettingsPage() {
  const [, setLocation] = useLocation();
  const { language, formatDate } = useLanguage();
  const labels = useLabels(language);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [form, setForm] = useState<SyncSettingsFormState>({
    userId: "",
    deviceName: "",
    syncNodeUrl: "",
    salt: "",
    passphrase: "",
  });
  const [savedSettings, setSavedSettings] = useState<SavedSettingsSnapshot>({
    userId: "",
    deviceName: "",
    syncNodeUrl: "",
    salt: "",
  });
  const [configMeta, setConfigMeta] = useState<SyncConfigMetaState>({
    deviceId: "",
    nodeId: undefined,
    registeredAt: undefined,
    lastSuccessfulSyncAt: null,
  });
  const [statusMessage, setStatusMessage] = useState<SyncStatusMessage | null>(null);
  const [healthSummary, setHealthSummary] = useState<{ nodeId: string; serverTime: string } | null>(null);
  const [syncSummary, setSyncSummary] = useState<SyncRunResult | null>(null);

  const loadPageState = async () => {
    const config = await getOrCreateSyncConfig();
    const sessionPassphrase = getSyncSessionSecret()?.passphrase ?? "";
    const nextSavedSettings = {
      userId: config.userId,
      deviceName: config.deviceName,
      syncNodeUrl: config.syncNodeUrl ?? "",
      salt: config.salt,
    };

    setForm({
      ...nextSavedSettings,
      passphrase: sessionPassphrase,
    });
    setSavedSettings(nextSavedSettings);
    setConfigMeta({
      deviceId: config.deviceId,
      nodeId: config.nodeId,
      registeredAt: config.registeredAt,
      lastSuccessfulSyncAt: config.lastSuccessfulSyncAt ?? null,
    });
  };

  useEffect(() => {
    void loadPageState();
  }, []);

  const normalizedSettings = useMemo(
    () => ({
      userId: normalizeValue(form.userId),
      deviceName: normalizeValue(form.deviceName) || savedSettings.deviceName,
      syncNodeUrl: normalizeValue(form.syncNodeUrl),
      salt: normalizeValue(form.salt) || savedSettings.salt,
    }),
    [form.deviceName, form.salt, form.syncNodeUrl, form.userId, savedSettings.deviceName, savedSettings.salt],
  );

  const hasUnsavedSettings = useMemo(
    () => !areSettingsEqual(normalizedSettings, savedSettings),
    [normalizedSettings, savedSettings],
  );

  const passphraseReady = form.passphrase.trim().length >= 8;
  const saveBlockedReason = !normalizedSettings.userId ? labels.needUserId : null;
  const healthBlockedReason = !normalizedSettings.syncNodeUrl ? labels.needNodeUrl : null;
  const syncBlockedReason =
    !normalizedSettings.userId
      ? labels.needUserId
      : !normalizedSettings.syncNodeUrl
        ? labels.needNodeUrl
        : !passphraseReady
          ? labels.needPassphrase
          : null;

  const handleChange =
    (field: keyof SyncSettingsFormState) => (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setForm((current) => ({ ...current, [field]: value }));

      if (field === "passphrase") {
        setSyncSessionSecret({ passphrase: value });
        setStatusMessage({
          tone: value.trim().length >= 8 ? "success" : "warning",
          text: value.trim().length >= 8 ? labels.passphraseReady : labels.needPassphrase,
        });
        return;
      }

      setStatusMessage(null);
      setHealthSummary(null);
      setSyncSummary(null);
    };

  const handleSave = async ({ silent = false }: { silent?: boolean } = {}): Promise<boolean> => {
    if (saveBlockedReason) {
      setStatusMessage({
        tone: "warning",
        text: saveBlockedReason,
      });
      if (!silent) {
        toast.error(saveBlockedReason, { className: toastClassName("error") });
      }
      return false;
    }

    setIsSaving(true);
    try {
      const saved = await saveSyncSettingsDraft({
        userId: normalizedSettings.userId,
        deviceName: normalizedSettings.deviceName,
        syncNodeUrl: normalizedSettings.syncNodeUrl,
        salt: normalizedSettings.salt,
      });

      setSyncSessionSecret({ passphrase: form.passphrase });

      const nextSavedSettings = {
        userId: saved.userId,
        deviceName: saved.deviceName,
        syncNodeUrl: saved.syncNodeUrl ?? "",
        salt: saved.salt,
      };

      setSavedSettings(nextSavedSettings);
      setForm((current) => ({
        ...current,
        ...nextSavedSettings,
      }));
      setConfigMeta({
        deviceId: saved.deviceId,
        nodeId: saved.nodeId,
        registeredAt: saved.registeredAt,
        lastSuccessfulSyncAt: saved.lastSuccessfulSyncAt ?? null,
      });
      setStatusMessage({
        tone: "success",
        text: labels.saveSuccess,
      });

      if (!silent) {
        toast.success(labels.saveSuccess, { className: toastClassName() });
      }
      return true;
    } catch {
      setStatusMessage({
        tone: "warning",
        text: labels.saveFailed,
      });
      if (!silent) {
        toast.error(labels.saveFailed, { className: toastClassName("error") });
      }
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleHealthCheck = async () => {
    if (healthBlockedReason) {
      setStatusMessage({
        tone: "warning",
        text: healthBlockedReason,
      });
      toast.error(healthBlockedReason, { className: toastClassName("error") });
      return;
    }

    setIsCheckingHealth(true);
    try {
      const health = await checkSyncNodeHealth(normalizedSettings.syncNodeUrl);
      setHealthSummary(health);
      setStatusMessage({
        tone: "success",
        text: labels.healthOk,
      });
      toast.success(labels.healthOk, { className: toastClassName() });
    } catch (error) {
      const message = error instanceof Error ? error.message : labels.healthFailed;
      setHealthSummary(null);
      setStatusMessage({
        tone: "warning",
        text: message,
      });
      toast.error(message, { className: toastClassName("error") });
    } finally {
      setIsCheckingHealth(false);
    }
  };

  const handleSyncNow = async () => {
    if (syncBlockedReason) {
      setStatusMessage({
        tone: "warning",
        text: syncBlockedReason,
      });
      toast.error(syncBlockedReason, { className: toastClassName("error") });
      return;
    }

    if (hasUnsavedSettings) {
      const saved = await handleSave({ silent: true });
      if (!saved) return;
    }

    setIsSyncing(true);
    try {
      const result = await syncWithNode();
      setSyncSummary(result);
      setStatusMessage({
        tone: "success",
        text: labels.syncOk,
      });
      await loadPageState();
      toast.success(labels.syncOk, { className: toastClassName() });
    } catch (error) {
      const message = error instanceof Error ? error.message : labels.syncFailed;
      setStatusMessage({
        tone: "warning",
        text: message,
      });
      toast.error(message, { className: toastClassName("error") });
    } finally {
      setIsSyncing(false);
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
            onClick={() => setLocation("/manual-sync")}
            variant="outline"
            className="rounded-none border-2 border-foreground font-bold"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {labels.manual}
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-4 px-4 py-6">
        <section className="border-2 border-border bg-card p-5">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center border-2 border-foreground bg-foreground text-background">
              <RadioTower className="h-4 w-4" />
            </span>
            <div>
              <h2 className="font-black uppercase tracking-widest">{labels.setupTitle}</h2>
              <p className="text-sm text-muted-foreground">{labels.setupBody}</p>
            </div>
          </div>

          <div className="grid gap-4">
            <label className="block space-y-2">
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                {labels.nodeUrl}
              </span>
              <Input
                aria-label="sync-node-url"
                value={form.syncNodeUrl}
                onChange={handleChange("syncNodeUrl")}
                placeholder={labels.nodeUrlExample}
                className="rounded-none border-2 placeholder:text-muted-foreground/60"
              />
              <p className="text-xs text-muted-foreground">{labels.nodeUrlHint}</p>
            </label>

            <label className="block space-y-2">
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                {labels.userId}
                <span className="ml-2 text-[10px] font-medium tracking-[0.12em] text-muted-foreground/80">
                  {labels.userIdSub}
                </span>
              </span>
              <Input
                aria-label="sync-user-id"
                value={form.userId}
                onChange={handleChange("userId")}
                placeholder={labels.userIdExample}
                className="rounded-none border-2 placeholder:text-muted-foreground/60"
              />
              <p className="text-xs text-muted-foreground">{labels.userIdHint}</p>
            </label>

            <label className="block space-y-2">
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                {labels.passphrase}
                <span className="ml-2 text-[10px] font-medium tracking-[0.12em] text-muted-foreground/80">
                  {labels.passphraseSub}
                </span>
              </span>
              <Input
                aria-label="sync-passphrase"
                type="password"
                value={form.passphrase}
                onChange={handleChange("passphrase")}
                placeholder={labels.passphraseExample}
                className="rounded-none border-2 placeholder:text-muted-foreground/60"
              />
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">
                  {labels.passphraseHint} {labels.passphraseStorage}
                </span>
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
            </label>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <Button
              onClick={() => {
                void handleSave();
              }}
              disabled={isSaving || Boolean(saveBlockedReason)}
              variant="outline"
              className="h-12 rounded-none border-2 border-foreground font-black uppercase tracking-[0.2em]"
            >
              <Save className="mr-2 h-4 w-4" />
              {labels.save}
            </Button>

            <Button
              onClick={handleHealthCheck}
              disabled={isCheckingHealth || Boolean(healthBlockedReason)}
              variant="outline"
              className="h-12 rounded-none border-2 border-foreground font-black uppercase tracking-[0.2em]"
            >
              <Cable className="mr-2 h-4 w-4" />
              {labels.health}
            </Button>

            <Button
              onClick={handleSyncNow}
              disabled={isSyncing || Boolean(syncBlockedReason)}
              className="h-12 rounded-none border-2 border-foreground bg-foreground font-black uppercase tracking-[0.2em] text-background hover:bg-foreground/90"
            >
              <Activity className="mr-2 h-4 w-4" />
              {labels.syncNow}
            </Button>
          </div>
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
              <p className="mt-1 text-sm text-muted-foreground">{labels.advancedHint}</p>
            </div>
            {showAdvanced ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </button>

          {showAdvanced && (
            <div className="mt-5 space-y-5 border-t border-border pt-5">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block space-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    {labels.deviceName}
                  </span>
                  <Input
                    aria-label="sync-device-name"
                    value={form.deviceName}
                    onChange={handleChange("deviceName")}
                    placeholder={form.deviceName || "Rita iPhone"}
                    className="rounded-none border-2 placeholder:text-muted-foreground/60"
                  />
                  <p className="text-xs text-muted-foreground">{labels.deviceNameHint}</p>
                </label>

                <label className="block space-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    {labels.salt}
                  </span>
                  <Input
                    aria-label="sync-salt"
                    value={form.salt}
                    onChange={handleChange("salt")}
                    placeholder={form.salt}
                    className="rounded-none border-2 font-mono text-xs placeholder:text-muted-foreground/60"
                  />
                  <p className="text-xs text-muted-foreground">{labels.saltHint}</p>
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="border border-border px-3 py-3">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    {labels.deviceId}
                  </div>
                  <div className="mt-2 font-mono text-sm">{configMeta.deviceId || "..."}</div>
                </div>
                <div className="border border-border px-3 py-3">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    {labels.nodeId}
                  </div>
                  <div className="mt-2 font-mono text-sm">{configMeta.nodeId ?? "..."}</div>
                </div>
                <div className="border border-border px-3 py-3">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    {labels.lastSync}
                  </div>
                  <div className="mt-2 text-sm">
                    {configMeta.lastSuccessfulSyncAt
                      ? formatDate(configMeta.lastSuccessfulSyncAt)
                      : labels.never}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {(statusMessage || healthSummary || syncSummary) && (
          <section className="border-2 border-border bg-card p-5">
            {statusMessage && (
              <div
                className={`flex items-start gap-3 border px-4 py-3 ${
                  statusMessage.tone === "success"
                    ? "border-foreground/30 bg-muted/20"
                    : "border-destructive/40 bg-destructive/5"
                }`}
              >
                {statusMessage.tone === "success" ? (
                  <CircleCheckBig className="mt-0.5 h-4 w-4" />
                ) : (
                  <TriangleAlert className="mt-0.5 h-4 w-4 text-destructive" />
                )}
                <p className="text-sm">{statusMessage.text}</p>
              </div>
            )}

            {healthSummary && (
              <div className="mt-4 border border-border px-4 py-3 text-sm">
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  {labels.healthSummary}
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="font-mono">{healthSummary.nodeId}</span>
                  <span>{formatDate(healthSummary.serverTime)}</span>
                </div>
              </div>
            )}

            {syncSummary && (
              <div className="mt-4">
                <div className="mb-3 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" />
                  <h2 className="font-black uppercase tracking-widest">{labels.runSummary}</h2>
                </div>
                <div className="grid gap-3 md:grid-cols-5">
                  <div className="border border-border px-3 py-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{labels.sent}</div>
                    <div className="mt-2 font-mono text-lg font-black">{syncSummary.pushed}</div>
                  </div>
                  <div className="border border-border px-3 py-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{labels.received}</div>
                    <div className="mt-2 font-mono text-lg font-black">{syncSummary.pulled}</div>
                  </div>
                  <div className="border border-border px-3 py-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{labels.applied}</div>
                    <div className="mt-2 font-mono text-lg font-black">{syncSummary.applied}</div>
                  </div>
                  <div className="border border-border px-3 py-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{labels.duplicates}</div>
                    <div className="mt-2 font-mono text-lg font-black">{syncSummary.duplicates}</div>
                  </div>
                  <div className="border border-border px-3 py-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{labels.cursor}</div>
                    <div className="mt-2 font-mono text-lg font-black">{syncSummary.cursor}</div>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
