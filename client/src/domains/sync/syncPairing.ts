import { encodeBase64Url } from "@shared/lib/base64url";
import type { PairingBundlePayload, SyncNodeCandidate } from "@shared/contracts";

import { clearLocalNotesAndOps, getLocalSyncDataSummary, type LocalSyncDataSummary } from "@/domains/notes/noteRepository";

import { getOrCreateSyncConfig, replaceSyncGroupSettings, saveSyncSettingsDraft } from "./syncSettingsStore";
import {
  clearPersistedSyncSecret,
  getPersistedSyncSecret,
  savePersistedSyncSecret,
} from "./persistedSyncSecretStore";
import { clearSyncSessionSecret, getSyncSessionSecret, setSyncSessionSecret } from "./sessionSecretStore";
import { syncWithNode, type SyncRunResult } from "./syncEngine";
import { createPairingKey, createPairingKeyHash, decryptPairingBundle, encryptPairingBundle } from "./pairingCrypto";
import { clearAllSyncCursors } from "./syncCursorStore";
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
    const { origin } = window.location;
    if (origin.startsWith("http://") || origin.startsWith("https://")) {
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
  candidates: SyncNodeCandidate[];
}

export interface PairingSessionResult {
  pairingUrl: string;
  expiresAt: string;
  sessionId: string;
}

export interface PreparedPairingJoin {
  syncNodeUrl: string;
  sessionId: string;
  pairingKey: string;
  payload: PairingBundlePayload;
}

export interface PairingConsumeResult {
  sourceDeviceName: string;
  sourceDeviceId: string;
  syncResult: SyncRunResult;
}

export class PairingJoinBlockedError extends Error {
  readonly reason = "non-empty-device";
  readonly summary: LocalSyncDataSummary;
  readonly targetGroupId: string;

  constructor(summary: LocalSyncDataSummary, targetGroupId: string) {
    super("This device already has local notes from another sync group.");
    this.name = "PairingJoinBlockedError";
    this.summary = summary;
    this.targetGroupId = targetGroupId;
  }
}

export function isPairingJoinBlockedError(error: unknown): error is PairingJoinBlockedError {
  return error instanceof PairingJoinBlockedError;
}

function hasForeignLocalGroup(summary: LocalSyncDataSummary, targetGroupId: string): boolean {
  return summary.groupIds.some((groupId) => groupId !== targetGroupId);
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
    keyEpoch: config.keyEpoch,
    deviceName: config.deviceName,
    syncNodeUrl: bootstrap.defaultCandidateUrl,
    transportMode: "lan-direct",
    lanSyncEnabled: true,
    salt: config.salt,
  });

  return {
    config: updatedConfig,
    nodeId: bootstrap.nodeId,
    serverTime: bootstrap.serverTime,
    candidateUrls: bootstrap.candidateUrls,
    candidates: bootstrap.candidates,
  };
}

export async function createPairingSessionForMobile(input?: {
  syncNodeUrlOverride?: string;
}): Promise<PairingSessionResult> {
  const config = await getOrCreateSyncConfig();
  const selectedNodeUrl = input?.syncNodeUrlOverride?.trim() || config.syncNodeUrl;
  if (!selectedNodeUrl) {
    throw new Error("Enable sync on this PC before adding another device.");
  }

  const persistedSecret = await getPersistedSyncSecret();
  const groupSecret = persistedSecret?.groupSecret ?? getSyncSessionSecret()?.passphrase;
  if (!groupSecret) {
    throw new Error("The sync secret is not ready on this device yet.");
  }

  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + DEFAULT_PAIRING_TTL_MS).toISOString();
  const pairingKey = createPairingKey();
  const bundle = await encryptPairingBundle(
    {
      pairingVersion: 1,
      syncGroupId: config.userId,
      keyEpoch: config.keyEpoch,
      groupSecret,
      salt: config.salt,
      syncNodeUrl: selectedNodeUrl,
      sourceDeviceId: config.deviceId,
      sourceDeviceName: config.deviceName,
      createdAt,
      expiresAt,
    },
    pairingKey,
  );

  const pairingKeyHash = await createPairingKeyHash(pairingKey);
  const created = await createPairingSession(selectedNodeUrl, {
    pairingKeyHash,
    bundle,
  });

  const pairingUrl = new URL(resolvePairingAppUrl());
  pairingUrl.searchParams.set("node", encodeStringAsBase64Url(selectedNodeUrl));
  pairingUrl.searchParams.set("sid", created.sessionId);
  pairingUrl.hash = `k=${pairingKey}`;

  return {
    pairingUrl: pairingUrl.toString(),
    expiresAt: created.expiresAt,
    sessionId: created.sessionId,
  };
}

export async function preparePairingJoinFromLink(input: {
  syncNodeUrl: string;
  sessionId: string;
  pairingKey: string;
}): Promise<PreparedPairingJoin> {
  const consumed = await consumePairingSession(input.syncNodeUrl, {
    sessionId: input.sessionId,
    pairingKey: input.pairingKey,
  });
  const payload = await decryptPairingBundle(consumed.bundle, input.pairingKey);

  return {
    syncNodeUrl: input.syncNodeUrl,
    sessionId: input.sessionId,
    pairingKey: input.pairingKey,
    payload,
  };
}

export async function completePairingJoin(
  prepared: PreparedPairingJoin,
  options?: {
    allowDestructiveReset?: boolean;
  },
): Promise<PairingConsumeResult> {
  const currentConfig = await getOrCreateSyncConfig();
  const summary = await getLocalSyncDataSummary();

  if (hasForeignLocalGroup(summary, prepared.payload.syncGroupId) && !options?.allowDestructiveReset) {
    throw new PairingJoinBlockedError(summary, prepared.payload.syncGroupId);
  }

  if (options?.allowDestructiveReset) {
    await clearLocalNotesAndOps();
    await clearAllSyncCursors();
    await clearPersistedSyncSecret();
    clearSyncSessionSecret();
  }

  await replaceSyncGroupSettings({
    userId: prepared.payload.syncGroupId,
    keyEpoch: prepared.payload.keyEpoch,
    deviceName: currentConfig.deviceName,
    syncNodeUrl: prepared.payload.syncNodeUrl,
    transportMode: "lan-direct",
    lanSyncEnabled: true,
    salt: prepared.payload.salt,
  });
  await savePersistedSyncSecret({
    groupSecret: prepared.payload.groupSecret,
    origin: "paired",
  });
  setSyncSessionSecret({ passphrase: prepared.payload.groupSecret });

  const syncResult = await syncWithNode();

  return {
    sourceDeviceName: prepared.payload.sourceDeviceName,
    sourceDeviceId: prepared.payload.sourceDeviceId,
    syncResult,
  };
}

export async function consumePairingFromLink(input: {
  syncNodeUrl: string;
  sessionId: string;
  pairingKey: string;
}): Promise<PairingConsumeResult> {
  const prepared = await preparePairingJoinFromLink(input);
  return completePairingJoin(prepared);
}

export function getDefaultBootstrapUrl(): string {
  return DEFAULT_BOOTSTRAP_URL;
}
