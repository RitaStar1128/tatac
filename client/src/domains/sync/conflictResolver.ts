import type { NoteOp, NoteRecord } from "@shared/contracts";

export type ConflictResolutionReason =
  | "incomingDeleteWins"
  | "newerTimestampWins"
  | "newerLogicalTimeWins"
  | "opIdTieBreakWins"
  | "duplicateOp"
  | "duplicateCreate"
  | "missingBaseForUpdate"
  | "missingBaseForDelete"
  | "keepExisting";

export type ConflictResolutionDecision =
  | "applyIncoming"
  | "keepExisting"
  | "ignoreDuplicate";

export interface ConflictResolverInput {
  currentRecord: NoteRecord | null;
  currentLogicalTime: number | null;
  incomingRecord: NoteRecord | null;
  incomingOp: NoteOp;
  hasSeenOpId: boolean;
}

export interface ConflictResolverResult {
  decision: ConflictResolutionDecision;
  nextRecord: NoteRecord | null;
  reason: ConflictResolutionReason;
}

const getConflictTimestamp = (record: NoteRecord | null): string | null =>
  record?.deletedAt ?? record?.updatedAt ?? null;

export function compareNoteConflictOrder(
  currentRecord: NoteRecord,
  currentLogicalTime: number,
  incomingRecord: NoteRecord,
  incomingLogicalTime: number,
): number {
  const currentTimestamp = getConflictTimestamp(currentRecord);
  const incomingTimestamp = getConflictTimestamp(incomingRecord);

  if (currentRecord.deletedAt && !incomingRecord.deletedAt) return 1;
  if (!currentRecord.deletedAt && incomingRecord.deletedAt) return -1;

  if (currentTimestamp !== incomingTimestamp) {
    return currentTimestamp && incomingTimestamp
      ? currentTimestamp.localeCompare(incomingTimestamp)
      : currentTimestamp
        ? 1
        : -1;
  }

  if (currentLogicalTime !== incomingLogicalTime) {
    return currentLogicalTime - incomingLogicalTime;
  }

  return currentRecord.lastOpId.localeCompare(incomingRecord.lastOpId);
}

export function resolveNoteConflict(input: ConflictResolverInput): ConflictResolverResult {
  if (input.hasSeenOpId) {
    return {
      decision: "ignoreDuplicate",
      nextRecord: input.currentRecord,
      reason: "duplicateOp",
    };
  }

  if (input.currentRecord && input.incomingOp.payload.type === "note.create") {
    return {
      decision: "ignoreDuplicate",
      nextRecord: input.currentRecord,
      reason: "duplicateCreate",
    };
  }

  if (!input.incomingRecord) {
    return {
      decision: "keepExisting",
      nextRecord: input.currentRecord,
      reason:
        input.incomingOp.payload.type === "note.update"
          ? "missingBaseForUpdate"
          : input.incomingOp.payload.type === "note.delete"
            ? "missingBaseForDelete"
            : "keepExisting",
    };
  }

  if (!input.currentRecord) {
    return {
      decision: "applyIncoming",
      nextRecord: input.incomingRecord,
      reason:
        input.incomingRecord.deletedAt !== null ? "incomingDeleteWins" : "newerTimestampWins",
    };
  }

  if (input.incomingRecord.deletedAt && !input.currentRecord.deletedAt) {
    return {
      decision: "applyIncoming",
      nextRecord: input.incomingRecord,
      reason: "incomingDeleteWins",
    };
  }

  if (input.currentRecord.deletedAt && !input.incomingRecord.deletedAt) {
    return {
      decision: "keepExisting",
      nextRecord: input.currentRecord,
      reason: "keepExisting",
    };
  }

  const currentTimestamp = getConflictTimestamp(input.currentRecord);
  const incomingTimestamp = getConflictTimestamp(input.incomingRecord);

  if (currentTimestamp !== incomingTimestamp) {
    if ((incomingTimestamp ?? "") > (currentTimestamp ?? "")) {
      return {
        decision: "applyIncoming",
        nextRecord: input.incomingRecord,
        reason: "newerTimestampWins",
      };
    }

    return {
      decision: "keepExisting",
      nextRecord: input.currentRecord,
      reason: "keepExisting",
    };
  }

  const currentLogicalTime = input.currentLogicalTime ?? 0;
  if (input.incomingOp.logicalTime !== currentLogicalTime) {
    if (input.incomingOp.logicalTime > currentLogicalTime) {
      return {
        decision: "applyIncoming",
        nextRecord: input.incomingRecord,
        reason: "newerLogicalTimeWins",
      };
    }

    return {
      decision: "keepExisting",
      nextRecord: input.currentRecord,
      reason: "keepExisting",
    };
  }

  if (input.incomingRecord.lastOpId > input.currentRecord.lastOpId) {
    return {
      decision: "applyIncoming",
      nextRecord: input.incomingRecord,
      reason: "opIdTieBreakWins",
    };
  }

  return {
    decision: "keepExisting",
    nextRecord: input.currentRecord,
    reason: "keepExisting",
  };
}
