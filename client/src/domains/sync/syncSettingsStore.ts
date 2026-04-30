import {
  DEFAULT_SYNC_KDF_PARAMS,
  persistedSyncConfigSchema,
  type PersistedSyncConfig,
} from "@shared/contracts";

import { tatacDb } from "@/db/tatacDb";
import { createDeviceId, createLocalUserId, createSaltBase64, guessDeviceName } from "@/domains/device/deviceIdentity";

export interface SyncSettingsDraft {
  userId: string;
  deviceName: string;
  syncNodeUrl: string | null;
  salt?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeSyncNodeUrl(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function createDefaultSyncConfig(): PersistedSyncConfig {
  const createdAt = nowIso();
  const deviceId = createDeviceId();

  return persistedSyncConfigSchema.parse({
    id: "active",
    userId: createLocalUserId(deviceId),
    deviceId,
    deviceName: guessDeviceName(),
    syncNodeUrl: null,
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
  return created;
}

export async function saveSyncSettingsDraft(draft: SyncSettingsDraft): Promise<PersistedSyncConfig> {
  const current = await getOrCreateSyncConfig();

  const updated = persistedSyncConfigSchema.parse({
    ...current,
    userId: draft.userId.trim(),
    deviceName: draft.deviceName.trim(),
    syncNodeUrl: normalizeSyncNodeUrl(draft.syncNodeUrl ?? ""),
    salt: draft.salt?.trim() || current.salt,
    updatedAt: nowIso(),
  });

  // TODO: If userId changes after local ops exist, later sync phases should define a rebind/migration path.
  await tatacDb.syncConfig.put(updated);
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
  return updated;
}
