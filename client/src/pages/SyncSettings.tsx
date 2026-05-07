import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowLeft,
  Cable,
  LifeBuoy,
  MonitorUp,
  QrCode,
  ShieldCheck,
  Smartphone,
  TriangleAlert,
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/contexts/LanguageContext";
import { getPersistedSyncSecret } from "@/domains/sync/persistedSyncSecretStore";
import {
  commitSelectedSyncNodeUrl,
  createPairingSessionForMobile,
  enableSyncOnThisDevice,
  getDefaultBootstrapUrl,
  probeLocalSyncHost,
  type EnableSyncResult,
  type LocalSyncHostCapability,
} from "@/domains/sync/syncPairing";
import { assertSyncEnvironmentSupported, getSyncEnvironmentSupport } from "@/domains/sync/syncEnvironment";
import { checkSyncNodeHealth } from "@/domains/sync/syncEngine";
import { getOrCreateSyncConfig, saveSyncSettingsDraft } from "@/domains/sync/syncSettingsStore";
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

type HostRoleState =
  | { status: "checking" }
  | { status: "host" }
  | { status: "guest"; reason: LocalSyncHostCapability["reason"] };

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
            unreachablePc: "PC に接続できません。PC とこの端末が同じネットワーク上にあるか確認してください。",
            unsupportedMessage: "この公開版では、PC 上のローカル同期ノードに直接つなげません。",
            unsupportedBody:
              "同期を使うときは、PC 上でローカル配信している TATAC を開いてください。PC では http://127.0.0.1:3000、スマホでは http://PCのIP:3000 のような URL を使います。",
            unsupportedStepsTitle: "使い方",
            unsupportedStep1: "1. PC でローカル URL の TATAC を開く",
            unsupportedStep2: "2. その画面で「同期を有効化」を押す",
            unsupportedStep3: "3. スマホで QR コードを読み取る",
            title: "同期",
            subtitle: "PC とスマホで同じメモを使います。",
            helper: "同期は裏で動きます。普段はメモだけに集中してください。",
            backToHome: "ホームに戻る",
            section: "同期",
            statusOn: "同期オン",
            statusOff: "同期オフ",
            statusSyncing: "同期中",
            statusRetrying: "再試行中",
            statusError: "同期できません",
            lastSynced: "最終同期",
            notYet: "まだ同期していません",
            thisDevice: "この端末",
            loading: "読み込み中...",
            enableSync: "この PC で同期を有効化",
            addPhone: "スマホを追加",
            syncNow: "今すぐ同期",
            waitingForPcTitle: "まず PC 側で有効化してください",
            waitingForPcBody: "この端末からは同期の起点になりません。PC で同期を有効化して、表示された QR コードを読み取ってください。",
            enabledSummary: "メモはまずこの端末に保存され、起動時・復帰時・保存後に自動で同期されます。",
            syncOffDescription: "この PC で同期を有効化してから、スマホを追加してください。",
            syncingDescription: "変更を確認しています。",
            syncErrorDescription: "いまは同期できません。",
            idleDescription: "メモはローカルに保存され、その後に自動で同期されます。",
            openRecovery: "同期に失敗したときだけ復旧を開く",
            recoveryTitle: "復旧",
            recoveryBody: "PC に接続できないときや、同期が続けて失敗するときだけ使ってください。",
            pcSyncUrl: "PC の同期 URL",
            tryThisPc: "この PC で試す",
            saveThisUrl: "この URL を保存",
            checkConnection: "接続確認",
            manualFileSync: "手動ファイル同期",
            pcStatus: "PC の状態",
            readyOnPc: "この PC で同期を使える状態になりました。",
            syncCompleted: "同期が完了しました。",
            qrReady: "スマホ用の QR コードを表示しました。",
            enterPcUrl: "PC の同期 URL を入力してください。",
            updatedPcUrl: "PC の同期 URL を更新しました。",
            pcReachable: "PC に接続できました。",
            chooseAddress: "スマホが接続する PC のアドレスを選んでください。",
            changePcAddress: "PC アドレスを変更",
            candidatePickerTitle: "接続先アドレス",
            candidatePickerBody: "スマホから届く PC のアドレスを 1 つ選んでください。",
            closePicker: "あとで選ぶ",
          }
        : {
            fallbackSyncError: "Could not sync.",
            unreachablePc: "Could not reach the PC. Make sure both devices are on the same network.",
            unsupportedMessage: "This hosted app cannot connect directly to the local sync node on your PC.",
            unsupportedBody:
              "When you want sync, open the locally served TATAC app on the PC first. Use a local URL such as http://127.0.0.1:3000 on the PC and http://<PC-IP>:3000 on the phone.",
            unsupportedStepsTitle: "How to use sync",
            unsupportedStep1: "1. Open TATAC from a local PC URL",
            unsupportedStep2: "2. Press Enable Sync on that screen",
            unsupportedStep3: "3. Scan the QR code from the phone",
            title: "Sync",
            subtitle: "Use the same notes on your PC and phone.",
            helper: "Sync stays in the background. Focus on taking notes.",
            backToHome: "Back to home",
            section: "Sync",
            statusOn: "Sync On",
            statusOff: "Sync Off",
            statusSyncing: "Syncing",
            statusRetrying: "Retrying",
            statusError: "Could not sync",
            lastSynced: "Last synced",
            notYet: "Not yet",
            thisDevice: "This device",
            loading: "Loading...",
            enableSync: "Enable Sync on This PC",
            addPhone: "Add Phone",
            syncNow: "Sync Now",
            waitingForPcTitle: "Start from the PC",
            waitingForPcBody: "This device should join an existing sync setup. Enable sync on the PC first, then scan its QR code here.",
            enabledSummary: "Notes save here first, then sync automatically on open, resume, and save.",
            syncOffDescription: "Enable sync on this PC, then add your phone.",
            syncingDescription: "Checking for changes.",
            syncErrorDescription: "Could not sync right now.",
            idleDescription: "Notes save locally first, then sync in the background.",
            openRecovery: "Open recovery only if sync fails",
            recoveryTitle: "Recovery",
            recoveryBody: "Use this only if the phone cannot reach the PC or sync keeps failing.",
            pcSyncUrl: "PC sync URL",
            tryThisPc: "Try This PC",
            saveThisUrl: "Save This URL",
            checkConnection: "Check Connection",
            manualFileSync: "Manual File Sync",
            pcStatus: "PC status",
            readyOnPc: "Sync is ready on this PC.",
            syncCompleted: "Sync completed.",
            qrReady: "QR code is ready for the phone.",
            enterPcUrl: "Enter the PC sync URL.",
            updatedPcUrl: "The PC sync URL was updated.",
            pcReachable: "The PC is reachable.",
            chooseAddress: "Choose the PC address that your phone should use.",
            changePcAddress: "Change PC address",
            candidatePickerTitle: "Connection address",
            candidatePickerBody: "Pick one PC address that the phone can reach.",
            closePicker: "Choose later",
          },
    [language],
  );
}

