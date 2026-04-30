import {
  tatacSyncFileSchema,
  type PersistedSyncConfig,
  type TatacSyncFile,
} from "@shared/contracts";

import {
  applyInboundNoteOp,
  listAllNoteOpsForUser,
  listPendingPushNoteOps,
  markNoteOpsAcknowledged,
} from "@/domains/notes/noteRepository";

import { decryptEnvelopeToNoteOp, encryptNoteOpToEnvelope } from "./syncCrypto";
import { getSyncCursor, setSyncCursor } from "./syncCursorStore";
import { resolveEffectiveSyncPassphrase } from "./syncSecretResolver";
import {
  fetchHealth,
  pullEnvelopes,
  pushEnvelopes,
  registerDevice,
} from "./syncTransport";
import {
  getOrCreateSyncConfig,
  markLastSuccessfulSync,
  saveSyncSettingsDraft,
  updateSyncRegistration,
} from "./syncSettingsStore";

type ActiveSyncConfig = PersistedSyncConfig & {
  syncNodeUrl: string;
};

export interface SyncRunResult {
  nodeId: string;
  serverTime: string;
  pushed: number;
  pulled: number;
  applied: number;
  duplicates: number;
  cursor: number;
  completedAt: string;
}

export interface ManualImportResult {
  importedItems: number;
  applied: number;
  duplicates: number;
  adoptedSalt: boolean;
  completedAt: string;
}

async function getActiveSyncConfig(syncNodeUrlOverride?: string): Promise<ActiveSyncConfig> {
  const config = await getOrCreateSyncConfig();
  const syncNodeUrl = syncNodeUrlOverride?.trim() || config.syncNodeUrl;
  if (!syncNodeUrl) {
    throw new Error("Sync node URL is not configured.");
  }
  return {
    ...config,
    syncNodeUrl,
  };
}

async function getActiveSyncContext(syncNodeUrlOverride?: string): Promise<{
  config: ActiveSyncConfig;
  passphrase: string;
}> {
  const [config, passphrase] = await Promise.all([
    getActiveSyncConfig(syncNodeUrlOverride),
    resolveEffectiveSyncPassphrase(),
  ]);

  return { config, passphrase };
}

export async function checkSyncNodeHealth(
  syncNodeUrlOverride?: string,
): Promise<{ nodeId: string; serverTime: string }> {
  const config = await getActiveSyncConfig(syncNodeUrlOverride);
  const health = await fetchHealth(config.syncNodeUrl);
  return {
    nodeId: health.nodeId,
    serverTime: health.serverTime,
  };
}

export async function registerActiveDeviceWithNode(
  syncNodeUrlOverride?: string,
): Promise<{ config: ActiveSyncConfig; nodeId: string; registeredAt: string }> {
  const config = await getActiveSyncConfig(syncNodeUrlOverride);
  const registration = await registerDevice(config.syncNodeUrl, {
    userId: config.userId,
    keyEpoch: config.keyEpoch,
    deviceId: config.deviceId,
    deviceName: config.deviceName,
    clientVersion: "0.1.0",
  });

  await updateSyncRegistration({
    nodeId: registration.nodeId,
    registeredAt: registration.registeredAt,
  });

  return {
    config,
    nodeId: registration.nodeId,
    registeredAt: registration.registeredAt,
  };
}

export async function pushSpecificNoteOpsToNode(
  ops: Array<Parameters<typeof encryptNoteOpToEnvelope>[0]>,
): Promise<{
  attempted: number;
  accepted: number;
  acknowledgedOpIds: string[];
}> {
  if (ops.length === 0) {
    return {
      attempted: 0,
      accepted: 0,
      acknowledgedOpIds: [],
    };
  }

  const { config, passphrase } = await getActiveSyncContext();
  const scopedOps = ops.filter(
    (op) => op.userId === config.userId && op.keyEpoch === config.keyEpoch,
  );

  if (scopedOps.length === 0) {
    return {
      attempted: ops.length,
      accepted: 0,
      acknowledgedOpIds: [],
    };
  }

  const envelopes = await Promise.all(
    scopedOps.map((op) => encryptNoteOpToEnvelope(op, config, passphrase)),
  );
  const pushResponse = await pushEnvelopes(config.syncNodeUrl, {
    userId: config.userId,
    keyEpoch: config.keyEpoch,
    deviceId: config.deviceId,
    envelopes,
  });

  const acknowledgedOpIds = scopedOps
    .filter((op, index) => pushResponse.acceptedContentHashes.includes(envelopes[index].contentHash))
    .map((op) => op.opId);

  await markNoteOpsAcknowledged(acknowledgedOpIds);

  return {
    attempted: scopedOps.length,
    accepted: acknowledgedOpIds.length,
    acknowledgedOpIds,
  };
}

