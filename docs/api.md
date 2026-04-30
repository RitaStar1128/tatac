# TATAC Sync MVP API

## Scope

This document freezes the MVP wire contract for the LAN sync node and the `.tatacsync` fallback file.

Design assumptions:

- the node is a transport relay, not a source of truth
- payload plaintext is never sent to the node
- all request and response bodies are JSON
- request validation is enforced with Zod-compatible schemas

## Common Rules

- `userId` identifies a sync group.
- `deviceId` identifies a concrete client installation.
- envelope contents are opaque to the node.
- timestamps use ISO-8601 UTC strings.
- the node stores envelopes in monotonically increasing `seq` order per user group.

## Envelope Contract

```json
{
  "envelopeVersion": 1,
  "senderDeviceId": "d_phone_01",
  "recipientUserId": "u_abc123",
  "nonce": "base64...",
  "cipherText": "base64...",
  "aad": "base64...",
  "createdAt": "2026-04-30T10:00:00.000Z"
}
```

Notes:

- `cipherText` is an AES-GCM encrypted serialized `NoteOp`
- `aad` is a serialized authenticated metadata blob encoded as base64
- `recipientUserId` is used by the node for partitioning

## POST /api/v1/register-device

Registers or refreshes a client device for the specified sync group.

Request:

```json
{
  "userId": "u_abc123",
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
  "registeredAt": "2026-04-30T10:00:00.000Z"
}
```

MVP behavior:

- idempotent for the same `userId + deviceId`
- may refresh `deviceName` and `clientVersion`

## POST /api/v1/push

Appends encrypted envelopes to the relay stream for a sync group.

Request:

```json
{
  "userId": "u_abc123",
  "deviceId": "d_phone_01",
  "envelopes": [
    {
      "envelopeVersion": 1,
      "senderDeviceId": "d_phone_01",
      "recipientUserId": "u_abc123",
      "nonce": "base64...",
      "cipherText": "base64...",
      "aad": "base64...",
      "createdAt": "2026-04-30T10:01:00.000Z"
    }
  ]
}
```

Response:

```json
{
  "ok": true,
  "accepted": 1,
  "lastSeq": 128
}
```

MVP behavior:

- the node validates outer envelope shape only
- the node does not decrypt or inspect payload plaintext
- `accepted` is the count stored by the node
- duplicate logical ops may still arrive as separate envelopes; clients must dedupe by `opId` after decrypt

## POST /api/v1/pull

Returns envelopes newer than the caller's cursor.

Request:

```json
{
  "userId": "u_abc123",
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
        "nonce": "base64...",
        "cipherText": "base64...",
        "aad": "base64...",
        "createdAt": "2026-04-30T10:01:00.000Z"
      }
    }
  ],
  "nextAfterSeq": 121,
  "hasMore": false
}
```

MVP behavior:

- `afterSeq` is exclusive
- `limit` is clamped by server-side maximum
- returned items may include envelopes originally sent by the same device
- the client advances its local cursor only after successful decrypt + apply

## GET /api/v1/health

Response:

```json
{
  "ok": true,
  "nodeId": "node_home_pc",
  "serverTime": "2026-04-30T10:02:00.000Z"
}
```

Purpose:

- connectivity check from sync settings/sync screen
- server clock visibility for debugging

## Error Handling

MVP status codes:

- `200`: request accepted
- `400`: schema validation error
- `404`: unknown route
- `413`: payload too large
- `500`: unexpected node failure

Suggested validation error shape:

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request body"
  }
}
```

Suggested server error shape:

```json
{
  "ok": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Unexpected sync node error"
  }
}
```

## `.tatacsync` File

The manual fallback file contains encrypted envelopes plus sync metadata required for key derivation.

```json
{
  "fileType": "tatacsync",
  "version": 1,
  "exportedAt": "2026-04-30T10:10:00.000Z",
  "fromDeviceId": "d_phone_01",
  "userId": "u_abc123",
  "salt": "base64...",
  "items": [
    {
      "envelopeVersion": 1,
      "senderDeviceId": "d_phone_01",
      "recipientUserId": "u_abc123",
      "nonce": "base64...",
      "cipherText": "base64...",
      "aad": "base64...",
      "createdAt": "2026-04-30T10:01:00.000Z"
    }
  ]
}
```

Import rules:

- reject if `fileType` or `version` is unsupported
- reject if `userId` does not match the active sync group unless the user explicitly rebinds settings in a later UI flow
- use file `salt` for key derivation
- decrypt locally and dedupe by `opId`

## Deferred For Later Phases

- automatic LAN discovery
- auth beyond `userId + passphrase`
- CRDT transport or merge semantics
- tombstone garbage collection
- attachment sync
