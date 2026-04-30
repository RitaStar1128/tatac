# TATAC Sync Architecture

## Scope

This document defines the next stable architecture for TATAC sync after the first QR-pairing MVP.

It has two goals:

- preserve the local-first model already implemented
- close the design holes discovered in group switching, key rotation, pairing reachability, LAN URL selection, node retention, and live LAN sync

This document is normative for the next sync revision. Where current implementation differs, the behavior described here should be treated as the target.

## Core Principles

- Local-first: each device keeps the source of truth in its local IndexedDB.
- Untrusted relay node: the sync node stores opaque encrypted envelopes and pairing session metadata only.
- LAN direct by opt-in: `LAN Sync` keeps a live WebRTC mesh only while the app is visible.
- Relay fallback: the sync node remains the durable mailbox and fallback path when direct delivery is unavailable.
- PC-led onboarding: a PC enables sync, then phones join via one-time QR pairing.
- Deterministic note policy: note-level LWW with tombstones; delete wins over update.
- Group isolation: notes, oplog, cursors, and sync transport must all be scoped consistently to the same sync group and key epoch.

## System Model

### 1. PWA Client

Responsibilities:

- store notes, oplog, sync config, sync secrets, and pull cursors locally
- materialize `NoteRecord` state from `NoteOp`
- derive sync keys client-side
- encrypt and decrypt sync envelopes
- derive a separate signaling key client-side
- maintain WebRTC peer connections while the app is visible
- create and consume one-time QR pairing sessions
- export and import `.tatacsync` bundles

Non-responsibilities:

- no plaintext sharing with the node
- no implicit migration when switching groups or keys

### 2. Sync Node

Responsibilities:

- register devices
- return bootstrap metadata for reachable LAN URLs
- store opaque envelopes partitioned by `groupId + keyEpoch`
- store one-time pairing sessions with TTL and consume state
- route encrypted WebRTC signaling and realtime presence
- expose health and pairing endpoints

Non-responsibilities:

- no plaintext note access
- no note merge logic
- no authoritative note state

### 3. Manual Sync File

`.tatacsync` remains the degraded-network fallback.

- export writes encrypted envelopes plus sync metadata
- import decrypts locally and applies the same dedupe/conflict rules as node pull
- the file format must be scoped to `groupId + keyEpoch`

## Realtime Transport

When `LAN Sync` is enabled and the app is visible:

- the client connects to `/api/v1/realtime`
- the node tracks visible peers by `groupId + keyEpoch`
- peers build a full WebRTC mesh
- encrypted note envelopes are broadcast over a reliable ordered data channel
- the same envelopes are still pushed to the relay node for durability

When the app becomes hidden:

- signaling and peer connections are closed
- live direct sync stops
- relay catch-up remains available

## Revised Domain Model

### Group and Key Concepts

The original MVP overloaded `userId` as both user-facing identity and sync grouping key. That is no longer sufficient.

This revision uses:

- `groupId`: stable logical sync group identifier
- `keyEpoch`: monotonic identifier for the active cryptographic epoch inside a group
- `deviceId`: concrete client installation identifier

Rules:

- `groupId` changes only when joining or creating a different sync group
- `keyEpoch` changes when `passphrase` or `salt` changes
- envelopes, cursors, export/import bundles, and node buckets must all be scoped to the same `groupId + keyEpoch`

### NoteRecord

Canonical materialized note state stored in IndexedDB.

- `id`
- `groupId`
- `title`
- `body`
- `createdAt`
- `updatedAt`
- `deletedAt | null`
- `version`
- `lastOpId`

`NoteRecord` must be scoped to a sync group so the UI never mixes notes from different groups.

### NoteOp

Append-only operation record stored locally and exchanged through encrypted envelopes.

- `opId`
- `deviceId`
- `groupId`
- `keyEpoch`
- `noteId`
- `baseVersion`
- `logicalTime`
- `wallClock`
- `payload`

Payload variants:

- `note.create`
- `note.update`
- `note.delete`

### EncryptedEnvelope

Opaque transport unit stored by the node and exported into `.tatacsync`.

- `envelopeVersion`
- `senderDeviceId`
- `recipientGroupId`
- `keyEpoch`
- `contentHash`
- `nonce`
- `cipherText`
- `aad`
- `createdAt`

The encrypted body contains a serialized `NoteOp`. `contentHash` exists to support node-side dedupe without plaintext access.

## IndexedDB Layout

