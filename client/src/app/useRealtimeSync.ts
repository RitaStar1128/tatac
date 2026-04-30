import { useEffect } from "react";

import { syncCoordinator } from "@/domains/sync/syncCoordinator";

export function useRealtimeSync(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) {
      syncCoordinator.stop();
      return;
    }

    syncCoordinator.start();
    return () => {
      syncCoordinator.stop();
    };
  }, [enabled]);
}