function getFriendlySyncError(error: unknown, copy: ReturnType<typeof useCopy>): string {
  const message = error instanceof Error ? error.message : copy.fallbackSyncError;
  if (message.includes("Failed to fetch")) {
    return copy.unreachablePc;
  }
  return message;
}

function getStatusLabel(syncState: SyncUiState, syncEnabled: boolean, copy: ReturnType<typeof useCopy>): string {
  if (!syncEnabled) {
    return copy.statusOff;
  }

  switch (syncState.status) {
    case "syncing":
      return copy.statusSyncing;
    case "retrying":
      return copy.statusRetrying;
    case "error":
      return copy.statusError;
    case "idle":
    case "off":
    default:
      return copy.statusOn;
  }
}

function getStatusDescription(syncState: SyncUiState, syncEnabled: boolean, copy: ReturnType<typeof useCopy>): string {
  if (!syncEnabled) {
    return copy.syncOffDescription;
  }

  if (syncState.status === "error") {
    return syncState.lastError ? getFriendlySyncError(new Error(syncState.lastError), copy) : copy.syncErrorDescription;
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
  const [isBusy, setIsBusy] = useState<"enable" | "pair" | "health" | "sync" | "recovery" | null>(null);
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
  const [hostRole, setHostRole] = useState<HostRoleState>({ status: "checking" });
  const [nodeReachable, setNodeReachable] = useState<boolean | null>(null);

  const syncNodeEnvironment = getSyncEnvironmentSupport(pageState?.syncNodeUrl || null);
  const bootstrapEnvironment = getSyncEnvironmentSupport(getDefaultBootstrapUrl());
  const environment = pageState?.syncNodeUrl ? syncNodeEnvironment : bootstrapEnvironment;
  const syncEnabled = Boolean(pageState?.syncNodeUrl && pageState?.hasPersistedSecret && syncNodeEnvironment.supported);
  const lastSyncedAt = syncState.lastSyncedAt ?? pageState?.lastSuccessfulSyncAt ?? null;
  const statusLabel = useMemo(() => getStatusLabel(syncState, syncEnabled, copy), [copy, syncEnabled, syncState]);
  const statusDescription = useMemo(
    () => getStatusDescription(syncState, syncEnabled, copy),
    [copy, syncEnabled, syncState],
  );

  const loadState = async () => {
    const [config, persistedSecret] = await Promise.all([getOrCreateSyncConfig(), getPersistedSyncSecret()]);

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

  const refreshHostRole = async () => {
    const capability = await probeLocalSyncHost();
    if (!capability.supported) {
      setHostRole({ status: "guest", reason: capability.reason });
      return;
    }

    setHostRole(
      capability.canEnableOnThisDevice
        ? { status: "host" }
        : { status: "guest", reason: capability.reason },
    );
  };

  useEffect(() => {
    void loadState();
    void refreshHostRole();
  }, []);

  useEffect(() => subscribeToSyncUiState(setSyncState), []);

  useEffect(() => {
    if (!syncEnabled) {
      setNodeReachable(null);
      return;
    }

    const checkReachability = () => {
      void getOrCreateSyncConfig().then((config) => {
        if (!config.syncNodeUrl) {
          return;
        }

        checkSyncNodeHealth(config.syncNodeUrl)
          .then(() => setNodeReachable(true))
          .catch(() => setNodeReachable(false));
      });
    };

    checkReachability();
    const handler = () => {
      if (document.visibilityState === "visible") {
        checkReachability();
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [syncEnabled]);

  const handleEnable = async (preferredBootstrapUrl?: string) => {
    setIsBusy("enable");
    setHealthSummary(null);
    try {
      const result: EnableSyncResult = await enableSyncOnThisDevice({
        preferredBootstrapUrl,
      });
      await loadState();
      await refreshHostRole();
      setShowRecovery(false);
      if (result.needsCandidateSelection) {
        setCandidates(result.candidates);
        setShowCandidatePicker(true);
        setStatus({ tone: "success", text: copy.chooseAddress });
        toast.success(copy.chooseAddress, { className: toastClassName() });
      } else {
        syncScheduler.schedule("config-change", 0);
        setStatus({ tone: "success", text: copy.readyOnPc });
        toast.success(copy.readyOnPc, { className: toastClassName() });
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
      await commitSelectedSyncNodeUrl(url);
      await loadState();
      syncScheduler.schedule("config-change", 0);
      setShowCandidatePicker(false);
      setStatus({ tone: "success", text: copy.readyOnPc });
      toast.success(copy.readyOnPc, { className: toastClassName() });
    } catch (error) {
      const message = getFriendlySyncError(error, copy);
      toast.error(message, { className: toastClassName("error") });
    }
  };

  const handleSyncNow = async () => {
    setIsBusy("sync");
    try {
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
      assertSyncEnvironmentSupported(normalizedUrl);
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
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black uppercase tracking-tighter">{copy.title}</h1>
              {syncEnabled && nodeReachable !== null ? (
                <span
                  className={`h-2 w-2 rounded-full ${nodeReachable ? "bg-green-500" : "bg-muted-foreground"}`}
                  title={nodeReachable ? copy.pcReachable : copy.syncErrorDescription}
                />
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">{copy.subtitle}</p>
          </div>
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
                  <div className="mt-2 text-2xl font-black uppercase tracking-tight">
                    {syncEnabled ? copy.statusOn : copy.statusOff}
                  </div>
                </div>
                <span
                  className={`border px-3 py-2 text-[11px] font-black uppercase tracking-[0.2em] ${
                    syncState.status === "error"
                      ? "border-destructive/40 text-destructive"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {statusLabel}
                </span>
              </div>

              <div className="space-y-3 px-4 py-4">
                <p className="text-sm text-muted-foreground">
                  {syncEnabled ? copy.enabledSummary : statusDescription}
                </p>

                <div className="border border-border px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{copy.lastSynced}</div>
                  <div className="mt-2 text-sm">{lastSyncedAt ? formatDate(lastSyncedAt) : copy.notYet}</div>
                </div>

                <div className="border border-border px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{copy.thisDevice}</div>
                  <div className="mt-2 text-sm">{pageState?.deviceName ?? copy.loading}</div>
                </div>

                {!syncEnabled && hostRole.status === "guest" ? (
                  <div className="border border-border px-4 py-4">
                    <div className="flex items-start gap-3">
                      <Smartphone className="mt-0.5 h-4 w-4" />
                      <div>
                        <div className="text-sm font-semibold">{copy.waitingForPcTitle}</div>
                        <p className="mt-1 text-sm text-muted-foreground">{copy.waitingForPcBody}</p>
                      </div>
                    </div>
                  </div>
                ) : null}

                {!syncEnabled && hostRole.status === "host" ? (
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
                ) : null}

                {syncEnabled ? (
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
                ) : null}

                {syncEnabled && syncState.status !== "error" && !showRecovery ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowRecovery(true)}
                    className="h-10 justify-start rounded-none px-0 font-bold uppercase tracking-[0.18em] text-muted-foreground hover:bg-transparent hover:text-foreground"
                  >
                    <LifeBuoy className="mr-2 h-4 w-4" />
                    {copy.openRecovery}
                  </Button>
                ) : null}
              </div>
            </section>

            {showCandidatePicker && candidates.length > 1 ? (
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
                      onClick={() => {
                        void handleSelectCandidate(candidate.url);
                      }}
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
                    {copy.closePicker}
                  </Button>
                </div>
              </section>
            ) : null}

            {syncEnabled && !showCandidatePicker && candidates.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowCandidatePicker(true)}
                className="h-10 rounded-none px-0 font-bold uppercase tracking-[0.18em] text-muted-foreground hover:bg-transparent hover:text-foreground"
              >
                <Cable className="mr-2 h-4 w-4" />
                {copy.changePcAddress}
              </Button>
            ) : null}

            {(syncEnabled && syncState.status === "error") || showRecovery ? (
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
                    {!syncEnabled && hostRole.status === "host" ? (
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
                    ) : null}

                    {syncEnabled ? (
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
                    ) : null}

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

                  {healthSummary ? (
                    <div className="border border-border px-4 py-4 text-sm">
                      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{copy.pcStatus}</div>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <span className="font-mono">{healthSummary.nodeId}</span>
                        <span>{formatDate(healthSummary.serverTime)}</span>
                      </div>
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}
          </>
        )}

        {status ? (
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
        ) : null}
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
