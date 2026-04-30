import type { Server as HttpServer, IncomingMessage } from "node:http";

import {
  realtimeClientMessageSchema,
  realtimeErrorMessageSchema,
  realtimePongMessageSchema,
  realtimeServerMessageSchema,
  type RealtimeClientMessage,
  type RealtimePeer,
} from "../../../shared/contracts";
import { WebSocket, WebSocketServer } from "ws";

interface RealtimeSession {
  socket: WebSocket;
  userId: string;
  keyEpoch: number;
  deviceId: string;
  deviceName: string;
  joinedAt: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function groupKey(userId: string, keyEpoch: number): string {
  return `${userId}::${keyEpoch}`;
}

function isSocketOpen(socket: WebSocket): boolean {
  return socket.readyState === WebSocket.OPEN;
}

export class RealtimeHub {
  private readonly sessionsBySocket = new Map<WebSocket, RealtimeSession>();
  private readonly groups = new Map<string, Map<string, RealtimeSession>>();

  private send(socket: WebSocket, payload: unknown): void {
    if (!isSocketOpen(socket)) {
      return;
    }

    socket.send(JSON.stringify(realtimeServerMessageSchema.parse(payload)));
  }

  private sendError(socket: WebSocket, code: string, message: string): void {
    this.send(
      socket,
      realtimeErrorMessageSchema.parse({
        type: "error",
        code,
        message,
      }),
    );
  }

  private toPeer(session: RealtimeSession): RealtimePeer {
    return {
      deviceId: session.deviceId,
      deviceName: session.deviceName,
      joinedAt: session.joinedAt,
    };
  }

  private getGroup(userId: string, keyEpoch: number): Map<string, RealtimeSession> {
    const key = groupKey(userId, keyEpoch);
    let group = this.groups.get(key);
    if (!group) {
      group = new Map<string, RealtimeSession>();
      this.groups.set(key, group);
    }
    return group;
  }

  private unregister(socket: WebSocket): void {
    const existing = this.sessionsBySocket.get(socket);
    if (!existing) {
      return;
    }

    this.sessionsBySocket.delete(socket);
    const key = groupKey(existing.userId, existing.keyEpoch);
    const group = this.groups.get(key);
    if (!group) {
      return;
    }

    group.delete(existing.deviceId);
    if (group.size === 0) {
      this.groups.delete(key);
      return;
    }

    for (const peer of Array.from(group.values())) {
      this.send(peer.socket, {
        type: "peer.left",
        userId: existing.userId,
        keyEpoch: existing.keyEpoch,
        deviceId: existing.deviceId,
      });
    }
  }

  private handlePresenceRegister(socket: WebSocket, message: Extract<RealtimeClientMessage, { type: "presence.register" }>): void {
    this.unregister(socket);

    const joinedAt = nowIso();
    const session: RealtimeSession = {
      socket,
      userId: message.userId,
      keyEpoch: message.keyEpoch,
      deviceId: message.deviceId,
      deviceName: message.deviceName,
      joinedAt,
    };

    const group = this.getGroup(message.userId, message.keyEpoch);
    const existingPeers = Array.from(group.values());
    group.set(message.deviceId, session);
    this.sessionsBySocket.set(socket, session);

    this.send(socket, {
      type: "presence.snapshot",
      userId: message.userId,
      keyEpoch: message.keyEpoch,
      peers: existingPeers.map((peer) => this.toPeer(peer)),
    });

    for (const peer of existingPeers) {
      this.send(peer.socket, {
        type: "peer.joined",
        userId: message.userId,
        keyEpoch: message.keyEpoch,
        peer: this.toPeer(session),
      });
    }
  }

  private handleSignalForward(socket: WebSocket, message: Extract<RealtimeClientMessage, { type: "signal.forward" }>): void {
    const session = this.sessionsBySocket.get(socket);
    if (!session) {
      this.sendError(socket, "NOT_REGISTERED", "Register presence before forwarding signals.");
      return;
    }

    if (
      session.userId !== message.userId ||
      session.keyEpoch !== message.keyEpoch ||
      session.deviceId !== message.fromDeviceId
    ) {
      this.sendError(socket, "INVALID_SIGNAL_SCOPE", "Signal scope does not match the registered realtime session.");
      return;
    }

    const group = this.groups.get(groupKey(message.userId, message.keyEpoch));
    const target = group?.get(message.toDeviceId);
    if (!target) {
      this.sendError(socket, "PEER_OFFLINE", "The target device is not currently online for direct sync.");
      return;
    }

    this.send(target.socket, {
      type: "signal.deliver",
      userId: message.userId,
      keyEpoch: message.keyEpoch,
      fromDeviceId: message.fromDeviceId,
      toDeviceId: message.toDeviceId,
      payload: message.payload,
    });
  }

  private handleClientMessage(socket: WebSocket, message: RealtimeClientMessage): void {
    switch (message.type) {
      case "presence.register":
        this.handlePresenceRegister(socket, message);
        return;
      case "presence.leave":
        this.unregister(socket);
        return;
      case "signal.forward":
        this.handleSignalForward(socket, message);
        return;
      case "ping":
        this.send(
          socket,
          realtimePongMessageSchema.parse({
            type: "pong",
            sentAt: message.sentAt,
          }),
        );
        return;
    }
  }

  handleConnection(socket: WebSocket): void {
    socket.on("message", (raw) => {
      try {
        const text = typeof raw === "string" ? raw : raw.toString("utf8");
        const message = realtimeClientMessageSchema.parse(JSON.parse(text));
        this.handleClientMessage(socket, message);
      } catch (error) {
        this.sendError(
          socket,
          "INVALID_REALTIME_MESSAGE",
          error instanceof Error ? error.message : "Invalid realtime payload.",
        );
      }
    });

    socket.on("close", () => {
      this.unregister(socket);
    });

    socket.on("error", () => {
      this.unregister(socket);
    });
  }

  notifyRelayHint(userId: string, keyEpoch: number, fromDeviceId?: string): void {
    const group = this.groups.get(groupKey(userId, keyEpoch));
    if (!group) {
      return;
    }

    const createdAt = nowIso();
    for (const peer of Array.from(group.values())) {
      if (fromDeviceId && peer.deviceId === fromDeviceId) {
        continue;
      }

      this.send(peer.socket, {
        type: "relay.hint",
        userId,
        keyEpoch,
        fromDeviceId,
        createdAt,
      });
    }
  }
}

export function attachRealtimeServer(
  server: HttpServer,
  hub: RealtimeHub,
  options?: { pathname?: string },
): WebSocketServer {
  const pathname = options?.pathname ?? "/api/v1/realtime";
  const webSocketServer = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request: IncomingMessage, socket, head) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== pathname) {
      socket.destroy();
      return;
    }

    webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
      hub.handleConnection(webSocket);
    });
  });

  return webSocketServer;
}
