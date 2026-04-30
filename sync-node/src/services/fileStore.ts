import { promises as fs } from "node:fs";
import path from "node:path";

import type {
  EncryptedEnvelope,
  PairingBundle,
} from "../../../shared/contracts";
import { pairingSessionRecordSchema } from "../../../shared/contracts";
import type {
  PullItem,
  RegisterDeviceRequest,
} from "../../../shared/contracts";

import {
  epochBucketSchema,
  syncNodeStoreSchema,
  storedEnvelopeItemSchema,
  type EpochBucket,
  type RegisteredDevice,
  type SyncNodeStore,
  type UserBucket,
} from "../types/store";

const DEFAULT_RETENTION_WINDOW = 64;
const DEFAULT_INACTIVE_DEVICE_MS = 30 * 24 * 60 * 60 * 1000;

function nowIso(): string {
  return new Date().toISOString();
}

function createEmptyUserBucket(): UserBucket {
  return {
    devices: {},
    epochs: {},
  };
}

function createEmptyEpochBucket(): EpochBucket {
  return {
    nextSeq: 0,
    items: [],
    contentHashes: {},
    deviceStates: {},
  };
}

function keyEpochKey(keyEpoch: number): string {
  return String(keyEpoch);
}

function isExpired(expiresAt: string, referenceTime = Date.now()): boolean {
  return Date.parse(expiresAt) <= referenceTime;
}

function purgeExpiredPairingSessions(store: SyncNodeStore, referenceTime = Date.now()): void {
  for (const [sessionId, record] of Object.entries(store.pairingSessions)) {
    if (isExpired(record.expiresAt, referenceTime)) {
      delete store.pairingSessions[sessionId];
    }
  }
}

function getActiveDeviceIds(
  bucket: UserBucket,
  referenceTime: number,
  inactiveDeviceMs: number,
): string[] {
  return Object.values(bucket.devices)
    .filter((device) => referenceTime - Date.parse(device.lastSeenAt) <= inactiveDeviceMs)
    .map((device) => device.deviceId);
}

function pruneEpochBucket(
  bucket: UserBucket,
  epochBucket: EpochBucket,
  referenceTime: number,
  retentionWindow: number,
  inactiveDeviceMs: number,
): void {
  const activeDeviceIds = getActiveDeviceIds(bucket, referenceTime, inactiveDeviceMs);
  if (activeDeviceIds.length === 0) {
    return;
  }

  const watermarkCandidates = activeDeviceIds.map(
    (deviceId) => epochBucket.deviceStates[deviceId]?.lastPulledSeq ?? 0,
  );
  const minWatermark = Math.min(...watermarkCandidates);
  const pruneBeforeSeq = minWatermark - retentionWindow;

  if (pruneBeforeSeq <= 0) {
    return;
  }

  epochBucket.items = epochBucket.items.filter((item) => item.seq > pruneBeforeSeq);
  epochBucket.contentHashes = Object.fromEntries(
    Object.entries(epochBucket.contentHashes).filter(([, seq]) => seq > pruneBeforeSeq),
  );
}

function pruneStore(
  store: SyncNodeStore,
  referenceTime: number,
  retentionWindow: number,
  inactiveDeviceMs: number,
): void {
  purgeExpiredPairingSessions(store, referenceTime);

  for (const bucket of Object.values(store.users)) {
    for (const epochBucket of Object.values(bucket.epochs)) {
      pruneEpochBucket(bucket, epochBucket, referenceTime, retentionWindow, inactiveDeviceMs);
    }
  }
}

function getUserBucket(store: SyncNodeStore, userId: string): UserBucket {
  return (store.users[userId] ??= createEmptyUserBucket());
}

function getEpochBucket(bucket: UserBucket, keyEpoch: number): EpochBucket {
  const epochKey = keyEpochKey(keyEpoch);
  return (bucket.epochs[epochKey] ??= createEmptyEpochBucket());
}

function normalizeLegacyEpochBucket(rawEpochBucket: unknown): EpochBucket {
  const raw = rawEpochBucket as Partial<EpochBucket> & {
    items?: unknown[];
    contentHashes?: Record<string, number>;
    deviceStates?: Record<string, { lastPulledSeq?: number; updatedAt?: string }>;
    nextSeq?: number;
  };

  const items = Array.isArray(raw.items)
    ? raw.items
        .map((item) => storedEnvelopeItemSchema.safeParse(item))
        .filter((result) => result.success)
        .map((result) => result.data)
    : [];

  const contentHashes =
    raw.contentHashes && typeof raw.contentHashes === "object"
      ? Object.fromEntries(
          Object.entries(raw.contentHashes).filter(
            ([contentHash, seq]) => typeof contentHash === "string" && Number.isInteger(seq) && seq > 0,
          ),
        )
      : Object.fromEntries(items.map((item) => [item.envelope.contentHash, item.seq]));

  return epochBucketSchema.parse({
    nextSeq:
      typeof raw.nextSeq === "number" && Number.isInteger(raw.nextSeq) && raw.nextSeq >= 0
        ? raw.nextSeq
        : items.reduce((maxSeq, item) => Math.max(maxSeq, item.seq), 0),
    items,
    contentHashes,
    deviceStates: raw.deviceStates ?? {},
  });
}

