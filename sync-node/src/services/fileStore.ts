import { promises as fs } from "node:fs";
import path from "node:path";

import type { EncryptedEnvelope } from "../../../shared/contracts";
import type {
  PullItem,
  RegisterDeviceRequest,
} from "../../../shared/contracts";

import {
  syncNodeStoreSchema,
  type RegisteredDevice,
  type SyncNodeStore,
  type UserBucket,
} from "../types/store";

function nowIso(): string {
  return new Date().toISOString();
}

function createEmptyBucket(): UserBucket {
  return {
    nextSeq: 0,
    devices: {},
    items: [],
  };
}

export class FileBackedSyncNodeStore {
  private readonly filePath: string;
  private readonly nodeId: string;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(params: { filePath: string; nodeId: string }) {
    this.filePath = params.filePath;
    this.nodeId = params.nodeId;
  }

  private async ensureParentDirectory(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
  }

  private async readStore(): Promise<SyncNodeStore> {
    await this.ensureParentDirectory();

    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      return syncNodeStoreSchema.parse(JSON.parse(raw));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {
          nodeId: this.nodeId,
          users: {},
        };
      }

      throw error;
    }
  }

  private async writeStore(store: SyncNodeStore): Promise<void> {
    await this.ensureParentDirectory();
    await fs.writeFile(this.filePath, `${JSON.stringify(syncNodeStoreSchema.parse(store), null, 2)}\n`, "utf8");
  }

  private async mutate<T>(callback: (store: SyncNodeStore) => Promise<T> | T): Promise<T> {
    const run = async () => {
      const store = await this.readStore();
      const result = await callback(store);
      await this.writeStore(store);
      return result;
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
      const bucket = (store.users[request.userId] ??= createEmptyBucket());
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
      return {
        nodeId: store.nodeId,
        registeredAt: device.registeredAt,
      };
    });
  }

  async push(userId: string, envelopes: EncryptedEnvelope[]): Promise<{ accepted: number; lastSeq: number }> {
    return this.mutate((store) => {
      const bucket = (store.users[userId] ??= createEmptyBucket());

      for (const envelope of envelopes) {
        bucket.nextSeq += 1;
        bucket.items.push({
          seq: bucket.nextSeq,
          envelope,
        });
      }

      return {
        accepted: envelopes.length,
        lastSeq: bucket.nextSeq,
      };
    });
  }

  async pull(userId: string, afterSeq: number, limit: number): Promise<{ items: PullItem[]; nextAfterSeq: number; hasMore: boolean }> {
    const store = await this.readStore();
    const bucket = store.users[userId] ?? createEmptyBucket();
    const items = bucket.items.filter((item) => item.seq > afterSeq).slice(0, limit);
    const nextAfterSeq = items.length > 0 ? items[items.length - 1].seq : afterSeq;
    const hasMore = bucket.items.some((item) => item.seq > nextAfterSeq);

    return {
      items,
      nextAfterSeq,
      hasMore,
    };
  }
}