export async function pushPendingNoteOpsToNode(): Promise<{ pushed: number; acknowledgedOpIds: string[] }> {
  const { config } = await registerActiveDeviceWithNode();
  const pendingOps = await listPendingPushNoteOps(config.userId, config.keyEpoch);
  const pushResult = await pushSpecificNoteOpsToNode(pendingOps);
  return {
    pushed: pushResult.attempted,
    acknowledgedOpIds: pushResult.acknowledgedOpIds,
  };
}

export async function pullAndApplyFromNode(
  syncNodeUrlOverride?: string,
): Promise<{ pulled: number; applied: number; duplicates: number; cursor: number }> {
  const { config, passphrase } = await getActiveSyncContext(syncNodeUrlOverride);
  const cursor = await getSyncCursor(config.userId, config.keyEpoch, config.syncNodeUrl);
  let afterSeq = cursor.lastPulledSeq;
  let pulled = 0;
  let applied = 0;
  let duplicates = 0;

  while (true) {
    const response = await pullEnvelopes(config.syncNodeUrl, {
      userId: config.userId,
      keyEpoch: config.keyEpoch,
      deviceId: config.deviceId,
      afterSeq,
      limit: 200,
    });

    pulled += response.items.length;

    for (const item of response.items) {
      const { op } = await decryptEnvelopeToNoteOp(item.envelope, config, passphrase);
      const result = await applyInboundNoteOp(op, "remote");
      if (result.duplicate) {
        duplicates += 1;
      } else if (result.applied) {
        applied += 1;
      }
    }

    afterSeq = response.nextAfterSeq;
    if (!response.hasMore) {
      break;
    }
  }

  await setSyncCursor(config.userId, config.keyEpoch, config.syncNodeUrl, afterSeq);

  return {
    pulled,
    applied,
    duplicates,
    cursor: afterSeq,
  };
}

export async function syncWithNode(): Promise<SyncRunResult> {
  const config = await getActiveSyncConfig();
  const health = await fetchHealth(config.syncNodeUrl);
  await registerActiveDeviceWithNode();
  const pendingOps = await listPendingPushNoteOps(config.userId, config.keyEpoch);
  await pushSpecificNoteOpsToNode(pendingOps);
  const pullResult = await pullAndApplyFromNode();
  await markLastSuccessfulSync();

  return {
    nodeId: health.nodeId,
    serverTime: health.serverTime,
    pushed: pendingOps.length,
    pulled: pullResult.pulled,
    applied: pullResult.applied,
    duplicates: pullResult.duplicates,
    cursor: pullResult.cursor,
    completedAt: new Date().toISOString(),
  };
}

export async function exportTatacSyncFile(): Promise<TatacSyncFile> {
  const passphrase = await resolveEffectiveSyncPassphrase();
  const config = await getOrCreateSyncConfig();
  const allOps = await listAllNoteOpsForUser(config.userId, config.keyEpoch);
  const items = await Promise.all(allOps.map((op) => encryptNoteOpToEnvelope(op, config, passphrase)));

  return tatacSyncFileSchema.parse({
    fileType: "tatacsync",
    version: 1,
    exportedAt: new Date().toISOString(),
    fromDeviceId: config.deviceId,
    userId: config.userId,
    keyEpoch: config.keyEpoch,
    salt: config.salt,
    items,
  });
}

export async function importTatacSyncFile(file: TatacSyncFile): Promise<ManualImportResult> {
  const passphrase = await resolveEffectiveSyncPassphrase();
  const config = await getOrCreateSyncConfig();
  const parsedFile = tatacSyncFileSchema.parse(file);

  if (parsedFile.userId !== config.userId) {
    throw new Error("The imported file belongs to a different sync group.");
  }

  if (parsedFile.keyEpoch !== config.keyEpoch) {
    throw new Error("The imported file belongs to a different sync epoch.");
  }

  if (parsedFile.salt !== config.salt) {
    throw new Error("The imported file belongs to a different sync group.");
  }

  let applied = 0;
  let duplicates = 0;

  for (const envelope of parsedFile.items) {
    const { op } = await decryptEnvelopeToNoteOp(envelope, config, passphrase);
    const result = await applyInboundNoteOp(op, "import");
    if (result.duplicate) {
      duplicates += 1;
    } else if (result.applied) {
      applied += 1;
    }
  }

  return {
    importedItems: parsedFile.items.length,
    applied,
    duplicates,
    adoptedSalt: false,
    completedAt: new Date().toISOString(),
  };
}
