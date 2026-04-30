# TATAC Sync MVP Architecture

## Overview

TATAC sync MVP extends the current offline memo app into a local-first system with:

- PWA client on each device
- a LAN-reachable sync node that only relays encrypted oplog envelopes
- a manual `.tatacsync` export/import fallback for environments where the node is unavailable

The source of truth remains the local database on each device. The sync node is not a source of truth and is not trusted with plaintext memo contents.

## MVP Principles

- Local-first: each device can create, edit, delete, and browse notes fully offline.
- Manual sync first: initial release uses an explicit sync button. No LAN auto-discovery.
- Encrypted transport: oplog payloads are encrypted client-side before push/export.
- Dumb relay node: the node stores and returns opaque envelopes partitioned by `userId`.
- Deterministic conflict policy: note-level LWW with tombstones. Delete wins over update.
- Stable contracts first: shared schemas, IndexedDB schema, and sync resolver API are fixed before UI and server build-out.

## Chosen Technical Direction

- Client: React + TypeScript + Vite + Vite PWA
- Local DB: IndexedDB via Dexie
- Validation: Zod in shared contracts
- Crypto: Web Crypto API
- KDF: PBKDF2-SHA-256 for MVP

PBKDF2 is chosen because it is natively supported by Web Crypto in browsers and Node runtimes without adding a WASM dependency at the MVP stage.

## System Components

### 1. PWA Client

Responsibilities:

- store notes and oplog locally in IndexedDB
- apply note operations locally
- derive sync key from `userId + passphrase + salt`
- encrypt outbound oplog payloads into envelopes
- push envelopes to sync node
- pull envelopes from sync node
- decrypt and apply remote operations through a deterministic conflict resolver
- export/import encrypted `.tatacsync` files

The client is the only place where plaintext notes and decrypted oplog payloads are visible.

### 2. Sync Node

Responsibilities:

- register devices
- accept opaque envelopes on push
- return opaque envelopes by sequence on pull
- expose node health

Non-responsibilities:

- no plaintext note access
- no business-level conflict resolution
- no authoritative note state
- no account system beyond `userId` grouping

### 3. Manual Sync File

`.tatacsync` is an encrypted envelope bundle used for air-gapped or degraded network situations.

- export writes envelopes plus sync metadata
- import decrypts locally and applies dedupe/conflict rules
- file transfer can happen by AirDrop, local share, USB, etc.

## Data Model

### NoteRecord

Canonical materialized note state stored in IndexedDB.

- `id`
- `title`
- `body`
- `createdAt`
- `updatedAt`
- `deletedAt | null`
- `version`
- `lastOpId`

### NoteOp

Append-only logical operation entry stored locally and exchanged indirectly through encrypted envelopes.

- `opId`
- `deviceId`
- `userId`
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

Opaque transport unit stored by the sync node and exported into `.tatacsync`.

- `envelopeVersion`
- `senderDeviceId`
- `recipientUserId`
- `nonce`
- `cipherText`
- `aad`
- `createdAt`

The encrypted body contains a serialized `NoteOp`.

## IndexedDB Layout

The initial Dexie schema uses four logical stores:

- `notes`: materialized note state with tombstones
- `noteOps`: append-only local operation log plus transport metadata
- `syncConfig`: persisted sync configuration for the active group
- `syncCursors`: per-node pull cursor state

This is intentionally minimal. Future tables such as tombstone GC state, attachment metadata, or device presence can be added in later schema versions.

## Sync Flow

### Local write path

1. user action creates a `NoteOp`
2. the client projects the op into a candidate `NoteRecord`
3. the resolver decides whether the candidate wins against current state
4. accepted op is written to `noteOps`
5. winning materialized state is written to `notes`

### Push path

1. collect local ops that have not been acknowledged by the configured node
2. derive sync key from `userId`, `passphrase`, and `salt`
3. encrypt each serialized op into an envelope
4. POST envelopes to `/api/v1/push`
5. mark push metadata locally

### Pull path

1. read the last `afterSeq` cursor for the configured node
2. POST `/api/v1/pull`
3. decrypt each returned envelope locally
4. dedupe by `opId`
5. apply through the same resolver used for local writes
6. advance cursor only after successful local processing

### Export / Import path

- Export reads local ops, encrypts them, and writes a `.tatacsync` file.
- Import validates file metadata, checks `userId`, uses included `salt`, decrypts items locally, dedupes by `opId`, and applies them.

## Conflict Policy

MVP policy is note-level LWW with tombstones and delete priority.

Tie-break order:

1. `deletedAt` / `updatedAt`
2. `logicalTime`
3. `opId`

Rules:

- delete beats update when they conflict
- duplicate `opId` is ignored
- duplicate create on an already-materialized note is ignored
- tombstones remain materialized in MVP

## Security Notes

- Passphrases are not part of the persisted sync config contract. They should remain session-scoped unless a later explicit secure-storage decision is made.
- The sync node sees `userId`, `deviceId`, timestamps, and ciphertext metadata, but not note plaintext.
- MVP uses PBKDF2 for portability. A future hardening pass can evaluate Argon2id via WASM.

## Module Placement For This Stage

This repository currently uses `client/src` and `shared/`. For the foundation phase, sync primitives are introduced without refactoring the existing UI:

- `shared/contracts/*`: shared Zod schemas and TypeScript types
- `client/src/db/*`: Dexie schema and local entities
- `client/src/domains/sync/*`: conflict resolver API and sync-specific pure logic

UI pages, sync-node routes, and integration wiring are intentionally deferred until these contracts are stable.
