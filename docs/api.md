# TATAC Sync API

## Scope

This document defines the relay-only sync contract for:

- bootstrap
- device registration
- encrypted push/pull
- health
- QR pairing sessions
- `.tatacsync` fallback

The sync node stores opaque ciphertext only.

## Common Rules

- `userId` is the sync-group identifier in the current API.
- `keyEpoch` is the active cryptographic epoch inside that group.
- `deviceId` identifies one installed client.
- request and response bodies are JSON.
- timestamps are ISO-8601 UTC strings.

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

- `cipherText` is AES-GCM encrypted `NoteOp`
- `aad` is authenticated metadata
- `contentHash` is used for node-side dedupe

## GET /api/v1/bootstrap

Returns the node URLs used for QR-based onboarding.

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
  "defaultCandidateUrl": "http://192.168.0.10:4010"
}
```

## POST /api/v1/register-device

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

## POST /api/v1/pull

Returns envelopes newer than the caller cursor.

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

## `.tatacsync` File

Manual fallback remains scoped to `userId + keyEpoch`.

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

- reject wrong `fileType` or `version`
- reject mismatched `userId`
- reject mismatched `keyEpoch`
- reject mismatched `salt`
- decrypt locally and dedupe by `opId`

## Node Retention

- pairing sessions are cleaned up after expiry
- duplicate envelopes are suppressed by `contentHash`
- envelope streams are retained per epoch and pruned after active devices advance beyond the retention window
