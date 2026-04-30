import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Cable,
  CheckCircle2,
  KeyRound,
  RadioTower,
  RefreshCw,
  Save,
  Server,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getNotesSnapshot } from "@/domains/notes/noteRepository";
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

interface SyncStatsState {
  activeNotes: number;
  tombstoneCount: number;
  opCount: number;
}

interface SyncConfigMetaState {
  deviceId: string;
  nodeId?: string;
  registeredAt?: string;
  lastSuccessfulSyncAt?: string | null;
}

interface SyncStatusMessage {
  tone: "neutral" | "success" | "warning";
  text: string;
}

function normalizeValue(value: string): string {
  return value.trim();
}

function toSavedSnapshot(input: Omit<SyncSettingsFormState, "passphrase">): SavedSettingsSnapshot {
  return {
    userId: normalizeValue(input.userId),
    deviceName: normalizeValue(input.deviceName),
    syncNodeUrl: normalizeValue(input.syncNodeUrl),
    salt: normalizeValue(input.salt),
  };
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
            title: "同期設定",
            subtitle: "この端末を正本のまま保ちつつ、手動同期でノード連携を行います。",
            back: "ホームに戻る",
            manual: "手動同期を開く",
            stepGuide: "使い方",
            stepOne: "1. グループ設定を保存",
            stepTwo: "2. ノード接続を確認",
            stepThree: "3. 手動で同期を実行",
            stepBodyOne: "同じ userId / passphrase / salt を使う端末だけが同じ同期グループになります。",
            stepBodyTwo: "sync-node は暗号化された差分だけを受け渡しします。",
            stepBodyThree: "フォーム未保存のまま同期は走りません。見えている設定と実行設定を一致させます。",
            group: "同期グループ",
            groupBody: "他端末と合わせる値です。passphrase はこのブラウザの session のみに保持します。",
            device: "この端末",
            deviceBody: "メモ本体はこの端末の IndexedDB に残り、ノード停止時も失われません。",
            node: "同期ノード",
            nodeBody: "ここで登録と差分交換を行います。平文メモは送りません。",
            run: "同期を実行",
            runBody: "保存済み設定と現在の session passphrase を使って push / pull を行います。",
            userId: "User ID",
            deviceName: "端末名",
            deviceId: "Device ID",
            syncNodeUrl: "Sync Node URL",
            salt: "Group Salt",
            passphrase: "Passphrase",
            passphraseHint: "passphrase は sessionStorage のみに保持します。ブラウザを閉じると消えます。",
            passphraseReady: "この session で利用可能",
            passphraseMissing: "この browser session では未設定",
            save: "設定を保存",
            saveHint: "同期前に、今見えている設定を保存してください。",
            saveSuccess: "同期設定を保存しました。",
            saveFailed: "同期設定の保存に失敗しました。",
            unsavedTitle: "未保存の変更があります",
            unsavedBody: "同期実行値と画面表示を一致させるため、保存するまで同期ボタンは無効です。",
            savedTitle: "保存済み設定を使用中",
            savedBody: "このまま接続確認と同期を実行できます。",
            statusTitle: "実行状態",
            localState: "ローカル状態",
            notes: "アクティブメモ",
            tombstones: "Tombstone",
            ops: "Oplog",
            registerInfo: "ノード登録",
            nodeId: "Node ID",
            registeredAt: "Registered",
            lastSync: "最終同期",
            never: "未実行",
            health: "接続確認",
            healthIdle: "URL を入力すると接続確認できます。",
            healthReady: "現在入力中の URL で接続確認します。",
            healthOk: "同期ノードに接続できました。",
            healthFailed: "同期ノードに接続できませんでした。",
            syncNow: "今すぐ同期",
            syncOk: "同期が完了しました。",
            syncFailed: "同期に失敗しました。",
            saveBeforeSync: "同期前に設定を保存してください。",
            needUserId: "User ID を入力してください。",
            needDeviceName: "端末名を入力してください。",
            needSalt: "Group Salt を入力してください。",
            needNodeUrl: "Sync Node URL を入力してください。",
            needPassphrase: "8文字以上の passphrase を入力してください。",
            ready: "同期可能",
            blocked: "まだ同期できません",
            currentRun: "今回の同期結果",
            sent: "送信",
            received: "受信",
            applied: "反映",
            duplicates: "重複スキップ",
            cursor: "Cursor",
            summaryIdle: "まだ同期を実行していません。",
            summaryNoChanges: "新しい差分はありませんでした。",
            summarySent: "{count} 件のローカル差分を送信しました。",
            summaryReceived: "{count} 件の差分を受信しました。",
            summaryApplied: "{count} 件をこの端末に反映しました。",
            summaryDuplicates: "{count} 件は既に取り込み済みでした。",
          }
        : {
            title: "SYNC SETTINGS",
            subtitle: "Keep this device authoritative and run node sync manually when you need it.",
            back: "Back to home",
            manual: "Open manual sync",
            stepGuide: "HOW IT WORKS",
            stepOne: "1. Save the group settings",
            stepTwo: "2. Check the node connection",
            stepThree: "3. Run sync manually",
            stepBodyOne: "Only devices with the same userId, passphrase, and salt join the same sync group.",
            stepBodyTwo: "The sync node relays encrypted deltas only.",
            stepBodyThree: "Sync does not run with unsaved form changes. What you see is what gets used.",
            group: "SYNC GROUP",
            groupBody: "These values must match across devices. The passphrase stays in this browser session only.",
            device: "THIS DEVICE",
            deviceBody: "Your notes remain in IndexedDB on this device even if the node is down.",
            node: "SYNC NODE",
            nodeBody: "This is the relay for registration and delta exchange. Plaintext notes are not sent.",
            run: "RUN SYNC",
            runBody: "Push and pull use the saved settings plus the current session passphrase.",
            userId: "User ID",
            deviceName: "Device Name",
            deviceId: "Device ID",
            syncNodeUrl: "Sync Node URL",
            salt: "Group Salt",
            passphrase: "Passphrase",
            passphraseHint: "The passphrase is stored in sessionStorage only and clears when this browser session ends.",
            passphraseReady: "Ready in this session",
            passphraseMissing: "Not set in this browser session",
            save: "SAVE SETTINGS",
            saveHint: "Save the visible settings before running sync.",
            saveSuccess: "Sync settings saved.",
            saveFailed: "Failed to save sync settings.",
            unsavedTitle: "Unsaved changes",
            unsavedBody: "Sync stays disabled until you save, so the visible form and the actual run config stay aligned.",
            savedTitle: "Saved settings are in use",
            savedBody: "You can run health check and sync with the current saved config.",
            statusTitle: "READINESS",
            localState: "LOCAL STATE",
            notes: "Active Notes",
            tombstones: "Tombstones",
            ops: "Oplog",
            registerInfo: "NODE REGISTRATION",
            nodeId: "Node ID",
            registeredAt: "Registered",
            lastSync: "Last Sync",
            never: "Never",
            health: "CHECK CONNECTION",
            healthIdle: "Enter a node URL to test connectivity.",
            healthReady: "Health check uses the URL currently shown in the form.",
            healthOk: "Sync node reachable.",
            healthFailed: "Failed to reach the sync node.",
            syncNow: "SYNC NOW",
            syncOk: "Sync completed.",
            syncFailed: "Sync failed.",
            saveBeforeSync: "Save the settings before syncing.",
            needUserId: "Enter a user ID.",
            needDeviceName: "Enter a device name.",
            needSalt: "Enter a group salt.",
            needNodeUrl: "Enter a sync node URL.",
            needPassphrase: "Enter a passphrase with at least 8 characters.",
            ready: "Ready to sync",
            blocked: "Sync blocked",
            currentRun: "LATEST RUN",
            sent: "Sent",
            received: "Received",
            applied: "Applied",
            duplicates: "Duplicates",
            cursor: "Cursor",
            summaryIdle: "You have not run sync yet.",
            summaryNoChanges: "No new changes were exchanged.",
            summarySent: "Sent {count} local changes.",
            summaryReceived: "Received {count} changes.",
            summaryApplied: "Applied {count} changes on this device.",
            summaryDuplicates: "{count} items were already present.",
          },
    [language],
  );
}

