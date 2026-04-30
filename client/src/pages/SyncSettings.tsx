import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowLeft,
  Cable,
  KeyRound,
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

function useLabels(language: "ja" | "en") {
  return useMemo(
    () =>
      language === "ja"
        ? {
            title: "同期設定",
            subtitle: "ローカルDBを正本に保ったまま、ノード同期と手動同期の設定を管理します。",
            group: "同期グループ",
            device: "端末",
            node: "同期ノード",
            passphrase: "パスフレーズ",
            passphraseHint: "パスフレーズは sessionStorage にのみ保持します。ブラウザを閉じると消えます。",
            userId: "User ID",
            deviceName: "端末名",
            deviceId: "Device ID",
            syncNodeUrl: "Sync Node URL",
            salt: "Group Salt",
            save: "設定を保存",
            saved: "同期設定を保存しました",
            failed: "同期設定の保存に失敗しました",
            localOnly: "ローカル正本",
            offline: "単体動作",
            manual: "手動同期へ",
            stats: "ローカル状態",
            notes: "アクティブメモ",
            tombstones: "Tombstone",
            ops: "Oplog",
            nodeHint: "同じ userId / passphrase / salt を使う端末どうしで同期します。",
            syncActions: "同期操作",
            health: "疎通確認",
            syncNow: "今すぐ同期",
            lastSync: "最終同期",
            registerInfo: "登録情報",
            never: "未実行",
            healthOk: "ノード疎通OK",
            healthFailed: "ノード疎通に失敗しました",
            syncOk: "同期が完了しました",
            syncFailed: "同期に失敗しました",
            pushed: "送信",
            pulled: "受信",
            applied: "適用",
            duplicates: "重複",
            cursor: "Cursor",
          }
        : {
            title: "SYNC SETTINGS",
            subtitle: "Manage node sync and manual sync while keeping the local database authoritative.",
            group: "SYNC GROUP",
            device: "DEVICE",
            node: "SYNC NODE",
            passphrase: "PASSPHRASE",
            passphraseHint: "The passphrase is kept in sessionStorage only and is cleared when the browser session ends.",
            userId: "User ID",
            deviceName: "Device Name",
            deviceId: "Device ID",
            syncNodeUrl: "Sync Node URL",
            salt: "Group Salt",
            save: "SAVE SETTINGS",
            saved: "Sync settings saved.",
            failed: "Failed to save sync settings.",
            localOnly: "LOCAL SOURCE OF TRUTH",
            offline: "OFFLINE-FIRST",
            manual: "OPEN MANUAL SYNC",
            stats: "LOCAL STATE",
            notes: "Active Notes",
            tombstones: "Tombstones",
            ops: "Oplog",
            nodeHint: "Devices sync only when they share the same userId, passphrase, and salt.",
            syncActions: "SYNC ACTIONS",
            health: "CHECK HEALTH",
            syncNow: "SYNC NOW",
            lastSync: "Last Sync",
            registerInfo: "Registration",
            never: "Never",
            healthOk: "Sync node reachable.",
            healthFailed: "Failed to reach the sync node.",
            syncOk: "Sync completed.",
            syncFailed: "Sync failed.",
            pushed: "Pushed",
            pulled: "Pulled",
            applied: "Applied",
            duplicates: "Duplicates",
            cursor: "Cursor",
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
  const [form, setForm] = useState<SyncSettingsFormState>({
    userId: "",
    deviceName: "",
    syncNodeUrl: "",
    salt: "",
    passphrase: "",
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
  const [healthSummary, setHealthSummary] = useState<{ nodeId: string; serverTime: string } | null>(null);
  const [syncSummary, setSyncSummary] = useState<SyncRunResult | null>(null);

  const loadPageState = async () => {
    const [config, snapshot] = await Promise.all([getOrCreateSyncConfig(), getNotesSnapshot()]);
    setForm((current) => ({
      ...current,
      userId: config.userId,
      deviceName: config.deviceName,
      syncNodeUrl: config.syncNodeUrl ?? "",
      salt: config.salt,
      passphrase: getSyncSessionSecret()?.passphrase ?? current.passphrase,
    }));
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

  const handleChange =
    (field: keyof SyncSettingsFormState) => (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setForm((current) => ({ ...current, [field]: value }));
      if (field === "passphrase") {
        setSyncSessionSecret({ passphrase: value });
      }
    };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const saved = await saveSyncSettingsDraft({
        userId: form.userId,
        deviceName: form.deviceName,
        syncNodeUrl: form.syncNodeUrl,
        salt: form.salt,
      });
      setSyncSessionSecret({ passphrase: form.passphrase });
      setForm((current) => ({
        ...current,
        userId: saved.userId,
        deviceName: saved.deviceName,
        syncNodeUrl: saved.syncNodeUrl ?? "",
        salt: saved.salt,
      }));
      setConfigMeta((current) => ({
        ...current,
        nodeId: saved.nodeId,
        registeredAt: saved.registeredAt,
        lastSuccessfulSyncAt: saved.lastSuccessfulSyncAt ?? null,
      }));
      toast.success(labels.saved, {
        className:
          "font-bold uppercase tracking-widest border-2 border-foreground bg-background text-foreground rounded-none shadow-none",
      });
    } catch {
      toast.error(labels.failed, {
        className:
          "font-bold uppercase tracking-widest border-2 border-destructive bg-background text-destructive rounded-none shadow-none",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleHealthCheck = async () => {
    setIsCheckingHealth(true);
    try {
      const health = await checkSyncNodeHealth();
      setHealthSummary(health);
      toast.success(labels.healthOk, {
        className:
          "font-bold uppercase tracking-widest border-2 border-foreground bg-background text-foreground rounded-none shadow-none",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : labels.healthFailed, {
        className:
          "font-bold uppercase tracking-widest border-2 border-destructive bg-background text-destructive rounded-none shadow-none",
      });
    } finally {
      setIsCheckingHealth(false);
    }
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      const result = await syncWithNode();
      setSyncSummary(result);
      await loadPageState();
      toast.success(labels.syncOk, {
        className:
          "font-bold uppercase tracking-widest border-2 border-foreground bg-background text-foreground rounded-none shadow-none",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : labels.syncFailed, {
        className:
          "font-bold uppercase tracking-widest border-2 border-destructive bg-background text-destructive rounded-none shadow-none",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b-2 border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/")}
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

      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="space-y-6">
          <div className="border-2 border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center border-2 border-foreground bg-foreground text-background">
                <UserRound className="h-4 w-4" />
              </span>
              <div>
                <h2 className="font-black uppercase tracking-widest">{labels.group}</h2>
                <p className="text-sm text-muted-foreground">{labels.localOnly}</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  {labels.userId}
                </span>
                <Input aria-label="sync-user-id" value={form.userId} onChange={handleChange("userId")} className="rounded-none border-2" />
              </label>

              <label className="block space-y-2">
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  {labels.salt}
                </span>
                <Input aria-label="sync-salt" value={form.salt} onChange={handleChange("salt")} className="rounded-none border-2 font-mono text-xs" />
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
                <p className="text-xs text-muted-foreground">{labels.passphraseHint}</p>
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
                <p className="text-sm text-muted-foreground">{labels.offline}</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block space-y-2 md:col-span-2">
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  {labels.deviceName}
                </span>
                <Input aria-label="sync-device-name" value={form.deviceName} onChange={handleChange("deviceName")} className="rounded-none border-2" />
              </label>

              <label className="block space-y-2">
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  {labels.deviceId}
                </span>
                <Input aria-label="sync-device-id" value={configMeta.deviceId} readOnly className="rounded-none border-2 bg-muted/40 font-mono text-xs" />
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
                <p className="text-sm text-muted-foreground">{labels.nodeHint}</p>
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

              <div className="grid gap-3 md:grid-cols-2">
                <Button
                  onClick={handleHealthCheck}
                  disabled={isCheckingHealth || !form.syncNodeUrl.trim()}
                  variant="outline"
                  className="h-11 rounded-none border-2 border-foreground font-black uppercase tracking-[0.2em]"
                >
                  <Cable className="mr-2 h-4 w-4" />
                  {labels.health}
                </Button>
                <Button
                  onClick={handleSyncNow}
                  disabled={
                    isSyncing ||
                    !form.userId.trim() ||
                    !form.syncNodeUrl.trim() ||
                    !form.salt.trim() ||
                    form.passphrase.trim().length < 8
                  }
                  className="h-11 rounded-none border-2 border-foreground bg-foreground font-black uppercase tracking-[0.2em] text-background hover:bg-foreground/90"
                >
                  <Activity className="mr-2 h-4 w-4" />
                  {labels.syncNow}
                </Button>
              </div>
            </div>
          </div>

          <Button
            onClick={handleSave}
            disabled={
              isSaving ||
              !form.userId.trim() ||
              !form.deviceName.trim() ||
              !form.salt.trim() ||
              form.passphrase.trim().length < 8
            }
            className="h-12 rounded-none border-2 border-foreground bg-foreground font-black uppercase tracking-[0.2em] text-background hover:bg-foreground/90"
          >
            <Save className="mr-2 h-4 w-4" />
            {labels.save}
          </Button>
        </section>

        <aside className="space-y-4">
          <div className="border-2 border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              <h2 className="font-black uppercase tracking-widest">{labels.stats}</h2>
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
                <span className="text-muted-foreground">Node ID</span>
                <span className="font-mono">{configMeta.nodeId ?? "..."}</span>
              </div>
              <div className="flex items-center justify-between border border-border px-3 py-3">
                <span className="text-muted-foreground">Registered</span>
                <span>{configMeta.registeredAt ? formatDate(configMeta.registeredAt) : labels.never}</span>
              </div>
              {healthSummary && (
                <div className="border border-dashed border-border px-3 py-3">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Health</div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="font-mono">{healthSummary.nodeId}</span>
                    <span>{formatDate(healthSummary.serverTime)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {syncSummary && (
            <div className="border-2 border-border bg-card p-5">
              <div className="mb-4 flex items-center gap-2">
                <Activity className="h-4 w-4" />
                <h2 className="font-black uppercase tracking-widest">{labels.syncActions}</h2>
              </div>

              <div className="grid gap-3">
                <div className="flex items-center justify-between border border-border px-3 py-3">
                  <span className="text-muted-foreground">{labels.pushed}</span>
                  <span className="font-mono text-lg font-black">{syncSummary.pushed}</span>
                </div>
                <div className="flex items-center justify-between border border-border px-3 py-3">
                  <span className="text-muted-foreground">{labels.pulled}</span>
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
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
