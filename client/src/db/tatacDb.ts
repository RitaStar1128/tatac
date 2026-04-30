import Dexie, { type Table } from "dexie";

import {
  type IsoDateTimeString,
  type NoteOp,
  type NoteRecord,
  type PersistedSyncConfig,
  type PersistedSyncSecret,
  type SyncCursorRecord,
} from "@shared/contracts";

export type StoredNoteOpOrigin = "local" | "remote" | "import";

export interface StoredNoteRecord extends NoteRecord {}

export interface StoredNoteOp extends NoteOp {
  recordedAt: IsoDateTimeString;
  origin: StoredNoteOpOrigin;
  lastPushedAt?: IsoDateTimeString;
  acknowledgedAt?: IsoDateTimeString;
}

export interface PersistedSyncConfigRecord extends PersistedSyncConfig {}

export interface PersistedSyncSecretRecord extends PersistedSyncSecret {}

export interface SyncCursorEntity extends SyncCursorRecord {}

export class TatacDb extends Dexie {
  notes!: Table<StoredNoteRecord, string>;
  noteOps!: Table<StoredNoteOp, string>;
  syncConfig!: Table<PersistedSyncConfigRecord, "active">;
  syncSecrets!: Table<PersistedSyncSecretRecord, "active">;
  syncCursors!: Table<SyncCursorEntity, string>;

  constructor() {
    super("tatac");

    this.version(1).stores({
      notes: "&id, updatedAt, deletedAt, version, lastOpId",
      noteOps:
        "&opId, noteId, userId, deviceId, logicalTime, wallClock, origin, acknowledgedAt, [userId+noteId], [userId+logicalTime], [deviceId+logicalTime]",
      syncConfig: "&id, userId, syncNodeUrl, updatedAt",
      syncCursors: "&id, userId, syncNodeUrl, lastPulledSeq, updatedAt",
    });

    this.version(2).stores({
      notes: "&id, updatedAt, deletedAt, version, lastOpId",
      noteOps:
        "&opId, noteId, userId, deviceId, logicalTime, wallClock, origin, acknowledgedAt, [userId+noteId], [userId+logicalTime], [deviceId+logicalTime]",
      syncConfig: "&id, userId, syncNodeUrl, updatedAt",
      syncSecrets: "&configId, persistedAt, origin",
      syncCursors: "&id, userId, syncNodeUrl, lastPulledSeq, updatedAt",
    });
  }
}

export const tatacDb = new TatacDb();
