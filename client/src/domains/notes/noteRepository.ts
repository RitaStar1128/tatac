import Dexie from "dexie";
import type { NoteOp, NoteRecord } from "@shared/contracts";

import { tatacDb, type StoredNoteOp, type StoredNoteRecord } from "@/db/tatacDb";
import { resolveNoteConflict } from "@/domains/sync/conflictResolver";
import { getOrCreateSyncConfig } from "@/domains/sync/syncSettingsStore";
import { clearStoredRecords, getStoredRecords, type MemoRecord } from "@/lib/recordsStorage";

import { projectNoteRecord } from "./noteProjection";
import { deriveNoteTitle, normalizeNoteBody } from "./noteText";

let initializationPromise: Promise<void> | null = null;
const localNoteOpListeners = new Set<(op: NoteOp) => void>();
const notesChangedListeners = new Set<() => void>();

export interface NotesSnapshot {
  activeNotes: StoredNoteRecord[];
  tombstoneCount: number;
  opCount: number;
}

export interface LocalSyncDataSummary {
  noteCount: number;
  opCount: number;
  groupIds: string[];
  hasData: boolean;
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

function notifyLocalNoteOp(op: NoteOp): void {
  for (const listener of Array.from(localNoteOpListeners)) {
    try {
      listener(op);
    } catch (error) {
      console.error("Local note op listener failed", error);
    }
  }
}

function notifyNotesChanged(): void {
  for (const listener of Array.from(notesChangedListeners)) {
    try {
      listener();
    } catch (error) {
      console.error("Notes changed listener failed", error);
    }
  }
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

function isRecordInGroup(record: StoredNoteRecord | NoteRecord, groupId: string): boolean {
  return record.groupId === groupId;
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
  keyEpoch: number;
}): NoteOp {
  const timestamp = nowIso();
  const noteId = crypto.randomUUID();
  return {
    opId: crypto.randomUUID(),
    deviceId: params.deviceId,
    userId: params.userId,
    keyEpoch: params.keyEpoch,
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
  keyEpoch: number;
}): NoteOp {
  const timestamp = nowIso();
  return {
    opId: crypto.randomUUID(),
    deviceId: params.deviceId,
    userId: params.userId,
    keyEpoch: params.keyEpoch,
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
  keyEpoch: number;
}): NoteOp {
  const timestamp = nowIso();
  return {
    opId: crypto.randomUUID(),
    deviceId: params.deviceId,
    userId: params.userId,
    keyEpoch: params.keyEpoch,
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
    keyEpoch: 1,
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
      groupId: userId,
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
  const config = await getOrCreateSyncConfig();
  const notes = await tatacDb.notes.where("groupId").equals(config.userId).toArray();
  return sortNotes(notes.filter((note) => note.deletedAt === null));
}

export async function getNotesSnapshot(): Promise<NotesSnapshot> {
  await ensureOfflineStoreReady();
  const config = await getOrCreateSyncConfig();
  const [notes, ops] = await Promise.all([
    tatacDb.notes.where("groupId").equals(config.userId).toArray(),
    listAllNoteOpsForUser(config.userId, config.keyEpoch),
  ]);
  const activeNotes = sortNotes(notes.filter((note) => note.deletedAt === null));
  const tombstoneCount = notes.filter((note) => note.deletedAt !== null).length;

  return {
    activeNotes,
    tombstoneCount,
    opCount: ops.length,
  };
}

export async function getNoteById(noteId: string): Promise<StoredNoteRecord | null> {
  await ensureOfflineStoreReady();
  const [config, record] = await Promise.all([getOrCreateSyncConfig(), tatacDb.notes.get(noteId)]);
  if (!record || !isRecordInGroup(record, config.userId)) {
    return null;
  }
  return record;
}

export async function createNote(bodyInput: string): Promise<StoredNoteRecord> {
  await ensureOfflineStoreReady();
  const body = normalizeNoteBody(bodyInput);
  if (!body) {
    throw new Error("Cannot create an empty note.");
  }

  let createdOp: NoteOp | null = null;
  const note = await tatacDb.transaction("rw", tatacDb.notes, tatacDb.noteOps, tatacDb.syncConfig, async () => {
    const config = await getOrCreateSyncConfig();
    const op = buildCreateOp({
      body,
      deviceId: config.deviceId,
      userId: config.userId,
      keyEpoch: config.keyEpoch,
    });
    op.logicalTime = await getNextLogicalTime(config.deviceId);
    const result = await writeNoteOp(op, null, "local");
    if (!result.note) {
      throw new Error("Create note operation failed.");
    }
    createdOp = op;
    return result.note;
  });

  if (createdOp) {
    notifyLocalNoteOp(createdOp);
  }
  notifyNotesChanged();

  return note;
}

export async function updateNote(noteId: string, bodyInput: string): Promise<StoredNoteRecord> {
  await ensureOfflineStoreReady();
  const config = await getOrCreateSyncConfig();
  const currentRecord = await tatacDb.notes.get(noteId);
  if (!currentRecord || currentRecord.deletedAt !== null || !isRecordInGroup(currentRecord, config.userId)) {
    throw new Error("Note not found.");
  }

  const body = normalizeNoteBody(bodyInput);
  if (!body) {
    throw new Error("Cannot save an empty note.");
  }

  let updatedOp: NoteOp | null = null;
  const note = await tatacDb.transaction("rw", tatacDb.notes, tatacDb.noteOps, tatacDb.syncConfig, async () => {
    const op = buildUpdateOp({
      currentRecord,
      body,
      deviceId: config.deviceId,
      userId: config.userId,
      keyEpoch: config.keyEpoch,
    });
    op.logicalTime = await getNextLogicalTime(config.deviceId);
    const result = await writeNoteOp(op, currentRecord, "local");
    if (!result.note) {
      throw new Error("Update note operation failed.");
    }
    updatedOp = op;
    return result.note;
  });

  if (updatedOp) {
    notifyLocalNoteOp(updatedOp);
  }
  notifyNotesChanged();

  return note;
}

export async function deleteNote(noteId: string): Promise<StoredNoteRecord> {
  await ensureOfflineStoreReady();
  const config = await getOrCreateSyncConfig();
  const currentRecord = await tatacDb.notes.get(noteId);
  if (!currentRecord || currentRecord.deletedAt !== null || !isRecordInGroup(currentRecord, config.userId)) {
    throw new Error("Note not found.");
  }

  let deletedOp: NoteOp | null = null;
  const note = await tatacDb.transaction("rw", tatacDb.notes, tatacDb.noteOps, tatacDb.syncConfig, async () => {
    const op = buildDeleteOp({
      currentRecord,
      deviceId: config.deviceId,
      userId: config.userId,
      keyEpoch: config.keyEpoch,
    });
    op.logicalTime = await getNextLogicalTime(config.deviceId);
    const result = await writeNoteOp(op, currentRecord, "local");
    if (!result.note) {
      throw new Error("Delete note operation failed.");
    }
    deletedOp = op;
    return result.note;
  });

  if (deletedOp) {
    notifyLocalNoteOp(deletedOp);
  }
  notifyNotesChanged();

  return note;
}

export async function applyInboundNoteOp(
  op: NoteOp,
  origin: Extract<StoredNoteOp["origin"], "remote" | "import">,
): Promise<AppliedNoteOpResult> {
  await ensureOfflineStoreReady();
  const storedRecord = (await tatacDb.notes.get(op.noteId)) ?? null;
  const currentRecord =
    storedRecord && isRecordInGroup(storedRecord, op.userId) ? storedRecord : null;

  const result = await tatacDb.transaction("rw", tatacDb.notes, tatacDb.noteOps, async () =>
    writeNoteOp(op, currentRecord, origin),
  );
  notifyNotesChanged();
  return result;
}

export async function listAllNoteOpsForUser(userId: string, keyEpoch: number): Promise<StoredNoteOp[]> {
  await ensureOfflineStoreReady();
  const items = await tatacDb.noteOps
    .where("[userId+keyEpoch+logicalTime]")
    .between([userId, keyEpoch, Dexie.minKey], [userId, keyEpoch, Dexie.maxKey])
    .toArray();

  return items.sort((left, right) => left.logicalTime - right.logicalTime);
}

export async function listPendingPushNoteOps(userId: string, keyEpoch: number): Promise<StoredNoteOp[]> {
  const items = await listAllNoteOpsForUser(userId, keyEpoch);
  return items.filter((item) => item.acknowledgedAt === undefined);
}

export async function hasPendingPushNoteOps(userId: string, keyEpoch: number): Promise<boolean> {
  const items = await listPendingPushNoteOps(userId, keyEpoch);
  return items.length > 0;
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

export async function getLocalSyncDataSummary(): Promise<LocalSyncDataSummary> {
  await ensureOfflineStoreReady();
  const [notes, ops] = await Promise.all([tatacDb.notes.toArray(), tatacDb.noteOps.toArray()]);
  const groupIds = new Set<string>();

  for (const note of notes) {
    if (note.groupId) {
      groupIds.add(note.groupId);
    }
  }

  for (const op of ops) {
    if (op.userId) {
      groupIds.add(op.userId);
    }
  }

  return {
    noteCount: notes.length,
    opCount: ops.length,
    groupIds: Array.from(groupIds).sort(),
    hasData: notes.length > 0 || ops.length > 0,
  };
}

export async function clearLocalNotesAndOps(): Promise<void> {
  await ensureOfflineStoreReady();
  await tatacDb.transaction("rw", tatacDb.notes, tatacDb.noteOps, async () => {
    await tatacDb.notes.clear();
    await tatacDb.noteOps.clear();
  });
  clearStoredRecords();
  notifyNotesChanged();
}

export function subscribeToLocalNoteOps(listener: (op: NoteOp) => void): () => void {
  localNoteOpListeners.add(listener);
  return () => {
    localNoteOpListeners.delete(listener);
  };
}

export function subscribeToNotesChanged(listener: () => void): () => void {
  notesChangedListeners.add(listener);
  return () => {
    notesChangedListeners.delete(listener);
  };
}
