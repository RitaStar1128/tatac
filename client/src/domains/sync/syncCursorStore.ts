import { syncCursorRecordSchema, type SyncCursorRecord } from "@shared/contracts";

import { tatacDb } from "@/db/tatacDb";

function nowIso(): string {
  return new Date().toISOString();
}

export function createSyncCursorId(userId: string, syncNodeUrl: string): string {
  return `${userId}::${syncNodeUrl}`;
}

export async function getSyncCursor(userId: string, syncNodeUrl: string): Promise<SyncCursorRecord> {
  const id = createSyncCursorId(userId, syncNodeUrl);
  const existing = await tatacDb.syncCursors.get(id);

  if (existing) {
    return syncCursorRecordSchema.parse(existing);
  }

  const created = syncCursorRecordSchema.parse({
    id,
    userId,
    syncNodeUrl,
    lastPulledSeq: 0,
    updatedAt: nowIso(),
  });

  await tatacDb.syncCursors.put(created);
  return created;
}

export async function setSyncCursor(userId: string, syncNodeUrl: string, lastPulledSeq: number): Promise<SyncCursorRecord> {
  const updated = syncCursorRecordSchema.parse({
    id: createSyncCursorId(userId, syncNodeUrl),
    userId,
    syncNodeUrl,
    lastPulledSeq,
    updatedAt: nowIso(),
  });

  await tatacDb.syncCursors.put(updated);
  return updated;
}
