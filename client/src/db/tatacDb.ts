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

    this.version(3)
      .stores({
        notes: "&id, groupId, [groupId+updatedAt], [groupId+deletedAt], updatedAt, deletedAt, version, lastOpId",
        noteOps:
          "&opId, noteId, userId, deviceId, logicalTime, wallClock, origin, acknowledgedAt, [userId+noteId], [userId+logicalTime], [deviceId+logicalTime]",
        syncConfig: "&id, userId, syncNodeUrl, updatedAt",
        syncSecrets: "&configId, persistedAt, origin",
        syncCursors: "&id, userId, syncNodeUrl, lastPulledSeq, updatedAt",
      })
      .upgrade(async (tx) => {
        const syncConfigTable = tx.table<PersistedSyncConfigRecord, "active">("syncConfig");
        const notesTable = tx.table<StoredNoteRecord, string>("notes");
        const activeConfig = await syncConfigTable.get("active");
        const fallbackGroupId = activeConfig?.userId;

        if (!fallbackGroupId) {
          return;
        }

        await notesTable.toCollection().modify((note) => {
          if (!note.groupId) {
            note.groupId = fallbackGroupId;
          }
        });
      });

    this.version(4)
      .stores({
        notes: "&id, groupId, [groupId+updatedAt], [groupId+deletedAt], updatedAt, deletedAt, version, lastOpId",
        noteOps:
          "&opId, noteId, userId, keyEpoch, deviceId, logicalTime, wallClock, origin, acknowledgedAt, [userId+noteId], [userId+keyEpoch+logicalTime], [userId+keyEpoch+noteId], [deviceId+logicalTime]",
        syncConfig: "&id, userId, keyEpoch, syncNodeUrl, updatedAt",
        syncSecrets: "&configId, persistedAt, origin",
        syncCursors: "&id, userId, keyEpoch, syncNodeUrl, lastPulledSeq, updatedAt",
      })
      .upgrade(async (tx) => {
        const syncConfigTable = tx.table<PersistedSyncConfigRecord, "active">("syncConfig");
        const noteOpsTable = tx.table<StoredNoteOp, string>("noteOps");
        const syncCursorsTable = tx.table<SyncCursorEntity, string>("syncCursors");
        const activeConfig = await syncConfigTable.get("active");
        const fallbackKeyEpoch = activeConfig?.keyEpoch ?? 1;

        await syncConfigTable.toCollection().modify((config) => {
          if (!config.keyEpoch || config.keyEpoch < 1) {
            config.keyEpoch = fallbackKeyEpoch;
          }
        });

        await noteOpsTable.toCollection().modify((noteOp) => {
          if (!noteOp.keyEpoch || noteOp.keyEpoch < 1) {
            noteOp.keyEpoch = fallbackKeyEpoch;
          }
        });

        await syncCursorsTable.toCollection().modify((cursor) => {
          if (!cursor.keyEpoch || cursor.keyEpoch < 1) {
            cursor.keyEpoch = fallbackKeyEpoch;
            cursor.id = `${cursor.userId}::${cursor.keyEpoch}::${cursor.syncNodeUrl}`;
          }
        });
      });

    this.version(5)
      .stores({
        notes: "&id, groupId, [groupId+updatedAt], [groupId+deletedAt], updatedAt, deletedAt, version, lastOpId",
        noteOps:
          "&opId, noteId, userId, keyEpoch, deviceId, logicalTime, wallClock, origin, acknowledgedAt, [userId+noteId], [userId+keyEpoch+logicalTime], [userId+keyEpoch+noteId], [deviceId+logicalTime]",
        syncConfig: "&id, userId, keyEpoch, transportMode, lanSyncEnabled, syncNodeUrl, updatedAt",
        syncSecrets: "&configId, persistedAt, origin",
        syncCursors: "&id, userId, keyEpoch, syncNodeUrl, lastPulledSeq, updatedAt",
      })
      .upgrade(async (tx) => {
        const syncConfigTable = tx.table<PersistedSyncConfigRecord, "active">("syncConfig");
        await syncConfigTable.toCollection().modify((config) => {
          if (!config.transportMode) {
            config.transportMode = "relay-only";
          }
          if (typeof config.lanSyncEnabled !== "boolean") {
            config.lanSyncEnabled = false;
          }
        });
      });
  }
}

export const tatacDb = new TatacDb();
