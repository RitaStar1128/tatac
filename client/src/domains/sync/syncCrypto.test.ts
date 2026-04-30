import { describe, expect, it } from "vitest";

import { DEFAULT_SYNC_KDF_PARAMS, noteOpSchema, persistedSyncConfigSchema } from "@shared/contracts";

import type { StoredNoteOp } from "@/db/tatacDb";

import { decryptEnvelopeToNoteOp, encryptNoteOpToEnvelope } from "./syncCrypto";

describe("syncCrypto", () => {
  it("encrypts and decrypts a note op with AES-GCM", async () => {
    const config = persistedSyncConfigSchema.parse({
      id: "active",
      userId: "u_crypto_test",
      deviceId: "d_crypto_test",
      deviceName: "Crypto Device",
      syncNodeUrl: "http://127.0.0.1:4010",
      salt: "c3luYy10ZXN0LXNhbHQhIQ==",
      kdf: DEFAULT_SYNC_KDF_PARAMS,
      createdAt: "2026-04-30T10:00:00.000Z",
      updatedAt: "2026-04-30T10:00:00.000Z",
      lastSuccessfulSyncAt: null,
    });

    const op = noteOpSchema.parse({
      opId: "op_crypto_1",
      deviceId: "d_crypto_test",
      userId: "u_crypto_test",
      noteId: "note_crypto_1",
      baseVersion: 0,
      logicalTime: 1,
      wallClock: "2026-04-30T10:01:00.000Z",
      payload: {
        type: "note.create",
        title: "Crypto",
        body: "Encrypted body",
        createdAt: "2026-04-30T10:01:00.000Z",
        updatedAt: "2026-04-30T10:01:00.000Z",
      },
    });

    const envelope = await encryptNoteOpToEnvelope(op, config, "correct horse battery");
    const roundTrip = await decryptEnvelopeToNoteOp(envelope, config, "correct horse battery");

    expect(roundTrip.op).toEqual(op);
    expect(roundTrip.aad.recipientUserId).toBe(config.userId);
  });

  it("ignores local storage metadata when encrypting a stored note op", async () => {
    const config = persistedSyncConfigSchema.parse({
      id: "active",
      userId: "u_crypto_test",
      deviceId: "d_crypto_test",
      deviceName: "Crypto Device",
      syncNodeUrl: "http://127.0.0.1:4010",
      salt: "c3luYy10ZXN0LXNhbHQhIQ==",
      kdf: DEFAULT_SYNC_KDF_PARAMS,
      createdAt: "2026-04-30T10:00:00.000Z",
      updatedAt: "2026-04-30T10:00:00.000Z",
      lastSuccessfulSyncAt: null,
    });

    const baseOp = noteOpSchema.parse({
      opId: "op_crypto_2",
      deviceId: "d_crypto_test",
      userId: "u_crypto_test",
      noteId: "note_crypto_2",
      baseVersion: 1,
      logicalTime: 2,
      wallClock: "2026-04-30T10:02:00.000Z",
      payload: {
        type: "note.update",
        title: "Crypto Updated",
        body: "Encrypted body updated",
        updatedAt: "2026-04-30T10:02:00.000Z",
      },
    });
    const storedOp: StoredNoteOp = {
      ...baseOp,
      recordedAt: "2026-04-30T10:02:01.000Z",
      origin: "local",
      lastPushedAt: "2026-04-30T10:02:02.000Z",
    };

    const envelope = await encryptNoteOpToEnvelope(storedOp, config, "correct horse battery");
    const roundTrip = await decryptEnvelopeToNoteOp(envelope, config, "correct horse battery");

    expect(roundTrip.op).toEqual(baseOp);
  });
});
