import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SYNC_KDF_PARAMS, persistedSyncConfigSchema, tatacSyncFileSchema } from "@shared/contracts";

import { createSyncCursorId, getSyncCursor, setSyncCursor } from "./syncCursorStore";
import { importTatacSyncFile } from "./syncEngine";

// --- Cursor store mocks ---

const cursorStore = new Map<string, unknown>();

vi.mock("@/db/tatacDb", () => ({
  tatacDb: {
    syncCursors: {
      get: vi.fn((id: string) => Promise.resolve(cursorStore.get(id))),
      put: vi.fn((record: unknown) => {
        cursorStore.set((record as { id: string }).id, record);
        return Promise.resolve();
      }),
    },
  },
}));

// --- syncEngine dependency mocks ---

vi.mock("./syncSettingsStore", () => ({
  getOrCreateSyncConfig: vi.fn(),
  markLastSuccessfulSync: vi.fn(),
  saveSyncSettingsDraft: vi.fn(),
  updateSyncRegistration: vi.fn(),
}));

vi.mock("./syncSecretResolver", () => ({
  resolveEffectiveSyncPassphrase: vi.fn(),
}));

vi.mock("@/domains/notes/noteRepository", () => ({
  applyInboundNoteOp: vi.fn(),
  listAllNoteOpsForUser: vi.fn(),
  listPendingPushNoteOps: vi.fn(),
  markNoteOpsAcknowledged: vi.fn(),
}));

vi.mock("./syncEnvironment", () => ({
  assertSyncEnvironmentSupported: vi.fn(),
}));

const syncSettingsStoreModule = await import("./syncSettingsStore");
const syncSecretResolverModule = await import("./syncSecretResolver");

function makeConfig(userId: string, keyEpoch: number) {
  return persistedSyncConfigSchema.parse({
    id: "active",
    userId,
    keyEpoch,
    deviceId: "d_test",
    deviceName: "Test Device",
    syncNodeUrl: "http://127.0.0.1:4010",
    salt: "c3luYy10ZXN0LXNhbHQhIQ==",
    kdf: DEFAULT_SYNC_KDF_PARAMS,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastSuccessfulSyncAt: null,
  });
}

// --- Tests ---

describe("cursor epoch isolation", () => {
  beforeEach(() => {
    cursorStore.clear();
  });

  it("generates different cursor IDs for different epochs", () => {
    const id1 = createSyncCursorId("u_test", 1, "http://127.0.0.1:4010");
    const id2 = createSyncCursorId("u_test", 2, "http://127.0.0.1:4010");
    expect(id1).not.toBe(id2);
  });

  it("epoch 2 cursor starts at 0 when epoch 1 is at seq 5", async () => {
    const userId = "u_isolation";
    const nodeUrl = "http://127.0.0.1:4010";

    await setSyncCursor(userId, 1, nodeUrl, 5);

    const epoch2Cursor = await getSyncCursor(userId, 2, nodeUrl);
    expect(epoch2Cursor.lastPulledSeq).toBe(0);
    expect(epoch2Cursor.keyEpoch).toBe(2);
  });

  it("epoch 1 cursor is unchanged after reading epoch 2 cursor", async () => {
    const userId = "u_isolation2";
    const nodeUrl = "http://127.0.0.1:4010";

    await setSyncCursor(userId, 1, nodeUrl, 10);
    await getSyncCursor(userId, 2, nodeUrl);

    const epoch1Cursor = await getSyncCursor(userId, 1, nodeUrl);
    expect(epoch1Cursor.lastPulledSeq).toBe(10);
  });

  it("cursor IDs for the same epoch are equal", () => {
    const id1 = createSyncCursorId("u_test", 1, "http://127.0.0.1:4010");
    const id2 = createSyncCursorId("u_test", 1, "http://127.0.0.1:4010");
    expect(id1).toBe(id2);
  });
});

describe("importTatacSyncFile epoch and group validation", () => {
  const nodeUrl = "http://127.0.0.1:4010";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(syncSecretResolverModule.resolveEffectiveSyncPassphrase).mockResolvedValue(
      "correct horse battery",
    );
  });

  it("rejects a file from a different userId", async () => {
    vi.mocked(syncSettingsStoreModule.getOrCreateSyncConfig).mockResolvedValue(
      makeConfig("u_device", 1),
    );

    const file = tatacSyncFileSchema.parse({
      fileType: "tatacsync",
      version: 1,
      exportedAt: "2026-01-01T00:00:00.000Z",
      fromDeviceId: "d_other",
      userId: "u_other",
      keyEpoch: 1,
      salt: "c3luYy10ZXN0LXNhbHQhIQ==",
      items: [],
    });

    await expect(importTatacSyncFile(file)).rejects.toThrow("different sync group");
  });

  it("rejects a file from a different keyEpoch", async () => {
    vi.mocked(syncSettingsStoreModule.getOrCreateSyncConfig).mockResolvedValue(
      makeConfig("u_device", 1),
    );

    const file = tatacSyncFileSchema.parse({
      fileType: "tatacsync",
      version: 1,
      exportedAt: "2026-01-01T00:00:00.000Z",
      fromDeviceId: "d_device",
      userId: "u_device",
      keyEpoch: 2,
      salt: "c3luYy10ZXN0LXNhbHQhIQ==",
      items: [],
    });

    await expect(importTatacSyncFile(file)).rejects.toThrow("different sync epoch");
  });

  it("rejects a file with a different salt (different group)", async () => {
    vi.mocked(syncSettingsStoreModule.getOrCreateSyncConfig).mockResolvedValue({
      ...makeConfig("u_device", 1),
      syncNodeUrl: nodeUrl,
    });

    const file = tatacSyncFileSchema.parse({
      fileType: "tatacsync",
      version: 1,
      exportedAt: "2026-01-01T00:00:00.000Z",
      fromDeviceId: "d_device",
      userId: "u_device",
      keyEpoch: 1,
      salt: "ZGlmZmVyZW50LXNhbHQhIQ==",
      items: [],
    });

    await expect(importTatacSyncFile(file)).rejects.toThrow("different sync group");
  });

  it("accepts a file with matching userId, keyEpoch, and salt", async () => {
    const config = makeConfig("u_device", 1);
    vi.mocked(syncSettingsStoreModule.getOrCreateSyncConfig).mockResolvedValue(config);

    const file = tatacSyncFileSchema.parse({
      fileType: "tatacsync",
      version: 1,
      exportedAt: "2026-01-01T00:00:00.000Z",
      fromDeviceId: "d_device",
      userId: config.userId,
      keyEpoch: config.keyEpoch,
      salt: config.salt,
      items: [],
    });

    const result = await importTatacSyncFile(file);
    expect(result.importedItems).toBe(0);
    expect(result.applied).toBe(0);
  });
});
