import type { NoteOp, NoteRecord } from "@shared/contracts";

import { deriveNoteTitle } from "./noteText";

function nextVersion(currentRecord: NoteRecord | null, op: NoteOp): number {
  return currentRecord ? currentRecord.version + 1 : Math.max(1, op.baseVersion + 1);
}

export function projectNoteRecord(currentRecord: NoteRecord | null, op: NoteOp): NoteRecord {
  const version = nextVersion(currentRecord, op);

  switch (op.payload.type) {
    case "note.create":
      return {
        id: op.noteId,
        title: op.payload.title || deriveNoteTitle(op.payload.body),
        body: op.payload.body,
        createdAt: op.payload.createdAt,
        updatedAt: op.payload.updatedAt,
        deletedAt: null,
        version,
        lastOpId: op.opId,
      };

    case "note.update": {
      const baseRecord = currentRecord ?? {
        id: op.noteId,
        title: op.payload.title ?? "",
        body: op.payload.body ?? "",
        createdAt: op.wallClock,
        updatedAt: op.payload.updatedAt,
        deletedAt: null,
        version: 0,
        lastOpId: op.opId,
      };
      const nextBody = op.payload.body ?? baseRecord.body;
      const nextTitle = op.payload.title ?? deriveNoteTitle(nextBody);

      return {
        ...baseRecord,
        title: nextTitle,
        body: nextBody,
        updatedAt: op.payload.updatedAt,
        deletedAt: null,
        version,
        lastOpId: op.opId,
      };
    }

    case "note.delete": {
      const baseRecord = currentRecord ?? {
        id: op.noteId,
        title: "",
        body: "",
        createdAt: op.wallClock,
        updatedAt: op.payload.deletedAt,
        deletedAt: null,
        version: 0,
        lastOpId: op.opId,
      };

      return {
        ...baseRecord,
        updatedAt: op.payload.deletedAt,
        deletedAt: op.payload.deletedAt,
        version,
        lastOpId: op.opId,
      };
    }
  }
}
