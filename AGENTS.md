# AGENTS.md

## Project Overview

tatac — a local-first PWA memo app for instant thought capture with LAN sync.

- **Live**: https://tatac.vercel.app/
- **Stack**: React 19 + TypeScript + Vite 7 + Tailwind CSS 4 + Dexie (IndexedDB)
- **Package Manager**: pnpm (v10, lockfile committed)
- **Node**: 20+
- **License**: MIT

## Architecture

```
client/          → PWA frontend (React SPA)
  src/
    app/         → bootstrap, auto-sync hook
    components/  → UI components (shadcn/ui style, Radix primitives)
    contexts/    → Theme, Language providers
    db/          → Dexie IndexedDB schema (tatacDb)
    domains/
      device/    → device identity
      notes/     → note CRUD, projection, repository
      sync/      → encryption, pairing, transport, scheduler, engine
    hooks/       → custom hooks
    lib/         → utilities
    pages/       → route pages (Home, History, Edit, SyncSettings, etc.)
server/          → Express static server (production)
sync-node/       → Local Express relay server for LAN sync
  src/
    index.ts     → entry point + status page
    routes/      → REST API (push/pull/register/bootstrap)
    services/    → file-based JSON store
    realtime/    → WebSocket notifications
    types/       → shared types
  platform/      → OS autostart scripts (windows/macos/linux)
shared/          → shared constants
docs/            → architecture docs, API spec, roadmap issues
scripts/         → utility scripts
```

## Key Design Principles

1. **Local-first**: All data lives in browser IndexedDB. No cloud dependency.
2. **Zero-knowledge sync**: AES-GCM encryption with PBKDF2 (310k iterations). Server never sees plaintext.
3. **PWA constraints respected**: No mDNS, no raw sockets, no inbound connections from browser.
4. **sync-node as local relay**: User runs a local Express server on their PC; phone syncs via LAN.
5. **Bilingual**: All UI strings have ja/en variants.

## Commands

| Command | Purpose |
|---------|---------|
| `pnpm install` | Install dependencies |
| `pnpm dev` | Dev server (Vite, `--host` for LAN access) |
| `pnpm build` | Build client + server |
| `pnpm build:sync-node` | Bundle sync-node with esbuild |
| `pnpm build:sync-node:pkg` | Single-binary build (win/mac/linux) |
| `pnpm dev:sync-node` | Run sync-node in dev mode (tsx) |
| `pnpm start` | Production server (port 3000) |
| `pnpm start:sync-node` | Production sync-node (port 4010) |
| `pnpm check` | TypeScript type checking (`tsc --noEmit`) |
| `pnpm format` | Prettier formatting |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm test:e2e` | E2E tests (Playwright) |

## Development Workflow

1. Run `pnpm check` after any TypeScript change — zero errors required.
2. Run `pnpm test` to verify unit tests pass (currently 24 tests across 6 files).
3. Tests live adjacent to source: `*.test.ts` next to their module.
4. Path aliases: `@/` → `client/src/`, `@shared/` → `shared/`.
5. No ESLint configured — Prettier only for formatting.

## Sync System Overview

### Pairing Flow
1. sync-node exposes `/api/bootstrap` with candidate URLs (all network interfaces)
2. PWA generates QR code containing pairing URL (one-time session, 10-min TTL)
3. Second device scans QR → exchanges keys via pairingKey in URL fragment
4. Both devices derive shared AES key via PBKDF2

### Sync Protocol
- **Push**: Client encrypts ops → POST to sync-node
- **Pull**: Client requests ops since cursor → decrypts locally
- **Conflict resolution**: delete-wins → timestamp → logical time → opID
- **Key epochs**: Rotation creates new namespace; cursors are epoch-scoped

### Reliability
- HTTP timeout: 8s (sync), 5s (health check)
- Retry: max 3 attempts, exponential backoff 3s → 12s (±20% jitter)
- Health polling: every 30s when in error state, auto-recovers on success

## Conventions

- Language: TypeScript strict mode everywhere
- UI: Tailwind CSS 4 utility classes, shadcn/ui component patterns
- State: Zustand-style stores in `domains/` (no Redux)
- Routing: wouter (lightweight)
- Animations: Framer Motion
- Dialogs: Radix Dialog
- Toasts: Sonner
- DB: Dexie wrapping IndexedDB
- Testing: Vitest for unit, Playwright for E2E
- Commit messages: English, imperative mood

## File Naming

- Components: PascalCase (`SyncSettings.tsx`)
- Modules: camelCase (`syncTransport.ts`)
- Tests: `<module>.test.ts` co-located
- Types: inline or in `types/` directory

## Implementation Gate

Do not proceed with the implementation until the user has a complete understanding.
Before implementation, be sure to ask questions using the tool to test the user's level of understanding.

## Important Implementation Details

- `tatacDb.ts` defines the Dexie schema — migrations need version bumps
- Sync stores use draft pattern: read config → mutate draft → save
- `syncScheduler.ts` manages the sync loop lifecycle (idle → syncing → retrying → error)
- `syncEngine.ts` handles push/pull orchestration with cursor tracking
- sync-node stores data as JSON file (not a database)
- Platform scripts in `sync-node/platform/` are for end-user distribution, not development
