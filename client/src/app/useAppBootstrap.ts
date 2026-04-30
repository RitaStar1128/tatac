import { useEffect, useState } from "react";

import { ensureOfflineStoreReady } from "@/domains/notes/noteRepository";

interface BootstrapState {
  ready: boolean;
  error: Error | null;
}

export function useAppBootstrap(): BootstrapState {
  const [state, setState] = useState<BootstrapState>({
    ready: false,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    void ensureOfflineStoreReady()
      .then(() => {
        if (cancelled) return;
        setState({ ready: true, error: null });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          ready: false,
          error: error instanceof Error ? error : new Error("Failed to bootstrap offline store."),
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
