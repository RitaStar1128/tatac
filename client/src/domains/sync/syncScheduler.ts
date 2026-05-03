import { subscribeToLocalNoteOps } from "@/domains/notes/noteRepository";

import { getSyncEnvironmentSupport } from "./syncEnvironment";
import { getPersistedSyncSecret } from "./persistedSyncSecretStore";
import { getOrCreateSyncConfig, subscribeToSyncConfig } from "./syncSettingsStore";
import { syncWithNode, type SyncRunResult } from "./syncEngine";
import { fetchHealth } from "./syncTransport";

export type SyncUiStatus = "off" | "idle" | "syncing" | "retrying" | "error";

export interface SyncUiState {
  status: SyncUiStatus;
  enabled: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
  lastRun: SyncRunResult | null;
  retriesRemaining?: number;
}

const RETRY_BACKOFF_MS = [3000, 12000];
const MAX_SYNC_ATTEMPTS = 3;
const HEALTH_POLL_INTERVAL_MS = 30000;

function addJitter(ms: number): number {
  return ms * (0.8 + Math.random() * 0.4);
}

function isNonRetryableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  return (
    message.includes("not configured") ||
    message.includes("not enabled") ||
    message.includes("Sync is not enabled") ||
    message.includes("not ready")
  );
}

const listeners = new Set<(state: SyncUiState) => void>();

let state: SyncUiState = {
  status: "off",
  enabled: false,
  lastSyncedAt: null,
  lastError: null,
  lastRun: null,
};

function emit(): void {
  for (const listener of Array.from(listeners)) {
    listener(state);
  }
}

function setState(next: SyncUiState | ((current: SyncUiState) => SyncUiState)): void {
  state = typeof next === "function" ? next(state) : next;
  emit();
}

function getFriendlySyncError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Could not sync.";
  if (message.includes("Failed to fetch")) {
    return "Could not sync. Make sure this device can reach the PC on the same network.";
  }
  return message;
}

async function resolveSyncAvailability(): Promise<{
  enabled: boolean;
  lastSyncedAt: string | null;
}> {
  const environment = getSyncEnvironmentSupport();
  if (!environment.supported) {
    return {
      enabled: false,
      lastSyncedAt: null,
    };
  }

  const [config, secret] = await Promise.all([getOrCreateSyncConfig(), getPersistedSyncSecret()]);
  return {
    enabled: Boolean(config.syncNodeUrl && secret?.groupSecret),
    lastSyncedAt: config.lastSuccessfulSyncAt ?? null,
  };
}

class SyncScheduler {
  private started = false;
  private stopConfigSubscription: (() => void) | null = null;
  private stopNoteSubscription: (() => void) | null = null;
  private visibilityHandler: (() => void) | null = null;
  private saveDebounceTimer: number | null = null;
  private inFlight: Promise<void> | null = null;
  private rerunRequested = false;
  private healthPollTimer: number | null = null;

  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;
    this.stopConfigSubscription = subscribeToSyncConfig(() => {
      void this.refreshState(true);
    });
    this.stopNoteSubscription = subscribeToLocalNoteOps(() => {
      this.schedule("memo-save");
    });
    this.visibilityHandler = () => {
      if (document.visibilityState === "visible") {
        this.schedule("resume", 0);
      }
    };
    document.addEventListener("visibilitychange", this.visibilityHandler);

