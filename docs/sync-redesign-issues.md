# TATAC Sync Redesign Issues

This document breaks the current sync redesign work into issue-sized implementation tickets.

Ordering matters. Tickets are grouped by theme and include dependencies so they can be scheduled cleanly.

## Theme A: Safe Group Join and Group-Scoped Notes

### SYNC-01 Enforce Empty-Device Join Policy

Problem:

- the current QR join flow can overwrite local sync identity on a device that already has notes

Scope:

- detect whether the device already has notes or oplog entries belonging to another group
- block silent group join when local data exists
- expose join outcomes: `join`, `reset and join`, `export then join`, `cancel`

Acceptance criteria:

- QR join succeeds on empty devices
- QR join is blocked on non-empty devices unless the user explicitly resets
- no hidden `groupId` overwrite happens

Likely files:

- `client/src/domains/sync/syncPairing.ts`
- `client/src/pages/SyncSettings.tsx`
- `client/src/pages/SyncPair.tsx`
- `client/src/domains/notes/noteRepository.ts`

Depends on:

- none

### SYNC-02 Add Group Scope to Materialized Notes

Problem:

- the UI currently renders notes without group isolation

Scope:

- add `groupId` to `NoteRecord`
- add group index support in Dexie
- update note queries to return only notes from the active group

Acceptance criteria:

- history and edit screens only show notes from the active group
- switching groups does not cross-contaminate note lists

Likely files:

- `shared/contracts/domain.ts`
- `client/src/db/tatacDb.ts`
- `client/src/domains/notes/noteRepository.ts`
- `client/src/pages/History.tsx`
- `client/src/pages/Edit.tsx`

Depends on:

- SYNC-01

### SYNC-03 Reject Orphan Remote Update/Delete

Problem:

- remote `update` or `delete` can currently synthesize a note without a corresponding create

Scope:

- remove implicit placeholder projection for update/delete when `currentRecord` is missing
- add explicit resolver outcomes for invalid inbound operations

Acceptance criteria:

- inbound update without base note is rejected
- inbound delete without base note is rejected
- existing create/update/delete sync still passes

Likely files:

- `client/src/domains/notes/noteProjection.ts`
- `client/src/domains/sync/conflictResolver.ts`
- `client/src/domains/notes/noteRepository.ts`
- tests under `client/src/domains/sync/*.test.ts`

Depends on:

- SYNC-02

## Theme B: Key Epoch Architecture

### SYNC-04 Introduce `keyEpoch` in Shared Contracts

Problem:

- passphrase/salt changes are not isolated from earlier ciphertext

Scope:

- add `keyEpoch` to `NoteOp`, `EncryptedEnvelope`, `.tatacsync`, and related schemas
- document epoch semantics in API and architecture docs

Acceptance criteria:

- shared contracts compile with `keyEpoch`
- existing sync tests are updated to include epoch fields

Likely files:

- `shared/contracts/domain.ts`
- `shared/contracts/api.ts`
- `docs/architecture.md`
- `docs/api.md`

Depends on:

- none

### SYNC-05 Namespace Node Streams by `groupId + keyEpoch`

Problem:

- node stores all envelopes in a single group bucket, so key rotation breaks pull

Scope:

- change node storage from `groupId -> items` to `groupId -> keyEpoch -> items`
- update push/pull/register logic accordingly

Acceptance criteria:

- envelopes from different epochs do not mix
- pulling a new epoch never returns old-epoch envelopes

Likely files:

- `sync-node/src/types/store.ts`
- `sync-node/src/services/fileStore.ts`
- `sync-node/src/routes/api.ts`
- node tests

Depends on:

- SYNC-04

### SYNC-06 Namespace Client Cursors and Export/Import by Epoch

Problem:

- local cursors and manual sync files do not distinguish key epochs

Scope:

- add `keyEpoch` to `syncCursors`
- scope export/import metadata by `groupId + keyEpoch`
- ensure `syncEngine` only uses current epoch

Acceptance criteria:

- cursor state is independent per epoch
- manual import/export does not mix epochs
- rotating keys does not poison subsequent pulls

Likely files:

- `client/src/db/tatacDb.ts`
- `client/src/domains/sync/syncEngine.ts`
- `client/src/domains/sync/syncCursorStore.ts`
- `client/src/pages/ManualSync.tsx`

Depends on:

- SYNC-04
- SYNC-05

### SYNC-07 Add Explicit Key Rotation Flow

Problem:

- changing passphrase or salt is currently treated like a plain settings edit

Scope:

- define `rotate key` as an explicit action
- increment `keyEpoch`
- preserve previous epoch state without auto-merging

Acceptance criteria:

- passphrase/salt change is not saved silently
- the UI clearly indicates a new epoch will start
- post-rotation sync works on the new epoch only

Likely files:

- `client/src/pages/SyncSettings.tsx`
- `client/src/domains/sync/syncSettingsStore.ts`
- `client/src/domains/sync/syncEngine.ts`

Depends on:

- SYNC-04
- SYNC-06

## Theme C: Pairing Origin and LAN Reachability

### SYNC-08 Prefer Current Origin for Pairing Page

Problem:

- QR pairing currently falls back to a hosted origin too early

Scope:

- make pairing URL generation prefer current app origin
- support explicit override only when necessary

Acceptance criteria:

- LAN-only environments can complete pairing without internet access
- localhost/dev and deployed origins both work

