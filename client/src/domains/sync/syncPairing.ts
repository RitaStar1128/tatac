import { encodeBase64Url } from "@shared/lib/base64url";

import { getOrCreateSyncConfig, saveSyncSettingsDraft } from "./syncSettingsStore";
import { savePersistedSyncSecret, getPersistedSyncSecret } from "./persistedSyncSecretStore";
import { getSyncSessionSecret, setSyncSessionSecret } from "./sessionSecretStore";
import { syncWithNode, type SyncRunResult } from "./syncEngine";
import { createPairingKey, createPairingKeyHash, decryptPairingBundle, encryptPairingBundle } from "./pairingCrypto";
import { consumePairingSession, createPairingSession, fetchBootstrap } from "./syncTransport";

const DEFAULT_BOOTSTRAP_URL = "http://127.0.0.1:4010";
const DEFAULT_PAIRING_TTL_MS = 10 * 60 * 1000;
const PRODUCTION_PAIRING_APP_URL = "https://tatac.vercel.app/sync-pair";
const textEncoder = new TextEncoder();

function nowIso(): string {
  return new Date().toISOString();
}

function createGroupSecret(): string {
  return encodeBase64Url(crypto.getRandomValues(new Uint8Array(24)));
}

function resolvePairingAppUrl(): string {
  if (typeof window !== "undefined") {
    const { origin, hostname } = window.location;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return `${origin}/sync-pair`;
    }
  }

  return PRODUCTION_PAIRING_APP_URL;
}

function encodeStringAsBase64Url(value: string): string {
  return encodeBase64Url(textEncoder.encode(value));
}

export interface EnableSyncResult {
  config: Awaited<ReturnType<typeof getOrCreateSyncConfig>>;
  nodeId: string;
  serverTime: string;
  candidateUrls: string[];
}

export interface PairingSessionResult {
  pairingUrl: string;
  expiresAt: string;
  sessionId: string;
}

export interface PairingConsumeResult {
  sourceDeviceName: string;
  sourceDeviceId: string;
  syncResult: SyncRunResult;
}

export async function enableSyncOnThisDevice(input?: {
  preferredBootstrapUrl?: string;
}): Promise<EnableSyncResult> {
  const bootstrapTarget = input?.preferredBootstrapUrl?.trim() || DEFAULT_BOOTSTRAP_URL;
  const [config, bootstrap, persistedSecret] = await Promise.all([
    getOrCreateSyncConfig(),
    fetchBootstrap(bootstrapTarget),
    getPersistedSyncSecret(),
  ]);

  const groupSecret = persistedSecret?.groupSecret ?? getSyncSessionSecret()?.passphrase ?? createGroupSecret();
  await savePersistedSyncSecret({
    groupSecret,
    origin: persistedSecret?.origin ?? "generated",
  });
  setSyncSessionSecret({ passphrase: groupSecret });

  const updatedConfig = await saveSyncSettingsDraft({
    userId: config.userId,
    deviceName: config.deviceName,
    syncNodeUrl: bootstrap.defaultCandidateUrl,
    salt: config.salt,
  });

  return {
    config: updatedConfig,
    nodeId: bootstrap.nodeId,
    serverTime: bootstrap.serverTime,
    candidateUrls: bootstrap.candidateUrls,
  };
}

export async function createPairingSessionForMobile(): Promise<PairingSessionResult> {
  const config = await getOrCreateSyncConfig();
  if (!config.syncNodeUrl) {
    throw new Error("Enable sync on this PC before adding another device.");
  }

  const persistedSecret = await getPersistedSyncSecret();
  const groupSecret = persistedSecret?.groupSecret ?? getSyncSessionSecret()?.passphrase;
  if (!groupSecret) {
    throw new Error("The sync secret is not ready on this device yet.");
  }

  const bootstrap = await fetchBootstrap(config.syncNodeUrl);
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + DEFAULT_PAIRING_TTL_MS).toISOString();
  const pairingKey = createPairingKey();
  const bundle = await encryptPairingBundle(
    {
      pairingVersion: 1,
      syncGroupId: config.userId,
      groupSecret,
      salt: config.salt,
      syncNodeUrl: bootstrap.defaultCandidateUrl,
      sourceDeviceId: config.deviceId,
      sourceDeviceName: config.deviceName,
      createdAt,
      expiresAt,
    },
    pairingKey,
  );

  const pairingKeyHash = await createPairingKeyHash(pairingKey);
  const created = await createPairingSession(config.syncNodeUrl, {
    pairingKeyHash,
    bundle,
  });

  const pairingUrl = new URL(resolvePairingAppUrl());
  pairingUrl.searchParams.set("node", encodeStringAsBase64Url(bootstrap.defaultCandidateUrl));
  pairingUrl.searchParams.set("sid", created.sessionId);
  pairingUrl.hash = `k=${pairingKey}`;

  return {
    pairingUrl: pairingUrl.toString(),
    expiresAt: created.expiresAt,
    sessionId: created.sessionId,
  };
}

export async function consumePairingFromLink(input: {
  syncNodeUrl: string;
  sessionId: string;
  pairingKey: string;
}): Promise<PairingConsumeResult> {
  const consumed = await consumePairingSession(input.syncNodeUrl, {
    sessionId: input.sessionId,
    pairingKey: input.pairingKey,
  });
  const payload = await decryptPairingBundle(consumed.bundle, input.pairingKey);
  const currentConfig = await getOrCreateSyncConfig();

  await saveSyncSettingsDraft({
    userId: payload.syncGroupId,
    deviceName: currentConfig.deviceName,
    syncNodeUrl: payload.syncNodeUrl,
    salt: payload.salt,
  });
  await savePersistedSyncSecret({
    groupSecret: payload.groupSecret,
    origin: "paired",
  });
  setSyncSessionSecret({ passphrase: payload.groupSecret });

  const syncResult = await syncWithNode();

  return {
    sourceDeviceName: payload.sourceDeviceName,
    sourceDeviceId: payload.sourceDeviceId,
    syncResult,
  };
}

export function getDefaultBootstrapUrl(): string {
  return DEFAULT_BOOTSTRAP_URL;
}
