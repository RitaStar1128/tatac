import { describe, expect, it } from "vitest";

import { projectNoteRecord } from "./noteProjection";

describe("projectNoteRecord", () => {
  it("rejects an update without an existing base note", () => {
    const record = projectNoteRecord(null, {
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
    });

    expect(record).toBeNull();
  });

  it("projects a create into the originating sync group", () => {
    const record = projectNoteRecord(null, {
      opId: "op_create_1",
      deviceId: "device_a",
      userId: "group_a",
      keyEpoch: 1,
      noteId: "note_a",
      baseVersion: 0,
      logicalTime: 1,
      wallClock: "2026-04-30T10:00:00.000Z",
      payload: {
        type: "note.create",
        title: "Alpha",
        body: "Alpha body",
        createdAt: "2026-04-30T10:00:00.000Z",
        updatedAt: "2026-04-30T10:00:00.000Z",
      },
    });

    expect(record?.groupId).toBe("group_a");
  });
});
