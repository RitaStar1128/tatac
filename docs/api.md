# TATAC Sync API

## Scope

This document defines the current wire contract for:

- the LAN sync node
- realtime signaling and presence
- QR pairing bootstrap
- the `.tatacsync` fallback file

The sync model is local-first:

- each device keeps the source of truth locally
- the node stores opaque encrypted envelopes only
- the node also routes opaque encrypted WebRTC signaling payloads
- streams are partitioned by `userId + keyEpoch`

## Common Rules

- `userId` is the sync group identifier exposed by the current API.
- `keyEpoch` is the active cryptographic epoch inside that group.
- `deviceId` identifies a concrete client installation.
- request and response bodies are JSON.
- timestamps use ISO-8601 UTC strings.
- envelope ciphertext is opaque to the node.

## Envelope Contract

```json
{
  "envelopeVersion": 1,
  "senderDeviceId": "d_phone_01",
  "recipientUserId": "u_abc123",
  "keyEpoch": 2,
  "contentHash": "base64...",
  "nonce": "base64...",
  "cipherText": "base64...",
  "aad": "base64...",
  "createdAt": "2026-05-01T10:00:00.000Z"
}
```

Notes:

- `cipherText` is AES-GCM encrypted `NoteOp` JSON.
- `aad` is authenticated metadata encoded as base64.
- `contentHash` is a client-computed SHA-256 hash of the canonical plaintext op and is used for node-side dedupe.
- `keyEpoch` is required in both transport metadata and decrypted payloads.

## Bootstrap Candidate Contract

```json
{
  "url": "http://192.168.0.10:4010",
  "label": "Wi-Fi (192.168.0.10)",
  "kind": "lan",
  "address": "192.168.0.10",
  "interfaceName": "Wi-Fi"
}
```

Rules:

- `kind` is one of `loopback`, `lan`, or `explicit`
- the client may display all candidates and choose which one is embedded in the pairing QR
- `defaultCandidateUrl` is only the suggested initial choice

## Bootstrap Realtime Contract

```json
{
  "signalingWebSocketUrl": "ws://192.168.0.10:4010/api/v1/realtime",
  "iceServers": [
    {
      "urls": ["stun:stun.example.net:3478"]
    },
    {
      "urls": ["turn:turn.example.net:3478?transport=udp"],
      "username": "turn-user",
      "credential": "turn-password",
      "credentialType": "password"
    }
  ],
  "expiresAt": "2026-05-01T11:00:00.000Z"
}
```

Notes:

- `signalingWebSocketUrl` is generated from the node origin that served `/bootstrap`
- `iceServers` is the single source of truth for STUN/TURN config
- `expiresAt` is optional and only present for refreshable TURN credentials

## GET /api/v1/bootstrap

Returns bootstrap metadata for PC-led onboarding.

Response:

```json
{
  "ok": true,
  "nodeId": "node_home_pc",
  "serverTime": "2026-05-01T10:00:00.000Z",
  "candidateUrls": [
    "http://127.0.0.1:4010",
    "http://192.168.0.10:4010"
  ],
  "candidates": [
    {
      "url": "http://127.0.0.1:4010",
      "label": "Loopback",
      "kind": "loopback",
      "address": "127.0.0.1"
    },
    {
      "url": "http://192.168.0.10:4010",
      "label": "Wi-Fi (192.168.0.10)",
      "kind": "lan",
      "address": "192.168.0.10",
      "interfaceName": "Wi-Fi"
    }
  ],
  "defaultCandidateUrl": "http://192.168.0.10:4010",
  "realtime": {
    "signalingWebSocketUrl": "ws://127.0.0.1:4010/api/v1/realtime",
    "iceServers": []
  }
}
```

## WebSocket /api/v1/realtime

Used for:

- presence registration
- peer join/leave events
- encrypted SDP/ICE signaling
- relay hints when new envelopes land on the node

Client -> node messages:

- `presence.register`
- `presence.leave`
- `signal.forward`
- `ping`

Node -> client messages:

- `presence.snapshot`
- `peer.joined`
- `peer.left`
- `signal.deliver`
- `relay.hint`
- `pong`
- `error`

All signaling payloads remain opaque to the node. The node only validates the outer message shape and routes by `groupId + keyEpoch + deviceId`.

## POST /api/v1/register-device

Registers or refreshes a device for one sync epoch.

Request:

```json
{
  "userId": "u_abc123",
  "keyEpoch": 2,
  "deviceId": "d_phone_01",
  "deviceName": "Rita iPhone",
  "clientVersion": "0.1.0"
}
```

Response:

```json
{
  "ok": true,
  "nodeId": "node_home_pc",
  "registeredAt": "2026-05-01T10:00:00.000Z"
}
```

## POST /api/v1/push

Pushes encrypted envelopes into the relay stream for one `userId + keyEpoch`.

