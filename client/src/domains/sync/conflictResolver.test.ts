import { describe, expect, it } from "vitest";

import { resolveNoteConflict } from "./conflictResolver";

describe("resolveNoteConflict", () => {
  it("keeps existing state when an update arrives without a base note", () => {
    const result = resolveNoteConflict({
      currentRecord: null,
      currentLogicalTime: null,
      incomingRecord: null,
      incomingOp: {
        opId: "op_update_1",
        deviceId: "device_a",
        userId: "group_a",
        keyEpoch: 1,
        noteId: "note_a",
        baseVersion: 0,
        logicalTime: 2,
        wallClock: "2026-04-30T10:00:00.000Z",
        payload: {
          type: "note.update",
          body: "updated body",
          updatedAt: "2026-04-30T10:00:00.000Z",
        },
      },
      hasSeenOpId: false,
    });

    expect(result.decision).toBe("keepExisting");
    expect(result.reason).toBe("missingBaseForUpdate");
  });

  it("keeps existing state when a delete arrives without a base note", () => {
    const result = resolveNoteConflict({
      currentRecord: null,
      currentLogicalTime: null,
      incomingRecord: null,
      incomingOp: {
        opId: "op_delete_1",
        deviceId: "device_a",
        userId: "group_a",
        keyEpoch: 1,
        noteId: "note_a",
        baseVersion: 0,
        logicalTime: 3,
        wallClock: "2026-04-30T10:00:00.000Z",
        payload: {
          type: "note.delete",
          deletedAt: "2026-04-30T10:01:00.000Z",
        },
      },
      hasSeenOpId: false,
    });

    expect(result.decision).toBe("keepExisting");
    expect(result.reason).toBe("missingBaseForDelete");
  });
});
