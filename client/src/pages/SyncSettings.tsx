import { useEffect, useMemo, useState } from "react";
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

import { SyncPairingQrModal } from "@/components/SyncPairingQrModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getPersistedSyncSecret } from "@/domains/sync/persistedSyncSecretStore";
import { syncScheduler, subscribeToSyncUiState, getSyncUiState, type SyncUiState } from "@/domains/sync/syncScheduler";
import { createPairingSessionForMobile, enableSyncOnThisDevice, getDefaultBootstrapUrl } from "@/domains/sync/syncPairing";
import { checkSyncNodeHealth } from "@/domains/sync/syncEngine";
import { getOrCreateSyncConfig, saveSyncSettingsDraft } from "@/domains/sync/syncSettingsStore";
import { useLanguage } from "@/contexts/LanguageContext";

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

function getFriendlySyncError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Could not sync.";
  if (message.includes("Failed to fetch")) {
    return "Could not reach the PC. Make sure both devices are on the same network.";
  }
  return message;
}

function getStatusLabel(syncState: SyncUiState): string {
  switch (syncState.status) {
    case "syncing":
      return "Syncing";
    case "error":
      return "Could not sync";
    case "idle":
      return syncState.enabled ? "Sync is on" : "Sync is off";
    case "off":
    default:
      return "Sync is off";
  }
}

function getStatusDescription(syncState: SyncUiState): string {
  if (!syncState.enabled) {
    return "Turn sync on here, then scan one QR code on the phone.";
  }

  if (syncState.status === "error") {
    return syncState.lastError ?? "Could not sync right now.";
  }

  if (syncState.status === "syncing") {
    return "Checking for changes in the background.";
  }

  return "Notes stay local on this device first, then sync in the background.";
}