function normalizeStore(rawStore: unknown, nodeId: string): SyncNodeStore {
  const parsed = rawStore as Partial<SyncNodeStore> & {
    users?: Record<string, unknown>;
    pairingSessions?: Record<string, unknown>;
  };

  const normalizedUsers: SyncNodeStore["users"] = {};

  for (const [userId, rawBucket] of Object.entries(parsed.users ?? {})) {
    const bucketValue = rawBucket as
      | (Partial<UserBucket> & {
          devices?: Record<string, RegisteredDevice>;
          epochs?: Record<string, unknown>;
        })
      | (Partial<EpochBucket> & {
          devices?: Record<string, RegisteredDevice>;
        });

    if (bucketValue && typeof bucketValue === "object" && "epochs" in bucketValue) {
      normalizedUsers[userId] = {
        devices: bucketValue.devices ?? {},
        epochs: Object.fromEntries(
          Object.entries(bucketValue.epochs ?? {}).map(([epochId, rawEpochBucket]) => [
            epochId,
            normalizeLegacyEpochBucket(rawEpochBucket),
          ]),
        ),
      };
      continue;
    }

    // TODO: Legacy pre-epoch buckets cannot recover old opaque envelopes without plaintext access.
    // Keep device registrations and start a fresh epoch namespace.
    normalizedUsers[userId] = {
      devices: bucketValue?.devices ?? {},
      epochs: {
        "1": createEmptyEpochBucket(),
      },
    };
  }

  return syncNodeStoreSchema.parse({
    nodeId: parsed.nodeId ?? nodeId,
    users: normalizedUsers,
    pairingSessions: parsed.pairingSessions ?? {},
  });
}

export class PairingSessionStoreError extends Error {
  code: "PAIRING_NOT_FOUND" | "PAIRING_EXPIRED" | "PAIRING_ALREADY_USED" | "INVALID_PAIRING_KEY";

  constructor(
    code: "PAIRING_NOT_FOUND" | "PAIRING_EXPIRED" | "PAIRING_ALREADY_USED" | "INVALID_PAIRING_KEY",
    message: string,
  ) {
    super(message);
    this.code = code;
  }
}

export class FileBackedSyncNodeStore {
  private readonly filePath: string;
  private readonly nodeId: string;
  private readonly retentionWindow: number;
  private readonly inactiveDeviceMs: number;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(params: {
    filePath: string;
    nodeId: string;
    retentionWindow?: number;
    inactiveDeviceMs?: number;
  }) {
    this.filePath = params.filePath;
    this.nodeId = params.nodeId;
    this.retentionWindow = params.retentionWindow ?? DEFAULT_RETENTION_WINDOW;
    this.inactiveDeviceMs = params.inactiveDeviceMs ?? DEFAULT_INACTIVE_DEVICE_MS;
  }

  private async ensureParentDirectory(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
  }

  private async readStore(): Promise<SyncNodeStore> {
    await this.ensureParentDirectory();

    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      return normalizeStore(JSON.parse(raw), this.nodeId);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {
          nodeId: this.nodeId,
          users: {},
          pairingSessions: {},
        };
      }

