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
import { getSyncSessionSecret } from "./sessionSecretStore";
import { getSyncCursor, setSyncCursor } from "./syncCursorStore";
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

function requirePassphrase(): string {
  const secret = getSyncSessionSecret();
  if (!secret?.passphrase) {
    throw new Error("A sync passphrase is required for encryption and decryption.");
  }
  return secret.passphrase;
}

async function getActiveSyncConfig(): Promise<ActiveSyncConfig> {
  const config = await getOrCreateSyncConfig();
  if (!config.syncNodeUrl) {
    throw new Error("Sync node URL is not configured.");
  }
  return {
    ...config,
    syncNodeUrl: config.syncNodeUrl,
  };
}

export async function checkSyncNodeHealth(): Promise<{ nodeId: string; serverTime: string }> {
  const config = await getActiveSyncConfig();
  const health = await fetchHealth(config.syncNodeUrl);
  return {
    nodeId: health.nodeId,
    serverTime: health.serverTime,
  };
}

export async function syncWithNode(): Promise<SyncRunResult> {
  const passphrase = requirePassphrase();
  const config = await getActiveSyncConfig();
  const health = await fetchHealth(config.syncNodeUrl);
  const registration = await registerDevice(config.syncNodeUrl, {
    userId: config.userId,
    deviceId: config.deviceId,
    deviceName: config.deviceName,
    clientVersion: "0.1.0",
  });

  await updateSyncRegistration({
    nodeId: registration.nodeId,
    registeredAt: registration.registeredAt,
  });

  const pendingOps = await listPendingPushNoteOps(config.userId);
  if (pendingOps.length > 0) {
    const envelopes = await Promise.all(
      pendingOps.map((op) => encryptNoteOpToEnvelope(op, config, passphrase)),
    );
    const pushResponse = await pushEnvelopes(config.syncNodeUrl, {
      userId: config.userId,
      deviceId: config.deviceId,
      envelopes,
    });

    await markNoteOpsAcknowledged(pendingOps.slice(0, pushResponse.accepted).map((op) => op.opId));
  }

  const cursor = await getSyncCursor(config.userId, config.syncNodeUrl);
  let afterSeq = cursor.lastPulledSeq;
  let pulled = 0;
  let applied = 0;
  let duplicates = 0;

  while (true) {
    const response = await pullEnvelopes(config.syncNodeUrl, {
      userId: config.userId,
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

  await setSyncCursor(config.userId, config.syncNodeUrl, afterSeq);
  await markLastSuccessfulSync();

  return {
    nodeId: health.nodeId,
    serverTime: health.serverTime,
    pushed: pendingOps.length,
    pulled,
    applied,
    duplicates,
    cursor: afterSeq,
    completedAt: new Date().toISOString(),
  };
}

export async function exportTatacSyncFile(): Promise<TatacSyncFile> {
  const passphrase = requirePassphrase();
  const config = await getOrCreateSyncConfig();
  const allOps = await listAllNoteOpsForUser(config.userId);
  const items = await Promise.all(allOps.map((op) => encryptNoteOpToEnvelope(op, config, passphrase)));

  return tatacSyncFileSchema.parse({
    fileType: "tatacsync",
    version: 1,
    exportedAt: new Date().toISOString(),
    fromDeviceId: config.deviceId,
    userId: config.userId,
    salt: config.salt,
    items,
  });
}

export async function importTatacSyncFile(file: TatacSyncFile): Promise<ManualImportResult> {
  const passphrase = requirePassphrase();
  const config = await getOrCreateSyncConfig();
  const parsedFile = tatacSyncFileSchema.parse(file);

  if (parsedFile.userId !== config.userId) {
    throw new Error("The imported file belongs to a different sync group.");
  }

  const decryptConfig =
    parsedFile.salt === config.salt
      ? config
      : {
          ...config,
          salt: parsedFile.salt,
        };

  let applied = 0;
  let duplicates = 0;

  for (const envelope of parsedFile.items) {
    const { op } = await decryptEnvelopeToNoteOp(envelope, decryptConfig, passphrase);
    const result = await applyInboundNoteOp(op, "import");
    if (result.duplicate) {
      duplicates += 1;
    } else if (result.applied) {
      applied += 1;
    }
  }

  const adoptedSalt = parsedFile.salt !== config.salt;
  if (adoptedSalt) {
    await saveSyncSettingsDraft({
      userId: config.userId,
      deviceName: config.deviceName,
      syncNodeUrl: config.syncNodeUrl,
      salt: parsedFile.salt,
    });
  }

  return {
    importedItems: parsedFile.items.length,
    applied,
    duplicates,
    adoptedSalt,
    completedAt: new Date().toISOString(),
  };
}
