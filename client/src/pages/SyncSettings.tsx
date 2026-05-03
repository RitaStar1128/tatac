import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowLeft,
  Cable,
  LifeBuoy,
  MonitorUp,
  QrCode,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/contexts/LanguageContext";
import { getPersistedSyncSecret } from "@/domains/sync/persistedSyncSecretStore";
import { createPairingSessionForMobile, enableSyncOnThisDevice, getDefaultBootstrapUrl, type EnableSyncResult } from "@/domains/sync/syncPairing";
import { assertSyncEnvironmentSupported, getSyncEnvironmentSupport } from "@/domains/sync/syncEnvironment";
import { checkSyncNodeHealth } from "@/domains/sync/syncEngine";
import { getOrCreateSyncConfig, saveSyncSettingsDraft, startNextKeyEpoch } from "@/domains/sync/syncSettingsStore";
import { getSyncUiState, subscribeToSyncUiState, syncScheduler, type SyncUiState } from "@/domains/sync/syncScheduler";
import type { SyncNodeCandidate } from "@shared/contracts";

const SyncPairingQrModal = lazy(() =>
  import("@/components/SyncPairingQrModal").then((module) => ({ default: module.SyncPairingQrModal })),
);

interface SyncPageState {
  deviceName: string;
  syncNodeUrl: string;
  lastSuccessfulSyncAt: string | null;
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

function useCopy(language: "ja" | "en") {
  return useMemo(
    () =>
      language === "ja"
        ? {
            fallbackSyncError: "同期できませんでした。",
            unreachablePc: "PC に接続できませんでした。同じネットワークに接続されているか確認してください。",
            unsupportedMessage:
              "この公開 HTTPS 版からは、PC 上のローカル HTTP 同期ノードに接続できません。",
            unsupportedBody:
              "同期を使う時は、まず PC 上でローカル配信している TATAC を開いてください。PC では http://127.0.0.1:3000、スマホでは http://PCのIP:3000 のようなローカル URL を使います。",
            unsupportedStepsTitle: "使い方",
            unsupportedStep1: "1. PC で TATAC をローカル配信で開く",
            unsupportedStep2: "2. その画面で同期を有効化する",
            unsupportedStep3: "3. PC 側で表示した QR をスマホで読む",
            title: "同期",
            subtitle: "PC とスマホで同じメモを使います。",
            helper: "普段は自動で同期します。うまくいかない時だけこの画面を開いてください。",
            backToHome: "ホームに戻る",
            section: "同期",
            on: "オン",
            off: "オフ",
            statusSyncing: "同期中",
            statusError: "同期できません",
            statusOn: "同期オン",
            statusOff: "同期オフ",
            statusRetrying: "再試行中",
            waitingPc: "まず PC で同期を有効化すると、スマホ追加用の QR コードを表示できます。",
            enabledSummary: "メモはこの端末に保存されたあと、起動時・復帰時・保存後に自動同期されます。",
            syncOffDescription: "ここで同期をオンにして、スマホで QR を 1 回読み取ってください。",
            syncErrorDescription: "いまは同期できません。",
            syncingDescription: "バックグラウンドで変更を確認しています。",
            idleDescription: "この端末のメモを保ちながら、裏側で同期しています。",
            lastSynced: "最終同期",
            notYet: "まだ同期していません",
            thisDevice: "この端末",
            loading: "読み込み中...",
            enableSync: "同期を有効化",
            addPhone: "スマホを追加",
            syncNow: "今すぐ同期",
            openRecovery: "接続に失敗した時だけ復旧を使う",
            recoveryTitle: "復旧",
            recoveryBody: "スマホが PC に接続できない時、または同期に失敗し続ける時だけ使ってください。",
            pcSyncUrl: "PC 同期 URL",
            tryThisPc: "この PC で試す",
            saveThisUrl: "この URL を保存",
            checkConnection: "接続確認",
            manualFileSync: "手動ファイル同期",
            pcStatus: "PC 状態",
            readyOnPc: "この PC で同期を使えるようにしました。",
            syncCompleted: "同期が完了しました。",
            qrReady: "スマホ用の QR コードを用意しました。",
            enterPcUrl: "PC の同期 URL を入力してください。",
            updatedPcUrl: "PC の同期 URL を更新しました。",
            pcReachable: "PC に接続できます。",
            rotateKey: "暗号キーを更新",
            rotateKeyConfirmTitle: "暗号キーを更新しますか？",
            rotateKeyConfirmBody: "新しい暗号化エポックが始まります。ノートはそのまま保持されます。スマホ側は次回同期時に新しいエポックに追いつきます。",
            rotateKeyConfirm: "更新する",
            rotateKeyCancel: "キャンセル",
            rotateKeySuccess: "暗号キーを更新しました。",
            changePcAddress: "PC アドレスを変更",
            candidatePickerTitle: "ネットワークアドレスを選択",
            candidatePickerBody: "同じ Wi-Fi に接続されていないスマホから接続できない場合、別のアドレスを試してください。",
          }
        : {
            fallbackSyncError: "Could not sync.",
            unreachablePc: "Could not reach the PC. Make sure both devices are on the same network.",
            unsupportedMessage:
              "This hosted HTTPS app cannot connect to the local HTTP sync node on your PC.",
            unsupportedBody:
              "When you want to use sync, open the locally served TATAC app on the PC first. Use a local URL such as http://127.0.0.1:3000 on the PC and http://<PC-IP>:3000 on the phone.",
            unsupportedStepsTitle: "How to use sync",
            unsupportedStep1: "1. Open TATAC from a local PC URL",
            unsupportedStep2: "2. Enable sync on that local screen",
            unsupportedStep3: "3. Scan the QR code from the phone",
            title: "SYNC",
            subtitle: "Use the same notes on your PC and phone.",
            helper: "Sync runs automatically. Open recovery only when something fails.",
            backToHome: "Back to home",
            section: "Sync",
            on: "On",
            off: "Off",
            statusSyncing: "Syncing",
            statusError: "Could not sync",
            statusOn: "Sync is on",
            statusOff: "Sync is off",
            statusRetrying: "Retrying",
            waitingPc: "Enable sync on the PC first, then show a QR code for the phone.",
            enabledSummary: "Notes stay local on this device and sync automatically on open, resume, and save.",
            syncOffDescription: "Turn sync on here, then scan one QR code on the phone.",
            syncErrorDescription: "Could not sync right now.",
            syncingDescription: "Checking for changes in the background.",
            idleDescription: "Notes stay local on this device first, then sync in the background.",
            lastSynced: "Last synced",
            notYet: "Not yet",
            thisDevice: "This device",
            loading: "Loading...",
            enableSync: "Enable Sync",
            addPhone: "Add Phone",
            syncNow: "Sync Now",
            openRecovery: "Open recovery only if sync fails",
            recoveryTitle: "Recovery",
            recoveryBody: "Use this only if the phone cannot connect to the PC or sync keeps failing.",
            pcSyncUrl: "PC Sync URL",
            tryThisPc: "Try This PC",
            saveThisUrl: "Save This URL",
            checkConnection: "Check Connection",
            manualFileSync: "Manual File Sync",
            pcStatus: "PC status",
            readyOnPc: "Sync is ready on this PC.",
            syncCompleted: "Sync completed.",
            qrReady: "QR code ready for the phone.",
            enterPcUrl: "Enter the PC sync URL.",
            updatedPcUrl: "The PC sync URL was updated.",
            pcReachable: "The PC is reachable.",
            rotateKey: "Rotate Encryption Key",
            rotateKeyConfirmTitle: "Rotate encryption key?",
            rotateKeyConfirmBody: "A new encryption epoch will start. Notes are preserved. The phone will catch up on the next sync.",
            rotateKeyConfirm: "Rotate",
            rotateKeyCancel: "Cancel",
            rotateKeySuccess: "Encryption key rotated.",
            changePcAddress: "Change PC address",
            candidatePickerTitle: "Select network address",
            candidatePickerBody: "If the phone cannot connect, try a different address.",
          },
    [language],
  );
}

function getFriendlySyncError(error: unknown, copy: ReturnType<typeof useCopy>): string {
  const message = error instanceof Error ? error.message : copy.fallbackSyncError;
  if (message.includes("Failed to fetch")) {
    return copy.unreachablePc;
  }
  if (message.includes("hosted HTTPS app cannot connect")) {
    return copy.unsupportedMessage;
  }
  return message;
}

function getStatusLabel(syncState: SyncUiState, copy: ReturnType<typeof useCopy>): string {
  switch (syncState.status) {
    case "syncing":
      return copy.statusSyncing;
    case "retrying":
      return copy.statusRetrying;
    case "error":
      return copy.statusError;
    case "idle":
      return syncState.enabled ? copy.statusOn : copy.statusOff;
    case "off":
    default:
      return copy.statusOff;
  }
}

function getStatusDescription(syncState: SyncUiState, copy: ReturnType<typeof useCopy>): string {
  if (!syncState.enabled) {
    return copy.syncOffDescription;
  }

  if (syncState.status === "error") {
    return syncState.lastError
      ? getFriendlySyncError(new Error(syncState.lastError), copy)
      : copy.syncErrorDescription;
  }

  if (syncState.status === "syncing" || syncState.status === "retrying") {
    return copy.syncingDescription;
  }

  return copy.idleDescription;
}

export default function SyncSettingsPage() {
  const [, setLocation] = useLocation();
  const { formatDate, language } = useLanguage();
  const copy = useCopy(language);
  const environment = getSyncEnvironmentSupport();
  const [isBusy, setIsBusy] = useState<"enable" | "pair" | "health" | "sync" | "recovery" | "rotate" | null>(null);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [pageState, setPageState] = useState<SyncPageState | null>(null);
  const [syncState, setSyncState] = useState<SyncUiState>(getSyncUiState());
  const [showRecovery, setShowRecovery] = useState(false);
  const [customUrl, setCustomUrl] = useState(getDefaultBootstrapUrl());
  const [healthSummary, setHealthSummary] = useState<{ nodeId: string; serverTime: string } | null>(null);
  const [pairingModal, setPairingModal] = useState({
    open: false,
    url: "",
    expiresAt: "",
  });
  const [candidates, setCandidates] = useState<SyncNodeCandidate[]>([]);
  const [showCandidatePicker, setShowCandidatePicker] = useState(false);
  const [showRotateConfirm, setShowRotateConfirm] = useState(false);
  const [nodeReachable, setNodeReachable] = useState<boolean | null>(null);

  const syncEnabled = environment.supported && Boolean(pageState?.syncNodeUrl && pageState?.hasPersistedSecret);
  const effectiveSyncState = useMemo<SyncUiState>(
    () =>
      syncEnabled && syncState.status === "off"
        ? { ...syncState, enabled: true, status: "idle" }
        : syncState,
    [syncEnabled, syncState],
  );
  const lastSyncedAt = syncState.lastSyncedAt ?? pageState?.lastSuccessfulSyncAt ?? null;
  const statusLabel = useMemo(() => getStatusLabel(effectiveSyncState, copy), [copy, effectiveSyncState]);
  const statusDescription = useMemo(
    () => getStatusDescription(effectiveSyncState, copy),
    [copy, effectiveSyncState],
  );

  const loadState = async () => {
    const [config, persistedSecret] = await Promise.all([
      getOrCreateSyncConfig(),
      getPersistedSyncSecret(),
    ]);

    setPageState({
      deviceName: config.deviceName,
      syncNodeUrl: config.syncNodeUrl ?? "",
      lastSuccessfulSyncAt: config.lastSuccessfulSyncAt ?? null,
      hasPersistedSecret: Boolean(persistedSecret?.groupSecret),
    });

    if (config.syncNodeUrl) {
      setCustomUrl(config.syncNodeUrl);
    }
  };

  useEffect(() => {
    void loadState();
  }, []);

  useEffect(() => subscribeToSyncUiState(setSyncState), []);

  useEffect(() => {
    if (!syncEnabled) return;
    const checkReachability = () => {
      void getOrCreateSyncConfig().then((config) => {
        if (!config.syncNodeUrl) return;
        checkSyncNodeHealth(config.syncNodeUrl)
          .then(() => setNodeReachable(true))
          .catch(() => setNodeReachable(false));
      });
    };
    checkReachability();
    const handler = () => { if (document.visibilityState === "visible") checkReachability(); };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [syncEnabled]);

  const handleEnable = async (preferredBootstrapUrl?: string) => {
    setIsBusy("enable");
    setHealthSummary(null);
    try {
      assertSyncEnvironmentSupported();
      const result: EnableSyncResult = await enableSyncOnThisDevice({
        preferredBootstrapUrl,
      });
      await loadState();
      setShowRecovery(false);
      setStatus({ tone: "success", text: copy.readyOnPc });
      toast.success(copy.readyOnPc, { className: toastClassName() });
      if (result.candidates.length > 1) {
        setCandidates(result.candidates);
        setShowCandidatePicker(true);
      }
    } catch (error) {
      const message = getFriendlySyncError(error, copy);
      setShowRecovery(true);
      setStatus({ tone: "warning", text: message });
      toast.error(message, { className: toastClassName("error") });
    } finally {
      setIsBusy(null);
    }
  };

  const handleSelectCandidate = async (url: string) => {
    try {
      const config = await getOrCreateSyncConfig();
      await saveSyncSettingsDraft({
        userId: config.userId,
        keyEpoch: config.keyEpoch,
        deviceName: config.deviceName,
        syncNodeUrl: url,
        salt: config.salt,
      });
      await loadState();
      syncScheduler.schedule("config-change", 0);
      setShowCandidatePicker(false);
    } catch (error) {
      const message = getFriendlySyncError(error, copy);
      toast.error(message, { className: toastClassName("error") });
    }
  };

  const handleRotateKey = async () => {
    setIsBusy("rotate");
    try {
      const config = await getOrCreateSyncConfig();
      await startNextKeyEpoch({
        userId: config.userId,
        deviceName: config.deviceName,
        syncNodeUrl: config.syncNodeUrl,
        salt: config.salt,
      });
      await loadState();
      setShowRotateConfirm(false);
      syncScheduler.schedule("config-change", 0);
      setStatus({ tone: "success", text: copy.rotateKeySuccess });
      toast.success(copy.rotateKeySuccess, { className: toastClassName() });
    } catch (error) {
      const message = getFriendlySyncError(error, copy);
      setStatus({ tone: "warning", text: message });
      toast.error(message, { className: toastClassName("error") });
    } finally {
      setIsBusy(null);
    }
  };

  const handleSyncNow = async () => {
    setIsBusy("sync");
    try {
      assertSyncEnvironmentSupported();
      await syncScheduler.syncNow();
      await loadState();
      setStatus({ tone: "success", text: copy.syncCompleted });
      toast.success(copy.syncCompleted, { className: toastClassName() });
    } catch (error) {
      const message = getFriendlySyncError(error, copy);
      setStatus({ tone: "warning", text: message });
      setShowRecovery(true);
      toast.error(message, { className: toastClassName("error") });
    } finally {
      setIsBusy(null);
    }
  };

  const handleCreatePairing = async () => {
    setIsBusy("pair");
    try {
      assertSyncEnvironmentSupported();
      const result = await createPairingSessionForMobile();
      setPairingModal({
        open: true,
        url: result.pairingUrl,
        expiresAt: result.expiresAt,
      });
      setStatus({ tone: "success", text: copy.qrReady });
    } catch (error) {
      const message = getFriendlySyncError(error, copy);
      setStatus({ tone: "warning", text: message });
      setShowRecovery(true);
      toast.error(message, { className: toastClassName("error") });
    } finally {
      setIsBusy(null);
    }
  };

  const handleRecoverySave = async () => {
    const normalizedUrl = normalizeValue(customUrl);
    if (!normalizedUrl) {
      setStatus({ tone: "warning", text: copy.enterPcUrl });
      toast.error(copy.enterPcUrl, { className: toastClassName("error") });
      return;
    }

    setIsBusy("recovery");
    try {
      assertSyncEnvironmentSupported();
      const config = await getOrCreateSyncConfig();
      await saveSyncSettingsDraft({
        userId: config.userId,
        keyEpoch: config.keyEpoch,
        deviceName: config.deviceName,
        syncNodeUrl: normalizedUrl,
        salt: config.salt,
      });
      await loadState();
      setStatus({ tone: "success", text: copy.updatedPcUrl });
      toast.success(copy.updatedPcUrl, { className: toastClassName() });
    } catch (error) {
      const message = getFriendlySyncError(error, copy);
      setStatus({ tone: "warning", text: message });
      toast.error(message, { className: toastClassName("error") });
    } finally {
      setIsBusy(null);
    }
  };

  const handleHealth = async () => {
    const targetUrl = normalizeValue(customUrl || pageState?.syncNodeUrl || "");
    if (!targetUrl) {
      setStatus({ tone: "warning", text: copy.enterPcUrl });
      toast.error(copy.enterPcUrl, { className: toastClassName("error") });
      return;
    }

    setIsBusy("health");
    try {
      assertSyncEnvironmentSupported();
      const summary = await checkSyncNodeHealth(targetUrl);
      setHealthSummary(summary);
      setStatus({ tone: "success", text: copy.pcReachable });
      toast.success(copy.pcReachable, { className: toastClassName() });
    } catch (error) {
      const message = getFriendlySyncError(error, copy);
      setHealthSummary(null);
      setStatus({ tone: "warning", text: message });
      toast.error(message, { className: toastClassName("error") });
    } finally {
      setIsBusy(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b-2 border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/")}
            aria-label={copy.backToHome}
            title={copy.backToHome}
            className="mr-2 h-10 w-10 rounded-full hover:bg-accent hover:text-accent-foreground"
          >
            <ArrowLeft className="h-6 w-6" strokeWidth={2.5} />
          </Button>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-black tracking-tighter uppercase">{copy.title}</h1>
            {syncEnabled && nodeReachable !== null && (
              <span
                className={`h-2 w-2 rounded-full ${nodeReachable ? "bg-green-500" : "bg-muted-foreground"}`}
                title={nodeReachable ? "Sync node reachable" : "Sync node unreachable"}
              />
            )}
          </div>
          <p className="text-xs text-muted-foreground">{copy.subtitle}</p>
        </div>
      </header>

      <div className="border-b border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
        <div className="mx-auto max-w-md">{copy.helper}</div>
      </div>

      <main className="mx-auto w-full max-w-md space-y-4 px-4 py-4">
        {!environment.supported ? (
          <section className="border-2 border-border bg-card p-4">
            <div className="flex items-start gap-3 border-b border-border pb-4">
              <span className="flex h-10 w-10 items-center justify-center border-2 border-foreground bg-foreground text-background">
                <TriangleAlert className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-black uppercase tracking-widest">{copy.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{copy.unsupportedMessage}</p>
              </div>
            </div>

            <div className="mt-4 space-y-4">
              <p className="text-sm text-muted-foreground">{copy.unsupportedBody}</p>

              <div className="border border-border px-4 py-4">
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  {copy.unsupportedStepsTitle}
                </div>
                <div className="mt-3 space-y-2 text-sm">
                  <p>{copy.unsupportedStep1}</p>
                  <p>{copy.unsupportedStep2}</p>
                  <p>{copy.unsupportedStep3}</p>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <>
            <section className="border-2 border-border bg-card">
              <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-4">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.24em] text-muted-foreground">{copy.section}</div>
                  <div className="mt-2 text-2xl font-black uppercase tracking-tight">{syncEnabled ? copy.on : copy.off}</div>
                </div>
                <span
                  className={`border px-3 py-2 text-[11px] font-black uppercase tracking-[0.2em] ${
                    effectiveSyncState.status === "error"
                      ? "border-destructive/40 text-destructive"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {statusLabel}
                </span>
              </div>

              <div className="space-y-3 px-4 py-4">
                <p className="text-sm text-muted-foreground">
                  {syncEnabled ? copy.enabledSummary : copy.waitingPc}
                </p>

                <div className="border border-border px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{copy.lastSynced}</div>
                  <div className="mt-2 text-sm">{lastSyncedAt ? formatDate(lastSyncedAt) : copy.notYet}</div>
                </div>

                <div className="border border-border px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{copy.thisDevice}</div>
                  <div className="mt-2 text-sm">{pageState?.deviceName ?? copy.loading}</div>
                </div>

                <p className="text-sm text-muted-foreground">{statusDescription}</p>

                {!syncEnabled ? (
                  <Button
                    type="button"
                    onClick={() => {
                      void handleEnable();
                    }}
                    disabled={isBusy === "enable"}
                    className="h-12 w-full rounded-none border-2 border-foreground bg-foreground font-black uppercase tracking-[0.2em] text-background hover:bg-foreground/90"
                  >
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    {copy.enableSync}
                  </Button>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Button
                      type="button"
                      onClick={() => {
                        void handleCreatePairing();
                      }}
                      disabled={isBusy === "pair"}
                      className="h-12 rounded-none border-2 border-foreground bg-foreground font-black uppercase tracking-[0.2em] text-background hover:bg-foreground/90"
                    >
                      <QrCode className="mr-2 h-4 w-4" />
                      {copy.addPhone}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        void handleSyncNow();
                      }}
                      disabled={isBusy === "sync" || syncState.status === "syncing"}
                      className="h-12 rounded-none border-2 border-foreground font-black uppercase tracking-[0.2em]"
                    >
                      <Activity className="mr-2 h-4 w-4" />
                      {copy.syncNow}
                    </Button>
                  </div>
                )}

                {(syncState.status === "error" || showRecovery) ? null : (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowRecovery(true)}
                    className="h-10 justify-start rounded-none px-0 font-bold uppercase tracking-[0.18em] text-muted-foreground hover:bg-transparent hover:text-foreground"
                  >
                    <LifeBuoy className="mr-2 h-4 w-4" />
                    {copy.openRecovery}
                  </Button>
                )}
              </div>
            </section>

            {syncEnabled && showCandidatePicker && candidates.length > 1 && (
              <section className="border-2 border-border bg-card p-4">
                <div className="flex items-start gap-3 border-b border-border pb-4">
                  <span className="flex h-10 w-10 items-center justify-center border-2 border-foreground bg-foreground text-background">
                    <Cable className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="font-black uppercase tracking-widest">{copy.candidatePickerTitle}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{copy.candidatePickerBody}</p>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  {candidates.map((candidate) => (
                    <button
                      key={candidate.url}
                      type="button"
                      onClick={() => { void handleSelectCandidate(candidate.url); }}
                      className={`w-full border-2 px-4 py-3 text-left transition-colors hover:bg-accent ${
                        pageState?.syncNodeUrl === candidate.url
                          ? "border-foreground bg-foreground text-background"
                          : "border-border"
                      }`}
                    >
                      <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                        {candidate.label}
                      </div>
                      <div className="mt-1 font-mono text-sm">{candidate.url}</div>
                    </button>
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowCandidatePicker(false)}
                    className="h-10 rounded-none px-0 font-bold uppercase tracking-[0.18em] text-muted-foreground hover:bg-transparent hover:text-foreground"
                  >
                    {copy.rotateKeyCancel}
                  </Button>
                </div>
              </section>
            )}

            {syncEnabled && !showCandidatePicker && candidates.length > 1 && (
              <div className="px-0">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowCandidatePicker(true)}
                  className="h-10 rounded-none px-0 font-bold uppercase tracking-[0.18em] text-muted-foreground hover:bg-transparent hover:text-foreground"
                >
                  <Cable className="mr-2 h-4 w-4" />
                  {copy.changePcAddress}
                </Button>
              </div>
            )}

            {(syncState.status === "error" || showRecovery) && syncState.status !== "retrying" && (
              <section className="border-2 border-border bg-card p-4">
                <div className="flex items-start gap-3 border-b border-border pb-4">
                  <span className="flex h-10 w-10 items-center justify-center border-2 border-foreground bg-foreground text-background">
                    <LifeBuoy className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="font-black uppercase tracking-widest">{copy.recoveryTitle}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{copy.recoveryBody}</p>
                  </div>
                </div>

                <div className="mt-4 space-y-4">
                  <label className="block space-y-2">
                    <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                      {copy.pcSyncUrl}
                    </span>
                    <Input
                      aria-label="sync-node-url"
                      value={customUrl}
                      onChange={(event) => setCustomUrl(event.target.value)}
                      placeholder="http://127.0.0.1:4010"
                      className="rounded-none border-2"
                    />
                  </label>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {!syncEnabled && (
                      <Button
                        type="button"
                        onClick={() => {
                          void handleEnable(customUrl);
                        }}
                        disabled={isBusy === "enable"}
                        className="h-12 rounded-none border-2 border-foreground bg-foreground font-black uppercase tracking-[0.18em] text-background hover:bg-foreground/90"
                      >
                        <MonitorUp className="mr-2 h-4 w-4" />
                        {copy.tryThisPc}
                      </Button>
                    )}

                    {syncEnabled && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          void handleRecoverySave();
                        }}
                        disabled={isBusy === "recovery"}
                        className="h-12 rounded-none border-2 border-foreground font-bold uppercase tracking-[0.18em]"
                      >
                        {copy.saveThisUrl}
                      </Button>
                    )}

                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        void handleHealth();
                      }}
                      disabled={isBusy === "health"}
                      className="h-12 rounded-none border-2 border-foreground font-bold uppercase tracking-[0.18em]"
                    >
                      <Cable className="mr-2 h-4 w-4" />
                      {copy.checkConnection}
                    </Button>
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setLocation("/manual-sync")}
                    className="h-10 rounded-none px-0 font-bold uppercase tracking-[0.18em] text-muted-foreground hover:bg-transparent hover:text-foreground"
                  >
                    {copy.manualFileSync}
                  </Button>

                  {healthSummary && (
                    <div className="border border-border px-4 py-4 text-sm">
                      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{copy.pcStatus}</div>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <span className="font-mono">{healthSummary.nodeId}</span>
                        <span>{formatDate(healthSummary.serverTime)}</span>
                      </div>
                    </div>
                  )}

                  {syncEnabled && !showRotateConfirm && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setShowRotateConfirm(true)}
                      className="h-10 rounded-none px-0 font-bold uppercase tracking-[0.18em] text-muted-foreground hover:bg-transparent hover:text-foreground"
                    >
                      <ShieldCheck className="mr-2 h-4 w-4" />
                      {copy.rotateKey}
                    </Button>
                  )}

                  {syncEnabled && showRotateConfirm && (
                    <div className="border-2 border-border px-4 py-4 space-y-3">
                      <div className="text-xs font-black uppercase tracking-[0.2em]">{copy.rotateKeyConfirmTitle}</div>
                      <p className="text-sm text-muted-foreground">{copy.rotateKeyConfirmBody}</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Button
                          type="button"
                          onClick={() => { void handleRotateKey(); }}
                          disabled={isBusy === "rotate"}
                          className="h-12 rounded-none border-2 border-foreground bg-foreground font-black uppercase tracking-[0.18em] text-background hover:bg-foreground/90"
                        >
                          {copy.rotateKeyConfirm}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setShowRotateConfirm(false)}
                          disabled={isBusy === "rotate"}
                          className="h-12 rounded-none border-2 border-foreground font-bold uppercase tracking-[0.18em]"
                        >
                          {copy.rotateKeyCancel}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}
          </>
        )}

        {status && (
          <section>
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
          </section>
        )}
      </main>

      <Suspense fallback={null}>
        <SyncPairingQrModal
          open={pairingModal.open}
          onOpenChange={(open) => setPairingModal((current) => ({ ...current, open }))}
          pairingUrl={pairingModal.url}
          expiresAt={pairingModal.expiresAt}
        />
      </Suspense>
    </div>
  );
}