Likely files:

- `client/src/domains/sync/syncPairing.ts`
- `client/src/pages/SyncPair.tsx`
- E2E tests

Depends on:

- none

### SYNC-09 Add Candidate URL Selection to Sync Settings

Problem:

- multi-NIC PCs may expose several LAN IPs, and the first candidate is not always reachable from the phone

Scope:

- surface `candidateUrls[]` in the Sync UI
- allow the user to choose which URL is embedded in the QR
- persist the selected URL

Acceptance criteria:

- user can select among multiple LAN candidates
- selected candidate is used for pairing and later sync

Likely files:

- `client/src/pages/SyncSettings.tsx`
- `client/src/domains/sync/syncPairing.ts`
- `client/src/domains/sync/syncTransport.ts`

Depends on:

- SYNC-08

### SYNC-10 Extend Bootstrap Metadata for Candidate Display

Problem:

- raw URL strings are not enough to explain interface choice in complex LAN setups

Scope:

- enrich bootstrap metadata with interface labels or candidate descriptors
- document how loopback, wildcard, and explicit host bindings map to candidates

Acceptance criteria:

- bootstrap response is sufficient for UI labeling
- tests cover loopback and wildcard node bindings

Likely files:

- `shared/contracts/api.ts`
- `sync-node/src/index.ts`
- `sync-node/src/routes/api.ts`
- node tests

Depends on:

- SYNC-09

## Theme D: Node Dedupe and Retention

### SYNC-11 Add Envelope Dedupe Metadata

Problem:

- node appends every envelope and cannot suppress retransmission growth

Scope:

- add `contentHash` or equivalent envelope metadata
- compute it client-side without exposing plaintext
- use it for node-side duplicate suppression

Acceptance criteria:

- repeated push of the same envelope does not create duplicate stored items
- client behavior remains idempotent

Likely files:

- `shared/contracts/domain.ts`
- `client/src/domains/sync/syncCrypto.ts`
- `client/src/domains/sync/syncEngine.ts`
- `sync-node/src/services/fileStore.ts`

Depends on:

- SYNC-04

### SYNC-12 Add Pairing Session Cleanup Policy

Problem:

- expired pairing sessions should not remain indefinitely

Scope:

- cleanup expired sessions regardless of consume state
- keep `already used` reporting behavior for valid short-term reuse attempts

Acceptance criteria:

- expired sessions are removed by store maintenance
- recently consumed sessions still report `already used` until cleanup boundary

Likely files:

- `sync-node/src/services/fileStore.ts`
- node tests

Depends on:

- none

### SYNC-13 Add Envelope Retention Policy

Problem:

- unbounded append-only storage is not acceptable for longer-lived use

Scope:

- choose one bounded retention strategy:
  - per-device ack watermark, or
  - bounded trailing window after all known devices have advanced
- implement pruning rules in node storage

Acceptance criteria:

- node storage remains bounded over time
- active devices can still catch up correctly

Likely files:

- `sync-node/src/types/store.ts`
- `sync-node/src/services/fileStore.ts`
- `sync-node/src/routes/api.ts`
- client cursor logic if ack watermark is chosen

Depends on:

- SYNC-05
- SYNC-11

## Theme E: Regression and Safety Coverage

### SYNC-14 Add Group-Join Safety Tests

Problem:

- the highest-risk flows are group join on non-empty devices and destructive reset choices

Scope:

- add unit/integration/E2E coverage for blocked join, reset-and-join, and cancel paths

Acceptance criteria:

- tests fail if group join silently overwrites local data

Likely files:

- `playwright/sync.spec.ts`
- sync domain tests

Depends on:

- SYNC-01
- SYNC-02

### SYNC-15 Add Epoch Isolation and Retention Regression Tests

Problem:

- key rotation and node pruning are easy places to regress silently

Scope:

- add tests for mixed epochs, duplicate pushes, and retention pruning

Acceptance criteria:

- new-epoch pull never returns old-epoch ciphertext
- duplicate pushes are suppressed
- pruning does not break a healthy follower

Likely files:

- `client/src/domains/sync/*.test.ts`
- `sync-node/src/routes/api.test.ts`
- `playwright/sync.spec.ts`

Depends on:

- SYNC-05
- SYNC-06
- SYNC-11
- SYNC-13

## Recommended Execution Order

1. `SYNC-01`
2. `SYNC-02`
3. `SYNC-03`
4. `SYNC-04`
5. `SYNC-05`
6. `SYNC-06`
7. `SYNC-07`
8. `SYNC-08`
9. `SYNC-09`
10. `SYNC-10`
11. `SYNC-11`
12. `SYNC-12`
13. `SYNC-13`
14. `SYNC-14`
15. `SYNC-15`

## Suggested Milestone Grouping

### Milestone 1: Group Safety

- `SYNC-01`
- `SYNC-02`
- `SYNC-03`

### Milestone 2: Epoch Isolation

- `SYNC-04`
- `SYNC-05`
- `SYNC-06`
- `SYNC-07`

### Milestone 3: Reachability and Pairing

- `SYNC-08`
- `SYNC-09`
- `SYNC-10`

### Milestone 4: Node Hygiene

- `SYNC-11`
- `SYNC-12`
- `SYNC-13`

### Milestone 5: Regression Coverage

- `SYNC-14`
- `SYNC-15`
