import { subscribeToLocalNoteOps } from "@/domains/notes/noteRepository";

import { getSyncEnvironmentSupport } from "./syncEnvironment";
import { getPersistedSyncSecret } from "./persistedSyncSecretStore";
import { getOrCreateSyncConfig, subscribeToSyncConfig } from "./syncSettingsStore";
import { syncWithNode, type SyncRunResult } from "./syncEngine";

export type SyncUiStatus = "off" | "idle" | "syncing" | "error";

export interface SyncUiState {
  status: SyncUiStatus;
  enabled: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
  lastRun: SyncRunResult | null;
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
      try {
        const result = await syncWithNode();
        setState((current) => ({
          ...current,
          enabled: true,
          status: "idle",
          lastSyncedAt: result.completedAt,
          lastError: null,
          lastRun: result,
        }));
      } catch (error) {
        setState((current) => ({
          ...current,
          enabled: true,
          status: "error",
          lastError: getFriendlySyncError(error),
        }));
      } finally {
        this.inFlight = null;
        if (this.rerunRequested) {
          this.rerunRequested = false;
          this.schedule("memo-save", 0);
        }
      }
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
