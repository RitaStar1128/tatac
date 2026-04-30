import Dexie from "dexie";
import type { NoteOp, NoteRecord } from "@shared/contracts";

import { tatacDb, type StoredNoteOp, type StoredNoteRecord } from "@/db/tatacDb";
import { resolveNoteConflict } from "@/domains/sync/conflictResolver";
import { getOrCreateSyncConfig } from "@/domains/sync/syncSettingsStore";
import { clearStoredRecords, getStoredRecords, type MemoRecord } from "@/lib/recordsStorage";

import { projectNoteRecord } from "./noteProjection";
import { deriveNoteTitle, normalizeNoteBody } from "./noteText";

let initializationPromise: Promise<void> | null = null;

export interface NotesSnapshot {
  activeNotes: StoredNoteRecord[];
  tombstoneCount: number;
  opCount: number;
}

export interface ManualSyncPreview {
  mode: "dummy-preview";
  exportedAt: string;
  userId: string;
  fromDeviceId: string;
  activeNoteCount: number;
  tombstoneCount: number;
  opCount: number;
}

export interface AppliedNoteOpResult {
  opId: string;
  stored: boolean;
  applied: boolean;
  duplicate: boolean;
  note: StoredNoteRecord | null;
  reason: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function toStoredNoteOp(
  op: NoteOp,
  origin: StoredNoteOp["origin"],
  acknowledgementMode: "pending" | "known-by-node" = "pending",
): StoredNoteOp {
  const recordedAt = nowIso();
  return {
    ...op,
    recordedAt,
    origin,
    acknowledgedAt: acknowledgementMode === "known-by-node" ? recordedAt : undefined,
  };
}

function sortNotes(notes: StoredNoteRecord[]): StoredNoteRecord[] {
  return [...notes].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

async function getCurrentLogicalTimeForRecord(record: NoteRecord | null): Promise<number | null> {
  if (!record?.lastOpId) return null;
  const lastOp = await tatacDb.noteOps.get(record.lastOpId);
  return lastOp?.logicalTime ?? null;
}

async function getNextLogicalTime(deviceId: string): Promise<number> {
  const lastOp = await tatacDb.noteOps
    .where("[deviceId+logicalTime]")
    .between([deviceId, Dexie.minKey], [deviceId, Dexie.maxKey])
    .last();

  return (lastOp?.logicalTime ?? 0) + 1;
}

function buildCreateOp(params: {
  body: string;
  deviceId: string;
  userId: string;
}): NoteOp {
  const timestamp = nowIso();
  const noteId = crypto.randomUUID();
  return {
    opId: crypto.randomUUID(),
    deviceId: params.deviceId,
    userId: params.userId,
    noteId,
    baseVersion: 0,
    logicalTime: 0,
    wallClock: timestamp,
    payload: {
      type: "note.create",
      title: deriveNoteTitle(params.body),
      body: params.body,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  };
}

function buildUpdateOp(params: {
  currentRecord: StoredNoteRecord;
  body: string;
  deviceId: string;
  userId: string;
}): NoteOp {
  const timestamp = nowIso();
  return {
    opId: crypto.randomUUID(),
    deviceId: params.deviceId,
    userId: params.userId,
    noteId: params.currentRecord.id,
    baseVersion: params.currentRecord.version,
    logicalTime: 0,
    wallClock: timestamp,
    payload: {
      type: "note.update",
      title: deriveNoteTitle(params.body),
      body: params.body,
      updatedAt: timestamp,
    },
  };
}

function buildDeleteOp(params: {
  currentRecord: StoredNoteRecord;
  deviceId: string;
  userId: string;
}): NoteOp {
  const timestamp = nowIso();
  return {
    opId: crypto.randomUUID(),
    deviceId: params.deviceId,
    userId: params.userId,
    noteId: params.currentRecord.id,
    baseVersion: params.currentRecord.version,
    logicalTime: 0,
    wallClock: timestamp,
    payload: {
      type: "note.delete",
      deletedAt: timestamp,
    },
  };
}

async function writeNoteOp(
  op: NoteOp,
  currentRecord: StoredNoteRecord | null,
  origin: StoredNoteOp["origin"],
): Promise<AppliedNoteOpResult> {
  const hasSeenOpId = (await tatacDb.noteOps.get(op.opId)) !== undefined;
  const currentLogicalTime = await getCurrentLogicalTimeForRecord(currentRecord);
  const incomingRecord = projectNoteRecord(currentRecord, op);
  const resolution = resolveNoteConflict({
    currentRecord,
    currentLogicalTime,
    incomingRecord,
    incomingOp: op,
    hasSeenOpId,
  });

  if (resolution.decision === "ignoreDuplicate") {
    return {
      opId: op.opId,
      stored: false,
      applied: false,
      duplicate: true,
      note: currentRecord,
      reason: resolution.reason,
    };
  }

  const storedOp = toStoredNoteOp(op, origin, origin === "remote" ? "known-by-node" : "pending");
  await tatacDb.noteOps.put(storedOp);

  if (resolution.decision === "applyIncoming" && resolution.nextRecord) {
    await tatacDb.notes.put(resolution.nextRecord);
    return {
      opId: op.opId,
      stored: true,
      applied: true,
      duplicate: false,
      note: resolution.nextRecord,
      reason: resolution.reason,
    };
  }

  return {
    opId: op.opId,
    stored: true,
    applied: false,
    duplicate: false,
    note: currentRecord,
    reason: resolution.reason,
  };
}

async function migrateLegacyLocalStorageRecords(): Promise<void> {
  const [noteCount, opCount] = await Promise.all([tatacDb.notes.count(), tatacDb.noteOps.count()]);
  if (noteCount > 0 || opCount > 0) return;

  const legacyRecords = getStoredRecords();
  if (legacyRecords.length === 0) return;

  const config = await getOrCreateSyncConfig();
  const sortedLegacy = [...legacyRecords].sort((left, right) => left.date.localeCompare(right.date));

  await tatacDb.transaction("rw", tatacDb.notes, tatacDb.noteOps, async () => {
    let logicalTime = await getNextLogicalTime(config.deviceId);

    for (const legacyRecord of sortedLegacy) {
      const note = legacyRecordToNoteRecord(legacyRecord, config.deviceId, config.userId, logicalTime);
      logicalTime += 1;
      await tatacDb.noteOps.put(note.storedOp);
      await tatacDb.notes.put(note.record);
    }
  });

  clearStoredRecords();
}

function legacyRecordToNoteRecord(
  legacyRecord: MemoRecord,
  deviceId: string,
  userId: string,
  logicalTime: number,
): {
  storedOp: StoredNoteOp;
  record: StoredNoteRecord;
} {
  const body = normalizeNoteBody(legacyRecord.text);
  const createdAt = legacyRecord.date;
  const updatedAt = legacyRecord.updatedAt ?? legacyRecord.date;
  const opId = crypto.randomUUID();

  const op: NoteOp = {
    opId,
    deviceId,
    userId,
    noteId: legacyRecord.id,
    baseVersion: 0,
    logicalTime,
    wallClock: updatedAt,
    payload: {
      type: "note.create",
      title: deriveNoteTitle(body),
      body,
      createdAt,
      updatedAt,
    },
  };

  return {
    storedOp: {
      ...op,
      recordedAt: updatedAt,
      origin: "local",
    },
    record: {
      id: legacyRecord.id,
      title: deriveNoteTitle(body),
      body,
      createdAt,
      updatedAt,
      deletedAt: null,
      version: 1,
      lastOpId: opId,
    },
  };
}

export async function ensureOfflineStoreReady(): Promise<void> {
  if (!initializationPromise) {
    initializationPromise = (async () => {
      await getOrCreateSyncConfig();
      await migrateLegacyLocalStorageRecords();
    })();
  }

  return initializationPromise;
}

export async function listActiveNotes(): Promise<StoredNoteRecord[]> {
  await ensureOfflineStoreReady();
  const notes = await tatacDb.notes.toArray();
  return sortNotes(notes.filter((note) => note.deletedAt === null));
}

export async function getNotesSnapshot(): Promise<NotesSnapshot> {
  await ensureOfflineStoreReady();
  const [notes, opCount] = await Promise.all([tatacDb.notes.toArray(), tatacDb.noteOps.count()]);
  const activeNotes = sortNotes(notes.filter((note) => note.deletedAt === null));
  const tombstoneCount = notes.filter((note) => note.deletedAt !== null).length;

  return {
    activeNotes,
    tombstoneCount,
    opCount,
  };
}

export async function getNoteById(noteId: string): Promise<StoredNoteRecord | null> {
  await ensureOfflineStoreReady();
  return (await tatacDb.notes.get(noteId)) ?? null;
}

export async function createNote(bodyInput: string): Promise<StoredNoteRecord> {
  await ensureOfflineStoreReady();
  const body = normalizeNoteBody(bodyInput);
  if (!body) {
    throw new Error("Cannot create an empty note.");
  }

  return tatacDb.transaction("rw", tatacDb.notes, tatacDb.noteOps, tatacDb.syncConfig, async () => {
    const config = await getOrCreateSyncConfig();
    const op = buildCreateOp({
      body,
      deviceId: config.deviceId,
      userId: config.userId,
    });
    op.logicalTime = await getNextLogicalTime(config.deviceId);
    const result = await writeNoteOp(op, null, "local");
    if (!result.note) {
      throw new Error("Create note operation failed.");
    }
    return result.note;
  });
}

export async function updateNote(noteId: string, bodyInput: string): Promise<StoredNoteRecord> {
  await ensureOfflineStoreReady();
  const currentRecord = await tatacDb.notes.get(noteId);
  if (!currentRecord || currentRecord.deletedAt !== null) {
    throw new Error("Note not found.");
  }

  const body = normalizeNoteBody(bodyInput);
  if (!body) {
    throw new Error("Cannot save an empty note.");
  }

  return tatacDb.transaction("rw", tatacDb.notes, tatacDb.noteOps, tatacDb.syncConfig, async () => {
    const config = await getOrCreateSyncConfig();
    const op = buildUpdateOp({
      currentRecord,
      body,
      deviceId: config.deviceId,
      userId: config.userId,
    });
    op.logicalTime = await getNextLogicalTime(config.deviceId);
    const result = await writeNoteOp(op, currentRecord, "local");
    if (!result.note) {
      throw new Error("Update note operation failed.");
    }
    return result.note;
  });
}

export async function deleteNote(noteId: string): Promise<StoredNoteRecord> {
  await ensureOfflineStoreReady();
  const currentRecord = await tatacDb.notes.get(noteId);
  if (!currentRecord || currentRecord.deletedAt !== null) {
    throw new Error("Note not found.");
  }

  return tatacDb.transaction("rw", tatacDb.notes, tatacDb.noteOps, tatacDb.syncConfig, async () => {
    const config = await getOrCreateSyncConfig();
    const op = buildDeleteOp({
      currentRecord,
      deviceId: config.deviceId,
      userId: config.userId,
    });
    op.logicalTime = await getNextLogicalTime(config.deviceId);
    const result = await writeNoteOp(op, currentRecord, "local");
    if (!result.note) {
      throw new Error("Delete note operation failed.");
    }
    return result.note;
  });
}

export async function applyInboundNoteOp(
  op: NoteOp,
  origin: Extract<StoredNoteOp["origin"], "remote" | "import">,
): Promise<AppliedNoteOpResult> {
  await ensureOfflineStoreReady();
  const currentRecord = (await tatacDb.notes.get(op.noteId)) ?? null;

  return tatacDb.transaction("rw", tatacDb.notes, tatacDb.noteOps, async () =>
    writeNoteOp(op, currentRecord, origin),
  );
}

export async function listAllNoteOpsForUser(userId: string): Promise<StoredNoteOp[]> {
  await ensureOfflineStoreReady();
  const items = await tatacDb.noteOps
    .where("[userId+logicalTime]")
    .between([userId, Dexie.minKey], [userId, Dexie.maxKey])
    .toArray();

  return items.sort((left, right) => left.logicalTime - right.logicalTime);
}

export async function listPendingPushNoteOps(userId: string): Promise<StoredNoteOp[]> {
  const items = await listAllNoteOpsForUser(userId);
  return items.filter((item) => item.acknowledgedAt === undefined);
}

export async function markNoteOpsAcknowledged(opIds: string[]): Promise<void> {
  if (opIds.length === 0) return;
  const acknowledgedAt = nowIso();

  await tatacDb.transaction("rw", tatacDb.noteOps, async () => {
    for (const opId of opIds) {
      const current = await tatacDb.noteOps.get(opId);
      if (!current) continue;
      await tatacDb.noteOps.put({
        ...current,
        lastPushedAt: acknowledgedAt,
        acknowledgedAt,
      });
    }
  });
}

export async function buildManualSyncPreview(): Promise<ManualSyncPreview> {
  await ensureOfflineStoreReady();
  const [snapshot, config] = await Promise.all([getNotesSnapshot(), getOrCreateSyncConfig()]);

  return {
    mode: "dummy-preview",
    exportedAt: nowIso(),
    userId: config.userId,
    fromDeviceId: config.deviceId,
    activeNoteCount: snapshot.activeNotes.length,
    tombstoneCount: snapshot.tombstoneCount,
    opCount: snapshot.opCount,
  };
}
