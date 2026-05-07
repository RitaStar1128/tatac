import { encodeBase64Url } from "@shared/lib/base64url";
import type { PairingBundlePayload, SyncNodeCandidate } from "@shared/contracts";

import { clearLocalNotesAndOps, getLocalSyncDataSummary, type LocalSyncDataSummary } from "@/domains/notes/noteRepository";

import { getOrCreateSyncConfig, replaceSyncGroupSettings, saveSyncSettingsDraft } from "./syncSettingsStore";
import { assertSyncEnvironmentSupported, getSyncEnvironmentSupport } from "./syncEnvironment";
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

const DEFAULT_BOOTSTRAP_URLS = ["http://127.0.0.1:4010", "http://127.0.0.1:4110"] as const;
const DEFAULT_BOOTSTRAP_URL = DEFAULT_BOOTSTRAP_URLS[0];
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

function getBootstrapTargets(preferredBootstrapUrl?: string): string[] {
  const targets = new Set<string>();
  const normalizedPreferredBootstrapUrl = preferredBootstrapUrl?.trim();

  if (normalizedPreferredBootstrapUrl) {
    targets.add(normalizedPreferredBootstrapUrl);
  }

  for (const defaultBootstrapUrl of DEFAULT_BOOTSTRAP_URLS) {
    targets.add(defaultBootstrapUrl);
  }

  return Array.from(targets);
}

async function fetchFirstReachableBootstrap(preferredBootstrapUrl?: string): Promise<{
  bootstrapTarget: string;
  bootstrap: Awaited<ReturnType<typeof fetchBootstrap>>;
}> {
  let lastError: unknown;

  for (const bootstrapTarget of getBootstrapTargets(preferredBootstrapUrl)) {
    const support = getSyncEnvironmentSupport(bootstrapTarget);
    if (!support.supported) {
      lastError = new Error(
        "This hosted HTTPS app cannot enable LAN sync. Open TATAC from a local HTTP URL on the PC first.",
      );
      continue;
    }

    try {
      const bootstrap = await fetchBootstrap(bootstrapTarget);
      return {
        bootstrapTarget,
        bootstrap,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Could not reach the local sync node on this device.");
}

export interface EnableSyncResult {
  config: Awaited<ReturnType<typeof getOrCreateSyncConfig>>;
  nodeId: string;
  serverTime: string;
  candidateUrls: string[];
  candidates: SyncNodeCandidate[];
  needsCandidateSelection: boolean;
  selectedSyncNodeUrl: string | null;
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

export interface LocalSyncHostCapability {
  supported: boolean;
  canEnableOnThisDevice: boolean;
  reason: "ok" | "unsupported-environment" | "localhost-node-unreachable";
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
  const bootstrapResult = await fetchFirstReachableBootstrap(input?.preferredBootstrapUrl);
  const [config, bootstrap, persistedSecret] = await Promise.all([
    getOrCreateSyncConfig(),
    Promise.resolve(bootstrapResult.bootstrap),
    getPersistedSyncSecret(),
  ]);

  const groupSecret = persistedSecret?.groupSecret ?? getSyncSessionSecret()?.passphrase ?? createGroupSecret();
  await savePersistedSyncSecret({
    groupSecret,
    origin: persistedSecret?.origin ?? "generated",
  });
  setSyncSessionSecret({ passphrase: groupSecret });

  if (bootstrap.candidates.length === 1) {
    const updatedConfig = await commitSelectedSyncNodeUrl(bootstrap.defaultCandidateUrl);
    return {
      config: updatedConfig,
      nodeId: bootstrap.nodeId,
      serverTime: bootstrap.serverTime,
      candidateUrls: bootstrap.candidateUrls,
      candidates: bootstrap.candidates,
      needsCandidateSelection: false,
      selectedSyncNodeUrl: updatedConfig.syncNodeUrl,
    };
  }

  return {
    config,
    nodeId: bootstrap.nodeId,
    serverTime: bootstrap.serverTime,
    candidateUrls: bootstrap.candidateUrls,
    candidates: bootstrap.candidates,
    needsCandidateSelection: true,
    selectedSyncNodeUrl: null,
  };
}

export async function probeLocalSyncHost(input?: {
  preferredBootstrapUrl?: string;
}): Promise<LocalSyncHostCapability> {
  const supportsAnyBootstrapTarget = getBootstrapTargets(input?.preferredBootstrapUrl).some(
    (bootstrapTarget) => getSyncEnvironmentSupport(bootstrapTarget).supported,
  );
  if (!supportsAnyBootstrapTarget) {
    return {
      supported: false,
      canEnableOnThisDevice: false,
      reason: "unsupported-environment",
    };
  }

  try {
    await fetchFirstReachableBootstrap(input?.preferredBootstrapUrl);
    return {
      supported: true,
      canEnableOnThisDevice: true,
      reason: "ok",
    };
  } catch {
    return {
      supported: true,
      canEnableOnThisDevice: false,
      reason: "localhost-node-unreachable",
    };
  }
}

export async function commitSelectedSyncNodeUrl(syncNodeUrl: string): Promise<Awaited<ReturnType<typeof getOrCreateSyncConfig>>> {
  const normalizedSyncNodeUrl = syncNodeUrl.trim();
  assertSyncEnvironmentSupported(normalizedSyncNodeUrl);
  const config = await getOrCreateSyncConfig();
  return saveSyncSettingsDraft({
    userId: config.userId,
    keyEpoch: config.keyEpoch,
    deviceName: config.deviceName,
    syncNodeUrl: normalizedSyncNodeUrl,
    salt: config.salt,
  });
}

export async function createPairingSessionForMobile(input?: {
  syncNodeUrlOverride?: string;
}): Promise<PairingSessionResult> {
  const config = await getOrCreateSyncConfig();
  const selectedNodeUrl = input?.syncNodeUrlOverride?.trim() || config.syncNodeUrl;
  if (!selectedNodeUrl) {
    throw new Error("Enable sync on this PC before adding another device.");
  }
  assertSyncEnvironmentSupported(selectedNodeUrl);

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
