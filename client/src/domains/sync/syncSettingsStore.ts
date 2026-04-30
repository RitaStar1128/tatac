import {
  DEFAULT_SYNC_KDF_PARAMS,
  persistedSyncConfigSchema,
  type PersistedSyncConfig,
} from "@shared/contracts";

import { tatacDb } from "@/db/tatacDb";
import { createDeviceId, createLocalUserId, createSaltBase64, guessDeviceName } from "@/domains/device/deviceIdentity";

export interface SyncSettingsDraft {
  userId: string;
  keyEpoch?: number;
  deviceName: string;
  syncNodeUrl: string | null;
  transportMode?: PersistedSyncConfig["transportMode"];
  lanSyncEnabled?: boolean;
  salt?: string;
}

const syncConfigListeners = new Set<(config: PersistedSyncConfig) => void>();

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeSyncNodeUrl(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function notifySyncConfigListeners(config: PersistedSyncConfig): void {
  for (const listener of Array.from(syncConfigListeners)) {
    try {
      listener(config);
    } catch (error) {
      console.error("Sync config listener failed", error);
    }
  }
}

function createDefaultSyncConfig(): PersistedSyncConfig {
  const createdAt = nowIso();
  const deviceId = createDeviceId();

  return persistedSyncConfigSchema.parse({
    id: "active",
    userId: createLocalUserId(deviceId),
    keyEpoch: 1,
    deviceId,
    deviceName: guessDeviceName(),
    syncNodeUrl: null,
    transportMode: "relay-only",
    lanSyncEnabled: false,
    salt: createSaltBase64(),
    kdf: DEFAULT_SYNC_KDF_PARAMS,
    createdAt,
    updatedAt: createdAt,
    lastSuccessfulSyncAt: null,
  });
}

export async function getOrCreateSyncConfig(): Promise<PersistedSyncConfig> {
  const existing = await tatacDb.syncConfig.get("active");
  if (existing) {
    return persistedSyncConfigSchema.parse(existing);
  }

  const created = createDefaultSyncConfig();
  await tatacDb.syncConfig.put(created);
  notifySyncConfigListeners(created);
  return created;
}

export async function saveSyncSettingsDraft(draft: SyncSettingsDraft): Promise<PersistedSyncConfig> {
  const current = await getOrCreateSyncConfig();

  const updated = persistedSyncConfigSchema.parse({
    ...current,
    userId: draft.userId.trim(),
    keyEpoch: draft.keyEpoch ?? current.keyEpoch,
    deviceName: draft.deviceName.trim(),
    syncNodeUrl: normalizeSyncNodeUrl(draft.syncNodeUrl ?? ""),
    transportMode: draft.transportMode ?? current.transportMode,
    lanSyncEnabled: draft.lanSyncEnabled ?? current.lanSyncEnabled,
    salt: draft.salt?.trim() || current.salt,
    updatedAt: nowIso(),
  });

  // TODO: If userId changes after local ops exist, later sync phases should define a rebind/migration path.
  await tatacDb.syncConfig.put(updated);
  notifySyncConfigListeners(updated);
  return updated;
}

export async function replaceSyncGroupSettings(draft: SyncSettingsDraft): Promise<PersistedSyncConfig> {
  const current = await getOrCreateSyncConfig();

  const updated = persistedSyncConfigSchema.parse({
    ...current,
    userId: draft.userId.trim(),
    keyEpoch: draft.keyEpoch ?? current.keyEpoch,
    deviceName: draft.deviceName.trim(),
    syncNodeUrl: normalizeSyncNodeUrl(draft.syncNodeUrl ?? ""),
    transportMode: draft.transportMode ?? current.transportMode,
    lanSyncEnabled: draft.lanSyncEnabled ?? current.lanSyncEnabled,
    salt: draft.salt?.trim() || current.salt,
    updatedAt: nowIso(),
    nodeId: undefined,
    registeredAt: undefined,
    lastSuccessfulSyncAt: null,
  });

  await tatacDb.syncConfig.put(updated);
  notifySyncConfigListeners(updated);
  return updated;
}

export async function startNextKeyEpoch(draft: {
  userId: string;
  deviceName: string;
  syncNodeUrl: string | null;
  transportMode?: PersistedSyncConfig["transportMode"];
  lanSyncEnabled?: boolean;
  salt: string;
}): Promise<PersistedSyncConfig> {
  const current = await getOrCreateSyncConfig();

  const updated = persistedSyncConfigSchema.parse({
    ...current,
    userId: draft.userId.trim(),
    keyEpoch: current.keyEpoch + 1,
    deviceName: draft.deviceName.trim(),
    syncNodeUrl: normalizeSyncNodeUrl(draft.syncNodeUrl ?? ""),
    transportMode: draft.transportMode ?? current.transportMode,
    lanSyncEnabled: draft.lanSyncEnabled ?? current.lanSyncEnabled,
    salt: draft.salt.trim(),
    updatedAt: nowIso(),
    nodeId: undefined,
    registeredAt: undefined,
    lastSuccessfulSyncAt: null,
  });

  await tatacDb.syncConfig.put(updated);
  notifySyncConfigListeners(updated);
  return updated;
}

export async function updateSyncRegistration(metadata: {
  nodeId: string;
  registeredAt: string;
}): Promise<PersistedSyncConfig> {
  const current = await getOrCreateSyncConfig();
  const updated = persistedSyncConfigSchema.parse({
    ...current,
    nodeId: metadata.nodeId,
    registeredAt: metadata.registeredAt,
    updatedAt: nowIso(),
  });
  await tatacDb.syncConfig.put(updated);
  notifySyncConfigListeners(updated);
  return updated;
}

export async function markLastSuccessfulSync(): Promise<PersistedSyncConfig> {
  const current = await getOrCreateSyncConfig();
  const updated = persistedSyncConfigSchema.parse({
    ...current,
    lastSuccessfulSyncAt: nowIso(),
    updatedAt: nowIso(),
  });
  await tatacDb.syncConfig.put(updated);
  notifySyncConfigListeners(updated);
  return updated;
}

export async function saveSyncTransportPreference(input: {
  lanSyncEnabled: boolean;
  transportMode?: PersistedSyncConfig["transportMode"];
}): Promise<PersistedSyncConfig> {
  const current = await getOrCreateSyncConfig();
  const updated = persistedSyncConfigSchema.parse({
    ...current,
    lanSyncEnabled: input.lanSyncEnabled,
    transportMode: input.transportMode ?? (input.lanSyncEnabled ? "lan-direct" : "relay-only"),
    updatedAt: nowIso(),
  });

  await tatacDb.syncConfig.put(updated);
  notifySyncConfigListeners(updated);
  return updated;
}

export function subscribeToSyncConfig(listener: (config: PersistedSyncConfig) => void): () => void {
  syncConfigListeners.add(listener);
  return () => {
    syncConfigListeners.delete(listener);
  };
}