The client schema must support group and epoch isolation.

- `notes`: materialized note state, indexed by `groupId`
- `noteOps`: append-only operation log, indexed by `groupId`, `keyEpoch`, and device logical time
- `syncConfig`: active group selection, node URL, and device metadata
- `syncSecrets`: persisted sync secret for the active group
- `syncCursors`: pull cursor state per `groupId + keyEpoch + syncNodeUrl`

Notes:

- persisted sync secrets remain a UX-over-security tradeoff and are not equivalent to secure enclave storage
- local UI queries must always read notes from the active `groupId`

## Onboarding and Join Rules

### Create Group on PC

The default onboarding remains:

1. user opens Sync on a PC
2. app tries `http://127.0.0.1:4010`
3. if bootstrap succeeds, the app creates or reuses a local `groupId`
4. the app creates a local sync secret and stores it on the PC
5. the app stores the selected sync node URL for the group

### Join Group on Another Device

Joining an existing group is allowed only when the target device is empty for sync purposes.

Join precondition:

- no existing local notes for any other group, or
- the user explicitly chooses a destructive migration path

If the device already contains notes or oplog entries from another group, the app must not silently overwrite `groupId` or `salt`.

Allowed outcomes:

- `join`: only for empty devices
- `reset and join`: destructive local reset, then join
- `export then join`: user exports local data first, then resets and joins
- `cancel`

Silent group rebinding is forbidden.

## Conflict and Projection Rules

The conflict policy remains note-level LWW with delete priority, but projection rules are tightened.

Tie-break order:

1. `deletedAt` / `updatedAt`
2. `logicalTime`
3. `opId`

Rules:

- duplicate `opId` is ignored
- duplicate create on an already-materialized note is ignored
- delete beats update when they conflict
- tombstones remain materialized in this revision
- update without an existing base note is rejected
- delete without an existing base note is rejected

This removes the earlier implicit behavior where remote update/delete could synthesize a note without a corresponding create.

## Key Rotation Rules

Changing `passphrase` or `salt` is treated as a key rotation, not as an in-place edit of the current group.

Rules:

- key rotation creates a new `keyEpoch`
- node streams are isolated by `groupId + keyEpoch`
- pull cursors are isolated by `groupId + keyEpoch`
- export/import files are isolated by `groupId + keyEpoch`
- the client must not attempt to decrypt older-epoch envelopes with the new secret

This avoids the current failure mode where old ciphertext remains in the same node bucket and breaks future pulls.

## Pairing and Reachability Rules

### Pairing URL Origin

The pairing page must prefer the current app origin.

Order:

1. current app origin
2. explicitly configured public app origin
3. public hosted fallback

The architecture must not require internet access when the app and sync node are both reachable on the same LAN.

### LAN Candidate Selection

Bootstrap returns a list of candidate LAN URLs. The client must not blindly trust the first item.

Rules:

- the PC UI must show candidate node URLs
- the user can choose which URL to embed into the pairing QR
- the chosen URL is stored as the active sync node URL for the group

This is required for multi-NIC, VPN, Docker, and virtual adapter environments.

## Node Retention and Dedupe

The node remains an opaque relay, but it still needs bounded storage behavior.

### Pairing Sessions

- stored with TTL
- one-time consume
- expired sessions are cleanup candidates even if never consumed

### Envelopes

- envelopes are partitioned by `groupId + keyEpoch`
- node may dedupe by `contentHash`
- retention must be bounded

Minimum retention policy for this revision:

- track per-device pull/ack watermark, or
- keep only a bounded trailing window after all known devices have advanced past it

Unbounded append-only storage is not acceptable beyond the first prototype.

## Security Notes

- plaintext notes remain client-only
- persisted sync secrets are allowed for UX but are not strong secure storage
- pairing keys remain one-time, short-lived, and fragment-scoped in the QR URL
- the node sees device metadata, group identifiers, timestamps, and ciphertext metadata, but not plaintext notes
- PBKDF2 remains acceptable for portability in this revision; Argon2id can still be evaluated later

## Required Implementation Themes

This architecture implies five implementation themes:

1. enforce safe group-join rules and group-scoped notes
2. introduce `keyEpoch` across contracts, storage, and transport
3. make pairing origin LAN-safe and deployment-safe
4. expose and select LAN candidate URLs explicitly
5. add node-side retention and dedupe behavior

The issue-level breakdown for these themes lives in `docs/sync-redesign-issues.md`.
