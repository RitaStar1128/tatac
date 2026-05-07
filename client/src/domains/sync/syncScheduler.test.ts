import { beforeEach, describe, expect, it, vi } from "vitest";

const syncWithNodeMock = vi.fn();

vi.mock("@/domains/notes/noteRepository", () => ({
  subscribeToLocalNoteOps: vi.fn(() => () => {}),
}));

vi.mock("./syncEnvironment", () => ({
  getSyncEnvironmentSupport: vi.fn(() => ({
    supported: true,
    reason: "ok",
  })),
}));

vi.mock("./persistedSyncSecretStore", () => ({
  getPersistedSyncSecret: vi.fn(async () => ({
    configId: "active",
    groupSecret: "persisted-secret",
    persistedAt: "2026-05-08T10:00:00.000Z",
    origin: "generated",
  })),
}));

vi.mock("./syncSettingsStore", () => ({
  getOrCreateSyncConfig: vi.fn(async () => ({
    id: "active",
    userId: "u_test",
    keyEpoch: 1,
    deviceId: "d_test",
    deviceName: "Test Device",
    syncNodeUrl: "http://127.0.0.1:4010",
    salt: "c2FsdA==",
    kdf: {
      algorithm: "PBKDF2",
      hash: "SHA-256",
      iterations: 310000,
      keyLengthBits: 256,
    },
    createdAt: "2026-05-08T10:00:00.000Z",
    updatedAt: "2026-05-08T10:00:00.000Z",
    lastSuccessfulSyncAt: null,
  })),
  subscribeToSyncConfig: vi.fn(() => () => {}),
}));

vi.mock("./syncEngine", () => ({
  syncWithNode: syncWithNodeMock,
}));

vi.mock("./syncTransport", () => ({
  fetchHealth: vi.fn(),
}));

describe("syncScheduler", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    syncWithNodeMock.mockReset();
  });

  it("clears inFlight after each run so later syncs can start", async () => {
    syncWithNodeMock
      .mockResolvedValueOnce({
        nodeId: "node_1",
        serverTime: "2026-05-08T10:00:00.000Z",
        pushed: 1,
        pulled: 0,
        applied: 0,
        duplicates: 0,
        cursor: 1,
        completedAt: "2026-05-08T10:00:00.000Z",
      })
      .mockResolvedValueOnce({
        nodeId: "node_1",
        serverTime: "2026-05-08T10:01:00.000Z",
        pushed: 2,
        pulled: 0,
        applied: 0,
        duplicates: 0,
        cursor: 2,
        completedAt: "2026-05-08T10:01:00.000Z",
      });

    const { syncScheduler, getSyncUiState } = await import("./syncScheduler");

    await syncScheduler.syncNow();
    await syncScheduler.syncNow();

    expect(syncWithNodeMock).toHaveBeenCalledTimes(2);
    expect(getSyncUiState().lastRun?.cursor).toBe(2);
  });
});