      throw error;
    }
  }

  private async writeStore(store: SyncNodeStore): Promise<void> {
    pruneStore(store, Date.now(), this.retentionWindow, this.inactiveDeviceMs);
    await this.ensureParentDirectory();
    await fs.writeFile(
      this.filePath,
      `${JSON.stringify(syncNodeStoreSchema.parse(store), null, 2)}\n`,
      "utf8",
    );
  }

  private async mutate<T>(callback: (store: SyncNodeStore) => Promise<T> | T): Promise<T> {
    const run = async () => {
      const store = await this.readStore();
      try {
        const result = await callback(store);
        await this.writeStore(store);
        return result;
      } catch (error) {
        await this.writeStore(store);
        throw error;
      }
    };

    const next = this.queue.then(run, run);
    this.queue = next.then(() => undefined, () => undefined);
    return next;
  }

  async health(): Promise<{ nodeId: string; serverTime: string }> {
    return {
      nodeId: this.nodeId,
      serverTime: nowIso(),
    };
  }

  async registerDevice(request: RegisterDeviceRequest): Promise<{ nodeId: string; registeredAt: string }> {
    return this.mutate((store) => {
      const bucket = getUserBucket(store, request.userId);
      const existing = bucket.devices[request.deviceId];
      const registeredAt = existing?.registeredAt ?? nowIso();

      const device: RegisteredDevice = {
        deviceId: request.deviceId,
        deviceName: request.deviceName,
        clientVersion: request.clientVersion,
        registeredAt,
        lastSeenAt: nowIso(),
      };

      bucket.devices[request.deviceId] = device;
      getEpochBucket(bucket, request.keyEpoch);

      return {
        nodeId: store.nodeId,
        registeredAt: device.registeredAt,
      };
    });
  }

  async push(
    userId: string,
    keyEpoch: number,
    deviceId: string,
    envelopes: EncryptedEnvelope[],
  ): Promise<{ accepted: number; acceptedContentHashes: string[]; lastSeq: number }> {
    return this.mutate((store) => {
      const bucket = getUserBucket(store, userId);
      const epochBucket = getEpochBucket(bucket, keyEpoch);
      const acceptedContentHashes = new Set<string>();

      if (bucket.devices[deviceId]) {
        bucket.devices[deviceId].lastSeenAt = nowIso();
      }

      for (const envelope of envelopes) {
        if (envelope.recipientUserId !== userId || envelope.keyEpoch !== keyEpoch) {
          continue;
        }

        acceptedContentHashes.add(envelope.contentHash);

        if (epochBucket.contentHashes[envelope.contentHash]) {
          continue;
        }

        epochBucket.nextSeq += 1;
        epochBucket.items.push({
          seq: epochBucket.nextSeq,
          envelope,
        });
        epochBucket.contentHashes[envelope.contentHash] = epochBucket.nextSeq;
      }

      return {
        accepted: acceptedContentHashes.size,
        acceptedContentHashes: Array.from(acceptedContentHashes),
        lastSeq: epochBucket.nextSeq,
      };
    });
  }

  async pull(
    userId: string,
    keyEpoch: number,
    deviceId: string,
    afterSeq: number,
    limit: number,
  ): Promise<{ items: PullItem[]; nextAfterSeq: number; hasMore: boolean }> {
    return this.mutate((store) => {
      const bucket = getUserBucket(store, userId);
      const epochBucket = getEpochBucket(bucket, keyEpoch);
      const items = epochBucket.items.filter((item) => item.seq > afterSeq).slice(0, limit);
      const nextAfterSeq = items.length > 0 ? items[items.length - 1].seq : afterSeq;
      const hasMore = epochBucket.items.some((item) => item.seq > nextAfterSeq);

      if (bucket.devices[deviceId]) {
        bucket.devices[deviceId].lastSeenAt = nowIso();
      }

      const currentDeviceState = epochBucket.deviceStates[deviceId];
      epochBucket.deviceStates[deviceId] = {
        lastPulledSeq: Math.max(currentDeviceState?.lastPulledSeq ?? 0, nextAfterSeq),
        updatedAt: nowIso(),
      };

      return {
        items,
        nextAfterSeq,
        hasMore,
      };
    });
  }

  async createPairingSession(input: {
    pairingKeyHash: string;
    bundle: PairingBundle;
  }): Promise<{ sessionId: string; expiresAt: string }> {
    return this.mutate((store) => {
      const sessionId = `ps_${crypto.randomUUID()}`;
      const record = pairingSessionRecordSchema.parse({
        sessionId,
        pairingKeyHash: input.pairingKeyHash,
        bundle: input.bundle,
        createdAt: nowIso(),
        expiresAt: input.bundle.expiresAt,
      });

      store.pairingSessions[sessionId] = record;

      return {
        sessionId,
        expiresAt: record.expiresAt,
      };
    });
  }

  async consumePairingSession(input: {
    sessionId: string;
    pairingKeyHash: string;
  }): Promise<{ nodeId: string; serverTime: string; bundle: PairingBundle }> {
    return this.mutate((store) => {
      const record = store.pairingSessions[input.sessionId];
      if (!record) {
        throw new PairingSessionStoreError("PAIRING_NOT_FOUND", "This pairing code was not found.");
      }

      if (isExpired(record.expiresAt)) {
        delete store.pairingSessions[input.sessionId];
        throw new PairingSessionStoreError("PAIRING_EXPIRED", "This pairing code has expired.");
      }

      if (record.consumedAt) {
        throw new PairingSessionStoreError("PAIRING_ALREADY_USED", "This pairing code has already been used.");
      }

      if (record.pairingKeyHash !== input.pairingKeyHash) {
        throw new PairingSessionStoreError("INVALID_PAIRING_KEY", "This pairing code is invalid.");
      }

      record.consumedAt = nowIso();
      return {
        nodeId: store.nodeId,
        serverTime: nowIso(),
        bundle: record.bundle,
      };
    });
  }
}
