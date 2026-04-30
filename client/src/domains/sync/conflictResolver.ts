import type { NoteOp, NoteRecord } from "@shared/contracts";

export type ConflictResolutionReason =
  | "incomingDeleteWins"
  | "newerTimestampWins"
  | "newerLogicalTimeWins"
  | "opIdTieBreakWins"
  | "duplicateOp"
  | "duplicateCreate"
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

export function resolveNoteConflict(_input: ConflictResolverInput): ConflictResolverResult {
  if (_input.hasSeenOpId) {
    return {
      decision: "ignoreDuplicate",
      nextRecord: _input.currentRecord,
      reason: "duplicateOp",
    };
  }

  if (_input.currentRecord && _input.incomingOp.payload.type === "note.create") {
    return {
      decision: "ignoreDuplicate",
      nextRecord: _input.currentRecord,
      reason: "duplicateCreate",
    };
  }

  if (!_input.incomingRecord) {
    return {
      decision: "keepExisting",
      nextRecord: _input.currentRecord,
      reason: "keepExisting",
    };
  }

  if (!_input.currentRecord) {
    return {
      decision: "applyIncoming",
      nextRecord: _input.incomingRecord,
      reason:
        _input.incomingRecord.deletedAt !== null ? "incomingDeleteWins" : "newerTimestampWins",
    };
  }

  if (_input.incomingRecord.deletedAt && !_input.currentRecord.deletedAt) {
    return {
      decision: "applyIncoming",
      nextRecord: _input.incomingRecord,
      reason: "incomingDeleteWins",
    };
  }

  if (_input.currentRecord.deletedAt && !_input.incomingRecord.deletedAt) {
    return {
      decision: "keepExisting",
      nextRecord: _input.currentRecord,
      reason: "keepExisting",
    };
  }

  const currentTimestamp = getConflictTimestamp(_input.currentRecord);
  const incomingTimestamp = getConflictTimestamp(_input.incomingRecord);

  if (currentTimestamp !== incomingTimestamp) {
    if ((incomingTimestamp ?? "") > (currentTimestamp ?? "")) {
      return {
        decision: "applyIncoming",
        nextRecord: _input.incomingRecord,
        reason: "newerTimestampWins",
      };
    }

    return {
      decision: "keepExisting",
      nextRecord: _input.currentRecord,
      reason: "keepExisting",
    };
  }

  const currentLogicalTime = _input.currentLogicalTime ?? 0;
  if (_input.incomingOp.logicalTime !== currentLogicalTime) {
    if (_input.incomingOp.logicalTime > currentLogicalTime) {
      return {
        decision: "applyIncoming",
        nextRecord: _input.incomingRecord,
        reason: "newerLogicalTimeWins",
      };
    }

    return {
      decision: "keepExisting",
      nextRecord: _input.currentRecord,
      reason: "keepExisting",
    };
  }

  if (_input.incomingRecord.lastOpId > _input.currentRecord.lastOpId) {
    return {
      decision: "applyIncoming",
      nextRecord: _input.incomingRecord,
      reason: "opIdTieBreakWins",
    };
  }

  return {
    decision: "keepExisting",
    nextRecord: _input.currentRecord,
    reason: "keepExisting",
  };
}
