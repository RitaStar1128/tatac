# TATAC Sync Architecture

## Goal

Sync exists to support the real product goal:

- write a memo immediately
- find, edit, copy, and delete it later
- continue the same memo flow on PC and phone

Everything in this document is optimized for that simplicity.

## Core Model

- Source of truth is always each device's local IndexedDB.
- The sync node is not authoritative state. It is an untrusted encrypted relay.
- The normal setup flow is:
  1. PC: `Enable Sync`
  2. phone: `Scan QR`
  3. app auto-syncs on open, resume, and save
- Users do not need to enter `groupId`, `keyEpoch`, `salt`, `passphrase`, or node URLs in the happy path.

## Transport

TATAC now uses one sync path only:

- client encrypts `NoteOp`
- client sends encrypted envelopes to the sync node with `push`
- client reads encrypted envelopes from the sync node with `pull`
- client decrypts and applies them locally

Removed from the architecture:

- WebRTC
- signaling sockets
- peer mesh
- TURN/STUN
- realtime presence
- direct-vs-relay transport modes

This keeps one durable and debuggable path.

## Local Data

The client stores:

- `notes`: materialized `NoteRecord`
- `noteOps`: append-only oplog
- `syncConfig`: active group/device/node metadata
- `syncSecrets`: persisted group secret for the active sync group
- `syncCursors`: pull cursor per `userId + keyEpoch + syncNodeUrl`

Rules:

- local DB remains usable without the node
- UI reads notes only from the active sync group
- deletes are tombstones
- note conflicts remain note-level LWW with delete priority

## Sync Group and Safety

- `userId` is the sync-group identifier in the current wire contract
- `keyEpoch` separates cryptographic epochs inside that group
- QR join is blocked on non-empty foreign devices unless the user explicitly resets local data
- update/delete without an existing note stays rejected

This preserves group isolation and prevents silent local data loss.

## Automatic Sync Behavior

Auto-sync runs only at these times:

- app startup
- app foreground resume
- shortly after a local save generates a new oplog entry

Rules:

- memo save never waits for sync
- local save succeeds first
- sync happens in the background
- if sync fails, the note stays local and the UI shows a simple error state
- manual `Sync now` remains available as retry/catch-up

## Node Responsibilities

The sync node does only this:

- register devices
- expose bootstrap metadata
- store encrypted envelopes per `userId + keyEpoch`
- return envelopes by cursor
- store and consume one-time QR pairing sessions
- expose health

The node does not:

- read plaintext notes
- merge notes
- maintain authoritative note state

## QR Pairing

Pairing stays PC-led:

1. PC enables sync
2. PC generates group secret if needed
3. PC creates a short-lived one-time pairing session
4. phone opens `/sync-pair`
5. phone consumes the session, stores settings locally, and performs initial sync

The pairing URL prefers the current app origin so LAN-only environments still work.

## Recovery

Recovery exists, but it is not part of the normal flow.

- `.tatacsync` remains as the last-resort fallback
- manual node URL entry is hidden behind failure-only recovery UI
- cryptographic maintenance such as key rotation may remain internal, but is not exposed in the standard product flow

## UX Contract

Normal users should only need to understand:

- `Sync is off`
- `Sync is on`
- `Last synced`
- `Add phone`
- `Sync now`
- `Could not sync`

Any deeper concepts are implementation details and should stay out of the main UI.
