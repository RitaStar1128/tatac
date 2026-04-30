export type RealtimeTransportStatus =
  | "disconnected"
  | "relay-only"
  | "direct"
  | "turn";

export interface RealtimeSyncState {
  lanSyncEnabled: boolean;
  signalingConnected: boolean;
  connectedPeerCount: number;
  transportStatus: RealtimeTransportStatus;
  lastError: string | null;
  lastUpdatedAt: string | null;
}

const listeners = new Set<(state: RealtimeSyncState) => void>();

let state: RealtimeSyncState = {
  lanSyncEnabled: false,
  signalingConnected: false,
  connectedPeerCount: 0,
  transportStatus: "disconnected",
  lastError: null,
  lastUpdatedAt: null,
};

function emit(): void {
  for (const listener of Array.from(listeners)) {
    listener(state);
  }
}

export function getRealtimeSyncState(): RealtimeSyncState {
  return state;
}

export function setRealtimeSyncState(
  next:
    | RealtimeSyncState
    | ((current: RealtimeSyncState) => RealtimeSyncState),
): void {
  state =
    typeof next === "function"
      ? next(state)
      : next;
  emit();
}

export function subscribeToRealtimeSyncState(
  listener: (state: RealtimeSyncState) => void,
): () => void {
  listeners.add(listener);
  listener(state);
  return () => {
    listeners.delete(listener);
  };
}
