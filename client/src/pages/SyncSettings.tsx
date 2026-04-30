import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowLeft,
  Cable,
  ChevronDown,
  ChevronUp,
  KeyRound,
  MonitorUp,
  QrCode,
  ShieldCheck,
  Smartphone,
  TriangleAlert,
  Wifi,
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

import { SyncPairingQrModal } from "@/components/SyncPairingQrModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getLocalSyncDataSummary, hasPendingPushNoteOps } from "@/domains/notes/noteRepository";
import { getPersistedSyncSecret, savePersistedSyncSecret } from "@/domains/sync/persistedSyncSecretStore";
import {
  getRealtimeSyncState,
  subscribeToRealtimeSyncState,
  type RealtimeSyncState,
} from "@/domains/sync/realtimeSyncState";
import { setSyncSessionSecret } from "@/domains/sync/sessionSecretStore";
import { checkSyncNodeHealth, syncWithNode, type SyncRunResult } from "@/domains/sync/syncEngine";
import {
  createPairingSessionForMobile,
  enableSyncOnThisDevice,
  getDefaultBootstrapUrl,
} from "@/domains/sync/syncPairing";
import { fetchBootstrap } from "@/domains/sync/syncTransport";
import {
  getOrCreateSyncConfig,
  saveSyncSettingsDraft,
  saveSyncTransportPreference,
  startNextKeyEpoch,
} from "@/domains/sync/syncSettingsStore";
import { useLanguage } from "@/contexts/LanguageContext";
import type { SyncNodeCandidate } from "@shared/contracts";

interface AdvancedFormState {
  userId: string;
  keyEpoch: string;
  deviceName: string;
  syncNodeUrl: string;
  salt: string;
  passphrase: string;
}

interface SyncPageState {
  deviceId: string;
  deviceName: string;
  userId: string;
  keyEpoch: number;
  syncNodeUrl: string;
  transportMode: "relay-only" | "lan-direct";
  lanSyncEnabled: boolean;
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

function parseKeyEpoch(value: string): number | null {
  const parsed = Number(value.trim());
  if (!Number.isInteger(parsed) || parsed < 1) {
    return null;
  }
  return parsed;
}

function createFallbackCandidate(url: string): SyncNodeCandidate {
  const hostname = new URL(url).hostname;
  return {
    url,
    label: hostname === "127.0.0.1" ? "Loopback" : `Configured host (${hostname})`,
    kind: hostname === "127.0.0.1" ? "loopback" : "explicit",
    address: hostname,
  };
}

function getFriendlySyncError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Sync failed.";
  if (message.includes("Failed to fetch")) {
    return "Could not reach the sync node. Check that both devices are on the same network and that the node URL is correct.";
  }
  if (message.includes("different sync epoch")) {
    return "This file or response belongs to a different key epoch.";
  }
  return message;
}

function saveSuccessMessage(rotationRequested: boolean, nextKeyEpoch: number | null): string {
  if (rotationRequested && nextKeyEpoch) {
    return `Started key epoch ${nextKeyEpoch}.`;
  }
  return "Advanced sync settings saved.";
}

function rotationBlockedMessage(): string {
  return "Sync all pending changes before starting a new key epoch.";
}

function getRealtimeStatusCopy(
  syncEnabled: boolean,
  pageState: SyncPageState | null,
  realtimeState: RealtimeSyncState,
): { label: string; description: string } {
  if (!syncEnabled || !pageState) {
    return {
      label: "Setup required",
      description: "Enable sync on this PC first.",
    };
  }

  if (!pageState.lanSyncEnabled) {
    return {
      label: "LAN Sync is off",
      description: "Live direct sync is paused. You can still use Force catch-up or manual file sync.",
    };
  }

  switch (realtimeState.transportStatus) {
    case "direct":
      return {
        label: "Direct on local network",
        description: "Live sync is using a direct peer connection while the app stays open.",
      };
    case "turn":
      return {
        label: "Connected through TURN",
        description: "Live sync is active, but the peer connection is going through TURN instead of staying local.",
      };
    case "relay-only":
      return {
        label: "Falling back to relay",
        description: "The app is online and will keep using the sync node for catch-up when direct peer delivery is unavailable.",
      };
    case "disconnected":
    default:
      return {
        label: realtimeState.lastError ? "Disconnected" : "Connecting",
        description: realtimeState.lastError
          ? realtimeState.lastError
          : "Trying to start live LAN sync. Keep the app open on both devices.",
      };
  }
}

