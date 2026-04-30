import { syncSessionSecretSchema, type SyncSessionSecret } from "@shared/contracts";

const SESSION_STORAGE_KEY = "tatac_sync_session_secret";

function hasSessionStorage(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

export function getSyncSessionSecret(): SyncSessionSecret | null {
  if (!hasSessionStorage()) return null;

  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    return syncSessionSecretSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

// TODO: Revisit whether sessionStorage is sufficient once secure platform storage is introduced.
export function setSyncSessionSecret(secret: SyncSessionSecret): void {
  if (!hasSessionStorage()) return;
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(syncSessionSecretSchema.parse(secret)));
}

export function clearSyncSessionSecret(): void {
  if (!hasSessionStorage()) return;
  window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
}
