import {
  realtimeDirectEnvelopeBatchSchema,
  realtimeServerMessageSchema,
  type BootstrapResponse,
  type EncryptedEnvelope,
  type PersistedSyncConfig,
  type RealtimePeer,
  type RealtimeServerMessage,
} from "@shared/contracts";

import { applyInboundNoteOp, subscribeToLocalNoteOps } from "@/domains/notes/noteRepository";

import { decryptSignalingPayload, encryptSignalingPayload } from "./signalingCrypto";
import { getRealtimeSyncState, setRealtimeSyncState, type RealtimeTransportStatus } from "./realtimeSyncState";
import { resolveEffectiveSyncPassphrase } from "./syncSecretResolver";
import { pullAndApplyFromNode, pushSpecificNoteOpsToNode, syncWithNode } from "./syncEngine";
import { fetchBootstrap } from "./syncTransport";
import { decryptEnvelopeToNoteOp, encryptNoteOpToEnvelope } from "./syncCrypto";
import { getOrCreateSyncConfig, subscribeToSyncConfig } from "./syncSettingsStore";

interface PeerLink {
  peer: RealtimePeer;
  connection: RTCPeerConnection;
  channel: RTCDataChannel | null;
  path: "direct" | "turn" | "unknown";
  pendingRemoteCandidates: RTCIceCandidateInit[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function isVisible(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "visible";
}

function buildRuntimeSignature(config: PersistedSyncConfig): string {
  return JSON.stringify({
    userId: config.userId,
    keyEpoch: config.keyEpoch,
    deviceId: config.deviceId,
    deviceName: config.deviceName,
    syncNodeUrl: config.syncNodeUrl,
    transportMode: config.transportMode,
    lanSyncEnabled: config.lanSyncEnabled,
    salt: config.salt,
  } satisfies Pick<
    PersistedSyncConfig,
    | "userId"
    | "keyEpoch"
    | "deviceId"
    | "deviceName"
    | "syncNodeUrl"
    | "transportMode"
    | "lanSyncEnabled"
    | "salt"
  >);
}

function shouldUseLanDirect(config: PersistedSyncConfig): boolean {
  return config.lanSyncEnabled && config.transportMode === "lan-direct" && Boolean(config.syncNodeUrl);
}

async function parseChannelData(
  data: string | Blob | ArrayBuffer | ArrayBufferView,
): Promise<string> {
  if (typeof data === "string") {
    return data;
  }

  if (data instanceof Blob) {
    return await data.text();
  }

  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(new Uint8Array(data));
  }

  return new TextDecoder().decode(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
}

async function inferPeerPath(
  connection: RTCPeerConnection,
): Promise<PeerLink["path"]> {
  const stats = await connection.getStats();
  let selectedPairId: string | null = null;

  for (const report of Array.from(stats.values())) {
    if (report.type === "transport" && "selectedCandidatePairId" in report) {
      selectedPairId = report.selectedCandidatePairId ?? null;
      break;
    }
  }

  if (!selectedPairId) {
    for (const report of Array.from(stats.values())) {
      if (report.type === "candidate-pair" && report.selected) {
        selectedPairId = report.id;
        break;
      }
    }
  }

  if (!selectedPairId) {
    return "unknown";
  }

  const pair = stats.get(selectedPairId);
  if (!pair || pair.type !== "candidate-pair") {
    return "unknown";
  }

  const localCandidate =
    pair.localCandidateId ? stats.get(pair.localCandidateId) : null;
  const remoteCandidate =
    pair.remoteCandidateId ? stats.get(pair.remoteCandidateId) : null;
  const localType =
    localCandidate && "candidateType" in localCandidate ? localCandidate.candidateType : null;
  const remoteType =
    remoteCandidate && "candidateType" in remoteCandidate ? remoteCandidate.candidateType : null;

  if (localType === "relay" || remoteType === "relay") {
    return "turn";
  }

  if (localType || remoteType) {
    return "direct";
  }

  return "unknown";
}

class SyncCoordinator {
  private started = false;
  private currentSignature: string | null = null;
  private ws: WebSocket | null = null;
  private activeConfig: PersistedSyncConfig | null = null;
  private activePassphrase: string | null = null;
  private bootstrap: BootstrapResponse["realtime"] | null = null;
  private onlinePeers = new Map<string, RealtimePeer>();
  private peerLinks = new Map<string, PeerLink>();
  private configUnsubscribe: (() => void) | null = null;
  private localNoteUnsubscribe: (() => void) | null = null;
  private pingIntervalId: number | null = null;
  private relayHintTimerId: number | null = null;
  private refreshGeneration = 0;

  start(): void {
    if (this.started || typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    this.started = true;
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    window.addEventListener("pagehide", this.handlePageHide);
    this.configUnsubscribe = subscribeToSyncConfig((config) => {
      const nextSignature = buildRuntimeSignature(config);
      if (nextSignature !== this.currentSignature) {
        void this.refresh();
      }
    });
    this.localNoteUnsubscribe = subscribeToLocalNoteOps((op) => {
      void this.handleLocalNoteOp(op);
    });
    void this.refresh();
  }

  stop(): void {
    if (!this.started) {
      return;
    }

    this.started = false;
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    window.removeEventListener("pagehide", this.handlePageHide);
    this.configUnsubscribe?.();
    this.localNoteUnsubscribe?.();
    this.configUnsubscribe = null;
    this.localNoteUnsubscribe = null;
    this.teardownRealtime(false);
  }

  private readonly handleVisibilityChange = () => {
    void this.refresh();
  };

  private readonly handlePageHide = () => {
    this.sendPresenceLeave();
    this.teardownRealtime(this.activeConfig?.lanSyncEnabled ?? false);
  };

  async refresh(): Promise<void> {
    if (!this.started) {
      return;
    }

    const generation = ++this.refreshGeneration;
    const config = await getOrCreateSyncConfig();
    const signature = buildRuntimeSignature(config);

    setRealtimeSyncState((current) => ({
      ...current,
      lanSyncEnabled: config.lanSyncEnabled,
      lastUpdatedAt: nowIso(),
    }));

    if (!shouldUseLanDirect(config) || !isVisible()) {
      this.currentSignature = signature;
      this.teardownRealtime(config.lanSyncEnabled);
      return;
    }

    let passphrase: string;
    try {
      passphrase = await resolveEffectiveSyncPassphrase();
    } catch (error) {
      this.currentSignature = signature;
      this.teardownRealtime(config.lanSyncEnabled, error instanceof Error ? error.message : "Sync secret is missing.");
      return;
    }

    if (
      generation === this.refreshGeneration &&
      this.currentSignature === signature &&
      this.ws?.readyState === WebSocket.OPEN
    ) {
      this.activeConfig = config;
      this.activePassphrase = passphrase;
      this.updateTransportState();
      return;
    }

    try {
      const bootstrap = await fetchBootstrap(config.syncNodeUrl!);
      if (generation !== this.refreshGeneration) {
        return;
      }

      this.teardownRealtime(config.lanSyncEnabled);
      this.currentSignature = signature;
      this.activeConfig = config;
      this.activePassphrase = passphrase;
      this.bootstrap = bootstrap.realtime;

      await syncWithNode();
      if (generation !== this.refreshGeneration) {
        return;
      }

      this.openRealtimeSocket(bootstrap.realtime.signalingWebSocketUrl);
    } catch (error) {
      this.currentSignature = signature;
      this.teardownRealtime(
        config.lanSyncEnabled,
        error instanceof Error ? error.message : "Unable to start LAN direct sync.",
      );
    }
  }

  private openRealtimeSocket(signalingWebSocketUrl: string): void {
    const socket = new WebSocket(signalingWebSocketUrl);
    this.ws = socket;

    socket.addEventListener("open", () => {
      if (!this.activeConfig) {
        return;
      }

      socket.send(
        JSON.stringify({
          type: "presence.register",
          userId: this.activeConfig.userId,
          keyEpoch: this.activeConfig.keyEpoch,
          deviceId: this.activeConfig.deviceId,
          deviceName: this.activeConfig.deviceName,
        } satisfies Parameters<typeof JSON.stringify>[0]),
      );

      this.startPingLoop();
      this.updateTransportState();
    });

    socket.addEventListener("message", (event) => {
      void this.handleRealtimeMessage(event.data);
    });

    socket.addEventListener("close", () => {
      this.stopPingLoop();
      this.onlinePeers.clear();
      this.closeAllPeers();
      this.updateTransportState("Realtime signaling disconnected.");
      if (this.started && shouldUseLanDirect(this.activeConfig ?? ({} as PersistedSyncConfig)) && isVisible()) {
        window.setTimeout(() => {
          void this.refresh();
        }, 1_000);
      }
    });

    socket.addEventListener("error", () => {
      this.updateTransportState("Realtime signaling failed.");
    });
  }

  private startPingLoop(): void {
    this.stopPingLoop();
    this.pingIntervalId = window.setInterval(() => {
      if (this.ws?.readyState !== WebSocket.OPEN) {
        return;
      }

      this.ws.send(
        JSON.stringify({
          type: "ping",
          sentAt: nowIso(),
        }),
      );
    }, 20_000);
  }

  private stopPingLoop(): void {
    if (this.pingIntervalId !== null) {
      window.clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }
  }

  private sendPresenceLeave(): void {
    if (!this.activeConfig || this.ws?.readyState !== WebSocket.OPEN) {
      return;
    }

    this.ws.send(
      JSON.stringify({
        type: "presence.leave",
        userId: this.activeConfig.userId,
        keyEpoch: this.activeConfig.keyEpoch,
        deviceId: this.activeConfig.deviceId,
      }),
    );
  }

  private teardownRealtime(lanSyncEnabled: boolean, lastError: string | null = null): void {
    this.stopPingLoop();
    if (this.relayHintTimerId !== null) {
      window.clearTimeout(this.relayHintTimerId);
      this.relayHintTimerId = null;
    }
    this.sendPresenceLeave();
    this.ws?.close();
    this.ws = null;
    this.bootstrap = null;
    this.onlinePeers.clear();
    this.closeAllPeers();
    this.activeConfig = lanSyncEnabled ? this.activeConfig : null;
    this.activePassphrase = lanSyncEnabled ? this.activePassphrase : null;

    setRealtimeSyncState((current) => ({
      ...current,
      lanSyncEnabled,
      signalingConnected: false,
      connectedPeerCount: 0,
      transportStatus: "disconnected",
      lastError,
      lastUpdatedAt: nowIso(),
    }));
  }

  private closeAllPeers(): void {
    for (const link of Array.from(this.peerLinks.values())) {
      link.channel?.close();
      link.connection.close();
    }
    this.peerLinks.clear();
  }

  private async handleRealtimeMessage(rawData: string | Blob | ArrayBuffer): Promise<void> {
    try {
      const text = typeof rawData === "string" ? rawData : await parseChannelData(rawData);
      const message = realtimeServerMessageSchema.parse(JSON.parse(text));
      await this.dispatchRealtimeMessage(message);
    } catch (error) {
      this.updateTransportState(error instanceof Error ? error.message : "Invalid realtime message.");
    }
  }

  private async dispatchRealtimeMessage(message: RealtimeServerMessage): Promise<void> {
    switch (message.type) {
      case "presence.snapshot":
        this.onlinePeers.clear();
        for (const peer of Array.from(message.peers)) {
          if (peer.deviceId !== this.activeConfig?.deviceId) {
            this.onlinePeers.set(peer.deviceId, peer);
          }
        }
        for (const peer of Array.from(this.onlinePeers.values())) {
          await this.ensurePeerConnection(peer);
        }
        this.updateTransportState();
        return;
      case "peer.joined":
        if (message.peer.deviceId === this.activeConfig?.deviceId) {
          return;
        }
        this.onlinePeers.set(message.peer.deviceId, message.peer);
        await this.ensurePeerConnection(message.peer);
        this.updateTransportState();
        return;
      case "peer.left":
        this.onlinePeers.delete(message.deviceId);
        this.closePeer(message.deviceId);
        this.updateTransportState();
        return;
      case "signal.deliver":
        await this.handleIncomingSignal(message);
        return;
      case "relay.hint":
        this.scheduleRelayCatchUp();
        return;
      case "pong":
        return;
      case "error":
        this.updateTransportState(message.message);
        return;
    }
  }

  private shouldOfferTo(peerDeviceId: string): boolean {
    return Boolean(this.activeConfig && this.activeConfig.deviceId.localeCompare(peerDeviceId) < 0);
  }

  private async ensurePeerConnection(peer: RealtimePeer): Promise<PeerLink> {
    const existing = this.peerLinks.get(peer.deviceId);
    if (existing) {
      existing.peer = peer;
      return existing;
    }

    const connection = new RTCPeerConnection({
      iceServers: (this.bootstrap?.iceServers ?? []) as RTCIceServer[],
    });
    const link: PeerLink = {
      peer,
      connection,
      channel: null,
      path: "unknown",
      pendingRemoteCandidates: [],
    };

    connection.addEventListener("icecandidate", (event) => {
      if (!event.candidate || !this.activeConfig || !this.activePassphrase) {
        return;
      }

      void this.sendSignalingPayload(peer.deviceId, {
        kind: "ice-candidate",
        candidate: {
          candidate: event.candidate.candidate ?? "",
          sdpMid: event.candidate.sdpMid ?? null,
          sdpMLineIndex: event.candidate.sdpMLineIndex ?? null,
          usernameFragment: event.candidate.usernameFragment ?? undefined,
        },
      });
    });

    connection.addEventListener("connectionstatechange", () => {
      const state = connection.connectionState;
      if (state === "failed" || state === "closed" || state === "disconnected") {
        this.closePeer(peer.deviceId);
        const onlinePeer = this.onlinePeers.get(peer.deviceId);
        if (onlinePeer && this.ws?.readyState === WebSocket.OPEN) {
          void this.ensurePeerConnection(onlinePeer);
        }
      } else if (state === "connected") {
        void inferPeerPath(connection).then((path) => {
          const current = this.peerLinks.get(peer.deviceId);
          if (!current) {
            return;
          }
          current.path = path;
          this.updateTransportState();
        });
      }
      this.updateTransportState();
    });

    connection.addEventListener("datachannel", (event) => {
      this.attachDataChannel(peer.deviceId, event.channel);
    });

    if (this.shouldOfferTo(peer.deviceId)) {
      this.attachDataChannel(
        peer.deviceId,
        connection.createDataChannel("tatac-sync-v1", {
          ordered: true,
        }),
      );
    }

    this.peerLinks.set(peer.deviceId, link);

    if (this.shouldOfferTo(peer.deviceId)) {
      await this.sendOffer(peer.deviceId);
    }

    return link;
  }

  private attachDataChannel(peerDeviceId: string, channel: RTCDataChannel): void {
    const link = this.peerLinks.get(peerDeviceId);
    if (!link) {
      channel.close();
      return;
    }

    link.channel = channel;
    channel.addEventListener("open", () => {
      void inferPeerPath(link.connection).then((path) => {
        link.path = path;
        this.updateTransportState();
      });
      this.updateTransportState();
    });
    channel.addEventListener("close", () => {
      this.updateTransportState();
    });
    channel.addEventListener("message", (event) => {
      void this.handleDirectEnvelopeMessage(event.data);
    });
  }

  private async sendOffer(peerDeviceId: string): Promise<void> {
    const link = this.peerLinks.get(peerDeviceId);
    if (!link) {
      return;
    }

    const offer = await link.connection.createOffer();
    await link.connection.setLocalDescription(offer);
    await this.sendSignalingPayload(peerDeviceId, {
      kind: "offer",
      sdp: offer.sdp ?? "",
    });
  }

  private async sendSignalingPayload(
    peerDeviceId: string,
    payload: Parameters<typeof encryptSignalingPayload>[0]["payload"],
  ): Promise<void> {
    if (!this.activeConfig || !this.activePassphrase || this.ws?.readyState !== WebSocket.OPEN) {
      return;
    }

    const encrypted = await encryptSignalingPayload({
      payload,
      config: this.activeConfig,
      passphrase: this.activePassphrase,
      toDeviceId: peerDeviceId,
    });

    this.ws.send(
      JSON.stringify({
        type: "signal.forward",
        userId: this.activeConfig.userId,
        keyEpoch: this.activeConfig.keyEpoch,
        fromDeviceId: this.activeConfig.deviceId,
        toDeviceId: peerDeviceId,
        payload: encrypted,
      }),
    );
  }

  private async handleIncomingSignal(
    message: Extract<RealtimeServerMessage, { type: "signal.deliver" }>,
  ): Promise<void> {
    if (!this.activeConfig || !this.activePassphrase) {
      return;
    }

    const onlinePeer =
      this.onlinePeers.get(message.fromDeviceId) ??
      ({
        deviceId: message.fromDeviceId,
        deviceName: message.fromDeviceId,
        joinedAt: nowIso(),
      } satisfies RealtimePeer);
    this.onlinePeers.set(message.fromDeviceId, onlinePeer);
    const link = await this.ensurePeerConnection(onlinePeer);
    const { payload } = await decryptSignalingPayload({
      message: message.payload,
      config: this.activeConfig,
      passphrase: this.activePassphrase,
    });

    if (payload.kind === "offer") {
      await link.connection.setRemoteDescription({
        type: "offer",
        sdp: payload.sdp,
      });
      const answer = await link.connection.createAnswer();
      await link.connection.setLocalDescription(answer);
      await this.flushPendingCandidates(link);
      await this.sendSignalingPayload(message.fromDeviceId, {
        kind: "answer",
        sdp: answer.sdp ?? "",
      });
      return;
    }

    if (payload.kind === "answer") {
      await link.connection.setRemoteDescription({
        type: "answer",
        sdp: payload.sdp,
      });
      await this.flushPendingCandidates(link);
      return;
    }

    if (link.connection.remoteDescription) {
      await link.connection.addIceCandidate(payload.candidate);
      return;
    }

    link.pendingRemoteCandidates.push(payload.candidate);
  }

  private async flushPendingCandidates(link: PeerLink): Promise<void> {
    if (!link.connection.remoteDescription) {
      return;
    }

    while (link.pendingRemoteCandidates.length > 0) {
      const candidate = link.pendingRemoteCandidates.shift();
      if (!candidate) {
        continue;
      }
      await link.connection.addIceCandidate(candidate);
    }
  }

  private async handleDirectEnvelopeMessage(
    rawData: string | Blob | ArrayBuffer | ArrayBufferView,
  ): Promise<void> {
    if (!this.activeConfig || !this.activePassphrase) {
      return;
    }

    const text = await parseChannelData(rawData);
    const message = realtimeDirectEnvelopeBatchSchema.parse(JSON.parse(text));

    for (const envelope of Array.from(message.envelopes)) {
      const { op } = await decryptEnvelopeToNoteOp(
        envelope,
        this.activeConfig,
        this.activePassphrase,
      );
      await applyInboundNoteOp(op, "remote");
    }
  }

  private async handleLocalNoteOp(
    op: Parameters<typeof subscribeToLocalNoteOps>[0] extends (value: infer T) => void
      ? T
      : never,
  ): Promise<void> {
    const config = this.activeConfig ?? (await getOrCreateSyncConfig());
    if (!shouldUseLanDirect(config) || !isVisible()) {
      return;
    }

    const passphrase = this.activePassphrase ?? (await resolveEffectiveSyncPassphrase());
    const envelope = await encryptNoteOpToEnvelope(op, config, passphrase);
    this.broadcastDirectEnvelope(envelope);
    await pushSpecificNoteOpsToNode([op]);
  }

  private broadcastDirectEnvelope(envelope: EncryptedEnvelope): void {
    const payload = JSON.stringify(
      realtimeDirectEnvelopeBatchSchema.parse({
        type: "envelope.batch",
        envelopes: [envelope],
      }),
    );

    for (const link of Array.from(this.peerLinks.values())) {
      if (link.channel?.readyState === "open") {
        link.channel.send(payload);
      }
    }
  }

  private scheduleRelayCatchUp(): void {
    if (this.relayHintTimerId !== null) {
      return;
    }

    this.relayHintTimerId = window.setTimeout(() => {
      this.relayHintTimerId = null;
      void this.pullFromRelayHint();
    }, 250);
  }

  private async pullFromRelayHint(): Promise<void> {
    try {
      await pullAndApplyFromNode();
      this.updateTransportState();
    } catch (error) {
      this.updateTransportState(error instanceof Error ? error.message : "Unable to catch up from relay.");
    }
  }

  private closePeer(deviceId: string): void {
    const link = this.peerLinks.get(deviceId);
    if (!link) {
      return;
    }

    link.channel?.close();
    link.connection.close();
    this.peerLinks.delete(deviceId);
  }

  private updateTransportState(lastError: string | null = null): void {
    const signalingConnected = this.ws?.readyState === WebSocket.OPEN;
    const openLinks = Array.from(this.peerLinks.values()).filter(
      (link) => link.channel?.readyState === "open",
    );
    const connectedPeerCount = openLinks.length;
    const hasTurn = openLinks.some((link) => link.path === "turn");
    const hasDirect = openLinks.some((link) => link.path === "direct");
    const transportStatus: RealtimeTransportStatus =
      connectedPeerCount === 0
        ? signalingConnected
          ? "relay-only"
          : "disconnected"
        : hasDirect
          ? "direct"
          : hasTurn
            ? "turn"
            : "relay-only";

    setRealtimeSyncState((current) => ({
      ...current,
      lanSyncEnabled: this.activeConfig?.lanSyncEnabled ?? current.lanSyncEnabled,
      signalingConnected,
      connectedPeerCount,
      transportStatus,
      lastError,
      lastUpdatedAt: nowIso(),
    }));
  }
}

export const syncCoordinator = new SyncCoordinator();
