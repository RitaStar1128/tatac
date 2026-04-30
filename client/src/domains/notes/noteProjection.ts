import type { NoteOp, NoteRecord } from "@shared/contracts";

import { deriveNoteTitle } from "./noteText";

function nextVersion(currentRecord: NoteRecord | null, op: NoteOp): number {
  return currentRecord ? currentRecord.version + 1 : Math.max(1, op.baseVersion + 1);
}

export function projectNoteRecord(currentRecord: NoteRecord | null, op: NoteOp): NoteRecord | null {
  switch (op.payload.type) {
    case "note.create":
      return {
        id: op.noteId,
        groupId: op.userId,
        title: op.payload.title || deriveNoteTitle(op.payload.body),
        body: op.payload.body,
        createdAt: op.payload.createdAt,
        updatedAt: op.payload.updatedAt,
        deletedAt: null,
        version: nextVersion(currentRecord, op),
        lastOpId: op.opId,
      };

    case "note.update": {
      if (!currentRecord) {
        return null;
      }

      const version = nextVersion(currentRecord, op);
      const nextBody = op.payload.body ?? currentRecord.body;
      const nextTitle = op.payload.title ?? deriveNoteTitle(nextBody);

      return {
        ...currentRecord,
        title: nextTitle,
        body: nextBody,
        updatedAt: op.payload.updatedAt,
        deletedAt: null,
        version,
        lastOpId: op.opId,
      };
    }

    case "note.delete": {
      if (!currentRecord) {
        return null;
      }

      const version = nextVersion(currentRecord, op);

      return {
        ...currentRecord,
        updatedAt: op.payload.deletedAt,
        deletedAt: op.payload.deletedAt,
        version,
        lastOpId: op.opId,
      };
    }
  }
}