    void this.refreshState(false).then(() => {
      if (document.visibilityState === "visible") {
        this.schedule("app-open", 0);
      }
    });
  }

  stop(): void {
    if (!this.started) {
      return;
    }

    this.started = false;
    this.stopConfigSubscription?.();
    this.stopNoteSubscription?.();
    if (this.visibilityHandler) {
      document.removeEventListener("visibilitychange", this.visibilityHandler);
    }
    this.visibilityHandler = null;
    if (this.saveDebounceTimer !== null) {
      window.clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }
    this.stopHealthPoll();
  }

  private startHealthPoll(): void {
    this.stopHealthPoll();
    this.healthPollTimer = window.setInterval(() => {
      void this.checkHealth();
    }, HEALTH_POLL_INTERVAL_MS);
  }

  private stopHealthPoll(): void {
    if (this.healthPollTimer !== null) {
      window.clearInterval(this.healthPollTimer);
      this.healthPollTimer = null;
    }
  }

  private async checkHealth(): Promise<void> {
    const config = await getOrCreateSyncConfig();
    if (!config.syncNodeUrl) {
      return;
    }
    try {
      await fetchHealth(config.syncNodeUrl);
      this.stopHealthPoll();
      setState((current) => ({
        ...current,
        status: "idle",
        lastError: null,
      }));
      this.schedule("resume", 0);
    } catch {
      // still unreachable, continue polling
    }
  }

  async refreshState(scheduleSync: boolean): Promise<void> {
    const availability = await resolveSyncAvailability();
    setState((current) => ({
      ...current,
      enabled: availability.enabled,
      status: availability.enabled ? (current.status === "error" ? "error" : "idle") : "off",
      lastSyncedAt: availability.lastSyncedAt,
      lastError: availability.enabled ? current.lastError : null,
      lastRun: availability.enabled ? current.lastRun : null,
    }));

    if (scheduleSync && availability.enabled && document.visibilityState === "visible") {
      this.schedule("config-change", 0);
    }
  }

  schedule(_reason: "app-open" | "resume" | "memo-save" | "config-change", delayMs = 900): void {
    if (!this.started) {
      return;
    }

    if (this.saveDebounceTimer !== null) {
      window.clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }

    this.saveDebounceTimer = window.setTimeout(() => {
      this.saveDebounceTimer = null;
      void this.run();
    }, delayMs);
  }

  async syncNow(): Promise<SyncRunResult> {
    if (this.saveDebounceTimer !== null) {
      window.clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }

    const result = await this.run();
    if (!result) {
      throw new Error("Sync is not enabled on this device yet.");
    }
    if (state.status === "error") {
      throw new Error(state.lastError ?? "Could not sync.");
    }
    return result;
  }

  private async run(): Promise<SyncRunResult | null> {
    const availability = await resolveSyncAvailability();
    if (!availability.enabled) {
      setState((current) => ({
        ...current,
        enabled: false,
        status: "off",
        lastError: null,
      }));
      return null;
    }

    if (this.inFlight) {
      this.rerunRequested = true;
      await this.inFlight;
      return state.lastRun;
    }

    setState((current) => ({
      ...current,
      enabled: true,
      status: "syncing",
      lastError: null,
    }));

    this.inFlight = (async () => {
      let lastError: unknown;

      for (let attempt = 0; attempt < MAX_SYNC_ATTEMPTS; attempt++) {
        try {
          const result = await syncWithNode();
          this.stopHealthPoll();
          setState((current) => ({
            ...current,
            enabled: true,
            status: "idle",
            lastSyncedAt: result.completedAt,
            lastError: null,
            lastRun: result,
            retriesRemaining: undefined,
          }));
          return;
        } catch (error) {
          lastError = error;

          const isLastAttempt = attempt === MAX_SYNC_ATTEMPTS - 1;
          if (isNonRetryableError(error) || isLastAttempt) {
            break;
          }

          const backoffMs = RETRY_BACKOFF_MS[attempt] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1];
          setState((current) => ({
            ...current,
            enabled: true,
            status: "retrying",
            lastError: null,
            retriesRemaining: MAX_SYNC_ATTEMPTS - attempt - 1,
          }));
          await new Promise<void>((resolve) => setTimeout(resolve, addJitter(backoffMs)));
        }
      }

      setState((current) => ({
        ...current,
        enabled: true,
        status: "error",
        lastError: getFriendlySyncError(lastError),
        retriesRemaining: undefined,
      }));
      this.startHealthPoll();
    })();

    await this.inFlight;
    return state.lastRun;
  }
}

export const syncScheduler = new SyncScheduler();

export function getSyncUiState(): SyncUiState {
  return state;
}

export function subscribeToSyncUiState(listener: (state: SyncUiState) => void): () => void {
  listeners.add(listener);
  listener(state);
  return () => {
    listeners.delete(listener);
  };
}
