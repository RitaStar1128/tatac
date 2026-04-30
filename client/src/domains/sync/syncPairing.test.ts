import { beforeEach, describe, expect, it, vi } from "vitest";

import { createPairingKey, createPairingKeyHash, decryptPairingBundle, encryptPairingBundle } from "./pairingCrypto";
import { resolveEffectiveSyncPassphrase } from "./syncSecretResolver";

vi.mock("./sessionSecretStore", () => ({
  getSyncSessionSecret: vi.fn(),
}));

vi.mock("./persistedSyncSecretStore", () => ({
  getPersistedSyncSecret: vi.fn(),
}));

const sessionSecretStoreModule = await import("./sessionSecretStore");
const persistedSyncSecretStoreModule = await import("./persistedSyncSecretStore");

describe("sync pairing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("encrypts and decrypts a pairing bundle", async () => {
    const pairingKey = createPairingKey();
    const payload = {
      pairingVersion: 1 as const,
      syncGroupId: "u_pairing_test",
      keyEpoch: 1,
      groupSecret: "correct-horse-battery-staple",
      salt: "c3luYy10ZXN0LXNhbHQhIQ==",
      syncNodeUrl: "http://127.0.0.1:4010",
      sourceDeviceId: "d_pairing_pc",
      sourceDeviceName: "Pairing PC",
      createdAt: "2026-04-30T10:00:00.000Z",
      expiresAt: "2026-04-30T10:10:00.000Z",
    };

    const bundle = await encryptPairingBundle(payload, pairingKey);
    const roundTrip = await decryptPairingBundle(bundle, pairingKey);

    expect(roundTrip).toEqual(payload);
  });

  it("produces a stable pairing key hash", async () => {
    const pairingKey = createPairingKey();
    const left = await createPairingKeyHash(pairingKey);
    const right = await createPairingKeyHash(pairingKey);

    expect(left).toBe(right);
  });

  it("prefers session secret over persisted secret", async () => {
    vi.mocked(sessionSecretStoreModule.getSyncSessionSecret).mockReturnValue({
      passphrase: "session-secret",
    });
    vi.mocked(persistedSyncSecretStoreModule.getPersistedSyncSecret).mockResolvedValue({
      configId: "active",
      groupSecret: "persisted-secret",
      persistedAt: "2026-04-30T10:00:00.000Z",
      origin: "generated",
    });

    await expect(resolveEffectiveSyncPassphrase()).resolves.toBe("session-secret");
  });

  it("falls back to persisted secret", async () => {
    vi.mocked(sessionSecretStoreModule.getSyncSessionSecret).mockReturnValue(null);
    vi.mocked(persistedSyncSecretStoreModule.getPersistedSyncSecret).mockResolvedValue({
      configId: "active",
      groupSecret: "persisted-secret",
      persistedAt: "2026-04-30T10:00:00.000Z",
      origin: "paired",
    });

    await expect(resolveEffectiveSyncPassphrase()).resolves.toBe("persisted-secret");
  });
});
