import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

import { createApiRouter } from "./api";
import { FileBackedSyncNodeStore } from "../services/fileStore";

describe("sync-node api", () => {
  const servers: Array<{ close: () => void }> = [];
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const server of servers.splice(0)) {
      await new Promise<void>((resolve, reject) => {
        server.close((error?: Error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }

    for (const dir of tempDirs.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("registers a device and supports push/pull", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "tatac-sync-node-"));
    tempDirs.push(tempDir);

    const store = new FileBackedSyncNodeStore({
      filePath: path.join(tempDir, "node-store.json"),
      nodeId: "node_test",
    });
    const app = express();
    app.use(express.json());
    app.use("/api/v1", createApiRouter(store));

    const server = app.listen(0);
    servers.push(server);
    const port = (server.address() as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${port}/api/v1`;

    const registerResponse = await fetch(`${baseUrl}/register-device`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "u_test",
        deviceId: "d_test",
        deviceName: "Vitest Device",
        clientVersion: "0.1.0",
      }),
    }).then((response) => response.json());

    expect(registerResponse.ok).toBe(true);
    expect(registerResponse.nodeId).toBe("node_test");

    const pushResponse = await fetch(`${baseUrl}/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "u_test",
        deviceId: "d_test",
        envelopes: [
          {
            envelopeVersion: 1,
            senderDeviceId: "d_test",
            recipientUserId: "u_test",
            nonce: "bm9uY2UxMjM0NTY3OA==",
            cipherText: "Y2lwaGVyVGV4dA==",
            aad: "YWFk",
            createdAt: "2026-04-30T10:00:00.000Z",
          },
        ],
      }),
    }).then((response) => response.json());

    expect(pushResponse.ok).toBe(true);
    expect(pushResponse.accepted).toBe(1);
    expect(pushResponse.lastSeq).toBe(1);

    const pullResponse = await fetch(`${baseUrl}/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "u_test",
        deviceId: "d_other",
        afterSeq: 0,
        limit: 200,
      }),
    }).then((response) => response.json());

    expect(pullResponse.ok).toBe(true);
    expect(pullResponse.items).toHaveLength(1);
    expect(pullResponse.items[0].seq).toBe(1);
    expect(pullResponse.nextAfterSeq).toBe(1);
    expect(pullResponse.hasMore).toBe(false);
  });
});