Request:

```json
{
  "userId": "u_abc123",
  "keyEpoch": 2,
  "deviceId": "d_phone_01",
  "envelopes": [
    {
      "envelopeVersion": 1,
      "senderDeviceId": "d_phone_01",
      "recipientUserId": "u_abc123",
      "keyEpoch": 2,
      "contentHash": "base64...",
      "nonce": "base64...",
      "cipherText": "base64...",
      "aad": "base64...",
      "createdAt": "2026-05-01T10:01:00.000Z"
    }
  ]
}
```

Response:

```json
{
  "ok": true,
  "accepted": 1,
  "acceptedContentHashes": ["base64..."],
  "lastSeq": 128
}
```

Behavior:

- node-side dedupe is keyed by `contentHash`
- repeated push of the same logical op does not append a second envelope
- `acceptedContentHashes` is the authoritative acknowledgment set for the client

## POST /api/v1/pull

Returns envelopes newer than the caller cursor for one epoch.

Request:

```json
{
  "userId": "u_abc123",
  "keyEpoch": 2,
  "deviceId": "d_android_01",
  "afterSeq": 120,
  "limit": 200
}
```

Response:

```json
{
  "ok": true,
  "items": [
    {
      "seq": 121,
      "envelope": {
        "envelopeVersion": 1,
        "senderDeviceId": "d_phone_01",
        "recipientUserId": "u_abc123",
        "keyEpoch": 2,
        "contentHash": "base64...",
        "nonce": "base64...",
        "cipherText": "base64...",
        "aad": "base64...",
        "createdAt": "2026-05-01T10:01:00.000Z"
      }
    }
  ],
  "nextAfterSeq": 121,
  "hasMore": false
}
```

Behavior:

- `afterSeq` is exclusive
- node cursor state is tracked per `deviceId + userId + keyEpoch`
- old epochs are not returned when pulling the current epoch

## GET /api/v1/health

Response:

```json
{
  "ok": true,
  "nodeId": "node_home_pc",
  "serverTime": "2026-05-01T10:02:00.000Z"
}
```

## POST /api/v1/pairing-sessions

Stores an opaque one-time pairing bundle.

Request:

```json
{
  "pairingKeyHash": "base64url...",
  "bundle": {
    "pairingVersion": 1,
    "nonce": "base64...",
    "cipherText": "base64...",
    "aad": "base64...",
    "createdAt": "2026-05-01T10:00:00.000Z",
    "expiresAt": "2026-05-01T10:10:00.000Z"
  }
}
```

Response:

```json
{
  "ok": true,
  "sessionId": "ps_123",
  "expiresAt": "2026-05-01T10:10:00.000Z"
}
```

## POST /api/v1/consume-pairing-session

Consumes a one-time pairing session.

Request:

```json
{
  "sessionId": "ps_123",
  "pairingKey": "base64url..."
}
```

Response:

```json
{
  "ok": true,
  "nodeId": "node_home_pc",
  "serverTime": "2026-05-01T10:02:00.000Z",
  "bundle": {
    "pairingVersion": 1,
    "nonce": "base64...",
    "cipherText": "base64...",
    "aad": "base64...",
    "createdAt": "2026-05-01T10:00:00.000Z",
    "expiresAt": "2026-05-01T10:10:00.000Z"
  }
}
```

Behavior:

- sessions are one-time use
- expired sessions are cleanup candidates
- node stores the bundle but not the plaintext pairing secret

## `.tatacsync` File

Manual fallback is also scoped to `userId + keyEpoch`.

```json
{
  "fileType": "tatacsync",
  "version": 1,
  "exportedAt": "2026-05-01T10:10:00.000Z",
  "fromDeviceId": "d_phone_01",
  "userId": "u_abc123",
  "keyEpoch": 2,
  "salt": "base64...",
  "items": [
    {
      "envelopeVersion": 1,
      "senderDeviceId": "d_phone_01",
      "recipientUserId": "u_abc123",
      "keyEpoch": 2,
      "contentHash": "base64...",
      "nonce": "base64...",
      "cipherText": "base64...",
      "aad": "base64...",
      "createdAt": "2026-05-01T10:01:00.000Z"
    }
  ]
}
```

Import rules:

- reject unsupported `fileType` or `version`
- reject mismatched `userId`
- reject mismatched `keyEpoch`
- reject mismatched `salt`
- decrypt locally and dedupe by `opId`

## Node Retention and Cleanup

- pairing sessions are removed when expired
- duplicate envelopes are suppressed by `contentHash`
- envelope streams are pruned per epoch after active devices advance beyond the retention window

## Error Handling

Current status codes:

- `200`: request accepted
- `400`: validation error
- `404`: unknown route or cleaned-up pairing session
- `409`: expired/already-used pairing session
- `500`: unexpected node failure