export default function SyncSettingsPage() {
  const [, setLocation] = useLocation();
  const { formatDate } = useLanguage();
  const [isBusy, setIsBusy] = useState<
    "enable" | "toggle" | "pair" | "health" | "sync" | "save" | "candidate" | null
  >(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showCustomUrl, setShowCustomUrl] = useState(false);
  const [customUrl, setCustomUrl] = useState(getDefaultBootstrapUrl());
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [pageState, setPageState] = useState<SyncPageState | null>(null);
  const [savedPassphrase, setSavedPassphrase] = useState("");
  const [candidateOptions, setCandidateOptions] = useState<SyncNodeCandidate[]>([]);
  const [realtimeState, setRealtimeState] = useState<RealtimeSyncState>(getRealtimeSyncState());
  const [form, setForm] = useState<AdvancedFormState>({
    userId: "",
    keyEpoch: "1",
    deviceName: "",
    syncNodeUrl: "",
    salt: "",
    passphrase: "",
  });
  const [healthSummary, setHealthSummary] = useState<{
    nodeId: string;
    serverTime: string;
  } | null>(null);
  const [syncSummary, setSyncSummary] = useState<SyncRunResult | null>(null);
  const [pairingModal, setPairingModal] = useState<{
    open: boolean;
    url: string;
    expiresAt: string;
  }>({
    open: false,
    url: "",
    expiresAt: "",
  });

  const syncEnabled = Boolean(pageState?.syncNodeUrl && pageState?.hasPersistedSecret);
  const statusCopy = useMemo(
    () => getRealtimeStatusCopy(syncEnabled, pageState, realtimeState),
    [pageState, realtimeState, syncEnabled],
  );
  const selectedCandidate = useMemo(
    () => candidateOptions.find((candidate) => candidate.url === pageState?.syncNodeUrl) ?? null,
    [candidateOptions, pageState?.syncNodeUrl],
  );
  const isKeyMaterialChanged = Boolean(
    pageState &&
      (normalizeValue(form.salt) !== pageState.salt ||
        normalizeValue(form.passphrase) !== savedPassphrase),
  );
  const isGroupChanged = Boolean(
    pageState && normalizeValue(form.userId) !== pageState.userId,
  );
  const rotationRequested = Boolean(pageState && !isGroupChanged && isKeyMaterialChanged);

  const hydrateCandidates = async (syncNodeUrl: string | null): Promise<SyncNodeCandidate[]> => {
    if (!syncNodeUrl) {
      return [];
    }

    try {
      const bootstrap = await fetchBootstrap(syncNodeUrl);
      return bootstrap.candidates;
    } catch {
      return [createFallbackCandidate(syncNodeUrl)];
    }
  };

  const loadState = async () => {
    const [config, persistedSecret] = await Promise.all([
      getOrCreateSyncConfig(),
      getPersistedSyncSecret(),
    ]);
    const candidates = await hydrateCandidates(config.syncNodeUrl);

    setCandidateOptions(candidates);
    setSavedPassphrase(persistedSecret?.groupSecret ?? "");
    setPageState({
      deviceId: config.deviceId,
      deviceName: config.deviceName,
      userId: config.userId,
      keyEpoch: config.keyEpoch,
      syncNodeUrl: config.syncNodeUrl ?? "",
      transportMode: config.transportMode,
      lanSyncEnabled: config.lanSyncEnabled,
      salt: config.salt,
      nodeId: config.nodeId,
      lastSuccessfulSyncAt: config.lastSuccessfulSyncAt ?? null,
      hasPersistedSecret: Boolean(persistedSecret?.groupSecret),
    });
    setForm({
      userId: config.userId,
      keyEpoch: String(config.keyEpoch),
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

  useEffect(() => subscribeToRealtimeSyncState(setRealtimeState), []);

  const handleEnable = async () => {
    setIsBusy("enable");
    setHealthSummary(null);
    setSyncSummary(null);
    try {
      const result = await enableSyncOnThisDevice({
        preferredBootstrapUrl: showCustomUrl ? customUrl : undefined,
      });
      setCandidateOptions(result.candidates);
      await loadState();
      setShowCustomUrl(false);
      setStatus({ tone: "success", text: "LAN Sync is ready on this PC." });
      toast.success("LAN Sync is ready on this PC.", { className: toastClassName() });
    } catch (error) {
      const message = getFriendlySyncError(error);
      setShowCustomUrl(true);
      setStatus({
        tone: "warning",
        text: showCustomUrl
          ? message
          : "Could not reach the default local sync node. Enter a custom node URL if needed.",
      });
      toast.error(
        showCustomUrl
          ? message
          : "Could not reach the default local sync node. Enter a custom node URL if needed.",
        { className: toastClassName("error") },
      );
    } finally {
      setIsBusy(null);
    }
  };

  const handleToggleLanSync = async () => {
    if (!pageState) {
      return;
    }

    setIsBusy("toggle");
    try {
      await saveSyncTransportPreference({
        lanSyncEnabled: !pageState.lanSyncEnabled,
        transportMode: !pageState.lanSyncEnabled ? "lan-direct" : "relay-only",
      });
      await loadState();
      setStatus({
        tone: "success",
        text: !pageState.lanSyncEnabled
          ? "LAN Sync is on. Keep the app open on both devices."
          : "LAN Sync is off. Live direct sync is paused.",
      });
    } catch (error) {
      const message = getFriendlySyncError(error);
      setStatus({ tone: "warning", text: message });
      toast.error(message, { className: toastClassName("error") });
    } finally {
      setIsBusy(null);
    }
  };

  const handleSelectCandidate = async (candidate: SyncNodeCandidate) => {
    if (!pageState) {
      return;
    }

    setIsBusy("candidate");
    try {
      await saveSyncSettingsDraft({
        userId: pageState.userId,
        keyEpoch: pageState.keyEpoch,
        deviceName: pageState.deviceName,
        syncNodeUrl: candidate.url,
        transportMode: pageState.transportMode,
        lanSyncEnabled: pageState.lanSyncEnabled,
        salt: pageState.salt,
      });
      await loadState();
      setStatus({
        tone: "success",
        text: `Phone pairing will use ${candidate.label}.`,
      });
    } catch (error) {
      const message = getFriendlySyncError(error);
      setStatus({ tone: "warning", text: message });
      toast.error(message, { className: toastClassName("error") });
    } finally {
      setIsBusy(null);
    }
  };

  const handleCreatePairing = async () => {
    setIsBusy("pair");
    try {
      const result = await createPairingSessionForMobile({
        syncNodeUrlOverride: pageState?.syncNodeUrl || undefined,
      });
      setPairingModal({
        open: true,
        url: result.pairingUrl,
        expiresAt: result.expiresAt,
      });
      setStatus({ tone: "success", text: "QR code ready for the phone." });
      toast.success("QR code ready for the phone.", { className: toastClassName() });
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
      const message = "Enter a sync node URL.";
      setStatus({ tone: "warning", text: message });
      toast.error(message, { className: toastClassName("error") });
      return;
    }

    setIsBusy("health");
    try {
      const summary = await checkSyncNodeHealth(targetUrl);
      setHealthSummary(summary);
      setStatus({ tone: "success", text: "Sync node is reachable." });
      toast.success("Sync node is reachable.", { className: toastClassName() });
    } catch (error) {
      const message = getFriendlySyncError(error);
      setHealthSummary(null);
      setStatus({ tone: "warning", text: message });
      toast.error(message, { className: toastClassName("error") });
    } finally {
      setIsBusy(null);
    }
  };

  const handleForceCatchUp = async () => {
    setIsBusy("sync");
    try {
      const result = await syncWithNode();
      setSyncSummary(result);
      await loadState();
      setStatus({ tone: "success", text: "Force catch-up completed." });
      toast.success("Force catch-up completed.", { className: toastClassName() });
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
    const normalizedKeyEpoch = parseKeyEpoch(form.keyEpoch);

    if (!normalizedSyncNodeUrl) {
      const message = "Enter a sync node URL.";
      setStatus({ tone: "warning", text: message });
      toast.error(message, { className: toastClassName("error") });
      return;
    }

    if (!normalizedKeyEpoch) {
      const message = "Key epoch must be a positive integer.";
      setStatus({ tone: "warning", text: message });
      toast.error(message, { className: toastClassName("error") });
      return;
    }

    if (normalizedPassphrase.length < 8) {
      const message = "Enter a passphrase with at least 8 characters.";
      setStatus({ tone: "warning", text: message });
      toast.error(message, { className: toastClassName("error") });
      return;
    }

    if (!pageState) {
      return;
    }

    if (!isGroupChanged && !rotationRequested && normalizedKeyEpoch !== pageState.keyEpoch) {
      const message = "Use key rotation to advance the epoch, or keep the current epoch number.";
      setStatus({ tone: "warning", text: message });
      toast.error(message, { className: toastClassName("error") });
      return;
    }

    if (isGroupChanged) {
      const summary = await getLocalSyncDataSummary();
      if (summary.hasData) {
        const message =
          "Change the sync group only on an empty device. Export or clear local notes first.";
        setStatus({ tone: "warning", text: message });
        toast.error(message, { className: toastClassName("error") });
        return;
      }
    }

    setIsBusy("save");

    try {
      let nextEpoch: number | null = null;

      if (rotationRequested) {
        const config = await getOrCreateSyncConfig();
        if (await hasPendingPushNoteOps(config.userId, config.keyEpoch)) {
          const message = rotationBlockedMessage();
          setStatus({ tone: "warning", text: message });
          toast.error(message, { className: toastClassName("error") });
          return;
        }

        const updated = await startNextKeyEpoch({
          userId: config.userId,
          deviceName: normalizedDeviceName,
          syncNodeUrl: normalizedSyncNodeUrl,
          transportMode: pageState.transportMode,
          lanSyncEnabled: pageState.lanSyncEnabled,
          salt: normalizedSalt,
        });
        nextEpoch = updated.keyEpoch;
      } else {
        await saveSyncSettingsDraft({
          userId: normalizedUserId,
          keyEpoch: isGroupChanged ? normalizedKeyEpoch : pageState.keyEpoch,
          deviceName: normalizedDeviceName,
          syncNodeUrl: normalizedSyncNodeUrl,
          transportMode: pageState.transportMode,
          lanSyncEnabled: pageState.lanSyncEnabled,
          salt: normalizedSalt,
        });
      }

      await savePersistedSyncSecret({
        groupSecret: normalizedPassphrase,
        origin: "manual",
      });
      setSyncSessionSecret({ passphrase: normalizedPassphrase });
      await loadState();
      const message = saveSuccessMessage(rotationRequested, nextEpoch);
      setStatus({ tone: "success", text: message });
      toast.success(message, { className: toastClassName() });
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
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
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
                Turn LAN Sync on, keep the app open, and add phones with one QR scan.
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-4 py-6">
        {!syncEnabled ? (
          <section className="border-2 border-border bg-card p-5">
            <div className="space-y-5">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 items-center justify-center border-2 border-foreground bg-foreground text-background">
                  <MonitorUp className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-black uppercase tracking-widest">Start on this PC</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    TATAC tries the local sync node first. If your node is elsewhere, enter a custom URL.
                  </p>
                </div>
              </div>

              {showCustomUrl && (
                <label className="block space-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    Custom URL
                  </span>
                  <Input
                    aria-label="sync-node-url"
                    value={customUrl}
                    onChange={(event) => setCustomUrl(event.target.value)}
                    placeholder="Example: http://192.168.0.10:4010"
                    className="rounded-none border-2"
                  />
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
                  {showCustomUrl ? "ENABLE WITH THIS URL" : "ENABLE SYNC ON THIS PC"}
                </Button>

                {!showCustomUrl && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowCustomUrl(true)}
                    className="h-12 rounded-none border-2 border-foreground font-bold uppercase tracking-[0.18em]"
                  >
                    CUSTOM URL
                  </Button>
                )}
              </div>
            </div>
          </section>
        ) : (
          <>
            <section className="border-2 border-border bg-card p-5">
              <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Wifi className="h-4 w-4" />
                    <h2 className="font-black uppercase tracking-widest">LAN Sync</h2>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Keep the app open on both devices for live sync. The node still stays available for relay catch-up.
                  </p>
                </div>

                <Button
                  type="button"
                  onClick={handleToggleLanSync}
                  disabled={isBusy === "toggle"}
                  className={`h-12 rounded-none border-2 font-black uppercase tracking-[0.18em] ${
                    pageState?.lanSyncEnabled
                      ? "border-foreground bg-foreground text-background hover:bg-foreground/90"
                      : "border-foreground bg-background text-foreground hover:bg-muted"
                  }`}
                >
                  {pageState?.lanSyncEnabled ? "TURN LAN SYNC OFF" : "TURN LAN SYNC ON"}
                </Button>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <div className="border border-border px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Status</div>
                  <div className="mt-2 text-lg font-black uppercase tracking-tight">{statusCopy.label}</div>
                  <p className="mt-2 text-sm text-muted-foreground">{statusCopy.description}</p>
                </div>
                <div className="border border-border px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Connected Peers</div>
                  <div className="mt-2 font-mono text-3xl font-black">{realtimeState.connectedPeerCount}</div>
                  <p className="mt-2 text-sm text-muted-foreground">Visible devices in the same sync group.</p>
                </div>
                <div className="border border-border px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Last Catch-up</div>
                  <div className="mt-2 text-sm">
                    {pageState?.lastSuccessfulSyncAt
                      ? formatDate(pageState.lastSuccessfulSyncAt)
                      : "Not yet"}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">Use Force catch-up if a device was offline.</p>
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <Button
                  type="button"
                  onClick={handleCreatePairing}
                  disabled={isBusy === "pair"}
                  className="h-12 rounded-none border-2 border-foreground bg-foreground font-black uppercase tracking-[0.2em] text-background hover:bg-foreground/90"
                >
                  <QrCode className="mr-2 h-4 w-4" />
                  ADD PHONE
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleForceCatchUp}
                  disabled={isBusy === "sync"}
                  className="h-12 rounded-none border-2 border-foreground font-black uppercase tracking-[0.2em]"
                >
                  <Activity className="mr-2 h-4 w-4" />
                  FORCE CATCH-UP
                </Button>
              </div>
            </section>

            {candidateOptions.length > 0 && (
              <section className="border-2 border-border bg-card p-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 items-center justify-center border-2 border-foreground bg-foreground text-background">
                    <Smartphone className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="font-black uppercase tracking-widest">Phone URL</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Choose which address the phone should use when it scans the QR code.
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {candidateOptions.map((candidate) => {
                    const isSelected = candidate.url === pageState?.syncNodeUrl;
                    return (
                      <button
                        key={candidate.url}
                        type="button"
                        onClick={() => {
                          void handleSelectCandidate(candidate);
                        }}
                        disabled={isBusy === "candidate"}
                        className={`border-2 px-4 py-4 text-left transition-colors ${
                          isSelected
                            ? "border-foreground bg-foreground text-background"
                            : "border-border bg-background hover:bg-muted/40"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-black uppercase tracking-[0.18em]">
                              {candidate.label}
                            </div>
                            <div
                              className={`mt-2 break-all font-mono text-xs ${
                                isSelected ? "text-background/80" : "text-muted-foreground"
                              }`}
                            >
                              {candidate.url}
                            </div>
                          </div>
                          {isSelected && (
                            <span className="border border-background/50 px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em]">
                              Selected
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {selectedCandidate?.interfaceName && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    The phone will use {selectedCandidate.interfaceName}.
                  </p>
                )}
              </section>
            )}
          </>
        )}

        <section className="border-2 border-border bg-card p-5">
          <button
            type="button"
            onClick={() => setShowAdvanced((current) => !current)}
            className="flex w-full items-center justify-between gap-3 text-left"
          >
            <div>
              <h2 className="font-black uppercase tracking-widest">
                {showAdvanced ? "HIDE ADVANCED" : "ADVANCED"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Manual node URL, diagnostics, key rotation, and file fallback.
              </p>
            </div>
            {showAdvanced ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </button>

          {showAdvanced && (
            <div className="mt-5 space-y-5 border-t border-border pt-5">
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLocation("/manual-sync")}
                  className="rounded-none border-2 border-foreground font-bold uppercase tracking-[0.18em]"
                >
                  MANUAL FILE SYNC
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleHealth}
                  disabled={isBusy === "health"}
                  className="rounded-none border-2 border-foreground font-bold uppercase tracking-[0.18em]"
                >
                  <Cable className="mr-2 h-4 w-4" />
                  CHECK CONNECTION
                </Button>
              </div>

              <label className="block space-y-2">
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  Sync Node URL
                </span>
                <Input
                  aria-label="sync-node-url"
                  value={form.syncNodeUrl}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, syncNodeUrl: event.target.value }))
                  }
                  placeholder="Example: http://192.168.0.10:4010"
                  className="rounded-none border-2"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="block space-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    Sync Group ID
                  </span>
                  <Input
                    aria-label="sync-user-id"
                    value={form.userId}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, userId: event.target.value }))
                    }
                    className="rounded-none border-2"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    Key Epoch
                  </span>
                  <Input
                    aria-label="sync-key-epoch"
                    inputMode="numeric"
                    value={form.keyEpoch}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, keyEpoch: event.target.value }))
                    }
                    className="rounded-none border-2 font-mono"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    Device Name
                  </span>
                  <Input
                    aria-label="sync-device-name"
                    value={form.deviceName}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, deviceName: event.target.value }))
                    }
                    className="rounded-none border-2"
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block space-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    Passphrase
                  </span>
                  <Input
                    aria-label="sync-passphrase"
                    type="password"
                    value={form.passphrase}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, passphrase: event.target.value }))
                    }
                    placeholder="At least 8 characters"
                    className="rounded-none border-2"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    Group Salt
                  </span>
                  <Input
                    aria-label="sync-salt"
                    value={form.salt}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, salt: event.target.value }))
                    }
                    className="rounded-none border-2 font-mono text-xs"
                  />
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="border border-border px-3 py-3">
                    <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      Device ID
                    </div>
                    <div className="mt-2 font-mono text-sm">{pageState?.deviceId ?? "..."}</div>
                  </div>
                  <div className="border border-border px-3 py-3">
                    <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      Rotation Rule
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      Changing passphrase or salt starts a new key epoch.
                    </div>
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={handleSaveAdvanced}
                  disabled={isBusy === "save"}
                  variant="outline"
                  className="h-12 self-end rounded-none border-2 border-foreground font-black uppercase tracking-[0.2em]"
                >
                  {rotationRequested ? (
                    <>
                      <KeyRound className="mr-2 h-4 w-4" />
                      START NEW KEY EPOCH
                    </>
                  ) : (
                    "SAVE ADVANCED SETTINGS"
                  )}
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
                <div className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  Health
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="font-mono">{healthSummary.nodeId}</span>
                  <span>{formatDate(healthSummary.serverTime)}</span>
                </div>
              </div>
            )}

            {syncSummary && (
              <div className="border-2 border-border bg-card p-5">
                <div className="mb-3 font-black uppercase tracking-widest">LATEST CATCH-UP</div>
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="border border-border px-3 py-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      Sent
                    </div>
                    <div className="mt-2 font-mono text-lg font-black">{syncSummary.pushed}</div>
                  </div>
                  <div className="border border-border px-3 py-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      Received
                    </div>
                    <div className="mt-2 font-mono text-lg font-black">{syncSummary.pulled}</div>
                  </div>
                  <div className="border border-border px-3 py-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      Applied
                    </div>
                    <div className="mt-2 font-mono text-lg font-black">{syncSummary.applied}</div>
                  </div>
                  <div className="border border-border px-3 py-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      Key Epoch
                    </div>
                    <div className="mt-2 font-mono text-lg font-black">{pageState?.keyEpoch}</div>
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
