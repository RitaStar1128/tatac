import { createHash } from "node:crypto";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

import { createApiRouter } from "./api";
import { FileBackedSyncNodeStore } from "../services/fileStore";
import { decodeBase64Url, encodeBase64Url } from "../../../shared/lib/base64url";

function createPairingKey(): string {
  return encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

function createPairingKeyHash(pairingKey: string): string {
  return encodeBase64Url(createHash("sha256").update(decodeBase64Url(pairingKey)).digest());
}

function createEnvelope(input: {
  senderDeviceId: string;
  recipientUserId: string;
  keyEpoch: number;
  seed: string;
}) {
  return {
    envelopeVersion: 1 as const,
    senderDeviceId: input.senderDeviceId,
    recipientUserId: input.recipientUserId,
    keyEpoch: input.keyEpoch,
    contentHash: Buffer.from(`content:${input.seed}`).toString("base64"),
    nonce: Buffer.from(`nonce:${input.seed}`).toString("base64"),
    cipherText: Buffer.from(`cipher:${input.seed}`).toString("base64"),
    aad: Buffer.from(`aad:${input.seed}`).toString("base64"),
    createdAt: "2026-04-30T10:00:00.000Z",
  };
}

describe("sync-node api", () => {
  const servers: Array<{ close: (callback: (error?: Error) => void) => void }> = [];
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

  async function createTestServer(options?: { retentionWindow?: number }) {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "tatac-sync-node-"));
    tempDirs.push(tempDir);

    const store = new FileBackedSyncNodeStore({
      filePath: path.join(tempDir, "node-store.json"),
      nodeId: "node_test",
      retentionWindow: options?.retentionWindow,
    });
    const app = express();
    app.use(express.json());
    app.use(
      "/api/v1",
      createApiRouter(store, {
        getBootstrapInfo: () => ({
          candidateUrls: ["http://127.0.0.1:4110", "http://192.168.0.10:4110"],
          candidates: [
            {
              url: "http://127.0.0.1:4110",
              label: "Loopback",
              kind: "loopback",
              address: "127.0.0.1",
            },
            {
              url: "http://192.168.0.10:4110",
              label: "Wi-Fi (192.168.0.10)",
              kind: "lan",
              address: "192.168.0.10",
              interfaceName: "Wi-Fi",
            },
          ],
          defaultCandidateUrl: "http://192.168.0.10:4110",
        }),
      }),
    );

    const server = app.listen(0);
    servers.push(server);
    const port = (server.address() as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${port}/api/v1`;

    return {
      baseUrl,
      store,
    };
  }

  async function register(baseUrl: string, deviceId: string, keyEpoch = 1) {
    return fetch(`${baseUrl}/register-device`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "u_test",
        keyEpoch,
        deviceId,
        deviceName: `Device ${deviceId}`,
        clientVersion: "0.1.0",
      }),
    }).then((response) => response.json());
  }

  it("registers a device and supports push/pull within the same epoch", async () => {
    const { baseUrl } = await createTestServer();

    const registerResponse = await register(baseUrl, "d_test", 1);
    expect(registerResponse.ok).toBe(true);
    expect(registerResponse.nodeId).toBe("node_test");

    const pushResponse = await fetch(`${baseUrl}/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "u_test",
        keyEpoch: 1,
        deviceId: "d_test",
        envelopes: [createEnvelope({
          senderDeviceId: "d_test",
          recipientUserId: "u_test",
          keyEpoch: 1,
          seed: "one",
        })],
      }),
    }).then((response) => response.json());

    expect(pushResponse.ok).toBe(true);
    expect(pushResponse.accepted).toBe(1);
    expect(pushResponse.acceptedContentHashes).toHaveLength(1);
    expect(pushResponse.lastSeq).toBe(1);

    const pullResponse = await fetch(`${baseUrl}/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "u_test",
        keyEpoch: 1,
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

  it("returns bootstrap candidates without realtime metadata", async () => {
    const { baseUrl } = await createTestServer();

    const response = await fetch(`${baseUrl}/bootstrap`).then((result) => result.json());

    expect(response.ok).toBe(true);
    expect(response.nodeId).toBe("node_test");
    expect(response.defaultCandidateUrl).toBe("http://192.168.0.10:4110");
    expect(response.candidates).toHaveLength(2);
    expect(response.candidates[1].interfaceName).toBe("Wi-Fi");
    expect(response.realtime).toBeUndefined();
  });

  it("isolates envelopes by key epoch and suppresses duplicate pushes", async () => {
    const { baseUrl } = await createTestServer();
    await register(baseUrl, "d_test", 1);
    await register(baseUrl, "d_test", 2);

    const epochOneEnvelope = createEnvelope({
      senderDeviceId: "d_test",
      recipientUserId: "u_test",
      keyEpoch: 1,
      seed: "epoch-one",
    });
    const epochTwoEnvelope = createEnvelope({
      senderDeviceId: "d_test",
      recipientUserId: "u_test",
      keyEpoch: 2,
      seed: "epoch-two",
    });

    const firstPush = await fetch(`${baseUrl}/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "u_test",
        keyEpoch: 1,
        deviceId: "d_test",
        envelopes: [epochOneEnvelope, epochOneEnvelope],
      }),
    }).then((response) => response.json());

    expect(firstPush.accepted).toBe(1);
    expect(firstPush.acceptedContentHashes).toEqual([epochOneEnvelope.contentHash]);

    await fetch(`${baseUrl}/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "u_test",
        keyEpoch: 2,
        deviceId: "d_test",
        envelopes: [epochTwoEnvelope],
      }),
    }).then((response) => response.json());

    const epochOnePull = await fetch(`${baseUrl}/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "u_test",
        keyEpoch: 1,
        deviceId: "d_epoch_one",
        afterSeq: 0,
        limit: 200,
      }),
    }).then((response) => response.json());

    const epochTwoPull = await fetch(`${baseUrl}/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "u_test",
        keyEpoch: 2,
        deviceId: "d_epoch_two",
        afterSeq: 0,
        limit: 200,
      }),
    }).then((response) => response.json());

    expect(epochOnePull.items).toHaveLength(1);
    expect(epochOnePull.items[0].envelope.keyEpoch).toBe(1);
    expect(epochTwoPull.items).toHaveLength(1);
    expect(epochTwoPull.items[0].envelope.keyEpoch).toBe(2);
  });

  it("prunes old envelopes after active devices advance beyond the retention window", async () => {
    const { baseUrl } = await createTestServer({ retentionWindow: 1 });
    await register(baseUrl, "d_a", 1);
    await register(baseUrl, "d_b", 1);

    for (const seed of ["one", "two", "three"]) {
      await fetch(`${baseUrl}/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: "u_test",
          keyEpoch: 1,
          deviceId: "d_a",
          envelopes: [
            createEnvelope({
              senderDeviceId: "d_a",
              recipientUserId: "u_test",
              keyEpoch: 1,
              seed,
            }),
          ],
        }),
      });
    }

    await fetch(`${baseUrl}/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "u_test",
        keyEpoch: 1,
        deviceId: "d_a",
        afterSeq: 0,
        limit: 200,
      }),
    });
    await fetch(`${baseUrl}/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "u_test",
        keyEpoch: 1,
        deviceId: "d_b",
        afterSeq: 0,
        limit: 200,
      }),
    });

    await fetch(`${baseUrl}/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "u_test",
        keyEpoch: 1,
        deviceId: "d_a",
        envelopes: [
          createEnvelope({
            senderDeviceId: "d_a",
            recipientUserId: "u_test",
            keyEpoch: 1,
            seed: "four",
          }),
        ],
      }),
    });

    const retained = await fetch(`${baseUrl}/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "u_test",
        keyEpoch: 1,
        deviceId: "d_a",
        afterSeq: 0,
        limit: 200,
      }),
    }).then((response) => response.json());

    expect(retained.items.length).toBeLessThan(4);
    expect(retained.items[retained.items.length - 1].envelope.contentHash).toBe(
      Buffer.from("content:four").toString("base64"),
    );
  });

  it("creates and consumes a one-time pairing session", async () => {
    const { baseUrl } = await createTestServer();
    const pairingKey = createPairingKey();
    const pairingKeyHash = createPairingKeyHash(pairingKey);

    const created = await fetch(`${baseUrl}/pairing-sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pairingKeyHash,
        bundle: {
          pairingVersion: 1,
          nonce: "bm9uY2UxMjM0NTY3OA==",
          cipherText: "Y2lwaGVyVGV4dA==",
          aad: "YWFk",
          createdAt: "2026-04-30T10:00:00.000Z",
          expiresAt: "2099-04-30T10:10:00.000Z",
        },
      }),
    }).then((response) => response.json());

    expect(created.ok).toBe(true);
    expect(created.sessionId).toMatch(/^ps_/);

    const consumed = await fetch(`${baseUrl}/consume-pairing-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: created.sessionId,
        pairingKey,
      }),
    });

    const consumedBody = await consumed.json();
    expect(consumed.status).toBe(200);
    expect(consumedBody.ok).toBe(true);

    const secondAttempt = await fetch(`${baseUrl}/consume-pairing-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: created.sessionId,
        pairingKey,
      }),
    });

    const secondBody = await secondAttempt.json();
    expect(secondAttempt.status).toBe(409);
    expect(secondBody.error.code).toBe("PAIRING_ALREADY_USED");
  });

  it("rejects expired pairing sessions", async () => {
    const { baseUrl } = await createTestServer();
    const pairingKey = createPairingKey();
    const pairingKeyHash = createPairingKeyHash(pairingKey);

    const created = await fetch(`${baseUrl}/pairing-sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pairingKeyHash,
        bundle: {
          pairingVersion: 1,
          nonce: "bm9uY2UxMjM0NTY3OA==",
          cipherText: "Y2lwaGVyVGV4dA==",
          aad: "YWFk",
          createdAt: "2026-04-30T10:00:00.000Z",
          expiresAt: "2000-04-30T10:10:00.000Z",
        },
      }),
    }).then((response) => response.json());

    const consumed = await fetch(`${baseUrl}/consume-pairing-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: created.sessionId,
        pairingKey,
      }),
    });

    const consumedBody = await consumed.json();
    expect([404, 409]).toContain(consumed.status);
    expect(["PAIRING_NOT_FOUND", "PAIRING_EXPIRED"]).toContain(consumedBody.error.code);
  });
});