function replaceCount(template: string, count: number): string {
  return template.replace("{count}", String(count));
}

export default function SyncSettingsPage() {
  const [, setLocation] = useLocation();
  const { language, formatDate } = useLanguage();
  const labels = useLabels(language);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
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
  const [stats, setStats] = useState<SyncStatsState>({
    activeNotes: 0,
    tombstoneCount: 0,
    opCount: 0,
  });
  const [statusMessage, setStatusMessage] = useState<SyncStatusMessage | null>(null);
  const [healthSummary, setHealthSummary] = useState<{ nodeId: string; serverTime: string } | null>(null);
  const [syncSummary, setSyncSummary] = useState<SyncRunResult | null>(null);

  const loadPageState = async () => {
    const [config, snapshot] = await Promise.all([getOrCreateSyncConfig(), getNotesSnapshot()]);
    const sessionPassphrase = getSyncSessionSecret()?.passphrase ?? "";
    const nextSavedSettings = toSavedSnapshot({
      userId: config.userId,
      deviceName: config.deviceName,
      syncNodeUrl: config.syncNodeUrl ?? "",
      salt: config.salt,
    });

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
    setStats({
      activeNotes: snapshot.activeNotes.length,
      tombstoneCount: snapshot.tombstoneCount,
      opCount: snapshot.opCount,
    });
  };

  useEffect(() => {
    void loadPageState();
  }, []);

  const normalizedSettings = useMemo(
    () =>
      toSavedSnapshot({
        userId: form.userId,
        deviceName: form.deviceName,
        syncNodeUrl: form.syncNodeUrl,
        salt: form.salt,
      }),
    [form.deviceName, form.salt, form.syncNodeUrl, form.userId],
  );

  const hasUnsavedSettings = useMemo(
    () => !areSettingsEqual(normalizedSettings, savedSettings),
    [normalizedSettings, savedSettings],
  );

  const passphraseReady = form.passphrase.trim().length >= 8;
  const saveBlockedReason =
    !normalizedSettings.userId
      ? labels.needUserId
      : !normalizedSettings.deviceName
        ? labels.needDeviceName
        : !normalizedSettings.salt
          ? labels.needSalt
          : null;
  const healthBlockedReason = !normalizedSettings.syncNodeUrl ? labels.needNodeUrl : null;
  const syncBlockedReason =
    hasUnsavedSettings
      ? labels.saveBeforeSync
      : saveBlockedReason ??
        (!normalizedSettings.syncNodeUrl
          ? labels.needNodeUrl
          : !passphraseReady
            ? labels.needPassphrase
            : null);

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
      setSyncSummary(null);
      if (field === "syncNodeUrl") {
        setHealthSummary(null);
      }
    };

  const handleSave = async ({ silent = false }: { silent?: boolean } = {}): Promise<boolean> => {
    if (saveBlockedReason) {
      if (!silent) {
        toast.error(saveBlockedReason, { className: toastClassName("error") });
      }
      setStatusMessage({
        tone: "warning",
        text: saveBlockedReason,
      });
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

      const nextSavedSettings = toSavedSnapshot({
        userId: saved.userId,
        deviceName: saved.deviceName,
        syncNodeUrl: saved.syncNodeUrl ?? "",
        salt: saved.salt,
      });

      setSavedSettings(nextSavedSettings);
      setForm((current) => ({
        ...current,
        ...nextSavedSettings,
      }));
      setConfigMeta((current) => ({
        ...current,
        nodeId: saved.nodeId,
        registeredAt: saved.registeredAt,
        lastSuccessfulSyncAt: saved.lastSuccessfulSyncAt ?? null,
      }));
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
      toast.error(healthBlockedReason, { className: toastClassName("error") });
      setStatusMessage({
        tone: "warning",
        text: healthBlockedReason,
      });
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

  const summaryLines =
    syncSummary === null
      ? [labels.summaryIdle]
      : [
          syncSummary.pushed === 0 &&
          syncSummary.pulled === 0 &&
          syncSummary.applied === 0 &&
          syncSummary.duplicates === 0
            ? labels.summaryNoChanges
            : null,
          syncSummary.pushed > 0 ? replaceCount(labels.summarySent, syncSummary.pushed) : null,
          syncSummary.pulled > 0 ? replaceCount(labels.summaryReceived, syncSummary.pulled) : null,
          syncSummary.applied > 0 ? replaceCount(labels.summaryApplied, syncSummary.applied) : null,
          syncSummary.duplicates > 0
            ? replaceCount(labels.summaryDuplicates, syncSummary.duplicates)
            : null,
        ].filter((value): value is string => Boolean(value));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b-2 border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
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

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1.45fr_0.95fr]">
        <section className="space-y-6">
          <div className="border-2 border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <RadioTower className="h-4 w-4" />
              <h2 className="font-black uppercase tracking-widest">{labels.stepGuide}</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="border border-border bg-muted/20 p-4">
                <div className="text-sm font-black uppercase tracking-[0.18em]">{labels.stepOne}</div>
                <p className="mt-2 text-sm text-muted-foreground">{labels.stepBodyOne}</p>
              </div>
              <div className="border border-border bg-muted/20 p-4">
                <div className="text-sm font-black uppercase tracking-[0.18em]">{labels.stepTwo}</div>
                <p className="mt-2 text-sm text-muted-foreground">{labels.stepBodyTwo}</p>
              </div>
              <div className="border border-border bg-muted/20 p-4">
                <div className="text-sm font-black uppercase tracking-[0.18em]">{labels.stepThree}</div>
                <p className="mt-2 text-sm text-muted-foreground">{labels.stepBodyThree}</p>
              </div>
            </div>
          </div>

          <div className="border-2 border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center border-2 border-foreground bg-foreground text-background">
                <UserRound className="h-4 w-4" />
              </span>
              <div>
                <h2 className="font-black uppercase tracking-widest">{labels.group}</h2>
                <p className="text-sm text-muted-foreground">{labels.groupBody}</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  {labels.userId}
                </span>
                <Input
                  aria-label="sync-user-id"
                  value={form.userId}
                  onChange={handleChange("userId")}
                  className="rounded-none border-2"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  {labels.salt}
                </span>
                <Input
                  aria-label="sync-salt"
                  value={form.salt}
                  onChange={handleChange("salt")}
                  className="rounded-none border-2 font-mono text-xs"
                />
              </label>

              <label className="block space-y-2 md:col-span-2">
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  {labels.passphrase}
                </span>
                <Input
                  aria-label="sync-passphrase"
                  type="password"
                  value={form.passphrase}
                  onChange={handleChange("passphrase")}
                  placeholder="session-only"
                  className="rounded-none border-2"
                />
                <div className="flex flex-wrap items-center gap-2 text-xs">
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
              </label>
            </div>
          </div>

          <div className="border-2 border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center border-2 border-foreground bg-background">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <div>
                <h2 className="font-black uppercase tracking-widest">{labels.device}</h2>
                <p className="text-sm text-muted-foreground">{labels.deviceBody}</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block space-y-2 md:col-span-2">
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  {labels.deviceName}
                </span>
                <Input
                  aria-label="sync-device-name"
                  value={form.deviceName}
                  onChange={handleChange("deviceName")}
                  className="rounded-none border-2"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  {labels.deviceId}
                </span>
                <Input
                  aria-label="sync-device-id"
                  value={configMeta.deviceId}
                  readOnly
                  className="rounded-none border-2 bg-muted/40 font-mono text-xs"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  {labels.lastSync}
                </span>
                <Input
                  aria-label="sync-last-success"
                  value={configMeta.lastSuccessfulSyncAt ? formatDate(configMeta.lastSuccessfulSyncAt) : labels.never}
                  readOnly
                  className="rounded-none border-2 bg-muted/40 text-xs"
                />
              </label>
            </div>
          </div>

          <div className="border-2 border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center border-2 border-foreground bg-background">
                <Server className="h-4 w-4" />
              </span>
              <div>
                <h2 className="font-black uppercase tracking-widest">{labels.node}</h2>
                <p className="text-sm text-muted-foreground">{labels.nodeBody}</p>
              </div>
            </div>

            <div className="space-y-4">
              <label className="block space-y-2">
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  {labels.syncNodeUrl}
                </span>
                <Input
                  aria-label="sync-node-url"
                  value={form.syncNodeUrl}
                  onChange={handleChange("syncNodeUrl")}
                  placeholder="http://192.168.0.10:4010"
                  className="rounded-none border-2"
                />
              </label>

              <p className="text-xs text-muted-foreground">
                {healthBlockedReason ? labels.healthIdle : labels.healthReady}
              </p>

              <Button
                onClick={handleHealthCheck}
                disabled={isCheckingHealth || Boolean(healthBlockedReason)}
                variant="outline"
                className="h-11 rounded-none border-2 border-foreground font-black uppercase tracking-[0.2em]"
              >
                <Cable className="mr-2 h-4 w-4" />
                {labels.health}
              </Button>
            </div>
          </div>

          <div className="border-2 border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center border-2 border-foreground bg-foreground text-background">
                <Activity className="h-4 w-4" />
              </span>
              <div>
                <h2 className="font-black uppercase tracking-widest">{labels.run}</h2>
                <p className="text-sm text-muted-foreground">{labels.runBody}</p>
              </div>
            </div>

            <div
              className={`mb-4 border px-4 py-3 ${
                syncBlockedReason
                  ? "border-destructive/40 bg-destructive/5"
                  : "border-foreground/30 bg-muted/20"
              }`}
            >
              <div className="flex items-start gap-3">
                {syncBlockedReason ? (
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
                ) : (
                  <CheckCircle2 className="mt-0.5 h-4 w-4" />
                )}
                <div>
                  <div className="text-sm font-black uppercase tracking-[0.18em]">
                    {syncBlockedReason ? labels.blocked : labels.ready}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {syncBlockedReason ?? labels.savedBody}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
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
                onClick={handleSyncNow}
                disabled={isSyncing || Boolean(syncBlockedReason)}
                className="h-12 rounded-none border-2 border-foreground bg-foreground font-black uppercase tracking-[0.2em] text-background hover:bg-foreground/90"
              >
                <Activity className="mr-2 h-4 w-4" />
                {labels.syncNow}
              </Button>
            </div>

            <p className="mt-3 text-xs text-muted-foreground">{labels.saveHint}</p>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="border-2 border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              <h2 className="font-black uppercase tracking-widest">{labels.statusTitle}</h2>
            </div>

            <div
              className={`border px-4 py-3 ${
                hasUnsavedSettings ? "border-destructive/40 bg-destructive/5" : "border-border bg-muted/20"
              }`}
            >
              <div className="text-sm font-black uppercase tracking-[0.18em]">
                {hasUnsavedSettings ? labels.unsavedTitle : labels.savedTitle}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {hasUnsavedSettings ? labels.unsavedBody : labels.savedBody}
              </p>
            </div>

            {statusMessage && (
              <div
                className={`mt-3 border px-4 py-3 text-sm ${
                  statusMessage.tone === "success"
                    ? "border-foreground/40 bg-muted/20"
                    : statusMessage.tone === "warning"
                      ? "border-destructive/40 bg-destructive/5"
                      : "border-border bg-background"
                }`}
              >
                {statusMessage.text}
              </div>
            )}
          </div>

          <div className="border-2 border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              <h2 className="font-black uppercase tracking-widest">{labels.localState}</h2>
            </div>

            <div className="grid gap-3">
              <div className="flex items-center justify-between border border-border px-3 py-3">
                <span className="text-sm text-muted-foreground">{labels.notes}</span>
                <span className="font-mono text-xl font-black">{stats.activeNotes}</span>
              </div>
              <div className="flex items-center justify-between border border-border px-3 py-3">
                <span className="text-sm text-muted-foreground">{labels.tombstones}</span>
                <span className="font-mono text-xl font-black">{stats.tombstoneCount}</span>
              </div>
              <div className="flex items-center justify-between border border-border px-3 py-3">
                <span className="text-sm text-muted-foreground">{labels.ops}</span>
                <span className="font-mono text-xl font-black">{stats.opCount}</span>
              </div>
            </div>
          </div>

          <div className="border-2 border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <Server className="h-4 w-4" />
              <h2 className="font-black uppercase tracking-widest">{labels.registerInfo}</h2>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between border border-border px-3 py-3">
                <span className="text-muted-foreground">{labels.nodeId}</span>
                <span className="font-mono">{configMeta.nodeId ?? "..."}</span>
              </div>
              <div className="flex items-center justify-between border border-border px-3 py-3">
                <span className="text-muted-foreground">{labels.registeredAt}</span>
                <span>{configMeta.registeredAt ? formatDate(configMeta.registeredAt) : labels.never}</span>
              </div>
              {healthSummary && (
                <div className="border border-dashed border-border px-3 py-3">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    {labels.health}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="font-mono">{healthSummary.nodeId}</span>
                    <span>{formatDate(healthSummary.serverTime)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="border-2 border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <Activity className="h-4 w-4" />
              <h2 className="font-black uppercase tracking-widest">{labels.currentRun}</h2>
            </div>

            <div className="space-y-2 text-sm">
              {summaryLines.map((line) => (
                <div key={line} className="border border-border px-3 py-3 text-muted-foreground">
                  {line}
                </div>
              ))}
            </div>

            {syncSummary && (
              <div className="mt-4 grid gap-3">
                <div className="flex items-center justify-between border border-border px-3 py-3">
                  <span className="text-muted-foreground">{labels.sent}</span>
                  <span className="font-mono text-lg font-black">{syncSummary.pushed}</span>
                </div>
                <div className="flex items-center justify-between border border-border px-3 py-3">
                  <span className="text-muted-foreground">{labels.received}</span>
                  <span className="font-mono text-lg font-black">{syncSummary.pulled}</span>
                </div>
                <div className="flex items-center justify-between border border-border px-3 py-3">
                  <span className="text-muted-foreground">{labels.applied}</span>
                  <span className="font-mono text-lg font-black">{syncSummary.applied}</span>
                </div>
                <div className="flex items-center justify-between border border-border px-3 py-3">
                  <span className="text-muted-foreground">{labels.duplicates}</span>
                  <span className="font-mono text-lg font-black">{syncSummary.duplicates}</span>
                </div>
                <div className="flex items-center justify-between border border-border px-3 py-3">
                  <span className="text-muted-foreground">{labels.cursor}</span>
                  <span className="font-mono text-lg font-black">{syncSummary.cursor}</span>
                </div>
              </div>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}