export default function SyncSettingsPage() {
  const [, setLocation] = useLocation();
  const { formatDate } = useLanguage();
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

  const syncEnabled = Boolean(pageState?.syncNodeUrl && pageState?.hasPersistedSecret);
  const effectiveSyncState = useMemo<SyncUiState>(
    () =>
      syncEnabled && syncState.status === "off"
        ? { ...syncState, enabled: true, status: "idle" }
        : syncState,
    [syncEnabled, syncState],
  );
  const lastSyncedAt = syncState.lastSyncedAt ?? pageState?.lastSuccessfulSyncAt ?? null;
  const statusLabel = useMemo(() => getStatusLabel(effectiveSyncState), [effectiveSyncState]);
  const statusDescription = useMemo(() => getStatusDescription(effectiveSyncState), [effectiveSyncState]);

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

  const handleEnable = async (preferredBootstrapUrl?: string) => {
    setIsBusy("enable");
    setHealthSummary(null);
    try {
      await enableSyncOnThisDevice({
        preferredBootstrapUrl,
      });
      await loadState();
      setShowRecovery(false);
      setStatus({ tone: "success", text: "Sync is ready on this PC." });
      toast.success("Sync is ready on this PC.", { className: toastClassName() });
    } catch (error) {
      const message = getFriendlySyncError(error);
      setShowRecovery(true);
      setStatus({ tone: "warning", text: message });
      toast.error(message, { className: toastClassName("error") });
    } finally {
      setIsBusy(null);
    }
  };

  const handleSyncNow = async () => {
    setIsBusy("sync");
    try {
      await syncScheduler.syncNow();
      await loadState();
      setStatus({ tone: "success", text: "Sync completed." });
      toast.success("Sync completed.", { className: toastClassName() });
    } catch (error) {
      const message = getFriendlySyncError(error);
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
      setStatus({ tone: "success", text: "QR code ready for the phone." });
    } catch (error) {
      const message = getFriendlySyncError(error);
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
      const message = "Enter the PC sync URL.";
      setStatus({ tone: "warning", text: message });
      toast.error(message, { className: toastClassName("error") });
      return;
    }

    setIsBusy("recovery");
    try {
      const config = await getOrCreateSyncConfig();
      await saveSyncSettingsDraft({
        userId: config.userId,
        keyEpoch: config.keyEpoch,
        deviceName: config.deviceName,
        syncNodeUrl: normalizedUrl,
        salt: config.salt,
      });
      await loadState();
      setStatus({ tone: "success", text: "The PC sync URL was updated." });
      toast.success("The PC sync URL was updated.", { className: toastClassName() });
    } catch (error) {
      const message = getFriendlySyncError(error);
      setStatus({ tone: "warning", text: message });
      toast.error(message, { className: toastClassName("error") });
    } finally {
      setIsBusy(null);
    }
  };

  const handleHealth = async () => {
    const targetUrl = normalizeValue(customUrl || pageState?.syncNodeUrl || "");
    if (!targetUrl) {
      const message = "Enter the PC sync URL.";
      setStatus({ tone: "warning", text: message });
      toast.error(message, { className: toastClassName("error") });
      return;
    }

    setIsBusy("health");
    try {
      const summary = await checkSyncNodeHealth(targetUrl);
      setHealthSummary(summary);
      setStatus({ tone: "success", text: "The PC is reachable." });
      toast.success("The PC is reachable.", { className: toastClassName() });
    } catch (error) {
      const message = getFriendlySyncError(error);
      setHealthSummary(null);
      setStatus({ tone: "warning", text: message });
      toast.error(message, { className: toastClassName("error") });
    } finally {
      setIsBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b-2 border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/")}
              aria-label="Back to home"
              title="Back to home"
              className="rounded-full border border-border hover:bg-muted"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-lg font-black uppercase tracking-tight">SYNC</h1>
              <p className="text-xs text-muted-foreground">
                Use the same notes on your PC and phone.
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        <section className="border-2 border-border bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="text-xs font-black uppercase tracking-[0.24em] text-muted-foreground">
                Sync
              </div>
              <div className="text-2xl font-black uppercase tracking-tight">
                {syncEnabled ? "On" : "Off"}
              </div>
              <p className="max-w-xl text-sm text-muted-foreground">{statusDescription}</p>
            </div>

            <span
              className={`border px-3 py-2 text-xs font-black uppercase tracking-[0.2em] ${
                effectiveSyncState.status === "error"
                  ? "border-destructive/40 text-destructive"
                  : "border-border text-muted-foreground"
              }`}
            >
              {statusLabel}
            </span>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <div className="border border-border px-4 py-4">
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Last synced</div>
              <div className="mt-2 text-sm">
                {lastSyncedAt ? formatDate(lastSyncedAt) : "Not yet"}
              </div>
            </div>
            <div className="border border-border px-4 py-4">
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">This device</div>
              <div className="mt-2 text-sm">{pageState?.deviceName ?? "Loading..."}</div>
            </div>
          </div>

          {!syncEnabled ? (
            <div className="mt-5 flex flex-wrap gap-3">
              <Button
                type="button"
                onClick={() => {
                  void handleEnable();
                }}
                disabled={isBusy === "enable"}
                className="h-12 rounded-none border-2 border-foreground bg-foreground font-black uppercase tracking-[0.2em] text-background hover:bg-foreground/90"
              >
                <ShieldCheck className="mr-2 h-4 w-4" />
                Enable Sync
              </Button>
            </div>
          ) : (
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <Button
                type="button"
                onClick={() => {
                  void handleCreatePairing();
                }}
                disabled={isBusy === "pair"}
                className="h-12 rounded-none border-2 border-foreground bg-foreground font-black uppercase tracking-[0.2em] text-background hover:bg-foreground/90"
              >
                <QrCode className="mr-2 h-4 w-4" />
                Add Phone
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
                Sync Now
              </Button>
            </div>
          )}
        </section>

        {(syncState.status === "error" || showRecovery) && (
          <section className="border-2 border-border bg-card p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 items-center justify-center border-2 border-foreground bg-foreground text-background">
                <LifeBuoy className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-black uppercase tracking-widest">Recovery</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Use this only if the phone cannot connect to the PC or sync keeps failing.
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block space-y-2">
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  PC Sync URL
                </span>
                <Input
                  aria-label="sync-node-url"
                  value={customUrl}
                  onChange={(event) => setCustomUrl(event.target.value)}
                  placeholder="http://127.0.0.1:4010"
                  className="rounded-none border-2"
                />
              </label>

              <div className="flex flex-wrap gap-3">
                {!syncEnabled && (
                  <Button
                    type="button"
                    onClick={() => {
                      void handleEnable(customUrl);
                    }}
                    disabled={isBusy === "enable"}
                    className="rounded-none border-2 border-foreground bg-foreground font-black uppercase tracking-[0.18em] text-background hover:bg-foreground/90"
                  >
                    <MonitorUp className="mr-2 h-4 w-4" />
                    Try This PC
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
                    className="rounded-none border-2 border-foreground font-bold uppercase tracking-[0.18em]"
                  >
                    Save This URL
                  </Button>
                )}

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void handleHealth();
                  }}
                  disabled={isBusy === "health"}
                  className="rounded-none border-2 border-foreground font-bold uppercase tracking-[0.18em]"
                >
                  <Cable className="mr-2 h-4 w-4" />
                  Check Connection
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setLocation("/manual-sync")}
                  className="rounded-none font-bold uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
                >
                  Manual File Sync
                </Button>
              </div>

              {healthSummary && (
                <div className="border border-border px-4 py-4 text-sm">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">PC status</div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="font-mono">{healthSummary.nodeId}</span>
                    <span>{formatDate(healthSummary.serverTime)}</span>
                  </div>
                </div>
              )}
            </div>
          </section>
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

      <SyncPairingQrModal
        open={pairingModal.open}
        onOpenChange={(open) => setPairingModal((current) => ({ ...current, open }))}
        pairingUrl={pairingModal.url}
        expiresAt={pairingModal.expiresAt}
      />
    </div>
  );
}
