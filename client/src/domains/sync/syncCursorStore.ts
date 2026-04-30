import { syncCursorRecordSchema, type SyncCursorRecord } from "@shared/contracts";

import { tatacDb } from "@/db/tatacDb";

function nowIso(): string {
  return new Date().toISOString();
}

export function createSyncCursorId(userId: string, keyEpoch: number, syncNodeUrl: string): string {
  return `${userId}::${keyEpoch}::${syncNodeUrl}`;
}

export async function getSyncCursor(
  userId: string,
  keyEpoch: number,
  syncNodeUrl: string,
): Promise<SyncCursorRecord> {
  const id = createSyncCursorId(userId, keyEpoch, syncNodeUrl);
  const existing = await tatacDb.syncCursors.get(id);

  if (existing) {
    return syncCursorRecordSchema.parse(existing);
  }

  const created = syncCursorRecordSchema.parse({
    id,
    userId,
    keyEpoch,
    syncNodeUrl,
    lastPulledSeq: 0,
    updatedAt: nowIso(),
  });

  await tatacDb.syncCursors.put(created);
  return created;
}

export async function setSyncCursor(
  userId: string,
  keyEpoch: number,
  syncNodeUrl: string,
  lastPulledSeq: number,
): Promise<SyncCursorRecord> {
  const updated = syncCursorRecordSchema.parse({
    id: createSyncCursorId(userId, keyEpoch, syncNodeUrl),
    userId,
    keyEpoch,
    syncNodeUrl,
    lastPulledSeq,
    updatedAt: nowIso(),
  });

  await tatacDb.syncCursors.put(updated);
  return updated;
}

export async function clearAllSyncCursors(): Promise<void> {
  await tatacDb.syncCursors.clear();
}
