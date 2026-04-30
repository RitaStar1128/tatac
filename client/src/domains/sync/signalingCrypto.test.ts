import { describe, expect, it } from "vitest";

import { DEFAULT_SYNC_KDF_PARAMS, persistedSyncConfigSchema } from "@shared/contracts";

import { decryptSignalingPayload, encryptSignalingPayload } from "./signalingCrypto";

describe("signalingCrypto", () => {
  const config = persistedSyncConfigSchema.parse({
    id: "active",
    userId: "u_signal_test",
    keyEpoch: 2,
    deviceId: "d_signal_a",
    deviceName: "Signal Device",
    syncNodeUrl: "http://127.0.0.1:4010",
    transportMode: "lan-direct",
    lanSyncEnabled: true,
    salt: "c2lnbmFsaW5nLXNhbHQ=",
    kdf: DEFAULT_SYNC_KDF_PARAMS,
    createdAt: "2026-05-01T10:00:00.000Z",
    updatedAt: "2026-05-01T10:00:00.000Z",
    lastSuccessfulSyncAt: null,
  });

  it("encrypts and decrypts an offer payload with the signaling key", async () => {
    const message = await encryptSignalingPayload({
      payload: {
        kind: "offer",
        sdp: "v=0\r\n",
      },
      config,
      passphrase: "correct horse battery",
      toDeviceId: "d_signal_b",
    });

    const roundTrip = await decryptSignalingPayload({
      message,
      config: persistedSyncConfigSchema.parse({
        ...config,
        deviceId: "d_signal_b",
      }),
      passphrase: "correct horse battery",
    });

    expect(roundTrip.payload).toEqual({
      kind: "offer",
      sdp: "v=0\r\n",
    });
    expect(roundTrip.aad.fromDeviceId).toBe("d_signal_a");
    expect(roundTrip.aad.toDeviceId).toBe("d_signal_b");
  });
});
